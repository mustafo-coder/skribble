/**
 * Core domain types for the Skribble game.
 *
 * These are transport-agnostic and shared verbatim between the NestJS backend
 * and the React frontend so the two can never drift out of sync.
 */

/** The finite-state-machine phases a room moves through. */
export enum GamePhase {
  /** Players are gathering; host can change settings and start. */
  LOBBY = 'LOBBY',
  /** The drawer is choosing one of N candidate words (timed). */
  WORD_SELECTION = 'WORD_SELECTION',
  /** Active drawing + guessing. */
  DRAWING = 'DRAWING',
  /** Word revealed, scores shown, short interlude before next turn. */
  ROUND_END = 'ROUND_END',
  /** Final leaderboard. */
  GAME_END = 'GAME_END',
}

export enum DrawTool {
  PEN = 'PEN',
  ERASER = 'ERASER',
  FILL = 'FILL',
}

export enum Language {
  EN = 'en',
  RU = 'ru',
  ES = 'es',
  DE = 'de',
  FR = 'fr',
}

export enum WordCategory {
  ANIMALS = 'ANIMALS',
  FOOD = 'FOOD',
  MOVIES = 'MOVIES',
  OBJECTS = 'OBJECTS',
  TECHNOLOGY = 'TECHNOLOGY',
  COUNTRIES = 'COUNTRIES',
  SPORTS = 'SPORTS',
}

/** Difficulty influences the word pool and the scoring multiplier. */
export enum WordDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

/**
 * The host-configurable knobs for a room. Persisted on the Room row and cached
 * in Redis as the live source of truth during a game.
 */
export interface RoomSettings {
  name: string;
  maxPlayers: number; // 2..20
  rounds: number; // total rounds (each round = every player draws once)
  drawTimeSec: number; // seconds per drawing turn
  language: Language;
  categories: WordCategory[];
  isPrivate: boolean;
  customWordsEnabled: boolean;
  customWords: string[];
  /** Reveal hint letters as the timer ticks down. */
  hintsEnabled: boolean;
  /** How many word options the drawer chooses from. */
  wordChoiceCount: number; // typically 3
}

/**
 * A player as visible to *other* players. Never contains the secret word, the
 * actual guess text, or anything that would enable cheating.
 */
export interface PublicPlayer {
  id: string; // room-scoped player id (== socket-stable player id)
  userId: string | null; // null for guests
  username: string;
  avatar: string;
  score: number; // cumulative score this game
  roundScore: number; // points earned this turn (0 until they guess)
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  /** True once this player has guessed the word in the current turn. */
  hasGuessed: boolean;
  /** True for the player currently drawing. */
  isDrawing: boolean;
  /** Final placement, only set at GAME_END. */
  placement?: number;
}

/** Full room snapshot broadcast on `room:updated`. */
export interface RoomState {
  id: string;
  code: string; // short shareable join code
  hostId: string; // playerId of host
  phase: GamePhase;
  settings: RoomSettings;
  players: PublicPlayer[];
  /** 1-based index of the current round, 0 while in lobby. */
  currentRound: number;
  /** Index of the current drawer within `players` for this round. */
  turnIndex: number;
  createdAt: number;
}

/**
 * Per-turn state. Sent to everyone EXCEPT the secret `word`, which is only
 * delivered to the drawer (and the masked pattern to guessers).
 */
export interface TurnPublicState {
  drawerId: string;
  round: number;
  turnIndex: number;
  /** Unix ms when the drawing phase ends. Drives the client countdown. */
  endsAt: number;
  /** Masked word, e.g. "_ _ _ _ _" with revealed hint letters filled in. */
  maskedWord: string;
  wordLength: number;
  /** Category shown as a soft hint. */
  category: WordCategory | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  text: string;
  /** system messages (joins, correct guesses) render differently */
  kind: 'chat' | 'system' | 'correct' | 'close';
  timestamp: number;
}

/** A single placement row for the end-of-game leaderboard. */
export interface LeaderboardEntry {
  playerId: string;
  username: string;
  avatar: string;
  score: number;
  placement: number;
}

// ─── Drawing protocol ────────────────────────────────────────────────────────
// Coordinates are normalized to [0, 1] relative to the canvas so any viewport
// size renders identically. We sync vector operations, never pixel buffers.

export interface StrokePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface DrawStartPayload {
  strokeId: string;
  tool: DrawTool;
  color: string; // hex
  width: number; // normalized line width (0..1 of canvas height)
  point: StrokePoint;
  seq: number; // monotonically increasing per drawer to enforce ordering
}

export interface DrawMovePayload {
  strokeId: string;
  /** Batched points accumulated since the last emit (debounced ~16-40ms). */
  points: StrokePoint[];
  seq: number;
}

export interface DrawEndPayload {
  strokeId: string;
  seq: number;
}

export interface FillPayload {
  point: StrokePoint;
  color: string;
  seq: number;
}

export type DrawOp =
  | ({ type: 'start' } & DrawStartPayload)
  | ({ type: 'move' } & DrawMovePayload)
  | ({ type: 'end' } & DrawEndPayload)
  | ({ type: 'fill' } & FillPayload)
  | { type: 'clear'; seq: number }
  | { type: 'undo'; seq: number };
