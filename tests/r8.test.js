import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { EXERCISES, EX_INFO, BODY_PARTS, SESSIONS } from '../plan.js';

const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = (startDate = profile.startDate) => ({ v: 1, profile: { ...profile, startDate }, days: {}, custom: [], shopping: {}, swaps: {}, excluded: [], moves: [], extras: [], customEx: [], repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const MON = '2026-11-09';
const day = (state, d) => (state.days[d] ||= {});

// A run of weeks from the plan start: H is a week with plenty of Watch exercise minutes, M an empty week.
const weeks = (pattern, startDate = '2026-09-07') => {
  const state = fresh(startDate);
  [...pattern].forEach((c, i) => { if (c === 'H') day(state, L.addDays(startDate, i * 7 + 2)).watch = { exMin: 900 }; });
  return { state, today: L.addDays(startDate, pattern.length * 7 + 1) }; // a Tuesday of the week after the last letter
};

test('a session done on another day than planned still counts for its week', () => {
  const state = fresh();
  assert.equal(L.weekSummary(state, MON).done, 0);
  day(state, '2026-11-12').workouts = [{ id: 'strHome', min: 20, rpe: 6 }]; // planned for Wednesday the 11th
  const w = L.weekSummary(state, MON);
  assert.equal(w.done, 1);
  assert.equal(w.planned >= 7, true);
  day(state, '2026-11-13').workouts = [{ id: 'strHome', min: 20, rpe: 6 }];
  assert.equal(L.weekSummary(state, MON).done, 1, 'one planned session is done once');
});

test('streak: every good week adds one, and a freeze or two covers a missed week', () => {
  let { state, today } = weeks('HHHHH');
  assert.deepEqual(L.streakInfo(state, today), { current: 5, best: 5, freezes: 2, used: 0, next: 12, earned: [4] });
  ({ state, today } = weeks('HMHHH'));
  const s = L.streakInfo(state, today);
  assert.equal(s.current, 4, 'the missed week keeps the run but does not add to it');
  assert.equal(s.freezes, 1);
  assert.equal(s.used, 1);
});

test('streak: with no freeze left a missed week ends the run', () => {
  const { state, today } = weeks('HMMMH');
  const s = L.streakInfo(state, today);
  assert.equal(s.best, 1);
  assert.equal(s.current, 1, 'the run starts again with the week after the third miss');
  assert.equal(s.freezes, 0);
});

test('streak: four good weeks in a row bring a spent freeze back', () => {
  const { state, today } = weeks('MHHHH');
  const s = L.streakInfo(state, today);
  assert.equal(s.current, 4);
  assert.equal(s.freezes, 2);
  assert.deepEqual(s.earned, [4]);
});

test('streak: this week adds to the run once it is at half, and cannot break it', () => {
  const { state, today } = weeks('HH');
  assert.equal(L.streakInfo(state, today).current, 2, 'this week is still empty');
  day(state, today).watch = { exMin: 900 };
  assert.equal(L.streakInfo(state, today).current, 3);
  assert.equal(L.streakInfo(fresh('2027-01-04'), '2026-11-12').current, 0, 'before the plan starts');
});

test('monthly challenges count this month only', () => {
  const state = fresh('2026-09-07');
  for (let i = 1; i <= 9; i++) day(state, `2026-11-${String(i).padStart(2, '0')}`).workouts = [{ id: 'strA', min: 30, rpe: 6 }, { id: 'walks', min: 10, rpe: 3 }];
  day(state, '2026-10-30').workouts = [{ id: 'strA', min: 30, rpe: 6 }];
  for (let i = 1; i <= 20; i++) day(state, `2026-11-${String(i).padStart(2, '0')}`).foods = [{ name: 'x', kcal: 100 }];
  for (let i = 1; i <= 3; i++) day(state, `2026-11-${String(i).padStart(2, '0')}`).water = [{ ml: 6000, t: '10:00' }];
  const c = Object.fromEntries(L.monthlyChallenges(state, '2026-11-20').map((x) => [x.id, x]));
  assert.deepEqual([c.train.value, c.train.target, c.train.done], [9, 8, true], 'walks do not count');
  assert.deepEqual([c.food.value, c.food.done], [20, true]);
  assert.deepEqual([c.water.value, c.water.done], [3, false]);
  assert.equal(L.monthlyChallenges(state, '2026-12-02').every((x) => x.value === 0 && !x.done), true);
});

test('recent workouts: newest first, no walks, and a record only beats an earlier log', () => {
  const state = fresh('2026-09-07');
  const lift = (kg) => ({ id: 'strA', min: 40, rpe: 6, ex: [{ id: 'goblet', kg, reps: 10, sets: 3, planned: 3 }, { id: 'carry', kg: 0, reps: 20, sets: 2, planned: 2 }] });
  day(state, '2026-11-11').workouts = [lift(10)];
  day(state, '2026-11-18').workouts = [{ id: 'walks', min: 10, rpe: 3 }, lift(12)];
  day(state, '2026-11-25').workouts = [lift(12)];
  day(state, '2026-11-26').workouts = [{ id: 'cardio', min: 30, rpe: 5, ex: [] }];
  const r = L.recentWorkouts(state, '2026-11-30', 3);
  assert.deepEqual(r.map((x) => [x.date, x.id]), [['2026-11-26', 'cardio'], ['2026-11-25', 'strA'], ['2026-11-18', 'strA']]);
  assert.deepEqual(r.map((x) => x.prs), [0, 0, 1], 'the first log is no record, a repeat of 12 kg is none');
  assert.deepEqual([r[1].sets, r[1].kg], [5, 360]);
  assert.deepEqual([r[0].sets, r[0].kg, r[0].min], [0, 0, 30]);
  assert.equal(L.recentWorkouts(state, '2026-11-30').length, 4, 'up to five, the walk left out');
});

test('activity grid: Volume levels follow the heaviest day, and month labels sit on the column with the 1st', () => {
  const state = fresh('2026-08-01');
  day(state, '2026-11-09').workouts = [{ id: 'strA', min: 40, rpe: 6, ex: [{ id: 'goblet', kg: 12, reps: 10, sets: 3 }] }]; // 360
  day(state, '2026-11-10').workouts = [{ id: 'strA', min: 40, rpe: 6, ex: [{ id: 'goblet', kg: 6, reps: 10, sets: 3 }] }]; // 180
  day(state, '2026-11-11').workouts = [{ id: 'cardio', min: 30, rpe: 5 }];
  const v = L.activityGrid(state, '2026-11-12', 12, 'volume');
  assert.deepEqual(v.cols[11].slice(0, 4).map((c) => c.level), [4, 2, 0, 0]);
  assert.equal(v.active, 3);
  const t = L.activityGrid(state, '2026-11-12', 12, 'time');
  assert.deepEqual(t.cols[11].slice(0, 3).map((c) => c.level), [3, 3, 2]);
  assert.deepEqual(t.months, [{ col: 1, month: 9 }, { col: 5, month: 10 }, { col: 9, month: 11 }]);
  assert.equal(L.activityGrid(state, '2026-11-12', 52).cols.length, 52);
  assert.equal(L.activityGrid(fresh(), '2026-11-12', 12, 'volume').cols.flat().every((c) => c.level === 0), true, 'no division by zero');
});

test('weight over 30 days and by range', () => {
  const state = fresh('2026-09-07');
  assert.equal(L.weightChange30(state, '2026-11-12'), null);
  day(state, '2026-10-01').weight = 90;
  day(state, '2026-10-05').weight = 89;
  assert.equal(L.weightChange30(state, '2026-10-06'), null, 'under 14 days of history');
  day(state, '2026-11-12').weight = 88;
  const c = L.weightChange30(state, '2026-11-12');
  assert.ok(c <= -1.5 && c >= -1.8, `the trend, not the raw 90 kg, is the starting point: got ${c}`);
  assert.equal(L.weightRange(state, '1M', '2026-11-12').readings.length, 1);
  assert.equal(L.weightRange(state, '3M', '2026-11-12').readings.length, 3);
  assert.equal(L.weightRange(state, 'All', '2026-11-12').trend.length, 3);
  assert.equal(L.weightRange(state, '1Y', '2026-11-12').readings[0][0], '2026-10-01');
});

test('every exercise has a body part and gear, and custom ones are looked up safely', () => {
  for (const id of Object.keys(EXERCISES)) {
    assert.ok(EX_INFO[id], `${id} has info`);
    assert.ok(BODY_PARTS.includes(EX_INFO[id].part), `${id} part ${EX_INFO[id].part}`);
    assert.ok(EX_INFO[id].muscles && EX_INFO[id].gear);
  }
  assert.deepEqual(Object.keys(EX_INFO).filter((id) => !EXERCISES[id]), []);
  const state = fresh();
  state.customEx = [{ id: 'xk1', name: 'Wall sit', part: 'Legs', unit: 's' }];
  assert.equal(L.exerciseOf(state, 'goblet').part, 'Legs');
  assert.deepEqual([L.exerciseOf(state, 'xk1').name, L.exerciseOf(state, 'xk1').custom, L.exerciseOf(state, 'xk1').unit], ['Wall sit', true, 's']);
  assert.equal(L.exerciseOf(state, 'constructor'), null);
  assert.equal(L.exerciseOf(state, 'nope'), null);
});

test('a session added to a day is planned there, counts in the week and can be offered only once', () => {
  const state = fresh();
  const before = L.weekSummary(state, MON).planned;
  assert.ok(L.planOptions(state, '2026-11-10').some((o) => o.id === 'cardio'));
  assert.ok(L.planOptions(state, '2026-11-10').every((o) => o.id !== 'walks' && SESSIONS[o.id].kind !== 'rest'));
  state.extras = [{ id: 'cardio', date: '2026-11-10' }];
  const s = L.sessionsFor(profile.startDate, '2026-11-10', [], [], state.extras);
  assert.deepEqual(s.map((x) => x.id), ['walks', 'cardio']);
  assert.equal(s[1].extra, true);
  assert.ok(s[1].minutes > 0);
  assert.equal(L.weekSummary(state, MON).planned, before + 1);
  assert.ok(L.planOptions(state, '2026-11-10').every((o) => o.id !== 'cardio'));
  assert.equal(L.sessionsFor(profile.startDate, '2026-11-10', [], [], [...state.extras, ...state.extras]).filter((x) => x.id === 'cardio').length, 1);
});

test('rotation: today shows the next session of the week that is not done, whatever its weekday', () => {
  const state = fresh();
  const ids = (d) => L.rotationSessions(state, d).map((s) => s.id);
  assert.deepEqual(ids(MON), ['walks', 'strHome'], 'Wednesday\'s session comes up on Monday');
  day(state, MON).workouts = [{ id: 'strHome', min: 20, rpe: 6 }];
  assert.deepEqual(ids('2026-11-10'), ['walks', 'longwalk']);
  day(state, '2026-11-10').workouts = [{ id: 'longwalk', min: 45, rpe: 3 }];
  assert.deepEqual(ids('2026-11-11'), ['walks'], 'nothing left this week');
});

test('cleanBackup keeps valid extras, own exercises and the Rotation setting', () => {
  const state = fresh();
  state.extras = [{ id: 'cardio', date: '2026-11-10' }, { id: 'walks', date: '2026-11-10' }, { id: 'constructor', date: '2026-11-10' }, { id: 'cardio', date: 'soon' }, null];
  state.customEx = [{ id: 'xk1', name: ' Wall sit ', part: 'Legs', unit: 's' }, { id: 'xk2', name: 'Odd', part: 'Elbows', unit: 'm' }, { id: 'goblet', name: 'Clash', part: 'Legs', unit: 'reps' }, { id: 'x3', name: '   ', part: 'Legs' }];
  state.settings = { train: 'rotation' };
  const out = L.cleanBackup(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(out.extras, [{ id: 'cardio', date: '2026-11-10' }]);
  assert.deepEqual(out.customEx.map((x) => [x.id, x.name, x.part, x.unit]), [['xk1', 'Wall sit', 'Legs', 's'], ['xk2', 'Odd', 'Full body', 'reps']]);
  assert.equal(out.settings.train, 'rotation');
  assert.equal(L.cleanBackup({ v: 1, days: {}, settings: { train: 'weird' } }).settings.train, 'fixed');
  assert.deepEqual([L.cleanBackup({ v: 1, days: {} }).extras, L.cleanBackup({ v: 1, days: {} }).customEx], [[], []], 'an older backup has none');
});
