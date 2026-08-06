import { createZaloClient } from './zalo-client';

const CHUNK_SIZE = 50; // an toàn, tránh sát ngưỡng 100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const api = await createZaloClient();
const allGroups = await api.getAllGroups();
const groupIds = Object.keys(allGroups.gridVerMap ?? {});

if (groupIds.length === 0) {
  console.log('No groups found.');
  process.exit(0);
}

const gridInfoMap: Record<string, { name: string }> = {};

for (const batch of chunk(groupIds, CHUNK_SIZE)) {
  const info = await api.getGroupInfo(batch);
  Object.assign(gridInfoMap, info.gridInfoMap ?? {});
  await sleep(300); // tránh rate limit / risk flag từ Zalo
}

for (const [groupId, group] of Object.entries(gridInfoMap)) {
  console.log(`${groupId}  ${group.name}`);
}
