import { analysisCanvas } from './analysis-image.js';

// The selected MAP tab has a bright rounded outline. Checking it prevents
// blueprint art and other menus from being mistaken for an in-game map.
export function isArcMapView(source, buffers = {}) {
  const sourceWidth = source?.videoWidth || source?.naturalWidth || source?.width;
  const sourceHeight = source?.videoHeight || source?.naturalHeight || source?.height;
  if (!sourceWidth || !sourceHeight || Math.abs(sourceWidth / sourceHeight - 16 / 9) > 0.15) return false;
  function brightFraction(left, top, width, height, sampleWidth) {
    const canvas = buffers[left] ||= analysisCanvas();
    if (canvas.width !== sampleWidth) canvas.width = sampleWidth;
    if (canvas.height !== 23) canvas.height = 23;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, left * sourceWidth / 2048, top * sourceHeight / 1152,
      width * sourceWidth / 2048, height * sourceHeight / 1152, 0, 0, sampleWidth, 23);
    const pixels = context.getImageData(0, 0, sampleWidth, 23).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) >> 8;
      if (gray > 150) bright++;
    }
    return bright / (sampleWidth * 23);
  }
  const mapTab = brightFraction(1000, 25, 90, 45, 45);
  const inventoryTab = brightFraction(675, 25, 160, 45, 80);
  return mapTab >= 0.13 && mapTab > inventoryTab * 1.5;
}

export function detectPlayerArrow(source) {
  const width = source.width; const height = source.height;
  const canvas = analysisCanvas(); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  return detectPlayerArrowPixels(pixels, width, height);
}

export function detectPlayerArrowPixels(pixels, width, height) {
  const mask = new Uint8Array(width * height);
  const candidates = [];
  const left = Math.floor(width * 0.28), right = Math.floor(width * 0.78);
  const top = Math.floor(height * 0.10), bottom = Math.floor(height * 0.85);
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = y * width + x; const offset = index * 4;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (r < 160 && g > 110 && b > 130 && g - r > 45 && b - r > 60 && b > g) {
        mask[index] = 1; candidates.push(index);
      }
    }
  }
  const groups = [];
  for (const seed of candidates) {
    if (!mask[seed]) continue;
    mask[seed] = 0;
    const queue = [seed]; let cursor = 0;
    let count = 0, xSum = 0, ySum = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++]; const x = index % width, y = Math.floor(index / width);
      count++; xSum += x; ySum += y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < left || nx >= right || ny < top || ny >= bottom) continue;
          const neighbor = ny * width + nx;
          if (mask[neighbor]) { mask[neighbor] = 0; queue.push(neighbor); }
        }
      }
    }
    if (count < 15) continue;
    // Cargo elevators have a cyan hollow ring and can be larger than the
    // player arrow. A filled arrow has cyan pixels around its centroid;
    // the extraction ring's centroid lies in its dark hole.
    const centerX = xSum / count, centerY = ySum / count;
    const radius = Math.max(1, Math.round(width / 800));
    let centerPixels = 0;
    for (const index of queue) {
      if (Math.abs(index % width - centerX) <= radius &&
          Math.abs(Math.floor(index / width) - centerY) <= radius) centerPixels++;
    }
    if (centerPixels >= Math.max(3, radius * radius * 2)) groups.push({ count, x: centerX / width, y: centerY / height });
  }
  groups.sort((a, b) => b.count - a.count);
  if (!groups.length || (groups[1] && groups[1].count > groups[0].count * 0.6)) return null;
  return groups[0];
}
