import type { DrawOp, StrokePoint } from '@skribble/shared';

/**
 * Native Canvas 2D renderer for the drawing protocol.
 *
 * Why native canvas instead of Fabric/Konva (a deliberate, documented choice —
 * see docs/DESIGN-DECISIONS.md §Canvas):
 *   - The wire protocol is a stream of vector ops in NORMALIZED [0,1] coords, so
 *     every client renders identically at any resolution. Replaying thousands of
 *     points/turn as scene-graph nodes (Konva Lines / Fabric paths) is heavier
 *     than drawing directly to a 2D context.
 *   - The fill (paint-bucket) tool needs raster flood-fill on the pixel buffer,
 *     which a retained-mode scene graph doesn't model cleanly.
 *   - Deterministic ordered replay (for undo + late-join) is trivial when we own
 *     the op list ourselves.
 *
 * Undo/late-join correctness: we keep an ordered `history` of committed items
 * (strokes, fills, clears). Undo pops the last item and re-renders the whole
 * history; a freshly-joined viewer is sent the full op buffer and replays it.
 */
type Committed =
  | { kind: 'stroke'; tool: 'PEN' | 'ERASER'; color: string; width: number; points: StrokePoint[] }
  | { kind: 'fill'; point: StrokePoint; color: string };

const BG = '#ffffff';

export class CanvasEngine {
  private ctx: CanvasRenderingContext2D;
  private history: Committed[] = [];
  /** stroke currently being drawn, keyed by strokeId (one local + remote). */
  private live = new Map<string, Committed & { kind: 'stroke' }>();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.clear();
  }

  private get w() {
    return this.canvas.width;
  }
  private get h() {
    return this.canvas.height;
  }

  // ── Public op application (local echo + remote) ──────────────────────────────
  apply(op: DrawOp) {
    switch (op.type) {
      case 'start':
        this.live.set(op.strokeId, {
          kind: 'stroke',
          tool: op.tool === 'ERASER' ? 'ERASER' : 'PEN',
          color: op.color,
          width: op.width,
          points: [op.point],
        });
        return;
      case 'move': {
        const s = this.live.get(op.strokeId);
        if (!s) return;
        const from = s.points[s.points.length - 1];
        s.points.push(...op.points);
        // Draw only the new segment for performance.
        if (from) this.strokeSegment(s, from, op.points);
        return;
      }
      case 'end': {
        const s = this.live.get(op.strokeId);
        if (s) {
          this.history.push(s);
          this.live.delete(op.strokeId);
        }
        return;
      }
      case 'fill':
        this.history.push({ kind: 'fill', point: op.point, color: op.color });
        this.floodFill(op.point, op.color);
        return;
      case 'clear':
        this.clear();
        return;
      case 'undo':
        this.history.pop();
        this.redrawAll();
        return;
    }
  }

  applyMany(ops: DrawOp[]) {
    for (const op of ops) this.apply(op);
  }

  clear() {
    this.history = [];
    this.live.clear();
    this.ctx.fillStyle = BG;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  /** Re-render everything from scratch (used after undo / resize). */
  redrawAll() {
    this.ctx.fillStyle = BG;
    this.ctx.fillRect(0, 0, this.w, this.h);
    for (const item of this.history) {
      if (item.kind === 'stroke') this.renderWholeStroke(item);
      else this.floodFill(item.point, item.color);
    }
  }

  // ── Rendering primitives ─────────────────────────────────────────────────────
  private px(p: StrokePoint): [number, number] {
    return [p.x * this.w, p.y * this.h];
  }

  private strokeStyle(s: Committed & { kind: 'stroke' }) {
    this.ctx.lineWidth = Math.max(1, s.width * this.h);
    this.ctx.strokeStyle = s.tool === 'ERASER' ? BG : s.color;
  }

  private strokeSegment(
    s: Committed & { kind: 'stroke' },
    from: StrokePoint,
    next: StrokePoint[],
  ) {
    this.strokeStyle(s);
    this.ctx.beginPath();
    const [fx, fy] = this.px(from);
    this.ctx.moveTo(fx, fy);
    for (const p of next) {
      const [x, y] = this.px(p);
      this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  private renderWholeStroke(s: Committed & { kind: 'stroke' }) {
    if (s.points.length === 0) return;
    this.strokeStyle(s);
    this.ctx.beginPath();
    const [x0, y0] = this.px(s.points[0]!);
    this.ctx.moveTo(x0, y0);
    if (s.points.length === 1) {
      // a single tap → a dot
      this.ctx.lineTo(x0 + 0.01, y0);
    }
    for (const p of s.points.slice(1)) {
      const [x, y] = this.px(p);
      this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }

  /** Scanline-ish BFS flood fill with a small tolerance. */
  private floodFill(point: StrokePoint, hex: string) {
    const [sx, sy] = this.px(point).map(Math.round) as [number, number];
    if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) return;

    const img = this.ctx.getImageData(0, 0, this.w, this.h);
    const data = img.data;
    const target = this.colorAt(data, sx, sy);
    const fill = hexToRgba(hex);
    if (colorsClose(target, fill, 2)) return;

    const stack: number[] = [sy * this.w + sx];
    const tol = 32;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % this.w;
      const y = (idx - x) / this.w;
      const o = idx * 4;
      if (!colorsClose([data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!], target, tol)) continue;
      data[o] = fill[0];
      data[o + 1] = fill[1];
      data[o + 2] = fill[2];
      data[o + 3] = 255;
      if (x > 0) stack.push(idx - 1);
      if (x < this.w - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - this.w);
      if (y < this.h - 1) stack.push(idx + this.w);
    }
    this.ctx.putImageData(img, 0, 0);
  }

  private colorAt(data: Uint8ClampedArray, x: number, y: number): [number, number, number, number] {
    const o = (y * this.w + x) * 4;
    return [data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!];
  }

  /** Export the current canvas as a data URL (used for the round-end thumbnail). */
  toDataUrl() {
    return this.canvas.toDataURL('image/png');
  }
}

// ── color helpers ────────────────────────────────────────────────────────────
function hexToRgba(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    255,
  ];
}

function colorsClose(a: number[], b: number[], tol: number): boolean {
  return (
    Math.abs(a[0]! - b[0]!) <= tol &&
    Math.abs(a[1]! - b[1]!) <= tol &&
    Math.abs(a[2]! - b[2]!) <= tol &&
    Math.abs(a[3]! - b[3]!) <= tol
  );
}
