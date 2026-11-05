import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../logic.js';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('a one-shot action runs on the first tap and drops a repeat within 600 ms', () => {
  const last = {};
  assert.equal(L.firstTap(last, 'quick-log', 1000), true);
  assert.equal(L.firstTap(last, 'quick-log', 1250), false); // the second tap of a double tap
  assert.equal(L.firstTap(last, 'doctor-pdf', 1250), true); // another action is its own key
  assert.equal(L.firstTap(last, 'quick-log', 1900), true); // 650 ms after the last tap is a new request
});

test('taps that keep coming count as one until there is a 600 ms pause', () => {
  const last = {};
  const runs = [0, 400, 800, 1200, 1900].filter((t) => L.firstTap(last, 'form:weigh', t));
  assert.deepEqual(runs, [0, 1900]);
});

test('only one-shot actions are guarded, so taps meant to add up still add every time', () => {
  const once = new Set([...app.match(/const ONCE = new Set\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
  for (const key of ['finish', 'form:finish', 'quick-log', 'add-food', 'add-recent', 'form:quick', 'form:weigh', 'form:paste', 'exclude', 'shop-share', 'doctor-pdf']) {
    assert.ok(once.has(key), `${key} should ignore a repeat`);
  }
  // A double tap on a toggle would switch it straight back, on Done would skip the rest that follows, and on a remove button would take the next row too.
  for (const key of ['log-menu', 'use-limit', 'repeat-week', 'pause', 'hold-done', 'rest-skip', 'food-del', 'workout-del', 'health-del', 'include']) {
    assert.ok(once.has(key), `${key} should ignore a repeat`);
  }
  // Each takes an Undo snapshot or removes a row: a repeat would snapshot the changed state, or remove a second drink.
  for (const key of ['log-day', 'shop-clear', 'water-undo', 'swap-set', 'skip-hold', 'discard']) assert.ok(once.has(key), `${key} should ignore a repeat`);
  // Undo's button and the full-screen flash stop taking taps after the first, so the second would land on what lies under them, such as a meal's Log or a set.
  for (const key of ['undo', 'flash-hide']) assert.ok(once.has(key), `${key} should ignore a repeat`);
  for (const key of ['water', 'walk-log', 'set', 'weigh-step', 'rpe']) assert.ok(!once.has(key), `${key} must run on every tap`);
});

test('the second tap of a double tap is told by time and place, whatever it lands on', () => {
  const first = { t: 1000, x: 195, y: 392 };
  assert.equal(L.sameTap(first, 1060, 195, 392), true); // straight after, on the sheet or row the first tap brought
  assert.equal(L.sameTap(first, 1520, 210, 404), true); // a slow double tap, a little off the first spot
  assert.equal(L.sameTap(first, 1600, 195, 392), false); // 600 ms on, it is a new tap
  assert.equal(L.sameTap(first, 1200, 195, 430), false); // 38 px away is another control
  assert.equal(L.sameTap(null, 1060, 195, 392), false); // nothing to match yet, or a script's click()
});

test('a session is discarded with an Undo, and only the two whole-data replacements still ask first', () => {
  const asks = [...app.matchAll(/confirm\('([^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual(asks, ['Delete everything in Steady on this phone? Export a backup first if you might want it back.', 'Replace everything in Steady with this backup?']);
});

test('each chart point answers taps out to the midpoints with its neighbours, within its reach and the plot', () => {
  assert.deepEqual(L.tapSpans([100], 29, 0, 340), [[71, 129]]);
  assert.deepEqual(L.tapSpans([10, 330], 29, 0, 340), [[0, 39], [301, 340]]); // clamped to the plot at the ends
  assert.deepEqual(L.tapSpans([100, 110, 200], 29, 0, 340), [[71, 105], [105, 139], [171, 229]]);
  const xs = [40, 41, 43, 80, 300];
  const spans = L.tapSpans(xs, 29, 0, 340);
  spans.forEach(([l, r], i) => {
    assert.ok(l <= xs[i] && xs[i] <= r, 'a point sits inside its own span');
    if (i) assert.ok(spans[i - 1][1] <= l, 'neighbouring spans never overlap');
  });
});
