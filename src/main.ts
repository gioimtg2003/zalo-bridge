import { ThreadType, type API, type Message } from 'zca-js';

import { createAccountHandlers, type AccountHandlers } from './account-handlers';
import { askAgent } from './agent-client';
import { isDuplicate } from './dedup';
import { json, unauthorized } from './http';
import { logger } from './logger';
import { normalizeZaloMessage } from './normalizer';
import { handleHealth } from './routes/health';
import { handleQR } from './routes/qr';
import { handleStatus } from './routes/status';
import {
  ACCOUNT_IDS,
  createZaloClient,
  DEFAULT_ACCOUNT_ID,
  flushAllSessions,
  getOwnId,
  isKnownAccount,
} from './zalo-client';

const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? '';
const BRIDGE_PORT = Number(process.env['BRIDGE_PORT'] ?? '2604');

interface Account {
  id: string;
  api: API;
  handlers: AccountHandlers;
}

const accounts = new Map<string, Account>();

// Sequential: QR login needs one scan at a time.
for (const accountId of ACCOUNT_IDS) {
  try {
    const api = await createZaloClient(accountId);
    accounts.set(accountId, { id: accountId, api, handlers: createAccountHandlers(api) });
    attachListener(accountId, api);
  } catch (err) {
    logger.error('account login failed — continuing without it', {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

if (accounts.size === 0) {
  logger.error('no zalo account logged in — exiting', { configured: ACCOUNT_IDS });
  process.exit(1);
}

function attachListener(accountId: string, api: API): void {
  const { listener } = api;

  listener.on('message', (message: Message) => {
    console.log('message:: ', message)

    if (message.isSelf) {
      return;
    }

    const normalized = normalizeZaloMessage(message);

    const agentUid = getOwnId(accountId);
    // idTo is the agent itself on direct messages, a group id otherwise
    const isGroup =
      agentUid != null ? normalized.idTo !== agentUid : message.type === ThreadType.Group;
    const conversationId = isGroup ? normalized.idTo : normalized.uidFrom;

    if (isDuplicate(normalized.msgId)) {
      logger.warn('duplicate message skipped', { accountId, messageId: normalized.msgId });
      return;
    }

    logger.info('inbound message', {
      accountId,
      messageId: normalized.msgId,
      conversationId,
      senderId: normalized.uidFrom,
    });

    if (normalized.content) {
      askAgent(normalized, conversationId, isGroup).catch((err: unknown) => {
        logger.error('agent reply send failed', {
          accountId,
          error: err instanceof Error ? err.message : String(err),
          conversationId,
        });
      });
    }
  });

  const MAX_RECONNECT_ATTEMPTS = 5;
  let reconnectAttempt = 0;

  function scheduleListenerRestart(): void {
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(
        'zalo listener gave up after max restart attempts — exiting for process restart',
        { accountId, attempts: reconnectAttempt },
      );
      process.exit(1);
    }

    const delay = Math.min(5_000 * 2 ** reconnectAttempt, 60_000); // cap at 1 min
    reconnectAttempt++;
    logger.info('scheduling listener restart', { accountId, attempt: reconnectAttempt, delayMs: delay });

    setTimeout(() => {
      try {
        listener.start({ retryOnClose: true });
      } catch (err) {
        logger.error('listener restart threw', {
          accountId,
          error: err instanceof Error ? err.message : String(err),
        });
        scheduleListenerRestart();
      }
    }, delay);
  }

  listener.on('connected', () => {
    reconnectAttempt = 0;
    logger.info('zalo listener connected', { accountId });
  });

  listener.on('disconnected', (code, reason) => {
    logger.warn('zalo listener disconnected', { accountId, code, reason });
  });

  listener.on('closed', (code, reason) => {
    logger.error('zalo listener closed — will attempt restart', { accountId, code, reason });
    scheduleListenerRestart();
  });

  listener.on('error', (error: unknown) => {
    logger.error('zalo listener error', {
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  listener.start({ retryOnClose: true });
}

/**
 * Which logged-in account serves this request: `x-zalo-account` header,
 * else `?account=`, else the first configured account.
 */
function resolveAccount(request: Request, url: URL): Account | null {
  const requested =
    request.headers.get('x-zalo-account')?.trim() || url.searchParams.get('account')?.trim() || '';
  if (!requested) return accounts.get(DEFAULT_ACCOUNT_ID) ?? null;
  if (!isKnownAccount(requested)) return null;
  return accounts.get(requested) ?? null;
}

const server = Bun.serve({
  port: BRIDGE_PORT,
  async fetch(request) {
    const secret = request.headers.get('x-dilim-zalo-bridge');
    if (secret !== INTERNAL_SECRET) return unauthorized();

    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    // Status/QR/health report on every account, so they resolve their own target.
    switch (route) {
      case 'GET /health':
        return handleHealth(request);
      case 'GET /qr':
        return handleQR(request);
      case 'GET /status':
        return handleStatus(request);
    }

    const account = resolveAccount(request, url);
    if (!account) {
      return json(
        {
          ok: false,
          error: 'unknown or not-logged-in zalo account',
          accounts: [...accounts.keys()],
        },
        400,
      );
    }
    const handlers = account.handlers;
    const group = handlers.group;

    switch (route) {
      case 'GET /find-user':
        return handlers.findUser(request);
      case 'GET /groups':
        return handlers.listGroups(request);
      case 'GET /friends':
        return handlers.listFriends(request);
      case 'POST /groups':
        return group.create(request);
      case 'GET /group-info':
        return group.info(request);
      case 'GET /group-members':
        return group.members(request);
      case 'POST /group/add-members':
        return group.addMembers(request);
      case 'POST /group/remove-members':
        return group.removeMembers(request);
      case 'POST /group/rename':
        return group.rename(request);
      case 'POST /group/change-owner':
        return group.changeOwner(request);
      case 'POST /group/leave':
        return group.leave(request);
      case 'POST /group/disperse':
        return group.disperse(request);
      case 'POST /send':
        return handlers.send(request);
      case 'POST /send-image':
        return handlers.sendImage(request);
      case 'POST /send-link':
        return handlers.sendLink(request);
      case 'POST /typing':
        return handlers.typing(request);
      case 'POST /noti-canceled':
        return handlers.notiCanceled(request);
      case 'POST /noti-delivered':
        return handlers.notiDelivered(request);
      case 'POST /noti-broadcast':
        return handlers.notiBroadcast(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
});

logger.info(`listening on port ${BRIDGE_PORT}`, { accounts: [...accounts.keys()] });

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down...`);

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out after 5s, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    server.stop();
    for (const account of accounts.values()) {
      account.api.listener.stop();
    }
    await flushAllSessions();
  } catch (err) {
    logger.error('error during shutdown', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
