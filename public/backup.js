import { mapPresets, presetForMap, presetForMode, presetMapData } from './map-presets.js';

export const BACKUP_VERSION = 2;
export const COORDINATE_SYSTEM = 'normalized-map';
const BACKUP_FORMAT = 'arc-blueprint-map-backup';
const text = value => typeof value === 'string' && Boolean(value.trim());
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const isBuiltInMap = name => mapPresets.some(preset => preset.name === name);
export const isNormalizedPosition = position => Boolean(position &&
  Number.isFinite(position.x) && position.x >= 0 && position.x <= 1 &&
  Number.isFinite(position.y) && position.y >= 0 && position.y <= 1);

const normalizedRecord = entry => entry.coordinateSystem == null || entry.coordinateSystem === COORDINATE_SYSTEM;
const validFind = find => Boolean(find && normalizedRecord(find) && text(find.id) && text(find.name) &&
  isBuiltInMap(find.map) && isNormalizedPosition(find) && date(find.foundAt));
const validSighting = sighting => Boolean(sighting && normalizedRecord(sighting) && text(sighting.id) && text(sighting.name) &&
  date(sighting.seenAt) && (sighting.map == null || sighting.map === '' || isBuiltInMap(sighting.map)) &&
  (sighting.position == null || (isBuiltInMap(sighting.map) && isNormalizedPosition(sighting.position))));
const validDismissedTile = entry => Boolean(entry && text(entry.id) && text(entry.tilePreview));

export function emptyData() {
  return { version: BACKUP_VERSION, coordinateSystem: COORDINATE_SYSTEM,
    currentMap: mapPresets[0].name,
    maps: Object.fromEntries(mapPresets.map(preset => [preset.name, presetMapData(preset)])),
    finds: [], sightings: [], dismissedTiles: [] };
}

// Local storage can retain proven built-in records. Never reinterpret coordinates
// from a custom background, and never clamp an old pixel position into a map corner.
export function cleanStoredData(saved) {
  const data = emptyData();
  const maps = saved?.maps && typeof saved.maps === 'object' ? saved.maps : {};
  const trustedMaps = new Set(Object.entries(maps)
    .filter(([name, map]) => presetForMap(map)?.name === name).map(([name]) => name));
  const knownCoordinates = saved?.coordinateSystem == null || saved.coordinateSystem === COORDINATE_SYSTEM;
  const finds = Array.isArray(saved?.finds) ? saved.finds : [];
  const sightings = Array.isArray(saved?.sightings) ? saved.sightings : [];
  data.finds = finds.filter(find => knownCoordinates && trustedMaps.has(find?.map) && validFind(find));
  data.sightings = sightings.filter(sighting => validSighting(sighting) &&
    (!sighting.map || trustedMaps.has(sighting.map)) && (!sighting.position || knownCoordinates))
    .map(sighting => ({ ...sighting }));
  const findIds = new Set(data.finds.map(find => find.id));
  for (const sighting of data.sightings) {
    if (sighting.savedFindId && !findIds.has(sighting.savedFindId)) delete sighting.savedFindId;
  }
  data.dismissedTiles = (Array.isArray(saved?.dismissedTiles) ? saved.dismissedTiles : [])
    .filter(validDismissedTile).map(entry => ({ ...entry })).slice(-32);
  for (const sighting of data.sightings) {
    if (sighting.dismissed && sighting.suppressRepeat !== false && text(sighting.tilePreview) &&
        !data.dismissedTiles.some(entry => entry.id === sighting.id)) {
      data.dismissedTiles.push({ ...sighting });
    }
  }
  data.dismissedTiles = data.dismissedTiles.slice(-32);
  if (trustedMaps.has(saved?.currentMap)) data.currentMap = saved.currentMap;
  return { data, removed: { maps: Object.keys(maps).length - trustedMaps.size,
    finds: finds.length - data.finds.length, sightings: sightings.length - data.sightings.length } };
}

export function buildBackup(data) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, coordinateSystem: COORDINATE_SYSTEM,
    exportedAt: new Date().toISOString(), currentMap: data.currentMap,
    maps: Object.fromEntries(mapPresets.map(preset => [preset.name, { presetId: preset.id }])),
    finds: data.finds, sightings: data.sightings, dismissedTiles: data.dismissedTiles };
}

export function parseBackup(payload) {
  if (payload?.format !== BACKUP_FORMAT || payload.version !== BACKUP_VERSION ||
      payload.coordinateSystem !== COORDINATE_SYSTEM) {
    throw new Error('Older backups are no longer supported. Import a new version 2 JSON backup from this app.');
  }
  if (!payload.maps || typeof payload.maps !== 'object' || Array.isArray(payload.maps) ||
      !Array.isArray(payload.finds) || !Array.isArray(payload.sightings) || !Array.isArray(payload.dismissedTiles) ||
      !isBuiltInMap(payload.currentMap)) throw new Error('Invalid version 2 backup.');
  for (const [name, map] of Object.entries(payload.maps)) {
    if (presetForMode(map?.presetId)?.name !== name || Object.keys(map).some(key => key !== 'presetId')) {
      throw new Error('Backups must use built-in map references, without custom images.');
    }
  }
  if (!payload.maps[payload.currentMap] || payload.finds.some(find => !validFind(find) || !payload.maps[find.map]) ||
      payload.sightings.some(sighting => !validSighting(sighting) || (sighting.map && !payload.maps[sighting.map])) ||
      payload.dismissedTiles.some(entry => !validDismissedTile(entry))) {
    throw new Error('Backup contains invalid records or positions. Coordinates must be map fractions between 0 and 1 (0.25 means 25%).');
  }
  if (new Set(payload.finds.map(find => find.id)).size !== payload.finds.length ||
      new Set(payload.sightings.map(sighting => sighting.id)).size !== payload.sightings.length) {
    throw new Error('Backup contains duplicate record IDs.');
  }
  const data = emptyData();
  data.currentMap = payload.currentMap;
  data.finds = payload.finds.map(find => ({ ...find }));
  data.sightings = payload.sightings.map(sighting => ({ ...sighting }));
  data.dismissedTiles = payload.dismissedTiles.map(entry => ({ ...entry })).slice(-32);
  return data;
}
