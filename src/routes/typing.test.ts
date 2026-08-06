import { expect, test } from 'bun:test';
import { ThreadType, type API } from 'zca-js';

import { createTypingHandler } from './typing';

const calls: Array<[string, ThreadType | undefined]> = [];
const api = {
  sendTypingEvent: async (threadId: string, type?: ThreadType) => {
    calls.push([threadId, type]);
    return { status: 0 };
  },
} as unknown as API;

const handleTyping = createTypingHandler(api);

function post(body: unknown): Request {
  return new Request('http://x/typing', { method: 'POST', body: JSON.stringify(body) });
}

test('group typing hits the group thread', async () => {
  const res = await handleTyping(post({ threadId: 'group_777', threadType: 'group' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, status: 0 });
  expect(calls.at(-1)).toEqual(['group_777', ThreadType.Group]);
});

test('user typing hits the user thread', async () => {
  await handleTyping(post({ threadId: 'user_555', threadType: 'user' }));
  expect(calls.at(-1)).toEqual(['user_555', ThreadType.User]);
});

test('bad input is rejected before touching zalo', async () => {
  const before = calls.length;
  expect((await handleTyping(post({ threadType: 'group' }))).status).toBe(400);
  expect((await handleTyping(post({ threadId: 'g', threadType: 'channel' }))).status).toBe(400);
  expect(calls.length).toBe(before);
});
