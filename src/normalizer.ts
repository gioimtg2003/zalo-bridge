import { GroupMessage, type Message, type TMention } from 'zca-js';

export interface NormalizedMessage {
  msgId: string;
  uidFrom: string;
  idTo: string;
  msgType: string;
  content: string;
  mentions: TMention[];
  ts: string;
}

export function normalizeZaloMessage(raw: Message): NormalizedMessage {
  const data = raw.data;
  return {
    msgId: data.msgId,
    uidFrom: data.uidFrom,
    idTo: data.idTo,
    msgType: data.msgType,
    content: typeof data.content === 'string' ? data.content : '',
    mentions: raw instanceof GroupMessage ? (raw.data.mentions ?? []) : [],
    ts: data.ts,
  };
}
