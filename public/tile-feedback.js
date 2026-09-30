// Compare the item area of stored tile previews. The blue grid is shared by
// every blueprint, so require near identity before reusing a dismissal.
export async function tileSignature(previewUrl) {
  const image = new Image();
  image.src = previewUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 50; canvas.height = 45;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, image.width * 100 / 105, image.height * 90 / 108,
    0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

export function tileSimilarity(first, second) {
  if (!first || !second || first.length !== second.length) return -1;
  let sumA = 0, sumB = 0, squareA = 0, squareB = 0, product = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const a = first[offset + channel], b = second[offset + channel];
      sumA += a; sumB += b;
      squareA += a * a; squareB += b * b; product += a * b;
    }
  }
  const count = first.length / 4 * 3;
  const varianceA = squareA - sumA * sumA / count;
  const varianceB = squareB - sumB * sumB / count;
  return varianceA > 1 && varianceB > 1
    ? (product - sumA * sumB / count) / Math.sqrt(varianceA * varianceB) : -1;
}
