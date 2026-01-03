-- Migration: Remove password_hash column
-- Password verification is now handled client-side only (E2E encryption)
-- The is_encrypted column is the only indicator needed

-- D1 supports SQLite 3.35+ which has DROP COLUMN support
ALTER TABLE notes DROP COLUMN password_hash;
