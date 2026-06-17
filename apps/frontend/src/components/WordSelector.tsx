import type { WordChoicesPayload } from '@skribble/shared';
import { Timer } from './Timer';

interface Props {
  choices: WordChoicesPayload;
  onSelect: (index: number) => void;
}

const DIFF_COLOR = {
  EASY: 'bg-green-600',
  MEDIUM: 'bg-amber-600',
  HARD: 'bg-red-600',
} as const;

/** Drawer's word-choice modal with a live selection-timeout countdown. */
export function WordSelector({ choices, onSelect }: Props) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="card w-[min(90vw,32rem)] text-center">
        <h2 className="mb-1 text-xl font-bold">Choose a word to draw</h2>
        <div className="mb-4 flex justify-center">
          <Timer endsAt={choices.endsAt} totalSec={15} />
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {choices.choices.map((c, i) => (
            <button
              key={`${c.word}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              className="btn-ghost flex-col gap-1 px-5 py-3"
            >
              <span className="text-lg font-bold">{c.word}</span>
              <span className={`rounded px-2 py-0.5 text-xs text-white ${DIFF_COLOR[c.difficulty]}`}>
                {c.difficulty}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
