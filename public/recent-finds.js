export const RECENT_FINDS_WINDOW_MS = 60 * 60 * 1000;

export function recentBlueprintFinds(data, now = Date.now()) {
  const excluded = new Set((data.sightings || [])
    .filter(sighting => sighting.dismissed || sighting.locationMissed)
    .map(sighting => sighting.savedFindId).filter(Boolean));
  return (data.finds || []).filter(find => {
    const age = now - Date.parse(find.foundAt);
    return !excluded.has(find.id) && Number.isFinite(age) && age >= 0 && age <= RECENT_FINDS_WINDOW_MS;
  }).sort((a, b) => Date.parse(b.foundAt) - Date.parse(a.foundAt));
}
