// Estimated ease of finding the blueprint itself, not the crafted item's in-game rarity.
// Sources and tier rationale: research/blueprint-rarity.md.
export const rarityTiers = Object.freeze({
  veryCommon: { label: 'Very common', color: '#929a96' },
  common: { label: 'Common', color: '#25a44e' },
  uncommon: { label: 'Uncommon', color: '#0892d2' },
  rare: { label: 'Very rare', color: '#af2d86' },
  extreme: { label: 'Extremely rare', color: '#dcab0f' },
});

const groups = {
  veryCommon: `Blue Light Stick|Green Light Stick|Red Light Stick|Yellow Light Stick|Bettina I|Defibrillator|Explosive Mine|Jolt Mine|Showstopper|Silencer II`,
  common: `Angled Grip II|Anvil|Burletta|Compensator II|Extended Light Mag II|Extended Medium Mag II|Extended Shotgun Mag II|Heavy Gun Parts|Hullcracker|Il Toro|Light Gun Parts|Lure Grenade|Medium Gun Parts|Muzzle Brake II|Osprey|Shotgun Choke II|Stable Stock II|Trigger 'Nade|Venator|Vertical Grip II`,
  uncommon: `Angled Grip III|Aphelion|Barricade Kit|Blaze Grenade|Bobcat|Complex Gun Parts|Compensator III|Crash Mat|Deadline|Extended Barrel II|Extended Barrel III|Extended Light Mag III|Extended Medium Mag III|Extended Shotgun Mag III|Fireworks Box|Gas Mine|Lightweight Stock|Muzzle Brake III|Padded Stock|Powered Descender|Pulse Mine|Remote Raider Flare|Seeker Grenade|Shotgun Choke III|Shotgun Silencer|Smoke Grenade|Stable Stock III|Surge Coil|Tagging Grenade|Trailblazer|Vertical Grip III|Vita Spray|White Flag|Wolfpack`,
  rare: `Canto|Combat Mk. 3 (Aggressive)|Combat Mk. 3 (Flanking)|Jupiter|Looting Mk. 3 (Safekeeper)|Looting Mk. 3 (Survivor)|Rascal|Silencer I|Snap Hook|Tactical Mk. 3 (Defensive)|Tactical Mk. 3 (Healing)|Tactical Mk. 3 (Revival)|Tactical Mk. 3 (Smoke)|Torrente|Vulcano`,
  extreme: `Dolabra|Equalizer|Tempest|Vita Shot`,
};

const normalize = name => String(name || '').toLowerCase().replace(/\bblueprint\b/g, '').replace(/[^a-z0-9]/g, '');
const tierByName = new Map();
for (const [tier, names] of Object.entries(groups)) {
  for (const name of names.split('|')) tierByName.set(normalize(name), tier);
}
// Common names used by the game and external registries differ from this collection.
for (const [alias, canonical] of Object.entries({
  Bettina: 'Bettina I',
  'Trigger Nade': "Trigger 'Nade",
  'Extended Light Magazine II': 'Extended Light Mag II',
  'Extended Light Magazine III': 'Extended Light Mag III',
  'Extended Medium Magazine II': 'Extended Medium Mag II',
  'Extended Medium Magazine III': 'Extended Medium Mag III',
  'Extended Shotgun Magazine II': 'Extended Shotgun Mag II',
  'Extended Shotgun Magazine III': 'Extended Shotgun Mag III',
})) tierByName.set(normalize(alias), tierByName.get(normalize(canonical)));

export function rarityForBlueprint(name) {
  const tier = tierByName.get(normalize(name));
  return tier ? { id: tier, ...rarityTiers[tier] } : null;
}
