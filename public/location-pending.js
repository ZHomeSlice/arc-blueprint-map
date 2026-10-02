// Keep retrying an open map that was captured promptly. Never apply a later
// raid's current location to an old unresolved sighting automatically.
export const LOCATION_WINDOW_MS = 3 * 60 * 1000;
export function pendingMapSightings(sightings, now, sessionIds = []) {
  const active = new Set(sessionIds);
  return sightings.filter(sighting => {
    if (sighting.dismissed || sighting.locationMissed || sighting.savedFindId || sighting.position) return false;
    const age = now - Date.parse(sighting.seenAt);
    return Number.isFinite(age) && age >= 0 && (age < LOCATION_WINDOW_MS || active.has(sighting.id));
  });
}
