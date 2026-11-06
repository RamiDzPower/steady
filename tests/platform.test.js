import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../logic.js';
import { APP_VERSION, CHANGES, SHORTCUT_IN } from '../plan.js';
import { demoState } from '../tools/demo-state.mjs';

process.env.TZ = 'Asia/Bangkok'; // the timestamp cases below read the date in the phone's own time zone

const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const paste = (text) => L.parseWatchPaste(text, '2026-11-12').days;

test('numbers: decimal marks, thousands and whole counts', () => {
  assert.equal(L.parseNum('640.538'), 640.538);
  assert.equal(L.parseNum('640,538'), 640.538); // one mark is a decimal: Shortcuts never groups thousands
  assert.equal(L.parseNum('1,196.4'), 1196.4);
  assert.equal(L.parseNum('1.196,4'), 1196.4);
  assert.equal(L.parseNum('1.234.567'), 1234567);
  assert.equal(L.parseNum('8,123', true), 8123);
  assert.equal(L.parseNum('6240,0', true), 6240); // a decimal-comma phone writes steps like this
  assert.equal(L.parseNum('8\u00a0123'), 8123); // a no-break space groups thousands in some regions
  assert.equal(L.parseNum('8\u202f123'), 8123);
  assert.equal(L.parseNum("8'123", true), 8123);
  assert.equal(L.parseNum(''), null);
  assert.equal(L.parseNum('none'), null);
});

test('the Steady Watch shortcut pastes several days at once', () => {
  const text = [
    'steps', '2026-11-08', '2026-11-09', '2026-11-10', '9100', '0', '8,450 steps',
    'move', '2026-11-08', '2026-11-09', '612.5', '545,4',
    'exercise', '2026-11-09', '31',
    'vo2', '2569-11-09', '36,46',
  ].join('\r\n');
  assert.deepEqual(L.parseWatchPaste(text, '2026-11-12'), {
    kind: 'steady-watch',
    days: {
      '2026-11-08': { steps: 9100, moveKcal: 613 },
      '2026-11-09': { moveKcal: 545, exMin: 31, vo2: 36.5 }, // the zero steps mean no samples, and 2569 is the Buddhist year
      '2026-11-10': { steps: 8450, exMin: 0 }, // Watch steps but no exercise listed: a rest day
    },
  });
  // A second steps search (iPhone and Watch) repeats days: each keeps its larger number.
  assert.deepEqual(paste('steps\n2026-11-09\n7000\nsteps\n2026-11-09\n7400'), { '2026-11-09': { steps: 7400 } });
  // Timestamps with Z or an offset land on the phone's own date (UTC+7 here).
  assert.deepEqual(paste('steps\n2026-11-08T17:30:00Z\n2026-11-09T23:30:00-0500\n6000\n6500'), { '2026-11-09': { steps: 6000 }, '2026-11-10': { steps: 6500 } });
  // A label that is not one of the types ends the part instead of lending it a number.
  assert.deepEqual(paste('exercise\n2026-11-09\n40\nResting Energy: 1800'), { '2026-11-09': { exMin: 40 } });
});

test('a pasted day with Watch steps but no exercise listed is a rest day, except the first', () => {
  const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'];
  const days = paste(['steps', ...week, 9000, 4000, 8500, 4200, 'exercise', '2026-10-28', 35].join('\n'));
  assert.deepEqual(days, { '2026-10-26': { steps: 9000 }, '2026-10-27': { steps: 4000, exMin: 0 }, '2026-10-28': { steps: 8500, exMin: 35 }, '2026-10-29': { steps: 4200, exMin: 0 } });
  assert.equal(L.effortKnown({ watch: days['2026-10-27'] }), true);
  // A listed zero is kept for exercise, but still means no samples for steps and Move.
  assert.deepEqual(paste('exercise\n2026-10-26\n2026-10-27\n40\n0\nsteps\n2026-10-26\n2026-10-27\n9000\n0'), { '2026-10-26': { exMin: 40, steps: 9000 }, '2026-10-27': { exMin: 0 } });
  // With no exercise search in the paste, as in the release 4 shortcut, nothing is filled in.
  assert.deepEqual(paste('steps\n2026-10-26\n2026-10-27\n9000\n4000'), { '2026-10-26': { steps: 9000 }, '2026-10-27': { steps: 4000 } });
});

