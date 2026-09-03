-- D10/D6a: blob storage backed by the same database — the file's bytes
-- live directly in this column, so `storage_key` (M6.1's placeholder for
-- "whatever mechanism M6.4 picks") ends up unused by this choice; kept
-- in the schema, made nullable, in case a future migration to real
-- object storage wants a reference column again.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS data BYTEA NOT NULL DEFAULT ''::bytea;
ALTER TABLE assets ALTER COLUMN storage_key DROP NOT NULL;
