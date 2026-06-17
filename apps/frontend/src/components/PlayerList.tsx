import type { PublicPlayer } from '@skribble/shared';

interface Props {
  players: PublicPlayer[];
  hostId: string;
  myPlayerId: string | null;
  canManage: boolean;
  onKick?: (playerId: string) => void;
}

/** Ranked roster with host badge, drawing/guessed indicators, and kick control. */
export function PlayerList({ players, hostId, myPlayerId, canManage, onKick }: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <ul className="flex flex-col gap-1">
      {ranked.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
            p.hasGuessed ? 'bg-green-600/20' : 'bg-slate-700/40'
          } ${!p.connected ? 'opacity-50' : ''}`}
        >
          <span className="w-5 text-center text-xs text-slate-400">#{i + 1}</span>
          <Avatar avatar={p.avatar} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate text-sm font-semibold">
              <span className="truncate">{p.username}</span>
              {p.id === myPlayerId && <span className="text-brand-400">(you)</span>}
              {p.id === hostId && <span title="Host">👑</span>}
            </div>
            <div className="text-xs text-slate-400">{p.score} pts</div>
          </div>
          {p.isDrawing && <span title="Drawing">✏️</span>}
          {p.hasGuessed && <span title="Guessed">✅</span>}
          {canManage && p.id !== myPlayerId && (
            <button
              type="button"
              onClick={() => onKick?.(p.id)}
              className="rounded px-1 text-xs text-red-400 hover:bg-red-500/20"
              title="Kick"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Avatar({ avatar }: { avatar: string }) {
  // Deterministic emoji avatar from the avatar id.
  const emojis = ['🦊', '🐼', '🦉', '🐯', '🐸', '🐙', '🦄', '🐵', '🐧', '🐨', '🦁', '🐮'];
  const idx = parseInt(avatar.replace(/\D/g, ''), 10) % emojis.length || 0;
  return <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-600">{emojis[idx]}</span>;
}
