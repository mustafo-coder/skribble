import type { RoundEndedPayload } from '@skribble/shared';

/** Round-end overlay: reveals the word and the per-player points gained. */
export function ScoreBoard({ result }: { result: RoundEndedPayload }) {
  const gained = [...result.results].sort((a, b) => b.delta - a.delta);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="card w-[min(90vw,28rem)] text-center">
        <p className="text-sm uppercase tracking-wide text-slate-400">The word was</p>
        <p className="mb-3 text-2xl font-extrabold text-brand-300">{result.word}</p>
        <ul className="space-y-1 text-left">
          {gained.map((r) => (
            <li key={r.playerId} className="flex items-center justify-between rounded px-2 py-1 odd:bg-slate-700/30">
              <span className="truncate font-medium">{r.username}</span>
              <span className={r.delta > 0 ? 'font-semibold text-green-400' : 'text-slate-500'}>
                {r.delta > 0 ? `+${r.delta}` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
