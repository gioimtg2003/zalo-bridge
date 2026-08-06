import { expect, test } from 'bun:test';
import { GroupMessage, UserMessage, type Message } from 'zca-js';

import { normalizeZaloMessage } from './normalizer';

const AGENT = 'agent_999';

test('direct message: no mentions carried over', () => {
  const raw = new UserMessage(AGENT, {
    msgId: 'msg_abc123',
    uidFrom: 'user_555',
    idTo: AGENT,
    msgType: 'webchat',
    content: 'cho hỏi phí hoàn là bao nhiêu',
    ts: '1722840000000',
  } as UserMessage['data']) as Message;

  expect(normalizeZaloMessage(raw)).toEqual({
    msgId: 'msg_abc123',
    uidFrom: 'user_555',
    idTo: AGENT,
    msgType: 'webchat',
    content: 'cho hỏi phí hoàn là bao nhiêu',
    mentions: [],
    ts: '1722840000000',
  });
});

test('group message: mentions kept verbatim', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_def456',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'webchat',
    content: '@DiLi tra cứu đơn 123',
    mentions: [{ uid: AGENT, pos: 0, len: 5, type: 1 }],
    ts: '1722840001000',
  } as GroupMessage['data']) as Message;

  expect(normalizeZaloMessage(raw)).toEqual({
    msgId: 'msg_def456',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'webchat',
    content: '@DiLi tra cứu đơn 123',
    mentions: [{ uid: AGENT, pos: 0, len: 5, type: 1 }],
    ts: '1722840001000',
  });
});
