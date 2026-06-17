import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '@skribble/shared';
import type { LiveRoom } from './game.types';
import { toPublicRoom } from './mappers';

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Typed broadcast facade. The gateway binds the live Socket.IO `Server` here in
 * `afterInit`, so both the gateway and the GameService (whose timers fire
 * outside any request) can emit through one type-safe surface. All emits route
 * through the Redis adapter, reaching sockets on every node.
 */
@Injectable()
export class GameEmitter {
  private io: IoServer | null = null;

  bind(server: IoServer) {
    this.io = server;
  }

  get server(): IoServer {
    if (!this.io) throw new Error('GameEmitter not bound — gateway afterInit missing');
    return this.io;
  }

  toRoom<E extends keyof ServerToClientEvents>(
    roomId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.server.to(roomId).emit(event, ...args);
  }

  /** Emit to everyone in the room EXCEPT one socket (e.g. the drawer). */
  toRoomExcept<E extends keyof ServerToClientEvents>(
    roomId: string,
    exceptSocketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.server.to(roomId).except(exceptSocketId).emit(event, ...args);
  }

  /** Emit to a single socket (works cross-node via the adapter). */
  toSocket<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    this.server.to(socketId).emit(event, ...args);
  }

  /** Convenience: broadcast the public room snapshot. */
  roomState(room: LiveRoom) {
    this.toRoom(room.id, 'room:updated', toPublicRoom(room));
  }
}
