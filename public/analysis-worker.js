import { loadAnalysisImage, analysisCanvas } from './analysis-image.js';
import { rankBlueprintPixels } from './icon-match.js';
import { detectPlayerArrow } from './map-match.js';
import { matchFullMap, mapPatchAppearance, pointOnFullMap } from './full-map-match.js';
import { selectMapCandidate } from './map-detect.js';
import { mapPresets, mapZoomFallbackScales } from './map-presets.js';

const bases = new Map();
async function baseImage(url) {
  const key = url;
  if (bases.has(key)) {
    const image = bases.get(key); bases.delete(key); bases.set(key, image); return image;
  }
  const image = await loadAnalysisImage(url, 768);
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
  const candidates = [];
  for (const preset of mapPresets.filter(entry => entry.family === args.family)) {
    const base = await baseImage(preset.image);
    let match = matchFullMap(base, frame, { scales: preset.scales, minScore: -1 });
    let appearance = match && mapPatchAppearance(base, frame, match);
    if (preset.scales && (!match || match.score < (preset.minScore ?? 0.72) || appearance.mae > 45)) {
      const zoomed = matchFullMap(base, frame, { scales: mapZoomFallbackScales, minScore: -1, refineScale: true });
      if (zoomed && (!match || zoomed.score > match.score)) {
        match = zoomed; appearance = mapPatchAppearance(base, frame, match);
      }
    }
    if (!match) continue;
    const position = pointOnFullMap(match, arrow);
    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) continue;
    candidates.push({ preset, match, position, appearance });
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
