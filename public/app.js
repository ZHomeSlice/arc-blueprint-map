import { blueprintFromText, clamp01, createFind, deduplicateBlueprintEntries, isOwnCommunityDuplicate,
  removeRecentDuplicateDiscoveries } from './logic.js';
import { isArcMapView } from './map-match.js';
import { cropMapTitle, mapFamilyFromTitle } from './map-detect.js';
import { cropBlueprintName } from './ocr-crop.js';
import { mapPresets, presetForMap, presetForMode, presetMapData } from './map-presets.js';
import { detectBlueprintTiles } from './blueprint-visual.js';
import { LootWindow } from './loot-window.js';
import { COMMUNITY_STORAGE_KEY, buildSharePayload, importCommunityCsv, prefilledFormUrl, reliabilityForFind } from './community-share.js';
import { loadBlueprintCatalog, rankBlueprintIcons, rankBlueprintPreview, confidentMatch, matchCapturedMap, stopImageAnalysis } from './analysis-client.js';
import { tileSignature, tileSimilarity } from './tile-feedback.js';
import { rarityForBlueprint } from './blueprint-rarity.js';
import { layoutSpiderGroups } from './spider-layout.js';
import { CaptureRegions } from './capture-regions.js';

const $ = id => document.getElementById(id);
const storageKey = 'arc-blueprint-map-v1';
const ui = {
  mapName: $('map-name'), useMap: $('use-map'), presetMap: $('preset-map'), usePresetMap: $('use-preset-map'),
  fullStella: $('use-stella-upper'), mapCredit: $('map-credit'), mapCreditLink: $('map-credit-link'), mapImage: $('map-image'), map: $('map'), mapContent: $('map-content'), pins: $('pins'), spiderLines: $('pin-spider-lines'),
  title: $('current-map-title'), coordinates: $('pin-coordinates'), draftPin: $('draft-pin'),
  pinPopup: $('pin-popup'), pinPopupClose: $('pin-popup-close'), pinPopupTitle: $('pin-popup-title'),
  pinPopupStatus: $('pin-popup-status'), pinPopupImage: $('pin-popup-image'), pinPopupDetails: $('pin-popup-details'),
  pinPopupChoices: $('pin-popup-choices'),
  pinPopupEdit: $('pin-popup-edit'), pinPopupForm: $('pin-popup-form'), pinEditName: $('pin-edit-name'),
  pinEditBlueprintSearch: $('pin-edit-blueprint-search'), pinEditBlueprintList: $('pin-edit-blueprint-list'),
  pinEditBlueprintPreview: $('pin-edit-blueprint-preview'), pinEditBlueprintHint: $('pin-edit-blueprint-hint'),
  pinEditMap: $('pin-edit-map'), pinEditX: $('pin-edit-x'), pinEditY: $('pin-edit-y'), pinEditCancel: $('pin-edit-cancel'),
  mapFiltersToggle: $('map-filters-toggle'), mapFilters: $('map-filters'),
  mapFilterRarities: [...document.querySelectorAll('[data-map-filter-rarity]')], mapBlueprintFilter: $('map-blueprint-filter'),
  mapFilterApply: $('map-filter-apply'),
  blueprintName: $('blueprint-name'), save: $('save-find'), list: $('find-list'), count: $('find-count'),
  start: $('start-capture'), stop: $('stop-capture'), capturePosition: $('capture-position'), autoLocate: $('auto-locate'), mapScreenshot: $('saved-map-screenshot'),
  showPreview: $('show-preview'), pauseScanning: $('pause-scanning'), previewPanel: $('preview-panel'), previewVideo: $('live-preview'), previewDetails: $('preview-details'), previewHint: $('preview-hint'),
  framePanel: $('frame-panel'), frame: $('frame-canvas'), useFrameMap: $('use-frame-map'), status: $('status'), dot: $('status-dot'),
  ocrText: $('ocr-text'), note: $('capture-note'), pinHelp: $('pin-help'), export: $('export-data'), import: $('import-data'), screenshotFinds: $('add-screenshot-finds'),
  lastScan: $('last-scan'), sightingCount: $('sighting-count'), sightingList: $('sighting-list'),
  reviewedSightings: $('reviewed-sightings'), reviewedCount: $('reviewed-count'), reviewedList: $('reviewed-list'), sightingPreview: $('sighting-preview'),
  forgetDismissed: $('forget-dismissed'),
  selectedBlueprintTile: $('selected-blueprint-tile'), iconCandidates: $('icon-candidates'), iconCandidateList: $('icon-candidate-list'),
  enableAlerts: $('enable-alerts'),
  gameName: $('game-name'), readGameName: $('read-game-name'), shareBlueprints: $('share-blueprints'), shareJson: $('share-json'),
  communityImport: $('community-import'), showPersonal: $('show-personal'), showCommunity: $('show-community'),
  communityPlayer: $('community-player'), communityScore: $('community-score'), communityScoreValue: $('community-score-value'),
  communityAfter: $('community-after'), communitySort: $('community-sort'), communityCount: $('community-count'), communityList: $('community-list'),
};

let data = loadData();
let currentMap = data.currentMap || '';
let draftPosition = null;
let mediaStream = null;
let video = null;
let worker = null;
let workerPromise = null;
let captureGeneration = 0;
let analysisGeneration = 0;
let lastMapAttempt = 0;
let captureRegions = null;
let lastOcrAt = 0;
let scanning = false;
let visualTimer = null;
let visualScanning = false;
const lootWindow = new LootWindow();
let community = loadCommunity();
let mapWasOpen = false;
let mapSessionMatched = false;
let lastCandidate = '';
let lastCandidateSightingId = '';
let selectedSightingId = null;
let selectedMapPin = null;
let editingMapPin = false;
let pinEditCandidates = [];
let pinEditRequestId = 0;
let mapZoom = { scale: 1, x: 0, y: 0 };
let hoveredPinKey = '';
let pendingPinKey = '';
let pinEnterTimer = null;
let pinExitTimer = null;
let expandedPins = null;
let spiderExitTimer = null;
let groupChooserOpen = false;
let choosingGroupMember = false;
const signatureCache = new Map();
const iconAnalysisPending = new Set();
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
      saved.dismissedTiles = Array.isArray(saved.dismissedTiles) ? saved.dismissedTiles : [];
      for (const sighting of saved.sightings) {
        if (sighting.dismissed && sighting.suppressRepeat !== false && sighting.tilePreview &&
            !saved.dismissedTiles.some(entry => entry.id === sighting.id)) {
          saved.dismissedTiles.push({ id: sighting.id, tilePreview: sighting.tilePreview });
        }
      }
      saved.dismissedTiles = saved.dismissedTiles.slice(-32);
      if (removeRecentDuplicateDiscoveries(saved)) {
        try { localStorage.setItem(storageKey, JSON.stringify(saved)); }
        catch { /* The in-memory data is still cleaned up for this session. */ }
      }
      return saved;
    }
  } catch { /* Ignore damaged local data. */ }
  return { version: 1, currentMap: '', maps: {}, finds: [], sightings: [], dismissedTiles: [] };
}

function persist() {
  removeRecentDuplicateDiscoveries(data);
  const activeSignatures = new Set([...data.sightings, ...data.dismissedTiles].map(sighting => sighting.id));
  for (const id of signatureCache.keys()) if (!activeSignatures.has(id)) signatureCache.delete(id);
  try { localStorage.setItem(storageKey, JSON.stringify(data)); }
  catch { setStatus('Browser storage is full. Export your finds now.'); }
}

function loadCommunity() {
  try {
    const stored = JSON.parse(localStorage.getItem(COMMUNITY_STORAGE_KEY));
    if (Array.isArray(stored?.players)) {
      let removed = 0;
      for (const player of stored.players) {
        if (!Array.isArray(player.finds)) continue;
        const previousCount = player.finds.length;
        player.finds = deduplicateBlueprintEntries(player.finds);
        removed += previousCount - player.finds.length;
      }
      if (removed) {
        try { localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(stored)); }
        catch { /* Use the cleaned community data in memory if storage is full. */ }
      }
      return stored;
    }
  } catch { /* Import can replace damaged community data. */ }
  return { players: [], importedAt: null };
}

function shareApproved(find) {
  if (typeof find.shareApproved === 'boolean') return find.shareApproved;
  return Boolean(rarityForBlueprint(find.name)) &&
    (!find.autoGenerated || find.nameSource === 'user edited' || find.nameSource === 'user confirmed icon' || find.nameSource === 'catalog icon');
}

function setStatus(message, active = false) {
  ui.status.textContent = message;
  ui.dot.classList.toggle('active', active);
}

function markPinForHover(pin, key, position) {
  pin.dataset.hoverKey = key;
  pin.dataset.originX = String(position.x);
  pin.dataset.originY = String(position.y);
  if (hoveredPinKey === key) pin.classList.add('hover-stable');
}

function clearPinHover() {
  clearTimeout(pinEnterTimer);
  clearTimeout(pinExitTimer);
  pendingPinKey = '';
  hoveredPinKey = '';
  for (const pin of ui.pins.children) pin.classList.remove('hover-stable');
}

function pinFromPointerTarget(target) {
  const pin = target instanceof Element ? target.closest('.pin') : null;
  return pin && ui.pins.contains(pin) ? pin : null;
}

function mapPoint(position) {
  return { x: mapZoom.x + position.x * ui.map.clientWidth * mapZoom.scale,
    y: mapZoom.y + position.y * ui.map.clientHeight * mapZoom.scale };
}

