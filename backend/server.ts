import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import CONFIG from './config';
import { ChatDirectory, type ChatSession } from './src/chatDirectory';
import {
  CONNECTION_REPLACED_ERROR_CODE,
  CONNECTION_REPLACED_MESSAGE,
  type ChatEndedPayload,
  type ChatStartedPayload,
  type ClientToServerEvents,
  type ServerToClientEvents
} from './src/socketEvents';

const app = express();
const httpServer = http.createServer(app);
const chatDirectory = new ChatDirectory();

const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' }
});

function onlineUsersPayload() {
  return { users: chatDirectory.listOnlineUserIds() };
}

function emitOnlineUsers(): void {
  io.emit('users:online', onlineUsersPayload());
}

function buildChatStartedPayloads(chat: ChatSession): Array<{ socketId: string; payload: ChatStartedPayload }> {
  const [requesterUserId, targetUserId] = chat.participantIds;
  const [requesterSocketId, targetSocketId] = chat.socketIds;

  return [
    {
      socketId: requesterSocketId,
      payload: {
        chatId: chat.id,
        startedAt: chat.startedAt,
        selfUserId: requesterUserId,
        peerUserId: targetUserId
      }
    },
    {
      socketId: targetSocketId,
      payload: {
        chatId: chat.id,
        startedAt: chat.startedAt,
        selfUserId: targetUserId,
        peerUserId: requesterUserId
      }
    }
  ];
}

function emitChatEnded(payload: ChatEndedPayload, socketIds: string[]): void {
  socketIds.forEach((socketId) => {
    io.to(socketId).emit('chat:ended', payload);
  });
  emitOnlineUsers();
}

app.use(cors({ origin: '*' }));

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'wave-chat',
    onlineUserCount: chatDirectory.listOnlineUserIds().length
  });
});

io.on('connection', (socket) => {
  socket.emit('users:online', onlineUsersPayload());

  socket.on('user:register', (payload, ack) => {
    const result = chatDirectory.register(socket.id, payload.userId);
    if (!result.ok || !result.user) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    if (result.replacedSocketId) {
      io.to(result.replacedSocketId).emit('error:message', {
        message: CONNECTION_REPLACED_MESSAGE,
        code: CONNECTION_REPLACED_ERROR_CODE
      });
    }

    ack?.({ ok: true, data: { userId: result.user.userId } });
    emitOnlineUsers();
  });

  socket.on('chat:request', (payload, ack) => {
    const result = chatDirectory.startChat(socket.id, payload.targetUserId);
    if (!result.ok || !result.chat) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    const chat = result.chat;
    chat.socketIds.forEach((participantSocketId) => {
      io.sockets.sockets.get(participantSocketId)?.join(chat.id);
    });

    const startedPayloads = buildChatStartedPayloads(chat);
    startedPayloads.forEach(({ socketId, payload: startedPayload }) => {
      io.to(socketId).emit('chat:started', startedPayload);
    });

    ack?.({ ok: true, data: startedPayloads[0].payload });
    emitOnlineUsers();
  });

  socket.on('message:send', (payload, ack) => {
    const user = chatDirectory.getUserBySocketId(socket.id);
    if (!user?.activeChatId || user.activeChatId !== payload.chatId) {
      ack?.({ ok: false, error: 'You are not in this chat.' });
      return;
    }

    const result = chatDirectory.buildMessage(socket.id, payload.text);
    if (!result.ok || !result.message) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    io.to(result.message.chatId).emit('message:received', result.message);
    ack?.({ ok: true, data: result.message });
  });

  socket.on('chat:end', (ack) => {
    const result = chatDirectory.endChat(socket.id);
    if (!result.ok || !result.chat) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    emitChatEnded(
      {
        chatId: result.chat.id,
        endedBy: result.endedBy,
        reason: 'manual'
      },
      result.chat.socketIds
    );
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const result = chatDirectory.unregister(socket.id);
    if (!result?.chat) {
      emitOnlineUsers();
      return;
    }

    emitChatEnded(
      {
        chatId: result.chat.id,
        endedBy: result.endedBy,
        reason: 'disconnect'
      },
      result.chat.socketIds.filter((socketId) => socketId !== socket.id)
    );
  });
});

httpServer.listen(CONFIG.PORT, () => {
  console.log(`Server listening on *:${CONFIG.PORT} 🚀`);
});
