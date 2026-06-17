import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { DrawOp } from '@skribble/shared';
import { GameEmitter } from './game.emitter';
import { RoomStore } from '../redis/room.store';

/**
 * Server-side coalescing of drawing ops.
 *
 * Clients already batch points before sending (see useDrawingSync on the front
 * end). The server adds a second layer: instead of re-broadcasting every inbound
 * op individually (N viewers × M ops), it buffers ops per room and flushes once
 * per frame (~40ms) as a single `drawing:update` carrying many ops. This caps
 * outbound emit frequency to ~25/s/room regardless of how fast the drawer moves,
 * which is the single biggest network win for a drawing game.
 *
 * Ops are also appended to the Redis replay buffer so reconnecting / late-joining
 * players can be sent the full canvas.
 */
const FLUSH_MS = 40;

@Injectable()
export class DrawingRelay implements OnModuleDestroy {
  private readonly buffers = new Map<string, { ops: DrawOp[]; drawerSocketId: string }>();
  private readonly interval: NodeJS.Timeout;

  constructor(
    private readonly emitter: GameEmitter,
    private readonly store: RoomStore,
  ) {
    this.interval = setInterval(() => void this.flushAll(), FLUSH_MS);
  }

  /** Queue an op for broadcast. `drawerSocketId` is excluded from the fan-out. */
  enqueue(roomId: string, drawerSocketId: string, op: DrawOp) {
    const buf = this.buffers.get(roomId);
    if (buf) {
      buf.ops.push(op);
      buf.drawerSocketId = drawerSocketId;
    } else {
      this.buffers.set(roomId, { ops: [op], drawerSocketId });
    }
  }

  /** Drop a room's pending ops (e.g. on clear or turn end). */
  drop(roomId: string) {
    this.buffers.delete(roomId);
  }

  private async flushAll() {
    if (this.buffers.size === 0) return;
    const snapshot = [...this.buffers.entries()];
    this.buffers.clear();
    await Promise.all(
      snapshot.map(async ([roomId, { ops, drawerSocketId }]) => {
        if (!ops.length) return;
        // Broadcast to everyone except the drawer (who already rendered locally).
        this.emitter.toRoomExcept(roomId, drawerSocketId, 'drawing:update', { ops });
        await this.store.appendDrawOps(roomId, ops);
      }),
    );
  }

  onModuleDestroy() {
    clearInterval(this.interval);
  }
}