function clearSpiderPins() {
  clearTimeout(spiderExitTimer);
  if (!expandedPins) return;
  for (const pin of ui.pins.children) {
    pin.style.left = `${Number(pin.dataset.originX) * 100}%`;
    pin.style.top = `${Number(pin.dataset.originY) * 100}%`;
    pin.classList.remove('spider-pin', 'spider-left', 'spider-hidden');
    pin.querySelector('.pin-count')?.remove();
    if (pin.dataset.baseTitle) { pin.title = pin.dataset.baseTitle; delete pin.dataset.baseTitle; }
    pin.setAttribute('aria-label', pin.title);
  }
  ui.spiderLines.replaceChildren();
  expandedPins = null;
}

function layoutSpiderPins() {
  if (!expandedPins) return;
  const pins = expandedPins.keys.map(key => [...ui.pins.children].find(pin => pin.dataset.hoverKey === key)).filter(Boolean);
  if (pins.length < 2) { clearSpiderPins(); return; }
  for (const pin of ui.pins.children) {
    pin.style.left = `${Number(pin.dataset.originX) * 100}%`;
    pin.style.top = `${Number(pin.dataset.originY) * 100}%`;
    pin.classList.remove('spider-pin', 'spider-left', 'spider-hidden');
    pin.querySelector('.pin-count')?.remove();
    if (pin.dataset.baseTitle) { pin.title = pin.dataset.baseTitle; delete pin.dataset.baseTitle; }
    pin.setAttribute('aria-label', pin.title);
  }
  const width = ui.map.clientWidth;
  const height = ui.map.clientHeight;
  const origins = pins.map(pin => mapPoint({ x: Number(pin.dataset.originX), y: Number(pin.dataset.originY) }));
  const anchor = { x: origins.reduce((sum, item) => sum + item.x, 0) / pins.length,
    y: origins.reduce((sum, item) => sum + item.y, 0) / pins.length };
  const byName = new Map();
  for (const pin of pins) {
    const name = pin.querySelector('.pin-label')?.textContent.trim() || '';
    const normalized = name.toLocaleLowerCase().replace(/\s+/g, ' ');
    const id = normalized && normalized !== unidentifiedBlueprint.toLowerCase() ? normalized : pin.dataset.hoverKey;
    if (!byName.has(id)) byName.set(id, { id, name, members: [], origins: [], center: null, labelWidth: 0 });
    const group = byName.get(id);
    group.members.push(pin);
    group.origins.push(mapPoint({ x: Number(pin.dataset.originX), y: Number(pin.dataset.originY) }));
    group.labelWidth = Math.max(group.labelWidth, pin.querySelector('.pin-label')?.offsetWidth || 0);
  }
  const groups = [...byName.values()];
  for (const group of groups) group.center = {
    x: group.origins.reduce((sum, item) => sum + item.x, 0) / group.origins.length,
    y: group.origins.reduce((sum, item) => sum + item.y, 0) / group.origins.length,
  };
  const placements = layoutSpiderGroups(groups, { width, height }, anchor);
  const points = new Map();
  const lines = [];
  for (const [index, group] of groups.entries()) {
    const { x, y, side } = placements[index];
    const contentX = (x - mapZoom.x) / mapZoom.scale;
    const contentY = (y - mapZoom.y) / mapZoom.scale;
    const representative = group.members[0];
    group.representativeKey = representative.dataset.hoverKey;
    representative.style.left = `${contentX}px`;
    representative.style.top = `${contentY}px`;
    representative.classList.add('spider-pin');
    if (side === 'left') representative.classList.add('spider-left');
    if (group.members.length > 1) {
      representative.dataset.baseTitle = representative.title;
      representative.title = `${group.name} · ${group.members.length} sightings; click to choose`;
      const count = document.createElement('span');
      count.className = 'pin-count'; count.textContent = String(group.members.length);
      count.setAttribute('aria-label', `${group.members.length} sightings`);
      representative.append(count);
      representative.setAttribute('aria-label', `${group.name} · ${group.members.length} sightings; click to choose`);
      for (const duplicate of group.members.slice(1)) duplicate.classList.add('spider-hidden');
    }
    for (const pin of group.members) {
      const originX = Number(pin.dataset.originX), originY = Number(pin.dataset.originY);
      const origin = mapPoint({ x: originX, y: originY });
      points.set(pin.dataset.hoverKey, { origin, target: { x, y } });
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(origin.x));
      line.setAttribute('y1', String(origin.y));
      line.setAttribute('x2', String(x));
      line.setAttribute('y2', String(y));
      lines.push(line);
    }
  }
  ui.spiderLines.replaceChildren(...lines);
  expandedPins.points = points;
  expandedPins.anchor = anchor;
  expandedPins.groups = groups;
}

function pinPopupAnchor(key, position) {
  if (expandedPins?.points.has(key)) return expandedPins.points.get(key).target;
  return mapPoint(position);
}

function showGroupChooser(group) {
  groupChooserOpen = true;
  editingMapPin = false;
  selectedMapPin = { kind: 'group', id: group.id };
  ui.pinPopupStatus.textContent = 'Multiple discoveries';
  ui.pinPopupTitle.textContent = `${group.name} · ${group.members.length}`;
  ui.pinPopupImage.hidden = true;
  ui.pinPopupDetails.hidden = true;
  ui.pinPopupEdit.hidden = true;
  ui.pinPopupForm.hidden = true;
  ui.pinPopupChoices.hidden = false;
  ui.pinPopupChoices.replaceChildren();
  for (const pin of group.members) {
    const button = document.createElement('button');
    button.type = 'button';
    const date = new Date(pin.dataset.foundAt);
    const when = Number.isNaN(date.getTime()) ? 'Date unknown' : date.toLocaleString();
    const position = `${Math.round(Number(pin.dataset.originX) * 100)}% across, ${Math.round(Number(pin.dataset.originY) * 100)}% down`;
    button.textContent = `${pin.dataset.source} · ${when} · ${position}`;
    button.addEventListener('click', () => {
      groupChooserOpen = false;
      ui.pinPopupChoices.hidden = true;
      const current = [...ui.pins.children].find(entry => entry.dataset.hoverKey === pin.dataset.hoverKey);
      if (!current) { closePinPopup(); return; }
      choosingGroupMember = true;
      try { current.click(); } finally { choosingGroupMember = false; }
    });
    ui.pinPopupChoices.append(button);
  }
  ui.pinPopup.hidden = false;
  const bounds = ui.map.getBoundingClientRect();
  const point = expandedPins?.points.get(group.representativeKey)?.target || group.center;
  ui.pinPopup.style.left = `${Math.max(8, Math.min(point.x + 16, bounds.width - ui.pinPopup.offsetWidth - 8))}px`;
  ui.pinPopup.style.top = `${Math.max(8, Math.min(point.y + 16, bounds.height - ui.pinPopup.offsetHeight - 8))}px`;
  ui.pinPopup.focus({ preventScroll: true });
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - start.x - ratio * dx, point.y - start.y - ratio * dy);
}

function pointerInsideSpider(event) {
  if (!expandedPins) return false;
  const bounds = ui.map.getBoundingClientRect();
  const point = { x: event.clientX - bounds.left - ui.map.clientLeft, y: event.clientY - bounds.top - ui.map.clientTop };
  if (Math.hypot(point.x - expandedPins.anchor.x, point.y - expandedPins.anchor.y) < 55) return true;
  for (const [key, endpoints] of expandedPins.points) {
    if (distanceToSegment(point, endpoints.origin, endpoints.target) < 26) return true;
    const pin = [...ui.pins.children].find(entry => entry.dataset.hoverKey === key);
    for (const element of [pin, pin?.querySelector('.pin-label')]) {
      if (!element) continue;
      const box = element.getBoundingClientRect();
      if (event.clientX >= box.left - 12 && event.clientX <= box.right + 12 &&
          event.clientY >= box.top - 12 && event.clientY <= box.bottom + 12) return true;
    }
  }
  return false;
}

function scheduleSpiderClose() {
  if (!expandedPins || spiderExitTimer) return;
  spiderExitTimer = setTimeout(() => { spiderExitTimer = null; clearSpiderPins(); }, 750);
}

function onMapPointerMove(event) {
  if (event.pointerType !== 'mouse' || !ui.map.classList.contains('has-image')) return;
  if (expandedPins) {
    if (pointerInsideSpider(event)) { clearTimeout(spiderExitTimer); spiderExitTimer = null; }
    else scheduleSpiderClose();
    return;
  }
  const bounds = ui.map.getBoundingClientRect();
  const point = { x: event.clientX - bounds.left - ui.map.clientLeft, y: event.clientY - bounds.top - ui.map.clientTop };
  const pins = [...ui.pins.children];
  const candidates = pins.map(pin => ({ pin, point: mapPoint({ x: Number(pin.dataset.originX), y: Number(pin.dataset.originY) }) }));
  const labelHit = candidates.find(({ pin }) => {
    const label = pin.querySelector('.pin-label')?.getBoundingClientRect();
    return label && event.clientX >= label.left && event.clientX <= label.right &&
      event.clientY >= label.top && event.clientY <= label.bottom;
  });
  const nearest = labelHit || candidates.reduce((best, item) => !best ||
    Math.hypot(item.point.x - point.x, item.point.y - point.y) < Math.hypot(best.point.x - point.x, best.point.y - point.y)
    ? item : best, null);
  if (!nearest || (!labelHit && Math.hypot(nearest.point.x - point.x, nearest.point.y - point.y) > 34)) return;
  const group = pins.filter(pin => {
    const position = mapPoint({ x: Number(pin.dataset.originX), y: Number(pin.dataset.originY) });
    return Math.hypot(position.x - nearest.point.x, position.y - nearest.point.y) <= 52;
  });
  if (group.length < 2) return;
  expandedPins = { keys: group.map(pin => pin.dataset.hoverKey), points: new Map(), anchor: nearest.point };
  layoutSpiderPins();
}

