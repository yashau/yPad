# yPad

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Unit Tests](https://img.shields.io/badge/unit_tests-386_passed-brightgreen)
![E2E Tests](https://img.shields.io/badge/e2e_tests-83_passed-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-97%25-brightgreen)

[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Yjs](https://img.shields.io/badge/Yjs_CRDT-6B46C1?style=for-the-badge&logoColor=white)](https://yjs.dev/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

A real-time collaborative notepad with end-to-end encryption, built on Cloudflare's edge network using Yjs CRDT for conflict-free synchronization.

**Live: [https://yp.pe](https://yp.pe)**

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development](#development)
- [Deployment](#deployment)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Key Features Explained](#key-features-explained)
- [Contributing](#contributing)
- [License](#license)

## Features

### Real-Time Collaboration
- **Multi-User Editing**: Multiple users can edit simultaneously with Yjs CRDT
- **Conflict-Free Sync**: CRDTs guarantee eventual consistency without conflicts
- **Remote Cursors**: See other users' cursor positions via Yjs Awareness protocol
- **User Presence**: Live count of connected collaborators (editors vs viewers)
- **Editor Limits**: Maximum 10 concurrent editors per note with real-time status

### Security & Privacy
- **True End-to-End Encryption**: AES-GCM 256-bit client-side encryption for password-protected notes
- **Password Never Leaves Browser**: Passwords are used locally for encryption/decryption only
- **Password Protection**: PBKDF2 key derivation (100,000 iterations)
- **Zero-Knowledge**: Server only stores encrypted blobs, never sees plaintext or passwords

### Note Management
- **Auto-Save**: Automatic saving as you type
- **Custom URLs**: Set custom note URLs with availability checking
- **Self-Destructing Notes**: Max view count limits
- **Time-Based Expiration**: Set expiration (1 hour to 1 month)
- **Automatic Cleanup**: Expired and inactive notes are deleted

### Editor
- **Syntax Highlighting**: 190+ languages via highlight.js (lazy-loaded)
- **Line Numbers**: Synchronized with scroll
- **Dark/Light Theme**: Persistent theme toggle

## Tech Stack

### Platform
- **Cloudflare Workers** - Serverless edge computing
- **Cloudflare Durable Objects** - Stateful WebSocket coordination for real-time sync
- **Cloudflare D1** - Serverless SQLite database at the edge
- **Cloudflare Assets** - Global CDN for static files

### Backend
| Technology | Purpose |
|------------|---------|
| Hono | Lightweight web framework for Workers |
| TypeScript | Type-safe development |
| Wrangler | Cloudflare development & deployment CLI |

### Frontend
| Technology | Purpose |
|------------|---------|
| Svelte 5 | Reactive UI framework with Runes |
| Vite | Build tool and dev server |
| TypeScript | Type safety |

### Real-Time Collaboration
| Technology | Purpose |
|------------|---------|
| Yjs | CRDT framework for conflict-free collaborative editing |
| y-protocols | Yjs sync and awareness protocols |

### Styling & UI
| Technology | Purpose |
|------------|---------|
| Tailwind CSS | Utility-first CSS framework |
| shadcn-svelte | High-quality component library |
| bits-ui | Headless UI primitives |
| @lucide/svelte | Icon library |

### Specialized Libraries
| Technology | Purpose |
|------------|---------|
| highlight.js | Syntax highlighting for 190+ languages |
| @internationalized/date | Internationalized date handling |

### Security & Cryptography
- **Web Crypto API** - Browser-native cryptography
  - AES-GCM encryption (256-bit)
  - PBKDF2 key derivation
  - SHA-256 hashing

## Architecture

### System Design

```
┌─────────────────┐
│   Client App    │
│   (Svelte 5)    │
│   + Yjs CRDT    │
└────────┬────────┘
         │
         │ HTTPS/WSS
         │
┌────────▼────────────────────────────────────┐
│    Cloudflare Workers (Edge Network)        │
│  ┌──────────────────────────────────────┐  │
│  │         Hono API Router              │  │
│  │  • GET/POST/PUT /api/notes           │  │
│  │  • WebSocket upgrade handler         │  │
│  └──────────┬──────────────┬────────────┘  │
│             │              │                │
│   ┌─────────▼─────┐   ┌───▼──────────────┐ │
│   │  D1 Database  │   │ Durable Objects  │ │
│   │   (SQLite)    │   │  (Yjs Server)    │ │
│   └───────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────┘
```

### Real-Time Collaboration Flow (Yjs CRDT)

1. **Client** connects via WebSocket to Cloudflare Worker
2. **Worker** validates session and upgrades connection to Durable Object
3. **Durable Object** sends initial Yjs state to the client
4. **Yjs CRDT** handles all text operations locally with immediate UI updates
5. **Updates** are encoded as binary Yjs updates and sent to server
6. **Server** broadcasts updates to all connected clients
7. **Awareness** protocol syncs cursor positions and user presence
8. **Persistence** occurs periodically (debounced 5s or every 50 operations)

### Database Schema

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,              -- Plaintext or encrypted blob
    yjs_state BLOB,                     -- Yjs document state for fast restore
    syntax_highlight TEXT DEFAULT 'plaintext',
    view_count INTEGER DEFAULT 0,
    max_views INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    last_session_id TEXT,
    is_encrypted INTEGER DEFAULT 0,     -- E2E encryption flag
    last_accessed_at INTEGER            -- Tracks when note was last viewed
);

CREATE INDEX idx_notes_expires_at ON notes(expires_at);
CREATE INDEX idx_notes_created_at ON notes(created_at);
CREATE INDEX idx_notes_last_accessed_at ON notes(last_accessed_at);
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm
- Cloudflare account (for deployment)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd yPad

# Install dependencies
npm install

# Run migrations (creates local database automatically)
npm run db:migrate

# Start development server
npm run dev
```

Visit `http://127.0.0.1:8787` to see the app.

## Development

### Development Scripts

yPad includes automated development and deployment scripts for both Windows and Mac/Linux:

#### Quick Dev Server Restart (Recommended)

**Windows (PowerShell)**:
```powershell
.\scripts\dev.ps1
```

**Mac/Linux (Bash)**:
```bash
./scripts/dev.sh
```

This script automatically:
1. Kills any processes running on port 8787
2. Runs database migrations if needed
3. Builds the frontend
4. Starts the dev server

#### Manual Development

```bash
# Start dev server with hot reload
npm run dev

# Build frontend only
npm run build

# Preview production build locally
npm run preview
```

The dev server runs with:
- Local D1 database (`--local`)
- Persistent state in `.wrangler/state` (`--persist-to`)
- Hot module replacement
- Automatic Svelte compilation
- Rate limiting disabled (via `DISABLE_RATE_LIMITS` in `wrangler.toml`)

### Database Commands

```bash
# Create new D1 database
npm run db:create

# Apply migrations locally
npm run db:migrate

# Apply migrations to production
npm run db:migrate:prod
```

### Testing

#### Unit Tests (Vitest)

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Unit test suites cover:
- API validation and constants
- WebSocket client behavior
- Cryptography utilities
- Message handlers
- Editor and collaboration hooks
- Rate limiting (token bucket, sliding window)

#### E2E Tests (Playwright)

```bash
# Run all e2e tests
npm run e2e

# Run e2e tests with UI
npx playwright test --ui

# Run specific test suite
npx playwright test e2e/latency-sync.spec.ts
```

E2E test suites:

**Latency Sync** (`latency-sync.spec.ts`) - 13 tests
- Race conditions with high latency (client types while PUT in flight)
- Concurrent insertions at different positions
- Concurrent insertions at same position (CRDT resolution)
- Backspace and Delete key operations
- Word deletion (Ctrl+Backspace) with concurrent edits
- Selection replacement (typing over selection)
- Tab key insertion with concurrent edits
- Rapid fire typing from 3 clients simultaneously
- Enter key (newlines) with concurrent edits
- Cut (Ctrl+X) operation with concurrent edits
- Mixed operations (insert, delete, replace all at once)
- Stress test: 45 rapid operations from 3 clients
- Extreme latency difference (50ms vs 300ms clients)

**Collaborative Editing** (`collaborative-editing.spec.ts`) - 14 tests
- Local cursor stays in place when remote user types after cursor
- Cursor shifts correctly when remote user types before cursor
- Selection preserved during remote edits elsewhere
- Rapid typing from remote users doesn't disrupt local cursor
- Multi-client simultaneous editing with stable cursors
- Edge cases: cursor at position 0, end of document, multi-line
- Concurrent insertions at different positions
- Concurrent insertions at same position
- Selection replacement with concurrent edits
- Content persistence after fast typing

**Remote Cursors** (`remote-cursors.spec.ts`) - 8 tests
- Cursor visibility for remote users
- Cursor position updates in real-time
- Cursor color consistency
- Cursor cleanup on user disconnect
- Cursor shifts when text inserted/deleted before it
- New client joining sees existing remote cursors

**E2E Encryption Security** (`e2e-encryption.spec.ts`) - 9 tests
- Passwords are NEVER sent to the server
- Plaintext content never leaves the browser
- WebSocket messages never contain password or plaintext
- Multiple password attempts don't leak to server

**Editor Limits** (`editor-limits.spec.ts`) - 16 tests
- First user edit permission and typing capability
- Connection status shows client ID and editor count
- Viewer count shown separately from editor count
- Encrypted notes bypass editor limit
- Editor limit banner when 11th user tries to edit
- Retry button allows editing after an editor leaves

**Rate Limiting** (`rate-limiting.spec.ts`) - 7 tests
- REST API rate limits per endpoint
- WebSocket operation rate limits
- Token bucket refill behavior

**Status Indicator** (`status-indicator.spec.ts`) - 7 tests
- Connection status display
- Save status indicators
- Sync state visualization

**Syntax Highlighting** (`syntax-highlighting.spec.ts`) - 9 tests
- JavaScript, Python, TypeScript highlighting in light theme
- JavaScript, Python, TypeScript highlighting in dark theme
- Switching back to Plain Text removes highlighting
- Note with language pre-set loads with highlighting after reload
- Highlighting persists after theme toggle

### Project Structure

```
yPad/
├── client/                          # Frontend Svelte application
│   ├── components/                  # Feature components
│   │   ├── Banners/                # Notification banners
│   │   │   ├── EditorLimitBanner.svelte
│   │   │   ├── EncryptionDisabledBanner.svelte
│   │   │   ├── EncryptionEnabledBanner.svelte
│   │   │   ├── FinalViewBanner.svelte
│   │   │   ├── NoteDeletedBanner.svelte
│   │   │   └── ReloadBanner.svelte
│   │   ├── Dialogs/                # Modal dialogs
│   │   │   ├── ConflictDialog.svelte
│   │   │   ├── InfoDialog.svelte
│   │   │   ├── PasswordDialog.svelte
│   │   │   └── RemovePasswordDialog.svelte
│   │   ├── Editor/                 # Editor components
│   │   │   ├── EditorView.svelte
│   │   │   └── LineNumbers.svelte
│   │   ├── Header/                 # Header components
│   │   │   ├── AppHeader.svelte
│   │   │   ├── ConnectionStatus.svelte
│   │   │   ├── StatusIndicator.svelte
│   │   │   └── UrlDisplay.svelte
│   │   └── Toolbar/                # Toolbar components
│   │       ├── LanguageSelector.svelte  # Lazy-loaded language list
│   │       ├── MaxViewsInput.svelte
│   │       ├── OptionsPanel.svelte
│   │       └── PasswordInput.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   ├── RemoteCursor.svelte
│   │   │   └── ui/                 # shadcn-svelte components
│   │   ├── hooks/                  # Svelte 5 hooks
│   │   │   ├── useCollaboration.svelte.ts
│   │   │   ├── useEditor.svelte.ts
│   │   │   ├── useNoteOperations.svelte.ts
│   │   │   ├── useNoteState.svelte.ts
│   │   │   ├── useSecurity.svelte.ts
│   │   │   └── useWebSocketConnection.svelte.ts
│   │   ├── realtime/
│   │   │   └── WebSocketClient.ts  # WebSocket client with Yjs sync
│   │   ├── yjs/
│   │   │   └── YjsManager.ts       # Yjs document & awareness manager
│   │   ├── stores/
│   │   │   └── theme.svelte.ts
│   │   ├── utils/
│   │   │   ├── cn.ts
│   │   │   └── highlighter.ts      # Lazy-loaded syntax highlighter
│   │   └── crypto.ts               # Client-side encryption (AES-GCM)
│   ├── App.svelte                  # Main app component
│   ├── app.css                     # Global styles
│   ├── index.html                  # HTML entry point
│   └── main.ts                     # JS entry point
├── src/                            # Backend Cloudflare Workers
│   ├── durable-objects/
│   │   ├── handlers/
│   │   │   ├── messageHandlers.ts  # Yjs update & broadcast handlers
│   │   │   ├── types.ts            # Handler context types
│   │   │   └── index.ts
│   │   ├── NoteSessionDurableObject.ts  # WebSocket coordinator with Yjs
│   │   └── RateLimiterDurableObject.ts  # Per-session rate limiting
│   ├── types/
│   │   └── messages.ts             # WebSocket message type definitions
│   ├── types.d.ts                  # TypeScript type definitions
│   └── index.ts                    # Hono API server & routes
├── config/                         # Configuration files
│   ├── constants.ts                # Application constants & limits
│   └── languages.ts                # Language options (lazy-loaded)
├── tests/                          # Vitest unit tests
│   ├── api/                        # API route tests
│   ├── client/                     # Client-side tests (crypto, WebSocket)
│   ├── config/                     # Configuration tests
│   ├── handlers/                   # Message handler tests
│   ├── hooks/                      # Svelte hook tests
│   └── rate-limiting/              # Rate limiting tests
├── e2e/                            # Playwright e2e tests (83 tests)
│   ├── collaborative-editing.spec.ts # Cursor preservation & editing (14 tests)
│   ├── e2e-encryption.spec.ts      # E2E encryption security (9 tests)
│   ├── editor-limits.spec.ts       # Editor limit tests (16 tests)
│   ├── latency-sync.spec.ts        # CRDT sync with latency (13 tests)
│   ├── rate-limiting.spec.ts       # Rate limiting tests (7 tests)
│   ├── remote-cursors.spec.ts      # Remote cursor sync tests (8 tests)
│   ├── status-indicator.spec.ts    # Status display tests (7 tests)
│   └── syntax-highlighting.spec.ts # Syntax highlighting tests (9 tests)
├── public/                         # Static assets
│   ├── icons/                      # Favicon icons
│   ├── favicon.ico
│   └── site.webmanifest
├── scripts/                        # Automation scripts
│   ├── dev.ps1                     # Windows dev server script
│   ├── dev.sh                      # Mac/Linux dev server script
│   ├── prod.ps1                    # Windows production deployment
│   └── prod.sh                     # Mac/Linux production deployment
├── migrations/                     # D1 database migrations
│   ├── 0001_initial_schema.sql
│   └── 0002_add_yjs_state.sql
├── wrangler.toml                   # Cloudflare Workers config
├── vite.config.ts                  # Vite build config
├── vitest.config.ts                # Vitest test config
├── playwright.config.ts            # Playwright e2e test config
└── package.json                    # Dependencies & scripts
```

## Deployment

### Automated Production Deployment (Recommended)

yPad includes automated deployment scripts that handle environment configuration, migrations, building, and deployment:

#### Setup Environment Configuration

1. **Copy the example environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your production values**:
   ```bash
   # Cloudflare Account ID (optional)
   ACCOUNT_ID=your-account-id

   # Worker name for production
   WORKER_NAME=ypad

   # D1 Database Configuration
   DB_NAME=ypad-db
   DB_ID=your-production-database-id

   # Durable Objects Configuration
   DO_SCRIPT_NAME=ypad

   # Contact Information
   ABUSE_EMAIL=abuse@example.com
   ```

3. **Create production database** (if not already created):
   ```bash
   wrangler d1 create ypad-db
   # Copy the database_id from output to your .env file
   ```

#### Deploy to Production

**Windows (PowerShell)**:
```powershell
.\scripts\prod.ps1
```

**Mac/Linux (Bash)**:
```bash
./scripts/prod.sh
```

The deployment script automatically:
1. ✅ Validates `.env` configuration
2. ✅ Backs up your local `wrangler.toml`
3. ✅ Generates production `wrangler.toml` from `.env`
4. ✅ Runs production database migrations
5. ✅ Injects environment variables into constants.ts
6. ✅ Builds the frontend
7. ✅ Deploys to Cloudflare Workers
8. ✅ Restores your local `wrangler.toml` and `constants.ts`

**Features**:
- Automatic rollback on failure
- Timestamped backups of `wrangler.toml`
- Optional account ID support
- Color-coded output with progress tracking
- Environment validation before deployment

### Manual Deployment

```bash
# Build and deploy
npm run deploy
```

This will:
1. Run `npm run build` to build the Svelte frontend
2. Deploy to Cloudflare Workers using Wrangler
3. Upload assets to Cloudflare CDN

**Note**: Manual deployment uses the `wrangler.toml` in your repo. For production, you'll need to manually update it with production values.

### Configuration

For local development, edit [wrangler.toml](wrangler.toml) to configure:
- Worker name
- Database binding
- Durable Objects configuration
- Cron triggers (cleanup schedule)
- Compatibility date

For production deployment, use the `.env` file (see Automated Production Deployment above).

## Usage

### Creating a Note

1. Visit the homepage
2. Start typing in the editor
3. A unique 4-character ID is automatically generated with collision detection
   - If a collision occurs, the system retries up to 3 times
   - After 3 failed attempts, ID length increases to 5 characters
   - Process repeats with adaptive length scaling (max 10 characters)
4. Note auto-saves every 500ms

### Setting a Custom URL

1. Click the **pencil icon** next to the note URL in the header
2. Enter desired URL (availability checked in real-time)
3. Press **Enter** or click the **checkmark** to create a new note with the custom URL
4. All settings (content, syntax, password, expiration) are copied to the new note
5. Use the **navigation icon** to go to any existing note by entering its ID

### Adding Password Protection

1. Click **Options** button
2. Toggle **Password Protection**
3. Enter password (client-side encryption)
4. Note content is encrypted before sending to server
5. Real-time collaboration is automatically disabled to preserve E2E encryption

### Removing Password Protection

1. Click the lock icon in the header
2. Confirm removal in the dialog
3. Content is decrypted and saved without encryption
4. Real-time collaboration is automatically re-enabled

### Configuring Note Options

Click **Options** to set:
- **Syntax Highlighting**: Choose from 150+ languages
- **Password Protection**: Enable/disable with password
- **Max Views**: Set view limit - displays remaining views with reset option
- **Expiration**: Set expiry with live countdown timer and reset option

### Real-Time Collaboration

1. Share your note URL with others
2. Multiple users can edit simultaneously (for non-encrypted notes, max 10 concurrent editors)
3. Changes sync in real-time using Yjs CRDT
4. Conflicts are automatically resolved
5. See other users' cursors with color-coded position indicators
6. Visual status indicators in the header:
   - **Green pulse**: Real-time sync active
   - **User count**: Shows your client ID with `+N/M` format (N other editors, M viewers)
   - **Blue lock**: Connected but collaboration disabled (encrypted note)
   - **Red**: Disconnected
   - **Trash icon**: Note has been deleted
7. **Editor Limit**: Maximum 10 concurrent editors per note. Additional users can view in real-time but must wait for a slot to edit
8. **Note**: Real-time collaboration is automatically disabled for password-protected notes to preserve end-to-end encryption

### Viewing a Protected Note

1. Open note URL
2. Enter password in dialog
3. Content is decrypted client-side
4. View count increments automatically

### Final View Handling

When a note reaches its maximum view count:
1. The note content is displayed one final time
2. A warning banner appears indicating the note has been deleted
3. The note is permanently removed from the server
4. Copy the content before leaving the page - it cannot be recovered

## API Reference

### REST Endpoints

#### `GET /api/notes/:id`
Retrieve a note by ID. Updates `last_accessed_at` timestamp.

**Response**:
```json
{
  "id": "abc123",
  "content": "Note content (encrypted blob if protected)",
  "syntax_highlight": "javascript",
  "view_count": 5,
  "max_views": null,
  "expires_at": null,
  "is_encrypted": false,
  "is_last_view": false
}
```

**Side Effects**:
- Increments `view_count` (for non-encrypted notes only)
- Updates `last_accessed_at` timestamp
- If `is_last_view` is true, note is deleted after response

**Note**: For encrypted notes, content is returned as an encrypted blob. Decryption happens client-side.

#### `POST /api/notes`
Create a new note. Initializes `last_accessed_at` to current timestamp.

**Body**:
```json
{
  "id": "custom-id",
  "content": "Note content (or encrypted blob)",
  "syntax_highlight": "plaintext",
  "max_views": null,
  "expires_in": null,
  "is_encrypted": false
}
```

**Side Effects**:
- Sets `last_accessed_at` to current timestamp

#### `PUT /api/notes/:id`
Update an existing note.

**Body**:
```json
{
  "content": "Updated content",
  "syntax_highlight": "javascript",
  "max_views": 10,
  "expires_in": 86400000,
  "clear_expiration": false
}
```

**Response**:
```json
{
  "version": 2,
  "expires_at": 1704067200000
}
```

**Notes**:
- Setting `max_views` resets `view_count` to 0
- `expires_at` is computed server-side from `expires_in`
- Use `clear_expiration: true` to remove expiration

#### `DELETE /api/notes/:id`
Delete a note and cleanup Durable Object state.

**Query Parameters**:
- `session_id` (optional): Session ID for WebSocket cleanup

#### `POST /api/notes/:id/view`
Confirm view for encrypted notes after successful client-side decryption.

**Response**:
```json
{
  "view_count": 6,
  "is_last_view": false
}
```

**Note**: This endpoint is only used for encrypted notes. View count is incremented after the client successfully decrypts the content.

#### `GET /api/check/:id`
Check if a custom ID is available.

**Response**:
```json
{
  "available": true
}
```

### WebSocket Protocol

#### Connection
```
ws://localhost:8787/api/notes/:id/ws
```

**Side Effects**:
- Updates `last_accessed_at` timestamp when connection is established

#### Message Types

**Yjs Sync** (server → client):
```json
{
  "type": "yjs_sync",
  "state": "<base64-encoded Yjs state>",
  "seqNum": 0,
  "clientId": "unique-client-id",
  "syntax": "javascript"
}
```

**Yjs Update** (client ↔ server):
```json
{
  "type": "yjs_update",
  "update": "<base64-encoded Yjs update>",
  "clientId": "client-id",
  "seqNum": 1
}
```

**Yjs Acknowledgment** (server → client):
```json
{
  "type": "yjs_ack",
  "seqNum": 2
}
```

**Awareness Update** (client ↔ server):
```json
{
  "type": "awareness_update",
  "update": "<base64-encoded awareness state>",
  "clientId": "abc123",
  "seqNum": 3
}
```

**Note Status** (server → client, every 10 seconds):
```json
{
  "type": "note_status",
  "view_count": 5,
  "max_views": 10,
  "expires_at": 1704067200000
}
```

**User Joined** (server → client):
```json
{
  "type": "user_joined",
  "clientId": "abc123",
  "connectedUsers": ["abc123", "def456", "ghi789"],
  "activeEditorCount": 2,
  "viewerCount": 1,
  "seqNum": 6
}
```

**User Left** (server → client):
```json
{
  "type": "user_left",
  "clientId": "abc123",
  "connectedUsers": ["def456", "ghi789"],
  "activeEditorCount": 1,
  "viewerCount": 1,
  "seqNum": 7
}
```

**Request Edit** (client → server):
```json
{
  "type": "request_edit",
  "clientId": "abc123",
  "sessionId": "session-uuid"
}
```

**Request Edit Response** (server → client):
```json
{
  "type": "request_edit_response",
  "canEdit": true,
  "activeEditorCount": 3,
  "viewerCount": 2
}
```

**Editor Count Update** (server → client):
```json
{
  "type": "editor_count_update",
  "activeEditorCount": 4,
  "viewerCount": 1,
  "seqNum": 8
}
```

**Syntax Change** (client ↔ server):
```json
{
  "type": "syntax_change",
  "syntax": "javascript",
  "clientId": "abc123",
  "seqNum": 8
}
```

**Encryption Changed** (server → client):
```json
{
  "type": "encryption_changed",
  "is_encrypted": true,
  "has_password": true
}
```

**Note Deleted** (server → client):
```json
{
  "type": "note_deleted",
  "deletedByCurrentUser": false
}
```

**Error** (server → client):
```json
{
  "type": "error",
  "message": "Error description"
}
```

## Key Features Explained

### Yjs CRDT

yPad uses [Yjs](https://yjs.dev/), a high-performance CRDT (Conflict-free Replicated Data Type) implementation for real-time collaborative editing. CRDTs mathematically guarantee that all users converge to the same document state, regardless of network conditions or edit ordering.

#### How It Works

Unlike traditional Operational Transform (OT), CRDTs don't require a central server to resolve conflicts. Each character in the document has a unique identifier, and Yjs uses these identifiers to merge concurrent edits deterministically.

**Example**: If User A inserts "hello" at position 5 while User B simultaneously deletes characters 3-7:
- Each edit is applied independently using Yjs's merge algorithm
- No transformation needed - CRDT guarantees convergence
- Both users automatically end up with identical documents

#### Key Advantages

- **Guaranteed Convergence**: Mathematical proof that all clients reach the same state
- **No Central Arbitration**: Conflicts resolved locally without server coordination
- **Offline Support Ready**: Changes can be synced after reconnection
- **Cursor Awareness**: Real-time cursor positions via Yjs Awareness protocol
- **Efficient Updates**: Only deltas (changes) are transmitted, not full content

#### Architecture

The system uses Yjs with a **server-relay** model:

1. **Local First**: When you type, Yjs updates the local document immediately
2. **Binary Updates**: Changes are encoded as compact binary updates
3. **Server Relay**: Server receives updates and broadcasts to other clients
4. **State Persistence**: Server maintains authoritative Yjs state in the database

#### Sync Protocol

yPad uses the [y-protocols](https://github.com/yjs/y-protocols) library for synchronization:

- **Initial Sync**: New clients receive the full Yjs state on connection
- **Incremental Updates**: Subsequent changes sent as binary update messages
- **Awareness Protocol**: Cursor positions and user presence synced separately
- **Gap Detection**: Out-of-order messages buffered; persistent gaps trigger resync

#### Yjs Document Structure

```typescript
// Server-side Yjs document
const yjsDoc = new Y.Doc();
const yjsText = yjsDoc.getText('content');

// Client receives state as base64-encoded binary
const state = Y.encodeStateAsUpdate(yjsDoc);
```

#### Why Yjs Over OT?

| Aspect | OT | Yjs CRDT |
|--------|-----|----------|
| Conflict Resolution | Server transforms operations | Automatic via unique IDs |
| Complexity | O(n²) transform pairs | O(1) merge |
| Offline Support | Difficult | Built-in |
| Convergence | Requires careful implementation | Mathematically guaranteed |

### Awareness Protocol

yPad uses the Yjs Awareness protocol for cursor synchronization and user presence:

- **Cursor Positions**: Each user's cursor position synced in real-time
- **User Colors**: Unique colors assigned per client for visual distinction
- **Presence Detection**: Automatic tracking of connected/disconnected users
- **Low Overhead**: Awareness updates are lightweight and don't affect document state

### Client-Side Encryption

For password-protected notes:
1. User enters password
2. Password derives encryption key (PBKDF2, 100,000 iterations)
3. Content encrypted with AES-GCM before transmission
4. **Only encrypted blob sent to server** - password never leaves the browser
5. Server stores encrypted content, never sees plaintext or password
6. On retrieval, server returns encrypted blob (no password verification)
7. Client decrypts content locally - decryption success validates password
8. **Real-time collaboration is automatically disabled** to maintain E2E encryption
9. All connected clients notified when encryption status changes

**Security Guarantees** (verified by E2E tests):
- Passwords are never transmitted to the server in any form
- Plaintext content is never sent after encryption is enabled
- Server only stores and serves encrypted blobs

### Editor Limits

yPad limits concurrent editors to prevent resource exhaustion and ensure a smooth editing experience for all users.

#### How It Works

- **Maximum 10 active editors** per note at any time
- **Active editor**: A user who has sent a Yjs update (typed/edited) within the last 60 seconds
- **Viewer**: A connected user who hasn't edited recently (can view in real-time)
- **Encrypted notes bypass the limit**: Since real-time collaboration is disabled for encrypted notes, they're always editable

#### User Experience

1. **Status Display**: Header shows `clientId +N/M` format
   - `clientId`: Your 4-character identifier
   - `+N`: Number of other active editors
   - `/M`: Number of viewers (users who haven't typed recently)
   - Example: `a1b2 +3/5` = you + 3 other editors + 5 viewers

2. **Becoming an Editor**: When you start typing:
   - Client requests edit permission from server
   - If under limit (< 10 editors), you're granted editing
   - Your status updates from viewer to active editor
   - All clients receive real-time count updates

3. **At the Limit**: When 10 editors are active:
   - New users can still view the note in real-time
   - Attempting to edit shows a yellow warning banner
   - "Retry" button lets you check if a slot opened up
   - When an editor leaves or times out (60s), a slot opens

#### Configuration

Editor limits are configured in `config/constants.ts`:

```typescript
export const EDITOR_LIMITS = {
  MAX_ACTIVE_EDITORS: 10,      // Maximum concurrent editors per note
  ACTIVE_TIMEOUT_MS: 60_000,   // Time before an idle editor becomes a viewer
} as const;
```

### Max Views & Expiration

yPad supports two types of note lifecycle limits:

**Max Views**:
- Set a maximum number of views (1-1000)
- View count resets when max views is set (counts from time of setting)
- Remaining views displayed in options panel
- Note automatically deleted when limit reached
- Final view shows content with warning banner

**Expiration**:
- Set time-based expiration (1 hour to 1 month)
- Live countdown timer in options panel
- Expiration time computed server-side for accuracy
- Note automatically deleted by cron job when expired

Both limits can be reset (removed) after being set.

### Automatic Cleanup

A cron trigger runs every 15 minutes to clean up notes:
```javascript
// Triggered by: crons = ["*/15 * * * *"]
async scheduled(event, env, ctx) {
  const now = Date.now();
  const inactiveThreshold = now - (90 * 24 * 60 * 60 * 1000); // 90 days

  // Delete expired notes (by expires_at timestamp)
  await env.DB.prepare(
    'DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= ?'
  ).bind(now).run();

  // Delete inactive notes (not accessed in 90 days)
  await env.DB.prepare(
    'DELETE FROM notes WHERE last_accessed_at IS NOT NULL AND last_accessed_at <= ?'
  ).bind(inactiveThreshold).run();
}
```

**Cleanup Rules**:
- Notes with `expires_at` past current time are deleted
- Notes not accessed in 90 days (configurable via `INACTIVE_NOTE_EXPIRY_DAYS` constant) are deleted
- Access tracking updates on:
  - GET `/api/notes/:id` - Note view
  - WebSocket connection to `/api/notes/:id/ws`
  - POST `/api/notes` - Note creation (initialized to current time)

### Rate Limiting

yPad implements rate limiting to prevent abuse while allowing normal usage patterns.

#### REST API Rate Limits

Per-session rate limiting using Cloudflare Durable Objects:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/notes` (create) | 10 requests | per minute |
| `GET /api/notes/:id` (read) | 60 requests | per minute |
| `PUT /api/notes/:id` (update) | 30 requests | per minute |
| `DELETE /api/notes/:id` (delete) | 20 requests | per minute |
| `GET /api/notes/:id/ws` (WebSocket upgrade) | 30 requests | per minute |

**Rate Limit Response**:
```json
HTTP/1.1 429 Too Many Requests
Retry-After: 45

{"error": "Rate limit exceeded"}
```

The `Retry-After` header indicates how many seconds to wait before retrying.

#### WebSocket Rate Limits

Token bucket algorithm for real-time messages:

| Setting | Value | Description |
|---------|-------|-------------|
| Messages per second | 25 | Sustained rate limit |
| Burst allowance | 100 | Tokens for paste operations |
| Max message size | 128 KB | Maximum WebSocket message size |

**How it works**:
- Each connection starts with 100 tokens (burst allowance)
- Tokens refill at 25 per second
- Each message consumes 1 token
- Normal typing (5-10 chars/sec) never hits the limit
- Large pastes consume burst tokens but recover quickly

**Violation Handling**:
1. First violations: Warning message sent via WebSocket
2. After 10 violations: Connection closed with code 1008

```json
{"type": "error", "message": "Rate limit exceeded. Please slow down."}
```

#### Local Development

Rate limiting is **disabled by default** in local development via `DISABLE_RATE_LIMITS=true` in `wrangler.toml`. This allows E2E tests to run without hitting rate limits. In production, this variable is not set, so rate limiting is enforced.

#### Configuration

All rate limits are configurable in `config/constants.ts`:

```typescript
export const RATE_LIMITS = {
  API: {
    CREATE_PER_MINUTE: 10,
    READ_PER_MINUTE: 60,
    UPDATE_PER_MINUTE: 30,
    DELETE_PER_MINUTE: 20,
    WS_UPGRADE_PER_MINUTE: 30,
  },
  WEBSOCKET: {
    OPS_PER_SECOND: 25,
    BURST_ALLOWANCE: 100,
    MAX_MESSAGE_SIZE: 131072,  // 128 KB
  },
  PENALTY: {
    DISCONNECT_THRESHOLD: 10,
    WARNING_MESSAGE: 'Rate limit exceeded. Please slow down.',
  },
} as const;
```

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Acknowledgments

- Inspired by [notepad.pw](https://notepad.pw)
- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- UI components from [shadcn-svelte](https://www.shadcn-svelte.com/)
