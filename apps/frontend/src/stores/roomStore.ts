import { create } from 'zustand';
import type { PublicPlayer, RoomState } from '@skribble/shared';

interface RoomStoreState {
  room: RoomState | null;
  /** This client's room-scoped player id (returned on create/join). */
  myPlayerId: string | null;

  setRoom: (room: RoomState) => void;
  setMyPlayerId: (id: string) => void;
  clear: () => void;

  // Derived selectors (call from components for convenience).
  me: () => PublicPlayer | null;
  isHost: () => boolean;
  drawer: () => PublicPlayer | null;
  amDrawing: () => boolean;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  room: null,
  myPlayerId: null,

  setRoom: (room) => set({ room }),
  setMyPlayerId: (id) => set({ myPlayerId: id }),
  clear: () => set({ room: null, myPlayerId: null }),

  me: () => {
    const { room, myPlayerId } = get();
    return room?.players.find((p) => p.id === myPlayerId) ?? null;
  },
  isHost: () => {
    const { room, myPlayerId } = get();
    return !!room && room.hostId === myPlayerId;
  },
  drawer: () => get().room?.players.find((p) => p.isDrawing) ?? null,
  amDrawing: () => get().me()?.isDrawing ?? false,
}));
