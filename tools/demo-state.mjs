// Prints a made-up steady.v1 state for testing: about six weeks of food, water, Watch numbers with VO2max, weigh-ins,
// workouts, blood pressure and two blood tests, ending on the date given. Every number is invented, and the same date
// always gives the same state. Usage: node tools/demo-state.mjs [YYYY-MM-DD], which defaults to today.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as L from '../logic.js';
import { SESSIONS, MEALS, APP_VERSION } from '../plan.js';

// Mulberry32: a tiny seeded generator, so a run is repeatable.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const KG = { goblet: 10, bprow: 6, carry: 12, rdl: 14, onearmrow: 10, hipthrust: 30, legpress: 60, chestpress: 30, pulldown: 35, cablerow: 30, shoulderpress: 20, legcurl: 25, pallof: 10 };
const DRINKS = MEALS.filter((m) => m.slot === 'extra' && m.tags?.includes('sugary'));
const TIME = { breakfast: '07:30', lunch: '12:30', snack: '16:00', dinner: '19:00' };

export function demoState(today) {
  const r = seeded(20261102);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const span = (lo, hi) => Math.round(lo + r() * (hi - lo));
  const start = L.addDays(L.mondayOf(today), -42);
  const state = {
    v: 1,
    profile: { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, maxHr: null, startDate: start, kcalTarget: null, proteinTarget: null, waterBase: 2500, nextLab: null },
    days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], holdChecked: null,
    labs: [
      { date: L.addDays(start, -4), note: 'Demo values', fbs: 110, a1c: 6, uric: 8, ldl: 150, hdl: 40, tg: 200 },
      { date: L.addDays(start, 38), note: 'Demo values', fbs: 100, a1c: 5.8, uric: 7, ldl: 130, hdl: 45, tg: 160 },
    ],
    bp: [], waist: [], settings: { hotMonths: [3, 4, 5], loudBeep: false, reminders: {} },
    lastBackup: L.addDays(today, -3), seenVersion: APP_VERSION,
  };
  for (let d = start, i = 0; d <= today; d = L.addDays(d, 1), i++) {
    const last = d === today; // today is only half logged, as it would be at lunchtime
    const day = { foods: [], water: [], workouts: [] };
    for (const { slot, meal } of L.menuFor(d, state)) {
      if ((last && slot !== 'breakfast' && slot !== 'lunch') || r() < 0.08) continue;
      day.foods.push({ name: meal.name, slot, kcal: meal.kcal, p: meal.p, fib: meal.fib || 0, ref: meal.id, t: TIME[slot], tags: meal.tags || [] });
    }
    if (!last && r() < 0.3) {
      const x = pick(DRINKS);
      day.foods.push({ name: x.name, slot: 'snack', kcal: x.kcal, p: x.p, fib: x.fib || 0, ref: x.id, t: '15:00', tags: x.tags || [] });
    }
    for (let k = 0, n = last ? 3 : span(5, 8); k < n; k++) day.water.push({ ml: pick([250, 500, 500, 750]), t: `${String(8 + 2 * k).padStart(2, '0')}:00` });
    for (const s of L.sessionsFor(start, d)) {
      if (s.kind === 'rest' || last || r() < 0.15) continue;
      if (s.id === 'walks') {
        for (const t of r() < 0.6 ? ['13:10', '20:10'] : ['13:10']) day.workouts.push({ id: 'walks', name: SESSIONS.walks.name, min: 10, rpe: 4, hr: null, note: '', t, ex: [] });
        continue;
      }
      const ex = (s.exercises || []).map(([id, sets, spec]) => ({ id, kg: KG[id] ? KG[id] + 2.5 * Math.floor(i / 14) : null, reps: L.repSpec(spec).top, sets, planned: sets }));
      day.workouts.push({ id: s.id, name: s.name, min: s.minutes || 30, rpe: s.kind === 'strength' ? 7 : 5, hr: s.kind === 'strength' ? null : span(112, 128), note: '', t: '18:00', ex });
    }
    if (r() < 0.9) {
      const exMin = Math.max(L.loggedMinutes(day), span(10, 35));
      day.watch = { moveKcal: last ? span(150, 250) : span(380, 720), exMin, steps: last ? span(2500, 4500) : span(6000, 11000), rhr: null, vo2: i % 4 === 1 ? Math.round((31 + i * 0.04 + r() * 0.6) * 10) / 10 : null, src: 'shortcut' };
    }
    if (L.weekday(d) === 0 || r() < 0.12) day.weight = Math.round((90 - i * 0.07 + (r() - 0.5) * 0.6) * 10) / 10;
    if (L.weekday(d) % 2 === 0) state.bp.push({ date: d, t: '07:10', sys: span(122, 136), dia: span(76, 86), pulse: span(64, 74), clinic: false });
    state.days[d] = day;
  }
  return state;
}

// import.meta.url has the real path but argv[1] keeps any link (on a Mac /tmp is one), so compare real paths.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const today = process.argv[2] ?? L.iso(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || L.iso(L.parse(today)) !== today) {
    console.error('Usage: node tools/demo-state.mjs [YYYY-MM-DD]');
    process.exit(1);
  }
  console.log(JSON.stringify(demoState(today)));
}
