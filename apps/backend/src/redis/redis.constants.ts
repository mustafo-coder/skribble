/**
 * Centralized Redis key schema. Keeping every key shape in one file makes the
 * data model auditable and prevents typo-driven key fragmentation.
 *
 * Key map (see docs/ARCHITECTURE.md §Redis):
 *   room:{roomId}                 HASH   serialized live RoomState (+ secret turn data)
 *   room:code:{code}              STRING roomId  (join-code -> roomId lookup)
 *   room:{roomId}:players         ZSET   playerId -> joinOrder (ordering + membership)
 *   room:{roomId}:drawing         LIST   recent DrawOps for late-join/reconnect replay
 *   game:{gameId}                 HASH   live game aggregate (scores, turn pointer)
 *   player:{playerId}             HASH   { socketId, roomId, userId, username, avatar }
 *   session:{userId}              STRING playerId  (reconnect: user -> live player)
 *   presence:{roomId}             ZSET   playerId -> lastSeen (heartbeat for disconnect)
 *   rl:{scope}:{id}               STRING token-bucket counter (rate limiting)
 */
export const RedisKeys = {
  room: (roomId: string) => `room:${roomId}`,
  roomByCode: (code: string) => `room:code:${code}`,
  roomPlayers: (roomId: string) => `room:${roomId}:players`,
  roomDrawing: (roomId: string) => `room:${roomId}:drawing`,
  /** Secret per-turn payload (the word!) — separate key, never broadcast. */
  roomTurnSecret: (roomId: string) => `room:${roomId}:turn:secret`,
  game: (gameId: string) => `game:${gameId}`,
  player: (playerId: string) => `player:${playerId}`,
  session: (userId: string) => `session:${userId}`,
  presence: (roomId: string) => `presence:${roomId}`,
  rateLimit: (scope: string, id: string) => `rl:${scope}:${id}`,
  /** Pub/sub channels for the Socket.IO Redis adapter live under socket.io#... */
} as const;

/** TTLs (seconds) for ephemeral keys so a crashed server can't leak state forever. */
export const RedisTtl = {
  room: 60 * 60 * 4, // rooms self-expire after 4h of inactivity
  drawingBuffer: 60 * 30,
  player: 60 * 60,
  session: 60 * 60 * 24,
  reconnectGrace: 30, // seconds a disconnected player keeps their slot
} as const;
