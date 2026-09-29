// Read the fixed map title in the top-right legend. It identifies the raid
// map; image matching still has to verify the background and select a floor.
const titles = [
  ['stella', 'STELLAMONTIS'],
  ['dam', 'DAMBATTLEGROUNDS'],
  ['spaceport', 'SPACEPORT'],
  ['buried-city', 'BURIEDCITY'],
  ['blue-gate', 'BLUEGATE'],
  ['riven-tides', 'RIVENTIDES'],
];

function editDistance(first, second) {
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row++) {
    const next = [row];
    for (let column = 1; column <= second.length; column++) {
      next[column] = Math.min(next[column - 1] + 1, previous[column] + 1,
        previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    }
    previous = next;
  }
  return previous[second.length];
}

export function mapFamilyFromTitle(text) {
  const letters = String(text || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/^THE/, '');
  if (!letters) return null;
  for (const [family, title] of titles) if (letters.includes(title)) return family;
  const matches = titles.map(([family, title]) => ({ family, distance: editDistance(letters, title), length: title.length }))
    .sort((first, second) => first.distance - second.distance);
  const best = matches[0];
  return best.distance <= (best.length >= 10 ? 2 : 1) && best.distance + 2 <= matches[1].distance ? best.family : null;
}

export function cropMapTitle(source) {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 150;
  canvas.getContext('2d').drawImage(source, 1600 / 2048 * source.width, 140 / 1152 * source.height,
    320 / 2048 * source.width, 50 / 1152 * source.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function selectMapCandidate(candidates) {
  const valid = candidates.filter(candidate => candidate.match && candidate.position &&
    candidate.match.score >= (candidate.preset.minScore ?? 0.72) && candidate.appearance?.mae <= 45)
    .sort((first, second) => first.appearance.mae - second.appearance.mae);
  if (!valid.length) return { error: 'The map title was read, but its image did not align. Keep the map open or save a screenshot for review.' };
  if (valid.length > 1 && valid[1].appearance.mae - valid[0].appearance.mae < 6) {
    return { error: 'The map floor is uncertain. Use a clearer map screenshot, or select the floor and place the pin manually.' };
  }
  return valid[0];
}
