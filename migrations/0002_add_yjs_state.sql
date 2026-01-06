-- Migration: Add Yjs state column for CRDT synchronization
-- This column stores the binary Yjs document state for efficient restoration

ALTER TABLE notes ADD COLUMN yjs_state BLOB;

-- Index for finding notes that need Yjs migration
CREATE INDEX IF NOT EXISTS idx_notes_yjs_state_null ON notes(id) WHERE yjs_state IS NULL;
