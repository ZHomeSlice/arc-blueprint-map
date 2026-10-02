import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSightingFeedback, feedbackPrompt } from '../public/sighting-feedback.js';
import { emptyData, buildBackup, parseBackup, cleanStoredData } from '../public/backup.js';

test('feedback exports explicit labels and captured evidence, excluding automatic predictions', () => {
  const data = emptyData();
  data.dismissedTiles = [{ id: 'archived', tilePreview: 'data:image/png;base64,AA', reviewNotes: 'Blue wedge' }];
  data.sightings = [
    { id: 'false', name: 'Pulse Mine', dismissed: true, tilePreview: 'data:image/png;base64,BB', frame: 'frame', tileScore: 0.45 },
    { id: 'true', name: 'Aphelion', reviewVerdict: 'blueprint', tilePreview: 'data:image/png;base64,CC' },
    { id: 'auto', name: 'Deadline', nameSource: 'catalog icon', savedFindId: 'f' },
  ];
  const bundle = buildSightingFeedback(data, '2026-10-01T12:00:00Z');
  assert.deepEqual(bundle.examples.map(entry => [entry.id, entry.verdict]),
    [['archived', 'not_blueprint'], ['false', 'not_blueprint'], ['true', 'blueprint']]);
  assert.equal(bundle.examples[0].notes, 'Blue wedge');
  assert.equal(bundle.examples[1].capturedFrame, 'frame');
  assert.equal(bundle.examples[1].recognition.blueCoverage, 0.45);
  const prompt = feedbackPrompt(bundle, 'evidence.json');
  assert.match(prompt, /evidence.json/);
  assert.match(prompt, /2 human-labeled non-blueprints and 1 human-confirmed blueprints/);
});

test('restoration cancels negative evidence without declaring a positive', () => {
  const bundle = buildSightingFeedback({ dismissedTiles: [{ id: 'r', tilePreview: 'image' }],
    sightings: [{ id: 'r', name: 'Deadline', dismissed: false, nameSource: 'OCR' }] });
  assert.equal(bundle.examples.length, 0);
  const restoredPriorPositive = buildSightingFeedback({ sightings: [
    { id: 'previously-reviewed', nameSource: 'user edited', dismissed: false, reviewVerdict: null },
  ] });
  assert.equal(restoredPriorPositive.examples.length, 0);
});

test('corrected false alerts replace archived negatives with confirmed positives', () => {
  const bundle = buildSightingFeedback({ dismissedTiles: [{ id: 'r', tilePreview: 'old' }],
    sightings: [{ id: 'r', name: 'Aphelion', detectedName: 'Pulse Mine', dismissed: false,
      nameSource: 'user edited', reviewVerdict: 'blueprint', tilePreview: 'new' }] });
  assert.equal(bundle.examples.length, 1);
  assert.equal(bundle.examples[0].verdict, 'blueprint');
  assert.equal(bundle.examples[0].predictedName, 'Pulse Mine');
  assert.equal(bundle.examples[0].reviewedName, 'Aphelion');
});

test('archived false-alert evidence survives startup cleanup and private backup round trips', () => {
  const data = emptyData();
  data.dismissedTiles = [{ id: 'archived', tilePreview: 'data:image/png;base64,AA',
    frame: 'captured frame', name: 'Pulse Mine', reviewNotes: 'Not a book glyph', iconConfidence: 0.73 }];
  assert.deepEqual(cleanStoredData(data).data.dismissedTiles, data.dismissedTiles);
  assert.deepEqual(parseBackup(buildBackup(data)).dismissedTiles, data.dismissedTiles);
});
