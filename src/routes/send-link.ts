import { ThreadType, type API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface SendLinkBody {
  threadId: string;
  threadType: 'user' | 'group';
  link: string;
  /** Text shown above the link preview. zca-js appends `link` if absent. */
  msg?: string;
  ttl?: number;
}

export function createSendLinkHandler(api: API) {
  return async function handleSendLink(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<SendLinkBody>;
    if (!b.threadId || !b.threadType || !b.link) {
      return json(
        { ok: false, error: 'missing required fields: threadId, threadType, link' },
        400,
      );
    }
    if (b.threadType !== 'user' && b.threadType !== 'group') {
      return json({ ok: false, error: 'threadType must be "user" or "group"' }, 400);
    }
    if (!/^https?:\/\//i.test(b.link)) {
      return json({ ok: false, error: 'link must be http(s)' }, 400);
    }
    if (b.msg !== undefined && typeof b.msg !== 'string') {
      return json({ ok: false, error: 'msg must be a string' }, 400);
    }
    if (b.ttl !== undefined && (typeof b.ttl !== 'number' || b.ttl < 0)) {
      return json({ ok: false, error: 'ttl must be a non-negative number (milliseconds)' }, 400);
    }

    const threadType = b.threadType === 'group' ? ThreadType.Group : ThreadType.User;

    try {
      const result = await api.sendLink(
        { link: b.link, msg: b.msg, ttl: b.ttl },
        b.threadId,
        threadType,
      );
      logger.info('/send-link sent', {
        threadId: b.threadId,
        threadType: b.threadType,
        link: b.link,
      });
      return json({ ok: true, msgId: result.msgId ?? null });
    } catch (err) {
      logger.error('/send-link failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: b.threadId,
        link: b.link,
      });
      return json(
        { ok: false, error: err instanceof Error ? err.message : 'send link failed' },
        500,
      );
    }
  };
}
