import type { API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

// Parse JSON body, null on failure.
async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Normalize members input to a non-empty string[]; null if invalid.
function toMembers(value: unknown): string[] | null {
  const arr = Array.isArray(value) ? value : value != null ? [value] : [];
  const members = arr.filter((m): m is string => typeof m === 'string' && m.length > 0);
  return members.length > 0 ? members : null;
}

function fail(err: unknown, route: string, fallback: string): Response {
  logger.error(`${route} failed`, { error: err instanceof Error ? err.message : String(err) });
  return json({ ok: false, error: err instanceof Error ? err.message : fallback }, 500);
}

export function createGroupHandlers(api: API) {
  return {
    // POST /groups  { name?, members: string[] }
    async create(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const members = toMembers(b['members']);
      if (!members) return json({ ok: false, error: 'members must be a non-empty string[]' }, 400);
      const name = typeof b['name'] === 'string' ? b['name'] : undefined;

      try {
        const result = await api.createGroup({ name, members });
        logger.info('/groups created', { groupId: result.groupId, members: members.length });
        return json({ ok: true, group: result });
      } catch (err) {
        return fail(err, '/groups create', 'create failed');
      }
    },

    // GET /group-info?groupId=a,b
    async info(req: Request): Promise<Response> {
      const ids = new URL(req.url).searchParams.get('groupId')?.split(',').filter(Boolean) ?? [];
      if (ids.length === 0) return json({ ok: false, error: 'missing query param: groupId' }, 400);
      try {
        const result = await api.getGroupInfo(ids);
        return json({ ok: true, info: result.gridInfoMap });
      } catch (err) {
        return fail(err, '/group-info', 'info failed');
      }
    },

    // GET /group-members?memberId=a,b
    async members(req: Request): Promise<Response> {
      const ids = new URL(req.url).searchParams.get('memberId')?.split(',').filter(Boolean) ?? [];
      if (ids.length === 0) return json({ ok: false, error: 'missing query param: memberId' }, 400);
      try {
        const result = await api.getGroupMembersInfo(ids);
        return json({ ok: true, profiles: result.profiles });
      } catch (err) {
        return fail(err, '/group-members', 'members failed');
      }
    },

    // POST /group/add-members  { groupId, members: string[] }
    async addMembers(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      const members = toMembers(b['members']);
      if (typeof groupId !== 'string' || !members) {
        return json({ ok: false, error: 'required: groupId, members[]' }, 400);
      }
      try {
        const result = await api.addUserToGroup(members, groupId);
        logger.info('/group/add-members', { groupId, members: members.length });
        return json({ ok: true, errorMembers: result.errorMembers });
      } catch (err) {
        return fail(err, '/group/add-members', 'add failed');
      }
    },

    // POST /group/remove-members  { groupId, members: string[] }
    async removeMembers(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      const members = toMembers(b['members']);
      if (typeof groupId !== 'string' || !members) {
        return json({ ok: false, error: 'required: groupId, members[]' }, 400);
      }
      try {
        const result = await api.removeUserFromGroup(members, groupId);
        logger.info('/group/remove-members', { groupId, members: members.length });
        return json({ ok: true, errorMembers: result.errorMembers });
      } catch (err) {
        return fail(err, '/group/remove-members', 'remove failed');
      }
    },

    // POST /group/rename  { groupId, name }
    async rename(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      const name = b['name'];
      if (typeof groupId !== 'string' || typeof name !== 'string' || !name) {
        return json({ ok: false, error: 'required: groupId, name' }, 400);
      }
      try {
        const result = await api.changeGroupName(name, groupId);
        logger.info('/group/rename', { groupId, name });
        return json({ ok: true, status: result.status });
      } catch (err) {
        return fail(err, '/group/rename', 'rename failed');
      }
    },

    // POST /group/change-owner  { groupId, memberId }
    async changeOwner(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      const memberId = b['memberId'];
      if (typeof groupId !== 'string' || typeof memberId !== 'string') {
        return json({ ok: false, error: 'required: groupId, memberId' }, 400);
      }
      try {
        await api.changeGroupOwner(memberId, groupId);
        logger.info('/group/change-owner', { groupId, memberId });
        return json({ ok: true });
      } catch (err) {
        return fail(err, '/group/change-owner', 'change owner failed');
      }
    },

    // POST /group/leave  { groupId, silent? }
    async leave(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      if (typeof groupId !== 'string') {
        return json({ ok: false, error: 'required: groupId' }, 400);
      }
      try {
        await api.leaveGroup(groupId, b['silent'] === true);
        logger.info('/group/leave', { groupId });
        return json({ ok: true });
      } catch (err) {
        return fail(err, '/group/leave', 'leave failed');
      }
    },

    // POST /group/disperse  { groupId }   — dissolve group (owner only)
    async disperse(req: Request): Promise<Response> {
      const b = await readJson(req);
      if (!b) return json({ ok: false, error: 'invalid json' }, 400);
      const groupId = b['groupId'];
      if (typeof groupId !== 'string') {
        return json({ ok: false, error: 'required: groupId' }, 400);
      }
      try {
        await api.disperseGroup(groupId);
        logger.info('/group/disperse', { groupId });
        return json({ ok: true });
      } catch (err) {
        return fail(err, '/group/disperse', 'disperse failed');
      }
    },
  };
}
