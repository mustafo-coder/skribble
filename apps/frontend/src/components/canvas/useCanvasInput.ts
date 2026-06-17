import { useEffect, useRef } from 'react';
import type {
  DrawEndPayload,
  DrawMovePayload,
  DrawStartPayload,
  FillPayload,
  StrokePoint,
} from '@skribble/shared';
import { DrawTool } from '@skribble/shared';
import type { CanvasEngine } from './CanvasEngine';

export interface CanvasEmit {
  start: (p: DrawStartPayload) => void;
  move: (p: DrawMovePayload) => void;
  end: (p: DrawEndPayload) => void;
  fill: (p: FillPayload) => void;
}

interface Options {
  canvas: HTMLCanvasElement | null;
  engine: CanvasEngine | null;
  enabled: boolean;
  tool: DrawTool;
  color: string;
  /** normalized brush width (0..1 of canvas height) */
  width: number;
  emit: CanvasEmit;
}

/**
 * Captures pointer input on the canvas and produces network ops.
 *
 * Network-traffic optimization (a hard requirement): we NEVER emit a packet per
 * mouse-move. Points are accumulated in a ref and flushed once per animation
 * frame (~60Hz cap, effectively coalesced further by the server's 40ms relay).
 * The drawer's own strokes render locally on every event for zero-latency feel;
 * only the *transmission* is batched.
 */
export function useCanvasInput({ canvas, engine, enabled, tool, color, width, emit }: Options) {
  // Keep latest tool settings in refs so the event handlers (bound once) read fresh values.
  const cfg = useRef({ tool, color, width, enabled });
  cfg.current = { tool, color, width, enabled };

  const drawing = useRef(false);
  const strokeId = useRef<string | null>(null);
  const seq = useRef(0);
  const pending = useRef<StrokePoint[]>([]);
  const rafFlush = useRef<number | null>(null);

  useEffect(() => {
    if (!canvas || !engine) return;

    const toPoint = (e: PointerEvent): StrokePoint => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      };
    };

    const flush = () => {
      rafFlush.current = null;
      if (!strokeId.current || pending.current.length === 0) return;
      const points = pending.current;
      pending.current = [];
      emit.move({ strokeId: strokeId.current, points, seq: seq.current++ });
    };
    const scheduleFlush = () => {
      if (rafFlush.current == null) rafFlush.current = requestAnimationFrame(flush);
    };

    const onDown = (e: PointerEvent) => {
      if (!cfg.current.enabled) return;
      canvas.setPointerCapture(e.pointerId);
      const point = toPoint(e);
      const { tool, color, width } = cfg.current;

      if (tool === DrawTool.FILL) {
        const op = { point, color, seq: seq.current++ };
        engine.apply({ type: 'fill', ...op });
        emit.fill(op);
        return;
      }

      drawing.current = true;
      strokeId.current = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const startOp: DrawStartPayload = {
        strokeId: strokeId.current,
        tool,
        color,
        width,
        point,
        seq: seq.current++,
      };
      engine.apply({ type: 'start', ...startOp });
      emit.start(startOp);
    };

    const onMove = (e: PointerEvent) => {
      if (!drawing.current || !strokeId.current) return;
      // Coalesced pointer events give smoother lines with fewer packets.
      const events = (e.getCoalescedEvents?.() as PointerEvent[]) ?? [e];
      const pts = events.map(toPoint);
      engine.apply({ type: 'move', strokeId: strokeId.current, points: pts, seq: seq.current });
      pending.current.push(...pts);
      scheduleFlush();
    };

    const onUp = (e: PointerEvent) => {
      if (!drawing.current || !strokeId.current) return;
      flush(); // ship any buffered points before the end marker
      const id = strokeId.current;
      drawing.current = false;
      strokeId.current = null;
      engine.apply({ type: 'end', strokeId: id, seq: seq.current });
      emit.end({ strokeId: id, seq: seq.current++ });
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      if (rafFlush.current != null) cancelAnimationFrame(rafFlush.current);
    };
  }, [canvas, engine, emit]);
}
