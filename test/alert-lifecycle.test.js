import test from 'node:test';
import assert from 'node:assert/strict';
import { AlertLifecycle, LOCATED_ALERT_MS, UNLOCATED_ALERT_MS } from '../public/alert-lifecycle.js';

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      pending.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at <= now) { pending.delete(id); entry.callback(); }
      }
    },
  };
}

test('an unlocated blueprint collapses after 20 seconds', () => {
  const clock = fakeClock();
  let collapses = 0;
  const alert = new AlertLifecycle(() => collapses++, clock);
  alert.show('blueprint', UNLOCATED_ALERT_MS);
  clock.advance(UNLOCATED_ALERT_MS - 1);
  assert.equal(alert.isActive('blueprint'), true);
  clock.advance(1);
  assert.equal(alert.isActive('blueprint'), false);
  assert.equal(collapses, 1);
});

test('capturing the map starts a fresh 10 second period', () => {
  const clock = fakeClock();
  let collapses = 0;
  const alert = new AlertLifecycle(() => collapses++, clock);
  alert.show('blueprint', UNLOCATED_ALERT_MS);
  clock.advance(12_000);
  alert.show('blueprint', LOCATED_ALERT_MS);
  clock.advance(9_999);
  assert.equal(alert.isActive('blueprint'), true);
  clock.advance(1);
  assert.equal(alert.isActive('blueprint'), false);
  assert.equal(collapses, 1);
});

test('a later blueprint replaces the old timer and dismissal cancels it', () => {
  const clock = fakeClock();
  let collapses = 0;
  const alert = new AlertLifecycle(() => collapses++, clock);
  alert.show('first', UNLOCATED_ALERT_MS);
  clock.advance(10_000);
  alert.show('second', UNLOCATED_ALERT_MS);
  clock.advance(10_000);
  assert.equal(alert.isActive('second'), true);
  alert.dismiss('second');
  clock.advance(UNLOCATED_ALERT_MS);
  assert.equal(collapses, 0);
});
