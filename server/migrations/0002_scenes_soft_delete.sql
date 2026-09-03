-- D17: deletion must be distinguishable from "never existed" on a
-- subsequent GET — a hard DELETE can't express that distinction, so
-- deletion is a soft marker instead.
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
