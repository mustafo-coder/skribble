import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  GamePhase,
  SocketErrorCode,
  type ChatPayload,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type DrawEndPayload,
  type DrawMovePayload,
  type DrawStartPayload,
  type FillPayload,
  type GuessPayload,
  type InterServerEvents,
  type JoinRoomPayload,
  type KickPayload,
  type RoomState,
  type SelectWordPayload,
  type ServerToClientEvents,
  type SocketData,
  type SocketResult,
  type TransferHostPayload,
  type TurnPublicState,
  type UpdateSettingsPayload,
} from '@skribble/shared';
import { randomUUID } from 'node:crypto';
import { RoomService, type PlayerIdentity } from '../rooms/room.service';
import { GameService } from './game.service';
import { GameEmitter } from './game.emitter';
import { DrawingRelay } from './drawing.relay';
import { RedisService } from '../redis/redis.service';
import { RoomStore } from '../redis/room.store';
import { TokenService } from '../auth/token.service';
import { authenticateSocket } from './socket-auth';
import {
  validateDrawEnd,
  validateDrawMove,
  validateDrawStart,
  validateFill,
} from './draw-validation';
import { toPublicRoom } from './mappers';
import type { LiveRoom } from './game.types';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const RECONNECT_GRACE_MS = 30_000;

function ok<T>(data: T): SocketResult<T> {
  return { ok: true, data };
}
function fail(code: SocketErrorCode, message: string): SocketResult<never> {
  return { ok: false, error: { code, message } };
}

/**
 * The single Socket.IO gateway. Responsibilities:
 *   - authenticate the handshake (trusted identity → socket.data)
 *   - wire client events to RoomService / GameService
 *   - relay + batch drawing ops (DrawingRelay)
 *   - route chat to prevent word leakage to active guessers
 *   - rate-limit guesses/chat/draw to stop spam & abuse
 *   - manage disconnect grace + reconnect resync
 *
 * Acks: handlers that need a request/response simply RETURN the SocketResult —
 * NestJS forwards the return value to the client's ack callback. Fire-and-forget
 * handlers (drawing, guessing) return nothing.
 *
 * Path `/socket` + the Redis adapter let this scale horizontally behind a
 * sticky-session load balancer.
 */
