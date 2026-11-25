import { getAllLoginStatus, getLoginStatus, isKnownAccount } from '../zalo-client';
import { json } from '../http';

export function handleStatus(req: Request): Response {
  const accountId = new URL(req.url).searchParams.get('account')?.trim();
  if (!accountId) return json(getAllLoginStatus());
  if (!isKnownAccount(accountId)) return json({ ok: false, error: 'unknown zalo account' }, 400);
  return json(getLoginStatus(accountId));
}
