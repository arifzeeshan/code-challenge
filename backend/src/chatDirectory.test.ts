import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChatDirectory, normalizeConnectionId, normalizeMessage } from './chatDirectory';

function createDirectory(): ChatDirectory {
  let sequence = 0;
  return new ChatDirectory(
    () => `id-${++sequence}`,
    () => new Date('2026-06-09T09:00:00.000Z')
  );
}

describe('ChatDirectory', () => {
  it('normalizes and validates user-entered connection IDs', () => {
    const directory = createDirectory();

    assert.equal(normalizeConnectionId('  Alice Desk  '), 'Alice-Desk');
    assert.deepEqual(directory.register('socket-a', 'ab'), {
      ok: false,
      error: 'Choose a connection ID with at least 3 letters or numbers.'
    });
    assert.deepEqual(directory.register('socket-a', 'alice!'), {
      ok: false,
      error: 'Use letters, numbers, dots, dashes or underscores only.'
    });
  });

  it('makes same-socket re-registration idempotent, including during an active chat', () => {
    const directory = createDirectory();

    directory.register('socket-a', 'alice');
    directory.register('socket-b', 'bob');
    directory.startChat('socket-a', 'bob');

    const repeatRegistration = directory.register('socket-a', 'alice');
    assert.equal(repeatRegistration.ok, true);
    assert.equal(repeatRegistration.user?.userId, 'alice');
    assert.deepEqual(directory.register('socket-a', 'carol'), {
      ok: false,
      error: 'Leave your active chat before changing connection ID.'
    });
  });

  it('replaces an idle duplicate connection ID and keeps the online list sorted', () => {
    const directory = createDirectory();

    directory.register('socket-b', 'bob');
    directory.register('socket-a', 'alice');
    const replacement = directory.register('socket-c', 'alice');

    assert.equal(replacement.ok, true);
    assert.equal(replacement.replacedSocketId, 'socket-a');
    assert.equal(replacement.user?.userId, 'alice');
    assert.equal(directory.getUserBySocketId('socket-a'), undefined);
    assert.deepEqual(directory.listOnlineUserIds(), ['alice', 'bob']);
  });

  it('rejects self-chat, offline targets, and busy targets', () => {
    const directory = createDirectory();

    directory.register('socket-a', 'alice');
    directory.register('socket-b', 'bob');
    directory.register('socket-c', 'carol');
    directory.startChat('socket-b', 'carol');

    assert.deepEqual(directory.startChat('socket-a', 'alice'), {
      ok: false,
      error: "Enter another user's connection ID."
    });
    assert.deepEqual(directory.startChat('socket-a', 'dave'), {
      ok: false,
      error: 'That user is not online.'
    });
    assert.deepEqual(directory.startChat('socket-a', 'bob'), {
      ok: false,
      error: 'That user is already in another chat.'
    });
  });

  it('starts a one-to-one chat only when both users are online and available', () => {
    const directory = createDirectory();

    assert.deepEqual(directory.startChat('missing-socket', 'bob'), {
      ok: false,
      error: 'Register your connection ID before starting a chat.'
    });
    directory.register('socket-a', 'alice');
    directory.register('socket-b', 'bob');

    const started = directory.startChat('socket-a', 'bob');

    assert.equal(started.ok, true);
    assert.equal(started.chat?.id, 'id-1');
    assert.deepEqual(started.chat?.participantIds, ['alice', 'bob']);
    assert.deepEqual(directory.startChat('socket-a', 'bob'), {
      ok: false,
      error: 'You are already in a chat.'
    });
  });

  it('normalizes messages, rejects blank messages, and clears both participants when a chat ends', () => {
    const directory = createDirectory();

    directory.register('socket-a', 'alice');
    directory.register('socket-b', 'bob');
    const started = directory.startChat('socket-a', 'bob');

    assert.equal(normalizeMessage('  hello\n\n\n\n\nthere  '), 'hello\n\n\nthere');
    assert.deepEqual(directory.buildMessage('socket-a', '   '), {
      ok: false,
      error: 'Type a message before sending.'
    });

    const message = directory.buildMessage('socket-a', '  Hello Bob  ');
    assert.equal(message.ok, true);
    assert.equal(message.message?.id, 'id-2');
    assert.equal(message.message?.chatId, started.chat?.id);
    assert.equal(message.message?.senderId, 'alice');
    assert.equal(message.message?.text, 'Hello Bob');

    const ended = directory.endChat('socket-b');
    assert.equal(ended.ok, true);
    assert.equal(ended.endedBy, 'bob');
    assert.equal(directory.getUserBySocketId('socket-a')?.activeChatId, undefined);
    assert.equal(directory.getUserBySocketId('socket-b')?.activeChatId, undefined);
    assert.deepEqual(directory.buildMessage('socket-a', 'hello again'), {
      ok: false,
      error: 'You are not in an active chat.'
    });
  });

  it('unregisters users and ends their active chat', () => {
    const directory = createDirectory();

    directory.register('socket-a', 'alice');
    directory.register('socket-b', 'bob');
    const started = directory.startChat('socket-a', 'bob');

    const ended = directory.unregister('socket-a');

    assert.equal(ended?.ok, true);
    assert.equal(ended?.chat?.id, started.chat?.id);
    assert.equal(ended?.endedBy, 'alice');
    assert.equal(directory.getUserBySocketId('socket-a'), undefined);
    assert.equal(directory.getUserBySocketId('socket-b')?.activeChatId, undefined);
    assert.equal(directory.unregister('socket-a'), undefined);
  });
});
