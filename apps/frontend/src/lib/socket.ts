import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@skribble/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '';

let socket: AppSocket | null = null;

/**
 * Lazily create the singleton socket. The access token + display identity ride
 * along in the handshake `auth` payload so the server can authenticate before
 * any event is processed. Auto-reconnect is on; the app calls `session:resume`
 * after a reconnect to re-bind to its room.
 */
export function getSocket(auth: { token?: string; username?: string; avatar?: string }): AppSocket {
  if (socket) {
    socket.auth = auth;
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(SOCKET_URL, {
    path: '/socket',
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    auth,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function currentSocket(): AppSocket | null {
  return socket;
}

/** Promise wrapper around an emit-with-ack so callers can `await` a result. */
export function emitAck<T>(
  s: AppSocket,
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket ack timed out')), 8000);
    // socket.io types are loose for dynamic emit; the runtime contract is sound.
    (s.emit as (...a: unknown[]) => void)(event, ...args, (res: unknown) => {
      clearTimeout(timeout);
      resolve(res as T);
    });
  });
}
