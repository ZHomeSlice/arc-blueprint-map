# Blueprint find rarity estimates

Updated 2026-09-29. These five colors describe the **estimated difficulty of finding the blueprint**, not the rarity color of the item it crafts. Embark has not published per-blueprint drop probabilities. The tiers are editorial estimates, and game updates can move blueprints between loot pools.

Sources:

- [ARC Raiders Wiki blueprint table](https://arcraiders.wiki/wiki/Blueprints): current map, condition, container, quest, and trial restrictions.
- [MetaForge blueprint farming guide](https://metaforge.app/arc-raiders/how-to-find-every-blueprint-in-arc-raiders): qualitative frequency observations and known exceptions. For example, Silencer II is described as especially common despite its crafted item tier; Vita Shot and Tempest are described as among the rarest.
- [Arc Blueprint Tracker drop registry](https://arcblueprinttracker.io/data): community reported map and condition sightings used to cross-check availability. Its **confidence** field measures confidence in a reported source, not drop rarity.

The implementation in `public/blueprint-rarity.js` assigns each of the 83 blueprints in the local collection once. The criteria are qualitative:

| Color | Label | Working criterion |
| --- | --- | --- |
| Gray | Very common | Explicitly reported as frequent or broadly available from high-density containers. |
| Green | Common | Routine loot pools or a guaranteed quest reward. Quest-only does not imply a low drop chance. |
| Blue | Uncommon | Narrower map, container, or condition pool, or less frequent reports. |
| Purple | Very rare | Multiple restrictions, a particularly competitive pool, or explicitly hard to find. |
| Gold | Extremely rare | A uniquely restricted source or explicitly described among the rarest finds. |

These tiers compare the practical effort of obtaining a blueprint, including the chance of encountering the relevant map condition. They are not percentages. For a newly entered name absent from the catalog, the map leaves the pin orange and says “Rarity not rated.” Unreviewed sightings use a hollow dashed dot. Revisit estimates as the game changes, especially event exclusives and new blueprints.

Specific judgment calls: Burletta, Hullcracker, and Lure Grenade are green because their quest rewards are guaranteed. Bobcat and Vulcano have additional Hurricane sources, so they are below gold. Jupiter is purple because the Harvester source is restricted but MetaForge describes it as more common than Equalizer. Silencer I is purple while Silencer II is gray, following the observed drop contrast rather than attachment level. Fireworks Box is blue because a quest reward exists despite Cold Snap restriction on random drops.