test('Move and exercise minutes are whole counts like steps, and VO2max keeps its decimals', () => {
  // A single mark before exactly three digits groups thousands in a whole count, as typed into the paste box.
  assert.deepEqual(paste('Steps: 8,123\nMove: 1,234 kcal\nExercise: 1.020 min\nCardio Fitness: 35,125'), { '2026-11-12': { steps: 8123, moveKcal: 1234, exMin: 1020, vo2: 35.1 } });
  assert.deepEqual(paste('{"move":"1.234","exercise":"45","vo2":"36.500"}'), { '2026-11-12': { moveKcal: 1234, exMin: 45, vo2: 36.5 } });
  assert.deepEqual(paste('move\n2026-11-09\n1.050\nexercise\n2026-11-09\n1,005'), { '2026-11-09': { moveKcal: 1050, exMin: 1005 } });
  // Any other single mark is the decimal point.
  assert.deepEqual(paste('Move: 612,5\nExercise: 31.0\nCardio Fitness: 35.12'), { '2026-11-12': { moveKcal: 613, exMin: 31, vo2: 35.1 } });
  // Three decimals read as thousands would be past any day's total, which is how Health writes a number when Round Number is missing.
  assert.deepEqual(paste('move\n2026-11-01\n2026-11-02\n640.538\n702.1\nexercise\n2026-11-02\n15.250'), { '2026-11-01': { moveKcal: 641 }, '2026-11-02': { moveKcal: 702, exMin: 15 } });
  assert.deepEqual(paste('Active Energy: 640,538 kcal'), { '2026-11-12': { moveKcal: 641 } });
  // Still out of range either way: the paste says which number, instead of dropping it and counting the day.
  assert.throws(() => paste('steps\n2026-11-09\n2026-11-10\n8000\n300000'), /^Error: Steps for 2026-11-10 came as 300000, which is out of range/);
  assert.throws(() => paste('{"date":"2026-11-10","vo2":365}'), /Cardio Fitness for 2026-11-10/);
});

test('one-day lines and JSON from older shortcuts still paste', () => {
  assert.deepEqual(paste('Steps: 7,250\nActive Energy: 480 kcal\nCardio Fitness: 35.2 mL/kg/min'), { '2026-11-12': { steps: 7250, moveKcal: 480, vo2: 35.2 } });
  // A plain space groups thousands only before three digits.
  assert.deepEqual(paste('Steps: 8 123\nActive Energy: 1 234 kcal'), { '2026-11-12': { steps: 8123, moveKcal: 1234 } });
  assert.deepEqual(paste('{"steps":"8 123","exercise":"30 min"}'), { '2026-11-12': { steps: 8123, exMin: 30 } });
  assert.deepEqual(paste('Steps: 6000\nDate: 2026-11-10'), { '2026-11-10': { steps: 6000 } });
  assert.deepEqual(paste('Date:\nSteps: 6000\nActive Energy: 400'), { '2026-11-12': { steps: 6000, moveKcal: 400 } }); // an unset date variable is blank
  assert.deepEqual(paste('{"steps":"8.123","move":"","exMin":"25 min","restingHeartRate":66}'), { '2026-11-12': { steps: 8123, exMin: 25, rhr: 66 } });
  assert.deepEqual(paste('[{"date":"2026-11-10","steps":5000},{"date":"2569-11-11T08:00:00+07:00","steps":5200,"vo2":34}]'),
    { '2026-11-10': { steps: 5000 }, '2026-11-11': { steps: 5200, vo2: 34 } });
  assert.deepEqual(paste('{"date":["2026-11-10","2026-11-11"],"steps":[5000,5100]}'), { '2026-11-10': { steps: 5000 }, '2026-11-11': { steps: 5100 } });
  const file = { kind: 'steady-watch', days: { '2026-11-10': { steps: 5000 } } };
  assert.deepEqual(L.parseWatchPaste(JSON.stringify(file), '2026-11-12'), file);
});

