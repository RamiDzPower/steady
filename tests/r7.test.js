import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { EXERCISES, SESSIONS, SWAPS, CHANGES, APP_VERSION } from '../plan.js';

const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {}, swaps: {}, excluded: [], moves: [], repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const MON = '2026-11-09'; // the plan's first Monday: walks, strHome on Wednesday, the long walk on Saturday
const WED = '2026-11-11', THU = '2026-11-12', SAT = '2026-11-14';
const ids = (state, date) => L.sessionsFor(profile.startDate, date, [], state.moves).map((s) => s.id);

test('a moved session leaves its day and shows on the new one', () => {
  assert.ok(ids(fresh(), WED).includes('strHome'));
  const state = fresh();
  state.moves = L.applyMove(state.moves, 'strHome', WED, THU);
  assert.deepEqual(state.moves, [{ id: 'strHome', from: WED, to: THU }]);
  assert.ok(!ids(state, WED).includes('strHome'));
  const there = L.sessionsFor(profile.startDate, THU, [], state.moves).find((s) => s.id === 'strHome');
  assert.equal(there.movedFrom, WED);
  assert.ok(there.exercises.length > 0 && there.minutes === SESSIONS.strHome.minutes);
  assert.ok(ids(state, WED).includes('walks'), 'the other sessions of the day stay');
});

test('moving again follows the session, and moving it home removes the move', () => {
  let moves = L.applyMove([], 'strHome', WED, THU);
  moves = L.applyMove(moves, 'strHome', THU, SAT);
  assert.deepEqual(moves, [{ id: 'strHome', from: WED, to: SAT }]);
  moves = L.applyMove(moves, 'strHome', SAT, WED);
  assert.deepEqual(moves, []);
  assert.deepEqual(L.applyMove([], 'strHome', WED, WED), [], 'staying put makes no move');
});

test('applyMove does not change its input and keeps at most 60 moves', () => {
  const before = [{ id: 'strHome', from: WED, to: THU }];
  const after = L.applyMove(before, 'longwalk', SAT, THU);
  assert.equal(before.length, 1);
  assert.equal(after.length, 2);
  let many = [];
  for (let i = 0; i < 70; i++) many = L.applyMove(many, 'strHome', L.addDays('2027-01-04', i * 7 + 2), L.addDays('2027-01-04', i * 7 + 3));
  assert.equal(many.length, 60);
  assert.ok(many.every((m, i) => i === 0 || many[i - 1].from <= m.from));
});

test('a move across weeks counts in the week where the session lands', () => {
  const state = fresh();
  const nextMon = L.addDays(MON, 7);
  const before = [L.weekSummary(state, MON).planned, L.weekSummary(state, nextMon).planned];
  state.moves = L.applyMove(state.moves, 'strHome', WED, L.addDays(nextMon, 1));
  const after = [L.weekSummary(state, MON).planned, L.weekSummary(state, nextMon).planned];
  assert.equal(after[0], before[0] - 1);
  assert.equal(after[1], before[1] + 1);
  state.days[L.addDays(nextMon, 1)] = { workouts: [{ id: 'strHome', min: 20, rpe: 6 }] };
  assert.equal(L.weekSummary(state, nextMon).done >= 1, true, 'doing it on the new day counts as done');
});

test('nextSession finds a moved session on its new day', () => {
  const state = fresh();
  state.moves = L.applyMove(state.moves, 'strHome', WED, THU);
  const next = L.nextSession(state, MON);
  assert.equal(next.session.id !== 'walks', true);
  assert.equal(next.date, THU);
});

test('moveTargets offers the seven days from today, except the current one', () => {
  const state = fresh();
  const days = L.moveTargets(state, 'strHome', WED, '2026-11-10');
  assert.equal(days.length, 6);
  assert.ok(!days.includes(WED) && days[0] === '2026-11-10');
  assert.equal(L.moveTargets(state, 'strHome', WED, '2026-10-01')[0], profile.startDate, 'nothing before the plan starts');
});

test('cleanBackup keeps valid moves and drops the rest', () => {
  const state = fresh();
  state.moves = [
    { id: 'strHome', from: WED, to: THU },
    { id: 'rest', from: WED, to: THU },
    { id: 'constructor', from: WED, to: THU },
    { id: 'strHome', from: 'tomorrow', to: THU },
    { id: 'strHome', from: WED, to: WED },
    null,
  ];
  assert.deepEqual(L.cleanBackup(JSON.parse(JSON.stringify(state))).moves, [{ id: 'strHome', from: WED, to: THU }]);
  assert.deepEqual(L.cleanBackup({ v: 1, days: {} }).moves, [], 'an older backup has none');
});

