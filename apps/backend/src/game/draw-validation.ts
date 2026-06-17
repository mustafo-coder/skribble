import type {
  DrawEndPayload,
  DrawMovePayload,
  DrawStartPayload,
  FillPayload,
  StrokePoint,
} from '@skribble/shared';

/**
 * Defensive validation/sanitization for inbound drawing payloads. Never trust
 * the client: clamp coordinates, bound widths, validate colors, and cap array
 * sizes so a malicious client can't OOM the server or desync other clients.
 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_POINTS_PER_MOVE = 256;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

function sanitizePoint(p: StrokePoint): StrokePoint {
  return { x: clamp01(p?.x), y: clamp01(p?.y) };
}

function sanitizeColor(c: string): string {
  return HEX_RE.test(c) ? c.toLowerCase() : '#000000';
}

function sanitizeWidth(w: number): number {
  // normalized line width in (0, 0.2] of canvas height
  return Number.isFinite(w) ? Math.max(0.002, Math.min(0.2, w)) : 0.01;
}

export function validateDrawStart(p: DrawStartPayload): DrawStartPayload | null {
  if (!p?.strokeId || typeof p.strokeId !== 'string' || p.strokeId.length > 64) return null;
  if (!['PEN', 'ERASER', 'FILL'].includes(p.tool as string)) return null;
  return {
    strokeId: p.strokeId,
    tool: p.tool,
    color: sanitizeColor(p.color),
    width: sanitizeWidth(p.width),
    point: sanitizePoint(p.point),
    seq: Number.isFinite(p.seq) ? p.seq : 0,
  };
}

export function validateDrawMove(p: DrawMovePayload): DrawMovePayload | null {
  if (!p?.strokeId || !Array.isArray(p.points) || p.points.length === 0) return null;
  return {
    strokeId: p.strokeId,
    points: p.points.slice(0, MAX_POINTS_PER_MOVE).map(sanitizePoint),
    seq: Number.isFinite(p.seq) ? p.seq : 0,
  };
}

export function validateDrawEnd(p: DrawEndPayload): DrawEndPayload | null {
  if (!p?.strokeId) return null;
  return { strokeId: p.strokeId, seq: Number.isFinite(p.seq) ? p.seq : 0 };
}

export function validateFill(p: FillPayload): FillPayload | null {
  if (!p?.point) return null;
  return {
    point: sanitizePoint(p.point),
    color: sanitizeColor(p.color),
    seq: Number.isFinite(p.seq) ? p.seq : 0,
  };
}