function applyMapZoom() {
  const transform = `translate(${mapZoom.x}px, ${mapZoom.y}px) scale(${mapZoom.scale})`;
  ui.mapContent.style.transform = transform;
  ui.pins.style.transform = transform;
  ui.map.style.setProperty('--pin-scale', String(1 / mapZoom.scale));
  layoutSpiderPins();
}

function positionOnZoomedMap(event) {
  const bounds = ui.map.getBoundingClientRect();
  return {
    x: clamp01((event.clientX - bounds.left - ui.map.clientLeft - mapZoom.x) / (ui.map.clientWidth * mapZoom.scale)),
    y: clamp01((event.clientY - bounds.top - ui.map.clientTop - mapZoom.y) / (ui.map.clientHeight * mapZoom.scale)),
  };
}

function zoomMapAt(event) {
  if (ui.pinPopup.contains(event.target)) return;
  if (!ui.map.classList.contains('has-image')) return;
  event.preventDefault();
  const bounds = ui.map.getBoundingClientRect();
  const pointerX = event.clientX - bounds.left - ui.map.clientLeft;
  const pointerY = event.clientY - bounds.top - ui.map.clientTop;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? ui.map.clientHeight : 1;
  const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
  const scale = Math.max(1, Math.min(5, mapZoom.scale * Math.exp(-delta * 0.0015)));
  if (scale === mapZoom.scale) return;
  const ratio = scale / mapZoom.scale;
  mapZoom = {
    scale,
    x: Math.max(ui.map.clientWidth * (1 - scale), Math.min(0, pointerX - (pointerX - mapZoom.x) * ratio)),
    y: Math.max(ui.map.clientHeight * (1 - scale), Math.min(0, pointerY - (pointerY - mapZoom.y) * ratio)),
  };
  applyMapZoom();
  closePinPopup();
}

