import { blueprintFromText, createFind, positionFromEvent } from './logic.js';
import { detectPlayerArrow, isArcMapView, matchMapFrames } from './map-match.js';
import { matchFullMap, mapPatchAppearance, pointOnFullMap } from './full-map-match.js';
import { cropMapTitle, mapFamilyFromTitle, selectMapCandidate } from './map-detect.js';
import { mapPresets, presetForMap, presetForMode, presetMapData } from './map-presets.js';
import { detectBlueprintTiles } from './blueprint-visual.js';
import { identifyBlueprintIcon, identifyBlueprintPreview, rankBlueprintIcons, rankBlueprintPreview } from './icon-match.js';

const $ = id => document.getElementById(id);
const storageKey = 'arc-blueprint-map-v1';
const ui = {
  mapName: $('map-name'), useMap: $('use-map'), presetMap: $('preset-map'), usePresetMap: $('use-preset-map'),
  fullStella: $('use-stella-upper'), mapCredit: $('map-credit'), mapCreditLink: $('map-credit-link'), mapImage: $('map-image'), map: $('map'), pins: $('pins'),
  title: $('current-map-title'), coordinates: $('pin-coordinates'), draftPin: $('draft-pin'),
  blueprintName: $('blueprint-name'), save: $('save-find'), list: $('find-list'), count: $('find-count'),
  start: $('start-capture'), stop: $('stop-capture'), capturePosition: $('capture-position'), autoLocate: $('auto-locate'), mapScreenshot: $('saved-map-screenshot'),
  previewPanel: $('preview-panel'), previewVideo: $('live-preview'), previewDetails: $('preview-details'), previewHint: $('preview-hint'),
  framePanel: $('frame-panel'), frame: $('frame-canvas'), useFrameMap: $('use-frame-map'), status: $('status'), dot: $('status-dot'),
  ocrText: $('ocr-text'), note: $('capture-note'), pinHelp: $('pin-help'), export: $('export-data'), import: $('import-data'), screenshotFinds: $('add-screenshot-finds'),
  lastScan: $('last-scan'), sightingCount: $('sighting-count'), sightingList: $('sighting-list'), sightingPreview: $('sighting-preview'),
  selectedBlueprintTile: $('selected-blueprint-tile'), iconCandidates: $('icon-candidates'), iconCandidateList: $('icon-candidate-list'),
  enableAlerts: $('enable-alerts'),
};

let data = loadData();
let currentMap = data.currentMap || '';
let draftPosition = null;
let mediaStream = null;
let video = null;
let worker = null;
let scanTimer = null;
let scanning = false;
let visualTimer = null;
let visualScanning = false;
let visibleBlueprintSlots = new Set();
let mapWasOpen = false;
let mapSessionMatched = false;
let lastCandidate = '';
let lastCandidateAt = 0;
let cachedBase = null;
let cachedBaseUrl = '';
let selectedSightingId = null;
const unidentifiedBlueprint = 'Unidentified blueprint';
const suppliedFinds = [
  { id: 'screenshot-20260927195813-defibrillator', name: 'Defibrillator', x: 0.188718, y: 0.553270,
    foundAt: '2026-09-28T01:58:13.000Z', accuracy: 'Approximate · map screenshot 6 seconds later' },
  { id: 'screenshot-20260927202155-aphelion', name: 'Aphelion', x: 0.812648, y: 0.407486,
    foundAt: '2026-09-28T02:21:55.000Z', accuracy: 'Approximate · map screenshot 3 seconds later' },
  { id: 'screenshot-20260928091343-extended-barrel-ii', name: 'Extended Barrel II', x: 0.319462, y: 0.700788,
    foundAt: '2026-09-28T15:13:43.000Z', accuracy: 'Approximate · map screenshot 5 seconds later · already learned' },
  { id: 'screenshot-20260928093759-looting-safekeeper', name: 'Looting Mk. 3 (Safekeeper)', x: 0.206914, y: 0.602818,
    foundAt: '2026-09-28T15:37:59.000Z', accuracy: 'Approximate · map screenshot 4 seconds later · already learned',
    sightingAt: '2026-09-28T15:38:11.795Z' },
];

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && Array.isArray(saved.finds) && saved.maps) {
      saved.sightings = Array.isArray(saved.sightings) ? saved.sightings : [];
      return saved;
    }
  } catch { /* Ignore damaged local data. */ }
  return { version: 1, currentMap: '', maps: {}, finds: [], sightings: [] };
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { setStatus('Browser storage is full. Export your finds now.'); }
}

function setStatus(message, active = false) {
  ui.status.textContent = message;
  ui.dot.classList.toggle('active', active);
}

function useMap(name = ui.mapName.value) {
  const cleaned = String(name).trim().slice(0, 80);
  if (!cleaned) { ui.mapName.focus(); return; }
  currentMap = cleaned;
  ui.mapName.value = cleaned;
  data.currentMap = cleaned;
  data.maps[cleaned] ||= { image: null };
  draftPosition = null;
  persist();
  render();
}

