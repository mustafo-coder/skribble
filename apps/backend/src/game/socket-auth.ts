import { randomUUID } from 'node:crypto';
import type { Socket } from 'socket.io';
import type { SocketData } from '@skribble/shared';
import type { TokenService } from '../auth/token.service';

/**
 * Authenticates a socket during the handshake. The access token may arrive via
 * `socket.handshake.auth.token` (preferred) or the Authorization header.
 *
 * Guests are allowed: if there is no/invalid token we still permit the
 * connection but with `userId = null`, deriving an ephemeral identity. (Tighten
 * to reject anonymous connections by throwing here if guest play is disabled.)
 *
 * The returned object is the TRUSTED identity written to `socket.data`. The
 * gateway never reads identity from client event payloads.
 */
export function authenticateSocket(socket: Socket, tokens: TokenService): SocketData {
  const raw =
    (socket.handshake.auth?.token as string | undefined) ??
    extractBearer(socket.handshake.headers?.authorization);

  if (raw) {
    try {
      const payload = tokens.verifyAccess(raw);
      return {
        userId: payload.sub,
        playerId: payload.sub, // registered users: stable playerId == userId
        username: payload.username,
        avatar: (socket.handshake.auth?.avatar as string) ?? 'avatar-01',
        roomId: null,
      };
    } catch {
      /* fall through to guest */
    }
  }

  // Anonymous guest fallback — ephemeral, not persisted.
  const guestName =
    (socket.handshake.auth?.username as string)?.slice(0, 20) || `Guest${shortId()}`;
  return {
    userId: null,
    playerId: `guest_${randomUUID()}`,
    username: guestName,
    avatar: (socket.handshake.auth?.avatar as string) ?? 'avatar-01',
    roomId: null,
  };
}

function extractBearer(header?: string): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

function shortId() {
  return Math.random().toString(36).slice(2, 8);
}
