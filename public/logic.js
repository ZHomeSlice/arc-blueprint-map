export function blueprintFromText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const clean = value => value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ').trim();
  const valid = value => value.length >= 3 && value.length <= 70 && (value.match(/[a-z]/gi) || []).length >= 3 && !/^(already learned|ping item)$/i.test(value);

  // Item titles have priority over the small BLUEPRINT category label and status text.
  for (const line of lines) {
    const match = line.match(/^(.+?)\s+blueprint\s*$/i);
    if (!match) continue;
    const name = clean(match[1]);
    if (valid(name) && !/[|]/.test(name)) return name;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^blueprint\s*[:\-]?\s*$/i.test(line)) continue;
    const next = clean(lines[i + 1] || '');
    if (valid(next)) return next.replace(/\s+blueprint$/i, '');
    const previous = clean(lines[i - 1] || '');
    if (valid(previous)) return previous;
  }
  return null;
}

export function clamp01(value) { return Math.max(0, Math.min(1, Number(value))); }
export function positionFromEvent(event, element) {
  const box = element.getBoundingClientRect();
  return { x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height) };
}

export function createFind(name, map, position) {
  return { id: crypto.randomUUID(), name: name.trim(), map, x: clamp01(position.x), y: clamp01(position.y), foundAt: new Date().toISOString() };
}

export function isOwnCommunityDuplicate(playerName, gameName, communityFind, personalFinds, tolerance = 0.002) {
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const owner = normalize(gameName);
  if (!owner || normalize(playerName) !== owner || !Array.isArray(personalFinds)) return false;
  const name = normalize(communityFind?.name);
  const map = normalize(communityFind?.map);
  if (!name || !map || !Number.isFinite(communityFind?.x) || !Number.isFinite(communityFind?.y)) return false;
  return personalFinds.some(personal => normalize(personal.name) === name && normalize(personal.map) === map &&
    Number.isFinite(personal.x) && Number.isFinite(personal.y) &&
    Math.hypot(personal.x - communityFind.x, personal.y - communityFind.y) <= tolerance);
}

export function deduplicateBlueprintEntries(entries, timestampKey = 'foundAt', windowMs = 60 * 1000) {
  if (!Array.isArray(entries)) return [];
  const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const rank = entry => {
    const recognized = normalizeName(entry.name) !== 'unidentified blueprint' ? 1 : 0;
    const located = Boolean(entry.map && (entry.position || (Number.isFinite(entry.x) && Number.isFinite(entry.y))));
    return recognized + (located ? 2 : 0);
  };
  const ordered = entries.map((entry, index) => ({ entry, index, timestamp: Date.parse(entry[timestampKey]) }))
    .filter(item => normalizeName(item.entry.name) && Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
  const keptIndexes = new Set();
  const groupsByName = new Map();
  for (const item of ordered) {
    const name = normalizeName(item.entry.name);
    if (name === 'unidentified blueprint') {
      keptIndexes.add(item.index);
      continue;
    }
    const group = groupsByName.get(name);
    if (!group || item.timestamp - group.lastTimestamp > windowMs) {
      if (group) keptIndexes.add(group.best.index);
      groupsByName.set(name, { lastTimestamp: item.timestamp, best: item });
      continue;
    }
    group.lastTimestamp = item.timestamp;
    if (rank(item.entry) > rank(group.best.entry)) group.best = item;
  }
  for (const group of groupsByName.values()) keptIndexes.add(group.best.index);
  return entries.filter((entry, index) => keptIndexes.has(index) || !normalizeName(entry.name) ||
    !Number.isFinite(Date.parse(entry[timestampKey])));
}

export function removeRecentDuplicateDiscoveries(data, windowMs = 60 * 1000) {
  if (!data || !Array.isArray(data.finds) || !Array.isArray(data.sightings)) return 0;
  const activeSightings = data.sightings.filter(sighting => !sighting.dismissed);
  const cleanedSightings = deduplicateBlueprintEntries(activeSightings, 'seenAt', windowMs);
  const duplicateSightings = new Set(activeSightings.filter(sighting => !cleanedSightings.includes(sighting)));
  const removedFindIds = new Set();
  for (const sighting of duplicateSightings) {
    if (sighting.savedFindId) removedFindIds.add(sighting.savedFindId);
  }
  const cleanedFinds = deduplicateBlueprintEntries(data.finds, 'foundAt', windowMs);
  const duplicateFinds = new Set(data.finds.filter(find => !cleanedFinds.includes(find)));
  for (const find of duplicateFinds) {
    removedFindIds.add(find.id);
    if (find.sightingId) {
      const linked = data.sightings.find(sighting => sighting.id === find.sightingId);
      if (linked) duplicateSightings.add(linked);
    }
  }
  data.sightings = data.sightings.filter(sighting => !duplicateSightings.has(sighting));
  data.finds = data.finds.filter(find => !duplicateFinds.has(find) && !removedFindIds.has(find.id));
  return duplicateSightings.size + duplicateFinds.size;
}
