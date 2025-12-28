-- Migration: Add performance indexes for query optimization
-- These indexes improve performance for:
-- 1. Optimistic locking (version checking in PUT endpoint)
-- 2. Cleanup queries (cron job deletions)
-- 3. Common WHERE clause patterns

-- Composite index for optimistic locking (PUT endpoint)
-- Helps with: WHERE id = ? AND version = ?
CREATE INDEX IF NOT EXISTS idx_notes_id_version ON notes(id, version);

-- Covering indexes for cleanup queries (partial indexes with WHERE clause)
-- These indexes only include rows where the column IS NOT NULL, making them smaller and faster
-- Helps with: DELETE WHERE expires_at IS NOT NULL AND expires_at <= ?
CREATE INDEX IF NOT EXISTS idx_notes_expires_at_notnull ON notes(expires_at) WHERE expires_at IS NOT NULL;

-- Helps with: DELETE WHERE last_accessed_at IS NOT NULL AND last_accessed_at <= ?
CREATE INDEX IF NOT EXISTS idx_notes_last_accessed_at_notnull ON notes(last_accessed_at) WHERE last_accessed_at IS NOT NULL;

-- Update query planner statistics to use new indexes effectively
ANALYZE notes;
