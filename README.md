# Worldforge

A browser-based, real-time-physics CAD/simulation tool: place built-in
shapes and mechanical parts (or upload your own `.glb`/`.gltf`/`.stl`/
`.obj` models), connect them with joints, and simulate the result with
[Rapier](https://rapier.rs) physics — all client-side, with an optional
backend for saving, loading, and sharing scenes.

The **frontend** (this directory) is a Vite + React + Three.js app and
is fully usable entirely on its own — placing objects, editing physics,
creating joints, and running the simulation never depend on a backend
being present. The **backend** (`server/`, a separate Node.js/Postgres
project) adds persistence: saving a scene, loading it back later, and
sharing it via a link. Without the backend running, everything except
Save/Load/Share/Upload-persistence still works normally; those specific
actions show a "couldn't reach the server" message instead of failing
silently.

## Frontend

Requires Node.js.

```sh
npm install
npm run dev
```

Opens the app at **http://localhost:5173** with hot reload.

Other scripts:

- `npm run build` — type-checks and produces a production build in
  `dist/`.
- `npm run preview` — serves the `dist/` build produced by `npm run
  build`, for a quick local sanity check of the production bundle.
- `npm run lint` — runs [oxlint](https://oxc.rs/) over the source tree.
- `npm test` — runs the frontend test suite ([Vitest](https://vitest.dev/)
  + React Testing Library, jsdom environment). No backend or database
  needed for these tests.

## Backend

Requires Node.js, Docker (for the dev/test Postgres instance), and the
Docker daemon to be reachable by your user (see your platform's Docker
docs if `docker ps` fails with a permissions error).

```sh
cd server
npm install
cp .env.example .env       # defaults already match the docker-compose setup below
docker-compose up -d       # starts Postgres on :5432
npm run migrate            # creates the scenes/assets tables
npm run dev                # starts the API on :3001
```

Confirm it's up:

```sh
curl http://localhost:3001/health
```

The backend is a separate process from the frontend — run both `npm
run dev` commands (frontend and backend) at the same time, in two
terminals, to get the full app with Save/Load/Share/Upload persistence
working. The frontend talks to `http://localhost:3001` by default (no
extra configuration needed for local dev); override this by setting
`VITE_API_BASE_URL` before starting the frontend's own `npm run dev` if
the backend runs somewhere else.

Other scripts (run from inside `server/`):

- `npm run build` — type-checks and compiles to `server/dist/`.
- `npm start` — runs the compiled `server/dist/index.js` (the
  production entry point, after `npm run build`).
- `npm run migrate` — applies any not-yet-applied SQL files under
  `server/migrations/`. Safe to run repeatedly.
- `npm test` — runs the backend test suite against a real local
  Postgres (never a mock) — point `DATABASE_URL` at a reachable
  database first; the `docker-compose` instance above works.

See `server/README.md` for the backend's own schema/architecture notes.

## Project layout

- `src/` — the frontend (Vite + React + Three.js). Never imports
  anything from `server/`.
- `server/` — the backend (Node.js + Express + Postgres), a sibling
  project with its own `package.json`/`node_modules`/`tsconfig.json`.
  Never bundled into the frontend's `dist/` build.
