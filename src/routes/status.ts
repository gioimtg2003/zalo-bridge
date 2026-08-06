import { getLoginStatus } from '../zalo-client';
import { json } from '../http';

export function handleStatus(_req: Request): Response {
  return json(getLoginStatus());
}
