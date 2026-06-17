import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  CreateRoomPayload,
  DrawEndPayload,
  DrawMovePayload,
  DrawStartPayload,
  FillPayload,
  RoomSettings,
  RoomState,
  SocketResult,
  TurnPublicState,
} from '@skribble/shared';
import { useAuthStore } from '@/stores/authStore';
import { useSocketStore } from '@/stores/socketStore';
import { useRoomStore } from '@/stores/roomStore';
import { useGameStore } from '@/stores/gameStore';
import { emitAck, type AppSocket } from '@/lib/socket';
import { drawingBridge } from './drawingBridge';

/**
 * The single integration point between the socket and the Zustand stores.
 * Mounted once by RoomPage. It:
 *   1. ensures the socket is connected with the current identity,
 *   2. wires every Server→Client event to the appropriate store,
 *   3. resumes the room on reconnect (replaying canvas + turn state),
 *   4. returns strongly-typed action emitters for the UI.
 */
export function useGameConnection() {
  const navigate = useNavigate();
  const { user, accessToken } = useAuthStore();
  const connect = useSocketStore((s) => s.connect);
  const socketRef = useRef<AppSocket | null>(null);

  // ── Connect + wire listeners (once per identity) ──
  useEffect(() => {
    if (!user) return;
    const socket = connect({
      token: accessToken ?? undefined,
      username: user.username,
      avatar: user.avatar,
    });
    socketRef.current = socket;

    const room = useRoomStore.getState();
    const game = useGameStore.getState();

    socket.on('room:updated', (r) => room.setRoom(r));
    socket.on('player:joined', ({ username }) =>
      game.addChat(sys(`${username} joined`)),
    );
    socket.on('player:left', ({ username }) => game.addChat(sys(`${username} left`)));
    socket.on('player:kicked', () => {});

    socket.on('game:started', ({ room: r }) => {
      room.setRoom(r);
      game.resetTurn();
    });
    socket.on('round:started', ({ turn, room: r }) => {
      room.setRoom(r);
      game.startTurn(turn);
      drawingBridge.clear();
    });
    socket.on('word:choices', (c) => game.setWordChoices(c));
    socket.on('word:assigned', ({ word }) => game.setMyWord(word));

    socket.on('drawing:update', ({ ops }) => drawingBridge.apply(ops));
    socket.on('drawing:cleared', () => drawingBridge.clear());

    socket.on('guess:correct', ({ playerId, word }) => {
      game.markGuessed(playerId);
      if (word) game.setMyWord(word); // delivered privately to the guesser
    });
    socket.on('guess:wrong', ({ close }) => {
      if (close) game.addChat(sys('So close!', 'close'));
    });
    socket.on('chat:message', (m) => game.addChat(m));
    socket.on('hint:reveal', ({ maskedWord }) => game.setMasked(maskedWord));

    socket.on('round:ended', (r) => {
      game.endRound(r);
      game.setMyWord(r.word); // reveal to everyone on the results card
    });
    socket.on('leaderboard:update', ({ entries }) =>
      useGameStore.setState({ leaderboard: entries }),
    );
    socket.on('game:ended', (g) => game.endGame(g));
    socket.on('error', (e) => game.addChat(sys(`⚠ ${e.message}`, 'system')));

    // Resume the room after an auto-reconnect.
    const onReconnect = async () => {
      const res = await emitAck<SocketResult<{ room: RoomState; turn: TurnPublicState | null }>>(
        socket,
        'session:resume',
      );
      if (res.ok) {
        room.setRoom(res.data.room);
        if (res.data.turn) game.startTurn(res.data.turn);
      }
    };
    socket.io.on('reconnect', () => void onReconnect());

    return () => {
      socket.off('room:updated');
      socket.off('round:started');
      socket.off('drawing:update');
      socket.off('drawing:cleared');
      socket.off('chat:message');
      socket.off('hint:reveal');
      socket.off('guess:correct');
      socket.off('guess:wrong');
      socket.off('round:ended');
      socket.off('game:ended');
      socket.off('game:started');
      socket.off('word:choices');
      socket.off('word:assigned');
      socket.off('player:joined');
      socket.off('player:left');
      socket.off('error');
    };
  }, [user, accessToken, connect]);

  // ── Action emitters ──
  const createRoom = useCallback(
    async (settings: Partial<RoomSettings>) => {
      const s = socketRef.current!;
      const res = await emitAck<SocketResult<{ room: RoomState; playerId: string }>>(
        s,
        'room:create',
        { settings } satisfies CreateRoomPayload,
      );
      if (res.ok) {
        useRoomStore.getState().setRoom(res.data.room);
        useRoomStore.getState().setMyPlayerId(res.data.playerId);
        navigate(`/room/${res.data.room.code}`);
      }
      return res;
    },
    [navigate],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      const s = socketRef.current!;
      const res = await emitAck<SocketResult<{ room: RoomState; playerId: string }>>(s, 'room:join', {
        code,
      });
      if (res.ok) {
        useRoomStore.getState().setRoom(res.data.room);
        useRoomStore.getState().setMyPlayerId(res.data.playerId);
      }
      return res;
    },
    [],
  );

  const actions = {
    createRoom,
    joinRoom,
    leave: () => socketRef.current?.emit('room:leave'),
    start: () => socketRef.current?.emit('game:start'),
    ready: (ready: boolean) => socketRef.current?.emit('player:ready', { ready }),
    selectWord: (choice: number) => socketRef.current?.emit('word:select', { choice }),
    kick: (playerId: string) => socketRef.current?.emit('room:kick', { playerId }),
    transferHost: (playerId: string) => socketRef.current?.emit('host:transfer', { playerId }),
    updateSettings: (settings: Partial<RoomSettings>) =>
      socketRef.current?.emit('room:settings', { settings }),
    guess: (text: string) => socketRef.current?.emit('guess:submit', { text }),
    chat: (text: string) => socketRef.current?.emit('chat:message', { text }),
    // drawing
    drawStart: (p: DrawStartPayload) => socketRef.current?.emit('draw:start', p),
    drawMove: (p: DrawMovePayload) => socketRef.current?.emit('draw:move', p),
    drawEnd: (p: DrawEndPayload) => socketRef.current?.emit('draw:end', p),
    drawFill: (p: FillPayload) => socketRef.current?.emit('draw:fill', p),
    drawUndo: () => socketRef.current?.emit('draw:undo'),
    drawClear: () => socketRef.current?.emit('draw:clear'),
  };

  return actions;
}

function sys(text: string, kind: 'system' | 'close' = 'system') {
  return {
    id: crypto.randomUUID(),
    playerId: 'system',
    username: 'System',
    text,
    kind: kind as 'system',
    timestamp: Date.now(),
  };
}