@WebSocketGateway({
  path: '/socket',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  @WebSocketServer() server!: GameServer;

  /** Per-player reconnect-grace removal timers, keyed `${roomId}:${playerId}`. */
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly rooms: RoomService,
    private readonly game: GameService,
    private readonly emitter: GameEmitter,
    private readonly relay: DrawingRelay,
    private readonly redis: RedisService,
    private readonly store: RoomStore,
    private readonly tokens: TokenService,
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────
  afterInit(server: GameServer) {
    // Horizontal scaling: broadcast across nodes via Redis pub/sub.
    server.adapter(createAdapter(this.redis.pub, this.redis.sub));
    this.emitter.bind(server);
    this.logger.log('Socket.IO gateway initialized with Redis adapter');
  }

  handleConnection(socket: GameSocket) {
    try {
      socket.data = authenticateSocket(socket, this.tokens);
      this.logger.debug(`Connected ${socket.id} as ${socket.data.username}`);
    } catch (e) {
      this.logger.warn(`Rejected socket ${socket.id}: ${(e as Error).message}`);
      socket.emit('error', { code: SocketErrorCode.UNAUTHORIZED, message: 'Auth failed' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: GameSocket) {
    const { roomId, playerId, username } = socket.data ?? {};
    if (!roomId || !playerId) return;
    const room = await this.rooms.markDisconnected(roomId, playerId);
    if (room) this.emitter.roomState(room);

    // Hold the slot for the grace window; remove fully if they don't return.
    const key = `${roomId}:${playerId}`;
    clearTimeout(this.graceTimers.get(key));
    this.graceTimers.set(
      key,
      setTimeout(
        () => void this.finalizeLeave(roomId, playerId, username ?? ''),
        RECONNECT_GRACE_MS,
      ),
    );
  }

  private async finalizeLeave(roomId: string, playerId: string, username: string) {
    this.graceTimers.delete(`${roomId}:${playerId}`);
    const current = await this.store.getRoom(roomId);
    const stillGone = current?.players.find((p) => p.id === playerId && !p.connected);
    if (!stillGone) return; // they reconnected within the grace window
    const room = await this.rooms.removePlayer(roomId, playerId);
    this.emitter.toRoom(roomId, 'player:left', { playerId, username });
    if (room) {
      this.emitter.roomState(room);
      await this.game.onPlayerGone(roomId, playerId);
    }
  }

  private identity(socket: GameSocket): PlayerIdentity {
    return {
      playerId: socket.data.playerId,
      userId: socket.data.userId,
      username: socket.data.username,
      avatar: socket.data.avatar,
      socketId: socket.id,
    };
  }

  private async bindToRoom(socket: GameSocket, room: LiveRoom) {
    await socket.join(room.id);
    socket.data.roomId = room.id;
  }

  /** Replay the buffered canvas to a socket that joined mid-turn. */
  private async replayForLateJoiner(socket: GameSocket, roomId: string) {
    const buffer = await this.store.getDrawBuffer(roomId);
    if (buffer.length) socket.emit('drawing:update', { ops: buffer });
  }

  // ─── Room lifecycle events ───────────────────────────────────────────────────
  @SubscribeMessage('room:create')
  async onCreateRoom(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: CreateRoomPayload,
  ): Promise<SocketResult<{ room: RoomState; playerId: string }>> {
    try {
      const room = await this.rooms.createRoom(this.identity(socket), body?.settings ?? {});
      await this.bindToRoom(socket, room);
      this.emitter.roomState(room);
      return ok({ room: toPublicRoom(room), playerId: socket.data.playerId });
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('room:join')
  async onJoinRoom(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: JoinRoomPayload,
  ): Promise<SocketResult<{ room: RoomState; playerId: string }>> {
    try {
      const room = await this.rooms.joinByCode(body.code, this.identity(socket));
      await this.bindToRoom(socket, room);
      this.emitter.toRoom(room.id, 'player:joined', {
        playerId: socket.data.playerId,
        username: socket.data.username,
      });
      this.emitter.roomState(room);
      await this.replayForLateJoiner(socket, room.id);
      return ok({ room: toPublicRoom(room), playerId: socket.data.playerId });
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('session:resume')
  async onResume(
    @ConnectedSocket() socket: GameSocket,
  ): Promise<SocketResult<{ room: RoomState; turn: TurnPublicState | null }>> {
    const sessionKey = socket.data.userId ?? socket.data.playerId;
    const session = await this.store.getSession(sessionKey);
    if (!session) return fail(SocketErrorCode.ROOM_NOT_FOUND, 'No active session');
    socket.data.playerId = session.playerId;
    try {
      const room = await this.rooms.join(session.roomId, this.identity(socket));
      await this.bindToRoom(socket, room);
      const turn = await this.game.currentTurnPublic(room.id);
      this.emitter.roomState(room);
      await this.replayForLateJoiner(socket, room.id);
      return ok({ room: toPublicRoom(room), turn });
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('room:leave')
  async onLeave(@ConnectedSocket() socket: GameSocket): Promise<SocketResult<void>> {
    const roomId = socket.data.roomId;
    if (roomId) {
      await socket.leave(roomId);
      const room = await this.rooms.removePlayer(roomId, socket.data.playerId);
      await this.store.clearSession(socket.data.userId ?? socket.data.playerId);
      this.emitter.toRoom(roomId, 'player:left', {
        playerId: socket.data.playerId,
        username: socket.data.username,
      });
      if (room) {
        this.emitter.roomState(room);
        await this.game.onPlayerGone(roomId, socket.data.playerId);
      }
      socket.data.roomId = null;
    }
    return ok(undefined as void);
  }

  @SubscribeMessage('room:settings')
  async onSettings(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: UpdateSettingsPayload,
  ): Promise<SocketResult<RoomState>> {
    const roomId = socket.data.roomId;
    if (!roomId) return fail(SocketErrorCode.ROOM_NOT_FOUND, 'Not in a room');
    try {
      const room = await this.rooms.updateSettings(roomId, socket.data.playerId, body.settings);
      this.emitter.roomState(room);
      return ok(toPublicRoom(room));
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('room:kick')
  async onKick(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: KickPayload,
  ): Promise<SocketResult<void>> {
    const roomId = socket.data.roomId;
    if (!roomId) return fail(SocketErrorCode.ROOM_NOT_FOUND, 'Not in a room');
    try {
      const room = await this.rooms.kick(roomId, socket.data.playerId, body.playerId);
      this.emitter.toRoom(roomId, 'player:kicked', { playerId: body.playerId });
      // Force the kicked socket(s) out of the room (works cross-node via adapter).
      const sockets = await this.server.in(roomId).fetchSockets();
      for (const s of sockets) {
        if (s.data.playerId === body.playerId) {
          await s.leave(roomId);
          s.data.roomId = null;
          s.emit('error', { code: SocketErrorCode.UNAUTHORIZED, message: 'You were kicked' });
        }
      }
      if (room) this.emitter.roomState(room);
      return ok(undefined as void);
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('host:transfer')
  async onTransfer(
    @ConnectedSocket() socket: GameSocket,
    @MessageBody() body: TransferHostPayload,
  ): Promise<SocketResult<void>> {
    const roomId = socket.data.roomId;
    if (!roomId) return fail(SocketErrorCode.ROOM_NOT_FOUND, 'Not in a room');
    try {
      const room = await this.rooms.transferHost(roomId, socket.data.playerId, body.playerId);
      this.emitter.roomState(room);
      return ok(undefined as void);
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('player:ready')
  async onReady(@ConnectedSocket() socket: GameSocket, @MessageBody() body: { ready: boolean }) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = await this.rooms.setReady(roomId, socket.data.playerId, !!body?.ready);
    if (room) this.emitter.roomState(room);
  }

  // ─── Game flow ───────────────────────────────────────────────────────────────
  @SubscribeMessage('game:start')
  async onStart(@ConnectedSocket() socket: GameSocket): Promise<SocketResult<void>> {
    const roomId = socket.data.roomId;
    if (!roomId) return fail(SocketErrorCode.ROOM_NOT_FOUND, 'Not in a room');
    try {
      await this.game.startGame(roomId, socket.data.playerId);
      return ok(undefined as void);
    } catch (e) {
      return fail(this.codeFor(e), (e as Error).message);
    }
  }

  @SubscribeMessage('word:select')
  async onSelectWord(@ConnectedSocket() socket: GameSocket, @MessageBody() body: SelectWordPayload) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    // Identity is taken from socket.data — a non-drawer choosing is rejected in-service.
    await this.game.selectWord(roomId, socket.data.playerId, Number(body?.choice) || 0, false);
  }

  // ─── Drawing stream ──────────────────────────────────────────────────────────
  private async assertDrawer(socket: GameSocket): Promise<LiveRoom | null> {
    const roomId = socket.data.roomId;
    if (!roomId) return null;
    const room = await this.store.getRoom(roomId);
    if (!room || room.phase !== GamePhase.DRAWING) return null;
    if (room.drawOrder[room.turnPointer] !== socket.data.playerId) return null;
    // Loose flood guard: ~1200 ops / 10s per drawer.
    const allowed = await this.redis.rateLimit(`rl:draw:${socket.data.playerId}`, 1200, 10);
    return allowed ? room : null;
  }

  @SubscribeMessage('draw:start')
  async onDrawStart(@ConnectedSocket() socket: GameSocket, @MessageBody() body: DrawStartPayload) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    const op = validateDrawStart(body);
    if (op) this.relay.enqueue(room.id, socket.id, { type: 'start', ...op });
  }

  @SubscribeMessage('draw:move')
  async onDrawMove(@ConnectedSocket() socket: GameSocket, @MessageBody() body: DrawMovePayload) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    const op = validateDrawMove(body);
    if (op) this.relay.enqueue(room.id, socket.id, { type: 'move', ...op });
  }

  @SubscribeMessage('draw:end')
  async onDrawEnd(@ConnectedSocket() socket: GameSocket, @MessageBody() body: DrawEndPayload) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    const op = validateDrawEnd(body);
    if (op) this.relay.enqueue(room.id, socket.id, { type: 'end', ...op });
  }

  @SubscribeMessage('draw:fill')
  async onDrawFill(@ConnectedSocket() socket: GameSocket, @MessageBody() body: FillPayload) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    const op = validateFill(body);
    if (op) this.relay.enqueue(room.id, socket.id, { type: 'fill', ...op });
  }

  @SubscribeMessage('draw:undo')
  async onDrawUndo(@ConnectedSocket() socket: GameSocket) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    this.relay.enqueue(room.id, socket.id, { type: 'undo', seq: Date.now() });
  }

  @SubscribeMessage('draw:clear')
  async onDrawClear(@ConnectedSocket() socket: GameSocket) {
    const room = await this.assertDrawer(socket);
    if (!room) return;
    this.relay.drop(room.id);
    await this.store.clearDrawBuffer(room.id);
    this.emitter.toRoomExcept(room.id, socket.id, 'drawing:cleared');
  }

  // ─── Guessing & chat ──────────────────────────────────────────────────────────
  @SubscribeMessage('guess:submit')
  async onGuess(@ConnectedSocket() socket: GameSocket, @MessageBody() body: GuessPayload) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const text = sanitizeText(body?.text);
    if (!text) return;
    const allowed = await this.redis.rateLimit(`rl:guess:${socket.data.playerId}`, 10, 5);
    if (!allowed) {
      socket.emit('error', { code: SocketErrorCode.RATE_LIMITED, message: 'Slow down!' });
      return;
    }

    const result = await this.game.handleGuess(
      roomId,
      socket.data.playerId,
      socket.data.username,
      text,
    );
    if (!result.handled) {
      // Ordinary wrong guess — surfaces in chat for everyone (skribbl behavior).
      this.emitter.toRoom(roomId, 'chat:message', {
        id: randomUUID(),
        playerId: socket.data.playerId,
        username: socket.data.username,
        text,
        kind: 'chat',
        timestamp: Date.now(),
      });
    }
  }

  @SubscribeMessage('chat:message')
  async onChat(@ConnectedSocket() socket: GameSocket, @MessageBody() body: ChatPayload) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const text = sanitizeText(body?.text);
    if (!text) return;
    const allowed = await this.redis.rateLimit(`rl:chat:${socket.data.playerId}`, 6, 5);
    if (!allowed) return;
    await this.routeChat(socket, roomId, text);
  }

  /**
   * Anti-leak chat routing. During DRAWING, the drawer and players who have
   * already guessed can only talk to each other (the "post-guess channel"), so
   * they can't reveal the word to players who are still guessing.
   */
  private async routeChat(socket: GameSocket, roomId: string, text: string) {
    const msg = {
      id: randomUUID(),
      playerId: socket.data.playerId,
      username: socket.data.username,
      text,
      kind: 'chat' as const,
      timestamp: Date.now(),
    };
    const room = await this.store.getRoom(roomId);
    if (!room || room.phase !== GamePhase.DRAWING) {
      this.emitter.toRoom(roomId, 'chat:message', msg);
      return;
    }
    const sender = room.players.find((p) => p.id === socket.data.playerId);
    const drawerId = room.drawOrder[room.turnPointer];
    const senderIsInsider = !!sender && (sender.hasGuessed || sender.id === drawerId);
    if (!senderIsInsider) {
      // A still-guessing player typing in chat is treated as plain chat.
      this.emitter.toRoom(roomId, 'chat:message', msg);
      return;
    }
    // Deliver only to the insider channel (drawer + already-guessed players).
    const insiders = room.players.filter((p) => p.hasGuessed || p.id === drawerId);
    for (const p of insiders) {
      if (p.socketId) this.emitter.toSocket(p.socketId, 'chat:message', msg);
    }
  }

  // ─── Error mapping ────────────────────────────────────────────────────────────
  private codeFor(e: unknown): SocketErrorCode {
    const name = (e as { constructor?: { name?: string } })?.constructor?.name;
    switch (name) {
      case 'NotFoundException':
        return SocketErrorCode.ROOM_NOT_FOUND;
      case 'ForbiddenException':
        return SocketErrorCode.NOT_HOST;
      case 'BadRequestException':
        return SocketErrorCode.INVALID_PAYLOAD;
      default:
        return SocketErrorCode.INTERNAL;
    }
  }
}

/** Strip control chars / angle brackets and cap length to defang chat XSS. */
function sanitizeText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return cleanChat(raw);
}

function cleanChat(raw: string): string {
  return raw
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .trim()
    .slice(0, 120);
}
