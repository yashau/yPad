# yPad

A production-ready, real-time collaborative notepad with end-to-end encryption, built on Cloudflare's edge network. Features Google Docs-style real-time collaboration using Operational Transform, client-side encryption, syntax highlighting for 150+ languages, and automatic note lifecycle management.

## Features

### Real-Time Collaboration
- **Multi-User Editing**: Live collaborative editing with multiple users simultaneously
- **Operational Transform**: Character-level conflict-free concurrent editing using OT algorithm
- **Automatic Conflict Resolution**: Smart merging of concurrent edits with no data loss
- **Session Awareness**: Cursor position preservation during remote edits
- **WebSocket-Based**: Real-time synchronization via Durable Objects

### Security & Privacy
- **Client-Side Encryption**: Zero-knowledge AES-GCM 256-bit encryption
- **Password Protection**: PBKDF2 key derivation with 100,000 iterations
- **Encrypted at Rest**: Server never sees plaintext for protected notes
- **SHA-256 Hashing**: Secure password verification without storing passwords

### Note Management
- **Auto-Save**: 500ms debounced automatic saving as you type
- **Custom URLs**: Set custom note IDs with real-time availability checking
- **Self-Destructing Notes**: Max view count limits (one-time viewing)
- **Time-Based Expiration**: Set expiration (1 hour, 1 day, 1 week, 1 month)
- **Automatic Cleanup**: Cron job runs every 15 minutes to delete expired notes

### Editor Features
- **Syntax Highlighting**: Support for 150+ programming languages via highlight.js
- **Line Numbers**: Synchronized line numbers with scroll
- **Dark/Light Theme**: Theme toggle with persistence
- **Real-Time Status**: Connection and save status indicators
- **Conflict Detection**: User-friendly conflict resolution dialogs

### Smart Features
- **Version Tracking**: Prevents edit conflicts across sessions
- **Automatic Reconnection**: Exponential backoff for WebSocket reconnection
- **View Counter**: Track how many times a note has been viewed
- **Graceful Degradation**: Falls back to HTTP saves when disconnected

## Tech Stack

### Platform
- **Cloudflare Workers** - Serverless edge computing
- **Cloudflare Durable Objects** - Stateful WebSocket coordination for real-time sync
- **Cloudflare D1** - Serverless SQLite database at the edge
- **Cloudflare Assets** - Global CDN for static files

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | latest | Lightweight web framework for Workers |
| TypeScript | latest | Type-safe development |
| Wrangler | latest | Cloudflare development & deployment CLI |

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Svelte 5 | latest | Reactive UI framework with Runes |
| Vite | latest | Build tool and dev server |
| TypeScript | latest | Type safety |

### Styling & UI
| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | latest (v4) | Utility-first CSS framework |
| @tailwindcss/postcss | 4.1.18 | Tailwind v4 PostCSS plugin |
| @tailwindcss/typography | latest | Beautiful prose styling |
| shadcn-svelte | latest | High-quality component library |
| bits-ui | 2.14.4 | Headless UI primitives |
| @lucide/svelte | 0.561.0 | Beautiful icon library |
| clsx | latest | Conditional classnames utility |
| tailwind-merge | latest | Smart Tailwind class merging |
| tailwind-variants | 3.2.2 | Component variant system |

### Specialized Libraries
| Technology | Version | Purpose |
|------------|---------|---------|
| highlight.js | latest | Syntax highlighting for 150+ languages |
| fast-diff | 1.3.0 | Efficient text diffing for OT operations |
| @internationalized/date | 3.10.1 | Internationalized date handling |

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
    is_encrypted INTEGER DEFAULT 0
);

CREATE INDEX idx_notes_expires_at ON notes(expires_at);
CREATE INDEX idx_notes_created_at ON notes(created_at);
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

# Create D1 database
npm run db:create

# Copy the database ID from output and update wrangler.toml:
# database_id = "YOUR_DATABASE_ID_HERE"

