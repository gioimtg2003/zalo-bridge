import { ThreadType, type API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface DeliveredOrderEvent {
  tracking_code: string;
  dealer_id: string;
  delivered_at: string;
  /** Pre-generated message from LLM worker. If present, sent as-is; otherwise template is applied. */
  message?: string;
}

const GROUP_DELIVERED_ORDER = (process.env['GROUP_DELIVERED_ORDER'] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

export function createNotiDeliveredHandler(api: API) {
  return async function handleNotiDelivered(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const event = body as DeliveredOrderEvent;
    if (!event.tracking_code || !event.delivered_at) {
      logger.warn('/noti-delivered invalid payload', { body });
      return json({ ok: false, error: 'missing required fields' }, 400);
    }

    if (GROUP_DELIVERED_ORDER.length === 0) {
      logger.warn('/noti-delivered GROUP_DELIVERED_ORDER not configured — no groups to notify');
      return json({ ok: true, sent: 0 });
    }

    const msg =
      event.message?.trim() ||
      [
        '✅ ĐÃ GIAO HÀNG',
        `Mã đơn: ${event.tracking_code}`,
        `Dealer: ${event.dealer_id}`,
      ].join('\n');

    logger.info('/noti-delivered sending', { groups: GROUP_DELIVERED_ORDER.join(', ') });

    try {
      await Promise.all(
        GROUP_DELIVERED_ORDER.map((groupId) => api.sendMessage({ msg }, groupId, ThreadType.Group)),
      );
      logger.info('/noti-delivered sent', { tracking_code: event.tracking_code });
      return json({ ok: true, sent: GROUP_DELIVERED_ORDER.length });
    } catch (err) {
      logger.error('/noti-delivered send failed', {
        error: err instanceof Error ? err.message : String(err),
        tracking_code: event.tracking_code,
      });
      return json({ ok: false, error: 'send failed' }, 500);
    }
  };
}
