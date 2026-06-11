import {
  MAX_MESSAGE_LENGTH,
  normalizeMessage,
} from '../../../../shared/chatRules';
import type { ChatMessage, ChatStartedPayload } from '../../types/socket';

export interface MessageValidation {
  valid: boolean;
  text: string;
  error?: string;
}

export { MAX_MESSAGE_LENGTH };

export function sanitizeOutgoingMessage(value: string): MessageValidation {
  const text = normalizeMessage(value);

  if (!text) {
    return { valid: false, text, error: 'Type a message before sending.' };
  }

  return { valid: true, text };
}

export function appendUniqueMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (messages.some((message) => message.id === incoming.id)) {
    return messages;
  }
  return [...messages, incoming];
}

export function isValidChatSession(
  value: unknown,
): value is ChatStartedPayload {
  const session = value as Partial<ChatStartedPayload>;
  return Boolean(
    session?.chatId &&
    session.startedAt &&
    session.selfUserId &&
    session.peerUserId,
  );
}

export function formatMessageTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
