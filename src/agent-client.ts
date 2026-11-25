import { createHmac } from 'node:crypto';

import { resolveAgent } from './agent-routes';
import { logger } from './logger';
import type { NormalizedMessage } from './normalizer';

/**
 * Send an inbound Zalo message to the agent that owns this conversation.
 * Target is resolved per conversationId (see agent-routes.ts): one default agent,
 * with a per-threadId exception table.
 */
export async function askAgent(
  msg: NormalizedMessage,
  conversationId: string,
  _isGroup: boolean,
): Promise<void> {
  const agent = resolveAgent(conversationId);
  // serialize ONCE — signature covers the exact bytes sent
  const body = JSON.stringify({
    msgId: msg.msgId,
    cliMsgId: msg.cliMsgId, // needed with msgId to reply via `/send` `quote`
    uidFrom: msg.uidFrom,
    idTo: msg.idTo, // REQUIRED — group id or agentUid
    content: msg.content,
    imageUrl: msg.imageUrl, // present only for image attachments
    audioUrl: msg.audioUrl, // present only for voice notes / audio attachments
    fileUrl: msg.fileUrl, // present only for non-image, non-audio attachments
    mentions: msg.mentions,
    ts: msg.ts,
    senderName: msg?.senderName,
    msgType: msg.msgType, // parser ignores, harmless
  });
  const signature = createHmac('sha256', agent.secret).update(body).digest('hex');

  let res: Response;
  try {
    res = await fetch(agent.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zevent-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    logger.error('agent request failed', {
      error: err instanceof Error ? err.message : String(err),
      threadId: conversationId,
      agentUrl: agent.url,
    });
    return;
  }

  if (!res.ok) {
    logger.error('agent task returned error', {
      status: res.status,
      threadId: conversationId,
      agentUrl: agent.url,
    });
  }
}
