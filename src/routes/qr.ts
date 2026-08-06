import { getPendingQR } from '../zalo-client';
import { json } from '../http';

export function handleQR(_req: Request): Response {
  const qr = getPendingQR();
  if (!qr) return json({ ok: false, error: 'no QR pending' }, 404);
  return new Response(new Uint8Array(qr), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    },
  });
}
