import { ThreadType, type API, type Mention, type SendMessageQuote } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface SendBody {
  threadId: string;
  threadType: 'user' | 'group';
  message: string;
  quote?: {
    msgId: string;
    cliMsgId: string;
    content: string;
    uidFrom: string;
    ts: number;
  };
  mentions?: Array<{ pos: number; uid: string; len: number }>;
}

export function createSendHandler(api: API) {
  return async function handleSend(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<SendBody>;
    if (!b.threadId || !b.threadType || !b.message) {
      return json(
        { ok: false, error: 'missing required fields: threadId, threadType, message' },
        400,
      );
    }
    if (b.threadType !== 'user' && b.threadType !== 'group') {
      return json({ ok: false, error: 'threadType must be "user" or "group"' }, 400);
    }

    const threadType = b.threadType === 'group' ? ThreadType.Group : ThreadType.User;

    let quote: SendMessageQuote | undefined;
    if (b.quote) {
      const q = b.quote;
      if (!q.msgId || !q.cliMsgId || !q.content || !q.uidFrom || q.ts === undefined) {
        return json({ ok: false, error: 'quote missing required fields' }, 400);
      }
      quote = {
        content: q.content,
        msgType: '0',
        propertyExt: undefined,
        uidFrom: q.uidFrom,
        msgId: q.msgId,
        cliMsgId: q.cliMsgId,
        ts: String(q.ts),
        ttl: 0,
      };
    }

    let mentions: Mention[] | undefined;
    if (b.mentions && Array.isArray(b.mentions) && b.mentions.length > 0) {
      for (const m of b.mentions) {
        if (
          !m ||
          typeof m.pos !== 'number' ||
          typeof m.len !== 'number' ||
          typeof m.uid !== 'string' ||
          !m.uid
        ) {
          return json({ ok: false, error: 'mentions must be {pos:number,len:number,uid:string}' }, 400);
        }
      }
      mentions = b.mentions.map((m) => ({ pos: m.pos, len: m.len, uid: m.uid }));
    }

    try {
      const result = await api.sendMessage(
        { msg: b.message, quote, mentions },
        b.threadId,
        threadType,
      );
      logger.info('/send sent', {
        threadId: b.threadId,
        threadType: b.threadType,
        mentions: mentions?.length ?? 0,
      });
      return json({ ok: true, msgId: result.message?.msgId ?? null });
    } catch (err) {
      logger.error('/send failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: b.threadId,
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'send failed' }, 500);
    }
  };
}