function useMap(name = ui.mapName.value) {
  const cleaned = String(name).trim().slice(0, 80);
  if (!cleaned) { ui.mapName.focus(); return; }
  closePinPopup();
  currentMap = cleaned;
  ui.mapName.value = cleaned;
  data.currentMap = cleaned;
  data.maps[cleaned] ||= { image: null };
  draftPosition = null;
  clearSpiderPins();
  clearPinHover();
  mapZoom = { scale: 1, x: 0, y: 0 };
  applyMapZoom();
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
  ui.mapContent.style.backgroundImage = image ? `url("${image}")` : '';
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
  const blueprintCounts = new Map();
  const countBlueprint = name => {
    const label = String(name || '').trim();
    if (!label) return;
    const key = label.toLocaleLowerCase();
    const current = blueprintCounts.get(key);
    blueprintCounts.set(key, { name: current?.name || label, count: (current?.count || 0) + 1 });
  };
  for (const find of finds) countBlueprint(find.name);
  for (const player of community.players) for (const find of player.finds) {
    if (find.map === currentMap && !isOwnCommunityDuplicate(player.name, ui.gameName.value, find, data.finds)) countBlueprint(find.name);
  }
  for (const sighting of data.sightings) {
    if (!sighting.dismissed && !sighting.savedFindId && sighting.position && sighting.map === currentMap) countBlueprint(sighting.name);
  }
  const selectedBlueprint = ui.mapBlueprintFilter.value;
  const blueprintOptions = [new Option(`All discovered blueprints (${[...blueprintCounts.values()].reduce((sum, item) => sum + item.count, 0)})`, '')];
  for (const [key, item] of [...blueprintCounts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    blueprintOptions.push(new Option(`${item.name} (${item.count})`, key));
  }
  ui.mapBlueprintFilter.replaceChildren(...blueprintOptions);
  if (selectedBlueprint && blueprintCounts.has(selectedBlueprint)) ui.mapBlueprintFilter.value = selectedBlueprint;
  const minimumQuality = Number(ui.communityScore.value) || 0;
  const after = ui.communityAfter.value ? Date.parse(`${ui.communityAfter.value}T00:00:00`) : 0;
  const blueprintMatches = name => !ui.mapBlueprintFilter.value || String(name || '').trim().toLocaleLowerCase() === ui.mapBlueprintFilter.value;
  const visibleRarities = new Set(ui.mapFilterRarities.filter(control => control.checked).map(control => control.dataset.mapFilterRarity));
  const rarityMatches = name => visibleRarities.has(rarityForBlueprint(name)?.id || 'unrated');
  const dateMatches = timestamp => !after || Date.parse(timestamp) >= after;
  const personalQuality = find => reliabilityForFind(find, data.sightings.find(entry => entry.id === find.sightingId || entry.savedFindId === find.id)).score;
  const visibleFinds = ui.showPersonal.checked ? finds.filter(find => blueprintMatches(find.name) && rarityMatches(find.name) &&
    personalQuality(find) >= minimumQuality && dateMatches(find.foundAt)) : [];
  for (const find of visibleFinds) {
    const pin = document.createElement('button');
    const rarity = rarityForBlueprint(find.name);
    pin.className = `pin${rarity ? ` rarity-${rarity.id}` : ''}`; pin.type = 'button';
    pin.dataset.pinKind = 'find'; pin.dataset.pinId = find.id;
    pin.dataset.foundAt = find.foundAt; pin.dataset.source = 'My find';
    markPinForHover(pin, `find:${find.id}`, find);
    pin.style.left = `${find.x * 100}%`; pin.style.top = `${find.y * 100}%`;
    pin.title = `${find.name} · ${rarity ? `${rarity.label} (estimated find rarity)` : 'Rarity not rated'} · ${new Date(find.foundAt).toLocaleString()}`;
    pin.setAttribute('aria-label', pin.title);
    const star = document.createElement('span'); star.className = 'pin-star'; star.textContent = '★'; star.setAttribute('aria-hidden', 'true');
    const pinLabel = document.createElement('span'); pinLabel.className = 'pin-label'; pinLabel.textContent = find.name;
    pin.append(star, pinLabel);
    pin.addEventListener('click', event => {
      event.stopPropagation();
      editingMapPin = false;
      ui.coordinates.textContent = `${find.name} · ${Math.round(find.x * 100)}%, ${Math.round(find.y * 100)}%`;
      selectedMapPin = { kind: 'find', id: find.id };
      renderPinPopup(true);
    });
    ui.pins.append(pin);
  }
  let communityVisible = 0;
  const communityItems = [];
  if (ui.showCommunity.checked) for (const player of community.players) {
    if (ui.communityPlayer.value && player.name.toLowerCase() !== ui.communityPlayer.value) continue;
    for (const [index, find] of player.finds.entries()) {
      if (find.map !== currentMap || find.score < minimumQuality || !dateMatches(find.foundAt) ||
          !blueprintMatches(find.name) || !rarityMatches(find.name) ||
          isOwnCommunityDuplicate(player.name, ui.gameName.value, find, data.finds)) continue;
      communityVisible++;
      const pin = document.createElement('button'); pin.type = 'button';
      const rarity = rarityForBlueprint(find.name);
      pin.className = `pin community-pin${rarity ? ` rarity-${rarity.id}` : ''}`;
      pin.dataset.pinKind = 'community'; pin.dataset.foundAt = find.foundAt; pin.dataset.source = player.name;
      markPinForHover(pin, `community:${player.name.toLowerCase()}:${index}`, find);
      pin.style.left = `${find.x * 100}%`; pin.style.top = `${find.y * 100}%`;
      pin.title = `${find.name} · ${player.name} · reliability ${find.score}/100 · ${new Date(find.foundAt).toLocaleString()}`;
      pin.setAttribute('aria-label', pin.title);
      const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = find.name;
      pin.append(label);
      pin.addEventListener('click', event => {
        event.stopPropagation(); selectedMapPin = null; editingMapPin = false;
        groupChooserOpen = false; ui.pinPopupChoices.hidden = true;
        ui.pinPopupTitle.textContent = find.name; ui.pinPopupStatus.textContent = `Community find · ${player.name}`;
        ui.pinPopupImage.hidden = true; ui.pinPopupEdit.hidden = true; ui.pinPopupForm.hidden = true; ui.pinPopupDetails.hidden = false;
        ui.pinPopupDetails.replaceChildren();
        for (const [key, value] of [['Map', find.map], ['Found', new Date(find.foundAt).toLocaleString()],
          ['Reliability', `${find.score}/100 · ${find.method}`], ['Name from', find.source || 'Unspecified'],
          ['Location', `${Math.round(find.x * 100)}% across, ${Math.round(find.y * 100)}% down`]]) {
          const term = document.createElement('dt'); term.textContent = key;
          const description = document.createElement('dd'); description.textContent = value;
          ui.pinPopupDetails.append(term, description);
        }
        ui.pinPopup.hidden = false;
        const bounds = ui.map.getBoundingClientRect();
        const anchor = pinPopupAnchor(pin.dataset.hoverKey, find);
        ui.pinPopup.style.left = `${Math.max(8, Math.min(anchor.x + 16, bounds.width - ui.pinPopup.offsetWidth - 8))}px`;
        ui.pinPopup.style.top = `${Math.max(8, Math.min(anchor.y + 16, bounds.height - ui.pinPopup.offsetHeight - 8))}px`;
        ui.pinPopup.focus({ preventScroll: true });
      });
      ui.pins.append(pin);
      communityItems.push({ find, player, pin });
    }
  }
  communityItems.sort((a, b) => ui.communitySort.value === 'newest'
    ? Date.parse(b.find.foundAt) - Date.parse(a.find.foundAt)
    : b.find.score - a.find.score || Date.parse(b.find.foundAt) - Date.parse(a.find.foundAt));
  ui.communityList.replaceChildren();
  for (const { find, player, pin } of communityItems.slice(0, 100)) {
    const item = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = `${find.name} · ${player.name} · ${find.score}/100 · ${new Date(find.foundAt).toLocaleDateString()}`;
    button.addEventListener('click', () => pin.click()); item.append(button); ui.communityList.append(item);
  }
  ui.communityCount.textContent = community.importedAt
    ? `${community.players.length} players imported · ${communityVisible} shown on this map`
    : 'No community CSV imported.';
  for (const sighting of data.sightings.filter(entry => ui.showPersonal.checked && !entry.dismissed && !entry.savedFindId &&
    entry.position && entry.map === currentMap && blueprintMatches(entry.name) && rarityMatches(entry.name) && dateMatches(entry.seenAt) &&
    (entry.name === unidentifiedBlueprint ? 0 : reliabilityForFind({ autoGenerated: true, nameSource: entry.nameSource,
      accuracy: entry.confidence ? '' : 'Approximate' }, entry).score) >= minimumQuality)) {
    const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'pin sighting-pin';
    pin.dataset.pinKind = 'sighting'; pin.dataset.pinId = sighting.id;
    pin.dataset.foundAt = sighting.seenAt; pin.dataset.source = 'Sighting awaiting review';
    markPinForHover(pin, `sighting:${sighting.id}`, sighting.position);
    pin.style.left = `${sighting.position.x * 100}%`; pin.style.top = `${sighting.position.y * 100}%`;
    pin.title = `${sighting.name} · location captured ${new Date(sighting.seenAt).toLocaleString()} · awaiting name or review`;
    pin.setAttribute('aria-label', pin.title);
    const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = sighting.name;
    pin.append(label);
    pin.addEventListener('click', event => {
      event.stopPropagation();
      editingMapPin = false;
      selectedSightingId = sighting.id;
      selectedMapPin = { kind: 'sighting', id: sighting.id };
      ui.blueprintName.value = sighting.name === unidentifiedBlueprint ? '' : sighting.name;
      draftPosition = sighting.position;
      render();
      ui.pinHelp.textContent = 'This sighting is located. Confirm its name to save it as a find.';
      renderPinPopup(true);
    });
    ui.pins.append(pin);
  }
  ui.draftPin.hidden = !draftPosition;
  if (hoveredPinKey && ![...ui.pins.children].some(pin => pin.dataset.hoverKey === hoveredPinKey)) clearPinHover();
  layoutSpiderPins();
  if (draftPosition) {
    ui.draftPin.style.left = `${draftPosition.x * 100}%`;
    ui.draftPin.style.top = `${draftPosition.y * 100}%`;
    ui.coordinates.textContent = `New pin · ${Math.round(draftPosition.x * 100)}%, ${Math.round(draftPosition.y * 100)}%`;
  } else ui.coordinates.textContent = 'No pin selected';
  ui.save.disabled = !(currentMap && ui.blueprintName.value.trim() && draftPosition);
  ui.count.textContent = String(finds.length);
  ui.list.replaceChildren();
  for (const find of [...visibleFinds].reverse()) {
    const item = document.createElement('li');
    const description = document.createElement('span'); description.className = 'find-text';
    const name = document.createElement('strong'); name.textContent = find.name;
    const rarity = rarityForBlueprint(find.name);
    const relatedSighting = data.sightings.find(entry => entry.id === find.sightingId || entry.savedFindId === find.id);
    const reliability = reliabilityForFind(find, relatedSighting);
    const details = document.createElement('small'); details.textContent = `${rarity?.label || 'Rarity not rated'} · Reliability ${reliability.score}/100 · ${new Date(find.foundAt).toLocaleString()}${find.accuracy ? ` · ${find.accuracy}` : ''}`;
    description.append(name, details);
    const shareLabel = document.createElement('label'); shareLabel.className = 'share-find';
    const shareCheck = document.createElement('input'); shareCheck.type = 'checkbox'; shareCheck.checked = shareApproved(find);
    shareCheck.setAttribute('aria-label', `Share ${find.name}`);
    shareCheck.addEventListener('change', () => { find.shareApproved = shareCheck.checked; persist(); });
    shareLabel.append(shareCheck, document.createTextNode('Share'));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-btn';
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${find.name}`);
    remove.addEventListener('click', () => {
      data.finds = data.finds.filter(other => other.id !== find.id);
      const sighting = data.sightings.find(entry => entry.savedFindId === find.id);
      if (sighting) sighting.savedFindId = null;
      persist(); render();
    });
    item.append(description, shareLabel, remove); ui.list.append(item);
  }
  renderSightings();
  renderPinPopup();
}

function renderPinPopup(focus = false) {
  if (groupChooserOpen) return;
  ui.pinPopupChoices.hidden = true;
  const find = selectedMapPin?.kind === 'find' && data.finds.find(entry => entry.id === selectedMapPin.id && entry.map === currentMap);
  const sighting = selectedMapPin?.kind === 'sighting'
    ? data.sightings.find(entry => entry.id === selectedMapPin.id && !entry.dismissed && !entry.savedFindId && entry.map === currentMap)
    : find && data.sightings.find(entry => entry.id === find.sightingId || entry.savedFindId === find.id);
  const entry = find || sighting;
  if (!entry) {
    selectedMapPin = null;
    editingMapPin = false;
    ui.pinPopup.hidden = true;
    return;
  }
  const position = find || sighting.position;
  const date = new Date(find?.foundAt || sighting.seenAt);
  const timestamp = Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  const reliability = find && reliabilityForFind(find, sighting);
  ui.pinPopupStatus.textContent = find ? 'Saved find' : 'Location awaiting review';
  ui.pinPopupTitle.textContent = entry.name;
  ui.pinPopupDetails.hidden = editingMapPin;
  ui.pinPopupEdit.hidden = editingMapPin;
  ui.pinPopupForm.hidden = !editingMapPin;
  const catalogIcon = sighting?.catalogIcon || find?.catalogIcon;
  const popupIcon = catalogIcon || sighting?.tilePreview;
  ui.pinPopupImage.hidden = !popupIcon;
  if (popupIcon) ui.pinPopupImage.src = popupIcon;
  ui.pinPopupDetails.replaceChildren();
  const details = [
    ['Map', entry.map],
    ['Found', timestamp],
    ...(find ? [['Find rarity', rarityForBlueprint(find.name)?.label || 'Not rated']] : []),
    ...(find ? [['Reliability', `${reliability.score}/100 · ${reliability.method}`]] : []),
    ['Location', `${Math.round(position.x * 100)}% across, ${Math.round(position.y * 100)}% down`],
    ['Accuracy', find?.accuracy || (sighting?.confidence ? `${Math.round(sighting.confidence * 100)}% map image match` : 'Approximate map position')],
  ];
  const nameSource = find?.nameSource || sighting?.nameSource;
  if (nameSource) details.push(['Name from', nameSource]);
  for (const [label, value] of details) {
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd'); description.textContent = value;
    ui.pinPopupDetails.append(term, description);
  }
  ui.pinPopup.hidden = false;
  const mapBounds = ui.map.getBoundingClientRect();
  const width = ui.pinPopup.offsetWidth;
  const height = ui.pinPopup.offsetHeight;
  const { x: anchorX, y: anchorY } = pinPopupAnchor(`${selectedMapPin.kind}:${selectedMapPin.id}`, position);
  const left = Math.max(8, Math.min(anchorX + 16, mapBounds.width - width - 8));
  const preferredTop = anchorY + height + 16 > mapBounds.height ? anchorY - height - 16 : anchorY + 16;
  const top = Math.max(8, Math.min(preferredTop, mapBounds.height - height - 8));
  ui.pinPopup.style.left = `${left}px`;
  ui.pinPopup.style.top = `${top}px`;
  if (focus) ui.pinPopup.focus({ preventScroll: true });
}

function closePinPopup(focusPin = false) {
  pinEditRequestId++;
  const previous = selectedMapPin;
  selectedMapPin = null;
  editingMapPin = false;
  groupChooserOpen = false;
  ui.pinPopupChoices.hidden = true;
  ui.pinPopup.hidden = true;
  if (focusPin && previous) {
    const pin = [...ui.pins.children].find(entry => entry.dataset.pinKind === previous.kind && entry.dataset.pinId === previous.id);
    pin?.focus({ preventScroll: true });
  }
}

async function startPinEdit() {
  if (!selectedMapPin) return;
  const find = selectedMapPin.kind === 'find' && data.finds.find(entry => entry.id === selectedMapPin.id);
  const sighting = !find && data.sightings.find(entry => entry.id === selectedMapPin.id);
  const entry = find || sighting;
  const position = find || sighting?.position;
  if (!entry || !position) return;
  const requestId = ++pinEditRequestId;
  const relatedSighting = find && data.sightings.find(item => item.id === find.sightingId || item.savedFindId === find.id);
  ui.pinEditName.value = entry.name === unidentifiedBlueprint ? '' : entry.name;
  ui.pinEditBlueprintSearch.value = '';
  ui.pinEditBlueprintPreview.hidden = true;
  ui.pinEditBlueprintList.replaceChildren();
  ui.pinEditBlueprintHint.textContent = 'Loading the complete blueprint catalog…';
  pinEditCandidates = [];
  ui.pinPopupForm.dataset.catalogIcon = '';
  ui.pinEditMap.replaceChildren();
  for (const name of Object.keys(data.maps)) {
    const option = document.createElement('option'); option.value = name; option.textContent = name;
    ui.pinEditMap.append(option);
  }
  ui.pinEditMap.value = entry.map;
  ui.pinEditX.value = String(Math.round(position.x * 1000) / 10);
  ui.pinEditY.value = String(Math.round(position.y * 1000) / 10);
  editingMapPin = true;
  renderPinPopup();
  await populateBlueprintPicker(relatedSighting || sighting, entry.name, requestId);
  if (requestId === pinEditRequestId && editingMapPin) ui.pinEditName.focus({ preventScroll: true });
}

function renderBlueprintPicker() {
  const query = ui.pinEditBlueprintSearch.value.trim().toLocaleLowerCase();
  const selectedName = ui.pinEditName.value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  ui.pinEditBlueprintList.replaceChildren();
  const candidates = pinEditCandidates.filter(candidate => !query || candidate.name.toLocaleLowerCase().includes(query));
  for (const candidate of candidates) {
    const option = document.createElement('button');
    option.type = 'button'; option.className = 'blueprint-picker-option'; option.setAttribute('role', 'option');
    const selected = candidate.name.toLocaleLowerCase() === selectedName;
    option.setAttribute('aria-selected', String(selected));
    if (selected) option.classList.add('selected');
    const icon = document.createElement('img'); icon.src = candidate.icon; icon.alt = ''; icon.loading = 'lazy';
    const details = document.createElement('span'); details.className = 'blueprint-picker-option-text';
    const name = document.createElement('strong'); name.textContent = candidate.name;
    const score = document.createElement('small');
    score.textContent = Number.isFinite(candidate.score) && candidate.score >= 0
      ? `Image match score ${Math.round(candidate.score * 100)}%` : 'Catalog blueprint';
    details.append(name, score); option.append(icon, details);
    option.addEventListener('click', () => {
      ui.pinEditName.value = candidate.name;
      ui.pinPopupForm.dataset.catalogIcon = candidate.icon;
      const preview = ui.pinEditBlueprintPreview.querySelector('img');
      preview.src = candidate.icon;
      ui.pinEditBlueprintPreview.querySelector('span').textContent = `${candidate.name} selected`;
      ui.pinEditBlueprintPreview.hidden = false;
      renderBlueprintPicker();
    });
    ui.pinEditBlueprintList.append(option);
  }
  if (!candidates.length) {
    const empty = document.createElement('p'); empty.className = 'blueprint-picker-empty';
    empty.textContent = 'No catalog blueprint matches that search.';
    ui.pinEditBlueprintList.append(empty);
  }
}

async function populateBlueprintPicker(sighting, selectedName, requestId) {
  ui.pinEditBlueprintList.textContent = 'Loading blueprint catalog…';
  try {
    const catalog = await loadBlueprintCatalog();
    if (requestId !== pinEditRequestId || !editingMapPin) return;
    let ranked = [];
    if (sighting?.tilePreview) {
      ui.pinEditBlueprintHint.textContent = `Comparing the captured item with all ${catalog.length} catalog icons…`;
      try {
        const image = new Image(); image.src = sighting.tilePreview; await image.decode();
        ranked = await rankBlueprintPreview(image, catalog.length);
      } catch { /* Keep the complete name list available when image ranking fails. */ }
    }
    if (requestId !== pinEditRequestId || !editingMapPin) return;
    const scores = new Map(ranked.map((candidate, index) => [candidate.name.toLocaleLowerCase(), { ...candidate, rank: index }]));
    pinEditCandidates = catalog.map(candidate => ({ ...candidate, ...(scores.get(candidate.name.toLocaleLowerCase()) || {}) }))
      .sort((first, second) => {
        const firstRanked = Number.isFinite(first.score), secondRanked = Number.isFinite(second.score);
        if (firstRanked && secondRanked) return second.score - first.score;
        if (firstRanked !== secondRanked) return firstRanked ? -1 : 1;
        return first.name.localeCompare(second.name);
      });
    const match = pinEditCandidates.find(candidate => candidate.name.toLocaleLowerCase() === selectedName.trim().toLocaleLowerCase());
    if (match) {
      ui.pinPopupForm.dataset.catalogIcon = match.icon;
      const preview = ui.pinEditBlueprintPreview.querySelector('img'); preview.src = match.icon;
      ui.pinEditBlueprintPreview.querySelector('span').textContent = `${match.name} selected`;
      ui.pinEditBlueprintPreview.hidden = false;
    }
    ui.pinEditBlueprintHint.textContent = ranked.some(candidate => candidate.score >= 0)
      ? `Best image similarities first; scores are for sorting, not probabilities. Search all ${catalog.length} blueprints.`
      : `No usable image ranking; all ${catalog.length} blueprints are listed alphabetically.`;
    renderBlueprintPicker();
  } catch {
    if (requestId !== pinEditRequestId || !editingMapPin) return;
    pinEditCandidates = [];
    ui.pinEditBlueprintHint.textContent = 'Catalog unavailable. You can still enter a blueprint name.';
    ui.pinEditBlueprintList.textContent = 'Blueprint catalog could not be loaded. You can still enter a name.';
  }
}

function savePinEdit(event) {
  event.preventDefault();
  const find = selectedMapPin?.kind === 'find' && data.finds.find(entry => entry.id === selectedMapPin.id);
  const sighting = selectedMapPin?.kind === 'sighting'
    ? data.sightings.find(entry => entry.id === selectedMapPin.id && !entry.dismissed && !entry.savedFindId)
    : find && data.sightings.find(entry => entry.id === find.sightingId || entry.savedFindId === find.id);
  const entry = find || sighting;
  if (!entry || !ui.pinPopupForm.reportValidity()) return;
  const name = ui.pinEditName.value.trim();
  const map = ui.pinEditMap.value;
  const x = Number(ui.pinEditX.value) / 100;
  const y = Number(ui.pinEditY.value) / 100;
  const selectedCatalogIcon = ui.pinPopupForm.dataset.catalogIcon || '';
  if (!name || !data.maps[map] || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
  entry.name = name;
  entry.map = map;
  entry.catalogIcon = selectedCatalogIcon;
  if (find) {
    find.x = x; find.y = y;
    find.nameSource = 'user edited';
  } else {
    sighting.position = { x, y };
    sighting.nameSource = 'user edited';
  }
  if (find && sighting) {
    sighting.name = name;
    sighting.map = map;
    sighting.position = { x, y };
    sighting.nameSource = 'user edited';
    sighting.catalogIcon = selectedCatalogIcon;
  } else if (sighting) {
    sighting.catalogIcon = selectedCatalogIcon;
  }
  let finalizedSighting = false;
  if (!find && sighting) {
    finalizedSighting = saveLocatedSighting(sighting);
    if (finalizedSighting) selectedMapPin = { kind: 'find', id: sighting.savedFindId };
  }
  if (sighting && selectedSightingId === sighting.id) {
    ui.blueprintName.value = finalizedSighting ? '' : name;
    draftPosition = !sighting.savedFindId && map === currentMap ? sighting.position : null;
    if (finalizedSighting) selectedSightingId = null;
  }
  editingMapPin = false;
  if (map !== currentMap) selectedMapPin = null;
  persist(); render();
  setStatus(finalizedSighting
    ? `Confirmed and pinned ${name}${map !== currentMap ? ` on ${map}` : ''}.`
    : `Updated ${name}${map !== currentMap ? ` on ${map}` : ''}.`, Boolean(mediaStream));
}

function renderSightings() {
  ui.sightingCount.textContent = String(data.sightings.filter(sighting => !sighting.dismissed).length);
  ui.sightingList.replaceChildren();
  ui.reviewedList.replaceChildren();
  const reviewed = data.sightings.filter(sighting => sighting.dismissed);
  ui.reviewedCount.textContent = String(reviewed.length);
  ui.reviewedSightings.hidden = reviewed.length === 0 && data.dismissedTiles.length === 0;
  ui.forgetDismissed.hidden = data.dismissedTiles.length === 0;
  ui.forgetDismissed.textContent = `Forget ${data.dismissedTiles.length} saved false-alert example${data.dismissedTiles.length === 1 ? '' : 's'}`;
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
      sighting.suppressRepeat = sighting.dismissed;
      data.dismissedTiles = data.dismissedTiles.filter(entry => entry.id !== sighting.id);
      if (sighting.dismissed && sighting.tilePreview) {
        data.dismissedTiles.push({ id: sighting.id, tilePreview: sighting.tilePreview });
        data.dismissedTiles = data.dismissedTiles.slice(-32);
      }
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
    item.append(button, review);
    (sighting.dismissed ? ui.reviewedList : ui.sightingList).append(item);
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
      selected.catalogIcon = candidate.icon;
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
  find.catalogIcon = sighting.catalogIcon || '';
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
  iconAnalysisPending.add(sighting.id);
  const epoch = analysisGeneration;
  try {
    const candidates = await rankBlueprintIcons(frame, tile.slot);
    if (epoch !== analysisGeneration) return;
    const match = confidentMatch(candidates);
    if (match) applyIconMatch(sighting, match);
    else {
      sighting.iconCandidates = candidates;
      persist(); render();
    }
  } catch (error) { if (error.name !== 'AbortError') console.warn('Blueprint icon match unavailable:', error); }
  finally { if (epoch === analysisGeneration) iconAnalysisPending.delete(sighting.id); }
}

async function reviewStoredSightingIcon(sighting) {
  // Candidate rankings may be stale after new labeled references are added.
  if (sighting.name !== unidentifiedBlueprint || !sighting.tilePreview || sighting.dismissed) return;
  try {
    const image = new Image(); image.src = sighting.tilePreview; await image.decode();
    const candidates = await rankBlueprintPreview(image);
    const match = confidentMatch(candidates, 0.04);
    if (match) applyIconMatch(sighting, match);
    else {
      sighting.iconCandidates = candidates;
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

function cachedSignature(sighting) {
  if (!sighting.tilePreview) return null;
  if (!signatureCache.has(sighting.id)) signatureCache.set(sighting.id, tileSignature(sighting.tilePreview));
  return signatureCache.get(sighting.id);
}

async function matchesDismissedTile(current) {
  for (const sighting of data.dismissedTiles) {
    try {
      if (tileSimilarity(current, await cachedSignature(sighting)) >= 0.96) return true;
    } catch { /* An unreadable old preview cannot veto a new sighting. */ }
  }
  return false;
}

async function recordSighting(name, frame, tile = null, targetSighting = null, generation = captureGeneration, epoch = null) {
  if (generation !== captureGeneration || (epoch !== null && epoch !== analysisGeneration)) return false;
  // A later name read updates the original sighting, keeping its discovery
  // screenshot rather than capturing whatever happens to be visible now.
  if (targetSighting && name !== unidentifiedBlueprint) {
    targetSighting.name = name;
    targetSighting.nameSource = 'OCR';
    selectedSightingId = targetSighting.id;
    saveLocatedSighting(targetSighting);
    persist(); render();
    return true;
  }
  const now = Date.now();
  const windowMs = name === unidentifiedBlueprint ? 90 * 1000 : 5 * 60 * 1000;
  const tilePreview = blueprintTilePreview(frame, tile);
  const recent = data.sightings.filter(sighting => !sighting.dismissed &&
    sighting.name.toLowerCase() === name.toLowerCase() && now - Date.parse(sighting.seenAt) < windowMs);
  if (name === unidentifiedBlueprint) {
    if (!tilePreview || recent.some(sighting => !sighting.tilePreview)) return false;
    const signature = await tileSignature(tilePreview);
    if (generation !== captureGeneration || (epoch !== null && epoch !== analysisGeneration)) return false;
    for (const sighting of recent) {
      if (tileSimilarity(signature, await cachedSignature(sighting)) >= 0.96) return false;
    }
    if (await matchesDismissedTile(signature)) return false;
    if (generation !== captureGeneration || (epoch !== null && epoch !== analysisGeneration)) return false;
  }
  const snapshot = document.createElement('canvas');
  const scale = Math.min(1, 960 / frame.width);
  snapshot.width = Math.round(frame.width * scale); snapshot.height = Math.round(frame.height * scale);
  snapshot.getContext('2d').drawImage(frame, 0, 0, snapshot.width, snapshot.height);
  const unnamed = targetSighting || (name !== unidentifiedBlueprint && data.sightings.find(sighting =>
    !sighting.dismissed && (sighting.name === unidentifiedBlueprint || sighting.nameSource === 'catalog icon') &&
    !sighting.savedFindId && now - Date.parse(sighting.seenAt) < 60 * 1000));
  if (unnamed) {
    unnamed.name = name;
    unnamed.nameSource = 'OCR';
    unnamed.frame = snapshot.toDataURL('image/jpeg', 0.55);
    selectedSightingId = unnamed.id;
    saveLocatedSighting(unnamed);
    persist(); render();
    return true;
  }
  if (name !== unidentifiedBlueprint && recent.length) {
    persist();
    renderSightings();
    return false;
  }
  const sighting = { id: crypto.randomUUID(), name, seenAt: new Date(now).toISOString(), frame: snapshot.toDataURL('image/jpeg', 0.55),
    tilePreview, nameSource: name === unidentifiedBlueprint ? null : 'OCR', savedFindId: null };
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
  if (workerPromise) return workerPromise;
  if (!window.Tesseract) throw new Error('OCR script is unavailable. Check the bundled vendor files.');
  const generation = analysisGeneration;
  setStatus('Loading OCR model…', true);
  const pending = window.Tesseract.createWorker('eng', 1, {
    workerPath: '/vendor/worker.min.js',
    corePath: '/vendor/tesseract-core-simd-lstm.wasm.js',
    langPath: '/vendor',
    logger: progress => {
      if (generation === analysisGeneration && progress.status && progress.progress < 1)
        setStatus(`${progress.status} ${Math.round(progress.progress * 100)}%`, true);
    },
  });
  workerPromise = pending;
  try {
    const created = await pending;
    if (generation !== analysisGeneration) {
      await created.terminate?.();
      throw new Error('Capture session ended while OCR was loading.');
    }
    worker = created;
    return worker;
  } finally { if (workerPromise === pending) workerPromise = null; }
}

async function findMapPosition(frame) {
  if (!isArcMapView(frame)) return { error: 'Open the in-game map to capture a position.' };
  const epoch = analysisGeneration;
  const mapData = data.maps[currentMap];
  if (mapData?.image && !presetForMap(mapData)) {
    return matchCapturedMap(frame, { customImage: mapData.image, mapName: currentMap });
  }
  const ocr = await ensureWorker();
  if (epoch !== analysisGeneration) throw new DOMException('Scanning paused.', 'AbortError');
  const titleResult = await ocr.recognize(cropMapTitle(frame));
  if (epoch !== analysisGeneration) throw new DOMException('Scanning paused.', 'AbortError');
  const family = mapFamilyFromTitle(titleResult.data.text);
  if (!family) return { error: 'The map name is not readable yet. Keep the in-game map open or use a saved map screenshot.' };
  return matchCapturedMap(frame, { family });
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

async function scanVisualFrame(generation = captureGeneration) {
  if (generation !== captureGeneration || !mediaStream || ui.pauseScanning.checked || visualScanning || video?.readyState < 2) return;
  const epoch = analysisGeneration;
  const regions = captureRegions;
  visualScanning = true;
  try {
    const panelVisible = regions.lootPanelVisible(video);
    const now = Date.now();
    const lootScanActive = panelVisible && (lootWindow.openedAt === null || now - lootWindow.openedAt <= lootWindow.durationMs);
    const tiles = lootScanActive ? regions.blueprintTiles(video) : [];
    const freshSlots = lootWindow.observe(panelVisible, tiles.map(tile => tile.slot), now);
    const newTiles = tiles.filter(tile => freshSlots.includes(tile.slot));
    const frame = newTiles.length ? takeFrame(false) : null;
    for (const tile of newTiles) {
      if (!await recordSighting(unidentifiedBlueprint, frame, tile, null, generation, epoch)) continue;
      if (generation !== captureGeneration || epoch !== analysisGeneration) return;
      recognizeSightingIcon(data.sightings[0], frame, tile);
      ui.pinHelp.textContent = 'Blueprint tile seen. Hover for its name and open the in-game map soon to locate it.';
      setStatus(`Blueprint-like tile in container slot ${tile.slot}`, true);
    }
    // Name reads are independent of visual scanning so a slow OCR job cannot
    // prevent detecting the map that appears immediately after a container.
    if (panelVisible && Date.now() - lastOcrAt >= 1000) scanOnce(generation);
    const mapVisible = !panelVisible && regions.mapVisible(video);
    if (!mapVisible || !mapWasOpen) { mapSessionMatched = false; lastMapAttempt = 0; }
    mapWasOpen = mapVisible;
    const pending = data.sightings.filter(sighting => !sighting.dismissed && !sighting.savedFindId && !sighting.position &&
      Date.now() - Date.parse(sighting.seenAt) < 60 * 1000);
    if (!pending.length) return;
    if (!mapVisible || mapSessionMatched || Date.now() - lastMapAttempt < 1500) return;
    lastMapAttempt = Date.now();
    const mapFrame = takeFrame(false);
    if (!mapFrame) return;
    setStatus('In-game map detected. Reading its name and matching your position…', true);
    const suggestion = await findMapPosition(mapFrame);
    if (generation !== captureGeneration || epoch !== analysisGeneration) return;
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
    if (selectedSightingId === selected.id && !selected.savedFindId) applyMapSuggestion(suggestion, mapFrame);
    desktopAlert(`Location captured: ${selected.name}`, `${suggestion.mapName} map position is ready to review.`, selected.tilePreview);
    if (sameContainer.length > 1) setStatus(`Map location captured for ${sameContainer.length} blueprints. Review their pins.`, true);
  } catch (error) {
    if (generation !== captureGeneration || epoch !== analysisGeneration) return;
    setStatus(`Visual scan error: ${error.message}`);
    console.error(error);
  } finally { if (generation === captureGeneration && epoch === analysisGeneration) visualScanning = false; }
}

async function scanOnce(generation = captureGeneration) {
  if (generation !== captureGeneration || !mediaStream || ui.pauseScanning.checked || scanning) return;
  const pendingTiles = data.sightings.filter(sighting => !sighting.dismissed && !sighting.savedFindId &&
    (sighting.name === unidentifiedBlueprint || sighting.nameSource === 'catalog icon') && sighting.tilePreview &&
    Date.now() - Date.parse(sighting.seenAt) < 60 * 1000);
  if (!pendingTiles.length || (pendingTiles.length > 1 && pendingTiles.some(sighting => iconAnalysisPending.has(sighting.id)))) return;
  const epoch = analysisGeneration;
  scanning = true;
  lastOcrAt = Date.now();
  try {
    // Copy only the upper-left quarter directly from the shared video. This
    // buffer is held until OCR finishes and is never used by the visual scan.
    const crop = cropBlueprintName(video, captureRegions.canvas('ocr'));
    const ocr = await ensureWorker();
    if (generation !== captureGeneration || epoch !== analysisGeneration) return;
    const result = await ocr.recognize(crop);
    if (generation !== captureGeneration || epoch !== analysisGeneration) return;
    const text = result.data.text || '';
    ui.ocrText.textContent = text.trim() || '(No readable text)';
    ui.lastScan.textContent = `Last scanned ${new Date().toLocaleTimeString()}`;
    const candidate = blueprintFromText(text);
    // The tooltip names the hovered item, which need not be the last slot
    // detected. Prefer its catalog match and do not apply the same tooltip to
    // another item that still needs a name.
    const recentTiles = data.sightings.filter(sighting => !sighting.dismissed && !sighting.savedFindId && sighting.tilePreview &&
      Date.now() - Date.parse(sighting.seenAt) < 60 * 1000);
    const pendingTile = candidate && (recentTiles.find(sighting => sighting.name.toLowerCase() === candidate.toLowerCase()) ||
      recentTiles.find(sighting => sighting.name === unidentifiedBlueprint) ||
      (recentTiles.length === 1 ? recentTiles[0] : null));
    let message = 'Watching game window';
    if (candidate && pendingTile && (candidate !== lastCandidate || pendingTile.id !== lastCandidateSightingId)) {
      lastCandidate = candidate; lastCandidateSightingId = pendingTile.id;
      await recordSighting(candidate, null, null, pendingTile, generation, epoch);
      if (generation !== captureGeneration || epoch !== analysisGeneration) return;
      if (!ui.blueprintName.value.trim()) {
        ui.blueprintName.value = candidate;
        message = `Possible blueprint: ${candidate}`;
        ui.pinHelp.textContent = 'Review the name, then open your in-game map for automatic location matching.';
        render();
      } else message = `Possible blueprint seen: ${candidate}`;
    }
    setStatus(message, true);
  } catch (error) {
    if (generation !== captureGeneration || epoch !== analysisGeneration) return;
    setStatus(`OCR error: ${error.message}`);
    console.error(error);
  } finally {
    if (generation === captureGeneration && epoch === analysisGeneration) scanning = false;
  }
}

async function startCapture() {
  if (mediaStream || ui.start.disabled) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus('Screen sharing is unavailable in this browser. Open http://127.0.0.1:4177/ in Chrome or Edge.');
    return;
  }
  let newStream = null;
  const generation = ++captureGeneration;
  ui.start.disabled = true;
  try {
    setStatus('Choose Window → ARC Raiders. Use Entire Screen if the game is missing.');
    newStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'window', frameRate: 2, width: { ideal: 1600 }, height: { ideal: 900 } },
      monitorTypeSurfaces: 'include', selfBrowserSurface: 'exclude', audio: false,
    });
    if (generation !== captureGeneration) { newStream.getTracks().forEach(track => track.stop()); return; }
    const track = newStream.getVideoTracks()[0];
    video = ui.previewVideo;
    ui.previewPanel.hidden = false;
    video.srcObject = newStream;
    mediaStream = newStream;
    ui.stop.disabled = false;
    track.addEventListener('ended', () => {
      if (generation === captureGeneration) stopCapture('Sharing ended. Select Start capture to choose a screen again.');
    }, { once: true });
    await video.play();
    if (generation !== captureGeneration) { newStream.getTracks().forEach(track => track.stop()); return; }
    // Some capture sources wait for another frame before resolving constraints.
    // Apply limits after playback starts without blocking initialization or Stop.
    track.applyConstraints({ frameRate: { max: 2 }, width: { max: 1600 }, height: { max: 900 } })
      .catch(error => console.warn('Capture size/FPS limits unavailable; using requested capture settings:', error));
    captureRegions = new CaptureRegions();
    const surface = track.getSettings().displaySurface;
    ui.previewDetails.textContent = `${surface === 'monitor' ? 'Entire Screen' : surface === 'window' ? 'Window' : surface === 'browser' ? 'Browser tab' : 'Shared display'} · ${video.videoWidth} × ${video.videoHeight}`;
    ui.previewHint.textContent = surface === 'monitor'
      ? 'The preview shows whatever is on the selected screen. Switch back to ARC Raiders and keep it visible; the app will continue scanning in the background.'
      : surface === 'browser'
        ? 'This is a browser tab. Stop sharing and choose Entire Screen or the ARC Raiders window instead.'
        : 'You should see ARC Raiders here. If the preview is black, try borderless windowed mode or share Entire Screen while the game is visible.';
    ui.previewPanel.hidden = !ui.showPreview.checked;
    ui.start.disabled = true; ui.stop.disabled = false;
    setStatus(ui.pauseScanning.checked ? 'Scanning paused; screen sharing is still active.' : surface === 'browser' ? 'A browser tab is shared. Choose the game window or Entire Screen.' : 'Capture is live; watching for blueprints.', true);
    visualTimer = setInterval(() => scanVisualFrame(generation), 500);
    scanVisualFrame(generation);
  } catch (error) {
    newStream?.getTracks().forEach(track => track.stop());
    if (generation === captureGeneration) stopCapture(error.name === 'NotAllowedError'
      ? 'Capture cancelled. Try Entire Screen if the game is missing from the picker.' : `Capture failed: ${error.message}`);
  }
}

function cancelScanning() {
  analysisGeneration++;
  stopImageAnalysis();
  const oldWorker = worker; worker = null; workerPromise = null;
  if (oldWorker?.terminate) Promise.resolve().then(() => oldWorker.terminate()).catch(error => console.warn('OCR cleanup failed:', error));
  scanning = false; visualScanning = false; lastOcrAt = 0; lastMapAttempt = 0;
  iconAnalysisPending.clear();
}

function stopCapture(message = 'Capture stopped') {
  cancelScanning();
  captureGeneration++;
  clearInterval(visualTimer);
  visualTimer = null;
  scanning = false; visualScanning = false; lastOcrAt = 0;
  lastCandidate = ''; lastCandidateSightingId = '';
  const oldStream = mediaStream; mediaStream = null;
  mapWasOpen = false; mapSessionMatched = false;
  lootWindow.reset();
  oldStream?.getTracks().forEach(track => track.stop());
  if (video) { video.pause(); video.srcObject = null; video = null; }
  captureRegions?.release(); captureRegions = null;
  signatureCache.clear();
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
ui.map.addEventListener('click', event => { closePinPopup(); setDraft(positionOnZoomedMap(event)); });
ui.map.addEventListener('wheel', zoomMapAt, { passive: false });
ui.map.addEventListener('pointermove', onMapPointerMove);
ui.mapFiltersToggle.addEventListener('click', event => {
  event.stopPropagation();
  ui.mapFilters.hidden = !ui.mapFilters.hidden;
  ui.mapFiltersToggle.setAttribute('aria-expanded', String(!ui.mapFilters.hidden));
  if (!ui.mapFilters.hidden) ui.showPersonal.focus();
});
ui.mapFilters.addEventListener('click', event => event.stopPropagation());
ui.mapFilterApply.addEventListener('click', () => {
  render();
  ui.mapFilters.hidden = true;
  ui.mapFiltersToggle.setAttribute('aria-expanded', 'false');
  ui.mapFiltersToggle.focus();
});
ui.mapFilters.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    ui.mapFilters.hidden = true;
    ui.mapFiltersToggle.setAttribute('aria-expanded', 'false');
    ui.mapFiltersToggle.focus();
  }
});
ui.pins.addEventListener('click', event => {
  if (choosingGroupMember) return;
  const pin = pinFromPointerTarget(event.target);
  if (!pin) return;
  const group = expandedPins?.groups?.find(entry => entry.representativeKey === pin.dataset.hoverKey && entry.members.length > 1);
  if (group) {
    event.preventDefault(); event.stopPropagation();
    showGroupChooser(group);
  } else {
    groupChooserOpen = false;
    ui.pinPopupChoices.hidden = true;
  }
}, true);
ui.pins.addEventListener('pointerover', event => {
  const pin = pinFromPointerTarget(event.target);
  if (!pin || pin.contains(event.relatedTarget)) return;
  clearTimeout(pinExitTimer);
  clearTimeout(pinEnterTimer);
  const key = pin.dataset.hoverKey;
  if (key === hoveredPinKey) return;
  pendingPinKey = key;
  pinEnterTimer = setTimeout(() => {
    if (pendingPinKey !== key) return;
    const current = [...ui.pins.children].find(entry => entry.dataset.hoverKey === key);
    if (!current) return;
    for (const entry of ui.pins.children) entry.classList.remove('hover-stable');
    hoveredPinKey = key;
    current.classList.add('hover-stable');
  }, 140);
});
ui.pins.addEventListener('pointerout', event => {
  const pin = pinFromPointerTarget(event.target);
  if (!pin || pin.contains(event.relatedTarget)) return;
  const key = pin.dataset.hoverKey;
  if (pendingPinKey === key) { clearTimeout(pinEnterTimer); pendingPinKey = ''; }
  if (!hoveredPinKey) return;
  clearTimeout(pinExitTimer);
  pinExitTimer = setTimeout(() => {
    if (hoveredPinKey === key || pendingPinKey === '') clearPinHover();
  }, 220);
});
ui.map.addEventListener('pointerleave', () => {
  clearTimeout(pinEnterTimer);
  pendingPinKey = '';
  scheduleSpiderClose();
  if (!hoveredPinKey) return;
  clearTimeout(pinExitTimer);
  pinExitTimer = setTimeout(clearPinHover, 220);
});
new ResizeObserver(() => {
  if (mapZoom.scale === 1) return;
  mapZoom = { scale: 1, x: 0, y: 0 };
  applyMapZoom();
  closePinPopup();
}).observe(ui.map);
ui.pinPopup.addEventListener('click', event => event.stopPropagation());
ui.pinPopupClose.addEventListener('click', () => closePinPopup(true));
ui.pinPopupEdit.addEventListener('click', startPinEdit);
ui.pinPopupForm.addEventListener('submit', savePinEdit);
ui.pinEditBlueprintSearch.addEventListener('input', renderBlueprintPicker);
ui.pinEditName.addEventListener('input', () => {
  const match = pinEditCandidates.find(candidate => candidate.name.toLocaleLowerCase() === ui.pinEditName.value.trim().replace(/\s+/g, ' ').toLocaleLowerCase());
  ui.pinPopupForm.dataset.catalogIcon = match?.icon || '';
  if (match) {
    const preview = ui.pinEditBlueprintPreview.querySelector('img'); preview.src = match.icon;
    ui.pinEditBlueprintPreview.querySelector('span').textContent = `${match.name} selected`;
    ui.pinEditBlueprintPreview.hidden = false;
  } else ui.pinEditBlueprintPreview.hidden = true;
  renderBlueprintPicker();
});
ui.pinEditCancel.addEventListener('click', () => { editingMapPin = false; renderPinPopup(); ui.pinPopupEdit.focus({ preventScroll: true }); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !ui.pinPopup.hidden) {
    if (editingMapPin) { editingMapPin = false; renderPinPopup(); ui.pinPopupEdit.focus({ preventScroll: true }); }
    else closePinPopup(true);
  }
});
window.addEventListener('resize', () => { if (!ui.pinPopup.hidden) renderPinPopup(); });
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
ui.showPreview.addEventListener('change', () => { ui.previewPanel.hidden = !mediaStream || !ui.showPreview.checked; });
ui.pauseScanning.addEventListener('change', () => {
  cancelScanning();
  if (!mediaStream) return;
  setStatus(ui.pauseScanning.checked ? 'Scanning paused; screen sharing is still active.' : 'Capture is live; watching for blueprints.', true);
  if (!ui.pauseScanning.checked) scanVisualFrame();
});
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
ui.gameName.value = localStorage.getItem('arc-blueprint-game-name') || '';
ui.gameName.addEventListener('input', () => {
  localStorage.setItem('arc-blueprint-game-name', ui.gameName.value.trim());
  render();
});
ui.readGameName.addEventListener('click', async () => {
  const frame = takeFrame(false);
  if (!frame) return;
  try {
    const crop = document.createElement('canvas');
    const sourceWidth = Math.round(frame.width * 0.22);
    const sourceHeight = Math.round(frame.height * 0.075);
    crop.width = sourceWidth * 3; crop.height = sourceHeight * 3;
    crop.getContext('2d').drawImage(frame, frame.width - sourceWidth, 0, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
    if (!window.Tesseract) throw new Error('OCR is unavailable. Type your game name above.');
    const nameWorker = await window.Tesseract.createWorker('eng', 1, {
      workerPath: '/vendor/worker.min.js', corePath: '/vendor/tesseract-core-simd-lstm.wasm.js', langPath: '/vendor',
    });
    let result;
    try {
      await nameWorker.setParameters({ tessedit_pageseg_mode: '7' });
      result = await nameWorker.recognize(crop);
    } finally { await nameWorker.terminate(); }
    const words = (result.data.text || '').match(/[A-Za-z][A-Za-z0-9_]{2,39}/g) || [];
    const name = words.at(-1);
    if (!name) throw new Error('No game name was readable. Type it above.');
    ui.gameName.value = name;
    localStorage.setItem('arc-blueprint-game-name', name);
    render();
    setStatus(`Name read as ${name}. Check it before sharing.`, Boolean(mediaStream));
  } catch (error) { setStatus(error.message); }
});
ui.shareBlueprints.addEventListener('click', async () => {
  try {
    const payload = buildSharePayload(ui.gameName.value, data.finds.filter(shareApproved), data.sightings);
    if (!payload.finds.length) throw new Error('Save a confirmed blueprint find before sharing.');
    localStorage.setItem('arc-blueprint-game-name', payload.gameName);
    const json = JSON.stringify(payload);
    ui.shareJson.value = json; ui.shareJson.hidden = false;
    try { await navigator.clipboard.writeText(json); }
    catch { ui.shareJson.focus(); ui.shareJson.select(); }
    window.open(prefilledFormUrl(payload.gameName), '_blank', 'noopener');
    setStatus(`${payload.finds.length} finds ready. Your name is filled in; paste Blueprint JSON into the Form.`);
  } catch (error) { setStatus(error.message); }
});
ui.communityImport.addEventListener('change', async () => {
  try {
    const imported = importCommunityCsv(await ui.communityImport.files[0].text());
    const next = { ...imported, importedAt: new Date().toISOString() };
    let duplicatesRemoved = 0;
    for (const player of next.players) {
      const previousCount = player.finds.length;
      player.finds = deduplicateBlueprintEntries(player.finds);
      duplicatesRemoved += previousCount - player.finds.length;
    }
    localStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(next));
    community = next;
    ui.communityPlayer.replaceChildren(new Option('All players', ''));
    for (const player of community.players) ui.communityPlayer.add(new Option(player.name, player.name.toLowerCase()));
    render(); setStatus(`Imported ${community.players.length} player snapshots${duplicatesRemoved ? `; removed ${duplicatesRemoved} duplicate discoveries` : ''}${imported.rejected ? `; skipped ${imported.rejected} invalid rows` : ''}.`);
  } catch (error) { setStatus(`Community import failed: ${error.message}`); }
  ui.communityImport.value = '';
});
for (const control of [...ui.mapFilterRarities, ui.mapBlueprintFilter, ui.showPersonal, ui.showCommunity, ui.communityPlayer, ui.communityScore, ui.communityAfter, ui.communitySort]) {
  control.addEventListener('input', () => { ui.communityScoreValue.value = ui.communityScore.value; render(); });
}
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
    const rejected = [
      ...(Array.isArray(imported.dismissedTiles) ? imported.dismissedTiles : []),
      ...(Array.isArray(imported.sightings) ? imported.sightings.filter(entry => entry?.dismissed && entry.suppressRepeat !== false) : []),
    ];
    for (const entry of rejected) {
      if (!entry?.id || typeof entry.tilePreview !== 'string' || data.dismissedTiles.some(existing => existing.id === entry.id)) continue;
      data.dismissedTiles.push({ id: entry.id, tilePreview: entry.tilePreview });
    }
    data.dismissedTiles = data.dismissedTiles.slice(-32);
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

ui.forgetDismissed.addEventListener('click', () => {
  data.dismissedTiles = [];
  for (const sighting of data.sightings) if (sighting.dismissed) sighting.suppressRepeat = false;
  signatureCache.clear();
  persist(); render();
  setStatus('Saved false-alert examples forgotten.');
});

for (const preset of mapPresets) {
  const option = document.createElement('option');
  option.value = preset.id; option.textContent = preset.name;
  ui.presetMap.append(option);
}
ui.mapName.value = currentMap;
ui.presetMap.value = presetForMap(data.maps[currentMap])?.id || 'stella-upper';
for (const player of community.players) ui.communityPlayer.add(new Option(player.name, player.name.toLowerCase()));
updateAlertPermission();
let migratedEditedSightings = 0;
for (const sighting of data.sightings) {
  if (!sighting.dismissed && !sighting.savedFindId && sighting.position && sighting.name !== unidentifiedBlueprint &&
      sighting.nameSource === 'user edited' && saveLocatedSighting(sighting)) migratedEditedSightings++;
}
if (migratedEditedSightings) persist();
render();
if (migratedEditedSightings) setStatus(`Finalized ${migratedEditedSightings} manually edited blueprint${migratedEditedSightings === 1 ? '' : 's'} on the map.`);

// Resolve the newest stored sighting after a reload as well as new live tiles.
// This lets an interrupted capture finish naming a previously located item.
async function recheckLatestSighting() {
  const sighting = data.sightings.find(entry => !entry.dismissed && !entry.savedFindId && entry.name === unidentifiedBlueprint && entry.position);
  if (!sighting) return;
  try {
    if (sighting.tilePreview) {
      const preview = new Image(); preview.src = sighting.tilePreview; await preview.decode();
      const candidates = await rankBlueprintPreview(preview);
      const match = confidentMatch(candidates, 0.04);
      if (match) applyIconMatch(sighting, match);
      else {
        sighting.iconCandidates = candidates;
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
