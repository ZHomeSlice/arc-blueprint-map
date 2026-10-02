# First false-match feedback batch

Source: Homer's `arc-blueprint-feedback-2026-10-01T18-17-29-446Z.json`, supplied on October 1, 2026. The downloaded source is unchanged. `manifest.json` retains its labels and available recognition metadata; JPEGs are the decoded captured images.

The 13 negative labels cover seven ordinary equipment tiles with a wrench glyph and six gameplay/scenery crops. The two positive labels are captured blueprint tiles reviewed as Gas Mine and Defibrillator. Missing names, scores, slots, and screenshots in archived examples are unavailable, not inferred.

The old detector counted white pixels in the lower-left icon patch. A diagonal wrench and bright outdoor scenery could meet that count. The updated detector requires the top and bottom of both upright book pages, tolerates one reference pixel of alignment error, and checks the dark footer beside the glyph. Container-heading checks also require dark panel background, preventing the supplied scenery frames from opening loot scan windows.

`legacy-blueprint-visual.js` freezes the previous detector for comparisons. `tile-pixels.json.gz` contains losslessly decoded RGBA pixels for dependency-free Node regression tests. The original JPEGs remain the browser-test inputs. `contact-sheet.png` and `glyphs.png` show the inspected evidence.

Run `node research/test_false_positive_feedback.mjs` with the local server running. It replays each crop in all eight slots at 720p, 900p, and 1152p, compares full-frame and cropped capture detection, and checks available discovery frames. `detection-results.json` records the results: 11 of 13 negative examples reproduced old false positives in 149 of 312 negative replay trials; the revised detector has zero false positives and retains both positive examples in all 48 positive trials. All 15 original-size tile labels pass the standalone check.

Full frames are context, not necessarily the same item as the stored tile. The Gas Mine frame visibly contains a blueprint in slot 3. The frame accompanying the reviewed Defibrillator tile contains a hovered Deadline blueprint in slot 5. Those inspected positions are stored as `frameBlueprintSlots`; the user's tile labels are not changed. The reduced Gas Mine frame already fails the old heading brightness threshold after compression, so the regression checks preserve that gate's behavior rather than treating it as a new miss.

This batch verifies these captures and resizing cases, not every blueprint or lighting condition. Existing screenshot tests add Aphelion and earlier blueprint captures at 720p, 900p, and 4K input. Additional confirmed blueprint captures remain useful for broader validation.
