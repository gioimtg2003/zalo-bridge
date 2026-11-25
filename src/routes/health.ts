import { getAllLoginStatus } from '../zalo-client';
import { json } from '../http';

const startedAt = Date.now();

export function handleHealth(_req: Request): Response {
  return json({
    ok: true,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    accounts: getAllLoginStatus(),
  });
}
