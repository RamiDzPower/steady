import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { BLOCKS, SESSIONS, EXERCISES, MEALS, MENU, PREP, SHOPPING } from '../plan.js';

const profile = { sex: 'm', age: 40, heightCm: 180, startWeight: 110, rhr: 64, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {} });

test('dates', () => {
  assert.equal(L.weekday('2026-11-09'), 0);
  assert.equal(L.weekday('2026-11-15'), 6);
  assert.equal(L.nextMonday('2026-11-02'), '2026-11-09');
  assert.equal(L.nextMonday('2026-11-05'), '2026-11-09');
  assert.equal(L.mondayOf('2026-11-15'), '2026-11-09');
  assert.equal(L.diffDays('2026-11-09', '2026-11-16'), 7);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
});

test('plan position and blocks', () => {
  const s = profile.startDate;
  assert.deepEqual(L.planPosition(s, '2026-11-08'), { before: true, week: 0, daysToStart: 1 });
  assert.equal(L.planPosition(s, '2026-11-09').blockIndex, 0);
  assert.equal(L.planPosition(s, '2026-12-06').week, 4);
  assert.equal(L.planPosition(s, '2026-12-07').blockIndex, 1);
  assert.equal(L.planPosition(s, '2027-01-04').blockIndex, 2);
  assert.equal(L.planPosition(s, '2027-02-01').blockIndex, 3);
  assert.equal(L.planPosition(s, '2027-09-01').blockIndex, 3);
});

test('sessions resolve minutes per week', () => {
  const s = profile.startDate;
  assert.equal(L.sessionsFor(s, '2026-11-14')[0].minutes, 30);
  assert.equal(L.sessionsFor(s, '2026-12-05')[0].minutes, 45);
  assert.deepEqual(L.sessionsFor(s, '2026-11-11').map((x) => x.id), ['walks', 'strHome']);
  const iv = L.sessionsFor(s, '2027-01-06')[1];
  assert.equal(iv.id, 'intervals');
  assert.equal(iv.minutes, 35);
  assert.equal(iv.reps, 5);
  assert.equal(L.sessionsFor(s, '2026-11-15')[0].kind, 'rest');
  assert.deepEqual(L.sessionsFor(s, '2026-11-01'), []);
});

test('plan data is consistent', () => {
  for (const b of BLOCKS) {
    assert.equal(b.days.length, 7, b.name);
    for (const day of b.days) for (const e of day) assert.ok(SESSIONS[e.s], `${b.name}: ${e.s}`);
  }
  for (const [id, s] of Object.entries(SESSIONS)) for (const [ex] of s.exercises ?? []) assert.ok(EXERCISES[ex], `${id}: ${ex}`);
  // Planned minutes grow block by block and sit above each block's exercise-minute target.
  let prev = 0;
  for (const b of BLOCKS) {
    let m = 0;
    for (let i = 0; i < 7; i++) m += L.plannedMinutes(L.sessionsFor(profile.startDate, L.addDays('2026-11-09', (b.weeks[0] - 1) * 7 + i)));
    assert.ok(m > prev && m >= b.targets.exMin, `${b.name}: ${m} planned vs target ${b.targets.exMin}`);
    prev = m;
  }
  assert.ok(PREP.length === 2 && SHOPPING.every((g) => g.items.length));
});

test('menu days land in the calorie and protein range', () => {
  const ids = new Set(MEALS.map((m) => m.id));
  assert.equal(MENU.length, 7);
  for (let i = 0; i < 7; i++) {
    const date = L.addDays('2026-11-09', i);
    const items = L.menuFor(date);
    for (const it of items) assert.ok(it.meal && ids.has(it.meal.id), `${date} ${it.slot}`);
    const t = L.mealTotals(items.map((x) => x.meal));
    assert.ok(t.kcal >= 2100 && t.kcal <= 2400, `${date} kcal ${t.kcal}`);
    assert.ok(t.p >= 130 && t.p <= 185, `${date} protein ${t.p}`);
    assert.ok(t.fib >= 30, `${date} fibre ${t.fib}`);
  }
});

test('targets and zones', () => {
  assert.equal(L.autoKcal(profile, 110), 2250);
  assert.equal(L.autoProtein(profile, 110), 115);
  assert.ok(L.autoKcal(profile, 99) < 2250);
  assert.deepEqual(L.targets({ ...profile, kcalTarget: 2300 }, 110), { kcal: 2300, protein: 115, waterBase: 2500 });
  const z = L.hrZones(profile);
  assert.equal(z.max, 180);
  assert.deepEqual(z.moderate, [110, 134]);
  assert.deepEqual(z.hard, [134, 157]);
});

