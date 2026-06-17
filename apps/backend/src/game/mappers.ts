import type { PublicPlayer, RoomState, RoomSummary } from '@skribble/shared';
import type { LivePlayer, LiveRoom } from './game.types';

/** Strip server-only fields from a player before broadcasting. */
export function toPublicPlayer(p: LivePlayer): PublicPlayer {
  return {
    id: p.id,
    userId: p.userId,
    username: p.username,
    avatar: p.avatar,
    score: p.score,
    roundScore: p.roundScore,
    isHost: p.isHost,
    isReady: p.isReady,
    connected: p.connected,
    hasGuessed: p.hasGuessed,
    isDrawing: p.isDrawing,
    placement: p.placement,
  };
}

/** Convert internal LiveRoom -> the public RoomState broadcast shape. */
export function toPublicRoom(room: LiveRoom): RoomState {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: room.players.map(toPublicPlayer),
    currentRound: room.currentRound,
    turnIndex: room.turnPointer,
    createdAt: room.createdAt,
  };
}

export function toRoomSummary(room: LiveRoom): RoomSummary {
  return {
    id: room.id,
    code: room.code,
    name: room.settings.name,
    playerCount: room.players.filter((p) => p.connected).length,
    maxPlayers: room.settings.maxPlayers,
    isPrivate: room.settings.isPrivate,
    inProgress: room.phase !== 'LOBBY',
    language: room.settings.language,
  };
}
