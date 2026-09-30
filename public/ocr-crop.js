// Blueprint tooltips appear beside the eight container slots in the upper-left
// quarter of a 16:9 inventory frame. Enlarging this crop keeps title letters
// legible after the shared 3840×2160 video has been scaled to 1600×900.
export function cropBlueprintName(frame) {
  const sourceWidth = Math.round(frame.width / 2);
  const sourceHeight = Math.round(frame.height / 2);
  const crop = document.createElement('canvas');
  crop.width = Math.round(sourceWidth * 1.5);
  crop.height = Math.round(sourceHeight * 1.5);
  crop.getContext('2d').drawImage(frame, 0, 0, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
  return crop;
}
