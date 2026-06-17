import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@skribble/shared';

interface Props {
  messages: ChatMessage[];
  disabled?: boolean;
  placeholder?: string;
  onSend: (text: string) => void;
}

/**
 * Combined chat + guess input. During the drawing phase the parent routes the
 * submitted text to `guess:submit`; otherwise to `chat:message`. Correct/close/
 * system lines render with distinct styling. Text is escaped by React, so chat
 * is XSS-safe on render (the server also sanitizes).
 */
export function ChatBox({ messages, disabled, placeholder, onSend }: Props) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-0.5 overflow-y-auto rounded-lg bg-slate-900/60 p-2 text-sm">
        {messages.map((m) => (
          <Line key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          className="input"
          value={text}
          maxLength={120}
          disabled={disabled}
          placeholder={placeholder ?? 'Type your guess…'}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn-primary px-3" disabled={disabled}>
          Send
        </button>
      </form>
    </div>
  );
}

function Line({ m }: { m: ChatMessage }) {
  if (m.kind === 'system')
    return <p className="italic text-slate-400">{m.text}</p>;
  if (m.kind === 'correct')
    return <p className="font-semibold text-green-400">{m.text}</p>;
  if (m.kind === 'close')
    return <p className="font-medium text-amber-400">{m.text}</p>;
  return (
    <p>
      <span className="font-semibold text-brand-300">{m.username}: </span>
      <span className="text-slate-200">{m.text}</span>
    </p>
  );
}
