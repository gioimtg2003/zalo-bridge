import type { API } from 'zca-js';

import { createFindUserHandler } from './routes/find-user';
import { createGroupHandlers } from './routes/group';
import { createListFriendsHandler } from './routes/list-friends';
import { createListGroupsHandler } from './routes/list-groups';
import { createNotiBroadcastHandler } from './routes/noti-broadcast';
import { createNotiCanceledHandler } from './routes/noti-canceled';
import { createNotiDeliveredHandler } from './routes/noti-delivered';
import { createSendHandler } from './routes/send';
import { createSendImageHandler } from './routes/send-image';
import { createSendLinkHandler } from './routes/send-link';
import { createTypingHandler } from './routes/typing';

export type RouteHandler = (request: Request) => Response | Promise<Response>;

/** Every per-account route handler, bound to that account's `API` instance. */
export interface AccountHandlers {
  send: RouteHandler;
  sendImage: RouteHandler;
  sendLink: RouteHandler;
  typing: RouteHandler;
  notiCanceled: RouteHandler;
  notiDelivered: RouteHandler;
  notiBroadcast: RouteHandler;
  findUser: RouteHandler;
  listGroups: RouteHandler;
  listFriends: RouteHandler;
  group: ReturnType<typeof createGroupHandlers>;
}

export function createAccountHandlers(api: API): AccountHandlers {
  return {
    send: createSendHandler(api),
    sendImage: createSendImageHandler(api),
    sendLink: createSendLinkHandler(api),
    typing: createTypingHandler(api),
    notiCanceled: createNotiCanceledHandler(api),
    notiDelivered: createNotiDeliveredHandler(api),
    notiBroadcast: createNotiBroadcastHandler(api),
    findUser: createFindUserHandler(api),
    listGroups: createListGroupsHandler(api),
    listFriends: createListFriendsHandler(api),
    group: createGroupHandlers(api),
  };
}
