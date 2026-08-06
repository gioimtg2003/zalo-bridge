import { ThreadType, type API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

interface CancelledOrderEvent {
  tracking_code: string;
  dealer_id: string;
  cancel_reason: string | null;
  cancelled_at: string;
  /** Pre-generated message from LLM worker. If present, sent as-is; otherwise template is applied. */
  message?: string;
}

const GROUP_CANCELED_ORDER = (process.env['GROUP_CANCELED_ORDER'] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^["']|["']$/g, ''))
  .filter(Boolean);

export function createNotiCanceledHandler(api: API) {
  return async function handleNotiCanceled(req: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: 'invalid json' }, 400);
    }

    const event = body as CancelledOrderEvent;
    if (!event.tracking_code || !event.cancelled_at) {
      logger.warn('/noti-canceled invalid payload', { body });
      return json({ ok: false, error: 'missing required fields' }, 400);
    }

    if (GROUP_CANCELED_ORDER.length === 0) {
      logger.error('/noti-canceled GROUP_CANCELED_ORDER not configured');
      return json({ ok: false, error: 'group not configured' }, 500);
    }

    const msg =
      event.message?.trim() ||
      [
        '🚫 ĐƠN HÀNG BỊ HỦY',
        `Mã đơn: ${event.tracking_code}`,
        `Dealer: ${event.dealer_id}`,
        `Lý do: ${event.cancel_reason ?? 'Không có'}`,
      ].join('\n');

    logger.info('/noti-canceled sending', { groups: GROUP_CANCELED_ORDER.join(', ') });

    try {
      await Promise.all(
        GROUP_CANCELED_ORDER.map((groupId) => api.sendMessage({ msg }, groupId, ThreadType.Group)),
      );
      logger.info('/noti-canceled sent', { tracking_code: event.tracking_code });
      return json({ ok: true });
    } catch (err) {
      logger.error('/noti-canceled send failed', {
        error: err instanceof Error ? err.message : String(err),
        tracking_code: event.tracking_code,
      });
      return json({ ok: false, error: 'send failed' }, 500);
    }
  };
}
