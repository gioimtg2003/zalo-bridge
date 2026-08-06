import { ThreadType, type API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface BroadcastBody {
  message: string;
  groupIds?: string[];
}

const DEFAULT_BROADCAST_GROUPS = (process.env['BROADCAST_GROUP_IDS'] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

export function createNotiBroadcastHandler(api: API) {
  return async function handleNotiBroadcast(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const b = body as Partial<BroadcastBody>;
    if (!b.message?.trim()) {
      return json({ ok: false, error: 'missing required field: message' }, 400);
    }

    const targets = b.groupIds?.length ? b.groupIds : DEFAULT_BROADCAST_GROUPS;
    if (targets.length === 0) {
      return json(
        { ok: false, error: 'no target groups — provide groupIds or set BROADCAST_GROUP_IDS' },
        400,
      );
    }

    logger.info('/noti-broadcast sending', { count: targets.length });

    try {
      await Promise.all(
        targets.map((groupId) => api.sendMessage({ msg: b.message! }, groupId, ThreadType.Group)),
      );
      logger.info('/noti-broadcast sent', { count: targets.length });
      return json({ ok: true, sent: targets.length });
    } catch (err) {
      logger.error('/noti-broadcast send failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json({ ok: false, error: 'send failed' }, 500);
    }
  };
}
