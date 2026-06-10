import { randomUUID } from 'crypto';
import {
  getConnectionIdError,
  normalizeConnectionId,
  normalizeMessage,
  type ChatId,
  type UserId
} from '../../shared/chatRules';
import type { ChatMessage } from '../../shared/socketEvents';

export type SocketId = string;

export interface UserSession {
  userId: UserId;
  socketId: SocketId;
  activeChatId?: ChatId;
}

export interface ChatSession {
  id: ChatId;
  participantIds: [UserId, UserId];
  socketIds: [SocketId, SocketId];
  startedAt: string;
}

export interface RegisterResult {
  ok: boolean;
  user?: UserSession;
  replacedSocketId?: SocketId;
  error?: string;
}

export interface StartChatResult {
  ok: boolean;
  chat?: ChatSession;
  error?: string;
}

export interface MessageResult {
  ok: boolean;
  message?: ChatMessage;
  error?: string;
}

export interface EndChatResult {
  ok: boolean;
  chat?: ChatSession;
  endedBy?: UserId;
  error?: string;
}

type IdFactory = () => string;
type Clock = () => Date;

export { normalizeConnectionId, normalizeMessage };

export class ChatDirectory {
  private usersBySocketId = new Map<SocketId, UserSession>();
  private socketIdByUserId = new Map<UserId, SocketId>();
  private chatsById = new Map<ChatId, ChatSession>();

  constructor(
    private readonly idFactory: IdFactory = randomUUID,
    private readonly clock: Clock = () => new Date()
  ) {}

  register(socketId: SocketId, rawUserId: UserId): RegisterResult {
    const userId = normalizeConnectionId(rawUserId);
    const validationError = getConnectionIdError(userId);

    if (validationError) {
      return { ok: false, error: validationError };
    }

    const existingForSocket = this.usersBySocketId.get(socketId);
    if (existingForSocket?.userId === userId) {
      return { ok: true, user: existingForSocket };
    }

    if (existingForSocket?.activeChatId) {
      return {
        ok: false,
        error: 'Leave your active chat before changing connection ID.'
      };
    }

    if (existingForSocket) {
      this.socketIdByUserId.delete(existingForSocket.userId);
    }

    const replacedSocketId = this.socketIdByUserId.get(userId);
    if (replacedSocketId && replacedSocketId !== socketId) {
      const replacedUser = this.usersBySocketId.get(replacedSocketId);
      if (replacedUser?.activeChatId) {
        return {
          ok: false,
          error: 'That connection ID is already in an active chat.'
        };
      }
      this.usersBySocketId.delete(replacedSocketId);
    }

    const user: UserSession = { socketId, userId };
    this.usersBySocketId.set(socketId, user);
    this.socketIdByUserId.set(userId, socketId);

    return { ok: true, user, replacedSocketId };
  }

  startChat(requesterSocketId: SocketId, targetUserIdInput: UserId): StartChatResult {
    const requester = this.usersBySocketId.get(requesterSocketId);
    if (!requester) {
      return {
        ok: false,
        error: 'Register your connection ID before starting a chat.'
      };
    }

    if (requester.activeChatId) {
      return { ok: false, error: 'You are already in a chat.' };
    }

    const targetUserId = normalizeConnectionId(targetUserIdInput);
    const validationError = getConnectionIdError(targetUserId);
    if (validationError) {
      return { ok: false, error: validationError };
    }

    if (requester.userId === targetUserId) {
      return { ok: false, error: "Enter another user's connection ID." };
    }

    const targetSocketId = this.socketIdByUserId.get(targetUserId);
    if (!targetSocketId) {
      return { ok: false, error: 'That user is not online.' };
    }

    const target = this.usersBySocketId.get(targetSocketId);
    if (!target) {
      this.socketIdByUserId.delete(targetUserId);
      return { ok: false, error: 'That user is no longer online.' };
    }

    if (target.activeChatId) {
      return { ok: false, error: 'That user is already in another chat.' };
    }

    const chat: ChatSession = {
      id: this.idFactory(),
      participantIds: [requester.userId, target.userId],
      socketIds: [requester.socketId, target.socketId],
      startedAt: this.clock().toISOString()
    };

    requester.activeChatId = chat.id;
    target.activeChatId = chat.id;
    this.chatsById.set(chat.id, chat);

    return { ok: true, chat };
  }

  buildMessage(senderSocketId: SocketId, rawText: string): MessageResult {
    const sender = this.usersBySocketId.get(senderSocketId);
    if (!sender?.activeChatId) {
      return { ok: false, error: 'You are not in an active chat.' };
    }

    const chat = this.chatsById.get(sender.activeChatId);
    if (!chat) {
      sender.activeChatId = undefined;
      return { ok: false, error: 'This chat has ended.' };
    }

    const text = normalizeMessage(rawText);
    if (!text) {
      return { ok: false, error: 'Type a message before sending.' };
    }

    return {
      ok: true,
      message: {
        id: this.idFactory(),
        chatId: chat.id,
        senderId: sender.userId,
        text,
        sentAt: this.clock().toISOString()
      }
    };
  }

  endChat(socketId: SocketId): EndChatResult {
    const user = this.usersBySocketId.get(socketId);
    if (!user?.activeChatId) {
      return { ok: false, error: 'No active chat to end.' };
    }

    const chat = this.chatsById.get(user.activeChatId);
    if (!chat) {
      user.activeChatId = undefined;
      return { ok: false, error: 'No active chat to end.' };
    }

    this.closeChat(chat.id);
    return { ok: true, chat, endedBy: user.userId };
  }

  unregister(socketId: SocketId): EndChatResult | undefined {
    const user = this.usersBySocketId.get(socketId);
    if (!user) {
      return undefined;
    }

    const endedChat = user.activeChatId ? this.endChat(socketId) : undefined;
    this.usersBySocketId.delete(socketId);
    this.socketIdByUserId.delete(user.userId);

    return endedChat?.ok ? endedChat : undefined;
  }

  getUserBySocketId(socketId: SocketId): UserSession | undefined {
    return this.usersBySocketId.get(socketId);
  }

  listOnlineUserIds(): UserId[] {
    return Array.from(this.socketIdByUserId.keys()).sort((a, b) => a.localeCompare(b));
  }

  private closeChat(chatId: ChatId): void {
    const chat = this.chatsById.get(chatId);
    if (!chat) {
      return;
    }

    chat.socketIds.forEach((participantSocketId) => {
      const participant = this.usersBySocketId.get(participantSocketId);
      if (participant?.activeChatId === chatId) {
        participant.activeChatId = undefined;
      }
    });

    this.chatsById.delete(chatId);
  }
}
