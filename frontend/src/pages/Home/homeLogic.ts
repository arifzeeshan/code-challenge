import {
  MAX_CONNECTION_ID_LENGTH,
  getConnectionIdError as validateConnectionId,
  normalizeConnectionId,
  type UserId,
} from '../../../../shared/chatRules';

export const USER_ID_STORAGE_KEY = 'wave-chat:user-id';
export {
  MAX_CONNECTION_ID_LENGTH,
  normalizeConnectionId,
  validateConnectionId,
};

export interface ChatReadiness {
  ready: boolean;
  reason?: string;
}

export function createDefaultConnectionId(
  random: () => number = Math.random,
): UserId {
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `wave-${suffix}`;
}

export function canRequestChat(
  selfUserId: UserId,
  targetUserId: UserId,
  onlineUsers: UserId[] = [],
): ChatReadiness {
  const normalizedSelf = normalizeConnectionId(selfUserId);
  const normalizedTarget = normalizeConnectionId(targetUserId);

  if (!normalizedSelf || validateConnectionId(normalizedSelf)) {
    return { ready: false, reason: 'Go online with your connection ID first.' };
  }

  const targetError = validateConnectionId(normalizedTarget);
  if (targetError) {
    return { ready: false, reason: targetError };
  }

  if (normalizedSelf === normalizedTarget) {
    return { ready: false, reason: "Enter someone else's connection ID." };
  }

  if (!onlineUsers.includes(normalizedTarget)) {
    return { ready: false, reason: 'That user is not online right now.' };
  }

  return { ready: true };
}

export function getStoredOrDefaultConnectionId(
  storage: Storage,
  random?: () => number,
): UserId {
  const stored = storage.getItem(USER_ID_STORAGE_KEY);
  return stored && !validateConnectionId(stored)
    ? stored
    : createDefaultConnectionId(random);
}
