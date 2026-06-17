import { useSocketStore } from '@/stores/socketStore';

/** Thin banner shown while the socket is reconnecting after a network blip. */
export function ConnectionBanner() {
  const status = useSocketStore((s) => s.status);
  if (status !== 'reconnecting') return null;
  return (
    <div className="sticky top-0 z-50 bg-amber-500/90 py-1 text-center text-sm font-semibold text-amber-950">
      Reconnecting…
    </div>
  );
}
