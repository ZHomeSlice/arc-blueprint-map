// ARC Raiders loot containers use four fixed columns at 16:9. The blue grid
// covers most of a blueprint tile, even when its item name is not visible.
const containerTiles = [
  [169, 315], [280, 315], [390, 315], [502, 315],
  [169, 427], [280, 427], [390, 427], [502, 427],
];

export function detectBlueprintTiles(image, recognizedText = '') {
  const text = String(recognizedText).toUpperCase();
  if (/\bBLUEPRINTS\b/.test(text) && /\bFOUND\b/.test(text)) return [];
  if (!/\b(?:CONTAINER|LOADOUT|BACKPACK)\b/.test(text)) return [];
  const { width, height, data } = image;
  if (!width || !height || !data || Math.abs(width / height - 16 / 9) > 0.15) return [];
  const matches = [];
  for (let index = 0; index < containerTiles.length; index++) {
    const [left, top] = containerTiles[index];
    let blue = 0, total = 0;
    for (let y = top + 5; y < top + 85; y += 2) {
      for (let x = left + 5; x < left + 100; x += 2) {
        const px = Math.floor(x * width / 2048);
        const py = Math.floor(y * height / 1152);
        const offset = (py * width + px) * 4;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (b > 45 && b > r * 1.35 && b > g * 1.12 && g > 20) blue++;
        total++;
      }
    }
    const score = blue / total;
    // Blue rarity wedges can fill as much of a normal item as a blueprint grid.
    // The white open-book icon in the lower-left corner distinguishes a recipe.
    let bookPixels = 0;
    for (let y = top + 80; y < top + 106; y += 2) {
      for (let x = left + 3; x < left + 31; x += 2) {
        const px = Math.floor(x * width / 2048);
        const py = Math.floor(y * height / 1152);
        const offset = (py * width + px) * 4;
        if (data[offset] > 160 && data[offset + 1] > 160 && data[offset + 2] > 160) bookPixels++;
      }
    }
    if (score >= 0.40 && bookPixels >= 18) matches.push({ slot: index + 1, score });
  }
  return matches;
}
