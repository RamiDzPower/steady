import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as L from '../logic.js';
import { EXERCISES } from '../plan.js';

// Made-up numbers only: this repo is public.
const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const day = (extra = {}) => ({ ...L.emptyDay(), ...extra });

test('elapsed time leaves out pauses, and a pause survives a save and reload', () => {
  const a = { start: 1000, sets: {}, log: {} };
  assert.equal(L.activeMs(a, 61000), 60000);
  L.setPaused(a, true, 61000);
  assert.equal(L.activeMs(a, 121000), 60000); // the clock stands still while paused
  L.setPaused(a, true, 90000);
  assert.equal(a.pausedAt, 61000); // pausing again keeps the first pause
  const saved = JSON.parse(JSON.stringify(a)); // save() and load() go through JSON
  assert.equal(L.activeMs(saved, 121000), 60000);
  L.setPaused(saved, false, 121000);
  assert.deepEqual([saved.pausedAt, saved.pausedMs], [null, 60000]);
  assert.equal(L.activeMs(saved, 181000), 120000);
  L.setPaused(saved, false, 200000);
  assert.equal(saved.pausedMs, 60000); // resuming again changes nothing
  L.setPaused(saved, true, 200000);
  L.setPaused(saved, false, 230000);
  assert.equal(L.activeMs(saved, 230000), 139000); // two pauses add up
  assert.equal(L.activeMs({ start: 1000, sets: {}, log: {} }, 31000), 30000); // a session saved before pausing existed
});

test('a session left running since an earlier day or for over 10 hours does not time the workout', () => {
  const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime(); // local time, as the phone keeps it
  const run = (start, extra = {}) => ({ start, sets: {}, log: {}, ...extra });
  assert.equal(L.leftRunning(run(at(12, 18)), at(12, 18, 45)), false);
  assert.equal(L.leftRunning(run(at(12, 7)), at(12, 17, 1)), true); // 10 hours and a minute on the same day
  assert.equal(L.leftRunning(run(at(12, 22)), at(13, 7)), true); // overnight, under 10 hours
  assert.equal(L.leftRunning(run(at(12, 18)), at(13, 9)), true);
  // Paused yesterday after 25 minutes: the clock stopped with the workout, so its minutes stand.
  assert.equal(L.leftRunning(run(at(12, 18), { pausedAt: at(12, 18, 25) }), at(13, 9)), false);
  assert.equal(L.leftRunning(run(at(12, 6), { pausedAt: at(12, 17) }), at(13, 9)), true); // but not 11 hours of it
});

test('next up follows the exercise just done and wraps round to anything skipped', () => {
  const ex = [['goblet', 3, '10', 75], ['inclinepush', 3, '8 to 10', 75], ['deadbug', 2, '8 each side', 45]];
  assert.deepEqual(L.nextUp(ex, {}), { i: 0, set: 1, of: 3 });
  assert.deepEqual(L.nextUp(ex, { 0: 1 }, 0), { i: 0, set: 2, of: 3 });
  assert.deepEqual(L.nextUp(ex, { 0: 3 }, 0), { i: 1, set: 1, of: 3 });
  assert.deepEqual(L.nextUp(ex, { 1: 1 }, 1), { i: 1, set: 2, of: 3 }); // started on the second exercise
  assert.deepEqual(L.nextUp(ex, { 1: 3, 2: 2 }, 2), { i: 0, set: 1, of: 3 }); // then back to the first
  assert.deepEqual(L.nextUp(ex, JSON.parse('{"0":3,"1":2}'), 0), { i: 1, set: 3, of: 3 }); // keys as saved
  assert.equal(L.nextUp(ex, { 0: 3, 1: 3, 2: 2 }, 2), null);
});

test('heavier than last time compares with the last log before the session date', () => {
  const st = fresh();
  st.days['2026-11-11'] = day({ workouts: [{ id: 'strA', min: 30, rpe: 7, ex: [{ id: 'goblet', kg: 10, reps: 10, sets: 3, planned: 3 }, { id: 'carry', kg: 12, reps: 30, sets: 3, planned: 3 }] }] });
  const now = [
    { id: 'goblet', kg: 12.5, reps: 10, sets: 3, planned: 3 },
    { id: 'carry', kg: 12, reps: 30, sets: 3, planned: 3 },
    { id: 'inclinepush', kg: null, reps: 10, sets: 3, planned: 3 },
    { id: 'deadbug', kg: 5, reps: 8, sets: 2, planned: 2 },
  ];
  assert.deepEqual(L.heavierLifts(st, now, '2026-11-18'), [{ id: 'goblet', kg: 12.5, was: 10 }]);
  assert.deepEqual(L.heavierLifts(st, [{ id: 'goblet', kg: 15, reps: 10, sets: 0, planned: 3 }], '2026-11-18'), []); // no set done
  assert.deepEqual(L.heavierLifts(st, now, '2026-11-11'), []); // a log from the same day is not last time
  st.days['2026-11-13'] = day({ workouts: [{ id: 'strB', min: 30, rpe: 7, ex: [{ id: 'stepup', kg: null, reps: 10, sets: 2, planned: 2 }] }] });
  // No kg last time can be bodyweight, a loaded backpack or a weight never typed in, so there is nothing to beat.
  assert.deepEqual(L.heavierLifts(st, [{ id: 'stepup', kg: 5, reps: 10, sets: 2, planned: 2 }], '2026-11-18'), []);
});

test('the next session skips rest days, the daily walks and anything already logged', () => {
  const st = fresh();
  const next = (from) => { const n = L.nextSession(st, from); return n && [n.date, n.session.id, n.session.minutes]; };
  // Week 1: walks every weekday, strength at home on Wednesday, a 30-minute long walk on Saturday, rest on Sunday.
  assert.deepEqual(next('2026-11-02'), ['2026-11-11', 'strHome', 20]);
  assert.deepEqual(next('2026-11-11'), ['2026-11-11', 'strHome', 20]);
  st.days['2026-11-11'] = day({ workouts: [{ id: 'strHome', min: 20, rpe: 7 }] });
  assert.deepEqual(next('2026-11-11'), ['2026-11-14', 'longwalk', 30]);
  assert.deepEqual(next('2026-11-15'), ['2026-11-18', 'strHome', 20]);
});

test('every exercise picture is bundled as plain line art, and every bundled picture is used', () => {
  const dir = new URL('../img/ex/', import.meta.url);
  const pics = Object.values(EXERCISES).filter((e) => e.pic).map((e) => `${e.pic}.svg`);
  assert.ok(pics.length > 0);
  for (const f of pics) {
    const file = new URL(f, dir);
    assert.ok(existsSync(file), `img/ex/${f} is missing`);
    // One white path on a 512 x 512 canvas, matching the width and height the card's <img> declares.
    assert.match(readFileSync(file, 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="512" height="512" viewBox="0 0 512 512"><path fill="#fff" fill-rule="evenodd" d="[\d\s.,MmLlHhVvCcSsQqTtAaZz-]+"\/><\/svg>\s*$/, f);
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.svg'))) assert.ok(pics.includes(f), `img/ex/${f} is not used`);
});

test('the picture licence keeps the copyright notice the licensor supplies', () => {
  // CC BY-SA 4.0, section 3(a)(1)(A)(ii), asks for it to be kept as supplied.
  const text = readFileSync(new URL('../img/ex/LICENSE.txt', import.meta.url), 'utf8');
  assert.ok(text.includes('Copyright (c) 2026 Bryl Lim, except where ATTRIBUTION.md identifies an upstream source.'));
});
