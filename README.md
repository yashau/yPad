# yPad

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-454%20passed-brightgreen)

[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

A real-time collaborative notepad with end-to-end encryption, built on Cloudflare's edge network.

**Live: [https://yp.pe](https://yp.pe)**

## Features

### Real-Time Collaboration
- **Multi-User Editing**: Multiple users can edit simultaneously
- **Operational Transform**: Character-level conflict resolution
- **Remote Cursors**: See other users' cursor positions
- **User Presence**: Live count of connected collaborators

### Security & Privacy
- **End-to-End Encryption**: AES-GCM 256-bit client-side encryption for password-protected notes
- **Password Protection**: PBKDF2 key derivation (100,000 iterations)
- **Zero-Knowledge**: Server never sees plaintext for protected notes

### Note Management
- **Auto-Save**: Automatic saving as you type
- **Custom URLs**: Set custom note URLs with availability checking
- **Self-Destructing Notes**: Max view count limits
- **Time-Based Expiration**: Set expiration (1 hour to 1 month)
- **Automatic Cleanup**: Expired and inactive notes are deleted

### Editor
- **Syntax Highlighting**: 150+ languages via highlight.js
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
7. **Status Updates** broadcast every 10 seconds with view count and expiration info

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

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Test suites cover:
- API validation and constants
- Operational Transform (OT) algorithms
- WebSocket client behavior
- Cryptography utilities
- Editor and collaboration hooks

### Project Structure

```
yPad/
├── client/                       # Frontend Svelte application
│   ├── components/              # Feature components
│   │   ├── Banners/            # Notification banners
│   │   │   ├── EncryptionDisabledBanner.svelte
│   │   │   ├── EncryptionEnabledBanner.svelte
│   │   │   ├── FinalViewBanner.svelte      # Max views reached warning
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
│   │   │   ├── StatusIndicator.svelte   # Save/sync status indicators
│   │   │   └── UrlDisplay.svelte        # Inline URL editor with copy and navigation
│   │   └── Toolbar/            # Toolbar components
│   │       ├── LanguageSelector.svelte
│   │       ├── MaxViewsInput.svelte     # Max views input with submit
│   │       ├── OptionsPanel.svelte      # Options with live status display
│   │       └── PasswordInput.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   ├── RemoteCursor.svelte      # Remote user cursor display
│   │   │   └── ui/              # shadcn-svelte components
│   │   │       ├── alert/       # Alert component (banners)
│   │   │       ├── button/      # Button component
│   │   │       ├── command/     # Command palette for syntax selection
│   │   │       ├── dialog/      # Dialog/modal component
│   │   │       ├── input/       # Input component
│   │   │       ├── popover/     # Popover component
│   │   │       ├── select/      # Select dropdown
│   │   │       ├── separator/   # Separator component
│   │   │       ├── textarea/    # Textarea component
│   │   │       └── ThemeToggle.svelte   # Dark/light theme toggle
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
│   │   ├── stores/              # Svelte stores
│   │   │   └── theme.svelte.ts  # Theme state management
│   │   ├── utils/               # Utility functions
│   │   │   └── cn.ts            # Class name utility
│   │   ├── crypto.ts            # Client-side encryption (AES-GCM)
│   │   └── utils.ts             # General utilities
│   ├── App.svelte               # Main app component (refactored, modular)
│   ├── app.css                  # Global styles and CSS variables
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
│   │   └── NoteSessionDurableObject.ts  # WebSocket coordinator with OT & status broadcasts
│   ├── ot/                      # Operational Transform
│   │   ├── types.ts             # OT type definitions & WebSocket messages
│   │   ├── transform.ts         # OT algorithm implementation
│   │   ├── apply.ts             # Operation application
│   │   └── checksum.ts          # Content integrity verification
│   ├── types.d.ts               # TypeScript type definitions
│   └── index.ts                 # Hono API server & routes
├── dist/                        # Build output (gitignored)
├── scripts/                     # Automation scripts
│   ├── dev.ps1                  # Windows dev server script
│   ├── dev.sh                   # Mac/Linux dev server script
│   ├── prod.ps1                 # Windows production deployment
│   └── prod.sh                  # Mac/Linux production deployment
├── migrations/                  # D1 database migrations
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_last_accessed_at.sql
│   └── 0003_performance_indexes.sql
├── config/                      # Configuration files
│   └── constants.ts            # Application constants & validation
├── .env.example                 # Example environment config
├── .env                         # Local environment config (gitignored)
├── wrangler.toml                # Cloudflare Workers config
├── vite.config.ts               # Vite build config with publicDir
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

1. Click the lock icon in the header
2. Enter the current password to verify
3. Password is verified before decryption
4. Real-time collaboration is automatically re-enabled

### Configuring Note Options

Click **Options** to set:
- **Syntax Highlighting**: Choose from 150+ languages
- **Password Protection**: Enable/disable with password
- **Max Views**: Set view limit - displays remaining views with reset option
- **Expiration**: Set expiry with live countdown timer and reset option

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
   - **Trash icon**: Note has been deleted
7. **Note**: Real-time collaboration is automatically disabled for password-protected notes to preserve end-to-end encryption

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
  "is_encrypted": false,
  "is_last_view": false
}
```

**Side Effects**:
- Increments `view_count`
- Updates `last_accessed_at` timestamp
- If `is_last_view` is true, note is deleted after response

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
  "seqNum": 0,
  "clientId": "unique-client-id",
  "syntax": "javascript"
}
```

**Operation** (client ↔ server):
```json
{
  "type": "operation",
  "operation": {
    "type": "insert",
    "position": 10,
    "text": "hello",
    "clientId": "client-id",
    "version": 42
  },
  "version": 42,
  "seqNum": 1
}
```

**Acknowledgment** (server → client):
```json
{
  "type": "ack",
  "version": 43,
  "contentChecksum": 12345
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

**Cursor Update** (client ↔ server):
```json
{
  "type": "cursor_update",
  "clientId": "abc123",
  "position": 42,
  "seqNum": 5
}
```

**User Joined** (server → client):
```json
{
  "type": "user_joined",
  "clientId": "abc123",
  "connectedUsers": ["abc123", "def456", "ghi789"],
  "seqNum": 6
}
```

**User Left** (server → client):
```json
{
  "type": "user_left",
  "clientId": "abc123",
  "connectedUsers": ["def456", "ghi789"],
  "seqNum": 7
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

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Acknowledgments

- Inspired by [notepad.pw](https://notepad.pw)
- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- UI components from [shadcn-svelte](https://www.shadcn-svelte.com/)