# Run migrations
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
│   ├── lib/
│   │   ├── components/
│   │   │   └── ui/              # shadcn-svelte components
│   │   ├── realtime/            # WebSocket & OT client logic
│   │   ├── stores/              # Svelte stores (theme, etc.)
│   │   ├── utils/               # Utility functions
│   │   └── crypto.ts            # Client-side encryption
│   ├── App.svelte               # Main app component (1,274 lines)
│   ├── index.html               # HTML entry point
│   └── main.ts                  # JS entry point
├── src/                         # Backend Cloudflare Workers
│   ├── durable-objects/
│   │   └── NoteSessionDurableObject.ts  # WebSocket coordinator
│   ├── ot/                      # Operational Transform
│   │   ├── types.ts             # OT type definitions
│   │   ├── transform.ts         # OT algorithm implementation
│   │   └── apply.ts             # Operation application
│   └── index.ts                 # Hono API server
├── scripts/                     # Automation scripts
│   ├── dev.ps1                  # Windows dev server script
│   ├── dev.sh                   # Mac/Linux dev server script
│   ├── prod.ps1                 # Windows production deployment
│   └── prod.sh                  # Mac/Linux production deployment
├── migrations/                  # D1 database migrations
│   └── 0001_initial_schema.sql
├── .env.example                 # Example environment config
├── wrangler.toml                # Cloudflare Workers config
├── vite.config.ts               # Vite build config
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
5. ✅ Builds the frontend
6. ✅ Deploys to Cloudflare Workers
7. ✅ Restores your local `wrangler.toml`

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
3. A unique 4-character ID is automatically generated
4. Note auto-saves every 500ms

### Setting a Custom URL

1. Click **Custom URL** button
2. Enter desired URL (availability checked in real-time)
3. Click **Set URL** to save

### Adding Password Protection

1. Click **Options** button
2. Toggle **Password Protection**
3. Enter password (client-side encryption)
4. Note content is encrypted before sending to server

### Configuring Note Options

Click **Options** to set:
- **Syntax Highlighting**: Choose from 150+ languages
- **Password Protection**: Enable/disable with password
- **Max Views**: Limit view count (1-1000 views)
- **Expiration**: Set expiry (1 hour, 1 day, 1 week, 1 month, never)

### Real-Time Collaboration

1. Share your note URL with others
2. Multiple users can edit simultaneously
3. Changes appear in real-time
4. Conflicts are automatically resolved
5. Green "Real-time sync active" badge shows connection status

### Viewing a Protected Note

1. Open note URL
2. Enter password in dialog
3. Content is decrypted client-side
4. View count increments automatically

## API Reference

### REST Endpoints

#### `GET /api/notes/:id`
Retrieve a note by ID.

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

#### `POST /api/notes`
Create a new note.

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

## Key Features Explained

### Operational Transform (OT)

yPad uses OT for real-time collaboration, not CRDTs. This provides:
- **Character-level precision**: No text duplication or corruption
- **Deterministic conflict resolution**: Same result for all clients
- **Cursor position transformation**: Cursors move correctly during concurrent edits
- **Efficient bandwidth**: Only operations are transmitted, not full state

Operations are defined as:
```typescript
type Operation =
  | { type: 'insert', position: number, text: string }
  | { type: 'delete', position: number, count: number }
```

### Client-Side Encryption

For password-protected notes:
1. User enters password
2. Password derives encryption key (PBKDF2)
3. Content encrypted with AES-GCM
4. Encrypted content + password hash sent to server
5. Server stores encrypted content, never sees plaintext
6. On retrieval, server verifies password hash
7. Client decrypts content with user's password

### Automatic Cleanup

A cron trigger runs every 15 minutes:
```javascript
// Triggered by: crons = ["*/15 * * * *"]
async scheduled(event, env, ctx) {
  // Delete expired notes
  // Update expiration helps prevent long-running queries
}
```

## Performance

- **Edge Network**: Deployed globally via Cloudflare Workers
- **Sub-100ms Latency**: Requests served from nearest edge location
- **Automatic Scaling**: Handles traffic spikes without configuration
- **Durable Objects**: Stateful coordination with global uniqueness
- **Debounced Saves**: Reduces database writes by batching operations

## Security Considerations

- **Zero-Knowledge Encryption**: Server never sees plaintext for protected notes
- **HTTPS Only**: All traffic encrypted in transit
- **No Analytics**: Privacy-focused, no tracking
- **Password Hashing**: SHA-256 with salt for verification
- **PBKDF2**: 100,000 iterations for key derivation
- **No Session Cookies**: Stateless authentication via password parameter

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

MIT

## Acknowledgments

- Inspired by [notepad.pw](https://notepad.pw)
- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- UI components from [shadcn-svelte](https://www.shadcn-svelte.com/)
