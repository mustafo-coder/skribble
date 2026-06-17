# Design Decisions & Tradeoffs

Every non-obvious choice, the alternatives considered, and why. This is the
"explain your reasoning" deliverable.

---

## Monorepo with a shared contract package

**Decision.** npm workspaces with `@skribble/shared` holding the Socket.IO event
interfaces, domain types, and pure scoring logic, imported by both apps.

**Why.** A realtime game lives or dies on client/server agreement about message
shapes. A single typed contract means a breaking change to an event is a *compile
error on both ends*, not a runtime desync discovered in production. Scoring lives
here too so the client can render projected points using the exact server formula.

**Tradeoff.** Slightly more build orchestration (shared must build first).
Mitigated by Vite/tsc path aliases in dev and ordered builds in CI/Docker.

---

## Why Redis for live state (not Postgres, not in-memory)

**Decision.** Redis is the source of truth for live rooms/games; Postgres stores
durable history.

**Why not Postgres?** Live state mutates many times per second (every guess,
score change, phase tick). That write rate against a relational DB with ACID
guarantees is wasteful and won't scale; none of it needs durability — a crashed
room is fine to lose.

**Why not in-process memory?** It wouldn't survive horizontal scaling — players
of one room may connect to different nodes. State must be shared.

**Tradeoff.** Redis isn't durable by default; a Redis failure drops in-flight
games. Acceptable (games are ephemeral, ~minutes); enable AOF (we do) for
best-effort recovery, and Postgres still has the finished-game record.

---

## Concurrency: per-room distributed lock vs. sticky-by-room routing

**Decision.** `RoomStore.mutate()` wraps every read-modify-write in a short Redis
lock (`SET NX PX` + Lua compare-and-delete).

**Alternative.** Route *all* events for a room to one owning node (sticky by
room), giving single-threaded access with no lock.

**Why the lock.** Sticky-by-room needs a room→node directory, rebalancing on node
death, and a custom router — significant complexity. With Nginx `ip_hash` we get
sticky-by-*connection* for free (which Socket.IO needs anyway), and the lock makes
cross-node room writes safe without any room-affinity machinery. Locks are held
only for an in-memory transition (sub-ms), so contention is negligible.

**Tradeoff.** A lock per mutation is extra Redis round-trips. Fine at our write
rate; the drawing hot loop deliberately does **not** take the lock (it appends to
a list and broadcasts).

---

## Canvas: native Canvas 2D vs. Fabric/Konva

**Decision.** Native Canvas 2D via a small `CanvasEngine`, rather than Fabric.js or
Konva.js.

**Why.** The brief lists Fabric/Konva, but the wire protocol drove the choice:
- We sync a stream of **vector ops in normalized coordinates**, not a scene graph.
  Replaying thousands of points/turn as retained-mode nodes (Konva `Line`, Fabric
  paths) is heavier than stroking a 2D context directly.
