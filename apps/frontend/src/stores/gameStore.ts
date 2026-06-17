import { create } from 'zustand';
import type {
  ChatMessage,
  GameEndedPayload,
  LeaderboardEntry,
  RoundEndedPayload,
  TurnPublicState,
  WordChoicesPayload,
} from '@skribble/shared';

/** Transient, per-turn UI state derived from server events. */
interface GameStoreState {
  turn: TurnPublicState | null;
  /** Word choices offered to THIS client when it's the drawer. */
  wordChoices: WordChoicesPayload | null;
  /** The actual word, revealed only to the drawer (or after round end). */
  myWord: string | null;
  /** Latest masked word ("_ a _ _"), updated by hint reveals. */
  maskedWord: string;
  chat: ChatMessage[];
  /** playerIds that have guessed correctly this turn (for the UI checkmarks). */
  guessedIds: Set<string>;
  roundResult: RoundEndedPayload | null;
  gameResult: GameEndedPayload | null;
  leaderboard: LeaderboardEntry[];

  // mutations driven by socket events
  startTurn: (turn: TurnPublicState) => void;
  setWordChoices: (c: WordChoicesPayload | null) => void;
  setMyWord: (w: string | null) => void;
  setMasked: (m: string) => void;
  addChat: (m: ChatMessage) => void;
  markGuessed: (playerId: string) => void;
  endRound: (r: RoundEndedPayload) => void;
  endGame: (g: GameEndedPayload) => void;
  resetTurn: () => void;
  resetAll: () => void;
}

export const useGameStore = create<GameStoreState>((set) => ({
  turn: null,
  wordChoices: null,
  myWord: null,
  maskedWord: '',
  chat: [],
  guessedIds: new Set(),
  roundResult: null,
  gameResult: null,
  leaderboard: [],

  startTurn: (turn) =>
    set({
      turn,
      maskedWord: turn.maskedWord,
      myWord: null,
      wordChoices: null,
      roundResult: null,
      guessedIds: new Set(),
    }),
  setWordChoices: (wordChoices) => set({ wordChoices }),
  setMyWord: (myWord) => set({ myWord }),
  setMasked: (maskedWord) => set({ maskedWord }),
  addChat: (m) => set((s) => ({ chat: [...s.chat.slice(-200), m] })),
  markGuessed: (playerId) =>
    set((s) => ({ guessedIds: new Set(s.guessedIds).add(playerId) })),
  endRound: (roundResult) => set({ roundResult, wordChoices: null }),
  endGame: (gameResult) => set({ gameResult, leaderboard: gameResult.leaderboard }),
  resetTurn: () => set({ turn: null, myWord: null, maskedWord: '', wordChoices: null }),
  resetAll: () =>
    set({
      turn: null,
      wordChoices: null,
      myWord: null,
      maskedWord: '',
      chat: [],
      guessedIds: new Set(),
      roundResult: null,
      gameResult: null,
      leaderboard: [],
    }),
}));
