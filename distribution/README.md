# ARC Blueprint Map

A local Windows tracker for places where you found blueprints in ARC Raiders. It watches a browser-shared game window, recognizes a blueprint in the loot container, and uses a nearby in-game map view to suggest a pin on the correct map and floor. It is a community prototype and is not affiliated with Embark Studios.

## Download and start

1. On the [GitHub Releases page](https://github.com/ZHomeSlice/arc-blueprint-map/releases), download `ARC-Blueprint-Map-Windows-x64.zip` from the latest release.
2. Extract the ZIP to a folder. Double-click **Start Blueprint Map.cmd**. It opens the tracker in your browser. No Node.js installation is needed for this ZIP.
3. In Chrome or Edge, choose **Start capture**, then share the **ARC Raiders** window. If the game window is unavailable, share **Entire Screen** and keep the game visible.
4. Open a loot container, hover over a blueprint to help read its name, then open the in-game map soon afterward. Keep the map open until the tracker locates your position.
5. Review the blue provisional pin. Strong name matches save automatically; otherwise confirm the name or icon and save the pin yourself.

The source-code ZIP from GitHub requires Node.js 20 or newer. After installing Node.js, use the same double-click launcher.

The app runs at `http://127.0.0.1:4177/` and binds only to your computer. Game frames are processed in the browser. Finds, sightings, and map images are kept in that browser's local storage. Use **Export JSON** to back up your data or move it to another browser. Personal findings do not sync automatically.

Capture requests 2 FPS and at most 1600×900. Routine scanning checks small container and map patches; blueprint detection uses the upper-left quarter when a container opens. Text recognition runs only when a visible container has a recent blueprint needing a name. Full-frame processing is reserved for discovery snapshots, map location matching, and manual captures. Stopping capture releases scanning buffers and text-recognition resources.

To share confirmed finds, check **Share** beside each find, enter your in-game name, and select **Copy blueprint JSON and open Form**. Paste the JSON into the prefilled Google Form. This sends names, map and floor, positions, times, and a sortable reliability estimate; it sends no screenshots or map images. Download the community CSV from the link in the app and import it separately from your own finds. Community pins can be filtered by player, date, and reliability.

## Current limits

- The visual detector checks a 16:9 in-raid loot container. It may miss blueprints or flag another item; review sightings before saving.
- Map matching needs a clear in-game map image soon after the sighting. If the map or floor is uncertain, the sighting remains unpinned for review.
- The built-in maps have passed simulated geometry checks; some maps and floors still need more real-game testing. Pins are approximate.
- Notifications are optional. The sightings list works without notification permission.

## Source and credits

Run `node server.mjs` to start from source, or `node --test` for the focused tests. No package installation is needed. See [third-party credits](THIRD-PARTY.md) for bundled maps, item art, OCR, and Node.js in the portable download.

Map searches and blueprint icon scoring run in a background worker. The live preview starts hidden; select **Show live preview** when needed. **Capture troubleshooting → Pause scanning (keep sharing)** stops automatic analysis without ending screen sharing, so you can check whether mouse stalls come from scanning or from sharing. **Stop** releases both analysis workers and the shared stream. Prefer **Window → ARC Raiders** in the share picker.
