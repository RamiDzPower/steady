import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { BLOCKS, SESSIONS, EXERCISES, MEALS, MENUS, ITEMS, BATCHES, BATCH_ORDER, REMINDERS } from '../plan.js';

const profile = { sex: 'm', age: 40, heightCm: 180, startWeight: 110, rhr: 64, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const day = (extra = {}) => ({ ...L.emptyDay(), ...extra });

test('dates', () => {
  assert.equal(L.weekday('2026-11-09'), 0);
  assert.equal(L.weekday('2026-11-15'), 6);
  assert.equal(L.nextMonday('2026-11-02'), '2026-11-09');
  assert.equal(L.nextMonday('2026-11-05'), '2026-11-09');
  assert.equal(L.mondayOf('2026-11-15'), '2026-11-09');
  assert.equal(L.diffDays('2026-11-09', '2026-11-16'), 7);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
});

test('plan position, blocks and check-ins', () => {
  const s = profile.startDate;
  assert.deepEqual(L.planPosition(s, '2026-11-08'), { before: true, week: 0, daysToStart: 1 });
  assert.equal(L.planPosition(s, '2026-11-09').blockIndex, 0);
  assert.equal(L.planPosition(s, '2026-12-06').week, 4);
  assert.equal(L.planPosition(s, '2026-12-07').blockIndex, 1);
  assert.equal(L.planPosition(s, '2027-01-04').blockIndex, 2);
  assert.equal(L.planPosition(s, '2027-02-01').blockIndex, 3);
  assert.equal(L.planPosition(s, '2027-04-26').blockIndex, 4);
  assert.equal(L.checkIn(s, '2027-02-03').week, 13);
  assert.equal(L.checkIn(s, '2027-02-10'), null);
});

test('repeated weeks hold the plan back', () => {
  const s = profile.startDate;
  const reps = ['2026-11-16', '2026-11-23'];
  const pos = L.planPosition(s, '2026-11-25', reps);
  assert.equal(pos.calWeek, 3);
  assert.equal(pos.week, 1);
  assert.equal(pos.repeating, true);
  assert.equal(L.sessionsFor(s, '2026-11-28', reps)[0].minutes, 30); // Saturday stays at week 1's 30 minutes
});

test('sessions resolve minutes per week, with easier weeks from week 16', () => {
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
  // Week 16 starts 2027-02-22: Monday cardio 45 -> 30, Wednesday intervals 6 -> 4 repeats, Tuesday gym one set fewer.
  assert.equal(L.planPosition(s, '2027-02-22').week, 16);
  const mon = L.sessionsFor(s, '2027-02-22')[1];
  assert.equal(mon.deload, true);
  assert.equal(mon.minutes, 30);
  assert.equal(L.sessionsFor(s, '2027-02-24')[1].reps, 4);
  assert.equal(L.sessionsFor(s, '2027-02-23')[1].exercises[0][1], 2);
  assert.equal(L.sessionsFor(s, '2027-02-22')[0].deload, false); // the post-meal walks never get lighter
});

test('plan data is consistent', () => {
  for (const b of BLOCKS) {
    assert.equal(b.days.length, 7, b.name);
    for (const d of b.days) for (const e of d) assert.ok(SESSIONS[e.s], `${b.name}: ${e.s}`);
  }
  for (const [id, s] of Object.entries(SESSIONS)) for (const [ex] of s.exercises ?? []) assert.ok(EXERCISES[ex], `${id}: ${ex}`);
  let prev = 0;
  for (const b of BLOCKS) {
    let m = 0;
    for (let i = 0; i < 7; i++) m += L.plannedMinutes(L.sessionsFor(profile.startDate, L.addDays('2026-11-09', (b.weeks[0] - 1) * 7 + i)));
    assert.ok(m > prev && m >= b.targets.exMin, `${b.name}: ${m} planned vs target ${b.targets.exMin}`);
    prev = m;
  }
  for (const m of MEALS) {
    for (const k of Object.keys(m.buy || {})) assert.ok(ITEMS[k], `${m.id} buys unknown ${k}`);
    for (const [b] of m.batches || []) assert.ok(BATCHES[b] && BATCH_ORDER.includes(b), `${m.id} uses unknown batch ${b}`);
    if (m.where !== 'out' && m.slot !== 'extra') assert.ok(m.buy || m.batches, `${m.id} has nothing to buy`);
  }
  for (const [b, def] of Object.entries(BATCHES)) for (const k of Object.keys(def.buy)) assert.ok(ITEMS[k], `${b} buys unknown ${k}`);
});

test('every menu day lands in the calorie, protein and fibre range', () => {
  const st = fresh();
  const ids = new Set(MEALS.map((m) => m.id));
  assert.equal(MENUS.length, 3);
  for (let w = 0; w < 3; w++) {
    assert.equal(MENUS[w].length, 7);
    for (let i = 0; i < 7; i++) {
      const date = L.addDays(profile.startDate, w * 7 + i);
      assert.equal(L.menuIndex(profile.startDate, date), w);
      const items = L.menuFor(date, st);
      for (const it of items) assert.ok(it.meal && ids.has(it.meal.id), `${date} ${it.key}`);
      const t = L.mealTotals(items.map((x) => x.meal));
      assert.ok(t.kcal >= 2100 && t.kcal <= 2400, `menu ${w + 1} ${date} kcal ${t.kcal}`);
      assert.ok(t.p >= 130 && t.p <= 185, `menu ${w + 1} ${date} protein ${t.p}`);
      assert.ok(t.fib >= 30, `menu ${w + 1} ${date} fibre ${t.fib}`);
    }
  }
  assert.equal(L.menuIndex(profile.startDate, '2026-11-02'), 2); // the week before the start rotates backwards
});

test('swaps replace one meal on one date', () => {
  const st = fresh();
  st.swaps['2026-11-09'] = { dinner: 'salmon', snack0: 'eggs2', lunch: 'nonsense' };
  const items = L.menuFor('2026-11-09', st);
  assert.equal(items.find((x) => x.key === 'dinner').meal.id, 'salmon');
  assert.equal(items.find((x) => x.key === 'dinner').swapped, true);
  assert.equal(items.find((x) => x.key === 'snack0').meal.id, 'eggs2');
  assert.equal(items.find((x) => x.key === 'lunch').meal.id, 'chxbowl');
  assert.equal(L.menuFor('2026-11-10', st)[2].meal.id, 'chorba');
  assert.ok(L.swapOptions('dinner').some((m) => m.slot === 'lunch'));
  assert.ok(L.swapOptions('snack').every((m) => m.slot === 'snack'));
});

test('shopping list adds batches and fresh items for the actual week', () => {
  const st = fresh();
  const list = L.shoppingFor(st, profile.startDate);
  const find = (k) => list.flatMap((g) => g.items).find((i) => i.key === k);
  // Menu 1: chicken bowls 3 x 120, chorba 2 x 80, loubia 80, couscous 120 = 720 g cooked x 1.35 = 972 -> 1 kg.
  assert.equal(find('chickenbreast').amount, '1 kg');
  assert.equal(find('whitebeans').amount, '1 can');
  assert.equal(find('eggs').amount, '10');
  assert.ok(list.every((g) => g.items.length));
  st.swaps['2026-11-09'] = { dinner: 'salmon' };
  const swapped = L.shoppingFor(st, profile.startDate).flatMap((g) => g.items);
  assert.ok(swapped.some((i) => i.key === 'salmon'));
});

test('prep plan splits the week and freezes what keeps too long', () => {
  const st = fresh();
  const [sun, wed] = L.prepFor(st, profile.startDate);
  assert.equal(sun.date, '2026-11-08');
  assert.equal(wed.date, '2026-11-11');
  assert.ok(sun.steps.some((s) => s.startsWith('Rice:')));
  assert.ok(sun.steps.some((s) => s.startsWith('Lentil chorba, 1 portion')));
  assert.ok(wed.freeze.some((f) => f.date === '2026-11-15'));
  assert.ok(sun.freeze.length === 0);
  assert.ok(sun.fresh.some((f) => f.name.startsWith('Fish, tofu')));
});

test('targets and zones', () => {
  assert.equal(L.autoKcal(profile, 110), 2250);
  assert.equal(L.autoProtein(profile, 110), 115);
  assert.ok(L.autoKcal(profile, 99) < 2250);
  assert.deepEqual(L.targets({ ...profile, kcalTarget: 2300 }, 110), { kcal: 2300, protein: 115, waterBase: 2500, fibre: 30 });
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
  st.days['2026-11-09'] = day({ foods: [{ kcal: 2000, p: 120 }], watch: { moveKcal: 600 } });
  const b = L.burn(st, '2026-11-09');
  assert.equal(b.total, Math.round(L.bmr(profile, 110) + 600 + 200));
  assert.equal(b.estimated, false);
  assert.equal(L.balance(st, '2026-11-09'), 2000 - b.total);
  st.days['2026-11-10'] = day({ foods: [{ kcal: 1800, p: 100 }] });
  assert.equal(L.burn(st, '2026-11-10').estimated, true);
  assert.equal(L.burn(fresh(), '2026-11-09'), null);
});

test('week summary, completion and automatic holds', () => {
  const st = fresh();
  st.days['2026-11-11'] = day({ foods: [{ kcal: 2200, p: 140 }], water: [{ ml: 2500 }], workouts: [{ id: 'walks', min: 20, rpe: 4 }, { id: 'strHome', min: 22, rpe: 7 }], watch: { steps: 8000, exMin: 35, moveKcal: 650 } });
  const w = L.weekSummary(st, '2026-11-09');
  assert.equal(w.planned, 7);
  assert.equal(w.done, 2);
  assert.equal(w.strengthDone, 1);
  assert.equal(w.exMin, 42);
  assert.equal(w.load, 20 * 4 + 22 * 7);
  assert.equal(L.weekCompletion(st, '2026-11-09'), 0.42); // 42 of 100 minutes beats 2 of 7 sessions
  // Week 1 at 42% and week 2 empty: both following weeks repeat, so calendar week 3 is still plan week 1.
  const added = L.applyHolds(st, '2026-11-25');
  assert.deepEqual(added, ['2026-11-16', '2026-11-23']);
  assert.equal(L.planPosition(profile.startDate, '2026-11-25', st.repeats).week, 1);
  assert.deepEqual(L.applyHolds(st, '2026-11-25'), []); // already checked
  // A week at target moves on, and a skipped hold is not added back.
  const ok = fresh();
  for (let i = 0; i < 5; i++) ok.days[L.addDays('2026-11-09', i)] = day({ workouts: [{ id: 'walks', min: 20, rpe: 4 }] });
  assert.deepEqual(L.applyHolds(ok, '2026-11-17'), []);
  const skip = fresh();
  skip.skipHolds = ['2026-11-16'];
  assert.deepEqual(L.applyHolds(skip, '2026-11-17'), []);
});

test('weekly counters for sugary drinks and purine-heavy foods', () => {
  const st = fresh();
  st.days['2026-11-10'] = day({ foods: [{ kcal: 250, p: 3, tags: ['sugary'] }, { kcal: 600, p: 35, tags: ['purine'] }, { kcal: 140, p: 0, tags: ['sugary'] }] });
  assert.deepEqual(L.weekCounts(st, '2026-11-09'), { sugary: 2, purine: 1 });
});

test('weight trend, predicted weight and real maintenance', () => {
  const st = fresh();
  st.days['2026-11-09'] = day({ weight: 110 });
  for (let i = 0; i < 7; i++) {
    const d = L.addDays('2026-11-09', i);
    st.days[d] = { ...(st.days[d] || L.emptyDay()), foods: [{ kcal: 2400, p: 130 }], watch: { moveKcal: 600 } };
  }
  st.days['2026-10-01'] = day({ weight: 125 });
  const pred = L.predictedWeights(st, '2026-11-16', '2026-11-02');
  delete st.days['2026-10-01'];
  assert.equal(pred.weeks, 1);
  const last = pred.points.at(-1)[1];
  assert.ok(last < 110 && last > 109, String(last));
  assert.deepEqual(L.goalPath(profile).map(([d]) => d), ['2026-11-09', '2027-02-01', '2027-05-10', '2027-11-08']);
  st.days['2026-11-16'] = day({ weight: 109 });
  assert.deepEqual(L.weightTrend(st).map(([, v]) => v), [110, 109.5]);

  // Maintenance: 28 logged days at 2,300 kcal while losing 0.5 kg a week works out at about 2,850.
  const m = fresh();
  const today = '2027-01-11';
  for (let i = 28; i >= 1; i--) {
    const d = L.addDays(today, -i);
    m.days[d] = day({ foods: [{ kcal: 2300, p: 140 }], watch: { moveKcal: 600 } });
  }
  for (let k = 0; k < 4; k++) {
    const d = L.addDays(today, -28 + k * 7);
    m.days[d].weight = 108 - 0.5 * k;
  }
  const r = L.maintenance(m, today);
  assert.equal(r.ready, true);
  assert.ok(Math.abs(r.maintenance - 2850) <= 5, String(r.maintenance));
  assert.equal(r.suggested, 2300);
  assert.equal(L.maintenance(fresh(), '2026-11-20').ready, false);
});

test('strength: rep ranges, last time and the next step', () => {
  assert.deepEqual(L.repSpec('8 to 10'), { top: 10, unit: 'reps' });
  assert.deepEqual(L.repSpec('30 seconds'), { top: 30, unit: 's' });
  assert.deepEqual(L.repSpec('40 m'), { top: 40, unit: 'm' });
  const st = fresh();
  st.days['2026-11-11'] = day({ workouts: [{ id: 'gymA', min: 40, rpe: 7, ex: [{ id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3 }] }] });
  const last = L.lastStrength(st, 'legpress', '2026-11-18');
  assert.equal(last.kg, 60);
  assert.equal(L.lastStrength(st, 'legpress', '2026-11-11'), null);
  assert.match(L.strengthHint(last, '10'), /Try 63 kg/);
  assert.match(L.strengthHint({ ...last, reps: 8 }, '10'), /Stay at 60 kg/);
  assert.match(L.strengthHint({ kg: null, reps: 12, sets: 2, planned: 2 }, '12'), /Add 2 reps/);
});

test('health checks: lab status and blood pressure', () => {
  assert.equal(L.labStatus('fbs', 104), 'above target');
  assert.equal(L.labStatus('a1c', 5.5), 'on target');
  assert.equal(L.labStatus('hdl', 50), 'below target');
  assert.equal(L.labStatus('uric', 7.3), 'above target');
  const bp = [
    { date: '2026-11-10', t: '07:00', sys: 128, dia: 82 }, { date: '2026-11-11', t: '07:00', sys: 132, dia: 84 },
    { date: '2026-11-02', t: '09:00', sys: 150, dia: 95, clinic: true },
  ];
  const s = L.bpSummary(bp, '2026-11-12');
  assert.deepEqual([s.n, s.sys, s.dia, s.level, s.crisis], [2, 130, 83, 'raised', false]);
  assert.equal(L.bpSummary(bp, '2026-12-30'), null);
});

test('Watch numbers pasted from a Shortcut', () => {
  assert.equal(L.parseNum('8,123'), 8123);
  assert.equal(L.parseNum('8.123'), 8123);
  assert.equal(L.parseNum('8 123'), 8123);
  assert.equal(L.parseNum('640.5'), 640.5);
  assert.equal(L.parseNum('1,196.4'), 1196.4);
  assert.equal(L.parseNum('640,5'), 640.5);
  const a = L.parseWatchPaste('{"steps":8123,"move":"640 kcal","exercise":"32 min"}', '2026-11-12');
  assert.deepEqual(a, { kind: 'day', date: '2026-11-12', watch: { steps: 8123, moveKcal: 640, exMin: 32 } });
  const b = L.parseWatchPaste('date: 2026-11-10\nSteps: 9,876\nActive Energy: 701\nExercise Minutes: 41', '2026-11-12');
  assert.deepEqual(b, { kind: 'day', date: '2026-11-10', watch: { steps: 9876, moveKcal: 701, exMin: 41 } });
  assert.equal(L.parseWatchPaste('{"kind":"steady-watch","days":{}}', '2026-11-12').kind, 'file');
  assert.throws(() => L.parseWatchPaste('hello', '2026-11-12'));
  const st = fresh();
  st.days['2026-11-12'] = day({ foods: [{ kcal: 2100, p: 140, fib: 31 }], water: [{ ml: 500 }, { ml: 750 }] });
  assert.deepEqual(L.healthTotals(st, '2026-11-12'), { date: '2026-11-12', energy: 2100, protein: 140, water: 1250, fibre: 31 });
});

test('reminders export as a calendar file', () => {
  const { text, count } = L.icsFile({ backup: { on: false }, 'walk-lunch': { on: true, time: '12:45' } }, '2026-11-09', new Date(Date.UTC(2026, 10, 2, 4, 5)));
  assert.equal(count, REMINDERS.length - 1);
  assert.ok(text.startsWith('BEGIN:VCALENDAR\r\n') && text.endsWith('END:VCALENDAR\r\n'));
  assert.match(text, /DTSTART:20261109T124500\r\n/);
  assert.match(text, /DTSTART:20261115T100000\r\nDURATION:PT10M\r\nRRULE:FREQ=WEEKLY;BYDAY=SU/);
  assert.match(text, /SUMMARY:Steady: log today \(food\\, water and Watch numbers\)/);
  assert.ok(!text.includes('export a backup'));
});

test('passcode backups round-trip and reject a wrong passcode', async () => {
  const file = await L.encryptJson({ v: 1, days: { '2026-11-09': {} } }, 'correct horse', 1000);
  assert.equal(file.kind, 'steady-encrypted');
  assert.ok(!JSON.stringify(file).includes('2026-11-09'));
  assert.deepEqual(await L.decryptJson(file, 'correct horse'), { v: 1, days: { '2026-11-09': {} } });
  await assert.rejects(L.decryptJson(file, 'wrong'), /Wrong passcode/);
});

test('backup import keeps known fields only', () => {
  assert.throws(() => L.cleanBackup({ v: 2, days: {} }));
  assert.throws(() => L.cleanBackup({ v: 1, days: {}, profile: { age: 40 } }));
  const out = L.cleanBackup({
    v: 1, profile, custom: [{ id: 'x', name: 'Soup', kcal: 300, p: 10, evil: 1, per: '100g', tags: ['sugary', 'bad'] }],
    shopping: { '2026-11-09': { eggs: true, nope: true }, flat: true },
    swaps: { '2026-11-09': { dinner: 'salmon', lunch: 'nonsense', bad: 'oats' } },
    repeats: ['2026-11-16', 'x'], labs: [{ date: '2026-10-15', fbs: 108, ldl: 9999 }], bp: [{ date: '2026-11-10', sys: 130, dia: 80, t: '7am' }],
    settings: { hotMonths: [3, 4, 13], loudBeep: 'yes', reminders: { 'walk-lunch': { on: false, time: 'noon' } } },
    days: { '2026-11-09': { foods: [{ name: '<img src=x onerror=alert(1)>', kcal: '900', p: 10, tags: ['purine'] }], water: [{ ml: 500 }], weight: 999, watch: { steps: 5000, moveKcal: -4 }, workouts: [{ id: 'gymA', min: 40, ex: [{ id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3, x: 1 }] }] }, nope: {} },
  });
  const d = out.days['2026-11-09'];
  assert.equal(d.foods[0].kcal, 0);
  assert.deepEqual(d.foods[0].tags, ['purine']);
  assert.equal(d.weight, undefined);
  assert.equal(d.watch.steps, 5000);
  assert.equal(d.watch.moveKcal, null);
  assert.deepEqual(d.workouts[0].ex[0], { id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3 });
  assert.equal(out.days.nope, undefined);
  assert.deepEqual(out.custom[0], { id: 'x', name: 'Soup', kcal: 300, p: 10, fib: 0, per: '100g', tags: ['sugary'] });
  assert.deepEqual(out.shopping, { '2026-11-09': { eggs: true } });
  assert.deepEqual(out.swaps, { '2026-11-09': { dinner: 'salmon' } });
  assert.deepEqual(out.repeats, ['2026-11-16']);
  assert.equal(out.labs[0].fbs, 108);
  assert.equal(out.labs[0].ldl, null);
  assert.equal(out.bp[0].t, '');
  assert.deepEqual(out.settings, { hotMonths: [3, 4], loudBeep: false, reminders: { 'walk-lunch': { on: false, time: '13:00' } } });
  assert.equal(L.esc(d.foods[0].name), '&lt;img src=x onerror=alert(1)&gt;');
});

test('Watch and health imports merge, typed values win', () => {
  const st = fresh();
  st.days['2026-11-09'] = day({ watch: { src: 'manual', steps: 9000, moveKcal: null, exMin: null } });
  const n = L.mergeWatch(st, { kind: 'steady-watch', days: { '2026-11-09': { steps: 7000, moveKcal: 640, exMin: 31 }, '2026-11-10': { steps: 6000, moveKcal: 500, exMin: 12 } } });
  assert.equal(n, 2);
  assert.equal(st.days['2026-11-09'].watch.steps, 9000);
  assert.equal(st.days['2026-11-09'].watch.moveKcal, 640);
  assert.equal(st.days['2026-11-10'].watch.src, 'import');
  assert.throws(() => L.mergeWatch(st, { v: 1, days: {} }));
  const h = L.mergeHealth(st, {
    kind: 'steady-health', labs: [{ date: '2026-10-15', fbs: 108, uric: 7.4 }], bp: [{ date: '2026-10-15', t: '09:00', sys: 124, dia: 78, clinic: true }],
    waist: [{ date: '2026-11-09', cm: 108 }], weights: { '2026-10-15': 110.4, '2026-11-09': 200 },
  });
  assert.equal(h, 5);
  assert.equal(st.labs[0].uric, 7.4);
  assert.equal(st.bp[0].clinic, true);
  assert.equal(st.days['2026-10-15'].weight, 110.4);
  assert.equal(L.mergeHealth(st, { kind: 'steady-health', bp: [{ date: '2026-10-15', t: '09:00', sys: 124, dia: 78, clinic: true }] }), 0);
  assert.throws(() => L.mergeHealth(st, { kind: 'other' }));
});
