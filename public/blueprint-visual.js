// ARC Raiders loot containers use four fixed columns at 16:9. The blue grid
// covers most of a blueprint tile, even when its item name is not visible.
const containerTiles = [
  [169, 315], [280, 315], [390, 315], [502, 315],
  [169, 427], [280, 427], [390, 427], [502, 427],
];

export function isLootPanelVisible(image, geometry = image) {
  const { width, height, data } = image;
  const { width: frameWidth, height: frameHeight, y: originY = 0 } = geometry;
  if (!width || !height || !data || Math.abs(frameWidth / frameHeight - 16 / 9) > 0.15) return false;
  // The bright CONTAINER heading sits just above the eight loot slots. Checking
  // pixels here keeps a blue recipe elsewhere in the game UI from starting a scan.
  let headingPixels = 0, darkPixels = 0, samples = 0;
  for (let y = 245; y < 280; y++) for (let x = 165; x < 345; x++) {
      const px = Math.floor(x * frameWidth / 2048) - (geometry.x || 0);
      const py = Math.floor(y * frameHeight / 1152) - originY;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const offset = (py * width + px) * 4;
      samples++;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < 120) darkPixels++;
    if (data[offset] > 175 && data[offset + 1] > 175 && data[offset + 2] > 175) headingPixels++;
  }
  // Real lettering sits on the dark inventory panel. Bright scenery alone used
  // to open loot scanning windows, even when the player was looking at the sky.
  return headingPixels >= 900 && samples > 0 && darkPixels / samples >= 0.45;
}

// Bounds can describe either a standalone captured tile or one slot in a cropped
// frame. Sample in the game's 105x108 reference coordinates without allocating
// another canvas or image buffer on the live capture path.
export function inspectBlueprintTile(image, bounds = { x: 0, y: 0, width: image.width, height: image.height }) {
  const { width, height, data } = image;
  const pixel = (x, y) => {
    const px = Math.floor(bounds.x + x * bounds.width / 105);
    const py = Math.floor(bounds.y + y * bounds.height / 108);
    return px >= 0 && py >= 0 && px < width && py < height ? (py * width + px) * 4 : -1;
  };
  let blue = 0, total = 0;
  for (let y = 5; y < 85; y += 2) for (let x = 5; x < 100; x += 2) {
    const offset = pixel(x, y);
    if (offset < 0) continue;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    if (b > 45 && b > r * 1.35 && b > g * 1.12 && g > 20) blue++;
    total++;
  }
  const score = total ? blue / total : 0;
  if (score < 0.40) return { score, bookScore: 0, bookBackground: 0, isBlueprint: false };
  const fraction = (left, top, right, bottom, dark = false) => {
    let matches = 0, samples = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const offset = pixel(x, y);
      if (offset < 0) continue;
      const r = data[offset], g = data[offset + 1], b = data[offset + 2];
      if (dark ? Math.max(r, g, b) < 120 : Math.min(r, g, b) > 160) matches++;
      samples++;
    }
    return samples ? matches / samples : 0;
  };
  // A book has two upright pages: both their tops and bottoms must be bright.
  // Counting all white pixels in this patch also accepted the diagonal wrench
  // on ordinary items. Checking the dark footer beside the book rejects bright
  // gameplay scenery (sky, buildings, motion blur) without reading item names.
  let bookScore = 0;
  // The glyph is only about ten stream pixels wide at 900p. Allow one reference
  // pixel of alignment error so resizing/JPEG interpolation cannot move a page
  // edge out of its probe. All four page probes move together, preserving shape.
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    bookScore = Math.max(bookScore, Math.min(
      fraction(8 + dx, 84 + dy, 11 + dx, 88 + dy), fraction(8 + dx, 89 + dy, 11 + dx, 94 + dy),
      fraction(15 + dx, 84 + dy, 18 + dx, 88 + dy), fraction(15 + dx, 89 + dy, 18 + dx, 94 + dy)));
  }
  const bookBackground = fraction(22, 82, 29, 97, true);
  return { score, bookScore, bookBackground, isBlueprint: bookScore >= 0.5 && bookBackground >= 0.75 };
}

export function detectBlueprintTiles(image, recognizedText = '', geometry = image) {
  const text = String(recognizedText).toUpperCase();
  if (/\bBLUEPRINTS\b/.test(text) && /\bFOUND\b/.test(text)) return [];
  if (!/\b(?:CONTAINER|LOADOUT|BACKPACK)\b/.test(text)) return [];
  const { width, height, data } = image;
  const { width: frameWidth, height: frameHeight, y: originY = 0 } = geometry;
  if (!width || !height || !data || Math.abs(frameWidth / frameHeight - 16 / 9) > 0.15) return [];
  const matches = [];
  for (let index = 0; index < containerTiles.length; index++) {
    const [left, top] = containerTiles[index];
    const evidence = inspectBlueprintTile(image, {
      x: left * frameWidth / 2048 - (geometry.x || 0), y: top * frameHeight / 1152 - originY,
      width: 105 * frameWidth / 2048, height: 108 * frameHeight / 1152,
    });
    if (evidence.isBlueprint) matches.push({ slot: index + 1, score: evidence.score,
      bookScore: evidence.bookScore, bookBackground: evidence.bookBackground });
  }
  return matches;
}
