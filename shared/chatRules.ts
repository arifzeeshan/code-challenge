export type UserId = string;
export type ChatId = string;

export const MIN_CONNECTION_ID_LENGTH = 3;
export const MAX_CONNECTION_ID_LENGTH = 40;
export const MAX_MESSAGE_LENGTH = 1000;

const CONNECTION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function normalizeConnectionId(value: string): string {
  return value.trim().replace(/\s+/g, "-").slice(0, MAX_CONNECTION_ID_LENGTH);
}

export function getConnectionIdError(value: string): string | undefined {
  const normalized = normalizeConnectionId(value);

  if (normalized.length < MIN_CONNECTION_ID_LENGTH) {
    return "Choose a connection ID with at least 3 letters or numbers.";
  }

  if (!CONNECTION_ID_PATTERN.test(normalized)) {
    return "Use letters, numbers, dots, dashes or underscores only.";
  }

  return undefined;
}

export function isValidConnectionId(value: string): boolean {
  return getConnectionIdError(value) === undefined;
}

export function normalizeMessage(value: string): string {
  return value
    .trim()
    .replace(/\n{4,}/g, "\n\n\n")
    .slice(0, MAX_MESSAGE_LENGTH);
}
