/**
 * Strongly-typed Socket.IO contract.
 *
 * Both ends import these interfaces:
 *   - backend:  `new Server<ClientToServerEvents, ServerToClientEvents, ..., SocketData>()`
 *   - frontend: `io<ServerToClientEvents, ClientToServerEvents>(url)`
 *
 * Client→Server handlers use an **ack callback** (`Ack<T>`) for request/response
 * flows (create/join), so the client gets a typed success/error result instead
 * of racing on a follow-up broadcast. Pure fire-and-forget streams (drawing)
 * skip the ack to minimize latency.
 */
import type {
  ChatMessage,
  DrawEndPayload,
  DrawMovePayload,
  DrawStartPayload,
  FillPayload,
  LeaderboardEntry,
  RoomSettings,
  RoomState,
  StrokePoint,
  TurnPublicState,
} from '../types/game.js';

/** Discriminated result returned through socket acks. */
export type SocketResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: SocketErrorCode; message: string } };

export type Ack<T> = (res: SocketResult<T>) => void;

export enum SocketErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FULL = 'ROOM_FULL',
  ROOM_IN_PROGRESS = 'ROOM_IN_PROGRESS',
  NOT_HOST = 'NOT_HOST',
  NOT_DRAWER = 'NOT_DRAWER',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_ENOUGH_PLAYERS = 'NOT_ENOUGH_PLAYERS',
  ALREADY_GUESSED = 'ALREADY_GUESSED',
  INTERNAL = 'INTERNAL',
}

// ─── Client → Server payloads ────────────────────────────────────────────────

export interface CreateRoomPayload {
  settings: Partial<RoomSettings>;
}
export interface JoinRoomPayload {
  code: string;
}
export interface ChatPayload {
  text: string;
}
export interface GuessPayload {
  text: string;
}
export interface SelectWordPayload {
  /** index into the offered word choices */
  choice: number;
}
export interface KickPayload {
  playerId: string;
}
export interface TransferHostPayload {
  playerId: string;
}
export interface UpdateSettingsPayload {
  settings: Partial<RoomSettings>;
}

/**
 * Events the client emits. The `Ack` generic encodes the success payload type.
 */
export interface ClientToServerEvents {
  'room:create': (p: CreateRoomPayload, ack: Ack<{ room: RoomState; playerId: string }>) => void;
  'room:join': (p: JoinRoomPayload, ack: Ack<{ room: RoomState; playerId: string }>) => void;
  'room:leave': (ack?: Ack<void>) => void;
  'room:settings': (p: UpdateSettingsPayload, ack?: Ack<RoomState>) => void;
  'room:kick': (p: KickPayload, ack?: Ack<void>) => void;
  'host:transfer': (p: TransferHostPayload, ack?: Ack<void>) => void;

  'player:ready': (p: { ready: boolean }) => void;
  'game:start': (ack?: Ack<void>) => void;
  'word:select': (p: SelectWordPayload) => void;

  // High-frequency drawing stream — no ack, validated server-side.
  'draw:start': (p: DrawStartPayload) => void;
  'draw:move': (p: DrawMovePayload) => void;
  'draw:end': (p: DrawEndPayload) => void;
  'draw:fill': (p: FillPayload) => void;
  'draw:clear': () => void;
  'draw:undo': () => void;

  'guess:submit': (p: GuessPayload) => void;
  'chat:message': (p: ChatPayload) => void;

  /** Resync after reconnect: ask the server to replay current room/turn state. */
  'session:resume': (ack: Ack<{ room: RoomState; turn: TurnPublicState | null }>) => void;
}

// ─── Server → Client payloads ────────────────────────────────────────────────

export interface GameStartedPayload {
  room: RoomState;
}
export interface RoundStartedPayload {
  turn: TurnPublicState;
  room: RoomState;
}
export interface WordChoicesPayload {
  /** Only ever sent to the drawer. */
  choices: { word: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }[];
  /** Unix ms the choice window closes. */
  endsAt: number;
}
export interface DrawingUpdatePayload {
  ops: (
    | ({ type: 'start' } & DrawStartPayload)
    | ({ type: 'move' } & DrawMovePayload)
    | ({ type: 'end' } & DrawEndPayload)
    | ({ type: 'fill' } & FillPayload)
    | { type: 'clear'; seq: number }
    | { type: 'undo'; seq: number }
  )[];
}
export interface GuessCorrectPayload {
  playerId: string;
  username: string;
  /** points the guesser earned */
  points: number;
  /** order they guessed (0-based) */
  order: number;
  /** revealed to the guesser only */
  word?: string;
}
export interface GuessWrongPayload {
  playerId: string;
  close: boolean; // "so close!" hint without leaking the word
}
export interface RoundEndedPayload {
  word: string;
  /** delta points per player this turn */
  results: { playerId: string; username: string; delta: number; total: number }[];
  nextAt: number;
}
export interface GameEndedPayload {
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
}
export interface TimerTickPayload {
  /** seconds remaining in the active phase */
  remaining: number;
  endsAt: number;
}
export interface HintRevealPayload {
  maskedWord: string;
}
export interface ServerErrorPayload {
  code: SocketErrorCode;
  message: string;
}

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  'room:updated': (room: RoomState) => void;
  'player:joined': (p: { playerId: string; username: string }) => void;
  'player:left': (p: { playerId: string; username: string }) => void;
  'player:kicked': (p: { playerId: string }) => void;

  'game:started': (p: GameStartedPayload) => void;
  'round:started': (p: RoundStartedPayload) => void;
  'word:choices': (p: WordChoicesPayload) => void;
  'word:assigned': (p: { word: string }) => void; // drawer-only, after selection

  'drawing:update': (p: DrawingUpdatePayload) => void;
  'drawing:cleared': () => void;

  'guess:correct': (p: GuessCorrectPayload) => void;
  'guess:wrong': (p: GuessWrongPayload) => void;
  'chat:message': (m: ChatMessage) => void;

  'timer:tick': (p: TimerTickPayload) => void;
  'hint:reveal': (p: HintRevealPayload) => void;

  'round:ended': (p: RoundEndedPayload) => void;
  'leaderboard:update': (p: { entries: LeaderboardEntry[] }) => void;
  'game:ended': (p: GameEndedPayload) => void;

  'error': (p: ServerErrorPayload) => void;
}

/** Inter-server events for the Redis adapter (left empty — adapter-managed). */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Per-socket data attached after the auth handshake. Lives on `socket.data`.
 * This is the trusted identity the gateway uses — never trust client payloads
 * for identity.
 */
export interface SocketData {
  userId: string | null; // null => guest
  playerId: string; // stable per session, used as room-scoped id
  username: string;
  avatar: string;
  roomId: string | null;
}
