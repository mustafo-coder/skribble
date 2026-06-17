import type { DrawOp } from '@skribble/shared';
import type { CanvasEngine } from '@/components/canvas/CanvasEngine';

/**
 * Decouples the socket-event layer (which receives `drawing:update`) from the
 * React canvas component (which owns the engine). GamePage registers its engine
 * here on mount; the event hook pushes ops without needing a prop drill or
 * context re-render on every frame.
 */
let engine: CanvasEngine | null = null;

export const drawingBridge = {
  register(e: CanvasEngine | null) {
    engine = e;
  },
  apply(ops: DrawOp[]) {
    engine?.applyMany(ops);
  },
  clear() {
    engine?.clear();
  },
};
