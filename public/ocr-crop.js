// Blueprint tooltips appear beside the eight container slots in the upper-left
// quarter of a 16:9 inventory frame. Enlarging this crop keeps title letters
// legible after the shared 3840×2160 video has been scaled to 1600×900.
export function cropBlueprintName(frame, crop = document.createElement('canvas')) {
  const width = frame.videoWidth || frame.naturalWidth || frame.width;
  const height = frame.videoHeight || frame.naturalHeight || frame.height;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const sourceWidth = width / 2;
  const sourceHeight = height / 2;
  const targetWidth = Math.round(Math.round(width * scale) / 2 * 1.5);
  const targetHeight = Math.round(Math.round(height * scale) / 2 * 1.5);
  if (crop.width !== targetWidth) crop.width = targetWidth;
  if (crop.height !== targetHeight) crop.height = targetHeight;
  crop.getContext('2d').drawImage(frame, 0, 0, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
  return crop;
}
