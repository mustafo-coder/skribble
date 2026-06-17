import { useEffect, useState } from 'react';

/**
 * Countdown derived purely from the server-authoritative `endsAt` timestamp, so
 * it can't be cheated and self-corrects after a tab is backgrounded. We tick
 * locally (no per-second network traffic) and resync whenever `endsAt` changes.
 */
export function Timer({ endsAt, totalSec }: { endsAt: number; totalSec: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, (endsAt - Date.now()) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, (endsAt - Date.now()) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const secs = Math.ceil(remaining);
  const pct = totalSec > 0 ? Math.max(0, Math.min(1, remaining / totalSec)) : 0;
  const urgent = secs <= 10;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`grid h-10 w-10 place-items-center rounded-full font-bold tabular-nums ${
          urgent ? 'animate-pulse bg-red-500 text-white' : 'bg-slate-700 text-slate-100'
        }`}
      >
        {secs}
      </div>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full ${urgent ? 'bg-red-500' : 'bg-brand-500'}`}
          style={{ width: `${pct * 100}%`, transition: 'width 250ms linear' }}
        />
      </div>
    </div>
  );
}