function choosePreset(id) {
  const preset = presetForMode(id);
  if (!preset) return false;
  const existing = data.maps[preset.name];
  if (existing?.image && (existing.image !== preset.image || existing.mode !== preset.id)) {
    setStatus(`${preset.name} already has a different image. Export a backup before changing that map.`);
    return false;
  }
  data.maps[preset.name] = presetMapData(preset);
  useMap(preset.name);
  ui.presetMap.value = preset.id;
  setStatus(`${preset.name} ready. Open the matching in-game map floor after finding a blueprint.`, Boolean(mediaStream));
  return true;
}

function render() {
  ui.title.textContent = currentMap || 'Choose a map';
  const mapData = currentMap && data.maps[currentMap];
  const image = mapData?.image;
  ui.map.classList.toggle('has-image', Boolean(image));
  ui.map.style.backgroundImage = image ? `url("${image}")` : '';
  ui.map.style.aspectRatio = image ? String(mapData.ratio || 16 / 9) : '';
  const preset = presetForMap(mapData);
  ui.mapCredit.hidden = !preset;
  if (preset) {
    ui.mapCreditLink.href = `https://arcraiders.wiki/wiki/File:${preset.source}`;
    ui.mapCreditLink.textContent = `ARC Raiders Wiki / @Cartotect · ${preset.name}`;
    ui.presetMap.value = preset.id;
  }
  ui.map.querySelector('.map-placeholder').hidden = Boolean(image);
  ui.pins.replaceChildren();
  const finds = data.finds.filter(find => find.map === currentMap);
  for (const find of finds) {
    const pin = document.createElement('button');
    pin.className = 'pin'; pin.type = 'button';
    pin.style.left = `${find.x * 100}%`; pin.style.top = `${find.y * 100}%`;
    pin.title = `${find.name} · ${new Date(find.foundAt).toLocaleString()}`;
    pin.setAttribute('aria-label', pin.title);
    const pinLabel = document.createElement('span'); pinLabel.className = 'pin-label'; pinLabel.textContent = find.name;
    pin.append(pinLabel);
    pin.addEventListener('click', event => {
      event.stopPropagation();
      ui.coordinates.textContent = `${find.name} · ${Math.round(find.x * 100)}%, ${Math.round(find.y * 100)}%`;
    });
    ui.pins.append(pin);
  }
  for (const sighting of data.sightings.filter(entry => !entry.dismissed && !entry.savedFindId && entry.position && entry.map === currentMap)) {
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'pin sighting-pin';
    pin.style.left = `${sighting.position.x * 100}%`; pin.style.top = `${sighting.position.y * 100}%`;
    pin.title = `${sighting.name} · location captured ${new Date(sighting.seenAt).toLocaleString()} · awaiting name or review`;
    pin.setAttribute('aria-label', pin.title);
    const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = sighting.name;
    pin.append(label);
    pin.addEventListener('click', event => {
      event.stopPropagation();
      selectedSightingId = sighting.id;
      ui.blueprintName.value = sighting.name === unidentifiedBlueprint ? '' : sighting.name;
      draftPosition = sighting.position;
      render();
      ui.pinHelp.textContent = 'This sighting is located. Confirm its name to save it as a find.';
    });
    ui.pins.append(pin);
  }
  ui.draftPin.hidden = !draftPosition;
  if (draftPosition) {
    ui.draftPin.style.left = `${draftPosition.x * 100}%`;
    ui.draftPin.style.top = `${draftPosition.y * 100}%`;
    ui.coordinates.textContent = `New pin · ${Math.round(draftPosition.x * 100)}%, ${Math.round(draftPosition.y * 100)}%`;
  } else ui.coordinates.textContent = 'No pin selected';
  ui.save.disabled = !(currentMap && ui.blueprintName.value.trim() && draftPosition);
  ui.count.textContent = String(finds.length);
  ui.list.replaceChildren();
  for (const find of [...finds].reverse()) {
    const item = document.createElement('li');
    const description = document.createElement('span'); description.className = 'find-text';
    const name = document.createElement('strong'); name.textContent = find.name;
    const details = document.createElement('small'); details.textContent = `${new Date(find.foundAt).toLocaleString()}${find.accuracy ? ` · ${find.accuracy}` : ''}`;
    description.append(name, details);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn';
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${find.name}`);
    remove.addEventListener('click', () => {
      data.finds = data.finds.filter(other => other.id !== find.id);
      const sighting = data.sightings.find(entry => entry.savedFindId === find.id);
      if (sighting) sighting.savedFindId = null;
      persist(); render();
    });
    item.append(description, remove); ui.list.append(item);
  }
  renderSightings();
}

function renderSightings() {
  ui.sightingCount.textContent = String(data.sightings.filter(sighting => !sighting.dismissed).length);
  ui.sightingList.replaceChildren();
  for (const sighting of data.sightings) {
    const item = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'sighting-select';
    const state = sighting.dismissed ? 'Not a blueprint' : sighting.savedFindId ? 'Pinned' : sighting.position ? 'Location ready' : 'Needs map position';
    button.textContent = `${sighting.name} · ${new Date(sighting.seenAt).toLocaleTimeString()} · ${state}`;
    button.addEventListener('click', () => {
      selectedSightingId = sighting.id;
      ui.blueprintName.value = sighting.name === unidentifiedBlueprint ? '' : sighting.name;
      draftPosition = !sighting.savedFindId && sighting.position && sighting.map === currentMap ? sighting.position : null;
      render();
      reviewStoredSightingIcon(sighting);
      ui.pinHelp.textContent = sighting.savedFindId ? 'This blueprint is already saved on the map.' : sighting.position
        ? 'Map position saved with this sighting. Enter or review its name, then save the pin.'
        : 'Open the in-game map soon after finding the blueprint, or click its location on the map.';
    });
    const review = document.createElement('button'); review.type = 'button'; review.className = 'icon-btn';
    review.textContent = sighting.dismissed ? 'Restore' : 'Not a blueprint';
    review.addEventListener('click', () => {
      sighting.dismissed = !sighting.dismissed;
      if (sighting.dismissed && sighting.savedFindId) {
        const find = data.finds.find(entry => entry.id === sighting.savedFindId);
        if (find?.autoGenerated) {
          data.finds = data.finds.filter(entry => entry.id !== find.id);
          sighting.savedFindId = null;
        }
      }
      if (sighting.dismissed && selectedSightingId === sighting.id) selectedSightingId = null;
      persist(); render();
    });
    item.append(button, review); ui.sightingList.append(item);
  }
  const selected = data.sightings.find(sighting => sighting.id === selectedSightingId);
  ui.sightingPreview.hidden = !selected?.frame;
  if (selected?.frame) ui.sightingPreview.src = selected.frame;
  ui.selectedBlueprintTile.hidden = !selected?.tilePreview;
  if (selected?.tilePreview) ui.selectedBlueprintTile.src = selected.tilePreview;
  ui.iconCandidateList.replaceChildren();
  const candidates = selected?.name === unidentifiedBlueprint ? selected.iconCandidates || [] : [];
  ui.iconCandidates.hidden = !candidates.length;
  for (const candidate of candidates) {
    const button = document.createElement('button'); button.type = 'button';
    const icon = document.createElement('img'); icon.src = candidate.icon; icon.alt = '';
    const label = document.createElement('span'); label.textContent = candidate.name;
    button.append(icon, label);
    button.addEventListener('click', () => {
      selected.name = candidate.name;
      selected.nameSource = 'user confirmed icon';
      ui.blueprintName.value = candidate.name;
      const saved = saveLocatedSighting(selected);
      persist(); render();
      setStatus(saved ? `${candidate.name} confirmed and pinned.` : `${candidate.name} confirmed. Open the in-game map to capture its position.`, Boolean(mediaStream));
    });
    ui.iconCandidateList.append(button);
  }
}

function saveLocatedSighting(sighting) {
  if (!sighting?.position || !sighting.map || sighting.savedFindId || sighting.dismissed || sighting.name === unidentifiedBlueprint) return false;
  // The icon classifier has already checked the score and lead over the next match.
  // Keep that same gate for automatic pins, including matches restored from a saved tile.
  if (sighting.nameSource === 'catalog icon' &&
      ((sighting.iconConfidence || 0) < 0.72 || (sighting.iconMargin || 0) < 0.04)) return false;
  const find = createFind(sighting.name, sighting.map, sighting.position);
  find.foundAt = sighting.seenAt;
  find.accuracy = 'Approximate · matched from nearby in-game map view';
  find.sightingId = sighting.id;
  find.nameSource = sighting.nameSource || 'OCR';
  find.autoGenerated = true;
  sighting.savedFindId = find.id;
  data.finds.push(find);
  if (selectedSightingId === sighting.id) {
    draftPosition = null;
    ui.blueprintName.value = '';
  }
  return true;
}

function applyIconMatch(sighting, match) {
  if (!match || sighting.dismissed || sighting.name !== unidentifiedBlueprint) return;
  if (selectedSightingId === sighting.id && ui.blueprintName.value.trim()) return;
  sighting.name = match.name;
  sighting.nameSource = 'catalog icon';
  sighting.iconConfidence = match.score;
  sighting.iconMargin = match.margin;
  if (selectedSightingId === sighting.id && !ui.blueprintName.value.trim()) ui.blueprintName.value = match.name;
  const saved = saveLocatedSighting(sighting);
  persist(); render();
  setStatus(saved ? `${match.name} recognized and pinned on ${sighting.map}.` : sighting.position
    ? `${match.name} suggested. Its location is shown as a blue pin for review.`
    : `${match.name} suggested. Open your in-game map to log the location.`, Boolean(mediaStream));
}

async function recognizeSightingIcon(sighting, frame, tile) {
  try {
    const match = await identifyBlueprintIcon(frame, tile.slot);
    if (match) applyIconMatch(sighting, match);
    else {
      sighting.iconCandidates = await rankBlueprintIcons(frame, tile.slot);
      persist(); render();
    }
  } catch (error) { console.warn('Blueprint icon match unavailable:', error); }
}

async function reviewStoredSightingIcon(sighting) {
  if (sighting.name !== unidentifiedBlueprint || !sighting.tilePreview || sighting.iconCandidates?.length) return;
  try {
    const image = new Image(); image.src = sighting.tilePreview; await image.decode();
    const match = await identifyBlueprintPreview(image);
    if (match) applyIconMatch(sighting, match);
    else {
      sighting.iconCandidates = await rankBlueprintPreview(image);
      persist(); render();
    }
  } catch (error) { console.warn('Could not inspect saved blueprint icon:', error); }
}

function blueprintTilePreview(frame, tile) {
  if (!tile || !Number.isInteger(tile.slot) || tile.slot < 1 || tile.slot > 8) return null;
  const column = (tile.slot - 1) % 4;
  const row = Math.floor((tile.slot - 1) / 4);
  const left = [169, 280, 390, 502][column] * frame.width / 2048;
  const top = [315, 427][row] * frame.height / 1152;
  const width = 105 * frame.width / 2048;
  const height = 108 * frame.height / 1152;
  const preview = document.createElement('canvas'); preview.width = 180; preview.height = 185;
  preview.getContext('2d').drawImage(frame, left, top, width, height, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/jpeg', 0.82);
}

function desktopAlert(title, body, blueprintImage) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: blueprintImage || undefined, tag: 'arc-blueprint-map', silent: false }); }
  catch { /* Sightings remain available in the tracker. */ }
}

function recordSighting(name, frame, tile = null) {
  const now = Date.now();
  const windowMs = name === unidentifiedBlueprint ? 90 * 1000 : 5 * 60 * 1000;
  const recent = data.sightings.find(sighting => !sighting.dismissed && sighting.name.toLowerCase() === name.toLowerCase() && now - Date.parse(sighting.seenAt) < windowMs);
  if (recent) return false;
  const snapshot = document.createElement('canvas');
  const scale = Math.min(1, 960 / frame.width);
  snapshot.width = Math.round(frame.width * scale); snapshot.height = Math.round(frame.height * scale);
  snapshot.getContext('2d').drawImage(frame, 0, 0, snapshot.width, snapshot.height);
  const unnamed = name !== unidentifiedBlueprint && data.sightings.find(sighting =>
    !sighting.dismissed && (sighting.name === unidentifiedBlueprint || sighting.nameSource === 'catalog icon') &&
    !sighting.savedFindId && now - Date.parse(sighting.seenAt) < 60 * 1000);
  if (unnamed) {
    unnamed.name = name;
    unnamed.nameSource = 'OCR';
    unnamed.frame = snapshot.toDataURL('image/jpeg', 0.55);
    selectedSightingId = unnamed.id;
    saveLocatedSighting(unnamed);
    persist(); render();
    return true;
  }
  const sighting = { id: crypto.randomUUID(), name, seenAt: new Date(now).toISOString(), frame: snapshot.toDataURL('image/jpeg', 0.55),
    tilePreview: blueprintTilePreview(frame, tile), nameSource: name === unidentifiedBlueprint ? null : 'OCR', savedFindId: null };
  data.sightings.unshift(sighting);
  data.sightings.length = Math.min(data.sightings.length, 12);
  selectedSightingId = sighting.id;
  ui.blueprintName.value = name === unidentifiedBlueprint ? '' : name;
  persist(); renderSightings();
  desktopAlert(`Blueprint spotted: ${name}`, 'Open your in-game map now to capture your location.', sighting.tilePreview);
  return true;
}

function setDraft(position) {
  if (!currentMap) { setStatus('Choose a map first'); return; }
  draftPosition = position;
  render();
}

async function imageToDataUrl(file) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return { image: canvas.toDataURL('image/jpeg', 0.78), ratio: canvas.width / canvas.height };
}

async function baseImage(url) {
  if (cachedBase && cachedBaseUrl === url) return cachedBase;
  const image = new Image(); image.src = url; await image.decode();
  cachedBase = image; cachedBaseUrl = url;
  return image;
}

function takeFrame(show = true) {
  if (!video || video.readyState < 2) { setStatus('Start capture and choose the game window'); return false; }
  const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
  const target = show ? ui.frame : document.createElement('canvas');
  target.width = Math.round(video.videoWidth * scale);
  target.height = Math.round(video.videoHeight * scale);
  target.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, target.width, target.height);
  if (show) ui.framePanel.hidden = false;
  return target;
}

async function ensureWorker() {
  if (worker) return worker;
  if (!window.Tesseract) throw new Error('OCR script is unavailable. Check the bundled vendor files.');
  setStatus('Loading OCR model…', true);
  worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: '/vendor/worker.min.js',
    corePath: '/vendor/tesseract-core-simd-lstm.wasm.js',
    langPath: '/vendor',
    logger: progress => {
      if (progress.status && progress.progress < 1) setStatus(`${progress.status} ${Math.round(progress.progress * 100)}%`, true);
    },
  });
  return worker;
}

async function findMapPosition(frame) {
  if (!isArcMapView(frame)) return { error: 'Open the in-game map to capture a position.' };
  const arrow = detectPlayerArrow(frame);
  if (!arrow) return { error: 'The player arrow is not clear on this map view. Keep the map open or save a screenshot.' };
  const mapData = data.maps[currentMap];
  if (mapData?.image && !presetForMap(mapData)) {
    const base = await baseImage(mapData.image);
    const match = matchMapFrames(base, frame);
    if (!match) return { error: 'Could not align the custom map screenshot. Check zoom, crop, and layer.' };
    const position = { x: arrow.x - match.dx / match.width, y: arrow.y - match.dy / match.height };
    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) return { error: 'The player position falls outside the custom map.' };
    return { position, anchors: match.anchors, mapName: currentMap };
  }

  const ocr = await ensureWorker();
  const titleResult = await ocr.recognize(cropMapTitle(frame));
  const family = mapFamilyFromTitle(titleResult.data.text);
  if (!family) return { error: 'The map name is not readable yet. Keep the in-game map open or use a saved map screenshot.' };
  const candidates = [];
  for (const preset of mapPresets.filter(entry => entry.family === family)) {
    const base = await baseImage(preset.image);
    const match = matchFullMap(base, frame, { scales: preset.scales, minScore: -1 });
    if (!match) continue;
    const position = pointOnFullMap(match, arrow);
    if (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) continue;
    candidates.push({ preset, match, position, appearance: mapPatchAppearance(base, frame, match) });
  }
  const selected = selectMapCandidate(candidates);
  if (selected.error) return selected;
  return { position: selected.position, confidence: selected.match.score,
    mapName: selected.preset.name, presetId: selected.preset.id, appearance: selected.appearance.mae };
}

function activateMatchedMap(suggestion) {
  return !suggestion.presetId || choosePreset(suggestion.presetId);
}

function applyMapSuggestion(suggestion, frame) {
  ui.frame.width = frame.width; ui.frame.height = frame.height;
  ui.frame.getContext('2d').drawImage(frame, 0, 0);
  ui.framePanel.hidden = false;
  setDraft(suggestion.position);
  const detail = suggestion.confidence ? `${Math.round(suggestion.confidence * 100)}% image match` : `${suggestion.anchors} matching map landmarks`;
  ui.pinHelp.textContent = `Suggested from ${detail}. Review the pin before saving.`;
  setStatus(`Located with ${detail}. Review pin before saving.`, Boolean(mediaStream));
}

async function scanVisualFrame() {
  if (!mediaStream || visualScanning) return;
  visualScanning = true;
  try {
    const frame = takeFrame(false);
    if (!frame) return;
    const image = frame.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, frame.width, frame.height);
    const tiles = detectBlueprintTiles(image, 'CONTAINER LOADOUT');
    const firstNewTile = tiles.find(tile => !visibleBlueprintSlots.has(tile.slot));
    visibleBlueprintSlots = new Set(tiles.map(tile => tile.slot));
    if (firstNewTile && recordSighting(unidentifiedBlueprint, frame, firstNewTile)) {
      recognizeSightingIcon(data.sightings[0], frame, firstNewTile);
      ui.pinHelp.textContent = 'Blueprint tile seen. Hover for its name and open the in-game map soon to locate it.';
      setStatus(`Blueprint-like tile in container slot ${firstNewTile.slot}`, true);
    }
    const mapVisible = isArcMapView(frame);
    if (!mapVisible || !mapWasOpen) mapSessionMatched = false;
    mapWasOpen = mapVisible;
    const pending = data.sightings.filter(sighting => !sighting.dismissed && !sighting.savedFindId && !sighting.position &&
      Date.now() - Date.parse(sighting.seenAt) < 60 * 1000);
    if (!pending.length) return;
    if (!mapVisible || mapSessionMatched) return;
    setStatus('In-game map detected. Reading its name and matching your position…', true);
    const suggestion = await findMapPosition(frame);
    if (!suggestion.position) {
      setStatus(suggestion.error || 'Map position did not match. Keep the map open or use Locate on map.', true);
      return;
    }
    if (!activateMatchedMap(suggestion)) return;
    const latestSeenAt = Math.max(...pending.map(sighting => Date.parse(sighting.seenAt)));
    const sameContainer = pending.filter(sighting => latestSeenAt - Date.parse(sighting.seenAt) <= 10 * 1000);
    for (const sighting of sameContainer) {
      sighting.position = { ...suggestion.position };
      sighting.map = suggestion.mapName;
      sighting.locatedAt = new Date().toISOString();
      sighting.confidence = suggestion.confidence || null;
      saveLocatedSighting(sighting);
    }
    mapSessionMatched = true;
    persist(); render();
    const selected = sameContainer.find(sighting => sighting.id === selectedSightingId) || sameContainer[0];
    if (selectedSightingId === selected.id && !selected.savedFindId) applyMapSuggestion(suggestion, frame);
    desktopAlert(`Location captured: ${selected.name}`, `${suggestion.mapName} map position is ready to review.`, selected.tilePreview);
    if (sameContainer.length > 1) setStatus(`Map location captured for ${sameContainer.length} blueprints. Review their pins.`, true);
  } catch (error) {
    setStatus(`Visual scan error: ${error.message}`);
    console.error(error);
  } finally { visualScanning = false; }
}

async function scanOnce() {
  if (!mediaStream || scanning) return;
  scanning = true;
  try {
    const frame = takeFrame(false);
    if (!frame) return;
    const ocr = await ensureWorker();
    const result = await ocr.recognize(frame);
    const text = result.data.text || '';
    ui.ocrText.textContent = text.trim() || '(No readable text)';
    ui.lastScan.textContent = `Last scanned ${new Date().toLocaleTimeString()}`;
    const candidate = blueprintFromText(text);
    let message = 'Watching game window';
    if (candidate && (candidate !== lastCandidate || Date.now() - lastCandidateAt > 30000)) {
      lastCandidate = candidate; lastCandidateAt = Date.now();
      recordSighting(candidate, frame);
      if (!ui.blueprintName.value.trim()) {
        ui.blueprintName.value = candidate;
        message = `Possible blueprint: ${candidate}`;
        ui.pinHelp.textContent = 'Review the name, then open your in-game map for automatic location matching.';
        render();
      } else message = `Possible blueprint seen: ${candidate}`;
    }
    setStatus(message, true);
  } catch (error) {
    setStatus(`OCR error: ${error.message}`);
    console.error(error);
  } finally {
    scanning = false;
    if (mediaStream) scanTimer = setTimeout(scanOnce, 1000);
  }
}

async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus('Screen sharing is unavailable in this browser. Open http://127.0.0.1:4177/ in Chrome or Edge.');
    return;
  }
  let newStream = null;
  try {
    setStatus('Choose Entire Screen if ARC Raiders is missing from the Window list.');
    newStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'monitor', frameRate: 15 },
      monitorTypeSurfaces: 'include', selfBrowserSurface: 'exclude', audio: false,
    });
    video = ui.previewVideo;
    video.srcObject = newStream;
    await video.play();
    mediaStream = newStream;
    const track = mediaStream.getVideoTracks()[0];
    const surface = track.getSettings().displaySurface;
    ui.previewDetails.textContent = `${surface === 'monitor' ? 'Entire Screen' : surface === 'window' ? 'Window' : surface === 'browser' ? 'Browser tab' : 'Shared display'} · ${video.videoWidth} × ${video.videoHeight}`;
    ui.previewHint.textContent = surface === 'monitor'
      ? 'The preview shows whatever is on the selected screen. Switch back to ARC Raiders and keep it visible; the app will continue scanning in the background.'
      : surface === 'browser'
        ? 'This is a browser tab. Stop sharing and choose Entire Screen or the ARC Raiders window instead.'
        : 'You should see ARC Raiders here. If the preview is black, try borderless windowed mode or share Entire Screen while the game is visible.';
    ui.previewPanel.hidden = false;
    track.addEventListener('ended', () => stopCapture('Sharing ended. Select Start capture to choose a screen again.'), { once: true });
    ui.start.disabled = true; ui.stop.disabled = false;
    setStatus(surface === 'browser' ? 'A browser tab is shared. Choose the game window or Entire Screen.' : 'Capture is live; watching for blueprints.', true);
    visualTimer = setInterval(scanVisualFrame, 1000);
    scanVisualFrame();
    scanOnce();
  } catch (error) {
    newStream?.getTracks().forEach(track => track.stop());
    if (video) { video.srcObject = null; video = null; }
    setStatus(error.name === 'NotAllowedError' ? 'Capture cancelled. Try Entire Screen if the game is missing from the picker.' : `Capture failed: ${error.message}`);
  }
}

function stopCapture(message = 'Capture stopped') {
  clearTimeout(scanTimer);
  clearInterval(visualTimer);
  const oldStream = mediaStream; mediaStream = null;
  mapWasOpen = false; mapSessionMatched = false;
  oldStream?.getTracks().forEach(track => track.stop());
  if (video) { video.srcObject = null; video = null; }
  ui.previewPanel.hidden = true;
  ui.start.disabled = false; ui.stop.disabled = true;
  setStatus(message);
}

function chooseNamedMap() {
  const preset = mapPresets.find(entry => entry.name.toLowerCase() === ui.mapName.value.trim().toLowerCase());
  if (preset) choosePreset(preset.id);
  else useMap();
}
ui.useMap.addEventListener('click', chooseNamedMap);
ui.usePresetMap.addEventListener('click', () => choosePreset(ui.presetMap.value));
ui.fullStella.addEventListener('click', () => choosePreset('stella-upper'));
ui.screenshotFinds.addEventListener('click', () => {
  if (!choosePreset('stella-upper')) {
    setStatus('This map name already has a different image. The screenshot pins were not added.'); return;
  }
  let added = 0;
  for (const find of suppliedFinds) {
    if (!data.finds.some(existing => existing.id === find.id)) {
      data.finds.push({ ...find, map: currentMap }); added++;
    }
    if (find.sightingAt) {
      const sighting = data.sightings.find(entry => !entry.dismissed && !entry.savedFindId &&
        Math.abs(Date.parse(entry.seenAt) - Date.parse(find.sightingAt)) < 20 * 1000);
      if (sighting) {
        sighting.name = find.name;
        sighting.savedFindId = find.id;
        sighting.position = { x: find.x, y: find.y };
        sighting.map = currentMap;
      }
    }
  }
  persist(); render();
  setStatus(added ? `Added ${added} approximate screenshot finds. Review their positions.` : 'The supplied screenshot finds are already on this map.');
});
ui.mapName.addEventListener('keydown', event => { if (event.key === 'Enter') chooseNamedMap(); });
ui.map.addEventListener('click', event => setDraft(positionFromEvent(event, ui.map)));
ui.blueprintName.addEventListener('input', render);
ui.mapImage.addEventListener('change', async () => {
  if (!ui.mapImage.files?.[0]) return;
  if (!currentMap) useMap();
  if (!currentMap) return;
  if (data.finds.some(find => find.map === currentMap)) { setStatus('Remove this map’s pins before changing its background'); ui.mapImage.value = ''; return; }
  try { data.maps[currentMap] = await imageToDataUrl(ui.mapImage.files[0]); persist(); render(); setStatus('Map image saved locally'); }
  catch (error) { setStatus(`Could not read image: ${error.message}`); }
  ui.mapImage.value = '';
});
ui.start.addEventListener('click', startCapture);
ui.stop.addEventListener('click', () => stopCapture());
function updateAlertPermission() {
  ui.enableAlerts.textContent = !('Notification' in window) ? 'Windows notifications unavailable in this browser'
    : Notification.permission === 'granted' ? 'Windows notifications enabled'
      : Notification.permission === 'denied' ? 'Windows notifications blocked in browser settings' : 'Enable Windows notifications';
  ui.enableAlerts.disabled = !('Notification' in window) || Notification.permission !== 'default';
}
ui.enableAlerts.addEventListener('click', async () => {
  try { await Notification.requestPermission(); }
  catch { setStatus('Could not enable Windows notifications. Sightings and pins still appear in the tracker.'); }
  updateAlertPermission();
});
ui.capturePosition.addEventListener('click', () => {
  if (takeFrame()) { ui.framePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); setStatus('Captured frame shown as a visual reference', Boolean(mediaStream)); }
});
ui.autoLocate.addEventListener('click', async () => {
  draftPosition = null; render();
  const frame = takeFrame();
  if (!frame) return;
  setStatus('Matching map landmarks…', Boolean(mediaStream));
  try {
    const suggestion = await findMapPosition(frame);
    if (!suggestion.position) {
      ui.pinHelp.textContent = suggestion.error;
      setStatus(suggestion.error); return;
    }
    if (!activateMatchedMap(suggestion)) return;
    applyMapSuggestion(suggestion, frame);
  } catch (error) { setStatus(`Map match failed: ${error.message}`); }
});
ui.mapScreenshot.addEventListener('change', async () => {
  const file = ui.mapScreenshot.files?.[0];
  if (!file) return;
  try {
    const selected = data.sightings.find(sighting => sighting.id === selectedSightingId && !sighting.dismissed && !sighting.savedFindId);
    if (!selected) { setStatus('Select an unpinned blueprint sighting first.'); return; }
    const image = await createImageBitmap(file);
    const frame = document.createElement('canvas');
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    frame.width = Math.round(image.width * scale); frame.height = Math.round(image.height * scale);
    frame.getContext('2d').drawImage(image, 0, 0, frame.width, frame.height);
    image.close();
    if (!isArcMapView(frame)) { setStatus('That screenshot does not show the in-game map. Press M and save a map screenshot.'); return; }
    setStatus('Map screenshot detected. Matching your player position…', Boolean(mediaStream));
    const suggestion = await findMapPosition(frame);
    if (!suggestion.position) { setStatus(suggestion.error || 'Could not match this screenshot.'); return; }
    if (!activateMatchedMap(suggestion)) return;
    const sameContainer = data.sightings.filter(sighting => !sighting.dismissed && !sighting.savedFindId &&
      Math.abs(Date.parse(sighting.seenAt) - Date.parse(selected.seenAt)) <= 10 * 1000);
    for (const sighting of sameContainer) {
      sighting.position = { ...suggestion.position };
      sighting.map = suggestion.mapName;
      sighting.locatedAt = new Date().toISOString();
      sighting.confidence = suggestion.confidence || null;
    }
    persist(); renderSightings();
    ui.blueprintName.value = selected.name === unidentifiedBlueprint ? '' : selected.name;
    applyMapSuggestion(suggestion, frame);
    setStatus(`Corrected map position for ${sameContainer.length} sighting${sameContainer.length === 1 ? '' : 's'}. Review before saving.`, Boolean(mediaStream));
  } catch (error) { setStatus(`Could not read map screenshot: ${error.message}`); }
  finally { ui.mapScreenshot.value = ''; }
});
ui.useFrameMap.addEventListener('click', () => {
  if (!currentMap) { setStatus('Choose a map first'); return; }
  if (data.finds.some(find => find.map === currentMap)) { setStatus('Remove this map’s pins before changing its background'); return; }
  data.maps[currentMap] = { image: ui.frame.toDataURL('image/jpeg', 0.78), ratio: ui.frame.width / ui.frame.height };
  persist(); render(); setStatus('Captured frame saved as map image', Boolean(mediaStream));
});
ui.save.addEventListener('click', () => {
  if (!currentMap || !draftPosition || !ui.blueprintName.value.trim()) return;
  if (data.sightings.some(entry => entry.id === selectedSightingId && entry.savedFindId)) {
    draftPosition = null; render(); setStatus('This sighting is already pinned.'); return;
  }
  const find = createFind(ui.blueprintName.value, currentMap, draftPosition);
  const sighting = data.sightings.find(entry => entry.id === selectedSightingId && !entry.dismissed && !entry.savedFindId)
    || data.sightings.find(entry => !entry.dismissed && !entry.savedFindId && entry.name.toLowerCase() === find.name.toLowerCase());
  if (sighting) {
    find.foundAt = sighting.seenAt;
    sighting.name = find.name;
    sighting.savedFindId = find.id;
    find.sightingId = sighting.id;
    sighting.position = { ...draftPosition };
    sighting.map = currentMap;
    if (sighting.locatedAt) find.accuracy = 'Approximate · matched from nearby in-game map view';
  }
  data.finds.push(find);
  ui.blueprintName.value = ''; draftPosition = null;
  ui.framePanel.hidden = true;
  ui.pinHelp.textContent = 'Match a map frame automatically, or click the location on your fixed map image.';
  persist(); render(); setStatus('Blueprint location saved', Boolean(mediaStream));
});
ui.export.addEventListener('click', () => {
  const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(file);
  link.download = `arc-blueprint-map-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
ui.import.addEventListener('change', async () => {
  try {
    const imported = JSON.parse(await ui.import.files[0].text());
    if (!Array.isArray(imported.finds) || typeof imported.maps !== 'object') throw new Error('Invalid backup');
    const existing = new Set(data.finds.map(find => find.id));
    data.finds.push(...imported.finds.filter(find => find?.id && find.name && find.map && Number.isFinite(find.x) && Number.isFinite(find.y) && !existing.has(find.id)));
    if (Array.isArray(imported.sightings)) {
      const known = new Set(data.sightings.map(sighting => sighting.id));
      data.sightings.push(...imported.sightings.filter(sighting => sighting?.id && sighting.name && sighting.seenAt && typeof sighting.frame === 'string' && !known.has(sighting.id)));
      data.sightings.sort((first, second) => Date.parse(second.seenAt) - Date.parse(first.seenAt));
      data.sightings.length = Math.min(data.sightings.length, 12);
    }
    for (const [name, map] of Object.entries(imported.maps)) {
      if (!data.maps[name]) data.maps[name] = {
        image: typeof map?.image === 'string' ? map.image : null,
        ratio: Number.isFinite(map?.ratio) ? map.ratio : undefined,
        mode: presetForMode(map?.mode)?.name === name && presetForMode(map?.mode)?.image === map?.image ? map.mode : undefined,
      };
    }
    persist(); render(); setStatus('Backup imported');
  } catch (error) { setStatus(`Import failed: ${error.message}`); }
  ui.import.value = '';
});

for (const preset of mapPresets) {
  const option = document.createElement('option');
  option.value = preset.id; option.textContent = preset.name;
  ui.presetMap.append(option);
}
ui.mapName.value = currentMap;
ui.presetMap.value = presetForMap(data.maps[currentMap])?.id || 'stella-upper';
updateAlertPermission();
render();

// Resolve the newest stored sighting after a reload as well as new live tiles.
// This lets an interrupted capture finish naming a previously located item.
async function recheckLatestSighting() {
  const sighting = data.sightings.find(entry => !entry.dismissed && !entry.savedFindId && entry.name === unidentifiedBlueprint && entry.position);
  if (!sighting) return;
  try {
    if (sighting.tilePreview) {
      const preview = new Image(); preview.src = sighting.tilePreview; await preview.decode();
      const match = await identifyBlueprintPreview(preview);
      if (match) applyIconMatch(sighting, match);
      else {
        sighting.iconCandidates = await rankBlueprintPreview(preview);
        persist(); render();
      }
      return;
    }
    if (!sighting.frame) return;
    const image = new Image(); image.src = sighting.frame; await image.decode();
    const frame = document.createElement('canvas'); frame.width = 1600; frame.height = 900;
    frame.getContext('2d').drawImage(image, 0, 0, frame.width, frame.height);
    const pixels = frame.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, frame.width, frame.height);
    const tile = detectBlueprintTiles(pixels, 'CONTAINER LOADOUT')[0];
    if (tile) await recognizeSightingIcon(sighting, frame, tile);
  } catch (error) { console.warn('Could not recheck saved sighting:', error); }
}
recheckLatestSighting();
