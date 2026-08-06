import { createHmac } from 'node:crypto';

import { logger } from './logger';
import type { NormalizedMessage } from './normalizer';


const INTERNAL_SECRET = 'dlm3MO9DFRrg3XAFhZxV29ltDrtQsVx2'

/**
 * Send an inbound Zalo message to the order-agent and return the AI reply.
 * Uses threadId as agentId so each Zalo group thread gets isolated conversation history.
 * Returns null if ORDER_AGENT_URL is not configured or the call fails.
 */
export async function askAgent(
  msg: NormalizedMessage,
  conversationId: string,
  _isGroup: boolean,
): Promise<string | null> {


  // serialize ONCE — signature covers the exact bytes sent
  const body = JSON.stringify({
    msgId: msg.msgId,
    uidFrom: msg.uidFrom,
    idTo: msg.idTo, // REQUIRED — group id or agentUid
    content: msg.content,
    mentions: msg.mentions,
    ts: msg.ts,
    msgType: msg.msgType, // parser ignores, harmless
  });
  const signature = createHmac('sha256', INTERNAL_SECRET).update(body).digest('hex');

  let res: Response;
  try {
    res = await fetch(`http://localhost:8000/webhook/zalo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zevent-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.log('err:: ', err);
    logger.error('agent request failed', {
      error: err instanceof Error ? err.message : String(err),
      threadId: conversationId,
    });
    return null;
  }
  console.log('res.ok:: ', res.ok);

  if (!res.ok) {
    logger.error('agent task returned error', { status: res.status, threadId: conversationId });
    return null;
  }

  return null;
}