test('swaps point at real exercises, never at themselves, and keep the same rep unit', () => {
  for (const [id, to] of Object.entries(SWAPS)) {
    assert.ok(EXERCISES[id], `${id} is an exercise`);
    assert.ok(to.length >= 1 && !to.includes(id), `${id} has other options`);
    for (const t of to) assert.ok(EXERCISES[t], `${id} swaps to ${t}, which exists`);
  }
  // A swap keeps the slot's rep spec, so every slot an exercise can be swapped in must count reps, not seconds or metres.
  for (const [sid, s] of Object.entries(SESSIONS)) {
    for (const [ex, , spec] of s.exercises ?? []) {
      if (!SWAPS[ex]) continue;
      assert.equal(L.repSpec(spec).unit, 'reps', `${sid}: ${ex} is swappable but its slot counts ${spec}`);
      for (const t of SWAPS[ex]) assert.ok(SWAPS[t], `${ex} swaps to ${t}, which can swap back`);
    }
  }
});

test('bestKg is the heaviest logged set before a date, and null with no history', () => {
  const state = fresh();
  assert.equal(L.bestKg(state, 'goblet', '2026-12-01'), null);
  state.days['2026-11-11'] = { workouts: [{ id: 'strA', min: 30, ex: [{ id: 'goblet', kg: 12, reps: 10, sets: 3, planned: 3 }, { id: 'carry', kg: 0, reps: 20, sets: 2, planned: 2 }] }] };
  state.days['2026-11-18'] = { workouts: [{ id: 'strA', min: 30, ex: [{ id: 'goblet', kg: 14, reps: 8, sets: 3, planned: 3 }] }] };
  state.days['2026-11-25'] = { workouts: [{ id: 'strA', min: 30, ex: [{ id: 'goblet', kg: 20, reps: 8, sets: 0, planned: 3 }] }] };
  assert.equal(L.bestKg(state, 'goblet', '2026-12-01'), 14, 'a set count of 0 is not a lift');
  assert.equal(L.bestKg(state, 'goblet', '2026-11-18'), 12, 'only days before the date');
  assert.equal(L.bestKg(state, 'goblet', '2026-11-11'), null);
  assert.equal(L.bestKg(state, 'carry', '2026-12-01'), null, 'no weight logged is no best');
});

test('activityGrid has 12 Monday columns ending this week, with levels by minutes', () => {
  const state = fresh();
  const today = '2026-11-12'; // a Thursday
  state.days['2026-11-10'] = { workouts: [{ id: 'cardio', min: 15, rpe: 5 }] };
  state.days['2026-11-11'] = { workouts: [{ id: 'cardio', min: 45, rpe: 5 }] };
  state.days['2026-11-12'] = { watch: { exMin: 90 } };
  state.days['2026-11-13'] = { workouts: [{ id: 'cardio', min: 30, rpe: 5 }] };
  const g = L.activityGrid(state, today);
  assert.equal(g.cols.length, 12);
  assert.ok(g.cols.every((c) => c.length === 7));
  assert.equal(g.cols[0][0].date, '2026-08-24');
  assert.equal(g.cols[11][0].date, '2026-11-09');
  const last = g.cols[11];
  assert.deepEqual(last.map((d) => d.level), [0, 1, 3, 4, 0, 0, 0]);
  assert.deepEqual(last.map((d) => d.future), [false, false, false, false, true, true, true]);
  assert.equal(last[4].level, 0, 'a future day with data is still empty');
  assert.equal(g.active, 3);
  assert.equal(g.counted, 4, 'days since the plan started, up to today');
});

test('totals count sessions but not the daily walks, and add up lifted weight', () => {
  const state = fresh();
  assert.deepEqual(L.totals(state, '2026-11-20'), { sessions: 0, thisMonth: 0, activeDays: 0, liftedKg: 0 });
  state.days['2026-10-30'] = { workouts: [{ id: 'cardio', min: 30, rpe: 5, ex: [] }] };
  state.days['2026-11-11'] = { workouts: [{ id: 'walks', min: 10, rpe: 3 }, { id: 'strA', min: 30, rpe: 6, ex: [{ id: 'goblet', kg: 10, reps: 10, sets: 3 }, { id: 'carry', kg: 0, reps: 20, sets: 2 }] }] };
  state.days['2026-11-25'] = { workouts: [{ id: 'strA', min: 30, rpe: 6, ex: [{ id: 'goblet', kg: 50, reps: 10, sets: 3 }] }] };
  assert.deepEqual(L.totals(state, '2026-11-20'), { sessions: 2, thisMonth: 1, activeDays: 2, liftedKg: 300 });
});

test('What\'s new has an entry for this release', () => {
  assert.equal(CHANGES[0].version, APP_VERSION);
  assert.ok(CHANGES[0].notes.length >= 3 && CHANGES[0].notes.every((n) => !/[–—]/.test(n)));
});
