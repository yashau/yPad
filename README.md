# yPad

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-638%20passed-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)

[![Svelte](https://img.shields.io/badge/Svelte_5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

A real-time collaborative notepad with end-to-end encryption, built on Cloudflare's edge network.

**Live: [https://yp.pe](https://yp.pe)**

## Table of Contents

- [Features](#features)
  - [Real-Time Collaboration](#real-time-collaboration)
  - [Security & Privacy](#security--privacy)
  - [Note Management](#note-management)
  - [Editor](#editor)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Development](#development)
  - [Development Scripts](#development-scripts)
  - [Database Commands](#database-commands)
  - [Testing](#testing)
  - [Project Structure](#project-structure)
- [Deployment](#deployment)
- [Usage](#usage)
  - [Creating a Note](#creating-a-note)
  - [Setting a Custom URL](#setting-a-custom-url)
  - [Adding Password Protection](#adding-password-protection)
  - [Removing Password Protection](#removing-password-protection)
  - [Configuring Note Options](#configuring-note-options)
  - [Real-Time Collaboration](#real-time-collaboration-1)
  - [Viewing a Protected Note](#viewing-a-protected-note)
  - [Final View Handling](#final-view-handling)
- [API Reference](#api-reference)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Protocol](#websocket-protocol)
- [Key Features Explained](#key-features-explained)
  - [Operational Transform (OT)](#operational-transform-ot)
  - [Content Integrity & Self-Healing](#content-integrity--self-healing)
  - [Client-Side Encryption](#client-side-encryption)
  - [Max Views & Expiration](#max-views--expiration)
  - [Automatic Cleanup](#automatic-cleanup)
  - [Rate Limiting](#rate-limiting)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Features

### Real-Time Collaboration
- **Multi-User Editing**: Multiple users can edit simultaneously
- **Operational Transform**: Character-level conflict resolution
- **Remote Cursors**: See other users' cursor positions
- **User Presence**: Live count of connected collaborators

### Security & Privacy
- **True End-to-End Encryption**: AES-GCM 256-bit client-side encryption for password-protected notes
- **Password Never Leaves Browser**: Passwords are used locally for encryption/decryption only - never transmitted to the server
- **Password Protection**: PBKDF2 key derivation (100,000 iterations)
- **Zero-Knowledge**: Server only stores encrypted blobs, never sees plaintext or passwords

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
    content TEXT NOT NULL,              -- Plaintext or encrypted blob
    syntax_highlight TEXT DEFAULT 'plaintext',
    view_count INTEGER DEFAULT 0,
    max_views INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    last_session_id TEXT,
    is_encrypted INTEGER DEFAULT 0,     -- True E2E encryption flag
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
- Operational Transform (OT) algorithms
- WebSocket client behavior
- Cryptography utilities
- Editor and collaboration hooks
- Rate limiting (token bucket, sliding window, configuration)

#### E2E Tests (Playwright)

```bash
# Run all e2e tests
npm run e2e

# Run e2e tests with UI
npx playwright test --ui

# Run specific test suite
npx playwright test e2e/comprehensive-ot.spec.ts
```

E2E test suites cover:

**Alert Banners** (`alert-banners.spec.ts`)
- Encryption enabled/disabled banners
- Note deleted banner
- Password dialog errors
- Final view banner (max views reached)
- Reload banner (encrypted note updated by another user)
- Baseline screenshots (no banners)

**Syntax Highlighting** (`syntax-highlighting.spec.ts`)
- JavaScript, JSON, Python, TypeScript, YAML, SQL highlighting
- Plain text mode (no highlighting)
- Theme permutations (light/dark modes)
- Screenshots for visual regression testing

**E2E Encryption Security** (`e2e-encryption.spec.ts`)
- Verifies passwords are NEVER sent to the server
- Verifies plaintext content never leaves the browser
- WebSocket messages never contain password or plaintext
- Password hash is not sent (true E2E encryption)
- Multiple password attempts don't leak to server

**Real-Time OT** (`realtime-ot.spec.ts`)
- Fast typing with network latency
- Two users typing concurrently
- Rapid insertions and deletions
- Content persistence after fast typing
- Typing during WebSocket reconnection

**Comprehensive OT** (`comprehensive-ot.spec.ts`) - 13 tests
- Race conditions with high latency (client types while PUT in flight)
- Concurrent insertions at different positions
- Concurrent insertions at SAME position (conflict resolution)
- Backspace and Delete key operations
- Word deletion (Ctrl+Backspace) with concurrent edits
- Selection replacement (typing over selection)
- Tab key insertion with concurrent edits
- Rapid fire typing from 3 clients simultaneously
- Enter key (newlines) with concurrent edits
- Cut (Ctrl+X) operation with concurrent edits
- Mixed operations (insert, delete, replace all at once)
- Stress test: 50 rapid operations from 3 clients
- Extreme latency difference (50ms vs 300ms clients)

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
│   │   ├── handlers/            # Message handler modules
│   │   │   ├── messageHandlers.ts  # OT operation & broadcast handlers
│   │   │   ├── types.ts            # Handler context types
│   │   │   └── index.ts            # Re-exports
│   │   ├── NoteSessionDurableObject.ts  # WebSocket coordinator with OT & status broadcasts
│   │   └── RateLimiterDurableObject.ts  # Per-session REST API rate limiting
│   ├── ot/                      # Operational Transform
│   │   ├── types.ts             # OT type definitions & WebSocket messages
│   │   ├── transform.ts         # OT algorithm implementation
│   │   ├── apply.ts             # Operation application
│   │   └── checksum.ts          # Content integrity verification
│   ├── types.d.ts               # TypeScript type definitions
│   └── index.ts                 # Hono API server & routes
├── tests/                       # Vitest unit tests
│   ├── api/                    # API route tests
│   ├── client/                 # Client-side tests (crypto, WebSocket)
│   ├── config/                 # Configuration tests
│   ├── handlers/               # Message handler unit tests
│   ├── hooks/                  # Svelte hook tests
│   ├── ot/                     # Operational Transform tests
│   └── rate-limiting/          # Rate limiting tests
├── e2e/                         # Playwright e2e tests
│   ├── alert-banners.spec.ts   # Alert banner tests
│   ├── comprehensive-ot.spec.ts # Comprehensive OT tests (13 tests)
│   ├── e2e-encryption.spec.ts  # E2E encryption security tests
│   ├── realtime-ot.spec.ts     # Real-time OT collaboration tests
│   ├── syntax-highlighting.spec.ts  # Syntax highlighting tests
│   └── screenshots/            # Generated test screenshots
├── docs/                        # Technical documentation
│   └── OT_IMPLEMENTATION.md    # Detailed OT implementation docs
├── dist/                        # Build output (gitignored)
├── scripts/                     # Automation scripts
│   ├── dev.ps1                  # Windows dev server script
│   ├── dev.sh                   # Mac/Linux dev server script
│   ├── prod.ps1                 # Windows production deployment
│   └── prod.sh                  # Mac/Linux production deployment
├── migrations/                  # D1 database migrations
│   └── 0001_initial_schema.sql  # Consolidated schema
├── config/                      # Configuration files
│   └── constants.ts            # Application constants & validation
├── .env.example                 # Example environment config
├── .env                         # Local environment config (gitignored)
├── wrangler.toml                # Cloudflare Workers config
├── vite.config.ts               # Vite build config with publicDir
├── playwright.config.ts         # Playwright e2e test config
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

yPad uses Operational Transform (OT) for real-time collaborative editing, enabling multiple users to edit the same document simultaneously with automatic conflict resolution.

#### How It Works

When multiple users edit a document at the same time, their changes may conflict. OT resolves these conflicts by mathematically transforming operations so that all users converge to the same final result, regardless of the order in which changes arrive.

**Example**: If User A inserts "hello" at position 5 while User B simultaneously deletes characters 3-7, OT transforms both operations so that:
- User A's insert is adjusted to account for B's deletion
- User B's delete is adjusted to account for A's insert
- Both users end up with identical documents

#### Key Capabilities

- **Character-level precision**: Each keystroke is tracked as an individual operation
- **Deterministic conflict resolution**: All clients arrive at the same result
- **Cursor synchronization**: See other users' cursor positions in real-time
- **Bandwidth efficient**: Only operations (not full content) are transmitted
- **Self-healing**: Content checksums detect and automatically recover from any state drift

#### Architecture

The system uses a **server-authoritative** model with **optimistic updates**:

1. **Optimistic**: When you type, changes appear immediately (no waiting for server)
2. **Server-authoritative**: The server maintains the canonical document state
3. **Transform on conflict**: If your changes conflict with another user's, the server transforms both operations to preserve everyone's intent

#### Dual Tracking System

yPad uses two separate numbering systems for robust synchronization:

- **Operation Version** (persistent): Tracks document revisions, survives reconnections, enables offline conflict detection
- **Sequence Number** (transient): Ensures real-time message ordering for 3+ concurrent users

#### Recovery Mechanisms

- **Checksum verification**: Server sends content checksums with every operation; clients verify their local state matches
- **Replay recovery**: If a client detects divergence, it requests the server's authoritative state and rebuilds locally
- **Gap detection**: Out-of-order messages are buffered; persistent gaps trigger automatic resync

#### Operation Types

```typescript
type Operation =
  | { type: 'insert', position: number, text: string, clientId: string, version: number }
  | { type: 'delete', position: number, length: number, clientId: string, version: number }
```

#### Inspiration

The implementation was inspired by [ot.js](https://github.com/Operational-Transformation/ot.js), but extended significantly to handle:
- WebSocket message ordering for 3+ users (sequence numbers)
- State drift detection and recovery (checksums + replay)
- E2E encryption compatibility (disabling real-time for encrypted notes)
- Deterministic same-position conflict resolution (clientId tie-breaking)

> **Technical Deep Dive**: For comprehensive implementation details including transform algorithms, message protocols, and edge case handling, see [docs/OT_IMPLEMENTATION.md](docs/OT_IMPLEMENTATION.md).

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

Token bucket algorithm for real-time operations:

| Setting | Value | Description |
|---------|-------|-------------|
| Operations per second | 30 | Sustained rate limit |
| Burst allowance | 5,000 | Tokens for paste operations |
| Max message size | 64 KB | Maximum WebSocket message size |

**How it works**:
- Each connection starts with 5,000 tokens (burst allowance)
- Tokens refill at 30 per second
- Each operation consumes 1 token
- Normal typing (5-10 chars/sec) never hits the limit
- Large pastes consume burst tokens but recover quickly

**Violation Handling**:
1. First violations: Warning message sent via WebSocket
2. After 5 violations: Connection closed with code 1008

```json
{"type": "error", "message": "Rate limit exceeded. Please slow down."}
```

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
    OPS_PER_SECOND: 30,
    BURST_ALLOWANCE: 5000,
    MAX_MESSAGE_SIZE: 65536,
  },
  PENALTY: {
    DISCONNECT_THRESHOLD: 5,
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
