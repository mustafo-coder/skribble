import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import type { TurnPublicState } from '@skribble/shared';
import { WordCategory } from '@skribble/shared';

const turn: TurnPublicState = {
  drawerId: 'p1',
  round: 1,
  turnIndex: 0,
  endsAt: Date.now() + 80_000,
  maskedWord: '_ _ _',
  wordLength: 3,
  category: WordCategory.ANIMALS,
};

describe('gameStore', () => {
  beforeEach(() => useGameStore.getState().resetAll());

  it('initializes turn state and clears prior guesses', () => {
    useGameStore.getState().markGuessed('p2');
    useGameStore.getState().startTurn(turn);
    const s = useGameStore.getState();
    expect(s.turn).toEqual(turn);
    expect(s.maskedWord).toBe('_ _ _');
    expect(s.guessedIds.size).toBe(0);
  });

  it('tracks correct guessers without duplicates', () => {
    const g = useGameStore.getState();
    g.markGuessed('p2');
    g.markGuessed('p2');
    g.markGuessed('p3');
    expect(useGameStore.getState().guessedIds.size).toBe(2);
  });

  it('caps the chat backlog at 200 messages', () => {
    const g = useGameStore.getState();
    for (let i = 0; i < 250; i++) {
      g.addChat({ id: `${i}`, playerId: 'p', username: 'p', text: `m${i}`, kind: 'chat', timestamp: i });
    }
    expect(useGameStore.getState().chat.length).toBeLessThanOrEqual(201);
  });

  it('updates the masked word on hint reveal', () => {
    useGameStore.getState().startTurn(turn);
    useGameStore.getState().setMasked('c _ _');
    expect(useGameStore.getState().maskedWord).toBe('c _ _');
  });
});
