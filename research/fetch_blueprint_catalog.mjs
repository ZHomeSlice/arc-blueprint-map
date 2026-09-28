import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = 'research/catalog-icons';
const catalogPath = 'research/blueprint-catalog.json';
const api = 'https://metaforge.app/api/arc-raiders/items?item_type=Blueprint&limit=100';

await mkdir(directory, { recursive: true });
const response = await fetch(api);
if (!response.ok) throw new Error(`MetaForge catalog returned ${response.status}`);
const payload = await response.json();
if (payload.pagination?.total !== 83 || payload.data.length !== 83) throw new Error('Unexpected blueprint catalog size');
const entries = payload.data.map(item => ({ id: item.id, name: item.name, icon: item.icon }));
await writeFile(catalogPath, JSON.stringify({ source: api, fetchedAt: new Date().toISOString(), entries }, null, 2));

let next = 0;
const failures = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < entries.length) {
    const item = entries[next++];
    try {
      const filename = join(directory, `${item.id}.webp`);
      try { await readFile(filename); continue; } catch { /* Fetch missing icon. */ }
      const icon = await fetch(item.icon);
      if (!icon.ok) throw new Error(`HTTP ${icon.status}`);
      await writeFile(filename, Buffer.from(await icon.arrayBuffer()));
    } catch (error) { failures.push(`${item.id}: ${error.message}`); }
  }
}));
console.log(`Catalog records: ${entries.length}; icon failures: ${failures.length}`);
for (const failure of failures) console.log(failure);
if (failures.length) process.exitCode = 1;