test('a paste that does not fit says what to fix', () => {
  assert.throws(() => paste('hello'), /No Watch numbers found/);
  assert.throws(() => paste('{"date":"2026-11-12","energy":2100,"protein":140,"water":1250,"fibre":31}'), /No Watch numbers found/); // Copy totals for Health
  assert.throws(() => paste('move\n2026-11-08\n2026-11-09\n600'), /Active Energy came with 2 dates and 1 number/);
  assert.throws(() => paste('steps\nNov 9, 2026\n7000'), /Steps came with 0 dates and 2 numbers/);
  assert.throws(() => paste('steps\n2026-02-30\n7000'), /cannot read the date/);
  assert.throws(() => paste('{"date":"9/11/2026","steps":7000}'), /yyyy-MM-dd/);
  assert.throws(() => paste('Date: 2 Nov 2026\nSteps: 6000'), /yyyy-MM-dd/);
});

test('a paste keeps the larger totals for today and checks ranges', () => {
  const st = fresh();
  st.days['2026-11-09'] = { ...L.emptyDay(), watch: { steps: 4000, moveKcal: null, exMin: null, rhr: null, vo2: null, src: 'manual' } };
  st.days['2026-11-10'] = { ...L.emptyDay(), watch: { steps: 9000, moveKcal: 650, exMin: 40, rhr: null, vo2: 35, src: 'shortcut' } };
  const n = L.mergeWatch(st, { kind: 'steady-watch', days: {
    '2026-11-09': { steps: 9500, moveKcal: 520 },
    '2026-11-10': { steps: 1200, moveKcal: 90, exMin: 3, vo2: 36.1 },
    '2026-11-11': { steps: 300000 },
    '2026-11-12': {},
  } }, 'shortcut', '2026-11-10');
  assert.equal(n, 2); // the out-of-range and empty days add nothing
  assert.deepEqual(st.days['2026-11-09'].watch, { steps: 9500, moveKcal: 520, exMin: null, rhr: null, vo2: null, src: 'manual' });
  assert.deepEqual(st.days['2026-11-10'].watch, { steps: 9000, moveKcal: 650, exMin: 40, rhr: null, vo2: 36.1, src: 'shortcut' });
  assert.equal(st.days['2026-11-11'], undefined);
  assert.equal(st.days['2026-11-12'], undefined);
  assert.equal(L.cleanBackup(st).days['2026-11-10'].watch.src, 'shortcut');
});

test('a later paste replaces finished days, and only raises today, the first day and typed numbers', () => {
  const st = fresh();
  const run = (today, days, steps) => L.mergeWatch(st, L.parseWatchPaste(['steps', ...days, ...steps, 'exercise', ...days, ...steps.map(() => 30)].join('\n'), today), 'shortcut', today);
  const week = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
  const steps = () => week.map((d) => st.days[d].watch.steps);
  // Without the Source filter the shortcut counts iPhone and Watch steps together.
  run('2026-11-12', week, [16200, 18050, 14400, 19900, 15000, 17000, 9000]);
  st.days['2026-11-09'].watch = { ...st.days['2026-11-09'].watch, steps: 10100, src: 'manual' }; // typed in from the Fitness app
  // With the filter added, the next run is about half. Its first day starts partway through, and today is not over.
  run('2026-11-12', week, [600, 9020, 7200, 9950, 7500, 8500, 4500]);
  assert.deepEqual(steps(), [16200, 9020, 7200, 10100, 7500, 8500, 9000]);
  assert.equal(st.days['2026-11-09'].watch.src, 'manual');
  // The next evening's run puts yesterday right, and keeps the first day of its window.
  run('2026-11-13', [...week.slice(1), '2026-11-13'], [500, 7200, 9950, 7500, 8500, 8800, 3000]);
  assert.deepEqual(steps(), [16200, 9020, 7200, 10100, 7500, 8500, 8800]);
  assert.equal(st.days['2026-11-13'].watch.exMin, 30);
});

test('a paste leaves a typed day typed, so a Mac file only fills its blanks', () => {
  const st = fresh();
  st.days['2026-11-10'] = { ...L.emptyDay(), watch: { steps: 12000, moveKcal: null, exMin: 45, rhr: null, vo2: null, src: 'manual' } };
  L.mergeWatch(st, L.parseWatchPaste('steps\n2026-11-10\n9000', '2026-11-12'), 'shortcut', '2026-11-12');
  assert.equal(st.days['2026-11-10'].watch.src, 'manual');
  L.mergeWatch(st, { kind: 'steady-watch', days: { '2026-11-10': { steps: 9500, exMin: 30, vo2: 36 } } });
  assert.deepEqual(st.days['2026-11-10'].watch, { steps: 12000, moveKcal: null, exMin: 45, rhr: null, vo2: 36, src: 'manual' });
});

