import { useEffect, useRef, useState } from 'react';
import { DrawTool } from '@skribble/shared';
import { CanvasEngine } from './canvas/CanvasEngine';
import { useCanvasInput, type CanvasEmit } from './canvas/useCanvasInput';

/** Internal canvas resolution. Fixed 4:3 so normalized ops map identically for all. */
const CANVAS_W = 1200;
const CANVAS_H = 900;

interface CanvasProps {
  drawable: boolean;
  tool: DrawTool;
  color: string;
  width: number; // normalized
  emit: CanvasEmit;
  /** Hands the engine to the parent so it can apply remote drawing:update ops. */
  onEngineReady: (engine: CanvasEngine) => void;
}

/**
 * Reusable drawing surface. Renders at a fixed internal resolution and scales
 * responsively via CSS (object-contain) so the same normalized op stream looks
 * identical on a phone or a desktop. `drawable` gates whether local input emits.
 */
export function Canvas({ drawable, tool, color, width, emit, onEngineReady }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [engine, setEngine] = useState<CanvasEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const eng = new CanvasEngine(canvasRef.current);
    setEngine(eng);
    onEngineReady(eng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useCanvasInput({
    canvas: canvasRef.current,
    engine,
    enabled: drawable,
    tool,
    color,
    width,
    emit,
  });

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-white shadow-inner">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="drawing-surface h-full w-full"
        style={{ cursor: drawable ? (tool === DrawTool.FILL ? 'cell' : 'crosshair') : 'default' }}
      />
      {!drawable && (
        <div className="pointer-events-none absolute inset-0" aria-hidden />
      )}
    </div>
  );
}
