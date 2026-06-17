import { DEFAULT_PALETTE } from '@skribble/shared';

interface Props {
  value: string;
  onChange: (color: string) => void;
}

/** Palette + native color input for arbitrary colors. */
export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid grid-cols-9 gap-1">
        {DEFAULT_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`color ${c}`}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded border ${
              value === c ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-slate-800' : 'border-black/20'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded bg-transparent"
        aria-label="custom color"
      />
    </div>
  );
}
