-- Migration: Initial database schema
-- Combines all previous migrations into a single file

-- Create notes table
CREATE TABLE IF NOT EXISTS notes (
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notes_expires_at ON notes(expires_at);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);
