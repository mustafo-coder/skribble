# Step-by-Step Implementation Plan

The build order an engineering team would follow. Each phase is independently
shippable/testable and leaves `main` green. Phases map to the modules already in
this repo.

---

## Phase 0 — Foundations (½ day)

1. Monorepo: npm workspaces, `tsconfig.base.json`, Prettier/ESLint, `.env.example`.
2. `docker-compose.dev.yml` (Postgres + Redis) so everyone has identical infra.
3. **`@skribble/shared` first** — domain types, socket event contracts, scoring.
   Unit-test scoring/masking/guess-matching now (pure, no infra). _Gate: shared
   builds + tests green._

## Phase 1 — Persistence & config (½ day)

4. Prisma schema (8 tables + RefreshToken), indexes, relations. `prisma migrate dev`.
5. Seed script for the multilingual word dictionary.
6. `ConfigModule` with **zod env validation** (fail-fast at boot).
7. `PrismaModule`/`PrismaService` with shutdown hooks. _Gate: `prisma db push` +
   seed succeed; health endpoint returns ok._

## Phase 2 — Auth (1 day)

8. `TokenService`: access JWT + **rotating** refresh tokens, families, reuse
   detection (hash-only storage).
9. `AuthService`: register/login (bcrypt), guest generation; `AuthController` with
   throttling; `JwtStrategy` + `JwtAuthGuard` + `@Public()`/`@CurrentUser()`.
10. e2e: register → me → refresh rotation → reuse-detected 403 → guest. _Gate: auth
    e2e green against CI Postgres._

## Phase 3 — Live state layer (1 day)

11. `RedisService` (client + pub/sub) and the **key schema** (`redis.constants.ts`).
12. `RoomStore`: serialized `LiveRoom`, code lookup, secret turn key, drawing
    buffer, sessions, public index, and **`mutate()` with a distributed lock**.
13. Token-bucket `rateLimit()`. _Gate: unit-test the lock serialization + TTLs._

## Phase 4 — Lobby & rooms (1 day)

14. `RoomService`: create (code gen, settings clamp), join (full/reconnect),
    leave, host reassignment, kick, transfer-host, ready, settings update.
15. `RoomsController` (public browser), `WordsService` (random pick + custom),
    `UsersService` (profile/stats/rating).
16. Unit-test the room FSM with an in-memory store fake. _Gate: room.service spec
    green._

## Phase 5 — Realtime gateway & game engine (2–3 days) ⟵ the core

17. `GameGateway`: handshake auth → `socket.data`; wire every client event;
    return-based acks; rate limiting; disconnect grace + `session:resume`.
18. `GameEmitter` (typed broadcast facade) + bind the Redis adapter in `afterInit`.
19. `GameService` state machine: `startGame → beginTurn → selectWord → handleGuess
    → endTurn → advanceTurn → endGame → resetToLobby`, with `GameTimers`.
20. `DrawingRelay` (40 ms server coalescing) + `draw-validation` (clamp/sanitize) +
    drawer-only `assertDrawer`.
21. Persist `Round`/`Guess`/`Score` at boundaries; update `User` stats in a txn.
    _Gate: a full game runs end-to-end via a socket-client integration test._

## Phase 6 — Frontend foundation (1 day)

22. Vite + Tailwind + Router + React Query; `api` client with **silent token
    refresh**; typed `socket` singleton with `emitAck`.
23. Stores: `authStore` (bootstrap/login/guest), `socketStore` (status),
    `roomStore` (snapshot + selectors), `gameStore` (per-turn UI).
24. `AppShell` session bootstrap + `RequireAuth` route gate. _Gate: login/guest →
    lobby works against the live backend._

## Phase 7 — Game UI (2 days)

25. `useGameConnection`: wire every server event → store; reconnect resume; typed
    action emitters.
26. `CanvasEngine` + `useCanvasInput` (pointer capture, rAF batching, flood-fill,
    undo) + `drawingBridge`.
27. Components: ColorPicker, BrushControls, ChatBox, PlayerList, Timer,
    WordSelector, ScoreBoard, Leaderboard.
28. `RoomPage` orchestrating all six phases; Lobby create/join; Profile.
29. Vitest + RTL on stores and components. _Gate: two browsers can play a full
    game together._

## Phase 8 — Hardening & DevOps (1–2 days)

30. Multi-stage Dockerfiles (backend + frontend), entrypoint (migrate/seed),
    `docker-compose.yml`, edge Nginx (sticky + WS upgrade).
31. GitHub Actions: install → build shared → prisma → lint → test (shared/back/
    front) → build → publish images to GHCR.
32. Security pass: Helmet, CORS allow-list, throttler tuning, XSS/anti-leak review.
33. Load test the drawing relay (`docker compose up --scale backend=3`); verify the
    Redis adapter + sticky sessions. _Gate: green CI + images build._

---

## Production deployment strategy

- **Images**: CI publishes `backend`/`frontend` to GHCR tagged with the commit
  SHA + `latest`. Deploys pin the SHA.
- **Topology**: edge LB (Nginx/ALB) with sticky sessions → N stateless backend
  replicas → managed Postgres (+ read replicas, PgBouncer) → managed Redis (or
  Cluster with room key-tags).
- **Migrations**: run `prisma migrate deploy` as a one-shot job *before* rolling
  the new backend (never `db push` in prod).
- **Rolling deploys**: backends drain on `SIGTERM` (Nest shutdown hooks close the
  DB pool); the reconnect grace window + `session:resume` keep players in their
  game across a node restart.
- **Observability**: add request/socket metrics (Prometheus), structured logs, and
  Redis/PG dashboards; alert on adapter pub/sub lag and lock contention.
- **Secrets**: JWT secrets and DB/Redis URLs from a secrets manager, never baked
  into images.
- **Scaling triggers**: CPU + active-socket count per node; scale backend
  horizontally, Redis vertically/Cluster, Postgres via replicas.

---

## What a follow-up iteration would add

- Durable timers (BullMQ) to remove the single-node turn-timer caveat.
- httpOnly-cookie refresh tokens + CSRF tokens.
- Spectator mode, friend lists, ranked matchmaking, word-vote/like.
- Per-region Redis + Postgres for global latency.
- Guest-account reaper cron; word-list moderation tooling.
