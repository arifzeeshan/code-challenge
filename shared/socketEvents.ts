import type { ChatId, UserId } from "./chatRules";

export const CONNECTION_REPLACED_ERROR_CODE = "connection-replaced";
export const CONNECTION_REPLACED_MESSAGE =
  "This connection ID was opened in another browser window.";

export interface RegisterPayload {
  userId: UserId;
}

export interface ChatRequestPayload {
  targetUserId: UserId;
}

export interface MessageSendPayload {
  chatId: ChatId;
  text: string;
}

export interface AckResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ChatStartedPayload {
  chatId: ChatId;
  startedAt: string;
  selfUserId: UserId;
  peerUserId: UserId;
}

export interface ChatEndedPayload {
  chatId: ChatId;
  endedBy?: UserId;
  reason: "manual" | "disconnect";
}

export interface ChatMessage {
  id: string;
  chatId: ChatId;
  senderId: UserId;
  text: string;
  sentAt: string;
}

export interface ErrorMessagePayload {
  message: string;
  code?: typeof CONNECTION_REPLACED_ERROR_CODE;
}

export interface ServerToClientEvents {
  "users:online": (payload: { users: UserId[] }) => void;
  "chat:started": (payload: ChatStartedPayload) => void;
  "chat:ended": (payload: ChatEndedPayload) => void;
  "message:received": (payload: ChatMessage) => void;
  "error:message": (payload: ErrorMessagePayload) => void;
}

export interface ClientToServerEvents {
  "user:register": (
    payload: RegisterPayload,
    ack?: (response: AckResponse<{ userId: UserId }>) => void,
  ) => void;
  "chat:request": (
    payload: ChatRequestPayload,
    ack?: (response: AckResponse<ChatStartedPayload>) => void,
  ) => void;
  "message:send": (
    payload: MessageSendPayload,
    ack?: (response: AckResponse<ChatMessage>) => void,
  ) => void;
  "chat:end": (ack?: (response: AckResponse) => void) => void;
}
