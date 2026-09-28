const WIDTH = 240;
const HEIGHT = 135;

// The selected MAP tab has a bright rounded outline. Checking it prevents
// blueprint art and other menus from being mistaken for an in-game map.
export function isArcMapView(source) {
  if (!source?.width || !source?.height || Math.abs(source.width / source.height - 16 / 9) > 0.15) return false;
  function brightFraction(left, top, width, height, sampleWidth) {
    const canvas = document.createElement('canvas');
    canvas.width = sampleWidth; canvas.height = 23;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, left * source.width / 2048, top * source.height / 1152,
      width * source.width / 2048, height * source.height / 1152, 0, 0, sampleWidth, 23);
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

function grayscale(source) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH; canvas.height = HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, WIDTH, HEIGHT);
  const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;
  const gray = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    gray[i] = (pixels[offset] * 77 + pixels[offset + 1] * 150 + pixels[offset + 2] * 29) >> 8;
  }
  return gray;
}

function patchError(base, current, patch, dx, dy, step) {
  const x = patch.x + dx;
  const y = patch.y + dy;
  if (x < 0 || y < 0 || x + patch.w > WIDTH || y + patch.h > HEIGHT) return Infinity;
  let sum = 0; let count = 0;
  for (let row = 0; row < patch.h; row += step) {
    const baseRow = (patch.y + row) * WIDTH + patch.x;
    const currentRow = (y + row) * WIDTH + x;
    for (let column = 0; column < patch.w; column += step) {
      const difference = base[baseRow + column] - current[currentRow + column];
      sum += difference * difference; count++;
    }
  }
  return sum / count;
}

function textureVariance(gray, patch) {
  let sum = 0; let squares = 0; let count = 0;
  for (let y = 0; y < patch.h; y += 2) {
    for (let x = 0; x < patch.w; x += 2) {
      const value = gray[(patch.y + y) * WIDTH + patch.x + x];
      sum += value; squares += value * value; count++;
    }
  }
  return squares / count - (sum / count) ** 2;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function matchMapFrames(baseSource, currentSource) {
  const baseRatio = baseSource.width / baseSource.height;
  const currentRatio = currentSource.width / currentSource.height;
  if (!Number.isFinite(baseRatio) || Math.abs(baseRatio - currentRatio) > 0.02) return null;
  const base = grayscale(baseSource);
  const current = grayscale(currentSource);
  const patches = [];
  for (const centerY of [32, 48, 64, 80, 96]) {
    for (const centerX of [88, 106, 124, 142, 160, 178]) {
      const patch = { x: centerX - 11, y: centerY - 8, w: 22, h: 16 };
      if (textureVariance(base, patch) >= 150) patches.push(patch);
    }
  }
  const votes = [];
  for (const patch of patches) {
    let best = { error: Infinity, dx: 0, dy: 0, patch };
    for (let dy = -50; dy <= 50; dy += 2) {
      for (let dx = -50; dx <= 50; dx += 2) {
        const error = patchError(base, current, patch, dx, dy, 2);
        if (error < best.error) best = { error, dx, dy, patch };
      }
    }
    if (best.error < 2000) votes.push(best);
  }
  let inliers = [];
  for (const vote of votes) {
    const group = votes.filter(other => Math.abs(other.dx - vote.dx) <= 4 && Math.abs(other.dy - vote.dy) <= 4);
    if (group.length > inliers.length) inliers = group;
  }
  if (inliers.length < 6) return null;
  const roughX = median(inliers.map(vote => vote.dx));
  const roughY = median(inliers.map(vote => vote.dy));
  let best = { error: Infinity, dx: 0, dy: 0 };
  for (let dy = roughY - 3; dy <= roughY + 3; dy++) {
    for (let dx = roughX - 3; dx <= roughX + 3; dx++) {
      const errors = inliers.map(vote => patchError(base, current, vote.patch, dx, dy, 1)).sort((a, b) => a - b);
      const count = Math.max(4, Math.ceil(errors.length * 0.65));
      const error = errors.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
      if (error < best.error) best = { error, dx, dy };
    }
  }
  if (best.error > 500) return null;
  return { dx: best.dx, dy: best.dy, anchors: inliers.length, error: best.error, width: WIDTH, height: HEIGHT };
}

export function detectPlayerArrow(source) {
  const width = source.width; const height = source.height;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
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
    if (count >= 15) groups.push({ count, x: xSum / count / width, y: ySum / count / height });
  }
  groups.sort((a, b) => b.count - a.count);
  if (!groups.length || (groups[1] && groups[1].count > groups[0].count * 0.6)) return null;
  return groups[0];
}
