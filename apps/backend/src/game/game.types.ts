import type { GamePhase, PublicPlayer, RoomSettings, WordCategory } from '@skribble/shared';

/**
 * Difficulty as a plain string union (not a TS enum). Prisma generates its
 * `WordDifficulty` as a string-literal union too, so this is structurally
 * compatible with BOTH the Prisma enum and the shared one — avoiding nominal
 * enum-vs-enum clashes at the words/game boundary.
 */
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * Server-internal player record. Superset of the public `PublicPlayer` — adds
 * fields the client must never see (socket binding, exact guess timing) used to
 * drive scoring and reconnection.
 */
export interface LivePlayer extends PublicPlayer {
  socketId: string | null; // current socket; null while disconnected
  guessedAt: number | null; // ms timestamp of correct guess this turn
  guessOrder: number | null; // 0-based order among correct guessers
  disconnectedAt: number | null; // start of reconnect grace window
}

/**
 * The complete live room. Lives in Redis as JSON under `room:{id}`. Mutated only
 * via RoomStore.mutate() under a distributed lock so two server nodes can't
 * clobber each other.
 *
 * IMPORTANT: this struct intentionally does NOT contain the secret word — that
 * is kept in a separate Redis key (`roomTurnSecret`) so it can never leak into
 * a public broadcast by accident.
 */
export interface LiveRoom {
  id: string;
  code: string;
  hostId: string;
  phase: GamePhase;
  settings: RoomSettings;
  players: LivePlayer[];
  currentRound: number; // 1-based; 0 in lobby
  /** Player draw order for the current round (shuffled at game start). */
  drawOrder: string[];
  /** Index into `drawOrder` of the current drawer. */
  turnPointer: number;
  gameId: string | null;
  /** Unix ms the current phase ends (drives server timers + client countdown). */
  phaseEndsAt: number | null;
  /** Words already drawn this game, to avoid repeats. */
  usedWords: string[];
  createdAt: number;
}

/** Secret per-turn data, stored under a separate key. Never broadcast whole. */
export interface TurnSecret {
  word: string;
  difficulty: Difficulty;
  category: WordCategory | null;
  choices: { word: string; difficulty: Difficulty }[];
  /** How many hint letters have been revealed so far. */
  revealedHints: number;
  /** Monotonic draw-op sequence for ordering/validation. */
  drawSeq: number;
}
