// Fixed, offline map backgrounds. Keep each map layer separate so its pins
// use one stable coordinate space.
export const mapPresets = [
  { id: 'stella-upper', name: 'Stella Montis Upper', image: '/maps/stella-upper.jpg', width: 5120, height: 3500,
    source: 'Stella_Montis_Upper_Level_Map.jpg', family: 'stella', scales: [0.29, 0.30, 0.31], minScore: 0.62 },
  { id: 'stella-lower', name: 'Stella Montis Lower', image: '/maps/stella-lower.jpg', width: 5120, height: 3500,
    source: 'Stella_Montis_Lower_Level_Map.jpg', family: 'stella', scales: [0.29, 0.30, 0.31], minScore: 0.72 },
  { id: 'dam-battlegrounds', name: 'Dam Battlegrounds', image: '/maps/dam-battlegrounds.jpg', width: 4096, height: 3072,
    source: 'Dam_Battlegrounds_Map.jpg', family: 'dam' },
  { id: 'spaceport', name: 'Spaceport', image: '/maps/spaceport.jpg', width: 4096, height: 4096,
    source: 'Acerra_Spaceport_Map.jpg', family: 'spaceport' },
  { id: 'spaceport-underground', name: 'Spaceport Underground', image: '/maps/spaceport-underground.jpg', width: 3500, height: 1700,
    source: 'Acerra_Spaceport_Underground_Map.jpg', family: 'spaceport' },
  { id: 'buried-city', name: 'Buried City', image: '/maps/buried-city.jpg', width: 5120, height: 5120,
    source: 'Buried_City_Map.jpg', family: 'buried-city', minScore: 0.70 },
  { id: 'blue-gate', name: 'Blue Gate', image: '/maps/blue-gate.jpg', width: 4096, height: 3072,
    source: 'Blue_Gate_Map.jpg', family: 'blue-gate' },
  { id: 'blue-gate-underground', name: 'Blue Gate Underground', image: '/maps/blue-gate-underground.jpg', width: 3500, height: 1700,
    source: 'Blue_Gate_Underground_Map.jpg', family: 'blue-gate' },
  { id: 'riven-tides', name: 'Riven Tides', image: '/maps/riven-tides.jpg', width: 5120, height: 4096,
    source: 'Riven_Tides_Map.jpg', family: 'riven-tides' },
];

export function presetForMode(mode) { return mapPresets.find(preset => preset.id === mode); }
export function presetForMap(map) {
  const preset = presetForMode(map?.mode);
  return preset?.image === map?.image ? preset : null;
}
export function presetMapData(preset) {
  return { image: preset.image, ratio: preset.width / preset.height, mode: preset.id };
}