- The **fill/bucket tool** needs raster flood-fill on the pixel buffer — awkward in
  a retained-mode scene graph (you'd bolt on a separate raster layer anyway).
- **Deterministic ordered replay** (undo + late-join) is trivial when we own the
  op list ourselves.

**Tradeoff.** We hand-roll rendering (strokes, flood-fill, history). It's ~200
focused lines and fully testable. If we later needed draggable/selectable objects
(shapes, text boxes), Konva would earn its keep — the `CanvasEngine` interface
isolates that swap behind one class.

---

## Drawing traffic: client batch + server coalesce

**Decision.** Two layers of batching (rAF on the client, 40 ms relay on the
server) over normalized vector ops; never send the bitmap.

**Why.** A naive "emit per mousemove, broadcast to each viewer" is O(viewers ×
moves) — the classic way to melt a drawing game. Batching caps outbound to
~25 msg/s/room regardless of pen speed while keeping the drawer's local render at
full frame rate. See [ARCHITECTURE.md](ARCHITECTURE.md#drawing-sync).

**Tradeoff.** Up to ~40 ms of added latency for *viewers* (not the drawer). Imper-
ceptible for watching someone draw; a worthwhile trade for the bandwidth win.

---

## Timers: local `setTimeout` vs. durable jobs

**Decision (current).** `GameTimers` schedules turn/phase timers with
`setTimeout` on the node that advanced the turn.

**Why.** Simple, zero-dependency, and correct as long as the node lives. Broadcasts
still reach all nodes via the adapter, so only the *scheduling* is node-local.

**Tradeoff / caveat.** If the owning node dies mid-turn, that turn's timer is lost
(the game can stall on that turn). For production HA, replace with **BullMQ delayed
jobs** or **Redis keyspace-expiry notifications** so any node can pick up the fire.
The `GameTimers` interface is small and isolated to make that swap localized.

---

## Auth: rotating refresh tokens with reuse detection

**Decision.** Short-lived access JWT (15 min, stateless) + long-lived refresh
token that **rotates** on every use, grouped by a `family`. Replay of a revoked
token revokes the whole family. Only SHA-256 hashes are stored.

**Why.** This is the OWASP-recommended pattern. Access tokens stay stateless (fast
WS handshake verification, no DB hit); refresh tokens get the security of
server-side revocation and theft detection. Storing hashes means a DB leak doesn't
expose usable tokens.

**Tradeoff.** A DB write per refresh and a refresh-token table to prune. Cheap, and
the security win is large. Access token in memory + refresh in `localStorage` is a
pragmatic XSS/UX balance; httpOnly-cookie refresh is a hardening upgrade (needs CSRF
handling) noted for later.

---

## Guest mode as real (ephemeral) users

**Decision.** Guests get a real `User` row (`isGuest = true`, no email/password)
and the same JWT flow.

**Why.** One code path for identity, membership, guesses, and scores — guests
appear in history and leaderboards-of-the-moment without special-casing. 

**Tradeoff.** Guest rows accumulate; a periodic reaper should prune guest accounts
with no recent activity (cron job — not included).

---

## Chat vs. guess on one input + anti-leak routing

**Decision.** During `DRAWING`, a still-guessing player's input is a `guess:submit`;
the drawer and already-correct players send `chat:message` that is delivered **only
to the insider channel** (drawer + correct guessers). Wrong guesses are broadcast
as chat; correct ones are hidden and announced ("X guessed the word!"); close ones
get a private "so close!".

**Why.** This is the skribbl behavior and it's a real anti-cheat measure: without
insider-only routing, a guessed player could just type the word in chat. The server
enforces it; the client UI only chooses which event to emit.

---

## Word selection: `ORDER BY random()`

**Decision.** Pick candidate words with `ORDER BY random() LIMIT n*3` filtered by
language/category, blended with custom words.

**Why.** Dead simple and perfectly adequate for a dictionary of thousands. Custom
words take priority (room-owner intent), then dictionary fill, then a hard-coded
fallback so a turn can *always* start.

**Tradeoff.** `ORDER BY random()` is O(table) — bad for millions of rows. At that
scale switch to keyset sampling or a precomputed shuffled pool in Redis. Documented
in [`words.service.ts`](../apps/backend/src/words/words.service.ts).

---

## State management split: Zustand + React Query

**Decision.** Zustand for realtime/client state (room, game, socket, auth); React
Query for request/response server state (room list, profiles).

**Why.** Realtime state is *pushed* (socket events), not fetched — React Query's
fetch/cache/invalidate model fits it poorly, while Zustand's tiny imperative store
is a perfect sink for `socket.on(...)` handlers. Genuinely fetched data (lobby
list, profiles) gets React Query's caching/refetch for free. Right tool per job.

**Tradeoff.** Two state libraries. The boundary is crisp (pushed vs. pulled), so
the cognitive cost is low.

---

## Persistence timing: write at boundaries, not in the loop

**Decision.** Postgres rows for `Round`/`Guess`/`Score` are written at turn end and
game end, never during drawing.

**Why.** Keeps the relational DB entirely off the hot path. Live scores live in
Redis; the durable trail is reconstructed at safe points.

**Tradeoff.** If a node crashes mid-turn, that turn's history may be lost (the live
Redis state and game continue from another node, but the unwritten `Round` row is
gone). Acceptable for a casual game; a write-ahead to Redis Streams could close the
gap if needed.
