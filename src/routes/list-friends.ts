import type { API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

/** zca-js defaults: count=20000, page=1 */
function parsePositiveInt(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function createListFriendsHandler(api: API) {
  return async function handleListFriends(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const count = parsePositiveInt(url.searchParams.get('count'));
    const page = parsePositiveInt(url.searchParams.get('page'));

    try {
      const friends = await api.getAllFriends(count, page);
      logger.info('/friends listed', { count: friends.length, page });
      return json({ ok: true, friends });
    } catch (err) {
      logger.error('/friends failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'list failed' }, 500);
    }
  };
}
