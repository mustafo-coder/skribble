import { DrawTool } from '@skribble/shared';

interface Props {
  tool: DrawTool;
  width: number; // normalized
  onTool: (t: DrawTool) => void;
  onWidth: (w: number) => void;
  onUndo: () => void;
  onClear: () => void;
}

const SIZES = [0.006, 0.012, 0.024, 0.045];

export function BrushControls({ tool, width, onTool, onWidth, onUndo, onClear }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolButton active={tool === DrawTool.PEN} label="✏️" onClick={() => onTool(DrawTool.PEN)} />
      <ToolButton active={tool === DrawTool.ERASER} label="🧽" onClick={() => onTool(DrawTool.ERASER)} />
      <ToolButton active={tool === DrawTool.FILL} label="🪣" onClick={() => onTool(DrawTool.FILL)} />

      <div className="mx-1 flex items-center gap-1">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onWidth(s)}
            className={`grid h-8 w-8 place-items-center rounded ${
              width === s ? 'bg-brand-600' : 'bg-slate-700'
            }`}
            aria-label={`brush ${s}`}
          >
            <span
              className="rounded-full bg-white"
              style={{ width: `${s * 120}px`, height: `${s * 120}px` }}
            />
          </button>
        ))}
      </div>

      <button type="button" className="btn-ghost h-8 px-3" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="btn-ghost h-8 px-3" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded text-lg ${
        active ? 'bg-brand-600' : 'bg-slate-700 hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  );
}
