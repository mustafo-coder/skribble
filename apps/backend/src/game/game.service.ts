import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  classifyGuess,
  DEFAULT_SCORING,
  GamePhase,
  LIMITS,
  maskWord,
  scoreDrawer,
  scoreGuess,
  type ChatMessage,
  type LeaderboardEntry,
  type TurnPublicState,
} from '@skribble/shared';
import { randomUUID } from 'node:crypto';
import { GameStatus, RoomStatus, WordDifficulty } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomStore } from '../redis/room.store';
import { WordsService } from '../words/words.service';
import { UsersService } from '../users/users.service';
import { GameEmitter } from './game.emitter';
import { GameTimers } from './game.timers';
import { toPublicRoom } from './mappers';
import type { LivePlayer, LiveRoom, TurnSecret } from './game.types';

/**
 * The authoritative game engine. Owns every transition of the room finite-state
 * machine:
 *
 *   LOBBY ──start──▶ WORD_SELECTION ──pick/timeout──▶ DRAWING
 *      ▲                                                  │
 *      │                                          time-up / all-guessed
 *      │                                                  ▼
 *   (reset) ◀──gameEnd── GAME_END ◀──last turn── ROUND_END ──next──▶ (WORD_SELECTION)
 *
 * The server is the single source of truth: clients only ever *render* state
 * the server computes here. Scores, the secret word, and turn ordering can never
 * be set by a client payload.
 */
