# Operational Transform (OT) Implementation

## Technical Documentation

This document provides comprehensive low-level technical documentation for the real-time collaborative editing implementation in yPad. The system enables multiple users to simultaneously edit the same document with automatic conflict resolution and guaranteed convergence.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Algorithms](#core-algorithms)
4. [Server Implementation](#server-implementation)
5. [Client Implementation](#client-implementation)
6. [Message Protocol](#message-protocol)
7. [Challenges and Solutions](#challenges-and-solutions)
8. [Testing Strategy](#testing-strategy)
9. [Inspiration and Deviations](#inspiration-and-deviations)

---

## Overview

### What is Operational Transform?

Operational Transform (OT) is a technique for maintaining consistency in collaborative editing systems. When multiple users edit a document simultaneously, their operations may conflict. OT resolves these conflicts by transforming operations so they can be applied in any order while producing the same final result.

### The OT Invariant

The fundamental guarantee of OT is expressed mathematically as:

```
apply(apply(doc, op1), transform(op1, op2)[1]) = apply(apply(doc, op2), transform(op1, op2)[0])
```

This means: if two operations `op1` and `op2` are created concurrently (at the same document version), applying either one first and then the transformed version of the other produces identical documents.

### Key Design Decisions

1. **Server-Authoritative**: The server maintains canonical document state
2. **Optimistic Updates**: Clients apply operations locally before server confirmation
3. **Dual Tracking**: Separate version (persistent) and sequence (transient) numbering
4. **Checksum Verification**: Content checksums detect state drift
5. **Replay Recovery**: Server can replay operations to recover divergent clients

---

## Architecture

### Dual Tracking System

The implementation uses two separate numbering systems:

#### Operation Version (Persistent)
- Incremented with each operation applied to the document
- Persisted to database
- Survives Durable Object hibernation and reconnections
- Used for OT conflict resolution (baseVersion comparison)
- Enables conflict detection for offline scenarios

#### Global Sequence Number (Transient)
- Incremented for EVERY broadcast (operations, cursors, presence)
- NOT persisted (resets on Durable Object restart)
- Ensures real-time message ordering during active WebSocket sessions
- Prevents race conditions with 3+ concurrent users
- Clients resync on reconnect (receive fresh sequence in sync message)

**Why both?** Operations need persistent version for database-level conflict resolution. WebSocket clients need sequence numbers for real-time message ordering. E2E encrypted notes use ONLY version tracking (no WebSocket collaboration to preserve encryption).

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │OperationGenerator│───▶│WebSocketClient  │◀──▶│ Editor UI   │ │
│  │  (fast-diff)     │    │(sequence track) │    │ (Svelte)    │ │
│  └─────────────────┘    └────────┬────────┘    └─────────────┘ │
│                                  │                               │
│  ┌─────────────────┐    ┌────────▼────────┐                     │
│  │useWebSocket     │◀───│ Transform       │                     │
│  │Connection.svelte│    │ (OT logic)      │                     │
│  └─────────────────┘    └─────────────────┘                     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              NoteSessionDurableObject                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ Message     │  │ Transform   │  │ Operation       │  │   │
│  │  │ Queue       │  │ Engine      │  │ History         │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ Session     │  │ Rate        │  │ Persistence     │  │   │
│  │  │ Management  │  │ Limiting    │  │ (debounced)     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Algorithms

### Operation Types

```typescript
type InsertOperation = {
  type: 'insert';
  position: number;    // Character index
  text: string;        // Text to insert
  clientId: string;    // Originating client
  version: number;     // Server-assigned version
};

type DeleteOperation = {
  type: 'delete';
  position: number;    // Start index
  length: number;      // Characters to delete
  clientId: string;
  version: number;
};

type Operation = InsertOperation | DeleteOperation;
```

### Transform Function

The `transform(op1, op2)` function takes two concurrent operations and returns transformed versions `[op1', op2']` that maintain the OT invariant.

#### Insert vs Insert

```typescript
function transformInsertInsert(op1: Insert, op2: Insert): [Insert, Insert] {
  if (op1.position < op2.position) {
    // op1 is earlier - shift op2 forward
    return [op1, { ...op2, position: op2.position + op1.text.length }];
  } else if (op1.position > op2.position) {
    // op2 is earlier - shift op1 forward
    return [{ ...op1, position: op1.position + op2.text.length }, op2];
  } else {
    // Same position - use clientId for deterministic tie-breaking
    if (op1.clientId < op2.clientId) {
      return [op1, { ...op2, position: op2.position + op1.text.length }];
    } else {
      return [{ ...op1, position: op1.position + op2.text.length }, op2];
    }
  }
}
```

**Why clientId?** When two users type at exactly the same position simultaneously, we need deterministic ordering. Using clientId (UUID) ensures all clients agree on which character comes first, regardless of network timing.

#### Insert vs Delete

Three scenarios must be handled:

1. **Insert before delete**: Insert happens before deleted range - shift delete forward
2. **Insert after delete**: Insert happens after deleted range - shift insert backward
3. **Insert inside delete**: Insert happens within deleted range - insert "survives" at delete start

```typescript
function transformInsertDelete(insert: Insert, del: Delete): [Insert, Delete] {
  const deleteEnd = del.position + del.length;

  if (insert.position <= del.position) {
    // Insert before delete - shift delete forward
    return [insert, { ...del, position: del.position + insert.text.length }];
  } else if (insert.position >= deleteEnd) {
    // Insert after delete - shift insert backward
    return [{ ...insert, position: insert.position - del.length }, del];
  } else {
    // Insert inside deleted range - insert survives at delete start
    // Delete must account for the inserted text
    return [
      { ...insert, position: del.position },
      { ...del, length: del.length + insert.text.length }
    ];
  }
}
```

#### Delete vs Delete

The most complex case - five scenarios:

1. **No overlap**: Deletions don't intersect - shift positions accordingly
2. **Complete overlap**: Same position and length - both become no-ops
3. **Same start, different lengths**: Shorter becomes no-op, longer shrinks
4. **Partial overlap**: Both shrink by overlap amount
5. **Complete containment**: One contains the other

```typescript
function transformDeleteDelete(op1: Delete, op2: Delete): [Delete, Delete] {
  const op1End = op1.position + op1.length;
  const op2End = op2.position + op2.length;

  // Calculate overlap
  const overlapStart = Math.max(op1.position, op2.position);
  const overlapEnd = Math.min(op1End, op2End);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  if (overlap === 0) {
    // No overlap - simple position adjustment
    if (op1.position < op2.position) {
      return [op1, { ...op2, position: op2.position - op1.length }];
    } else {
      return [{ ...op1, position: op1.position - op2.length }, op2];
    }
  }

  // Overlapping deletes - both shrink by overlap amount
  // ... (detailed logic handles all edge cases)
}
```

### Operation Application

```typescript
function applyInsert(content: string, position: number, text: string): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  return content.slice(0, safePosition) + text + content.slice(safePosition);
}

function applyDelete(content: string, position: number, length: number): string {
  const safePosition = Math.max(0, Math.min(position, content.length));
  const safeEnd = Math.min(safePosition + length, content.length);
  return content.slice(0, safePosition) + content.slice(safeEnd);
}
```

**Safety bounds**: Positions are clamped to valid ranges to handle edge cases where operations may reference positions that no longer exist after previous transformations.

### Checksum Algorithm

```typescript
function simpleChecksum(content: string): number {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}
```

A fast, non-cryptographic hash used to detect unintended state divergence between client and server.

---

## Server Implementation

### Durable Object Architecture

The server uses Cloudflare Durable Objects, providing:
- **Single point of truth**: One DO instance per note
- **In-memory state**: Fast operation processing
- **Persistence**: Debounced writes to D1 database
- **WebSocket hibernation**: Efficient connection management

### Message Processing

Messages are processed sequentially using a queue to ensure deterministic operation ordering:

```typescript
async processMessageQueue(): Promise<void> {
  if (this.isProcessingQueue) return;
  this.isProcessingQueue = true;

  while (this.messageQueue.length > 0) {
    const { ws, message } = this.messageQueue.shift()!;
    await this.handleMessage(ws, message);
  }

  this.isProcessingQueue = false;
}
```

### Operation Handling Flow

1. **Rate limiting check**: Token bucket algorithm (configurable ops/sec)
2. **Transform against history**: Filter operations from OTHER clients with version > baseVersion
3. **Increment version**: `operationVersion++`
4. **Apply to content**: `currentContent = applyOperation(currentContent, operation)`
5. **Store in history**: Keep last 100 operations for new client sync
6. **Calculate checksum**: For client verification
7. **Broadcast to others**: With next `globalSeqNum` (sender excluded)
8. **Send ACK to sender**: Includes version, seqNum, checksum, and transformedOperation
9. **Schedule persistence**: Debounced (2s delay or 100 ops)

### Critical Design Decision: Transform Filtering

```typescript
const operationsToTransform = this.operationHistory.filter(
  (op) => op.version > baseVersion && op.clientId !== operation.clientId
);
```

**Why filter by clientId?** When a client types rapidly, their operations arrive with stale baseVersions (they were created before previous ACKs arrived). But from the client's perspective, these operations are sequential. The server only needs to transform against concurrent operations from OTHER clients, not against the sender's own acknowledged operations.

### Persistence Strategy

```typescript
schedulePersistence(immediate: boolean = false): void {
  if (this.persistTimeout) clearTimeout(this.persistTimeout);

  this.operationsSincePersist++;

  if (immediate || this.operationsSincePersist >= 100) {
    this.persistToDatabase();
  } else {
    this.persistTimeout = setTimeout(() => this.persistToDatabase(), 2000);
  }
}
```

- **Debounce**: 2 seconds or 100 operations
- **Immediate**: When last client disconnects
- **Fire-and-forget**: DO memory is source of truth during active sessions

---

## Client Implementation

### WebSocket Client

Handles connection management, message queuing, and sequence tracking.

#### Sequence Number Tracking

```typescript
handleSequencedMessage(message: WSMessage, seqNum: number): void {
  if (seqNum === this.nextExpectedSeq) {
    // In order - process immediately
    this.processMessage(message);
    this.nextExpectedSeq++;
    this.processPendingMessages();
  } else if (seqNum > this.nextExpectedSeq) {
    // Out of order - buffer for later
    this.pendingMessages.set(seqNum, message);
    this.startGapDetectionTimer();
  }
  // seqNum < nextExpectedSeq: Ignore (already processed)
}
```

#### ACK Sequence Advancement

```typescript
updateSequenceFromAck(seqNum?: number): void {
  if (seqNum !== undefined && seqNum >= this.nextExpectedSeq) {
    this.nextExpectedSeq = seqNum + 1;
  }
}
```

**Why needed?** The server broadcasts to everyone EXCEPT the sender. The sender receives an ACK instead of the broadcast, with the seqNum that was used. This keeps the sender's sequence counter in sync with other clients.

#### Gap Detection

If messages remain out-of-order for 5 seconds, the client requests a full resync:

```typescript
startGapDetectionTimer(): void {
  if (this.gapTimer) return;
  this.gapTimer = setTimeout(() => {
    console.warn('Gap detection timeout - requesting resync');
    this.requestResync();
  }, 5000);
}
```

### WebSocket Connection Hook

The `useWebSocketConnection` hook manages OT state and business logic.

#### Sync Handler

On initial connection, the server sends current document state:

```typescript
onSync: (content, version, operations, clientId, syntax) => {
  collaboration.clientId = clientId;

  // Check for local changes made while connecting
  const localContent = collaboration.pendingLocalContent || editor.content;

  if (localContent !== content) {
    // Generate operations for the difference
    const ops = generateOperations(content, localContent, clientId, version);

    // Send each operation to server
    for (const op of ops) {
      sendOperation(op);
    }
  }

  noteState.currentVersion = version;
  editor.content = content;
}
```

**Race condition handling**: If the user types while the WebSocket is connecting, those changes need to be sent as operations after sync completes.

#### Remote Operation Handler

When receiving operations from other clients:

```typescript
function applyRemoteOperation(operation: Operation, checksum?: number): void {
  // Transform remote operation against all pending local operations
  let transformedOp = operation;
  const newPendingOps = [];

  for (const pending of collaboration.pendingOperations) {
    const [transformedPending, transformedRemote] = transform(pending.op, transformedOp);
    newPendingOps.push({ ...pending, op: transformedPending });
    transformedOp = transformedRemote;
  }

  collaboration.pendingOperations = newPendingOps;

  // Apply transformed operation to content
  editor.content = applyOperation(editor.content, transformedOp);

  // Verify checksum only when no pending operations
  if (checksum !== undefined && newPendingOps.length === 0) {
    verifyContentChecksum(checksum);
  }
}
```

**Critical invariant**: Only transform the remote operation, NOT pending operations as a separate step. The transform function handles both sides in one step to maintain convergence.

#### ACK Handler

```typescript
onAck: (version, checksum, transformedOperation) => {
  noteState.currentVersion = version;

  // Remove first pending operation (FIFO - ACKs arrive in order)
  if (collaboration.pendingOperations.length > 0) {
    collaboration.pendingOperations = collaboration.pendingOperations.slice(1);
  }

  // Verify checksum only when synced (no pending ops)
  if (checksum !== undefined && collaboration.pendingOperations.length === 0) {
    verifyContentChecksum(checksum);
  }
}
```

#### Checksum Verification and Replay

```typescript
function verifyContentChecksum(serverChecksum: number): void {
  const localChecksum = simpleChecksum(editor.content);

  if (localChecksum !== serverChecksum) {
    checksumMismatchCount++;

    // If mismatch with no pending ops - request replay immediately
    if (collaboration.pendingOperations.length === 0) {
      collaboration.wsClient.sendReplayRequest(
        noteState.currentVersion,
        collaboration.clientId
      );
    }
  } else {
    checksumMismatchCount = 0;
  }
}
```

**Why only verify when no pending ops?** With pending operations, local content includes unacknowledged changes that the server doesn't have yet. Checksum verification is only meaningful when the client is fully synced.

### Operation Generator

Uses the `fast-diff` library to compute minimal changesets:

```typescript
function generateOperations(
  oldContent: string,
  newContent: string,
  clientId: string,
  version: number
): Operation[] {
  const diffs = diff(oldContent, newContent);
  const operations: Operation[] = [];
  let position = 0;

  for (const [type, text] of diffs) {
    if (type === DIFF_INSERT) {
      operations.push({
        type: 'insert',
        position,
        text,
        clientId,
        version: version++
      });
      position += text.length;
    } else if (type === DIFF_DELETE) {
      operations.push({
        type: 'delete',
        position,
        length: text.length,
        clientId,
        version: version++
      });
    } else {
      // DIFF_EQUAL - just advance position
      position += text.length;
    }
  }

  return operations;
}
```

### Operation Batching

To reduce network overhead, rapid edits are batched:

```typescript
class OperationBatcher {
  private batchDelay = 50; // ms
  private pendingTimeout: number | null = null;

  updateContent(newContent: string): void {
    if (this.pendingTimeout) clearTimeout(this.pendingTimeout);

    this.pendingTimeout = setTimeout(() => {
      const ops = generateOperations(this.lastContent, newContent, ...);
      this.onBatch(ops);
      this.lastContent = newContent;
    }, this.batchDelay);
  }
}
```

---

## Message Protocol

### Operation Message (Client → Server)

```typescript
{
  type: 'operation',
  operation: {
    type: 'insert' | 'delete',
    position: number,
    text?: string,      // For insert
    length?: number,    // For delete
    clientId: string,
    version: number
  },
  baseVersion: number,  // Version client was at when creating operation
  clientId: string,
  sessionId: string
}
```

### ACK Message (Server → Client)

```typescript
{
  type: 'ack',
  version: number,              // New server version
  seqNum: number,               // Sequence used for broadcast (for sender tracking)
  contentChecksum: number,      // For verification
  transformedOperation: Operation // Canonical server version of the operation
}
```

### Sync Message (Server → Client)

Sent on initial connection:

```typescript
{
  type: 'sync',
  content: string,           // Current document content
  version: number,           // Current version
  operations: Operation[],   // Recent operation history
  clientId: string,          // Server-assigned client ID
  seqNum: number,            // Current global sequence (next will be seqNum + 1)
  syntax?: string            // Syntax highlighting mode
}
```

### Replay Request/Response

For recovering from state drift:

```typescript
// Request (Client → Server)
{
  type: 'replay_request',
  fromVersion: number,
  clientId: string,
  sessionId: string
}

// Response (Server → Client)
{
  type: 'replay_response',
  baseContent: string,       // Current server content
  baseVersion: number,       // Current server version
  operations: Operation[],   // Operations since fromVersion
  currentVersion: number,    // Same as baseVersion
  contentChecksum: number    // For verification
}
```

---

## Challenges and Solutions

### Challenge 1: Race Condition During Note Creation

**Problem**: User types while initial PUT request is in flight. Local content diverges from server.

**Solution**: On sync, detect local changes and generate operations for the difference. Send these operations immediately after sync completes.

### Challenge 2: Concurrent Insertions at Same Position

**Problem**: Two users type at exactly position 5 simultaneously. Which character comes first?

**Solution**: Use clientId (UUID) for deterministic tie-breaking. Smaller clientId gets priority. All clients agree on ordering regardless of network timing.

### Challenge 3: Three or More Concurrent Users

**Problem**: With 3+ users, messages can arrive out of order. User A might see B's edit before C's, while User D sees C's before B's.

**Solution**: Global sequence numbers. Server assigns monotonically increasing seqNum to every broadcast. Clients buffer out-of-order messages and process in sequence order.

### Challenge 4: Sender Missing Own Broadcast

**Problem**: Server excludes sender from broadcasts (to prevent double-processing). But sender's sequence counter falls behind.

**Solution**: ACK messages include the seqNum that was used for the broadcast. Sender advances their `nextExpectedSeq` to match.

### Challenge 5: State Drift Detection

**Problem**: Due to network issues or bugs, client state may diverge from server without any obvious error.

**Solution**: Server sends content checksum with every operation and ACK. Client verifies checksum when fully synced (no pending ops). On mismatch, request replay.

### Challenge 6: Recovery from Divergence

**Problem**: Client detects checksum mismatch. How to recover without losing user's work?

**Solution**: Replay mechanism. Client requests current server state. Server sends authoritative content. Client adopts server content, clears pending operations. In extreme cases (operations in flight during replay), some user edits may be lost, but consistency is guaranteed.

### Challenge 7: Fast Typist with Slow Network

**Problem**: User types 10 characters quickly. Operations have stale baseVersions because ACKs haven't arrived yet.

**Solution**: Server filters by clientId when transforming. Operations from same client are sequential from that client's perspective - no transformation needed against own acknowledged operations.

### Challenge 8: Delete Containing Insert

**Problem**: User A deletes characters 5-10. User B inserts at position 8 (inside the deleted range). What happens?

**Solution**: Insert "survives" at the delete start position. The inserted text appears at position 5 (not lost). Delete range expands to account for inserted text that now needs deletion.

### Challenge 9: Overlapping Deletes

**Problem**: User A deletes positions 5-10. User B deletes positions 8-15. Both operations reference now-invalid positions.

**Solution**: Calculate overlap region. Both deletes shrink by the overlap amount. Each only deletes characters that the other didn't already delete.

### Challenge 10: Cursor Position Preservation

**Problem**: After applying remote operation, cursor jumps to wrong position.

**Solution**: Transform cursor position through the same operation. If operation is insert before cursor, shift right. If delete before cursor, shift left. If delete contains cursor, move to delete start.

---

## Testing Strategy

### E2E Test Suite

The `e2e/comprehensive-ot.spec.ts` file contains 13 comprehensive Playwright tests simulating real-world collaborative editing scenarios.

#### Test Infrastructure

**Network Latency Simulation**:
```typescript
async function addNetworkLatency(page: Page, latencyMs: number): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 5 * 1024 * 1024,
    uploadThroughput: 5 * 1024 * 1024,
    latency: latencyMs,
  });
  return client;
}
```

**Convergence Waiting**:
```typescript
async function waitForConvergence(clients: ClientSetup[], timeout: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const contents = await Promise.all(clients.map(c => getEditorContent(c.page)));
    if (contents.every(c => c === contents[0])) return true;
    await clients[0].page.waitForTimeout(200);
  }
  return false;
}
```

#### Test Scenarios

| Test | Description | Latencies (ms) |
|------|-------------|----------------|
| **Race Condition** | Type while initial PUT is in flight | 300, 100, 50 |
| **Different Positions** | Concurrent insertions at different positions | 150, 100, 200 |
| **Same Position** | Concurrent insertions at same position (conflict) | 200, 150, 100 |
| **Backspace/Delete** | Deletion keys with concurrent edits | 100, 150, 75 |
| **Ctrl+Backspace** | Word deletion with concurrent edits | 100, 200, 150 |
| **Selection Replace** | Typing over selection with concurrent edits | 150, 100, 200 |
| **Tab Insertion** | Tab key with concurrent operations | 100, 150, 200 |
| **Rapid Fire** | 3 clients typing simultaneously (5 iterations each) | 50, 150, 300 |
| **Enter Key** | Newline insertion with concurrent edits | 100, 200, 150 |
| **Cut (Ctrl+X)** | Cut operation with concurrent edits | 100, 150, 200 |
| **Mixed Operations** | Insert, delete, replace all at once | 75, 150, 250 |
| **Stress Test** | 45 operations from 3 clients (15 each) | 50, 100, 150 |
| **Extreme Latency** | 50ms vs 300ms clients | 300, 50, 300 |

#### Verification Strategy

Each test verifies:

1. **Convergence**: All clients have identical content
2. **Completeness**: All operations' effects are present
3. **No Data Loss**: Original content and all edits visible

Example verification:
```typescript
// Verify convergence
expect(converged).toBe(true);
expect(contents[0]).toBe(contents[1]);
expect(contents[1]).toBe(contents[2]);

// Verify completeness (stress test)
const openBrackets = (content.match(/\[/g) || []).length;
const closeBrackets = (content.match(/\]/g) || []).length;
expect(openBrackets).toBe(45);  // 3 clients × 15 iterations
expect(closeBrackets).toBe(45);
```

#### Interleaving Behavior

When multiple clients type at the same position simultaneously, characters interleave. This is expected OT behavior:

```
Client 1 types: [C1:0]
Client 2 types: [C2:0]
Client 3 types: [C3:0]

Result might be: [[[CCC123:::000]]]
```

The tests verify character counts rather than exact sequences because interleaving order depends on network timing.

---

## Inspiration and Deviations

### ot.js as Inspiration

The implementation was initially inspired by [ot.js](https://github.com/Operational-Transformation/ot.js), a JavaScript library implementing OT for collaborative editing. Key concepts borrowed:

- Basic transform function structure
- Client-server architecture with optimistic updates
- Pending operations queue

### Where ot.js Fell Short

However, ot.js did not fully provide the correct approach for our use case:

1. **No WebSocket Sequence Tracking**: ot.js assumes reliable in-order message delivery. With multiple clients and network variability, messages arrive out of order. We added global sequence numbers.

2. **No Checksum Verification**: ot.js trusts that transforms are always correct. We added content checksums to detect divergence.

3. **No Replay Mechanism**: ot.js has no recovery mechanism for divergent clients. We implemented server-authoritative replay.

4. **ClientId Tie-breaking**: ot.js uses different conflict resolution for same-position inserts. We use clientId for deterministic ordering.

5. **Dual Tracking Not Addressed**: ot.js uses a single versioning system. We needed separate version (persistent) and sequence (transient) tracking.

6. **E2E Encryption Compatibility**: ot.js doesn't consider scenarios where real-time collaboration should be disabled. We disable WebSocket collaboration for E2E encrypted notes.

### Custom Innovations

1. **Replay Recovery**: Server can send authoritative content + operations to recover divergent clients
2. **Checksum Verification**: Detect state drift before it compounds
3. **ACK Sequence Advancement**: Keep sender's sequence in sync despite being excluded from broadcasts
4. **Gap Detection**: Automatic resync if messages remain out-of-order
5. **Rate Limiting**: Token bucket per-client to prevent abuse

---

## Performance Characteristics

### Server
- **Memory**: O(100) operations in history, O(n) current content
- **Transform**: O(k) where k = operations since client's baseVersion
- **Broadcast**: O(c) where c = connected clients

### Client
- **Pending Operations**: O(p) where p = unacknowledged operations
- **Transform per Remote Op**: O(p) transforms against pending ops
- **Message Buffer**: O(g) where g = gap size in sequence

### Network
- **Operation Message**: ~100-500 bytes
- **Batching**: 50ms debounce reduces message count by ~10x for fast typists
- **Pipelining**: Up to 20 operations in flight before backpressure

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/ot/types.ts` | Type definitions for operations and messages |
| `src/ot/transform.ts` | Transform algorithm implementation |
| `src/ot/apply.ts` | Operation application functions |
| `src/ot/checksum.ts` | Content checksum function |
| `src/durable-objects/NoteSessionDurableObject.ts` | Server-side OT handling |
| `client/lib/realtime/WebSocketClient.ts` | Client WebSocket management |
| `client/lib/hooks/useWebSocketConnection.svelte.ts` | Client OT business logic |
| `client/lib/realtime/OperationGenerator.ts` | Operation generation from diffs |
| `e2e/comprehensive-ot.spec.ts` | Playwright E2E test suite |

---

## Conclusion

This OT implementation provides robust real-time collaborative editing with:

- **Guaranteed convergence** through mathematically correct transforms
- **Resilience** through checksum verification and replay recovery
- **Performance** through batching, pipelining, and efficient algorithms
- **Comprehensive testing** with 13 E2E tests covering edge cases

The system has been tested with up to 3 concurrent clients with latencies ranging from 50ms to 300ms, including stress tests with 45+ rapid operations.
