import { confidentMatch, prepareIconEntry, prepareReferenceEntry } from './icon-match.js';
import { loadAnalysisImage, analysisCanvas } from './analysis-image.js';
export { loadBlueprintCatalog, confidentMatch } from './icon-match.js';

let worker = null;
let generation = 0;
let nextId = 0;
const pending = new Map();
const cancelled = () => new DOMException('Image analysis cancelled.', 'AbortError');
let assetQueue = Promise.resolve();
function queueAsset(task) {
  const promise = assetQueue.then(task);
  assetQueue = promise.catch(() => {});
  return promise;
}

export function stopImageAnalysis() {
  generation++;
  worker?.terminate(); worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(cancelled()); }
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module', name: 'Blueprint image analysis' });
  const activeWorker = worker;
  worker.onmessage = async ({ data }) => {
    if (data.assetId) {
      let result;
      try {
        if (data.assetKind === 'icon-entry') {
          const loading = loadAnalysisImage(data.args.icon);
          // A cancelled job might never await its parallel decode.
          loading.catch(() => {});
          // Decode in parallel, but prepare one small entry per turn. Queuing
          // 83 independent zero-delay timers can itself delay page input.
          result = await queueAsset(() => prepareIconEntry(data.args, () => worker === activeWorker, loading));
        }
        else if (data.assetKind === 'reference-entry') result = await prepareReferenceEntry(data.args);
        else if (data.assetKind === 'map-image') {
          const image = await loadAnalysisImage(data.args.url);
          if (worker !== activeWorker) return;
          const canvas = analysisCanvas(); canvas.width = data.args.width;
          canvas.height = data.args.height || Math.round(canvas.width * image.height / image.width);
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
          result = await createImageBitmap(canvas);
        }
        if (worker !== activeWorker) { result?.close?.(); return; }
        activeWorker.postMessage({ assetId: data.assetId, result }, result instanceof ImageBitmap ? [result] : []);
      } catch (error) {
        result?.close?.();
        if (worker === activeWorker) activeWorker.postMessage({ assetId: data.assetId, error: error.message });
      }
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id); clearTimeout(job.timer);
    if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
  };
  worker.onerror = event => {
    if (worker !== activeWorker) return;
    const message = event.message || 'Image analysis worker failed.';
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error(message)); }
    pending.clear(); worker?.terminate(); worker = null; generation++;
  };
  return worker;
}

async function analyze(kind, source, args) {
  const epoch = generation;
  // Reserve a bounded queue before copying pixels, including decoding jobs.
  if (pending.size >= 12) throw new Error('Image analysis is busy. Try again shortly.');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => stopImageAnalysis(), 30000);
    pending.set(id, { resolve, reject, timer });
    (async () => {
      let bitmap;
      try {
        bitmap = await createImageBitmap(source);
        if (epoch !== generation || !pending.has(id)) throw cancelled();
        ensureWorker().postMessage({ id, kind, bitmap, args }, [bitmap]);
        bitmap = null; // Ownership transferred to the worker.
      } catch (error) {
        bitmap?.close();
        const job = pending.get(id);
        if (job) { pending.delete(id); clearTimeout(job.timer); job.reject(error); }
      }
    })();
  });
}

function rankCrop(source, crop, limit) {
  const canvas = analysisCanvas(); canvas.width = 100; canvas.height = 90;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, ...crop, 0, 0, 100, 90);
  return analyze('pixels', canvas, { limit });
}

export function rankBlueprintIcons(frame, slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) return Promise.resolve([]);
  const x = [169, 280, 390, 502][(slot - 1) % 4], y = [315, 427][Math.floor((slot - 1) / 4)];
  return rankCrop(frame, [x * frame.width / 2048, y * frame.height / 1152, 100 * frame.width / 2048, 90 * frame.height / 1152], 3);
}
export const rankBlueprintPreview = (preview, limit = 3) => rankCrop(preview,
  [0, 0, preview.width * 100 / 105, preview.height * 90 / 108], limit);
export const identifyBlueprintIcon = async (frame, slot) => confidentMatch(await rankBlueprintIcons(frame, slot));
export const identifyBlueprintPreview = async preview => confidentMatch(await rankBlueprintPreview(preview), 0.04);
export const matchCapturedMap = (frame, args) => analyze('map', frame, args);
