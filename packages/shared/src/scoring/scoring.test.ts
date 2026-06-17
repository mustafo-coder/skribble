import { describe, expect, it } from 'vitest';
import {
  classifyGuess,
  DEFAULT_SCORING,
  maskWord,
  normalizeGuess,
  scoreDrawer,
  scoreGuess,
} from './index.js';

describe('scoreGuess', () => {
  it('awards base + full time bonus + first-order bonus when guessed instantly', () => {
    const pts = scoreGuess({
      secondsRemaining: 80,
      totalSeconds: 80,
      guessOrder: 0,
      difficulty: 'EASY',
    });
    // (100 + 250) * 1 + 120
    expect(pts).toBe(470);
  });

  it('decays the time bonus linearly', () => {
    const pts = scoreGuess({
      secondsRemaining: 40,
      totalSeconds: 80,
      guessOrder: 5,
      difficulty: 'EASY',
    });
    // (100 + 125) * 1 + 10
    expect(pts).toBe(235);
  });

  it('applies the difficulty multiplier to base+time only', () => {
    const pts = scoreGuess({
      secondsRemaining: 0,
      totalSeconds: 80,
      guessOrder: 0,
      difficulty: 'HARD',
    });
    // round((100 + 0) * 1.3) + 120
    expect(pts).toBe(250);
  });

  it('clamps negative/overflow remaining time', () => {
    const a = scoreGuess({ secondsRemaining: -5, totalSeconds: 80, guessOrder: 9, difficulty: 'EASY' });
    const b = scoreGuess({ secondsRemaining: 999, totalSeconds: 80, guessOrder: 9, difficulty: 'EASY' });
    expect(a).toBe(100); // no time bonus, no order bonus past array
    expect(b).toBe(350); // full time bonus
  });
});

describe('scoreDrawer', () => {
  it('scales with correct guessers', () => {
    expect(scoreDrawer(3)).toBe(120);
  });
  it('caps at drawerMaxScore', () => {
    expect(scoreDrawer(100)).toBe(DEFAULT_SCORING.drawerMaxScore);
  });
});

describe('maskWord', () => {
  it('masks all letters when no reveals', () => {
    expect(maskWord('cat', 0)).toBe('_ _ _');
  });
  it('preserves spaces', () => {
    expect(maskWord('hot dog', 0)).toBe('_ _ _    _ _ _');
  });
  it('reveals the requested number of letters', () => {
    const masked = maskWord('elephant', 2);
    const revealed = masked.split(' ').filter((c) => c !== '_' && c !== '').length;
    expect(revealed).toBe(2);
  });
});

describe('classifyGuess', () => {
  it('matches exact ignoring case/space/accents', () => {
    expect(classifyGuess('  CAFÉ ', 'cafe')).toBe('correct');
  });
  it('flags single-typo guesses as close', () => {
    expect(classifyGuess('elephnt', 'elephant')).toBe('close');
  });
  it('marks unrelated guesses wrong', () => {
    expect(classifyGuess('banana', 'elephant')).toBe('wrong');
  });
  it('normalizes whitespace', () => {
    expect(normalizeGuess('  hot   dog ')).toBe('hot dog');
  });
});
