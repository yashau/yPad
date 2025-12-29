# yPad

[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

A production-ready, real-time collaborative notepad with end-to-end encryption, built on Cloudflare's edge network. Features Google Docs-style real-time collaboration using Operational Transform, client-side encryption, syntax highlighting for 150+ languages, and automatic note lifecycle management.

## Features

### Real-Time Collaboration
- **Multi-User Editing**: Live collaborative editing with multiple users simultaneously
- **Operational Transform**: Character-level conflict-free concurrent editing using OT algorithm
- **InputEvent-Based Operation Generation**: Accurate cursor-aware OT operations using browser InputEvent API
- **Operation Pipelining**: Eliminated ACK-based latency bottleneck with fire-and-forget writes
- **Global Message Sequencing**: Server-side message ordering ensures consistent operation application across all clients
- **Automatic Conflict Resolution**: Smart merging of concurrent edits with no data loss
- **Session Awareness**: Cursor position preservation during remote edits
- **Remote Cursor Tracking**: See other users' cursor positions in real-time with color-coded labels
- **Optimized Cursor Updates**: Event-driven cursor broadcasting only on deliberate user actions (input, clicks, navigation)
- **No Cursor Feedback Loops**: Programmatic changes don't trigger cursor broadcasts, preventing infinite loops
- **Syntax Highlighting Sync**: Real-time synchronization of syntax highlighting changes across all collaborators
- **User Presence**: Live count of connected collaborators in the header status indicator
- **WebSocket-Based**: Real-time synchronization via Durable Objects with optimized reconnection
- **Durable Object Read Caching**: In-memory content caching for improved real-time performance
- **Checksum Verification**: Automatic content integrity verification during sync

### Security & Privacy
- **Client-Side Encryption**: Zero-knowledge AES-GCM 256-bit encryption
- **Password Protection**: PBKDF2 key derivation with 100,000 iterations
- **Password Verification**: Required password confirmation before removing encryption
- **Encrypted at Rest**: Server never sees plaintext for protected notes
- **SHA-256 Hashing**: Secure password verification without storing passwords
- **Real-Time Collaboration Disabled for Encrypted Notes**: E2E encryption preserved by disabling OT sync

### Note Management
- **Auto-Save**: 500ms debounced automatic saving as you type
- **Inline Custom URLs**: Edit note URLs directly in the header with real-time availability checking
- **URL Copying**: Create new notes with custom URLs, copying all settings (content, syntax, password, expiration)
- **Adaptive ID Generation**: 4-character default IDs with automatic collision detection and length scaling
- **Self-Destructing Notes**: Max view count limits (one-time viewing)
- **Time-Based Expiration**: Set expiration (1 hour, 1 day, 1 week, 1 month)
- **Inactivity-Based Cleanup**: Notes automatically deleted after 90 days of no access
- **Access Tracking**: Last accessed timestamp updated on every view or WebSocket connection
- **Automatic Cleanup**: Cron job runs every 15 minutes to delete expired and inactive notes (fixed export issue)

### Editor Features
- **Syntax Highlighting**: Support for 150+ programming languages via highlight.js
- **Line Numbers**: Synchronized line numbers with scroll
- **Dark/Light Theme**: Theme toggle with persistence
- **Real-Time Status**: Visual connection indicators (green for synced, blue for encrypted)
- **Inline URL Editor**: Edit note URLs directly in the header with pencil icon and real-time availability checking
- **URL Navigation**: "Go to a note" feature for PWA users to navigate without address bar
- **URL Copy**: One-click copy note URL from header (domain/noteId format)
- **Seamless URL Editing**: Dynamic input width with icon-only buttons and borderless styling
- **Conflict Detection**: User-friendly conflict resolution dialogs
- **User Notifications**: Banners for encryption changes, password updates, conflicts, and note deletion
- **Enhanced Error Handling**: Clear error messages for password failures and decryption issues
- **Modular Architecture**: Component-based design with separate hooks for editor, collaboration, and note operations
- **Info Dialog**: Interactive about dialog accessible from the header with app information
- **Clean UI Design**: Borderless input styling with icon-only buttons across all option panels
- **View Mode Support**: Read-only textarea mode for deleted notes with text selection enabled
- **Mobile Optimizations**: Responsive design with fixed input widths and proper overflow handling
- **Consistent Backgrounds**: Unified editor background styling across plain text and syntax highlighting modes

### Smart Features
- **Version Tracking**: Prevents edit conflicts across sessions
- **Automatic Reconnection**: Exponential backoff for WebSocket reconnection with state reset
- **WebSocket State Management**: Proper cleanup and reset when creating new notes after deletion
- **View Counter**: Track how many times a note has been viewed
- **Graceful Degradation**: Falls back to HTTP saves when disconnected

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

### Styling & UI
| Technology | Purpose |
|------------|---------|
| Tailwind CSS | Utility-first CSS framework |
| @tailwindcss/postcss | Tailwind v4 PostCSS plugin |
| @tailwindcss/typography | Beautiful prose styling |
| shadcn-svelte | High-quality component library |
| bits-ui | Headless UI primitives |
| @lucide/svelte | Beautiful icon library |
| clsx | Conditional classnames utility |
| tailwind-merge | Smart Tailwind class merging |
| tailwind-variants | Component variant system |

### Specialized Libraries
| Technology | Purpose |
|------------|---------|
| highlight.js | Syntax highlighting for 150+ languages |
| fast-diff | Efficient text diffing for OT operations |
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
│   │   (SQLite)    │   │  (Per-Note WS)   │ │
│   └───────────────┘   └──────────────────┘ │
└─────────────────────────────────────────────┘
```

### Real-Time Collaboration Flow

1. **Client** connects via WebSocket to Cloudflare Worker
2. **Worker** validates password and upgrades connection to Durable Object
3. **Durable Object** manages session state and broadcasts operations
4. **Operations** are transformed using OT algorithm and applied in-memory
5. **Persistence** occurs periodically (debounced 5s or every 50 operations)
6. **Broadcasts** to all connected clients with transformed operations

### Database Schema

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    password_hash TEXT,
    syntax_highlight TEXT DEFAULT 'plaintext',
    view_count INTEGER DEFAULT 0,
    max_views INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    last_session_id TEXT,
    is_encrypted INTEGER DEFAULT 0,
    last_accessed_at INTEGER  -- Tracks when note was last viewed
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

### Database Commands

```bash
# Create new D1 database
npm run db:create

# Apply migrations locally
npm run db:migrate

# Apply migrations to production
npm run db:migrate:prod
```

### Project Structure

```
yPad/
├── client/                       # Frontend Svelte application
│   ├── components/              # Feature components
│   │   ├── Banners/            # Notification banners
│   │   │   ├── EncryptionDisabledBanner.svelte
│   │   │   ├── EncryptionEnabledBanner.svelte
│   │   │   ├── NoteDeletedBanner.svelte
│   │   │   └── ReloadBanner.svelte
│   │   ├── Dialogs/            # Modal dialogs
│   │   │   ├── ConflictDialog.svelte
│   │   │   ├── InfoDialog.svelte
│   │   │   ├── PasswordDialog.svelte
│   │   │   └── RemovePasswordDialog.svelte
│   │   ├── Editor/             # Editor components
│   │   │   ├── EditorView.svelte
│   │   │   └── LineNumbers.svelte
│   │   ├── Header/             # Header components
│   │   │   ├── AppHeader.svelte
│   │   │   ├── ConnectionStatus.svelte  # WebSocket status indicator
│   │   │   ├── ProtectedBadge.svelte
│   │   │   ├── StatusIndicator.svelte   # Save/sync status indicators
│   │   │   └── UrlDisplay.svelte        # Inline URL editor with copy and navigation
│   │   └── Toolbar/            # Toolbar components
│   │       ├── LanguageSelector.svelte
│   │       ├── OptionsPanel.svelte
│   │       └── PasswordInput.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   └── ui/              # shadcn-svelte components
│   │   │       ├── alert/       # Alert component (banners)
│   │   │       ├── button/      # Button component
│   │   │       ├── combobox/    # Combobox for syntax selection
│   │   │       ├── dialog/      # Dialog/modal component
│   │   │       ├── input/       # Input component
│   │   │       ├── label/       # Label component
│   │   │       ├── popover/     # Popover component
│   │   │       ├── select/      # Select dropdown
│   │   │       └── ...          # Other UI components
│   │   ├── hooks/              # Svelte 5 hooks with state management
│   │   │   ├── useCollaboration.svelte.ts  # Real-time collab logic
│   │   │   ├── useEditor.svelte.ts         # Editor state & operations
│   │   │   ├── useNoteOperations.svelte.ts # Note CRUD operations
│   │   │   ├── useNoteState.svelte.ts      # Note state management
│   │   │   ├── useSecurity.svelte.ts       # Security & encryption
│   │   │   └── useWebSocketConnection.svelte.ts # WebSocket management
│   │   ├── realtime/            # WebSocket & OT client logic
│   │   │   ├── InputEventOperationGenerator.ts  # Cursor-aware OT from InputEvent
│   │   │   ├── OperationGenerator.ts            # fast-diff based OT (for sync)
│   │   │   └── WebSocketClient.ts               # WebSocket client with OT
│   │   ├── stores/              # Svelte stores (theme, etc.)
│   │   ├── utils/               # Utility functions
│   │   └── crypto.ts            # Client-side encryption (AES-GCM)
│   ├── App.svelte               # Main app component (refactored, modular)
│   ├── index.html               # HTML entry point with favicons
│   └── main.ts                  # JS entry point
├── public/                      # Static assets (copied to dist)
│   ├── icons/                   # Favicon icons
│   │   ├── android-chrome-192x192.png
│   │   ├── android-chrome-512x512.png
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-16x16.png
│   │   └── favicon-32x32.png
│   ├── favicon.ico              # Root favicon
│   └── site.webmanifest         # PWA manifest
├── src/                         # Backend Cloudflare Workers
│   ├── durable-objects/
│   │   └── NoteSessionDurableObject.ts  # WebSocket coordinator with OT
│   ├── ot/                      # Operational Transform
│   │   ├── types.ts             # OT type definitions & WebSocket messages
│   │   ├── transform.ts         # OT algorithm implementation
│   │   ├── apply.ts             # Operation application
│   │   └── checksum.ts          # Content integrity verification
│   ├── types.d.ts               # TypeScript type definitions
│   └── index.ts                 # Hono API server & routes
├── dist/                        # Build output (gitignored)
│   ├── client/
│   │   └── index.html           # Built HTML with hashed assets
│   ├── assets/                  # Hashed JS/CSS bundles
│   ├── icons/                   # Copied favicon icons
│   ├── favicon.ico              # Copied favicon
│   └── site.webmanifest         # Copied manifest
├── scripts/                     # Automation scripts
│   ├── dev.ps1                  # Windows dev server script
│   ├── dev.sh                   # Mac/Linux dev server script
│   ├── prod.ps1                 # Windows production deployment
│   └── prod.sh                  # Mac/Linux production deployment
├── migrations/                  # D1 database migrations
│   ├── 0001_initial_schema.sql
│   └── 0002_add_last_accessed_at.sql
├── config/                      # Configuration files
│   └── constants.ts            # Application constants & validation
├── .env.example                 # Example environment config
├── .env                         # Local environment config (gitignored)
├── wrangler.toml                # Cloudflare Workers config
├── vite.config.ts               # Vite build config with publicDir
├── tailwind.config.js           # Tailwind CSS config
└── package.json                 # Dependencies & scripts
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

1. Click the password icon in the header
2. Enter the current password to verify
3. Password is verified before decryption
4. Real-time collaboration is automatically re-enabled

### Configuring Note Options

Click **Options** to set:
- **Syntax Highlighting**: Choose from 150+ languages
- **Password Protection**: Enable/disable with password
- **Max Views**: Limit view count (1-1000 views)
- **Expiration**: Set expiry (1 hour, 1 day, 1 week, 1 month, never)

### Real-Time Collaboration

1. Share your note URL with others
2. Multiple users can edit simultaneously (for non-encrypted notes)
3. Changes appear in real-time with operational transform
4. Conflicts are automatically resolved
5. See other users' cursors with color-coded position indicators
6. Visual status indicators in the header:
   - **Green pulse**: Real-time sync active
   - **User count**: Shows your client ID and `+N` for N other connected users
   - **Blue pulse**: Connected but collaboration disabled (encrypted note)
   - **Red**: Disconnected
7. **Note**: Real-time collaboration is automatically disabled for password-protected notes to preserve end-to-end encryption

### Viewing a Protected Note

1. Open note URL
2. Enter password in dialog
3. Content is decrypted client-side
4. View count increments automatically

## API Reference

### REST Endpoints

#### `GET /api/notes/:id`
Retrieve a note by ID. Updates `last_accessed_at` timestamp.

**Query Parameters**:
- `password` (optional): Password for protected notes

**Response**:
```json
{
  "id": "abc123",
  "content": "Note content (encrypted if protected)",
  "syntax_highlight": "javascript",
  "view_count": 5,
  "max_views": null,
  "expires_at": null,
  "is_encrypted": 0
}
```

**Side Effects**:
- Increments `view_count`
- Updates `last_accessed_at` timestamp

#### `POST /api/notes`
Create a new note. Initializes `last_accessed_at` to current timestamp.

**Body**:
```json
{
  "id": "custom-id",
  "content": "Note content",
  "password": "optional-password",
  "syntax_highlight": "plaintext",
  "max_views": null,
  "expires_in": null
}
```

**Side Effects**:
- Sets `last_accessed_at` to current timestamp

#### `PUT /api/notes/:id`
Update an existing note.

**Body**: Same as POST

#### `DELETE /api/notes/:id`
Delete a note and cleanup Durable Object state.

**Query Parameters**:
- `password` (optional): Required for protected notes

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
ws://localhost:8787/api/notes/:id/ws?password=optional
```

**Side Effects**:
- Updates `last_accessed_at` timestamp when connection is established

#### Message Types

**Sync** (server → client):
```json
{
  "type": "sync",
  "content": "Current note content",
  "version": 42,
  "sessionId": "unique-session-id"
}
```

**Operation** (client → server):
```json
{
  "type": "operation",
  "operation": {
    "type": "insert",
    "position": 10,
    "text": "hello"
  },
  "version": 42,
  "sessionId": "session-id"
}
```

**Operation Broadcast** (server → client):
```json
{
  "type": "operation",
  "operation": {
    "type": "delete",
    "position": 5,
    "count": 3
  },
  "version": 43,
  "sessionId": "other-session-id"
}
```

**Acknowledgment** (server → client):
```json
{
  "type": "ack",
  "version": 43
}
```

**Error** (server → client):
```json
{
  "type": "error",
  "message": "Error description"
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

**Version Update** (server → client):
```json
{
  "type": "version_update",
  "version": 44,
  "message": "Note was updated by another user"
}
```

**Note Deleted** (server → client):
```json
{
  "type": "note_deleted",
  "message": "Note has been deleted"
}
```

**Cursor Update** (client ↔ server):
```json
{
  "type": "cursor_update",
  "clientId": "abc123",
  "position": 42
}
```

**User Joined** (server → client):
```json
{
  "type": "user_joined",
  "clientId": "abc123",
  "connectedUsers": ["abc123", "def456", "ghi789"]
}
```

**User Left** (server → client):
```json
{
  "type": "user_left",
  "clientId": "abc123",
  "connectedUsers": ["def456", "ghi789"]
}
```

**Syntax Update** (client ↔ server):
```json
{
  "type": "syntax_update",
  "syntax": "javascript"
}
```

## Key Features Explained

### Operational Transform (OT)

yPad uses OT for real-time collaboration, not CRDTs. This provides:
- **Character-level precision**: No text duplication or corruption
- **Deterministic conflict resolution**: Same result for all clients
- **Cursor position transformation**: Cursors move correctly during concurrent edits
- **Efficient bandwidth**: Only operations are transmitted, not full state
- **InputEvent-Based Generation**: Operations generated directly from browser InputEvent for accurate cursor tracking
- **Dual Operation Modes**:
  - InputEvent-based for live typing (accurate cursor position)
  - fast-diff based for state reconciliation (WebSocket reconnect sync)

Operations are defined as:
```typescript
type Operation =
  | { type: 'insert', position: number, text: string, clientId: string, version: number }
  | { type: 'delete', position: number, count: number, clientId: string, version: number }
```

### Content Integrity & Self-Healing

yPad includes automatic content verification and recovery:
- **Checksum Verification**: Simple checksum algorithm verifies content integrity after each operation
- **Automatic Detection**: Mismatches detected during sync and operation acknowledgments
- **Graceful Handling**: Silent tracking of mismatches without disrupting user experience
- **Server-Authoritative**: Server content is always considered the source of truth
- **Real-Time Monitoring**: Checksum validation occurs on every operation ACK from server

The checksum system helps detect:
- Network transmission errors
- OT transformation inconsistencies
- State synchronization issues
- Client-server content divergence

### Client-Side Encryption

For password-protected notes:
1. User enters password
2. Password derives encryption key (PBKDF2, 100,000 iterations)
3. Content encrypted with AES-GCM before transmission
4. Encrypted content + password hash sent to server
5. Server stores encrypted content, never sees plaintext
6. On retrieval, server verifies password hash
7. Client decrypts content with user's password
8. **Real-time collaboration is automatically disabled** to maintain E2E encryption
9. Password verification required before removing encryption
10. All connected clients notified when encryption status changes

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

## Performance

- **Edge Network**: Deployed globally via Cloudflare Workers
- **Sub-100ms Latency**: Requests served from nearest edge location
- **Automatic Scaling**: Handles traffic spikes without configuration
- **Durable Objects**: Stateful coordination with global uniqueness
- **Operation Pipelining**: Fire-and-forget D1 writes eliminate ACK-based latency bottleneck
- **Read Caching**: Durable Objects cache content in memory to avoid redundant database reads
- **Debounced Saves**: Reduces database writes by batching operations (5s or 50 operations)
- **Optimized Cursor Updates**: Debounced cursor position updates to reduce WebSocket traffic
- **Efficient Memory Management**: Reduced object allocations in hot paths for better performance
- **Connection Management**: Optimized WebSocket version synchronization and reconnection logic
- **InputEvent Optimization**: Direct operation generation from browser events eliminates diff overhead

## Security Considerations

- **Zero-Knowledge Encryption**: Server never sees plaintext for protected notes
- **HTTPS Only**: All traffic encrypted in transit
- **No Analytics**: Privacy-focused, no tracking
- **Password Hashing**: SHA-256 with salt for verification
- **PBKDF2**: 100,000 iterations for key derivation
- **No Session Cookies**: Stateless authentication via password parameter
- **Input Validation**: Comprehensive validation using centralized constants and patterns
- **Type Safety**: Enhanced TypeScript types throughout the codebase

## Code Quality & Architecture

- **Modular Design**: Refactored from monolithic App.svelte into focused, reusable components
- **Separation of Concerns**: Clear boundaries between UI, state management, and business logic
- **Custom Hooks**: Svelte 5 hooks for editor, collaboration, note operations, security, and WebSocket management
- **Centralized Configuration**: All constants, validation patterns, and security headers in [config/constants.ts](config/constants.ts)
- **Component Library**: Organized components into logical groups (Banners, Dialogs, Editor, Header, Toolbar)
- **Enhanced Documentation**: Comprehensive inline documentation for complex algorithms and workflows
- **Recent Bug Fixes**:
  - Fixed cursor feedback loop in realtime collaboration with event-driven updates
  - Fixed scheduled cron handler export to enable automatic cleanup
  - Fixed editor background consistency between plain text and syntax highlighting modes
  - Improved mobile responsiveness with proper input sizing and overflow handling
  - Enhanced URL editor with borders, shadows, and icon-only buttons for clean UI

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Acknowledgments

- Inspired by [notepad.pw](https://notepad.pw)
- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- UI components from [shadcn-svelte](https://www.shadcn-svelte.com/)
