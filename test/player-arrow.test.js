import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlayerArrowPixels } from '../public/map-match.js';

function markers({ arrow = true, ring = true, secondArrow = false } = {}) {
  const width = 1600, height = 900, pixels = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y) => pixels.set([40, 185, 230, 255], (y * width + x) * 4);
  function triangle(cx, cy) {
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
      if (Math.abs(x) <= (y + 9) / 2) paint(cx + x, cy + y);
    }
  }
  if (arrow) triangle(800, 450);
  if (secondArrow) triangle(1000, 400);
  if (ring) for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
    if (Math.hypot(x, y) >= 8 && Math.hypot(x, y) <= 12) paint(940 + x, 670 + y);
  }
  return detectPlayerArrowPixels(pixels, width, height);
}

test('finds the filled player arrow beside a larger hollow extraction marker', () => {
  const arrow = markers();
  assert.ok(arrow);
  assert.ok(Math.abs(arrow.x - 0.5) < 0.01 && Math.abs(arrow.y - 0.5) < 0.01);
});
test('refuses an extraction marker alone or two competing player arrows', () => {
  assert.equal(markers({arrow:false}), null);
  assert.equal(markers({secondArrow:true}), null);
});
