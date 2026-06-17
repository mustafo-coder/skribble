# 🎨 Skribble — Real-Time Multiplayer Drawing & Guessing Game

A production-grade Skribbl.io clone. Players create rooms, take turns drawing a
secret word on a shared canvas, and race to guess each other's drawings for
points across multiple rounds.

Built as a **TypeScript monorepo** with a strongly-typed contract shared between
a NestJS + Socket.IO backend and a React 19 frontend, backed by PostgreSQL +
Redis, and shipped with Docker, Nginx, and GitHub Actions.

> **The server is the single source of truth.** Clients only render state the
> server computes — scores, the secret word, turn order, and timers can never be
> set by a client payload.

---

## ✨ Features

- **Auth** — email/password with JWT access + **rotating refresh tokens** (reuse
  detection), plus zero-friction **guest mode** with generated nicknames.
- **Lobby** — create/join/leave rooms, invite by URL, public room browser,
  host controls (kick, transfer host, change settings, start).
- **Full game loop** — drawer selection → timed word choice → real-time drawing →
  guessing → round scoring → next round → final leaderboard → replay.
- **Optimized drawing sync** — normalized vector ops, client-side point batching,
  server-side 40 ms coalescing, flood-fill, undo, clear, and reconnect replay.
- **Anti-cheat & security** — server-authoritative scoring, word never leaves the
  server for guessers, chat anti-leak routing, rate limiting, XSS sanitization,
  socket payload validation, JWT verification on the WS handshake.
- **Reconnect** — disconnect grace window keeps your slot; `session:resume`
  replays room + turn + canvas.
- **Scales horizontally** — Socket.IO Redis adapter + Nginx sticky sessions.
- **Responsive** — works on desktop and touch devices (pointer events).

---

## 🧱 Tech Stack

| Layer        | Tech                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, Zustand, React Router, React Query, native Canvas 2D |
| **Backend**  | Node.js, NestJS, TypeScript, Socket.IO, PostgreSQL, Prisma, Redis (ioredis) |
| **Shared**   | `@skribble/shared` — socket contracts, domain types, scoring (pure)     |
| **Infra**    | Docker, Docker Compose, Nginx, GitHub Actions                           |

---

## 📁 Repository Layout

```
skribble/
├── package.json                 # npm workspaces root
├── tsconfig.base.json
├── docker-compose.yml           # full stack (postgres, redis, backend, frontend, nginx)
├── docker-compose.dev.yml       # infra only (run apps on host)
├── nginx/nginx.conf             # edge reverse proxy + sticky-session LB
├── .github/workflows/ci.yml     # build · test · docker publish
├── docs/
│   ├── ARCHITECTURE.md          # diagrams, DB, sockets, REST, scaling
│   ├── DESIGN-DECISIONS.md      # every tradeoff, justified
│   └── IMPLEMENTATION-PLAN.md   # step-by-step build order
│
├── packages/shared/             # ── the contract both ends import ──
│   └── src/
│       ├── types/game.ts        # GamePhase, RoomState, DrawOp, players…
│       ├── types/dto.ts         # REST DTOs
│       ├── socket/events.ts     # ClientToServerEvents / ServerToClientEvents
│       ├── scoring/index.ts     # pure scoring + word masking + guess matching
│       └── constants.ts
│
├── apps/backend/                # ── NestJS API + realtime gateway ──
│   ├── prisma/schema.prisma     # Users, Rooms, RoomPlayers, Games, Rounds, Words, Guesses, Scores
│   ├── prisma/seed.ts           # multilingual word dictionary
│   └── src/
│       ├── main.ts · app.module.ts · health.controller.ts
│       ├── config/              # zod-validated env
│       ├── prisma/ · redis/     # PrismaService · RedisService + RoomStore (live state)
│       ├── auth/                # JWT + rotating refresh, guards, strategies, guest
│       ├── users/ · words/      # profiles/stats · dictionary
│       ├── rooms/               # room lifecycle (create/join/host mgmt)
│       └── game/                # GameService (FSM) · GameGateway (sockets) · DrawingRelay · timers
│
└── apps/frontend/               # ── React SPA ──
    └── src/
        ├── stores/              # authStore · socketStore · roomStore · gameStore
        ├── lib/                 # api (token refresh) · socket (typed)
        ├── components/          # Canvas · ColorPicker · BrushControls · ChatBox · Leaderboard · Timer · PlayerList · WordSelector · ScoreBoard
        └── features/            # auth · lobby · room (game) · profile
```

---

## 🚀 Quick Start

### Option A — everything in Docker (one command)

```bash
cp .env.example .env          # then edit the JWT secrets
docker compose up --build
# open http://localhost
```

This brings up Postgres, Redis, the backend (auto-runs `prisma db push` + seeds
words on boot), the built frontend, and the edge Nginx on **:80**.

Scale the backend and watch sticky sessions + the Redis adapter work:

```bash
docker compose up --build --scale backend=3
```

### Option B — local dev (hot reload)

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d     # just Postgres + Redis
npm install                                        # install all workspaces
npm run build -w @skribble/shared                  # build the shared contract once
npm run db:migrate:dev -w @skribble/backend        # create + apply migrations
npm run db:seed -w @skribble/backend               # seed words
npm run dev                                         # backend :3000 + frontend :5173
# open http://localhost:5173
```

---

## 🧪 Tests

```bash
npm test                              # all workspaces
npm run test -w @skribble/shared      # pure scoring/masking/guess-matching (no infra)
npm run test -w @skribble/backend     # unit (room FSM, draw validation)
npm run test:e2e -w @skribble/backend # auth lifecycle (needs Postgres + Redis)
npm run test -w @skribble/frontend    # Vitest + React Testing Library
```

The shared package is fully verified (compiles + 13 passing tests). CI runs the
full matrix against ephemeral Postgres/Redis services.

---

## 📚 Documentation / Deliverables

| # | Deliverable | Where |
| - | ----------- | ----- |
| 1 | Folder structure | this file |
| 2 | System architecture diagram (ASCII) | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#system-architecture) |
| 3 | Database schema | [prisma/schema.prisma](apps/backend/prisma/schema.prisma) · [explained](docs/ARCHITECTURE.md#database) |
| 4 | Socket event contracts | [packages/shared/src/socket/events.ts](packages/shared/src/socket/events.ts) · [explained](docs/ARCHITECTURE.md#socket-contracts) |
| 5 | API endpoints | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#rest-api) |
| 6 | Frontend architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#frontend-architecture) |
| 7 | Backend architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#backend-architecture) |
| 8 | Prisma schema | [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma) |
| 9 | Zustand stores | [apps/frontend/src/stores](apps/frontend/src/stores) |
| 10 | Docker setup | [docker-compose.yml](docker-compose.yml) · Dockerfiles |
| 11 | CI/CD pipeline | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| 12 | Implementation plan | [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) |
| 13 | Critical code snippets | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (inline) |
| 14 | Design decisions & tradeoffs | [docs/DESIGN-DECISIONS.md](docs/DESIGN-DECISIONS.md) |

---

## ⚖️ License

MIT — see headers. Built as a reference architecture for production realtime games.
