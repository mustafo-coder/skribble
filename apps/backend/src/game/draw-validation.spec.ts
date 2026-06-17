import { DrawTool } from '@skribble/shared';
import {
  validateDrawMove,
  validateDrawStart,
  validateFill,
} from './draw-validation';

describe('draw-validation', () => {
  it('clamps out-of-range coordinates into [0,1]', () => {
    const op = validateDrawStart({
      strokeId: 's1',
      tool: DrawTool.PEN,
      color: '#ff0000',
      width: 0.01,
      point: { x: 5, y: -3 },
      seq: 0,
    });
    expect(op).not.toBeNull();
    expect(op!.point).toEqual({ x: 1, y: 0 });
  });

  it('rejects an invalid hex color by falling back to black', () => {
    const op = validateDrawStart({
      strokeId: 's1',
      tool: DrawTool.PEN,
      color: 'javascript:alert(1)' as string,
      width: 0.01,
      point: { x: 0.5, y: 0.5 },
      seq: 0,
    });
    expect(op!.color).toBe('#000000');
  });

  it('bounds the brush width', () => {
    const thin = validateDrawStart(base({ width: 0.00001 }))!;
    const thick = validateDrawStart(base({ width: 99 }))!;
    expect(thin.width).toBeGreaterThanOrEqual(0.002);
    expect(thick.width).toBeLessThanOrEqual(0.2);
  });

  it('caps the number of points per move packet', () => {
    const points = Array.from({ length: 1000 }, () => ({ x: 0.5, y: 0.5 }));
    const op = validateDrawMove({ strokeId: 's1', points, seq: 1 });
    expect(op!.points.length).toBeLessThanOrEqual(256);
  });

  it('rejects an empty move', () => {
    expect(validateDrawMove({ strokeId: 's1', points: [], seq: 1 })).toBeNull();
  });

  it('rejects an unknown tool', () => {
    expect(validateDrawStart(base({ tool: 'LASER' as unknown as DrawTool }))).toBeNull();
  });

  it('sanitizes fill payloads', () => {
    const op = validateFill({ point: { x: 2, y: 0.3 }, color: '#00FF00', seq: 0 });
    expect(op!.point.x).toBe(1);
    expect(op!.color).toBe('#00ff00');
  });
});

function base(over: Partial<Parameters<typeof validateDrawStart>[0]> = {}) {
  return {
    strokeId: 's1',
    tool: DrawTool.PEN,
    color: '#000000',
    width: 0.01,
    point: { x: 0.5, y: 0.5 },
    seq: 0,
    ...over,
  } as Parameters<typeof validateDrawStart>[0];
}
