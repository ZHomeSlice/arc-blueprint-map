// The same matching algorithms run in a browser page and in its worker.
export function analysisCanvas() {
  return typeof document === 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
}

let assetId = 0;
const assets = new Map();
if (typeof document === 'undefined' && typeof self !== 'undefined') self.addEventListener('message', ({ data }) => {
  if (!data.assetId || !assets.has(data.assetId)) return;
  const job = assets.get(data.assetId); assets.delete(data.assetId);
  if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
});

export function requestPageAsset(assetKind, args) {
  return new Promise((resolve, reject) => {
    const id = ++assetId; assets.set(id, { resolve, reject });
    self.postMessage({ assetId: id, assetKind, args });
  });
}

export async function loadAnalysisImage(url, width = 768, height = null) {
  if (typeof document !== 'undefined') {
    const image = new Image(); image.src = url; await image.decode();
    return image;
  }
  // Chromium downsamples decoded HTML images differently from ImageBitmaps.
  // Prepare the small asset once with the page's calibrated image decoder;
  // all searches and pixel comparisons still execute in this worker.
  return requestPageAsset('map-image', { url, width, height });
}
