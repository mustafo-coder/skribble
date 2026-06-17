# Architecture

- [System architecture](#system-architecture)
- [Game state machine](#game-state-machine)
- [Backend architecture](#backend-architecture)
- [Frontend architecture](#frontend-architecture)
- [Database](#database)
- [Redis](#redis)
- [Socket contracts](#socket-contracts)
- [REST API](#rest-api)
- [Drawing sync & traffic optimization](#drawing-sync)
- [Scoring](#scoring)
- [Security & anti-cheat](#security)
- [Scalability](#scalability)

---

## System architecture

```
                                ┌───────────────────────────────────────────────┐
                                │                  Browser (SPA)                  │
                                │  React 19 · Zustand · React Query · Canvas2D    │
                                │  authStore  socketStore  roomStore  gameStore   │
                                └───────────────┬─────────────────┬───────────────┘
                                  HTTPS /api/*   │                 │  WSS /socket  (Socket.IO)
                                                 ▼                 ▼
                                ┌───────────────────────────────────────────────┐
                                │                EDGE NGINX  :80/443              │
                                │   /            → frontend (static SPA)          │
                                │   /api/*       → backend  (REST)                │
                                │   /socket/*    → backend  (WS upgrade)          │
                                │   ip_hash  =  STICKY SESSIONS (per connection)  │
                                └───────┬───────────────────────────────┬────────┘
                                        │  round-robin / ip_hash         │
                          ┌─────────────┴───────────┐       ┌────────────┴─────────────┐
                          ▼                         ▼       ▼                           ▼
                ┌──────────────────┐      ┌──────────────────┐            ┌──────────────────┐
                │  backend node 1  │      │  backend node 2  │   ……       │  backend node N  │
                │ Nest HTTP +      │      │ Nest HTTP +      │            │ Nest HTTP +      │
                │ Socket.IO gw     │      │ Socket.IO gw     │            │ Socket.IO gw     │
                └───┬───────┬──────┘      └───┬───────┬──────┘            └───┬───────┬──────┘
                    │       │                 │       │                       │       │
        Prisma (SQL)│       │ Socket.IO Redis adapter (pub/sub) ── broadcasts fan out cluster-wide
                    │       └─────────────────┴───────────────────────────────┘       │
                    ▼                                  ▼                               ▼
          ┌──────────────────┐               ┌──────────────────────────────────────────┐
          │   PostgreSQL     │               │                  Redis                    │
          │ durable history: │               │  live state (source of truth in-game):    │
          │ users, auth,     │               │  room:{id}  game state · turn secret      │
          │ games, rounds,   │               │  room:code:{code} · presence · sessions   │
          │ words, guesses,  │               │  drawing replay buffer · rate-limit keys  │
          │ scores           │               │  + pub/sub channels for the adapter        │
          └──────────────────┘               └──────────────────────────────────────────┘
```

**Two sources of truth, by design.** PostgreSQL owns durable data (accounts,
auth, finished-game history & stats). Redis owns *live* game state, which mutates
dozens of times per second and must be shared across nodes — putting that in
Postgres would melt it. See [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md#why-redis-for-live-state).

---

## Game state machine

The room is a finite-state machine owned by `GameService` (server-authoritative):

```
            host: game:start (≥2 players)
   ┌────────┐ ───────────────────────────▶ ┌────────────────┐
   │ LOBBY  │                               │ WORD_SELECTION │  drawer picks 1 of N words
   │        │ ◀──────────┐                  │ (15s timeout → │  (timeout → random pick)
   └────────┘   reset    │                  │  random word)  │
        ▲    (after game)│                  └───────┬────────┘
        │                │                          │ word chosen
        │          ┌─────┴──────┐                   ▼
        │          │  GAME_END  │            ┌──────────────┐  drawer draws,
        │          │ leaderboard│            │   DRAWING    │  others guess.
        │          │ + replay   │            │ (drawTime s) │  ends on time-up OR
        │          └─────┬──────┘            └──────┬───────┘  everyone guessed
        │                ▲                          │
        │   last turn of │ all rounds done          ▼
        │   last round   │                   ┌──────────────┐
        └────────────────┴───────────────────│  ROUND_END   │  reveal word,
                  next turn / next round      │  (6s pause)  │  award drawer, show deltas
                                              └──────────────┘
```

A **round** = every connected player draws once (turn order reshuffled each
round). `rounds` (host setting) × player count = total turns.

Phase transitions are scheduled by `GameTimers` (per-room `setTimeout`s) and every
broadcast goes through `GameEmitter` → Socket.IO → Redis adapter, so all players
see transitions regardless of which node they're on.

---

## Backend architecture

NestJS modules, each `@Global()` where cross-cutting:

```
AppModule
├── ConfigModule            zod-validated env, fail-fast at boot
├── ThrottlerModule         global REST rate limiting
├── PrismaModule  (global)  PrismaService  → PostgreSQL
├── RedisModule   (global)  RedisService (client/pub/sub) + RoomStore (live state, locks)
├── AuthModule    (global)  AuthService · TokenService (rotation) · JwtStrategy · guards
├── UsersModule   (global)  profiles, stats, rating
├── WordsModule   (global)  random word selection, custom words
├── RoomsModule   (global)  RoomService — room lifecycle transitions
└── GameModule              GameGateway (sockets) · GameService (FSM) · DrawingRelay · GameTimers · GameEmitter
```

**Request → state flow for a socket event:**

```
client emit ─▶ GameGateway handler
                 │  1. identity from socket.data (trusted, set at handshake)
                 │  2. validate payload (draw-validation / sanitizeText)
                 │  3. rate-limit (RedisService.rateLimit)
                 ▼
            RoomService / GameService
                 │  RoomStore.mutate(roomId, fn)  ← distributed lock (SET NX + Lua)
                 │     read → apply pure transition → write   (atomic across nodes)
                 ▼
            GameEmitter.toRoom(...) ─▶ Socket.IO ─▶ Redis adapter ─▶ all nodes ─▶ clients
```

`RoomStore.mutate()` holds a short per-room lock so two nodes processing events
for the same room serialize their writes — no lost updates, no race on score.

---

## Frontend architecture

Feature-based folders; **Zustand** for client state, **React Query** for server
state (room list, profiles), one **typed Socket.IO** singleton.

```
main.tsx → RouterProvider → AppShell (bootstraps session) → pages

stores/
  authStore     user, access token (memory), refresh (localStorage), login/guest/refresh/bootstrap
  socketStore   socket lifecycle + connection status (for the reconnect banner)
  roomStore     authoritative RoomState snapshot + myPlayerId + derived selectors
  gameStore     transient per-turn UI: turn, word choices, masked word, chat, guessers, results

features/game/useGameConnection.ts
  THE integration point: connects the socket, wires every Server→Client event to
  the stores, resumes the room on reconnect, and returns typed action emitters.

components/
  Canvas ─ CanvasEngine (renderer) + useCanvasInput (pointer capture + batching)
  drawingBridge ─ lets socket 'drawing:update' reach the engine without prop drilling
  ColorPicker · BrushControls · ChatBox · PlayerList · Timer · WordSelector · ScoreBoard · Leaderboard
```

Data-flow is unidirectional: **socket event → store → React re-render**. UI
actions call `useGameConnection` emitters → socket → server → broadcast → store.

---

## Database

8 core tables (+ `RefreshToken`). Full schema with indexes & constraints:
[`apps/backend/prisma/schema.prisma`](../apps/backend/prisma/schema.prisma).

```
User ───1:*─── RefreshToken         rotating tokens; reuse burns the family
  │  │
  │  └──1:* (host) Room              SetNull on user delete (room survives)
  │
  ├──1:*─── RoomPlayer ──*:1── Room  membership (guests too); Cascade with room
  ├──1:*─── Guess                    a user's correct guesses (stats)
  └──1:*─── Score                    a user's per-game finals (stats)

Room ──1:*── Game ──1:*── Round ──*:1── Word
                  │          └──1:*── Guess
                  └──1:*── Score
```

**Relationship rationale**

| Relation | Type | On delete | Why |
| -------- | ---- | --------- | --- |
| User → RefreshToken | 1:* | Cascade | tokens are meaningless without the user |
| User → Room (host) | 1:* | SetNull | a room outlives its host (host can be transferred) |
| Room → RoomPlayer | 1:* | Cascade | membership rows belong to the room |
| RoomPlayer → User | *:1 | SetNull | guests have `userId = null`; keep history if a user is deleted |
| Room → Game | 1:* | Cascade | a room hosts many sequential games |
| Game → Round | 1:* | Cascade | one `Round` = one drawing turn (drawer + word) |
| Round → Word | *:1 | SetNull | word is a shared dictionary entry; snapshot text is also stored |
| Round → Guess | 1:* | Cascade | every guess attempt in that turn |
| Game → Score | 1:* | Cascade | final per-player tally; feeds aggregate User stats |

**Key indexes** (hot paths):
- `Word(language, category, difficulty)` — "give me N random words for this room".
- `Room(status, isPrivate)` — public lobby browser.
- `RefreshToken(family)` — reuse-detection family revocation.
- `Round(gameId, roundNumber, turnIndex)` unique — idempotent turn persistence.
- `Score(gameId, playerId)` unique — one final row per participant.

During a game, rounds/guesses/scores are written to Postgres **only at turn/game
boundaries** (never in the drawing hot loop), so the DB stays cold-path.

---

## Redis

Every key shape lives in [`redis.constants.ts`](../apps/backend/src/redis/redis.constants.ts):

| Key | Type | Purpose | TTL |
| --- | ---- | ------- | --- |
| `room:{roomId}` | string(JSON) | full live `LiveRoom` (FSM, players, scores) | 4h |
| `room:code:{code}` | string | join-code → roomId lookup | 4h |
| `room:{roomId}:turn:secret` | string(JSON) | **the secret word** + choices (never broadcast whole) | turn |
| `room:{roomId}:drawing` | list | recent `DrawOp`s for late-join/reconnect replay (capped 5000) | 30m |
| `rooms:public` | set | lobby browser index | — |
| `session:{userId}` | string(JSON) | reconnect map: user → `{playerId, roomId}` | 24h |
| `lock:room:{roomId}` | string | distributed mutate lock (SET NX PX + Lua release) | 5s |
| `rl:{scope}:{id}` | string | token-bucket counter (guess/chat/draw anti-spam) | window |
| `socket.io#…` | — | adapter pub/sub channels (managed by `@socket.io/redis-adapter`) | — |

The **secret word is a separate key** from the broadcastable room state — it is
structurally impossible to leak it into a `room:updated` payload.

---

## Socket contracts

Strongly typed in [`packages/shared/src/socket/events.ts`](../packages/shared/src/socket/events.ts)
and imported by **both** ends:

```ts
// backend
new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>()
// frontend
io<ServerToClientEvents, ClientToServerEvents>(url)
```

### Client → Server
| Event | Payload | Ack | Notes |
| ----- | ------- | --- | ----- |
| `room:create` | `{ settings }` | `{ room, playerId }` | request/response via ack |
| `room:join` | `{ code }` | `{ room, playerId }` | |
| `room:leave` | — | `void` | |
| `room:settings` | `{ settings }` | `RoomState` | host only |
| `room:kick` / `host:transfer` | `{ playerId }` | `void` | host only |
| `player:ready` | `{ ready }` | — | |
| `game:start` | — | `void` | host, ≥2 players |
| `word:select` | `{ choice }` | — | drawer only |
| `draw:start/move/end/fill` | draw payloads | — | drawer only, **fire-and-forget** |
| `draw:undo` / `draw:clear` | — | — | drawer only |
| `guess:submit` | `{ text }` | — | non-drawer, rate-limited |
| `chat:message` | `{ text }` | — | anti-leak routed |
| `session:resume` | — | `{ room, turn }` | reconnect |

### Server → Client
`room:updated` · `player:joined/left/kicked` · `game:started` · `round:started`
· `word:choices` (drawer only) · `word:assigned` (drawer only) · `drawing:update`
· `drawing:cleared` · `guess:correct` · `guess:wrong` · `chat:message` ·
`timer:tick` · `hint:reveal` · `round:ended` · `leaderboard:update` ·
`game:ended` · `error`.

**Acks** use a discriminated `SocketResult<T> = {ok:true,data} | {ok:false,error}`
so the client gets a typed success/failure instead of racing on a follow-up
broadcast. High-frequency drawing events skip the ack to minimize latency.

---

## REST API

Base path `/api`. JWT (Bearer) required except where marked **public**.

| Method | Route | Auth | Description |
| ------ | ----- | ---- | ----------- |
| POST | `/auth/register` | public | email/username/password → user + tokens (5/min) |
| POST | `/auth/login` | public | → user + tokens (10/min) |
| POST | `/auth/guest` | public | generated nickname → guest user + tokens |
| POST | `/auth/refresh` | public | rotate refresh token → new pair (reuse-detected) |
| POST | `/auth/logout` | public | revoke a refresh token |
| GET | `/auth/me` | yes | current profile |
| GET | `/users/:id` | public | public profile + stats |
| GET | `/users/leaderboard` | public | global rating ladder |
| GET | `/rooms` | public | public room browser |
| GET | `/words/meta` | public | categories + languages for settings UI |
| GET | `/health` | public | liveness/readiness probe |

Room **create/join** is intentionally over WebSocket (not REST): joining is a
stateful, real-time action that immediately needs the live socket bound to the
room.

---

## Drawing sync

The single biggest perf concern. **We never send the canvas bitmap or a packet
per mouse-move.** Three-layer optimization:

1. **Normalized vector ops** — coordinates are `[0,1]`; a `DrawOp` is `start /
   move(points[]) / end / fill / clear / undo`. Every client renders identically
   at any resolution.
2. **Client batching** — `useCanvasInput` accumulates pointer points and flushes
   once per animation frame (`requestAnimationFrame`), using
   `getCoalescedEvents()` for smooth lines with fewer packets. The drawer renders
   locally on every event (zero-latency feel); only transmission is batched.
3. **Server coalescing** — `DrawingRelay` buffers inbound ops per room and emits
   one `drawing:update` (many ops) every **40 ms**, excluding the drawer. This
   caps outbound emits to ~25/s/room no matter how fast the pen moves.

Ops are also appended to a capped Redis list so reconnecting/late-joining players
replay the exact canvas. `undo`/`clear` are ordered ops too, so replay stays
consistent. Rendering: native Canvas 2D (`CanvasEngine`) with ordered history for
undo and raster flood-fill for the bucket tool — see
[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md#canvas-native-vs-fabrickonva).

---

## Scoring

Pure, unit-tested, shared by both ends ([`scoring/index.ts`](../packages/shared/src/scoring/index.ts)):

```
guesserScore = round((baseScore + timeBonus) * difficultyMult) + guessOrderBonus
  baseScore        = 100
  timeBonus        = 250 * (secondsRemaining / totalSeconds)   # decays linearly
  difficultyMult   = EASY 1.0 · MEDIUM 1.15 · HARD 1.3
  guessOrderBonus  = [120, 80, 50, 30, 20, 10][order]          # first guessers win more

drawerScore = min(correctGuessers * 40, 250)                   # rewarded for clarity, capped
```

Everything is in `DEFAULT_SCORING` and accepted as a parameter, so scoring is
**configurable**. The client may *project* scores for UI, but the server always
recomputes — it is the source of truth.

---

## Security

| Threat | Mitigation |
| ------ | ---------- |
| Forged identity / socket spoofing | identity comes only from `socket.data` set at handshake JWT verify; client payloads never carry identity |
| Word leakage (drawer/guessed → guessers) | secret word in a separate Redis key; chat from insiders routed only to the insider channel; correct guesses never echoed as plain text |
| Score manipulation | scores computed server-side in locked `mutate()`; clients can't set them |
| Cheating drawer (drawing while not the drawer) | `assertDrawer()` checks phase + `drawOrder[turnPointer] === socket.data.playerId` |
| Chat/guess spam | Redis token-bucket per player (guess 10/5s, chat 6/5s, draw ~1200/10s) |
| XSS in chat | server strips `<>`/control chars + caps length; React escapes on render |
| Auth brute force | `@nestjs/throttler` (login 10/min, register 5/min per IP) |
| Token theft / replay | refresh-token **rotation + reuse detection**; only SHA-256 hashes stored |
| Malicious draw payloads (OOM/NaN) | `draw-validation` clamps coords, bounds width, validates hex, caps point arrays |
| Transport | Helmet headers, CORS allow-list, WSS at the edge |

---

## Scalability

Target: **10k+ concurrent players**.

- **Stateless nodes.** No backend node holds authoritative game state in process
  memory — it's all in Redis. Any node can serve any event; nodes are cattle.
- **Redis adapter.** `@socket.io/redis-adapter` fans broadcasts across all nodes
  via pub/sub, so `server.to(roomId).emit()` reaches members anywhere.
- **Sticky sessions.** Socket.IO's HTTP handshake + WS upgrade must hit the same
  node, so Nginx uses `ip_hash`. Stickiness is per *connection*, not per *room*
  (the adapter handles cross-node), which keeps balancing even.
- **Horizontal scaling.** `docker compose up --scale backend=N` (or N replicas in
  K8s) behind the edge LB. Postgres scales with read replicas + PgBouncer; Redis
  scales with Cluster (key-tag rooms) or a managed service.
- **Hot-path discipline.** The 40 ms drawing loop touches only Redis (in-memory);
  Postgres is written only at turn/game boundaries.
- **Capacity math.** ~12-player rooms, drawing relay capped at ~25 msgs/s/room →
  10k players ≈ 830 rooms ≈ ~21k outbound msgs/s, comfortably shardable across a
  handful of nodes + one Redis primary (or a small cluster).

**Known scaling caveat — timers.** Turn timers live on the node that advanced the
turn (`setTimeout`). If that node dies mid-turn, the timer is lost. For full HA,
move timers to durable delayed jobs (BullMQ) or Redis key-expiry notifications —
detailed in [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md#timers-local-vs-durable).
