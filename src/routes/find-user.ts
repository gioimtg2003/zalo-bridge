import { ZaloApiError } from 'zca-js';
import type { API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

export function createFindUserHandler(api: API) {
  return async function handleFindUser(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const phone = url.searchParams.get('phone')?.trim();

    if (!phone) {
      return json({ ok: false, error: 'missing required query param: phone' }, 400);
    }

    try {
      const user = await api.findUser(phone);
      logger.info('/find-user found', { phone, uid: user.uid });
      return json({ ok: true, user });
    } catch (err) {
      const isNotFound = err instanceof ZaloApiError && err.code === 216;
      if (isNotFound) {
        logger.warn('/find-user not found', { phone });
        return json({ ok: false, error: 'user not found' }, 404);
      }
      logger.error('/find-user failed', {
        error: err instanceof Error ? err.message : String(err),
        phone,
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'find failed' }, 500);
    }
  };
}
