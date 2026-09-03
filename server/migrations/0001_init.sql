-- D22: scenes holds the scene JSON document; D10/D11: assets holds
-- uploaded-asset metadata + a blob-storage reference (M6.4 wires the
-- actual blob mechanism — this task only needs the column to exist).
-- No `users`/`sessions` table anywhere (D1) — ownership is scoped by
-- `device_id` alone (D18's `X-Device-Id`, wired up in M6.2).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scenes_device_id_idx ON scenes (device_id);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  format TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_device_id_idx ON assets (device_id);
