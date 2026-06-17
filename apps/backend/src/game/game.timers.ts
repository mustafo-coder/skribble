import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

export type TimerKind = 'select' | 'draw' | 'hint' | 'roundEnd' | 'gameEnd' | 'grace';

/**
 * Per-room timer registry.
 *
 * Scaling note: a turn's timers live on the single node that advanced the turn.
 * Broadcasts still fan out cluster-wide via the Socket.IO Redis adapter, so all
 * players see updates regardless of which node they're on. The tradeoff is that
 * if the owning node dies mid-turn the timer is lost. For full HA, replace this
 * with durable delayed jobs (BullMQ) or Redis keyspace-expiry notifications —
 * documented in docs/DESIGN-DECISIONS.md §Timers.
 */
@Injectable()
export class GameTimers implements OnModuleDestroy {
  private readonly logger = new Logger(GameTimers.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private key(roomId: string, kind: TimerKind) {
    return `${roomId}:${kind}`;
  }

  /** Schedule (replacing any existing timer of the same kind for the room). */
  set(roomId: string, kind: TimerKind, ms: number, cb: () => void | Promise<void>) {
    this.clear(roomId, kind);
    const handle = setTimeout(() => {
      this.timers.delete(this.key(roomId, kind));
      Promise.resolve(cb()).catch((e) =>
        this.logger.error(`Timer ${kind} for ${roomId} failed: ${e?.message}`, e?.stack),
      );
    }, ms);
    this.timers.set(this.key(roomId, kind), handle);
  }

  /** Recurring timer (used for hint reveals). */
  setInterval(roomId: string, kind: TimerKind, ms: number, cb: () => void | Promise<void>) {
    this.clear(roomId, kind);
    const handle = setInterval(() => {
      Promise.resolve(cb()).catch((e) => this.logger.error(e?.message));
    }, ms);
    this.timers.set(this.key(roomId, kind), handle);
  }

  clear(roomId: string, kind: TimerKind) {
    const k = this.key(roomId, kind);
    const handle = this.timers.get(k);
    if (handle) {
      clearTimeout(handle);
      clearInterval(handle);
      this.timers.delete(k);
    }
  }

  clearRoom(roomId: string) {
    for (const kind of ['select', 'draw', 'hint', 'roundEnd', 'gameEnd', 'grace'] as TimerKind[]) {
      this.clear(roomId, kind);
    }
  }

  onModuleDestroy() {
    for (const h of this.timers.values()) {
      clearTimeout(h);
      clearInterval(h);
    }
    this.timers.clear();
  }
}
