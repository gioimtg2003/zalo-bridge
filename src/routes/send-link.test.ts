import { expect, test } from 'bun:test';
import { ThreadType, type API, type SendLinkOptions } from 'zca-js';

import { createSendLinkHandler } from './send-link';

const calls: Array<[SendLinkOptions, string, ThreadType | undefined]> = [];
const api = {
  sendLink: async (options: SendLinkOptions, threadId: string, type?: ThreadType) => {
    calls.push([options, threadId, type]);
    return { msgId: 'msg_1' };
  },
} as unknown as API;

const handleSendLink = createSendLinkHandler(api);

function post(body: unknown): Request {
  return new Request('http://x/send-link', { method: 'POST', body: JSON.stringify(body) });
}

test('group link send forwards options to zalo', async () => {
  const res = await handleSendLink(
    post({
      threadId: 'group_777',
      threadType: 'group',
      link: 'https://dilim.vn/order/1',
      msg: 'Phiếu giao',
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, msgId: 'msg_1' });
  expect(calls.at(-1)).toEqual([
    { link: 'https://dilim.vn/order/1', msg: 'Phiếu giao', ttl: undefined },
    'group_777',
    ThreadType.Group,
  ]);
});

test('user link send hits the user thread', async () => {
  await handleSendLink(
    post({ threadId: 'user_555', threadType: 'user', link: 'http://dilim.vn' }),
  );
  expect(calls.at(-1)?.[2]).toBe(ThreadType.User);
});

test('bad input is rejected before touching zalo', async () => {
  const before = calls.length;
  expect((await handleSendLink(post({ threadType: 'group', link: 'https://a' }))).status).toBe(400);
  expect(
    (await handleSendLink(post({ threadId: 'g', threadType: 'channel', link: 'https://a' })))
      .status,
  ).toBe(400);
  expect(
    (await handleSendLink(post({ threadId: 'g', threadType: 'group', link: 'ftp://a' }))).status,
  ).toBe(400);
  expect(
    (await handleSendLink(post({ threadId: 'g', threadType: 'group', link: 'https://a', ttl: -1 })))
      .status,
  ).toBe(400);
  expect(calls.length).toBe(before);
});