test('water target follows effort', () => {
  assert.equal(L.waterTarget({ watch: { exMin: 30 } }, 2500), 3000);
  assert.equal(L.waterTarget({ workouts: [{ min: 60, rpe: 5 }] }, 2500), 3500);
  assert.equal(L.waterTarget({ watch: { exMin: 300 } }, 2500), 4000);
  assert.equal(L.waterTarget(undefined, 2500), 2500);
});

test('burn, balance and the Move fallback', () => {
  const st = fresh();
  st.days['2026-11-09'] = { foods: [{ kcal: 2000, p: 120 }], water: [], workouts: [], watch: { moveKcal: 600 } };
  const b = L.burn(st, '2026-11-09');
  assert.equal(b.total, Math.round(L.bmr(profile, 110) + 600 + 200));
  assert.equal(b.estimated, false);
  assert.equal(L.balance(st, '2026-11-09'), 2000 - b.total);
  st.days['2026-11-10'] = { foods: [{ kcal: 1800, p: 100 }], water: [], workouts: [] };
  const b2 = L.burn(st, '2026-11-10');
  assert.equal(b2.move, 600);
  assert.equal(b2.estimated, true);
  assert.equal(L.burn(fresh(), '2026-11-09'), null);
});

test('week summary counts planned and done sessions', () => {
  const st = fresh();
  st.days['2026-11-11'] = { foods: [{ kcal: 2200, p: 140 }], water: [{ ml: 2500 }], workouts: [{ id: 'walks', min: 20, rpe: 4 }, { id: 'strHome', min: 22, rpe: 7 }], watch: { steps: 8000, exMin: 35, moveKcal: 650 } };
  const w = L.weekSummary(st, '2026-11-09');
  assert.equal(w.planned, 7); // 5 walk days, 1 strength, 1 long walk
  assert.equal(w.done, 2);
  assert.equal(w.strengthDone, 1);
  assert.equal(w.exMin, 42);
  assert.equal(w.load, 20 * 4 + 22 * 7);
  assert.equal(w.stepsAvg, 8000);
  assert.equal(w.daysLogged, 1);
});

test('predicted weight follows the logged balance', () => {
  const st = fresh();
  st.days['2026-11-09'] = { foods: [], water: [], workouts: [], weight: 110 };
  for (let i = 0; i < 7; i++) {
    const d = L.addDays('2026-11-09', i);
    st.days[d] = { ...(st.days[d] || L.emptyDay()), foods: [{ kcal: 2400, p: 130 }], watch: { moveKcal: 600 } };
  }
  const pred = L.predictedWeights(st, '2026-11-16');
  const last = pred.at(-1)[1];
  assert.ok(last < 110 && last > 109, String(last));
  assert.deepEqual(L.goalPath(profile).map(([d]) => d), ['2026-11-09', '2027-02-01', '2027-05-10', '2027-11-08']);
});

test('backup import keeps known fields only', () => {
  assert.throws(() => L.cleanBackup({ v: 2, days: {} }));
  assert.throws(() => L.cleanBackup({ v: 1, days: {}, profile: { age: 38 } }));
  const out = L.cleanBackup({
    v: 1, profile, custom: [{ id: 'x', name: 'Soup', kcal: 300, p: 10, evil: 1 }], shopping: { 'Eggs, 10': true, bad: 'yes' },
    days: { '2026-11-09': { foods: [{ name: '<img src=x onerror=alert(1)>', kcal: '900', p: 10 }], water: [{ ml: 500 }], weight: 999, watch: { steps: 5000, moveKcal: -4 } }, nope: {} },
  });
  const d = out.days['2026-11-09'];
  assert.equal(d.foods[0].kcal, 0); // a string is not a number
  assert.equal(d.weight, undefined);
  assert.equal(d.watch.steps, 5000);
  assert.equal(d.watch.moveKcal, null);
  assert.equal(out.days.nope, undefined);
  assert.equal(out.custom[0].evil, undefined);
  assert.deepEqual(out.shopping, { 'Eggs, 10': true });
  assert.equal(L.esc(d.foods[0].name), '&lt;img src=x onerror=alert(1)&gt;');
});

test('Watch import merges, typed values win', () => {
  const st = fresh();
  st.days['2026-11-09'] = { foods: [], water: [], workouts: [], watch: { src: 'manual', steps: 9000, moveKcal: null, exMin: null } };
  const n = L.mergeWatch(st, { kind: 'steady-watch', days: { '2026-11-09': { steps: 7000, moveKcal: 640, exMin: 31 }, '2026-11-10': { steps: 6000, moveKcal: 500, exMin: 12 } } });
  assert.equal(n, 2);
  assert.equal(st.days['2026-11-09'].watch.steps, 9000);
  assert.equal(st.days['2026-11-09'].watch.moveKcal, 640);
  assert.equal(st.days['2026-11-10'].watch.src, 'import');
  assert.throws(() => L.mergeWatch(st, { v: 1, days: {} }));
});
