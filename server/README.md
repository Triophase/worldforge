# Worldforge — backend

Node.js + TypeScript + Postgres API (D6/D6a). Lives in this sibling
directory to `src/` so the Vite frontend build never bundles it (spec
§32). No accounts/sessions/auth (D1) — ownership is scoped by an
anonymous per-device id (`X-Device-Id`, D18, wired up in `M6.2`).

## Setup

```sh
cd server
npm install
cp .env.example .env   # edit if not using the default docker-compose values
docker-compose up -d   # starts Postgres on :5432
npm run migrate        # creates the scenes/assets tables
npm run dev             # starts the API on :3001, independent of the frontend
```

`DATABASE_URL` is the only required environment variable (`.env.example`).
`PORT` defaults to `3001`.

## Scripts

- `npm run dev` — starts the API with hot reload (`tsx watch`).
- `npm run build` — type-checks and compiles to `dist/`.
- `npm start` — runs the compiled `dist/index.js` (production).
- `npm run migrate` — applies any not-yet-applied SQL files under
  `migrations/`, tracked in a `schema_migrations` table. Safe to run
  repeatedly — already-applied migrations are skipped, never reapplied.
- `npm test` — runs the test suite against a real local Postgres (D36 —
  never a mock). Point `DATABASE_URL` at a real reachable database first
  (the `docker-compose` instance above works).

## Schema

- `scenes` — one row per saved scene: `id`, `device_id` (owner),
  `name`, `document` (JSONB, D22's scene JSON), `created_at`,
  `updated_at`. CRUD endpoints land in `M6.3`.
- `assets` — one row per uploaded asset's metadata + a blob-storage
  reference (`storage_key`): `id`, `device_id` (owner), `filename`,
  `format`, `file_size`, `storage_key`, `created_at`. The actual blob
  storage mechanism and upload endpoint land in `M6.4`.
