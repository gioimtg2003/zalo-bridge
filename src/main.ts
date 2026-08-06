import { ThreadType, type Message } from 'zca-js';

import { askAgent } from './agent-client';
import { isDuplicate } from './dedup';
import { unauthorized } from './http';
import { logger } from './logger';
import { normalizeZaloMessage } from './normalizer';
import { createFindUserHandler } from './routes/find-user';
import { createGroupHandlers } from './routes/group';
import { handleHealth } from './routes/health';
import { createListGroupsHandler } from './routes/list-groups';
import { createNotiBroadcastHandler } from './routes/noti-broadcast';
import { createNotiCanceledHandler } from './routes/noti-canceled';
import { createNotiDeliveredHandler } from './routes/noti-delivered';
import { handleQR } from './routes/qr';
import { createSendHandler } from './routes/send';
import { createSendImageHandler } from './routes/send-image';
import { handleStatus } from './routes/status';
import { createTypingHandler } from './routes/typing';
import { createZaloClient, flushSession, getOwnId } from './zalo-client';

const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? '';
const BRIDGE_PORT = Number(process.env['BRIDGE_PORT'] ?? '2604');

const api = await createZaloClient();
const { listener } = api;

const handleSend = createSendHandler(api);
const handleSendImage = createSendImageHandler(api);
const handleTyping = createTypingHandler(api);
const handleNotiCanceled = createNotiCanceledHandler(api);
const handleNotiDelivered = createNotiDeliveredHandler(api);
const handleNotiBroadcast = createNotiBroadcastHandler(api);
const handleFindUser = createFindUserHandler(api);
const handleListGroups = createListGroupsHandler(api);
const group = createGroupHandlers(api);

listener.on('message', (message: Message) => {
  if (message.isSelf) {
    return;
  }
  console.log('message:: ', message)
  console.log('message:: ', message?.data)

  const normalized = normalizeZaloMessage(message);

  const agentUid = getOwnId();
  // idTo is the agent itself on direct messages, a group id otherwise
  const isGroup =
    agentUid != null ? normalized.idTo !== agentUid : message.type === ThreadType.Group;
  const conversationId = isGroup ? normalized.idTo : normalized.uidFrom;


  if (isDuplicate(normalized.msgId)) {
    logger.warn('duplicate message skipped', { messageId: normalized.msgId });
    return;
  }

  logger.info('inbound message', {
    messageId: normalized.msgId,
    conversationId,
    senderId: normalized.uidFrom,
  });

  if (normalized.content) {
    askAgent(normalized, conversationId, isGroup).catch((err: unknown) => {
      logger.error('agent reply send failed', {
        error: err instanceof Error ? err.message : String(err),
        conversationId,
      });
    });

  }
});

const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectAttempt = 0;

function scheduleListenerRestart() {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('zalo listener gave up after max restart attempts — exiting for process restart', {
      attempts: reconnectAttempt,
    });
    process.exit(1);
  }

  const delay = Math.min(5_000 * 2 ** reconnectAttempt, 60_000); // cap at 1 min
  reconnectAttempt++;
  logger.info('scheduling listener restart', { attempt: reconnectAttempt, delayMs: delay });

  setTimeout(() => {
    try {
      listener.start({ retryOnClose: true });
    } catch (err) {
      logger.error('listener restart threw', {
        error: err instanceof Error ? err.message : String(err),
      });
      scheduleListenerRestart();
    }
  }, delay);
}

listener.on('connected', () => {
  reconnectAttempt = 0;
  logger.info('zalo listener connected');
});

listener.on('disconnected', (code, reason) => {
  logger.warn('zalo listener disconnected', { code, reason });
});

listener.on('closed', (code, reason) => {
  logger.error('zalo listener closed — will attempt restart', { code, reason });
  scheduleListenerRestart();
});

listener.on('error', (error: unknown) => {
  logger.error('zalo listener error', {
    error: error instanceof Error ? error.message : String(error),
  });
});

listener.start({ retryOnClose: true });

const server = Bun.serve({
  port: BRIDGE_PORT,
  async fetch(request) {
    const secret = request.headers.get('x-dilim-zalo-bridge');
    if (secret !== INTERNAL_SECRET) return unauthorized();

    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case 'GET /health':
        return handleHealth(request);
      case 'GET /qr':
        return handleQR(request);
      case 'GET /status':
        return handleStatus(request);
      case 'GET /find-user':
        return handleFindUser(request);
      case 'GET /groups':
        return handleListGroups(request);
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
        return handleSend(request);
      case 'POST /send-image':
        return handleSendImage(request);
      case 'POST /typing':
        return handleTyping(request);
      case 'POST /noti-canceled':
        return handleNotiCanceled(request);
      case 'POST /noti-delivered':
        return handleNotiDelivered(request);
      case 'POST /noti-broadcast':
        return handleNotiBroadcast(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
});

logger.info(`listening on port ${BRIDGE_PORT}`);

async function shutdown(signal: string): Promise<void> {
  logger.info(`received ${signal}, shutting down...`);

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out after 5s, forcing exit');
    process.exit(1);
  }, 5000);

  try {
    server.stop();
    listener.stop();
    await flushSession();
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
