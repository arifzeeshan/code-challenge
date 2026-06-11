import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../types/socket';
import {
  appendUniqueMessage,
  isValidChatSession,
  sanitizeOutgoingMessage,
} from './chatLogic';

const message: ChatMessage = {
  id: 'message-1',
  chatId: 'chat-1',
  senderId: 'arif',
  text: 'Hello',
  sentAt: '2026-06-09T09:00:00.000Z',
};

describe('chat message logic', () => {
  it('sanitizes outgoing messages before they are sent over the socket', () => {
    expect(sanitizeOutgoingMessage('   ')).toEqual({
      valid: false,
      text: '',
      error: 'Type a message before sending.',
    });
    expect(sanitizeOutgoingMessage('  hello\n\n\n\n\nthere  ')).toEqual({
      valid: true,
      text: 'hello\n\n\nthere',
    });
  });

  it('deduplicates socket echo messages by ID', () => {
    expect(appendUniqueMessage([], message)).toEqual([message]);
    expect(appendUniqueMessage([message], message)).toEqual([message]);
  });

  it('validates the flat chat session DTO used by the client', () => {
    expect(
      isValidChatSession({
        chatId: 'chat-1',
        startedAt: '2026-06-09T09:00:00.000Z',
        selfUserId: 'arif',
        peerUserId: 'saif',
      }),
    ).toBe(true);
    expect(
      isValidChatSession({ chat: { id: 'chat-1', socketIds: ['a', 'b'] } }),
    ).toBe(false);
  });
});
