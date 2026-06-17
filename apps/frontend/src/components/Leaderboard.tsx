import type { LeaderboardEntry } from '@skribble/shared';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Final-results podium + ranked list shown at GAME_END. */
export function Leaderboard({
  entries,
  onReplay,
  onLeave,
  canReplay,
}: {
  entries: LeaderboardEntry[];
  onReplay: () => void;
  onLeave: () => void;
  canReplay: boolean;
}) {
  const winner = entries[0];
  return (
    <div className="mx-auto max-w-lg space-y-4 text-center">
      {winner && (
        <div className="card animate-pop">
          <p className="text-sm uppercase tracking-wide text-slate-400">Winner</p>
          <p className="text-3xl font-extrabold text-amber-400">🏆 {winner.username}</p>
          <p className="text-slate-300">{winner.score} points</p>
        </div>
      )}
      <ol className="card space-y-1">
        {entries.map((e) => (
          <li key={e.playerId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 odd:bg-slate-700/30">
            <span className="w-8 text-center text-lg">
              {MEDALS[e.placement - 1] ?? `#${e.placement}`}
            </span>
            <span className="flex-1 truncate text-left font-semibold">{e.username}</span>
            <span className="tabular-nums text-slate-300">{e.score}</span>
          </li>
        ))}
      </ol>
      <div className="flex justify-center gap-3">
        {canReplay && (
          <button type="button" className="btn-primary" onClick={onReplay}>
            Play again
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onLeave}>
          Back to lobby
        </button>
      </div>
    </div>
  );
}
