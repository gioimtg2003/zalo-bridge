import type { API } from 'zca-js';

import { json } from '../http';
import { logger } from '../logger';

const CHUNK_SIZE = 50; // an toàn, tránh sát ngưỡng 100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function createListGroupsHandler(api: API) {
  return async function handleListGroups(_req: Request): Promise<Response> {
    try {
      const allGroups = await api.getAllGroups();
      const groupIds = Object.keys(allGroups.gridVerMap ?? {});

      if (groupIds.length === 0) {
        return json({ ok: true, groups: [] });
      }

      const gridInfoMap: Record<string, { name: string }> = {};

      for (const batch of chunk(groupIds, CHUNK_SIZE)) {
        const info = await api.getGroupInfo(batch);
        Object.assign(gridInfoMap, info.gridInfoMap ?? {});
        await sleep(300); // tránh rate limit / risk flag từ Zalo
      }

      const groups = groupIds.map((id) => ({
        id,
        name: gridInfoMap[id]?.name ?? null,
      }));

      logger.info('/groups listed', { count: groups.length });
      return json({ ok: true, groups });
    } catch (err) {
      logger.error('/groups failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return json({ ok: false, error: err instanceof Error ? err.message : 'list failed' }, 500);
    }
  };
}
