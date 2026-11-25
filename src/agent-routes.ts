import { logger } from './logger';

export interface AgentTarget {
  /** Full webhook URL of the agent that owns this conversation. */
  url: string;
  /** HMAC secret used to sign the body sent to `url`. */
  secret: string;
}

/** Fallback when a conversation has no explicit route. */
const DEFAULT_URL = process.env['AGENT_URL'] ?? 'http://localhost:8000/webhook/zalo';
const DEFAULT_SECRET = process.env['AGENT_HMAC_SECRET'] ?? '';

if (!DEFAULT_SECRET) {
  logger.warn('AGENT_HMAC_SECRET not set — agent requests will be signed with an empty secret');
}

/**
 * Parse a `<key>=<url>[|<secret>]` comma-separated list.
 *
 * Used for `AGENT_ENDPOINTS` (key = agent name) and for `AGENT_ROUTES` entries
 * that point straight at a URL. Secret falls back to `AGENT_HMAC_SECRET`.
 */
export function parseAgentEndpoints(
  raw: string | undefined,
  fallbackSecret = DEFAULT_SECRET,
): Map<string, AgentTarget> {
  const endpoints = new Map<string, AgentTarget>();
  if (!raw) return endpoints;

  for (const entry of raw.split(',')) {
    const [key, target] = entry.split('=', 2).map((part) => part.trim());
    if (!key || !target) continue;

    const [url, secret] = target.split('|', 2).map((part) => part.trim());
    if (!url) continue;

    endpoints.set(key, { url, secret: secret || fallbackSecret });
  }

  return endpoints;
}

/**
 * Parse `AGENT_ROUTES` into a threadId → agent lookup.
 *
 * Format: `<threadId>=<agentName|url>[|<secret>]`, comma-separated.
 * A value starting with `http` is an inline URL; anything else is a name
 * looked up in `endpoints` (from `AGENT_ENDPOINTS`). Unknown names are skipped.
 */
export function parseAgentRoutes(
  raw: string | undefined,
  fallbackSecret = DEFAULT_SECRET,
  endpoints: Map<string, AgentTarget> = new Map(),
): Map<string, AgentTarget> {
  const routes = new Map<string, AgentTarget>();
  if (!raw) return routes;

  for (const entry of raw.split(',')) {
    const [threadId, value] = entry.split('=', 2).map((part) => part.trim());
    if (!threadId || !value) continue;

    if (value.startsWith('http')) {
      const inline = parseAgentEndpoints(`${threadId}=${value}`, fallbackSecret).get(threadId);
      if (inline) routes.set(threadId, inline);
      continue;
    }

    const named = endpoints.get(value);
    if (named) routes.set(threadId, named);
  }

  return routes;
}

const endpoints = parseAgentEndpoints(process.env['AGENT_ENDPOINTS']);
const routes = parseAgentRoutes(process.env['AGENT_ROUTES'], DEFAULT_SECRET, endpoints);
console.log('endpoints:: ', endpoints)
console.log('routes:: ', routes)

/** Which agent handles this conversation — the exception table, else the default agent. */
export function resolveAgent(conversationId: string): AgentTarget {
  return routes.get(conversationId) ?? { url: DEFAULT_URL, secret: DEFAULT_SECRET };
}
