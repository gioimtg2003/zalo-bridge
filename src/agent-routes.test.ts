import { expect, test } from 'bun:test';

import { parseAgentEndpoints, parseAgentRoutes } from './agent-routes';

test('empty config yields no routes', () => {
  expect(parseAgentRoutes(undefined).size).toBe(0);
  expect(parseAgentRoutes('').size).toBe(0);
});

test('route inherits fallback secret when omitted', () => {
  const routes = parseAgentRoutes('g_1=https://a.dev/webhook', 'fallback');
  expect(routes.get('g_1')).toEqual({ url: 'https://a.dev/webhook', secret: 'fallback' });
});

test('per-route secret overrides fallback', () => {
  const routes = parseAgentRoutes(' g_1=https://a.dev/webhook|s1 , g_2=https://b.dev/webhook ', 'fallback');
  expect(routes.get('g_1')).toEqual({ url: 'https://a.dev/webhook', secret: 's1' });
  expect(routes.get('g_2')).toEqual({ url: 'https://b.dev/webhook', secret: 'fallback' });
});

test('malformed entries are skipped, not fatal', () => {
  const routes = parseAgentRoutes('garbage,g_3=,=https://x.dev,g_4=https://ok.dev', 'fallback');
  expect([...routes.keys()]).toEqual(['g_4']);
});

test('named agent shared by many threads resolves from AGENT_ENDPOINTS', () => {
  const endpoints = parseAgentEndpoints('support=https://support.dev/webhook|s2', 'fallback');
  const routes = parseAgentRoutes('g_1=support,g_2=support,g_3=ghost', 'fallback', endpoints);

  expect(routes.get('g_1')).toEqual({ url: 'https://support.dev/webhook', secret: 's2' });
  expect(routes.get('g_2')).toEqual({ url: 'https://support.dev/webhook', secret: 's2' });
  expect(routes.has('g_3')).toBe(false); // unknown name → default agent
});
