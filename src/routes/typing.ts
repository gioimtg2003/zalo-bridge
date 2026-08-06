import { ThreadType, type API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface TypingBody {
  threadId: string;
  threadType: 'user' | 'group';
}

export function createTypingHandler(api: API) {
  return async function handleTyping(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<TypingBody>;
    if (!b.threadId || !b.threadType) {
      return json({ ok: false, error: 'missing required fields: threadId, threadType' }, 400);
    }
    if (b.threadType !== 'user' && b.threadType !== 'group') {
      return json({ ok: false, error: 'threadType must be "user" or "group"' }, 400);
    }

    const threadType = b.threadType === 'group' ? ThreadType.Group : ThreadType.User;

    try {
      // ponytail: no info log — typing is fired every few seconds per thread
      const result = await api.sendTypingEvent(b.threadId, threadType);
      return json({ ok: true, status: result.status });
    } catch (err) {
      logger.error('/typing failed', {
        error: err instanceof Error ? err.message : String(err),
        threadId: b.threadId,
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'typing failed' }, 500);
    }
  };
}
