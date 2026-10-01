import { isLootPanelVisible, detectBlueprintTiles } from './blueprint-visual.js';
import { isArcMapView } from './map-match.js';

export function sourceSize(source) {
  return { width: source.videoWidth || source.naturalWidth || source.width,
    height: source.videoHeight || source.naturalHeight || source.height };
}

// Retain the same 1600-pixel analysis scale and reference coordinates as the
// original full-frame detector, while reading only the region being checked.
export class CaptureRegions {
  constructor() { this.buffers = new Map(); this.mapBuffers = {}; }
  canvas(key) {
    if (!this.buffers.has(key)) this.buffers.set(key, document.createElement('canvas'));
    return this.buffers.get(key);
  }
  pixels(source, key, left, top, right, bottom) {
    const size = sourceSize(source);
    const scale = Math.min(1, 1600 / Math.max(size.width, size.height));
    const width = Math.round(size.width * scale), height = Math.round(size.height * scale);
    const x = Math.floor(left * width / 2048), y = Math.floor(top * height / 1152);
    const cropWidth = Math.ceil(right * width / 2048) - x;
    const cropHeight = Math.ceil(bottom * height / 1152) - y;
    const canvas = this.canvas(key);
    if (canvas.width !== cropWidth) canvas.width = cropWidth;
    if (canvas.height !== cropHeight) canvas.height = cropHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, x / width * size.width, y / height * size.height,
      cropWidth / width * size.width, cropHeight / height * size.height, 0, 0, cropWidth, cropHeight);
    return { image: context.getImageData(0, 0, cropWidth, cropHeight), geometry: { width, height, x, y } };
  }
  lootPanelVisible(source) {
    const { image, geometry } = this.pixels(source, 'heading', 165, 245, 345, 280);
    return isLootPanelVisible(image, geometry);
  }
  blueprintTiles(source) {
    const { image, geometry } = this.pixels(source, 'loot', 0, 0, 1024, 576);
    return detectBlueprintTiles(image, 'CONTAINER LOADOUT', geometry);
  }
  mapVisible(source) {
    // The tiny selected-tab probes distinguish the map from inventory. The
    // title probe only checks for visible lettering; OCR runs when locating.
    if (!isArcMapView(source, this.mapBuffers)) return false;
    const { image } = this.pixels(source, 'title', 1600, 140, 1920, 190);
    let bright = 0;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      if (image.data[offset] > 160 && image.data[offset + 1] > 160 && image.data[offset + 2] > 160) bright++;
    }
    return bright >= 12;
  }
  release() {
    for (const canvas of [...this.buffers.values(), ...Object.values(this.mapBuffers)]) {
      canvas.width = 0; canvas.height = 0;
    }
    this.buffers.clear(); this.mapBuffers = {};
  }
}
