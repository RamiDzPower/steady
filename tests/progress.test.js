import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { pdfText, pdfBytes, summaryPdf, text, line, rect } from '../pdf.js';

// Fictional numbers only.
const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = (p = {}) => ({ v: 1, profile: { ...profile, ...p }, days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const put = (st, d, extra) => { st.days[d] = { ...L.emptyDay(), ...st.days[d], ...extra }; };
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} is not about ${b}`);

test('smooth moves 1 - 0.9^days of the way to each reading', () => {
  assert.deepEqual(L.smooth([]), []);
  assert.deepEqual(L.smooth([['2026-11-09', 90]]), [['2026-11-09', 90]]);
  const [, b] = L.smooth([['2026-11-09', 90], ['2026-11-16', 89]]);
  assert.equal(b[0], '2026-11-16');
  near(b[1], 90 - (1 - 0.9 ** 7)); // 89.478
  near(L.smooth([['2026-11-09', 90], ['2027-01-08', 80]])[1][1], 80.018); // two months on, it has nearly caught up
  const st = fresh();
  put(st, '2026-11-16', { weight: 89 });
  put(st, '2026-11-09', { weight: 90 });
  assert.deepEqual(L.weightTrend(st), L.smooth([['2026-11-09', 90], ['2026-11-16', 89]]));
});

test('weightRate needs 3 weigh-ins over 14 days in the last 28', () => {
  const st = fresh();
  put(st, '2026-11-09', { weight: 90 });
  put(st, '2026-11-16', { weight: 89 });
  assert.deepEqual(L.weightRate(st, '2026-11-20'), { kgPerWeek: null, from: '2026-10-23', weighIns: 2 });
  put(st, '2026-11-19', { weight: 88.5 });
  assert.equal(L.weightRate(st, '2026-11-20').kgPerWeek, null); // 3 weigh-ins but only 10 days apart
  delete st.days['2026-11-19'];
  put(st, '2026-11-23', { weight: 88 });
  // Trend 90, 89.478, 88.707: a straight line through three evenly spaced points runs from the first to the last.
  const r = L.weightRate(st, '2026-11-23');
  assert.equal(r.weighIns, 3);
  near(r.kgPerWeek, ((L.weightTrend(st).at(-1)[1] - 90) / 14) * 7);
  near(r.kgPerWeek, -0.6465);
  assert.equal(L.weightRate(st, '2026-12-14').kgPerWeek, null); // the first weigh-ins have aged out of the window
  const flat = fresh();
  for (const d of ['2026-11-09', '2026-11-16', '2026-11-23']) put(flat, d, { weight: 90 });
  assert.equal(L.weightRate(flat, '2026-11-23').kgPerWeek, 0);
});

test('milestones and the goal never go under a BMI of 18.5', () => {
  near(L.minWeight(175), 56.656);
  assert.deepEqual(L.goalPath(profile).slice(1).map(([, v]) => +v.toFixed(2)), [85.5, 82.8, 81]);
  const lean = { ...profile, startWeight: 60 };
  assert.deepEqual(L.goalPath(lean).slice(1).map(([, v]) => +v.toFixed(2)), [57, 56.66, 56.66]);
  assert.deepEqual(L.goalPath({ ...profile, startWeight: 50 }).slice(1).map(([, v]) => v), [50, 50, 50]); // never above the start
  assert.equal(L.goalFor(profile), 81);
  assert.equal(L.goalFor({ ...profile, goalWeight: 75 }), 75);
  near(L.goalFor({ ...profile, goalWeight: 50 }), 56.656);
  near(L.goalFor(lean), 56.656);
  // Two milestones clamped to the same weight show once, named by the share they really are.
  const titles = L.milestones(fresh({ startWeight: 60 }), '2026-11-10').filter((m) => m.id.startsWith('weight')).map((m) => m.title);
  assert.deepEqual(titles, ['5% lighter: 57.0 kg', '6% lighter: 56.7 kg']);
});

test('ETA: days, then weeks, then months, only when the trend falls fast enough', () => {
  const eta = (kg, rate, target, today = '2026-11-30') => L.etaDays(['2026-11-30', kg], rate, target, today);
  assert.equal(eta(85, -0.1, 81), 40);
  assert.equal(eta(85, -0.3, 81), 14);
  assert.equal(eta(80.9, -0.1, 81), 0);
  assert.equal(eta(81, null, 81), 0);
  assert.equal(eta(85, null, 81), null);
  assert.equal(eta(85, -0.005, 81), null); // too slow to give a date
  assert.equal(eta(85, -0.0051, 81), 785);
  assert.equal(eta(85, 0.05, 81), null); // heading away
  // Counted from today: the trend carries on at the rate after the last weigh-in, so 10 days later 30 are left, not 40.
  assert.equal(eta(85, -0.1, 81, '2026-12-10'), 30);
  // Past the target on that line but with no weigh-in there yet: 1 day, never a date already gone.
  assert.equal(eta(85, -0.1, 81, '2027-01-20'), 1);
  assert.equal(eta(85, null, 81, '2026-12-10'), null);
  // Reached means reached as shown, to 0.1 kg: 81.04 reads 81.0.
  assert.equal(eta(81.04, null, 81), 0);
  assert.equal(eta(81.06, -0.1, 81), 1);
  assert.equal(L.durationText(1), '1 day');
  assert.equal(L.durationText(27), '27 days');
  assert.equal(L.durationText(28), '4 weeks');
  assert.equal(L.durationText(63), '9 weeks');
  assert.equal(L.durationText(83), '12 weeks');
  assert.equal(L.durationText(84), '3 months');
  assert.equal(L.durationText(365), '12 months');
});

test('the weigh-in callout: Mondays, or a week after the last weigh-in, until this week has one', () => {
  const st = fresh();
  assert.equal(L.weighInDue(st, '2026-11-02'), true); // a Monday, even before the plan
  assert.equal(L.weighInDue(st, '2026-11-04'), false); // before the plan, only on Mondays
  assert.equal(L.weighInDue(st, '2026-11-10'), true); // the plan has started and there is no weigh-in yet
  put(st, '2026-11-09', { weight: 90 });
  assert.equal(L.weighInDue(st, '2026-11-09'), false);
  assert.equal(L.weighInDue(st, '2026-11-15'), false);
  assert.equal(L.weighInDue(st, '2026-11-16'), true);
  put(st, '2026-11-20', { weight: 89.4 });
  assert.equal(L.weighInDue(st, '2026-11-23'), true); // Monday again
  assert.equal(L.weighInDue(st, '2026-11-26'), false); // only 6 days since the Friday weigh-in
  assert.equal(L.weighInDue(st, '2026-11-27'), true);
});

test('vo2Readings come from the Watch days that have one, oldest first', () => {
  const st = fresh();
  put(st, '2026-11-20', { watch: { vo2: 36.4, steps: 9000 } });
  put(st, '2026-11-10', { watch: { vo2: 35.1 } });
  put(st, '2026-11-12', { watch: { steps: 8000 } });
  put(st, '2026-11-14', { weight: 90 });
  assert.deepEqual(L.vo2Readings(st), [['2026-11-10', 35.1], ['2026-11-20', 36.4]]);
  const back = L.cleanBackup(st);
  assert.deepEqual(L.vo2Readings(back), [['2026-11-10', 35.1], ['2026-11-20', 36.4]]);
});

test('the goal weight and VO2max target survive a backup restore', () => {
  const out = L.cleanBackup({ v: 1, days: {}, profile: { ...profile, goalWeight: 80.5, vo2Target: 40 } });
  assert.equal(out.profile.goalWeight, 80.5);
  assert.equal(out.profile.vo2Target, 40);
  const bad = L.cleanBackup({ v: 1, days: {}, profile: { ...profile, goalWeight: 999, vo2Target: '40' } });
  assert.equal(bad.profile.goalWeight, null);
  assert.equal(bad.profile.vo2Target, null);
});

test('milestones: weight on the trend, habits by the day they were reached', () => {
  const st = fresh();
  // Block 1 asks for 100 exercise minutes a week, so 50 is half the plan.
  put(st, '2026-11-09', { weight: 90 });
  put(st, '2026-11-11', { watch: { exMin: 60 }, workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3 }] }] });
  put(st, '2026-11-16', { weight: 85 });
  for (let i = 0; i < 5; i++) put(st, L.addDays('2026-11-16', i), { foods: [{ kcal: 2000, p: 120 }] });
  put(st, '2026-11-17', { watch: { exMin: 120 } });
  put(st, '2026-11-18', { workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3 }] }] });
  put(st, '2026-11-23', { weight: 84 });
  put(st, '2026-11-25', { watch: { exMin: 50 }, workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 62.5, reps: 10, sets: 3, planned: 3 }] }] });
  put(st, '2026-11-30', { weight: 83 });
  const today = '2026-12-01';
  const ms = L.milestones(st, today);
  const by = Object.fromEntries(ms.map((m) => [m.id, m]));
  assert.deepEqual(ms.map((m) => m.id), ['weight-1', 'weight-2', 'weight-3', 'strength', 'food', 'full-week', 'weeks-4', 'weeks-8', 'weeks-12', 'heavier']);
  for (const m of ms) assert.deepEqual(Object.keys(m).slice(0, 5), ['id', 'title', 'detail', 'done', 'date']);
  // The trend reaches 85.5 kg with the fourth weigh-in, not the 85 kg reading a week after the start.
  assert.deepEqual([by['weight-1'].title, by['weight-1'].done, by['weight-1'].date], ['5% lighter: 85.5 kg', true, '2026-11-30']);
  assert.deepEqual([by['weight-2'].title, by['weight-2'].done, by['weight-2'].detail], ['8% lighter: 82.8 kg', false, '1.5 kg to go']);
  assert.equal(by['weight-3'].title, '10% lighter: 81.0 kg');
  assert.equal(by.strength.date, '2026-11-11');
  assert.equal(by.food.date, '2026-11-20');
  assert.equal(by['full-week'].date, '2026-11-17');
  assert.equal(by.heavier.date, '2026-11-25');
  // Three full weeks at half the plan; this week has not got there yet, so it neither counts nor breaks the run.
  assert.equal(L.weekStreak(st, today), 3);
  assert.deepEqual([by['weeks-4'].done, by['weeks-4'].detail], [false, '1 more week at half the plan or more']);
  assert.equal(by['weeks-8'].detail, '5 more weeks at half the plan or more');
  put(st, '2026-12-01', { watch: { exMin: 55 } });
  assert.equal(L.weekStreak(st, today), 4);
  assert.equal(L.milestones(st, today).find((m) => m.id === 'weeks-4').date, '2026-12-01');
  // A finished week under half breaks the run.
  assert.equal(L.weekStreak(st, '2026-12-14'), 0);
  put(st, '2026-12-14', { watch: { exMin: 90 } }); // block 2 asks for 150, so 75 is half
  assert.equal(L.weekStreak(st, '2026-12-14'), 1);
  // A heavier weight typed in for an exercise that was then skipped is not a heavier lift.
  const skipped = fresh();
  put(skipped, '2026-11-11', { workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 60, reps: 10, sets: 3, planned: 3 }] }] });
  put(skipped, '2026-11-13', { workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 65, reps: 10, sets: 0, planned: 3 }] }] });
  assert.equal(L.milestones(skipped, '2026-11-14').find((m) => m.id === 'heavier').done, false);
  put(skipped, '2026-11-14', { workouts: [{ id: 'strHome', min: 20, rpe: 7, ex: [{ id: 'legpress', kg: 62.5, reps: 10, sets: 1, planned: 3 }] }] });
  assert.equal(L.milestones(skipped, '2026-11-14').find((m) => m.id === 'heavier').date, '2026-11-14');
});

test('a weight milestone is done once the trend reads its weight, so none reads 0.0 kg to go', () => {
  const st = fresh();
  put(st, '2026-11-09', { weight: 90 });
  put(st, '2026-11-16', { weight: 81.43 }); // the trend lands on 85.53, which shows as 85.5
  const m = L.milestones(st, '2026-11-17').find((x) => x.id === 'weight-1');
  assert.deepEqual([m.title, m.done, m.date, m.detail], ['5% lighter: 85.5 kg', true, '2026-11-16', '']);
  put(st, '2026-11-16', { weight: 81.5 }); // 85.6 on show: 0.1 kg to go, worked out from the two numbers on show
  const n = L.milestones(st, '2026-11-17').find((x) => x.id === 'weight-1');
  near(L.weightTrend(st).at(-1)[1], 85.565);
  assert.deepEqual([n.done, n.detail], [false, '0.1 kg to go']);
});

test('milestones before the plan starts are all still to come', () => {
  const st = fresh();
  const ms = L.milestones(st, '2026-11-04');
  assert.ok(ms.every((m) => !m.done && m.date === null && m.detail));
  assert.equal(ms.find((m) => m.id === 'food').detail, 'Counts from the start of the plan');
  assert.equal(ms.find((m) => m.id === 'weight-1').detail, '4.5 kg to go');
  assert.equal(L.weekStreak(st, '2026-11-04'), 0);
});

// ---- Weekly insights ----
const ex = (exMin, ml, kcal, p) => ({ watch: { exMin }, water: ml ? [{ ml }] : [], foods: kcal ? [{ kcal, p }] : [] });

test('insights compare water and food on training and rest days', () => {
  const st = fresh();
  // 45 minutes lifts the water target to 3,250 ml; protein 40 g is under the target and 200 g over it.
  ['2026-11-09', '2026-11-10', '2026-11-12'].forEach((d) => put(st, d, ex(45, 2000, 2200, 40)));
  put(st, '2026-11-11', ex(45, 3500, 2200, 40));
  put(st, '2026-11-13', ex(10, 3000, 2500, 200));
  put(st, '2026-11-14', ex(0, 3000, 2500, 200));
  put(st, '2026-11-15', { foods: [{ kcal: 4000, p: 40 }] }); // no Watch import and no session: neither training nor rest
  assert.equal(L.waterTarget(st.days['2026-11-09'], 2500), 3250);
  assert.deepEqual(L.insights(st, '2026-11-09', '2026-11-15'), [
    'Water fell short on 3 of 4 training days.',
    'You drank about 0.6 L more on rest days than on training days.',
    'You ate about 300 kcal more on rest days than on training days.',
    'Protein was under the target on 5 of 7 logged days.',
  ]);
});

test('insights: a logged session makes a training day, and small gaps read as the same', () => {
  const st = fresh();
  put(st, '2026-11-16', { workouts: [{ id: 'strHome', min: 20, rpe: 7 }], water: [{ ml: 3000 }], foods: [{ kcal: 2200, p: 200 }] });
  put(st, '2026-11-17', ex(40, 3500, 2250, 200));
  put(st, '2026-11-18', { water: [{ ml: 500 }], foods: [{ kcal: 2300, p: 200 }] }); // nothing about effort: left out
  put(st, '2026-11-19', ex(5, 3100, 2300, 200));
  put(st, '2026-11-20', ex(12, 3200, 2280, 200)); // 3,250 ml against 3,150 ml: under a glass apart
  assert.deepEqual(L.insights(st, '2026-11-16', '2026-11-22'), [
    'You met the water target on both training days.',
    'You drank about the same on training and rest days.',
    'You ate about the same on training and rest days.',
    'You met the protein target on all 5 logged days.',
  ]);
  put(st, '2026-11-21', ex(50, 4000, 3600, 40));
  put(st, '2026-11-22', ex(60, 2000, 3500, 40));
  const out = L.insights(st, '2026-11-16', '2026-11-22');
  assert.equal(out[0], 'Water fell short on 1 of 4 training days.');
  assert.equal(out[2], 'You ate about 600 kcal more on training days than on rest days.'); // 2,887.5 against 2,290, to the nearest 50
  assert.equal(out[3], 'Protein was under the target on 2 of 7 logged days.');
  put(st, '2026-11-19', ex(5, 3100, 1200, 200));
  put(st, '2026-11-20', ex(12, 3200, 1300, 200));
  assert.equal(L.insights(st, '2026-11-16', '2026-11-22')[2], 'You ate about 1,650 kcal more on training days than on rest days.');
});

test('insights: post-meal walks alone do not make a training day', () => {
  const st = fresh();
  const walk = { id: 'walks', min: 10, rpe: 3 };
  // A 10-minute walk logged on each weekday, 12 Watch minutes every day: a week of rest days, not weekdays against the weekend.
  for (let i = 0; i < 7; i++) put(st, L.addDays('2026-11-16', i), { ...ex(12, 2600, 2000, 200), workouts: i < 5 ? [walk] : [] });
  assert.deepEqual(L.insights(st, '2026-11-16', '2026-11-22'), ['You met the protein target on all 7 logged days.']);
  put(st, '2026-11-16', { workouts: [walk, walk, walk] }); // 30 minutes of walks is a training day by the minutes
  put(st, '2026-11-17', { workouts: [walk, { id: 'strHome', min: 20, rpe: 7 }] }); // and so is a day with a real session
  assert.deepEqual(L.insights(st, '2026-11-16', '2026-11-22'), [
    'Water fell short on both training days.',
    'You drank about the same on training and rest days.',
    'You ate about the same on training and rest days.',
    'You met the protein target on all 7 logged days.',
  ]);
});

test('insights say nothing without 2 days on each side', () => {
  assert.deepEqual(L.insights(fresh(), '2026-11-09', '2026-11-15'), []);
  const st = fresh();
  put(st, '2026-11-09', ex(45, 2000, 2200, 40));
  assert.deepEqual(L.insights(st, '2026-11-09', '2026-11-15'), []);
  put(st, '2026-11-10', ex(45, 2000, 2200, 40));
  put(st, '2026-11-11', ex(5, 3000, 2600, 40));
  // A missing Watch import is not a rest day, so 1 rest day is still too few to compare.
  put(st, '2026-11-12', { water: [{ ml: 3000 }], foods: [{ kcal: 2600, p: 40 }] });
  assert.deepEqual(L.insights(st, '2026-11-09', '2026-11-15'), ['Water fell short on both training days.', 'Protein was under the target on all 4 logged days.']);
  assert.equal(L.effortKnown(st.days['2026-11-12']), false);
  assert.equal(L.effortKnown({ watch: { exMin: 0 } }), true);
  assert.deepEqual(L.insights(st, '2026-11-15', '2026-11-09'), []);
});

// ---- Doctor summary ----
function patient() {
  const st = fresh();
  for (const [d, kg] of [['2026-11-05', 90.5], ['2026-11-09', 90], ['2026-11-16', 89.4], ['2026-11-23', 89], ['2026-11-30', 88.6], ['2026-12-08', 88]]) put(st, d, { weight: kg });
  put(st, '2026-11-09', { watch: { exMin: 25, steps: 8000 }, workouts: [{ id: 'walks', min: 20, rpe: 4 }] });
  put(st, '2026-11-11', { watch: { exMin: 45, steps: 9000 }, workouts: [{ id: 'walks', min: 20, rpe: 4 }, { id: 'strHome', min: 20, rpe: 7 }] });
  put(st, '2026-11-14', { watch: { exMin: 35, steps: 12000 }, workouts: [{ id: 'longwalk', min: 30, rpe: 5 }] });
  put(st, '2026-11-10', { foods: [{ kcal: 2000, p: 100 }] });
  put(st, '2026-11-12', { foods: [{ kcal: 2400, p: 120 }] });
  put(st, '2026-11-24', { foods: [{ kcal: 2200, p: 110 }] });
  st.bp = [
    { date: '2026-11-01', t: '07:00', sys: 150, dia: 95, clinic: false }, // before the period
    { date: '2026-11-10', t: '07:00', sys: 128, dia: 82, clinic: false },
    { date: '2026-11-20', t: '07:00', sys: 136, dia: 86, clinic: false },
    { date: '2026-11-20', t: '20:00', sys: 136, dia: 88, clinic: false },
    { date: '2026-12-01', t: '07:00', sys: 124, dia: 80, clinic: false },
    { date: '2026-12-02', t: '', sys: 160, dia: 100, clinic: true }, // clinic readings are left out
    { date: '2026-12-05', t: '07:00', sys: 126, dia: 78, clinic: false },
  ];
  st.labs = [ // out of order, as a restored backup can be
    { date: '2026-11-20', note: '', fbs: 104, a1c: null, uric: 6.8, ldl: 120, hdl: 50, tg: 140 },
    { date: '2026-12-20', note: '', fbs: 95, a1c: 5.4, uric: 6, ldl: 90, hdl: 60, tg: 100 }, // after the period
    { date: '2026-05-01', note: '', fbs: 110, a1c: 5.9, uric: 7.6, ldl: 130, hdl: 45, tg: 160 },
  ];
  st.waist = [{ date: '2026-10-20', cm: 104 }, { date: '2026-11-20', cm: 102 }, { date: '2026-12-04', cm: 101.5 }];
  return st;
}

test('doctorSummary: the period starts no earlier than the plan, and weight comes from the trend', () => {
  const st = patient();
  const s = L.doctorSummary(st, '2026-11-02', '2026-12-06');
  assert.deepEqual([s.from, s.to, s.days], ['2026-11-09', '2026-12-06', 28]);
  const tr = L.weightTrend(st);
  assert.deepEqual(s.weight.start, tr[1]); // the trend on the first day, which already counts the reading before the plan
  assert.deepEqual(s.weight.end, tr[4]); // the last weigh-in up to the end; the one after is left out
  near(s.weight.change, -1.344);
  assert.equal(s.weight.kgPerWeek, L.weightRate(st, '2026-12-06').kgPerWeek);
  assert.deepEqual(s.weight.last, ['2026-11-30', 88.6]);
  assert.deepEqual(s.weight.weighIns.map(([d]) => d), ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(s.weight.trend, tr.slice(1, 5));
  // Starting between weigh-ins, the chart opens on the first day at the trend's value then.
  const mid = L.doctorSummary(st, '2026-11-12', '2026-12-06');
  assert.deepEqual(mid.weight.trend[0], ['2026-11-12', tr[1][1]]);
  assert.deepEqual(mid.weight.start, ['2026-11-12', tr[1][1]]); // the page names the period's first day, not the weigh-in before it
  assert.ok(latin(summaryPdf(mid, '2026-12-07')).includes(`(Trend: ${tr[1][1].toFixed(1)} kg on 12 Nov 2026 and`));
  assert.equal(L.doctorSummary(fresh(), '2026-11-09', '2026-12-06').weight, null);
});

test('a backup keeps the newest 2000 blood pressure readings', () => {
  const bp = [];
  for (let d = '2025-01-01'; bp.length < 2100; d = L.addDays(d, 1)) for (const t of ['07:00', '20:00']) bp.push({ date: d, t, sys: 125, dia: 80, pulse: 70, clinic: false });
  const kept = L.cleanBackup({ v: 1, days: {}, bp }).bp;
  assert.equal(kept.length, 2000);
  assert.deepEqual([kept[0], kept.at(-1)].map((r) => `${r.date} ${r.t}`), [`${bp[100].date} ${bp[100].t}`, `${bp.at(-1).date} ${bp.at(-1).t}`]);
});

test('doctorSummary: home blood pressure, blood tests and waist', () => {
  const s = L.doctorSummary(patient(), '2026-11-02', '2026-12-06');
  assert.deepEqual(s.bp.week, { n: 2, sys: 125, dia: 79, level: 'elevated', crisis: false });
  assert.deepEqual([s.bp.n, s.bp.sys, s.bp.dia], [5, 130, 83]);
  assert.deepEqual([s.bp.high.date, s.bp.high.sys, s.bp.high.dia], ['2026-11-20', 136, 88]);
  assert.deepEqual(s.labs.map((l) => l.name), ['Fasting glucose', 'HbA1c', 'Uric acid', 'LDL', 'HDL', 'Triglycerides']);
  const [fbs, a1c, uric, , hdl] = s.labs;
  assert.deepEqual(fbs, { name: 'Fasting glucose', unit: 'mg/dL', target: 'under 100', latest: ['2026-11-20', 104], previous: ['2026-05-01', 110], status: 'above target' });
  assert.deepEqual([a1c.latest, a1c.previous, a1c.status], [['2026-05-01', 5.9], null, 'above target']);
  assert.deepEqual([uric.latest[1], uric.previous[1], uric.status], [6.8, 7.6, 'on target']);
  assert.deepEqual([hdl.target, hdl.status], ['55 or more', 'below target']);
  assert.deepEqual(s.waist, { latest: ['2026-12-04', 101.5], since: '2026-10-20', change: -2.5 });
  assert.equal(L.doctorSummary(fresh(), '2026-11-09', '2026-12-06').waist, null);
});

test('doctorSummary: training and food over the whole period', () => {
  const st = patient();
  const s = L.doctorSummary(st, '2026-11-02', '2026-12-06');
  const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((m) => L.weekSummary(st, m));
  assert.equal(s.training.planned, weeks.reduce((t, w) => t + w.planned, 0));
  assert.deepEqual([s.training.done, s.training.planned], [4, 28]);
  // Only 3 of the 28 days have Watch numbers or a session: 25 + 45 + 35 minutes over 3 days.
  assert.deepEqual([s.training.exMinPerWeek, s.training.exDays], [245, 3]);
  assert.equal(s.training.stepsAvg, 9667);
  const tg = (d) => L.targets(st.profile, L.weightOn(st, d));
  assert.deepEqual(s.food, {
    daysLogged: 3, kcal: 2200, protein: 110,
    kcalTarget: Math.round((tg('2026-11-10').kcal * 2 + tg('2026-11-24').kcal) / 3), proteinTarget: Math.round((tg('2026-11-10').protein * 2 + tg('2026-11-24').protein) / 3),
  });
  // Before the plan starts there is no period to count.
  const early = L.doctorSummary(st, '2026-11-09', '2026-11-06');
  assert.deepEqual([early.days, early.training.planned, early.training.exMinPerWeek, early.food.daysLogged, early.food.kcalTarget], [0, 0, null, 0, null]);
});

// ---- PDF ----
const latin = (bytes) => String.fromCharCode(...bytes);

test('doctorSummary: exercise a week counts only the days that say something about it', () => {
  const st = fresh({ startDate: '2026-05-04' });
  const exercise = (from, to, f) => { for (let d = from; d <= to; d = L.addDays(d, 1)) { const v = f(d); if (v) put(st, d, v); } };
  const weekday = (d) => L.weekday(d) < 5;
  // Watch numbers for the last 4 weeks only: 30 minutes on weekdays and steps every day, so 150 minutes a week.
  exercise('2026-10-06', '2026-11-02', (d) => ({ watch: { exMin: weekday(d) ? 30 : 0, steps: 8000 } }));
  const t = (days) => L.doctorSummary(st, L.addDays('2026-11-02', 1 - days), '2026-11-02').training;
  assert.deepEqual([t(28).exMinPerWeek, t(28).exDays], [150, 28]);
  assert.deepEqual([t(182).exMinPerWeek, t(182).exDays], [150, 28]); // the months before the paste are not rest
  // Rest days that came with steps but no exercise minutes count as rest: 30 minutes on 5 of 7 days.
  for (const d of Object.keys(st.days)) if (!weekday(d)) delete st.days[d].watch.exMin;
  assert.equal(t(28).exMinPerWeek, 150);
  // Without the Watch, a week with logged sessions counts all its days: 3 sessions of 40 minutes are 120 a week.
  const noWatch = fresh({ startDate: '2026-05-04' });
  for (let d = '2026-08-03'; d <= '2026-11-01'; d = L.addDays(d, 1)) if ([0, 2, 4].includes(L.weekday(d))) put(noWatch, d, { workouts: [{ id: 'cardio', min: 40, rpe: 5 }] });
  const nw = L.doctorSummary(noWatch, '2026-08-03', '2026-11-01').training;
  assert.deepEqual([nw.exMinPerWeek, nw.exDays], [120, 91]);
  assert.deepEqual([L.doctorSummary(fresh(), '2026-11-09', '2026-12-06').training.exMinPerWeek, L.doctorSummary(fresh(), '2026-11-09', '2026-12-06').training.exDays], [null, 0]);
});

test('pdfText maps what WinAnsi cannot show and escapes the string syntax', () => {
  assert.equal(pdfText('a (b) \\ c'), 'a \\(b\\) \\\\ c');
  assert.equal(pdfText('\u22125 kg, \u2018x\u2019 \u201cy\u201d 3\u00d72'), '-5 kg, \'x\' "y" 3x2');
  assert.equal(pdfText('caf\u00e9 \u0e44\u0e17\u0e22 \u{1f600}'), 'caf\u00e9 ??? ?');
  assert.equal(pdfText('a\tb\nc'), 'a?b?c');
  assert.equal(text(50, 700.123, 'A (1)', 9, true), 'BT 0 g /F2 9 Tf 50 700.12 Td (A \\(1\\)) Tj ET\n');
  assert.equal(line([[1, 2], [3, 4], [5, 6]], 1.2, 0.5), '0.5 G 1.2 w 1 2 m 3 4 l 5 6 l S\n');
  assert.equal(rect(1, 2, 3, 4), '0 g 1 2 3 4 re f\n');
});

test('pdfBytes writes a PDF 1.4 file whose xref offsets point at each object', () => {
  const pages = [text(50, 800, 'Page one'), text(50, 800, 'Page two (\u00e9)') + line([[50, 700], [545, 700]])];
  const s = latin(pdfBytes(pages, 'Two (pages)'));
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.match(s, /%%EOF\n$/);
  const offsets = [...s.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offsets.length, 9); // catalog, pages, 2 fonts, a page and its content for each page, and the title
  offsets.forEach((at, i) => assert.ok(s.startsWith(`${i + 1} 0 obj\n`, at), `object ${i + 1} is not at ${at}`));
  const xref = Number(s.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(s.startsWith('xref\n0 10\n0000000000 65535 f \n', xref));
  assert.match(s, /trailer\n<< \/Size 10 \/Root 1 0 R \/Info 9 0 R >>/);
  assert.ok(s.includes('9 0 obj\n<< /Title (Two \\(pages\\)) >>') && s.includes('<< /Type /Catalog /Pages 2 0 R /Lang (en-GB) >>'));
  assert.match(s, /\/Kids \[5 0 R 7 0 R\] \/Count 2/);
  for (const m of s.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
    const end = m.index + m[0].length + Number(m[1]);
    assert.equal(s.slice(end, end + 10), '\nendstream');
  }
  assert.ok(s.includes('(Page two \\(\u00e9\\)) Tj'));
  assert.ok(s.includes('/BaseFont /Helvetica /Encoding /WinAnsiEncoding') && s.includes('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding'));
});

test('summaryPdf lays the summary out on one page', () => {
  const s = latin(summaryPdf(L.doctorSummary(patient(), '2026-11-02', '2026-12-06'), '2026-12-07'));
  assert.match(s, /\/Count 1 >>/);
  for (const t of [
    'Health summary from Steady', '9 Nov 2026 to 6 Dec 2026, 28 days. Made 7 Dec 2026.',
    'Trend: 90.3 kg on 9 Nov 2026 and 89.0 kg on 30 Nov 2026, a change of -1.3 kg.', 'Last weigh-in: 88.6 kg on 30 Nov 2026. Weigh-ins in this period: 4.',
    'Last 7 days: 125/79 mmHg on average, from 2 readings.', 'Whole period: 130/83 mmHg on average, from 5 readings. Highest: 136/88 on 20 Nov 2026.',
    '104 mg/dL, 20 Nov 2026', '110, 1 May 2026', 'above target', '101.5 cm on 4 Dec 2026, -2.5 cm since 20 Oct 2026.',
    'Sessions done: 4 of 28 planned, post-meal walks included.', 'Exercise: 245 minutes a week on average, over 3 of 28 days.', 'Steps: 9,667 a day on average.',
    'Food logged on 3 of 28 days.', 'Self-logged in Steady. Estimates, not a diagnosis.',
  ]) assert.ok(s.includes(`(${t}) Tj`), `missing: ${t}`);
  assert.match(s, / m( [\d.]+ [\d.]+ l){3} S\n/); // the trend through its 4 points
  const lowest = Math.min(...[...s.matchAll(/ Tf [\d.]+ ([\d.]+) Td/g)].map((m) => Number(m[1])));
  assert.ok(lowest >= 40, `text runs off the page at ${lowest}`);
  const none = latin(summaryPdf(L.doctorSummary(fresh(), '2026-11-02', '2026-11-08'), '2026-11-08'));
  for (const t of ['The plan starts on 9 Nov 2026. Made 8 Nov 2026.', 'No weigh-ins yet.', 'No home readings in this period.', 'No results yet.', 'No measurements yet.']) {
    assert.ok(none.includes(`(${t}) Tj`), `missing: ${t}`);
  }
  assert.ok(!none.includes('(Training) Tj'));
  const blank = latin(summaryPdf(L.doctorSummary(fresh(), '2026-11-09', '2026-12-06'), '2026-12-07'));
  assert.ok(blank.includes('(No exercise data.) Tj') && blank.includes('(No step data.) Tj'));
  const two = fresh();
  put(two, '2026-11-09', { weight: 90 });
  put(two, '2026-11-16', { weight: 89.5 });
  assert.ok(latin(summaryPdf(L.doctorSummary(two, '2026-11-09', '2026-11-20'), '2026-11-20')).includes('(Too few weigh-ins in the last 4 weeks to give a weekly rate.) Tj'));
});

test('summaryPdf prints the weight change that the two printed values give', () => {
  const s = L.doctorSummary(patient(), '2026-11-02', '2026-12-06');
  // 81.36 - 86.04 is -4.68, which rounds to -4.7, but the page shows 86.0 and 81.4.
  const weight = { ...s.weight, start: ['2026-11-09', 86.04], end: ['2026-11-30', 81.36], change: 81.36 - 86.04 };
  const out = latin(summaryPdf({ ...s, weight }, '2026-12-07'));
  assert.ok(out.includes('(Trend: 86.0 kg on 9 Nov 2026 and 81.4 kg on 30 Nov 2026, a change of -4.6 kg.) Tj'));
});
