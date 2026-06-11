import { describe, expect, it } from 'vitest';
import {
  canRequestChat,
  createDefaultConnectionId,
  normalizeConnectionId,
  validateConnectionId,
} from './homeLogic';

describe('home connection logic', () => {
  it('normalizes and validates connection IDs consistently', () => {
    expect(normalizeConnectionId('  Arif Desk  ')).toBe('Arif-Desk');
    expect(validateConnectionId('ab')).toBe(
      'Choose a connection ID with at least 3 letters or numbers.',
    );
    expect(validateConnectionId('arif!')).toBe(
      'Use letters, numbers, dots, dashes or underscores only.',
    );
  });

  it('generates readable default IDs and blocks invalid chat requests', () => {
    expect(createDefaultConnectionId(() => 0)).toBe('wave-0000');
    expect(canRequestChat('', 'saif', ['saif'])).toEqual({
      ready: false,
      reason: 'Go online with your connection ID first.',
    });
    expect(canRequestChat('arif', 'arif', ['arif', 'saif'])).toEqual({
      ready: false,
      reason: "Enter someone else's connection ID.",
    });
    expect(canRequestChat('arif', 'saif', ['arif', 'saif'])).toEqual({
      ready: true,
    });
    expect(canRequestChat('arif', 'kaif', ['arif', 'saif'])).toEqual({
      ready: false,
      reason: 'That user is not online right now.',
    });
    expect(canRequestChat('arif', 'saif', [])).toEqual({
      ready: false,
      reason: 'That user is not online right now.',
    });
  });
});
