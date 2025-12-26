-- Migration: Add last_accessed_at column to track note access
-- This allows cleanup of notes that haven't been viewed in a long time

-- Add last_accessed_at column
ALTER TABLE notes ADD COLUMN last_accessed_at INTEGER;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_notes_last_accessed_at ON notes(last_accessed_at);

-- Initialize last_accessed_at to created_at for existing notes
UPDATE notes SET last_accessed_at = created_at WHERE last_accessed_at IS NULL;
