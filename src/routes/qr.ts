import { getPendingQR, isKnownAccount } from '../zalo-client';
import { json } from '../http';

export function handleQR(req: Request): Response {
  const accountId = new URL(req.url).searchParams.get('account')?.trim();
  if (accountId && !isKnownAccount(accountId)) {
    return json({ ok: false, error: 'unknown zalo account' }, 400);
  }

  const qr = accountId ? getPendingQR(accountId) : getPendingQR();
  if (!qr) return json({ ok: false, error: 'no QR pending' }, 404);
  return new Response(new Uint8Array(qr), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    },
  });
}
