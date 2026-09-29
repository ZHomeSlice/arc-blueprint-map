// Compare a blueprint item's in-game tile with the local catalog artwork.
// Only strong, distinct matches are named automatically; OCR can still name
// items whose angle or size does not match the catalog icon well enough.
const widths = [36, 44, 52, 60, 68, 76, 84];
const centersX = [40, 45, 50, 55, 60];
const centersY = [30, 36, 42, 48, 54];
let catalogPromise;

function imageData(source, width, height, crop) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, ...crop, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function templatesFor(image) {
  const source = imageData(image, image.width, image.height, [0, 0, image.width, image.height]);
  let left = image.width, top = image.height, right = 0, bottom = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (source[(y * image.width + x) * 4 + 3] < 10) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  if (right <= left || bottom <= top) return [];
  const result = [];
  for (const width of widths) {
    const ratio = (bottom - top) / (right - left);
    const height = Math.min(78, Math.round(width * ratio));
    const actualWidth = height === 78 ? Math.round(height / ratio) : width;
    if (!actualWidth || !height) continue;
    const rgba = imageData(image, actualWidth, height, [left, top, right - left, bottom - top]);
    const points = []; let sum = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < actualWidth; x++) {
      const offset = (y * actualWidth + x) * 4;
      if (rgba[offset + 3] <= 153) continue;
      points.push({ x, y, r: rgba[offset], g: rgba[offset + 1], b: rgba[offset + 2] });
      sum += rgba[offset] + rgba[offset + 1] + rgba[offset + 2];
    }
    if (points.length < 100) continue;
    const mean = sum / (points.length * 3);
    let energy = 0;
    for (const point of points) {
      point.r -= mean; point.g -= mean; point.b -= mean;
      energy += point.r ** 2 + point.g ** 2 + point.b ** 2;
    }
    if (energy > 0) result.push({ width: actualWidth, height, points, energy });
  }
  return result;
}

async function catalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    const entries = await (await fetch('/collection-data.json')).json();
    const loaded = await Promise.all(entries.map(async entry => {
      try {
        const image = new Image(); image.src = entry.icon; await image.decode();
        return { name: entry.name, icon: entry.icon, templates: templatesFor(image) };
      } catch { return null; }
    }));
    return loaded.filter(Boolean);
  })();
  return catalogPromise;
}

function scoreTemplate(template, target) {
  let best = -1;
  for (const cy of centersY) for (const cx of centersX) {
    const left = cx - Math.floor(template.width / 2);
    const top = cy - Math.floor(template.height / 2);
    if (left < 0 || top < 0 || left + template.width > 100 || top + template.height > 90) continue;
    let sum = 0, square = 0, product = 0;
    for (const point of template.points) {
      const offset = ((top + point.y) * 100 + left + point.x) * 4;
      const r = target[offset], g = target[offset + 1], b = target[offset + 2];
      sum += r + g + b; square += r * r + g * g + b * b;
      product += r * point.r + g * point.g + b * point.b;
    }
    const count = template.points.length * 3;
    const variance = square - sum * sum / count;
    if (variance > 1) best = Math.max(best, product / Math.sqrt(template.energy * variance));
  }
  return best;
}

async function rankTarget(target) {
  const matches = [];
  for (const entry of await catalog()) {
    let score = -1;
    for (const template of entry.templates) score = Math.max(score, scoreTemplate(template, target));
    matches.push({ name: entry.name, icon: entry.icon, score });
  }
  matches.sort((first, second) => second.score - first.score);
  return matches.slice(0, 3);
}

export async function rankBlueprintIcons(frame, slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) return [];
  const column = (slot - 1) % 4, row = Math.floor((slot - 1) / 4);
  const x = [169, 280, 390, 502][column], y = [315, 427][row];
  return rankTarget(imageData(frame, 100, 90, [x * frame.width / 2048, y * frame.height / 1152,
    100 * frame.width / 2048, 90 * frame.height / 1152]));
}

export async function rankBlueprintPreview(preview) {
  return rankTarget(imageData(preview, 100, 90, [0, 0, preview.width * 100 / 105, preview.height * 90 / 108]));
}

function confidentMatch(matches, minimumMargin = 0.05) {
  const [first, second] = matches;
  if (!first || first.score < 0.72 || first.score - (second?.score || 0) < minimumMargin) return null;
  return { name: first.name, score: first.score, margin: first.score - (second?.score || 0) };
}

export async function identifyBlueprintIcon(frame, slot) { return confidentMatch(await rankBlueprintIcons(frame, slot)); }
export async function identifyBlueprintPreview(preview) { return confidentMatch(await rankBlueprintPreview(preview), 0.04); }
