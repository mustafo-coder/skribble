import { GamePhase } from '@skribble/shared';
import { RoomService, type PlayerIdentity } from './room.service';
import type { LiveRoom } from '../game/game.types';
import type { RoomStore } from '../redis/room.store';

/**
 * In-memory fake of RoomStore covering exactly the surface RoomService touches.
 * Lets us unit-test the lifecycle transitions with no Redis dependency.
 */
class FakeStore {
  rooms = new Map<string, LiveRoom>();
  byCode = new Map<string, string>();
  publicIds = new Set<string>();
  sessions = new Map<string, { playerId: string; roomId: string }>();

  async createRoom(room: LiveRoom) {
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room.id);
  }
  async getRoom(id: string) {
    return this.rooms.get(id) ?? null;
  }
  async roomIdByCode(code: string) {
    return this.byCode.get(code) ?? null;
  }
  async mutate(id: string, fn: (r: LiveRoom) => LiveRoom | null) {
    const cur = this.rooms.get(id);
    if (!cur) return null;
    const next = fn(structuredClone(cur));
    if (next === null) return null;
    this.rooms.set(id, next);
    return next;
  }
  async deleteRoom(id: string, code: string) {
    this.rooms.delete(id);
    this.byCode.delete(code);
  }
  async registerPublic(id: string) {
    this.publicIds.add(id);
  }
  async unregisterPublic(id: string) {
    this.publicIds.delete(id);
  }
  async listPublic() {
    return [...this.publicIds].map((id) => this.rooms.get(id)!).filter(Boolean);
  }
  async bindSession(userId: string, data: { playerId: string; roomId: string }) {
    this.sessions.set(userId, data);
  }
}

const ident = (id: string, name = id): PlayerIdentity => ({
  playerId: id,
  userId: null,
  username: name,
  avatar: 'avatar-01',
  socketId: `sock_${id}`,
});

describe('RoomService', () => {
  let svc: RoomService;
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
    svc = new RoomService(store as unknown as RoomStore);
  });

  it('creates a room with the host as the only (ready) player', async () => {
    const room = await svc.createRoom(ident('host'), { name: 'My Room', maxPlayers: 4 });
    expect(room.phase).toBe(GamePhase.LOBBY);
    expect(room.hostId).toBe('host');
    expect(room.players).toHaveLength(1);
    expect(room.players[0]!.isHost).toBe(true);
    expect(room.players[0]!.isReady).toBe(true);
    expect(store.publicIds.has(room.id)).toBe(true);
  });

  it('clamps out-of-range settings', async () => {
    const room = await svc.createRoom(ident('host'), { maxPlayers: 999, rounds: 0, drawTimeSec: 5 });
    expect(room.settings.maxPlayers).toBeLessThanOrEqual(20);
    expect(room.settings.rounds).toBeGreaterThanOrEqual(1);
    expect(room.settings.drawTimeSec).toBeGreaterThanOrEqual(30);
  });

  it('lets a second player join', async () => {
    const room = await svc.createRoom(ident('host'), {});
    const after = await svc.join(room.id, ident('p2'));
    expect(after.players.map((p) => p.id)).toEqual(['host', 'p2']);
  });

  it('rejects joining a full room', async () => {
    const room = await svc.createRoom(ident('host'), { maxPlayers: 2 });
    await svc.join(room.id, ident('p2'));
    await expect(svc.join(room.id, ident('p3'))).rejects.toThrow(/full/i);
  });

  it('reassigns host when the host leaves', async () => {
    const room = await svc.createRoom(ident('host'), {});
    await svc.join(room.id, ident('p2'));
    const after = await svc.removePlayer(room.id, 'host');
    expect(after).not.toBeNull();
    expect(after!.hostId).toBe('p2');
    expect(after!.players.find((p) => p.id === 'p2')!.isHost).toBe(true);
  });

  it('destroys the room when the last player leaves', async () => {
    const room = await svc.createRoom(ident('host'), {});
    const after = await svc.removePlayer(room.id, 'host');
    expect(after).toBeNull();
    expect(store.rooms.has(room.id)).toBe(false);
    expect(store.publicIds.has(room.id)).toBe(false);
  });

  it('only the host can transfer host', async () => {
    const room = await svc.createRoom(ident('host'), {});
    await svc.join(room.id, ident('p2'));
    await expect(svc.transferHost(room.id, 'p2', 'host')).rejects.toThrow(/host/i);
    const after = await svc.transferHost(room.id, 'host', 'p2');
    expect(after.hostId).toBe('p2');
  });
});
