import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatBox } from './ChatBox';
import type { ChatMessage } from '@skribble/shared';

const msgs: ChatMessage[] = [
  { id: '1', playerId: 'p1', username: 'Alice', text: 'hello', kind: 'chat', timestamp: 1 },
  { id: '2', playerId: 'sys', username: 'System', text: 'Bob guessed the word!', kind: 'correct', timestamp: 2 },
];

describe('ChatBox', () => {
  it('renders chat and correct-guess lines', () => {
    render(<ChatBox messages={msgs} onSend={() => {}} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('Bob guessed the word!')).toBeInTheDocument();
  });

  it('submits trimmed text and clears the input', () => {
    const onSend = vi.fn();
    render(<ChatBox messages={[]} onSend={onSend} />);
    const input = screen.getByPlaceholderText(/type your guess/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  dog  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSend).toHaveBeenCalledWith('dog');
    expect(input.value).toBe('');
  });

  it('does not submit empty input', () => {
    const onSend = vi.fn();
    render(<ChatBox messages={[]} onSend={onSend} />);
    const input = screen.getByPlaceholderText(/type your guess/i);
    fireEvent.submit(input.closest('form')!);
    expect(onSend).not.toHaveBeenCalled();
  });
});
