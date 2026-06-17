import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import {
  DEFAULT_ROOM_SETTINGS,
  GamePhase,
  LIMITS,
  type RoomSettings,
  type RoomSummary,
} from '@skribble/shared';
import { RoomStore } from '../redis/room.store';
import type { LivePlayer, LiveRoom } from '../game/game.types';
import { toRoomSummary } from '../game/mappers';

// Unambiguous alphabet (no 0/O, 1/I) for human-shareable codes.
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export interface PlayerIdentity {
  playerId: string;
  userId: string | null;
  username: string;
  avatar: string;
  socketId: string;
}

/**
 * Owns room *lifecycle* transitions (create/join/leave/host management). Game
 * flow (turns/scoring) lives in GameService. All writes go through
 * RoomStore.mutate() for cross-node atomicity.
 */
@Injectable()
export class RoomService {
  constructor(private readonly store: RoomStore) {}

  /** Clamp + sanitize host-supplied settings so nothing out of range persists. */
  private sanitizeSettings(partial: Partial<RoomSettings>): RoomSettings {
    const merged = { ...DEFAULT_ROOM_SETTINGS, ...partial };
    return {
      ...merged,
      name: (merged.name || 'Room').slice(0, 40),
      maxPlayers: clamp(merged.maxPlayers, LIMITS.minPlayers, LIMITS.maxPlayers),
      rounds: clamp(merged.rounds, LIMITS.minRounds, LIMITS.maxRounds),
      drawTimeSec: clamp(merged.drawTimeSec, LIMITS.minDrawTime, LIMITS.maxDrawTime),
      wordChoiceCount: clamp(merged.wordChoiceCount, 2, 5),
      categories: merged.categories.length ? merged.categories : DEFAULT_ROOM_SETTINGS.categories,
      customWords: (merged.customWords ?? [])
        .map((w) => w.trim())
        .filter(Boolean)
        .slice(0, LIMITS.maxCustomWords),
    };
  }

  private newPlayer(identity: PlayerIdentity, isHost: boolean): LivePlayer {
    return {
      id: identity.playerId,
      userId: identity.userId,
      username: identity.username,
      avatar: identity.avatar,
      score: 0,
      roundScore: 0,
      isHost,
      isReady: isHost, // host is implicitly ready
      connected: true,
      hasGuessed: false,
      isDrawing: false,
      socketId: identity.socketId,
      guessedAt: null,
      guessOrder: null,
      disconnectedAt: null,
    };
  }

  async createRoom(host: PlayerIdentity, settings: Partial<RoomSettings>): Promise<LiveRoom> {
    const clean = this.sanitizeSettings(settings);

    // Retry on the astronomically-unlikely code collision.
    let code = genCode();
    for (let i = 0; i < 5; i++) {
      if (!(await this.store.roomIdByCode(code))) break;
      code = genCode();
    }

    const room: LiveRoom = {
      id: cryptoRandomId(),
      code,
      hostId: host.playerId,
      phase: GamePhase.LOBBY,
      settings: clean,
      players: [this.newPlayer(host, true)],
      currentRound: 0,
      drawOrder: [],
      turnPointer: 0,
      gameId: null,
      phaseEndsAt: null,
      usedWords: [],
      createdAt: Date.now(),
    };

    await this.store.createRoom(room);
    if (!clean.isPrivate) await this.store.registerPublic(room.id);
    await this.store.bindSession(host.userId ?? host.playerId, {
      playerId: host.playerId,
      roomId: room.id,
    });
    return room;
  }

  async joinByCode(code: string, identity: PlayerIdentity): Promise<LiveRoom> {
    const roomId = await this.store.roomIdByCode(code.toUpperCase());
    if (!roomId) throw new NotFoundException('Room not found');
    return this.join(roomId, identity);
  }

  async join(roomId: string, identity: PlayerIdentity): Promise<LiveRoom> {
    const updated = await this.store.mutate(roomId, (room) => {
      const existing = room.players.find((p) => p.id === identity.playerId);
      if (existing) {
        // Reconnect / dup tab: rebind socket, mark connected.
        existing.connected = true;
        existing.socketId = identity.socketId;
        existing.disconnectedAt = null;
        return room;
      }
      const active = room.players.filter((p) => p.connected).length;
      if (active >= room.settings.maxPlayers) {
        throw new ForbiddenException('Room is full');
      }
      room.players.push(this.newPlayer(identity, false));
      return room;
    });
    if (!updated) throw new NotFoundException('Room not found');
    await this.store.bindSession(identity.userId ?? identity.playerId, {
      playerId: identity.playerId,
      roomId,
    });
    return updated;
  }

