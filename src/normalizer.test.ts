import { expect, test } from 'bun:test';
import { GroupMessage, UserMessage, type Message } from 'zca-js';

import { normalizeZaloMessage } from './normalizer';

const AGENT = 'agent_999';

test('direct message: no mentions carried over', () => {
  const raw = new UserMessage(AGENT, {
    msgId: 'msg_abc123',
    cliMsgId: 'cli_abc123',
    uidFrom: 'user_555',
    idTo: AGENT,
    msgType: 'webchat',
    dName: 'Ng',
    content: 'cho hỏi phí hoàn là bao nhiêu',
    ts: '1722840000000',
  } as UserMessage['data']) as Message;

  expect(normalizeZaloMessage(raw)).toEqual({
    msgId: 'msg_abc123',
    cliMsgId: 'cli_abc123',
    uidFrom: 'user_555',
    idTo: AGENT,
    msgType: 'webchat',
    senderName: "Ng",
    content: 'cho hỏi phí hoàn là bao nhiêu',
    mentions: [],
    ts: '1722840000000',
  });
});

test('photo message: caption kept, attachment flagged', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_ghi789',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'chat.photo',
    content: {
      title: '@DiLi tôi gửi minh chứng',
      description: '',
      href: 'https://photo.zdn.vn/a.jpg',
    },
    mentions: [],
    ts: '1722840002000',
  } as unknown as GroupMessage['data']) as Message;

  const normalized = normalizeZaloMessage(raw);
  expect(normalized.content).toBe('@DiLi tôi gửi minh chứng [Ảnh đính kèm] https://photo.zdn.vn/a.jpg');
  expect(normalized.imageUrl).toBe('https://photo.zdn.vn/a.jpg');
  expect(normalized.fileUrl).toBeUndefined();
});

test('file message: fileUrl, not imageUrl', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_mno345',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'chat.file',
    content: { title: 'bang ke.xlsx', description: '', href: 'https://f.zdn.vn/bangke.xlsx?token=1' },
    mentions: [],
    ts: '1722840004000',
  } as unknown as GroupMessage['data']) as Message;

  const normalized = normalizeZaloMessage(raw);
  expect(normalized.content).toBe('bang ke.xlsx [Tệp đính kèm] https://f.zdn.vn/bangke.xlsx?token=1');
  expect(normalized.fileUrl).toBe('https://f.zdn.vn/bangke.xlsx?token=1');
  expect(normalized.imageUrl).toBeUndefined();
});

test('voice message: audioUrl, not fileUrl', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_voice001',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'chat.voice',
    content: {
      title: '',
      description: '',
      href: 'https://f2-voice-aac-dl.zdn.vn/1525179782990861860/6c258722ecfd0fa356ec.aac',
    },
    mentions: [],
    ts: '1722840005000',
  } as unknown as GroupMessage['data']) as Message;

  const normalized = normalizeZaloMessage(raw);
  expect(normalized.content).toBe(
    '[Tin nhắn thoại] https://f2-voice-aac-dl.zdn.vn/1525179782990861860/6c258722ecfd0fa356ec.aac',
  );
  expect(normalized.audioUrl).toBe(
    'https://f2-voice-aac-dl.zdn.vn/1525179782990861860/6c258722ecfd0fa356ec.aac',
  );
  expect(normalized.fileUrl).toBeUndefined();
  expect(normalized.imageUrl).toBeUndefined();
});

test('photo message without caption: marker only', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_jkl012',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'chat.photo',
    content: { title: '', description: '', href: 'https://photo.zdn.vn/b.jpg' },
    mentions: [],
    ts: '1722840003000',
  } as unknown as GroupMessage['data']) as Message;

  expect(normalizeZaloMessage(raw).content).toBe('[Ảnh đính kèm] https://photo.zdn.vn/b.jpg');
});

test('group message: mentions kept verbatim', () => {
  const raw = new GroupMessage(AGENT, {
    msgId: 'msg_def456',
    cliMsgId: 'cli_def456',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'webchat',
    dName:"Ng",
    content: '@DiLi tra cứu đơn 123',
    mentions: [{ uid: AGENT, pos: 0, len: 5, type: 1 }],
    ts: '1722840001000',
  } as GroupMessage['data']) as Message;

  expect(normalizeZaloMessage(raw)).toEqual({
    msgId: 'msg_def456',
    cliMsgId: 'cli_def456',
    uidFrom: 'user_555',
    idTo: 'group_777',
    msgType: 'webchat',
    senderName: "Ng",
    content: '@DiLi tra cứu đơn 123',
    mentions: [{ uid: AGENT, pos: 0, len: 5, type: 1 }],
    ts: '1722840001000',
  });
});
