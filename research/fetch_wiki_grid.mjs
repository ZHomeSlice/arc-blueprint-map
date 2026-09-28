import { writeFile } from 'node:fs/promises';

const response = await fetch('https://arcraiders.wiki/wiki/Blueprints');
if (!response.ok) throw new Error(`Wiki returned ${response.status}`);
const html = await response.text();
await writeFile('research/wiki-blueprints.html', html);
console.log(`Saved ${html.length} characters`);
