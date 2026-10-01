import { loadAnalysisImage, analysisCanvas } from './analysis-image.js';
import { rankBlueprintPixels } from './icon-match.js';
import { detectPlayerArrow, matchMapFrames } from './map-match.js';
import { matchFullMap, mapPatchAppearance, pointOnFullMap } from './full-map-match.js';
import { selectMapCandidate } from './map-detect.js';
import { mapPresets } from './map-presets.js';

const bases = new Map();
async function baseImage(url, custom = false) {
  const key = `${custom}:${url}`;
  if (bases.has(key)) {
    const image = bases.get(key); bases.delete(key); bases.set(key, image); return image;
  }
  const image = await loadAnalysisImage(url, custom ? 240 : 768, custom ? 135 : null);
  bases.set(key, image);
  // Keep the current pair of floors, without accumulating every visited map.
  if (bases.size > 2) {
    const key = bases.keys().next().value; bases.get(key).close(); bases.delete(key);
  }
  return image;
}

async function matchMap(frame, args) {
  const arrow = detectPlayerArrow(frame);
  if (!arrow) return { error: 'The player arrow is not clear on this map view. Keep the map open or save a screenshot.' };
  if (args.customImage) {
    const match = matchMapFrames(await baseImage(args.customImage, true), frame);
    if (!match) return { error: 'Could not align the custom map screenshot. Check zoom, crop, and layer.' };
    const position = { x: arrow.x - match.dx / match.width, y: arrow.y - match.dy / match.height };
    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return { error: 'The player position falls outside the custom map.' };
    return { position, anchors: match.anchors, mapName: args.mapName };
  }
  const candidates = [];
  for (const preset of mapPresets.filter(entry => entry.family === args.family)) {
    const base = await baseImage(preset.image);
    const match = matchFullMap(base, frame, { scales: preset.scales, minScore: -1 });
    if (!match) continue;
    const position = pointOnFullMap(match, arrow);
    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) continue;
    candidates.push({ preset, match, position, appearance: mapPatchAppearance(base, frame, match) });
  }
  const selected = selectMapCandidate(candidates);
  if (selected.error) return selected;
  return { position: selected.position, confidence: selected.match.score,
    mapName: selected.preset.name, presetId: selected.preset.id, appearance: selected.appearance.mae };
}

// Serialize asset loading and calculation so multiple tiles share one catalog
// and matching requests cannot multiply CPU work or race the map cache.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  if (!data.bitmap) return;
  queue = queue.then(async () => {
    const { id, kind, bitmap, args } = data;
    try {
      let result;
      if (kind === 'pixels') {
        const canvas = analysisCanvas(); canvas.width = 100; canvas.height = 90;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        result = await rankBlueprintPixels(context.getImageData(0, 0, 100, 90).data, args.limit);
      } else if (kind === 'map') result = await matchMap(bitmap, args);
      else throw new Error('Unknown image analysis request.');
      self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: error.message }); }
    finally { bitmap.close(); }
  });
};
