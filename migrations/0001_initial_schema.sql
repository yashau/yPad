-- Migration: Initial database schema
-- Consolidated schema for yPad with true E2E encryption

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    syntax_highlight TEXT DEFAULT 'plaintext',
    view_count INTEGER DEFAULT 0,
    max_views INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    last_session_id TEXT,
    is_encrypted INTEGER DEFAULT 0,
    last_accessed_at INTEGER
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_notes_expires_at ON notes(expires_at);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notes_last_accessed_at ON notes(last_accessed_at);

-- Performance indexes for query optimization
-- Composite index for optimistic locking (PUT endpoint)
CREATE INDEX IF NOT EXISTS idx_notes_id_version ON notes(id, version);

-- Partial indexes for cleanup queries (only include non-null rows)
CREATE INDEX IF NOT EXISTS idx_notes_expires_at_notnull ON notes(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_last_accessed_at_notnull ON notes(last_accessed_at) WHERE last_accessed_at IS NOT NULL;

-- Update query planner statistics
ANALYZE notes;