test('the seen version survives a backup restore', () => {
  assert.equal(L.cleanBackup({ ...fresh(), seenVersion: APP_VERSION }).seenVersion, APP_VERSION);
  assert.equal(L.cleanBackup(fresh()).seenVersion, 0);
  assert.equal(L.cleanBackup({ ...fresh(), seenVersion: 'x' }).seenVersion, 0);
});

// Everything in a comes through in b unchanged. b may add fields that other parts of the app default.
function survives(a, b, path = 'state') {
  if (!a || typeof a !== 'object') return assert.equal(b, a, path);
  assert.ok(b && typeof b === 'object' && Array.isArray(b) === Array.isArray(a), path);
  if (Array.isArray(a)) assert.equal(b.length, a.length, path);
  for (const k of Object.keys(a)) survives(a[k], b[k], `${path}.${k}`);
}

test('the demo state is repeatable and passes a backup restore unchanged', () => {
  const s = demoState('2026-11-02');
  assert.deepEqual(demoState('2026-11-02'), s);
  survives(s, L.cleanBackup(s));
  const days = Object.values(s.days);
  assert.ok(days.length >= 42 && days.every((d) => d.foods.length && d.water.length));
  assert.ok(days.filter((d) => d.watch?.vo2).length >= 8 && days.some((d) => d.workouts.length));
  assert.ok(L.weighIns(s).length >= 6 && s.bp.length >= 12 && s.labs.length === 2);
  assert.deepEqual(L.applyHolds(structuredClone(s), '2026-11-02'), []); // the made-up weeks are complete enough to move on
});

test('the demo state prints when the tool is run through a link', () => {
  const dir = mkdtempSync(join(tmpdir(), 'steady-demo-')); // on a Mac, /tmp itself is such a link
  try {
    const link = join(dir, 'demo-state.mjs');
    symlinkSync(fileURLToPath(new URL('../tools/demo-state.mjs', import.meta.url)), link);
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, [link, '2026-11-02'], { encoding: 'utf8' })), demoState('2026-11-02'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('What is new shows every entry newer than the one seen, and the latest when there is none', () => {
  const log = [{ version: 6, notes: ['c'] }, { version: 5, notes: ['b'] }, { version: 4, notes: ['a'] }];
  assert.deepEqual(L.changesSince(log, 4).map((c) => c.version), [6, 5]); // updating from 4 straight to 6
  assert.deepEqual(L.changesSince(log, 5).map((c) => c.version), [6]);
  assert.deepEqual(L.changesSince(log, 0).map((c) => c.version), [6, 5, 4]);
  assert.deepEqual(L.changesSince(log, 6).map((c) => c.version), [6]); // the More row
});

test('What is new and the shortcut steps follow the copy rules', () => {
  assert.equal(APP_VERSION, 7);
  assert.deepEqual(CHANGES.map((c) => c.version), [7, 6, 5]); // newest first
  assert.equal(CHANGES[1].notes.length, 6);
  assert.equal(CHANGES[2].notes.length, 7);
  // A shortcut made for release 4 still pastes without an error, so What's new has to say it needs making again.
  assert.match(CHANGES[2].notes[0], /Steady Watch shortcut has new steps.*More, iPhone shortcuts/);
  for (const s of [...CHANGES.flatMap((c) => c.notes), ...SHORTCUT_IN]) assert.doesNotMatch(s, /[\u2013\u2014!]/, s); // no en or em dashes, no exclamation marks
  assert.ok(SHORTCUT_IN.some((s) => /Local Only/.test(s)) && SHORTCUT_IN.some((s) => /yyyy-MM-dd/.test(s)));
  // Cardio Fitness can go weeks without a reading, so its search looks back 3 months for the latest one.
  assert.ok(SHORTCUT_IN.some((s) => /Cardio Fitness/.test(s) && /last 3 months/.test(s) && /Latest First/.test(s) && /Limit and set it to 1/.test(s)));
});
