/**
 * Authoritative scoring logic.
 *
 * This module is pure and side-effect-free so it can be unit-tested in
 * isolation AND imported by the frontend to render *projected* scores without
 * ever being the source of truth. The server always recomputes scores; the
 * client only mirrors.
 *
 *   playerScore = baseScore + timeBonus + guessOrderBonus
 *   drawerScore = correctGuessers * drawerMultiplier  (capped)
 */

export interface ScoringConfig {
  /** Flat points for any correct guess. */
  baseScore: number;
  /** Max bonus for guessing instantly; decays linearly to 0 at time-up. */
  maxTimeBonus: number;
  /** Bonus for being among the first to guess; index 0 gets the largest. */
  guessOrderBonus: number[];
  /** Each correct guesser earns the drawer this many points... */
  drawerMultiplier: number;
  /** ...up to this cap, so a full lobby can't inflate the drawer infinitely. */
  drawerMaxScore: number;
  /** Difficulty multiplier applied to the guesser's base+time component. */
  difficultyMultiplier: { EASY: number; MEDIUM: number; HARD: number };
}

export const DEFAULT_SCORING: ScoringConfig = {
  baseScore: 100,
  maxTimeBonus: 250,
  guessOrderBonus: [120, 80, 50, 30, 20, 10],
  drawerMultiplier: 40,
  drawerMaxScore: 250,
  difficultyMultiplier: { EASY: 1, MEDIUM: 1.15, HARD: 1.3 },
};

export interface GuessScoreInput {
  /** Seconds remaining when the player guessed correctly. */
  secondsRemaining: number;
  /** Total seconds allotted to the drawing phase. */
  totalSeconds: number;
  /** 0-based order in which this player guessed (0 = first correct). */
  guessOrder: number;
  difficulty: keyof ScoringConfig['difficultyMultiplier'];
}

/**
 * Compute the points awarded to a guesser. Deterministic given its inputs so
 * the server result can be reproduced and audited.
 */
export function scoreGuess(input: GuessScoreInput, cfg: ScoringConfig = DEFAULT_SCORING): number {
  const { secondsRemaining, totalSeconds, guessOrder, difficulty } = input;

  const clampedRemaining = Math.max(0, Math.min(secondsRemaining, totalSeconds));
  const timeRatio = totalSeconds > 0 ? clampedRemaining / totalSeconds : 0;
  const timeBonus = Math.round(cfg.maxTimeBonus * timeRatio);

  const orderBonus = cfg.guessOrderBonus[guessOrder] ?? 0;

  const multiplier = cfg.difficultyMultiplier[difficulty] ?? 1;
  const core = Math.round((cfg.baseScore + timeBonus) * multiplier);

  return core + orderBonus;
}

/**
 * Compute the drawer's payout for a finished turn. Rewards drawings that get
 * many people to guess, but caps the upside.
 */
export function scoreDrawer(correctGuessers: number, cfg: ScoringConfig = DEFAULT_SCORING): number {
  return Math.min(correctGuessers * cfg.drawerMultiplier, cfg.drawerMaxScore);
}

/**
 * Progressive hint mask. Reveals `revealCount` letters of `word`, keeping the
 * rest as underscores. Spaces are always shown. Used server-side only — the
 * masked string is what gets broadcast.
 */
export function maskWord(word: string, revealCount: number): string {
  const indices = word
    .split('')
    .map((ch, i) => ({ ch, i }))
    .filter(({ ch }) => ch !== ' ');

  // Deterministic reveal order: spread reveals across the word.
  const revealSet = new Set<number>();
  const step = indices.length / Math.max(1, revealCount);
  for (let k = 0; k < revealCount && k < indices.length; k++) {
    const target = indices[Math.floor(k * step)];
    if (target) revealSet.add(target.i);
  }

  return word
    .split('')
    .map((ch, i) => (ch === ' ' ? '  ' : revealSet.has(i) ? ch : '_'))
    .join(' ')
    .trim();
}

/** Normalize a guess for comparison: lowercase, trim, collapse whitespace. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance — used to detect "close" guesses for the "so close!" hint. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

export type GuessResult = 'correct' | 'close' | 'wrong';

/** Classify a guess against the secret word without leaking the word. */
export function classifyGuess(guess: string, secret: string): GuessResult {
  const g = normalizeGuess(guess);
  const s = normalizeGuess(secret);
  if (g === s) return 'correct';
  // "close" if within 1 edit on words >=4 chars (typos), but not a substring leak.
  if (s.length >= 4 && levenshtein(g, s) <= 1) return 'close';
  return 'wrong';
}
