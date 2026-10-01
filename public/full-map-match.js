import { analysisCanvas } from './analysis-image.js';
// Match a clear piece of the in-game map above the player marker against a
// downsized full-map image. The patch avoids the quest panel and map legend.
const BASE_WIDTH = 768;
const SCREEN_WIDTH = 2048;
const SCREEN_HEIGHT = 1152;
const PATCH = { x: 870, y: 440, w: 170, h: 100 };
const STELLA_SCALES = [0.29, 0.30, 0.31];
const OTHER_SCALES = [0.28, 0.30, 0.33, 0.36, 0.40, 0.45, 0.50, 0.56, 0.63, 0.71];
const SAMPLE_STEP = 3;
const baseGrays = new WeakMap();

function grayImage(source, width, height, crop) {
  const canvas = analysisCanvas();
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (crop) context.drawImage(source, crop.x / SCREEN_WIDTH * source.width, crop.y / SCREEN_HEIGHT * source.height,
    crop.w / SCREEN_WIDTH * source.width, crop.h / SCREEN_HEIGHT * source.height, 0, 0, width, height);
  else context.drawImage(source, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const result = new Uint8Array(width * height);
  for (let index = 0; index < result.length; index++) {
    const offset = index * 4;
    result[index] = (rgba[offset] * 77 + rgba[offset + 1] * 150 + rgba[offset + 2] * 29) >> 8;
  }
  return result;
}

function templateSamples(gray, width, height) {
  const points = [];
  let sum = 0;
  for (let y = 1; y < height - 1; y += SAMPLE_STEP) {
    for (let x = 1; x < width - 1; x += SAMPLE_STEP) {
      const value = gray[y * width + x];
      points.push({ x, y, value }); sum += value;
    }
  }
  const mean = sum / points.length;
  let energy = 0;
  for (const point of points) { point.value -= mean; energy += point.value * point.value; }
  return { points, energy, width, height };
}

function scoreAt(base, baseWidth, template, x, y) {
  const { points, energy } = template;
  if (energy < 25 * points.length) return -1;
  let sum = 0, squares = 0, product = 0;
  const row = y * baseWidth + x;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const value = base[row + point.y * baseWidth + point.x];
    sum += value; squares += value * value; product += value * point.value;
  }
  const variance = squares - sum * sum / points.length;
  if (variance < 25 * points.length) return -1;
  return product / Math.sqrt(energy * variance);
}

export function matchFullMap(baseSource, screenSource, options = {}) {
  const baseHeight = Math.round(BASE_WIDTH * baseSource.height / baseSource.width);
  if (!Number.isFinite(baseHeight) || baseHeight < 50) return null;
  let base = baseGrays.get(baseSource);
  if (!base || base.height !== baseHeight) {
    base = { gray: grayImage(baseSource, BASE_WIDTH, baseHeight), height: baseHeight };
    baseGrays.set(baseSource, base);
  }
  let best = null;
  for (const scale of options.scales || OTHER_SCALES) {
    const width = Math.round(PATCH.w * scale);
    const height = Math.round(PATCH.h * scale);
    const template = templateSamples(grayImage(screenSource, width, height, PATCH), width, height);
    for (let y = 0; y <= baseHeight - height; y += 2) {
      for (let x = 0; x <= BASE_WIDTH - width; x += 2) {
        const score = scoreAt(base.gray, BASE_WIDTH, template, x, y);
        if (!best || score > best.score) best = { x, y, scale, score, template };
      }
    }
  }
  if (!best) return null;
  let refined = best;
  for (let y = Math.max(0, best.y - 3); y <= Math.min(baseHeight - best.template.height, best.y + 3); y++) {
    for (let x = Math.max(0, best.x - 3); x <= Math.min(BASE_WIDTH - best.template.width, best.x + 3); x++) {
      const score = scoreAt(base.gray, BASE_WIDTH, best.template, x, y);
      if (score > refined.score) refined = { ...best, x, y, score };
    }
  }
  if (!Number.isFinite(refined.score) || refined.score < (options.minScore ?? 0.72)) return null;
  return {
    x: refined.x, y: refined.y, scale: refined.scale,
    score: refined.score, width: BASE_WIDTH, height: baseHeight,
  };
}

export function pointOnFullMap(match, arrow) {
  return {
    x: (match.x + (arrow.x * SCREEN_WIDTH - PATCH.x) * match.scale) / match.width,
    y: (match.y + (arrow.y * SCREEN_HEIGHT - PATCH.y) * match.scale) / match.height,
  };
}

// Correlation ignores brightness, which can make the darkened art of another
// floor appear to match. Compare the actual tones after alignment as well.
export function mapPatchAppearance(baseSource, screenSource, match) {
  const cached = baseGrays.get(baseSource);
  if (!cached) return null;
  const width = Math.round(PATCH.w * match.scale);
  const height = Math.round(PATCH.h * match.scale);
  const screen = grayImage(screenSource, width, height, PATCH);
  let difference = 0, screenTotal = 0, baseTotal = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const screenValue = screen[y * width + x];
      const baseValue = cached.gray[(match.y + y) * BASE_WIDTH + match.x + x];
      difference += Math.abs(screenValue - baseValue);
      screenTotal += screenValue; baseTotal += baseValue;
    }
  }
  const count = width * height;
  return { mae: difference / count, screenMean: screenTotal / count, baseMean: baseTotal / count };
}

// Preserve the calibrated Stella matcher for existing data and screenshots.
export function matchStellaUpper(baseSource, screenSource) {
  return matchFullMap(baseSource, screenSource, { scales: STELLA_SCALES, minScore: 0.62 });
}

export const pointOnStellaUpper = pointOnFullMap;
