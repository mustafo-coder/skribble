import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DrawOp } from '@skribble/shared';
import { RedisService } from './redis.service';
import { RedisKeys, RedisTtl } from './redis.constants';
import type { LiveRoom, TurnSecret } from '../game/game.types';

/**
 * Persistence + concurrency layer for live rooms on Redis.
 *
 * Concurrency model: every read-modify-write goes through `mutate()`, which
 * holds a short-lived distributed lock (`SET NX PX` + Lua compare-and-delete).
 * This makes room mutations safe even when players of the same room are
 * connected to *different* backend nodes — the cluster serializes writes per
 * room without needing strict sticky-by-room routing.
 */
@Injectable()
export class RoomStore {
  constructor(private readonly redis: RedisService) {}

  // ── Lock primitive ─────────────────────────────────────────────────────────
  private lockKey(roomId: string) {
    return `lock:room:${roomId}`;
  }

  private static readonly RELEASE_LUA = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end`;

  private async acquireLock(roomId: string, ttlMs = 5000, waitMs = 4000): Promise<string> {
    const token = randomUUID();
    const key = this.lockKey(roomId);
    const deadline = Date.now() + waitMs;
    // Spin with small backoff. Locks are held only for the duration of a pure
    // in-memory state transition, so contention windows are sub-millisecond.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ok = await this.redis.client.set(key, token, 'PX', ttlMs, 'NX');
      if (ok) return token;
      if (Date.now() > deadline) throw new ConflictException('Room is busy, try again');
      await new Promise((r) => setTimeout(r, 8 + Math.random() * 12));
    }
  }

  private async releaseLock(roomId: string, token: string) {
    await this.redis.client.eval(RoomStore.RELEASE_LUA, 1, this.lockKey(roomId), token);
  }

  // ── Room CRUD ────────────────────────────────────────────────────────────────
  async createRoom(room: LiveRoom): Promise<void> {
    const exists = await this.redis.client.exists(RedisKeys.roomByCode(room.code));
    if (exists) throw new ConflictException('Room code collision');
    await this.redis.client
      .multi()
      .set(RedisKeys.room(room.id), JSON.stringify(room), 'EX', RedisTtl.room)
      .set(RedisKeys.roomByCode(room.code), room.id, 'EX', RedisTtl.room)
      .exec();
  }

  async getRoom(roomId: string): Promise<LiveRoom | null> {
    const raw = await this.redis.client.get(RedisKeys.room(roomId));
    return raw ? (JSON.parse(raw) as LiveRoom) : null;
  }

  async roomIdByCode(code: string): Promise<string | null> {
    return this.redis.client.get(RedisKeys.roomByCode(code.toUpperCase()));
  }

  private async save(room: LiveRoom): Promise<void> {
    await this.redis.client.set(RedisKeys.room(room.id), JSON.stringify(room), 'EX', RedisTtl.room);
  }

  /**
   * Atomically read-modify-write a room. `fn` receives the current state and
   * returns the mutated state (or null to abort with no write). The returned
   * value is what was persisted.
   */
  async mutate(
    roomId: string,
    fn: (room: LiveRoom) => LiveRoom | null | Promise<LiveRoom | null>,
  ): Promise<LiveRoom | null> {
    const token = await this.acquireLock(roomId);
    try {
      const current = await this.getRoom(roomId);
      if (!current) return null;
      const next = await fn(current);
      if (next === null) return null;
      await this.save(next);
      return next;
    } finally {
      await this.releaseLock(roomId, token);
    }
  }

  async deleteRoom(roomId: string, code: string): Promise<void> {
    await this.redis.client
      .multi()
      .del(RedisKeys.room(roomId))
      .del(RedisKeys.roomByCode(code))
      .del(RedisKeys.roomDrawing(roomId))
      .del(RedisKeys.roomTurnSecret(roomId))
      .del(RedisKeys.presence(roomId))
      .exec();
  }

  // ── Secret turn data (the word) ───────────────────────────────────────────────
  async setTurnSecret(roomId: string, secret: TurnSecret): Promise<void> {
    await this.redis.client.set(
      RedisKeys.roomTurnSecret(roomId),
      JSON.stringify(secret),
      'EX',
      RedisTtl.room,
    );
  }

  async getTurnSecret(roomId: string): Promise<TurnSecret | null> {
    const raw = await this.redis.client.get(RedisKeys.roomTurnSecret(roomId));
    return raw ? (JSON.parse(raw) as TurnSecret) : null;
  }

  async updateTurnSecret(
    roomId: string,
    fn: (s: TurnSecret) => TurnSecret,
  ): Promise<TurnSecret | null> {
    const s = await this.getTurnSecret(roomId);
    if (!s) return null;
    const next = fn(s);
    await this.setTurnSecret(roomId, next);
    return next;
  }

  async clearTurnSecret(roomId: string): Promise<void> {
    await this.redis.client.del(RedisKeys.roomTurnSecret(roomId));
  }

  // ── Drawing replay buffer (for late-join / reconnect) ─────────────────────────
  async appendDrawOps(roomId: string, ops: DrawOp[]): Promise<void> {
    if (!ops.length) return;
    const key = RedisKeys.roomDrawing(roomId);
    const pipe = this.redis.client.pipeline();
    for (const op of ops) pipe.rpush(key, JSON.stringify(op));
    // Cap the buffer so a marathon drawing can't grow unbounded.
    pipe.ltrim(key, -5000, -1);
    pipe.expire(key, RedisTtl.drawingBuffer);
    await pipe.exec();
  }

  async getDrawBuffer(roomId: string): Promise<DrawOp[]> {
    const raw = await this.redis.client.lrange(RedisKeys.roomDrawing(roomId), 0, -1);
    return raw.map((r) => JSON.parse(r) as DrawOp);
  }

  async clearDrawBuffer(roomId: string): Promise<void> {
    await this.redis.client.del(RedisKeys.roomDrawing(roomId));
  }

  // ── Public room registry (lobby browser) ─────────────────────────────────────
  private static readonly PUBLIC_SET = 'rooms:public';

  async registerPublic(roomId: string): Promise<void> {
    await this.redis.client.sadd(RoomStore.PUBLIC_SET, roomId);
  }

  async unregisterPublic(roomId: string): Promise<void> {
    await this.redis.client.srem(RoomStore.PUBLIC_SET, roomId);
  }

  async listPublic(limit = 50): Promise<LiveRoom[]> {
    const ids = await this.redis.client.smembers(RoomStore.PUBLIC_SET);
    if (!ids.length) return [];
    const raws = await this.redis.client.mget(ids.map((id) => RedisKeys.room(id)));
    const rooms: LiveRoom[] = [];
    const stale: string[] = [];
    raws.forEach((raw, i) => {
      if (raw) rooms.push(JSON.parse(raw) as LiveRoom);
      else stale.push(ids[i]!); // room expired but index entry lingered
    });
    if (stale.length) await this.redis.client.srem(RoomStore.PUBLIC_SET, ...stale);
    return rooms.slice(0, limit);
  }

  // ── Reconnect session mapping (userId -> live playerId/roomId) ─────────────────
  async bindSession(userId: string, data: { playerId: string; roomId: string }): Promise<void> {
    await this.redis.client.set(
      RedisKeys.session(userId),
      JSON.stringify(data),
      'EX',
      RedisTtl.session,
    );
  }

  async getSession(userId: string): Promise<{ playerId: string; roomId: string } | null> {
    const raw = await this.redis.client.get(RedisKeys.session(userId));
    return raw ? JSON.parse(raw) : null;
  }

  async clearSession(userId: string): Promise<void> {
    await this.redis.client.del(RedisKeys.session(userId));
  }
}
