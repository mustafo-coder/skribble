import { create } from 'zustand';
import { disconnectSocket, getSocket, type AppSocket } from '@/lib/socket';

type Status = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface SocketState {
  socket: AppSocket | null;
  status: Status;
  /** Open (or reuse) the connection with the current auth identity. */
  connect: (auth: { token?: string; username?: string; avatar?: string }) => AppSocket;
  disconnect: () => void;
}

/**
 * Owns the singleton socket lifecycle and exposes connection status to the UI
 * (for the "reconnecting…" banner). Domain event wiring lives in
 * features/game/useGameSocket so this store stays transport-only.
 */
export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  status: 'disconnected',

  connect(auth) {
    const existing = get().socket;
    if (existing?.connected) return existing;

    set({ status: 'connecting' });
    const socket = getSocket(auth);

    socket.on('connect', () => set({ status: 'connected' }));
    socket.on('disconnect', () => set({ status: 'reconnecting' }));
    socket.io.on('reconnect_attempt', () => set({ status: 'reconnecting' }));
    socket.io.on('reconnect', () => set({ status: 'connected' }));

    set({ socket });
    return socket;
  },

  disconnect() {
    disconnectSocket();
    set({ socket: null, status: 'disconnected' });
  },
}));
