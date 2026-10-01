import { analysisCanvas, loadAnalysisImage, requestPageAsset } from './analysis-image.js';
// Compare a blueprint item's in-game tile with the local catalog artwork.
// Only strong, distinct matches are named automatically; OCR can still name
// items whose angle or size does not match the catalog icon well enough.
const widths = [36, 44, 52, 60, 68, 76, 84];
const centersX = [40, 45, 50, 55, 60];
const centersY = [30, 36, 42, 48, 54];
let catalogPromise;
let catalogEntriesPromise;
export function loadBlueprintCatalog() {
  if (!catalogEntriesPromise) catalogEntriesPromise = fetch('/collection-data.json').then(response => response.json());
  return catalogEntriesPromise;
}
const inGameReferences = [
  { name: 'Extended Barrel II', icon: '/icon-references/extended-barrel-ii.png', shape: 'long' },
  { name: 'Aphelion', icon: '/icon-references/aphelion.png', shape: 'long' },
  { name: 'Seeker Grenade', icon: '/icon-references/seeker-grenade.png' },
];
let referencePromise;

function imageData(source, width, height, crop) {
  const canvas = analysisCanvas(); canvas.width = width; canvas.height = height;
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

export async function prepareIconEntry(entry, isActive = () => true, loading = null) {
  if (!isActive()) throw new DOMException('Image analysis cancelled.', 'AbortError');
  const image = await (loading || loadAnalysisImage(entry.icon));
  if (!isActive()) throw new DOMException('Image analysis cancelled.', 'AbortError');
  // Yield between catalog entries even when their images are already cached.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (!isActive()) throw new DOMException('Image analysis cancelled.', 'AbortError');
  try { return { name: entry.name, icon: entry.icon, templates: templatesFor(image) }; }
  finally { image.close?.(); }
}

export async function prepareReferenceEntry(entry) {
  const image = await loadAnalysisImage(entry.icon);
  try { return { name: entry.name, pixels: imageData(image, 50, 45, [0, 0, image.width, image.height]) }; }
  finally { image.close?.(); }
}

async function catalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    const entries = await loadBlueprintCatalog();
    const loaded = await Promise.all(entries.map(async entry => {
      try {
        return typeof document === 'undefined' ? await requestPageAsset('icon-entry', entry) : await prepareIconEntry(entry);
      } catch { return null; }
    }));
    return loaded.filter(Boolean);
  })();
  return catalogPromise;
}

async function references() {
  if (!referencePromise) referencePromise = Promise.all(inGameReferences.map(async entry => {
    return typeof document === 'undefined' ? requestPageAsset('reference-entry', entry) : prepareReferenceEntry(entry);
  }));
  return referencePromise;
}

function referenceScore(target, reference) {
  let sumA = 0, sumB = 0, squareA = 0, squareB = 0, product = 0;
  for (let y = 0; y < 45; y++) for (let x = 0; x < 50; x++) {
    const offset = (y * 50 + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const source = reference[offset + channel];
      const targetOffset = ((y * 2) * 100 + x * 2) * 4 + channel;
      const sample = (target[targetOffset] + target[targetOffset + 4] +
        target[targetOffset + 400] + target[targetOffset + 404]) / 4;
      sumA += source; sumB += sample;
      squareA += source * source; squareB += sample * sample; product += source * sample;
    }
  }
  const count = 50 * 45 * 3;
  const varianceA = squareA - sumA * sumA / count;
  const varianceB = squareB - sumB * sumB / count;
  return varianceA > 1 && varianceB > 1
    ? (product - sumA * sumB / count) / Math.sqrt(varianceA * varianceB) : -1;
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

async function rankTarget(target, limit = 3) {
  const matches = [];
  for (const entry of await catalog()) {
    let score = -1;
    for (const template of entry.templates) score = Math.max(score, scoreTemplate(template, target));
    matches.push({ name: entry.name, icon: entry.icon, score });
  }
  // A labeled in-game tile can differ substantially from its catalog artwork.
  // Use it only when the tile itself is very similar and no catalog match is strong.
  const strongestCatalog = Math.max(...matches.map(entry => entry.score));
  if (strongestCatalog < 0.78) {
    const rankedReferences = (await references()).map(reference => ({
      name: reference.name, icon: inGameReferences.find(entry => entry.name === reference.name).icon,
      shape: inGameReferences.find(entry => entry.name === reference.name).shape,
      similarity: referenceScore(target, reference.pixels),
    })).sort((first, second) => second.similarity - first.similarity);
    const [first, second] = rankedReferences;
    if (first?.similarity >= 0.9 && first.similarity - (second?.similarity || 0) >= 0.06) {
      const entry = matches.find(match => match.name === first.name);
      if (entry) {
        entry.score = Math.max(entry.score, Math.min(0.98, 0.85 + (first.similarity - 0.9)));
        entry.icon = first.icon;
      }
    } else {
      const catalogLeader = matches.reduce((best, entry) => entry.score > best.score ? entry : best);
      const longReferences = rankedReferences.filter(reference => reference.shape === 'long');
      if (/^(?:Silencer|Extended Barrel)/.test(catalogLeader.name) && longReferences[0]?.similarity >= 0.7) {
        // Similar long items can fool the catalog artwork matcher. Offer the
        // labeled game images for review without naming either automatically.
        for (const reference of longReferences) {
          const entry = matches.find(match => match.name === reference.name);
          if (entry) { entry.score = Math.max(entry.score, 0.75); entry.icon = reference.icon; }
        }
      }
    }
  }
  matches.sort((first, second) => second.score - first.score);
  return matches.slice(0, limit);
}

export const rankBlueprintPixels = rankTarget;

export async function rankBlueprintIcons(frame, slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) return [];
  const column = (slot - 1) % 4, row = Math.floor((slot - 1) / 4);
  const x = [169, 280, 390, 502][column], y = [315, 427][row];
  return rankTarget(imageData(frame, 100, 90, [x * frame.width / 2048, y * frame.height / 1152,
    100 * frame.width / 2048, 90 * frame.height / 1152]));
}

export async function rankBlueprintPreview(preview, limit = 3) {
  return rankTarget(imageData(preview, 100, 90, [0, 0, preview.width * 100 / 105, preview.height * 90 / 108]), limit);
}

export function confidentMatch(matches, minimumMargin = 0.05) {
  const [first, second] = matches;
  if (!first || first.score < 0.72 || first.score - (second?.score || 0) < minimumMargin) return null;
  return { name: first.name, score: first.score, margin: first.score - (second?.score || 0) };
}

export async function identifyBlueprintIcon(frame, slot) { return confidentMatch(await rankBlueprintIcons(frame, slot)); }
export async function identifyBlueprintPreview(preview) { return confidentMatch(await rankBlueprintPreview(preview), 0.04); }