@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    private readonly store: RoomStore,
    private readonly words: WordsService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly emitter: GameEmitter,
    private readonly timers: GameTimers,
  ) {}

  // ─── Phase 2: game start ─────────────────────────────────────────────────────
  async startGame(roomId: string, requesterId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostId !== requesterId) throw new ForbiddenException('Only the host can start');
    if (room.phase !== GamePhase.LOBBY) throw new BadRequestException('Game already started');
    const connected = room.players.filter((p) => p.connected);
    if (connected.length < LIMITS.minPlayers) {
      throw new BadRequestException('Need at least 2 connected players');
    }

    // Persist a Room snapshot + a Game row so Postgres holds the history.
    await this.prisma.room.upsert({
      where: { id: roomId },
      create: {
        id: roomId,
        code: room.code,
        name: room.settings.name,
        maxPlayers: room.settings.maxPlayers,
        rounds: room.settings.rounds,
        drawTimeSec: room.settings.drawTimeSec,
        language: room.settings.language,
        categories: room.settings.categories,
        isPrivate: room.settings.isPrivate,
        customWordsEnabled: room.settings.customWordsEnabled,
        customWords: room.settings.customWords,
        hintsEnabled: room.settings.hintsEnabled,
        wordChoiceCount: room.settings.wordChoiceCount,
        status: RoomStatus.IN_PROGRESS,
      },
      update: { status: RoomStatus.IN_PROGRESS },
    });
    const game = await this.prisma.game.create({
      data: { roomId, totalRounds: room.settings.rounds, status: GameStatus.ACTIVE },
    });

    const updated = await this.store.mutate(roomId, (r) => {
      r.gameId = game.id;
      r.currentRound = 1;
      r.turnPointer = 0;
      r.usedWords = [];
      r.drawOrder = shuffle(r.players.filter((p) => p.connected).map((p) => p.id));
      r.players.forEach((p) => resetPlayerForGame(p));
      r.phase = GamePhase.WORD_SELECTION;
      return r;
    });
    if (!updated) return;

    this.emitter.toRoom(roomId, 'game:started', { room: toPublicRoom(updated) });
    await this.beginTurn(roomId);
  }

  // ─── Phase 2→3: begin a turn (word selection) ────────────────────────────────
  private async beginTurn(roomId: string): Promise<void> {
    const prepared = await this.store.mutate(roomId, (r) => {
      const drawerId = r.drawOrder[r.turnPointer];
      if (!drawerId) return null;
      r.phase = GamePhase.WORD_SELECTION;
      r.phaseEndsAt = Date.now() + LIMITS.wordChoiceTimeoutSec * 1000;
      r.players.forEach((p) => {
        p.roundScore = 0;
        p.hasGuessed = false;
        p.guessOrder = null;
        p.guessedAt = null;
        p.isDrawing = p.id === drawerId;
      });
      return r;
    });
    if (!prepared) return;

    const drawer = prepared.players.find((p) => p.isDrawing);
    if (!drawer) {
      // Drawer vanished between scheduling and now — skip to next.
      return this.advanceTurn(roomId);
    }

    const candidates = await this.words.pickCandidates({
      language: prepared.settings.language as never,
      categories: prepared.settings.categories as never,
      count: prepared.settings.wordChoiceCount,
      customWords: prepared.settings.customWordsEnabled ? prepared.settings.customWords : [],
      exclude: prepared.usedWords,
    });

    const secret: TurnSecret = {
      word: '',
      difficulty: WordDifficulty.MEDIUM,
      category: null,
      choices: candidates.map((c) => ({ word: c.word, difficulty: c.difficulty })),
      revealedHints: 0,
      drawSeq: 0,
    };
    await this.store.setTurnSecret(roomId, secret);

    this.emitter.roomState(prepared);
    // Only the drawer learns the choices.
    if (drawer.socketId) {
      this.emitter.toSocket(drawer.socketId, 'word:choices', {
        choices: candidates.map((c) => ({ word: c.word, difficulty: c.difficulty })),
        endsAt: prepared.phaseEndsAt!,
      });
    }

    // Auto-pick a random word if the drawer dithers.
    this.timers.set(roomId, 'select', LIMITS.wordChoiceTimeoutSec * 1000, () =>
      this.selectWord(roomId, drawer.id, Math.floor(Math.random() * candidates.length), true),
    );
  }

  // ─── Phase 3: word chosen → drawing begins ───────────────────────────────────
  async selectWord(
    roomId: string,
    drawerId: string,
    choiceIndex: number,
    auto = false,
  ): Promise<void> {
    const secret = await this.store.getTurnSecret(roomId);
    if (!secret) return;
    const choice = secret.choices[choiceIndex] ?? secret.choices[0];
    if (!choice) return;

    let rejected = false;
    const updated = await this.store.mutate(roomId, (r) => {
      if (r.phase !== GamePhase.WORD_SELECTION) {
        rejected = true;
        return null;
      }
      const currentDrawer = r.drawOrder[r.turnPointer];
      if (currentDrawer !== drawerId) {
        rejected = true; // someone other than the drawer tried to pick
        return null;
      }
      r.phase = GamePhase.DRAWING;
      r.phaseEndsAt = Date.now() + r.settings.drawTimeSec * 1000;
      r.usedWords.push(choice.word);
      return r;
    });
    if (!updated || rejected) return;

    this.timers.clear(roomId, 'select');
    await this.store.setTurnSecret(roomId, {
      ...secret,
      word: choice.word,
      difficulty: choice.difficulty,
      revealedHints: 0,
      drawSeq: 0,
    });
    await this.store.clearDrawBuffer(roomId);

    const turn = this.buildTurnPublicState(updated, choice.word, 0);
    this.emitter.toRoom(roomId, 'round:started', { turn, room: toPublicRoom(updated) });
    this.emitter.toRoom(roomId, 'drawing:cleared');
    const drawer = updated.players.find((p) => p.id === drawerId);
    if (drawer?.socketId) this.emitter.toSocket(drawer.socketId, 'word:assigned', { word: choice.word });
    this.logger.debug(`Room ${roomId}: turn started, word=${auto ? '[auto]' : '[chosen]'}`);

    // Drawing-phase timeout → end the turn.
    this.timers.set(roomId, 'draw', updated.settings.drawTimeSec * 1000, () =>
      this.endTurn(roomId, 'timeout'),
    );
    this.scheduleHints(roomId, updated.settings.drawTimeSec, choice.word, updated.settings.hintsEnabled);
  }

  /** Progressive hint reveals during the second half of the drawing phase. */
  private scheduleHints(roomId: string, drawTimeSec: number, word: string, enabled: boolean) {
    if (!enabled) return;
    const letters = word.replace(/\s/g, '').length;
    const totalHints = Math.max(0, Math.min(letters - 1, Math.floor(letters * 0.4)));
    if (totalHints === 0) return;
    // Spread reveals across the latter 60% of the turn.
    const firstAt = drawTimeSec * 0.4;
    const gap = (drawTimeSec * 0.5) / totalHints;

    let revealed = 0;
    const tick = async () => {
      revealed += 1;
      const secret = await this.store.updateTurnSecret(roomId, (s) => ({
        ...s,
        revealedHints: revealed,
      }));
      if (!secret) return;
      this.emitter.toRoom(roomId, 'hint:reveal', { maskedWord: maskWord(word, revealed) });
      if (revealed >= totalHints) this.timers.clear(roomId, 'hint');
    };
    // Kick off the first reveal, then continue on an interval.
    this.timers.set(roomId, 'hint', firstAt * 1000, () => {
      void tick();
      this.timers.setInterval(roomId, 'hint', gap * 1000, tick);
    });
  }

  // ─── Phase 4: guessing ───────────────────────────────────────────────────────
  /**
   * Process a guess. Returns true if it was a correct/close guess (and thus
   * should NOT be echoed to chat as plain text); false if it's an ordinary wrong
   * guess that the gateway should broadcast as a normal chat line.
   */
  async handleGuess(
    roomId: string,
    playerId: string,
    username: string,
    text: string,
  ): Promise<{ handled: boolean; chat?: ChatMessage }> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.phase !== GamePhase.DRAWING) return { handled: false };

    const drawerId = room.drawOrder[room.turnPointer];
    if (playerId === drawerId) {
      // Drawer cannot guess — silently swallow to avoid leaking the word in chat.
      return { handled: true };
    }
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.hasGuessed) return { handled: true };

    const secret = await this.store.getTurnSecret(roomId);
    if (!secret?.word) return { handled: false };

    const verdict = classifyGuess(text, secret.word);
    if (verdict === 'wrong') return { handled: false }; // gateway echoes to chat

    if (verdict === 'close') {
      // Private nudge only — never broadcast, to avoid leaking proximity.
      if (player.socketId) {
        this.emitter.toSocket(player.socketId, 'guess:wrong', { playerId, close: true });
      }
      return { handled: true };
    }

    // ── Correct ──
    const totalSeconds = room.settings.drawTimeSec;
    let awarded = 0;
    let order = 0;
    let allGuessed = false;
    const updated = await this.store.mutate(roomId, (r) => {
      const p = r.players.find((x) => x.id === playerId);
      if (!p || p.hasGuessed) return null;
      const priorCorrect = r.players.filter((x) => x.hasGuessed && !x.isDrawing).length;
      order = priorCorrect;
      const secondsRemaining = Math.max(0, ((r.phaseEndsAt ?? Date.now()) - Date.now()) / 1000);
      awarded = scoreGuess(
        {
          secondsRemaining,
          totalSeconds,
          guessOrder: order,
          difficulty: secret.difficulty,
        },
        DEFAULT_SCORING,
      );
      p.hasGuessed = true;
      p.guessedAt = Date.now();
      p.guessOrder = order;
      p.roundScore += awarded;
      p.score += awarded;

      const guessers = r.players.filter((x) => x.connected && x.id !== drawerId);
      allGuessed = guessers.length > 0 && guessers.every((x) => x.hasGuessed);
      return r;
    });
    if (!updated) return { handled: true };

    // Broadcast the *fact* of a correct guess (no word) + private word to guesser.
    this.emitter.toRoom(roomId, 'guess:correct', { playerId, username, points: awarded, order });
    if (player.socketId) {
      this.emitter.toSocket(player.socketId, 'guess:correct', {
        playerId,
        username,
        points: awarded,
        order,
        word: secret.word,
      });
    }
    this.emitter.toRoom(roomId, 'chat:message', systemMessage(`${username} guessed the word!`, 'correct'));
    this.emitter.roomState(updated);

    if (allGuessed) {
      this.timers.clear(roomId, 'draw');
      await this.endTurn(roomId, 'all_guessed');
    }
    return { handled: true };
  }

  // ─── Phase 5: round end ──────────────────────────────────────────────────────
  async endTurn(roomId: string, reason: 'timeout' | 'all_guessed' | 'drawer_left'): Promise<void> {
    this.timers.clear(roomId, 'draw');
    this.timers.clear(roomId, 'hint');
    const secret = await this.store.getTurnSecret(roomId);

    const updated = await this.store.mutate(roomId, (r) => {
      if (r.phase !== GamePhase.DRAWING && r.phase !== GamePhase.WORD_SELECTION) return null;
      const drawerId = r.drawOrder[r.turnPointer];
      const drawer = r.players.find((p) => p.id === drawerId);
      if (drawer) {
        const correct = r.players.filter((p) => p.hasGuessed && p.id !== drawerId).length;
        const drawerPts = scoreDrawer(correct);
        drawer.roundScore += drawerPts;
        drawer.score += drawerPts;
        drawer.isDrawing = false;
      }
      r.phase = GamePhase.ROUND_END;
      r.phaseEndsAt = Date.now() + LIMITS.roundEndDelaySec * 1000;
      return r;
    });
    if (!updated) return;

    const results = updated.players.map((p) => ({
      playerId: p.id,
      username: p.username,
      delta: p.roundScore,
      total: p.score,
    }));

    void this.persistRound(updated, secret?.word ?? '', secret?.difficulty ?? WordDifficulty.MEDIUM);

    this.emitter.toRoom(roomId, 'round:ended', {
      word: secret?.word ?? '',
      results,
      nextAt: updated.phaseEndsAt!,
    });
    this.emitter.roomState(updated);
    await this.store.clearTurnSecret(roomId);

    this.timers.set(roomId, 'roundEnd', LIMITS.roundEndDelaySec * 1000, () =>
      this.advanceTurn(roomId),
    );
    this.logger.debug(`Room ${roomId}: turn ended (${reason})`);
  }

  // ─── Phase 5→2/6: advance ────────────────────────────────────────────────────
  private async advanceTurn(roomId: string): Promise<void> {
    const updated = await this.store.mutate(roomId, (r) => {
      // Who just finished drawing — used to avoid them drawing twice in a row
      // across the round boundary after the re-shuffle below.
      const lastDrawer = r.drawOrder[r.turnPointer];
      r.turnPointer += 1;
      if (r.turnPointer >= r.drawOrder.length) {
        r.currentRound += 1;
        r.turnPointer = 0;
        if (r.currentRound <= r.settings.rounds) {
          const next = shuffle(r.players.filter((p) => p.connected).map((p) => p.id));
          // If the reshuffle put the previous drawer first, they'd draw two turns
          // back-to-back. Rotate the first pick to someone else.
          if (next.length > 1 && next[0] === lastDrawer) {
            [next[0], next[1]] = [next[1]!, next[0]!];
          }
          r.drawOrder = next;
        }
      }
      return r;
    });
    if (!updated) return;

    if (updated.currentRound > updated.settings.rounds || updated.drawOrder.length < 1) {
      await this.endGame(roomId);
    } else {
      await this.beginTurn(roomId);
    }
  }

  // ─── Phase 6: game end ───────────────────────────────────────────────────────
  async endGame(roomId: string): Promise<void> {
    this.timers.clearRoom(roomId);
    const updated = await this.store.mutate(roomId, (r) => {
      const ranked = [...r.players].sort((a, b) => b.score - a.score);
      ranked.forEach((p, i) => {
        const ref = r.players.find((x) => x.id === p.id)!;
        ref.placement = i + 1;
        ref.isDrawing = false;
      });
      r.phase = GamePhase.GAME_END;
      r.phaseEndsAt = Date.now() + LIMITS.gameEndDelaySec * 1000;
      return r;
    });
    if (!updated) return;

    const leaderboard: LeaderboardEntry[] = [...updated.players]
      .sort((a, b) => a.placement! - b.placement!)
      .map((p) => ({
        playerId: p.id,
        username: p.username,
        avatar: p.avatar,
        score: p.score,
        placement: p.placement!,
      }));
    const winner = leaderboard[0] ?? null;

    await this.persistGameEnd(updated, leaderboard);

    this.emitter.toRoom(roomId, 'game:ended', { leaderboard, winner });
    this.emitter.roomState(updated);

    // Return to lobby after the results screen.
    this.timers.set(roomId, 'gameEnd', LIMITS.gameEndDelaySec * 1000, () =>
      this.resetToLobby(roomId),
    );
  }

  async resetToLobby(roomId: string): Promise<void> {
    const updated = await this.store.mutate(roomId, (r) => {
      r.phase = GamePhase.LOBBY;
      r.currentRound = 0;
      r.turnPointer = 0;
      r.drawOrder = [];
      r.gameId = null;
      r.usedWords = [];
      r.phaseEndsAt = null;
      r.players.forEach((p) => {
        p.score = 0;
        p.roundScore = 0;
        p.placement = undefined;
        p.hasGuessed = false;
        p.guessOrder = null;
        p.guessedAt = null;
        p.isDrawing = false;
        p.isReady = p.isHost;
      });
      return r;
    });
    if (updated) this.emitter.roomState(updated);
  }

  // ─── Disconnect / drawer-leaves handling ─────────────────────────────────────
  /** Called when a player is fully removed mid-game. */
  async onPlayerGone(roomId: string, playerId: string): Promise<void> {
    const room = await this.store.getRoom(roomId);
    if (!room || room.phase === GamePhase.LOBBY || room.phase === GamePhase.GAME_END) return;

    const connected = room.players.filter((p) => p.connected);
    if (connected.length < LIMITS.minPlayers) {
      await this.endGame(roomId);
      return;
    }
    const drawerId = room.drawOrder[room.turnPointer];
    if (playerId === drawerId && room.phase === GamePhase.DRAWING) {
      await this.endTurn(roomId, 'drawer_left');
    }
  }

  // ─── Helpers / read models ───────────────────────────────────────────────────
  buildTurnPublicState(room: LiveRoom, word: string, revealedHints: number): TurnPublicState {
    const drawerId = room.drawOrder[room.turnPointer]!;
    return {
      drawerId,
      round: room.currentRound,
      turnIndex: room.turnPointer,
      endsAt: room.phaseEndsAt ?? Date.now(),
      maskedWord: maskWord(word, revealedHints),
      wordLength: word.replace(/\s/g, '').length,
      category: null,
    };
  }

  /** Read the public turn state for a resuming/late socket (no secret leak). */
  async currentTurnPublic(roomId: string): Promise<TurnPublicState | null> {
    const room = await this.store.getRoom(roomId);
    if (!room || (room.phase !== GamePhase.DRAWING && room.phase !== GamePhase.WORD_SELECTION)) {
      return null;
    }
    const secret = await this.store.getTurnSecret(roomId);
    return this.buildTurnPublicState(room, secret?.word ?? '', secret?.revealedHints ?? 0);
  }

  private async persistRound(room: LiveRoom, word: string, difficulty: WordDifficulty) {
    if (!room.gameId) return;
    const drawerId = room.drawOrder[room.turnPointer];
    const drawer = room.players.find((p) => p.id === drawerId);
    try {
      const round = await this.prisma.round.create({
        data: {
          gameId: room.gameId,
          roundNumber: room.currentRound,
          turnIndex: room.turnPointer,
          drawerId: drawerId ?? 'unknown',
          drawerName: drawer?.username ?? 'unknown',
          word,
          difficulty,
          drawTimeSec: room.settings.drawTimeSec,
          endedAt: new Date(),
        },
      });
      const guessers = room.players.filter((p) => p.hasGuessed && p.id !== drawerId);
      if (guessers.length) {
        await this.prisma.guess.createMany({
          data: guessers.map((p) => ({
            roundId: round.id,
            userId: p.userId,
            playerId: p.id,
            username: p.username,
            text: word,
            isCorrect: true,
            pointsAwarded: p.roundScore,
            guessOrder: p.guessOrder,
          })),
        });
      }
    } catch (e) {
      this.logger.error(`persistRound failed: ${(e as Error).message}`);
    }
  }

  private async persistGameEnd(room: LiveRoom, leaderboard: LeaderboardEntry[]) {
    if (!room.gameId) return;
    const winnerEntry = leaderboard[0];
    const winnerUserId =
      room.players.find((p) => p.id === winnerEntry?.playerId)?.userId ?? null;
    try {
      await this.prisma.$transaction([
        this.prisma.game.update({
          where: { id: room.gameId },
          data: { status: GameStatus.FINISHED, endedAt: new Date(), winnerUserId },
        }),
        this.prisma.score.createMany({
          data: leaderboard.map((e) => ({
            gameId: room.gameId!,
            userId: room.players.find((p) => p.id === e.playerId)?.userId ?? null,
            playerId: e.playerId,
            username: e.username,
            points: e.score,
            placement: e.placement,
            isWinner: e.placement === 1,
          })),
        }),
        this.prisma.room.update({ where: { id: room.id }, data: { status: RoomStatus.FINISHED } }),
      ]);

      await this.users.applyGameResults(
        room.players
          .filter((p) => p.userId)
          .map((p) => ({ userId: p.userId!, isWinner: p.placement === 1 })),
      );
    } catch (e) {
      this.logger.error(`persistGameEnd failed: ${(e as Error).message}`);
    }
  }
}

// ─── pure helpers ──────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function resetPlayerForGame(p: LivePlayer) {
  p.score = 0;
  p.roundScore = 0;
  p.placement = undefined;
  p.hasGuessed = false;
  p.guessOrder = null;
  p.guessedAt = null;
  p.isDrawing = false;
}

function systemMessage(text: string, kind: ChatMessage['kind'] = 'system'): ChatMessage {
  return {
    id: randomUUID(),
    playerId: 'system',
    username: 'System',
    text,
    kind,
    timestamp: Date.now(),
  };
}
