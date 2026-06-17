import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DrawTool, GamePhase } from '@skribble/shared';
import { useRoomStore } from '@/stores/roomStore';
import { useGameStore } from '@/stores/gameStore';
import { useGameConnection } from '@/features/game/useGameConnection';
import { drawingBridge } from '@/features/game/drawingBridge';
import { currentSocket } from '@/lib/socket';
import type { CanvasEngine } from '@/components/canvas/CanvasEngine';
import type { CanvasEmit } from '@/components/canvas/useCanvasInput';
import { Canvas } from '@/components/Canvas';
import { BrushControls } from '@/components/BrushControls';
import { ColorPicker } from '@/components/ColorPicker';
import { ChatBox } from '@/components/ChatBox';
import { PlayerList } from '@/components/PlayerList';
import { Timer } from '@/components/Timer';
import { WordSelector } from '@/components/WordSelector';
import { ScoreBoard } from '@/components/ScoreBoard';
import { Leaderboard } from '@/components/Leaderboard';

export function RoomPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const actions = useGameConnection();

  const room = useRoomStore((s) => s.room);
  const myPlayerId = useRoomStore((s) => s.myPlayerId);
  const { turn, wordChoices, myWord, maskedWord, chat, roundResult, gameResult, guessedIds } =
    useGameStore();

  // Local brush state
  const [tool, setTool] = useState<DrawTool>(DrawTool.PEN);
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(0.012);
  const engineRef = useRef<CanvasEngine | null>(null);

  // Ensure we're actually joined to the room named in the URL.
  useEffect(() => {
    const current = useRoomStore.getState().room;
    if (!current || current.code !== code) {
      void actions.joinRoom(code).then((res) => {
        if (!res.ok) navigate('/lobby');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Stable emit object for the canvas (reads the live socket at call time).
  const emit: CanvasEmit = useMemo(
    () => ({
      start: (p) => currentSocket()?.emit('draw:start', p),
      move: (p) => currentSocket()?.emit('draw:move', p),
      end: (p) => currentSocket()?.emit('draw:end', p),
      fill: (p) => currentSocket()?.emit('draw:fill', p),
    }),
    [],
  );

  if (!room) return <div className="grid h-screen place-items-center text-slate-300">Joining…</div>;

  const me = room.players.find((p) => p.id === myPlayerId);
  const amHost = room.hostId === myPlayerId;
  const amDrawing = !!me?.isDrawing;
  const amGuesser = !amDrawing && room.phase === GamePhase.DRAWING;
  const iGuessed = !!myPlayerId && guessedIds.has(myPlayerId);

  // Word display: drawer & guessed players see the real word; others see blanks.
  const wordDisplay = amDrawing || iGuessed ? myWord ?? maskedWord : maskedWord;

  const onUndo = () => {
    engineRef.current?.apply({ type: 'undo', seq: Date.now() });
    actions.drawUndo();
  };
  const onClear = () => {
    engineRef.current?.clear();
    actions.drawClear();
  };

  // Chat vs guess routing for the single input box.
  const sendFromInput = (text: string) => {
    if (amGuesser && !iGuessed) actions.guess(text);
    else actions.chat(text);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3">
      {/* ── Top bar ── */}
      <header className="card flex flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-3">
          {room.phase !== GamePhase.LOBBY && turn && (
            <Timer endsAt={turn.endsAt} totalSec={room.settings.drawTimeSec} />
          )}
          <div>
            <p className="text-xs uppercase text-slate-400">
              Round {room.currentRound}/{room.settings.rounds}
            </p>
            <p className="font-mono text-lg tracking-[0.3em]">
              {room.phase === GamePhase.DRAWING ? wordDisplay : room.settings.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <InviteButton code={room.code} />
          <button className="btn-ghost h-8 px-3" onClick={() => { actions.leave(); navigate('/lobby'); }}>
            Leave
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[14rem_1fr_18rem]">
        {/* ── Players ── */}
        <aside className="card">
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-400">Players</h2>
          <PlayerList
            players={room.players}
            hostId={room.hostId}
            myPlayerId={myPlayerId}
            canManage={amHost && room.phase === GamePhase.LOBBY}
            onKick={actions.kick}
          />
        </aside>

        {/* ── Stage ── */}
        <main className="relative">
          {room.phase === GamePhase.LOBBY ? (
            <WaitingRoom
              amHost={amHost}
              canStart={room.players.filter((p) => p.connected).length >= 2}
              ready={!!me?.isReady}
              onReady={(r) => actions.ready(r)}
              onStart={actions.start}
            />
          ) : room.phase === GamePhase.GAME_END && gameResult ? (
            <Leaderboard
              entries={gameResult.leaderboard}
              canReplay={amHost}
              onReplay={actions.start}
              onLeave={() => { actions.leave(); navigate('/lobby'); }}
            />
          ) : (
            <>
              <Canvas
                drawable={amDrawing && room.phase === GamePhase.DRAWING}
                tool={tool}
                color={color}
                width={width}
                emit={emit}
                onEngineReady={(e) => {
                  engineRef.current = e;
                  drawingBridge.register(e);
                }}
              />

              {/* Drawer tools */}
              {amDrawing && room.phase === GamePhase.DRAWING && (
                <div className="card mt-2 flex flex-col gap-2">
                  <ColorPicker value={color} onChange={setColor} />
                  <BrushControls
                    tool={tool}
                    width={width}
                    onTool={setTool}
                    onWidth={setWidth}
                    onUndo={onUndo}
                    onClear={onClear}
                  />
                </div>
              )}

              {/* Overlays */}
              {room.phase === GamePhase.WORD_SELECTION &&
                (amDrawing && wordChoices ? (
                  <WordSelector choices={wordChoices} onSelect={actions.selectWord} />
                ) : (
                  <Overlay>{room.players.find((p) => p.isDrawing)?.username ?? 'Someone'} is choosing a word…</Overlay>
                ))}
              {room.phase === GamePhase.ROUND_END && roundResult && <ScoreBoard result={roundResult} />}
            </>
          )}
        </main>

        {/* ── Chat ── */}
        <aside className="card flex h-[28rem] flex-col lg:h-auto">
          <h2 className="mb-2 text-sm font-bold uppercase text-slate-400">Chat</h2>
          <ChatBox
            messages={chat}
            disabled={amDrawing && room.phase === GamePhase.DRAWING}
            placeholder={amGuesser && !iGuessed ? 'Type your guess…' : 'Chat…'}
            onSend={sendFromInput}
          />
        </aside>
      </div>
    </div>
  );
}

function WaitingRoom({
  amHost,
  canStart,
  ready,
  onReady,
  onStart,
}: {
  amHost: boolean;
  canStart: boolean;
  ready: boolean;
  onReady: (r: boolean) => void;
  onStart: () => void;
}) {
  return (
    <div className="card grid min-h-[24rem] place-items-center text-center">
      <div>
        <p className="mb-4 text-2xl font-bold">Waiting room</p>
        <p className="mb-6 text-slate-400">
          {canStart ? 'Ready when you are!' : 'Waiting for at least 2 players…'}
        </p>
        {amHost ? (
          <button className="btn-primary px-8 text-lg" disabled={!canStart} onClick={onStart}>
            Start game
          </button>
        ) : (
          <button className={ready ? 'btn-ghost px-8' : 'btn-primary px-8'} onClick={() => onReady(!ready)}>
            {ready ? "I'm not ready" : "I'm ready"}
          </button>
        )}
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/50 text-lg font-semibold text-white backdrop-blur-sm">
      {children}
    </div>
  );
}

function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = `${window.location.origin}/room/${code}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button className="btn-ghost h-8 px-3 font-mono" onClick={copy} title="Copy invite link">
      {copied ? 'Copied!' : code}
    </button>
  );
}
