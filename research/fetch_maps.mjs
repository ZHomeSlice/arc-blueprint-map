// Fetch map overviews from the ARC Raiders Wiki for the local, offline tracker.
import { writeFile, mkdir } from 'node:fs/promises';

const maps = [
  ['Stella Montis Lower Level Map.jpg', 'stella-lower.jpg'],
  ['Dam Battlegrounds Map.jpg', 'dam-battlegrounds.jpg'],
  ['Acerra Spaceport Map.jpg', 'spaceport.jpg'],
  ['Buried City Map.jpg', 'buried-city.jpg'],
  ['Blue Gate Map.jpg', 'blue-gate.jpg'],
  ['Riven Tides Map.jpg', 'riven-tides.jpg'],
  ['Acerra Spaceport Underground Map.jpg', 'spaceport-underground.jpg'],
  ['Blue Gate Underground Map.jpg', 'blue-gate-underground.jpg'],
];
const destination = new URL('../public/maps/', import.meta.url);
await mkdir(destination, { recursive: true });

for (const [title, filename] of maps) {
  const api = new URL('https://arcraiders.wiki/w/api.php');
  api.search = new URLSearchParams({ action: 'query', titles: `File:${title}`, prop: 'imageinfo', iiprop: 'url|size', format: 'json' });
  const metadata = await (await fetch(api)).json();
  const page = Object.values(metadata.query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info?.url) throw new Error(`Missing wiki file: ${title}`);
  const response = await fetch(info.url);
  if (!response.ok) throw new Error(`Could not download ${title}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== info.size) throw new Error(`Incomplete download: ${title}`);
  await writeFile(new URL(filename, destination), bytes);
  console.log(`${filename}: ${info.width} × ${info.height}, ${bytes.length} bytes, ${info.url}`);
}