  /** Mark a player disconnected; they keep their slot during the grace window. */
  async markDisconnected(roomId: string, playerId: string): Promise<LiveRoom | null> {
    return this.store.mutate(roomId, (room) => {
      const p = room.players.find((x) => x.id === playerId);
      if (!p) return null;
      p.connected = false;
      p.disconnectedAt = Date.now();
      return room;
    });
  }

  /** Fully remove a player (left, kicked, or grace expired). Returns null if the
   *  room was destroyed (last player gone). */
  async removePlayer(roomId: string, playerId: string): Promise<LiveRoom | null> {
    const updated = await this.store.mutate(roomId, (room) => {
      const idx = room.players.findIndex((p) => p.id === playerId);
      if (idx === -1) return room;
      const wasHost = room.players[idx]!.isHost;
      room.players.splice(idx, 1);

      if (room.players.length === 0) return room; // caller will delete

      // Reassign host to the longest-connected remaining player.
      if (wasHost) {
        const next = room.players.find((p) => p.connected) ?? room.players[0]!;
        next.isHost = true;
        next.isReady = true;
        room.hostId = next.id;
      }
      // Keep drawOrder consistent if a game is running.
      room.drawOrder = room.drawOrder.filter((id) => id !== playerId);
      return room;
    });

    if (updated && updated.players.length === 0) {
      await this.store.unregisterPublic(roomId);
      await this.store.deleteRoom(roomId, updated.code);
      return null;
    }
    return updated;
  }

  async setReady(roomId: string, playerId: string, ready: boolean): Promise<LiveRoom | null> {
    return this.store.mutate(roomId, (room) => {
      const p = room.players.find((x) => x.id === playerId);
      if (p) p.isReady = ready;
      return room;
    });
  }

  async updateSettings(
    roomId: string,
    requesterId: string,
    partial: Partial<RoomSettings>,
  ): Promise<LiveRoom> {
    const updated = await this.store.mutate(roomId, (room) => {
      this.assertHost(room, requesterId);
      if (room.phase !== GamePhase.LOBBY) {
        throw new BadRequestException('Settings can only change in the lobby');
      }
      const clean = this.sanitizeSettings({ ...room.settings, ...partial });
      room.settings = clean;
      return room;
    });
    if (!updated) throw new NotFoundException('Room not found');
    // Public/private toggling updates the lobby index.
    if (updated.settings.isPrivate) await this.store.unregisterPublic(roomId);
    else await this.store.registerPublic(roomId);
    return updated;
  }

  async kick(roomId: string, requesterId: string, targetId: string): Promise<LiveRoom | null> {
    const room = await this.store.getRoom(roomId);
    if (!room) throw new NotFoundException('Room not found');
    this.assertHost(room, requesterId);
    if (targetId === requesterId) throw new BadRequestException('Cannot kick yourself');
    return this.removePlayer(roomId, targetId);
  }

  async transferHost(roomId: string, requesterId: string, targetId: string): Promise<LiveRoom> {
    const updated = await this.store.mutate(roomId, (room) => {
      this.assertHost(room, requesterId);
      const target = room.players.find((p) => p.id === targetId);
      if (!target) throw new NotFoundException('Target player not in room');
      room.players.forEach((p) => (p.isHost = p.id === targetId));
      target.isReady = true;
      room.hostId = targetId;
      return room;
    });
    if (!updated) throw new NotFoundException('Room not found');
    return updated;
  }

  private assertHost(room: LiveRoom, requesterId: string) {
    if (room.hostId !== requesterId) throw new ForbiddenException('Only the host can do that');
  }

  async listPublic(): Promise<RoomSummary[]> {
    const rooms = await this.store.listPublic();
    return rooms
      .filter((r) => r.players.some((p) => p.connected))
      .map(toRoomSummary);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function cryptoRandomId(): string {
  // 24-char url-safe id; avoids importing extra deps in hot path.
  return [...crypto.getRandomValues(new Uint8Array(18))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
