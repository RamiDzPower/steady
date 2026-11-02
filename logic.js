// Pure functions: dates, plan lookup, targets, daily and weekly numbers. No DOM access here.
import { BLOCKS, SESSIONS, MEALS, MENU } from './plan.js';

export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));
export const KCAL_PER_KG = 7700;

// ---- Dates: local calendar days as YYYY-MM-DD strings ----
export function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 86400000);
}
export function weekday(s) {
  return (parse(s).getDay() + 6) % 7; // Monday 0 ... Sunday 6
}
export function mondayOf(s) {
  return addDays(s, -weekday(s));
}
// The first Monday after s (a week later if s is itself a Monday).
export function nextMonday(s) {
  return addDays(s, 7 - weekday(s));
}

// ---- Plan ----
export function planPosition(startDate, date) {
  const days = diffDays(startDate, date);
  if (days < 0) return { before: true, week: 0, daysToStart: -days };
  const week = Math.floor(days / 7) + 1;
  const blockIndex = BLOCKS.findIndex((b) => week >= b.weeks[0] && (b.weeks[1] == null || week <= b.weeks[1]));
  const block = BLOCKS[blockIndex];
  return { before: false, week, blockIndex, block, weekInBlock: week - block.weeks[0] };
}

export function sessionsFor(startDate, date) {
  const pos = planPosition(startDate, date);
  if (pos.before) return [];
  return pos.block.days[weekday(date)].map((e) => {
    const base = SESSIONS[e.s];
    const minutes = Array.isArray(e.min) ? e.min[Math.min(pos.weekInBlock, e.min.length - 1)] : (e.min ?? base.minutes ?? 0);
    return { ...base, id: e.s, minutes, reps: e.reps ?? null };
  });
}

export function plannedMinutes(sessions) {
  return sessions.reduce((t, s) => t + (s.kind === 'rest' ? 0 : s.minutes), 0);
}

// ---- Targets ----
export function bmr(profile, weight) {
  return 10 * weight + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === 'f' ? -161 : 5);
}

// Mifflin-St Jeor x 1.375 (light activity) minus 550 kcal, rounded to 50.
export function autoKcal(profile, weight) {
  return Math.round((bmr(profile, weight) * 1.375 - 550) / 50) * 50;
}

// 1.3 g per kg of adjusted body weight (Devine ideal weight + 40% of the excess), rounded to 5.
export function autoProtein(profile, weight) {
  const inches = profile.heightCm / 2.54;
  const ideal = (profile.sex === 'f' ? 45.5 : 50) + 2.3 * Math.max(0, inches - 60);
  const adjusted = weight > ideal ? ideal + 0.4 * (weight - ideal) : weight;
  return Math.round((1.3 * adjusted) / 5) * 5;
}

export function targets(profile, weight) {
  return {
    kcal: profile.kcalTarget || autoKcal(profile, weight),
    protein: profile.proteinTarget || autoProtein(profile, weight),
    waterBase: profile.waterBase || 2500,
  };
}

// Heart-rate ranges from heart-rate reserve. Max defaults to 208 - 0.7 x age (Tanaka).
export function hrZones(profile) {
  const max = profile.maxHr || Math.round(208 - 0.7 * profile.age);
  const rest = profile.rhr || 65;
  const at = (f) => Math.round(rest + f * (max - rest));
  return { max, rest, easy: [at(0.3), at(0.4)], moderate: [at(0.4), at(0.6)], hard: [at(0.6), at(0.8)] };
}

// ---- One day ----
export function emptyDay() {
  return { foods: [], water: [], workouts: [] };
}
export function foodTotals(day) {
  const t = { kcal: 0, p: 0, fib: 0 };
  for (const f of day?.foods ?? []) {
    t.kcal += f.kcal;
    t.p += f.p;
    t.fib += f.fib || 0;
  }
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), fib: Math.round(t.fib) };
}
export function waterTotal(day) {
  return (day?.water ?? []).reduce((t, w) => t + w.ml, 0);
}
export function loggedMinutes(day) {
  return (day?.workouts ?? []).reduce((t, w) => t + (w.min || 0), 0);
}
export function effortMinutes(day) {
  return Math.max(day?.watch?.exMin || 0, loggedMinutes(day));
}
// Base plus 500 ml per 30 exercise minutes, at most 1.5 L extra, rounded to 50 ml.
export function waterTarget(day, base) {
  return base + Math.min(1500, Math.round((effortMinutes(day) * 500) / 30 / 50) * 50);
}
// Session RPE x minutes (Foster), summed over the day's logged workouts.
export function trainingLoad(day) {
  return (day?.workouts ?? []).reduce((t, w) => t + (w.min || 0) * (w.rpe || 0), 0);
}

export function weightOn(state, date) {
  let best = null;
  for (const [d, v] of Object.entries(state.days)) {
    if (v.weight && d <= date && (!best || d > best[0])) best = [d, v.weight];
  }
  return best ? best[1] : state.profile.startWeight;
}

export function avgMove(state, date, n = 14) {
  const vals = [];
  for (let i = 1; i <= n; i++) {
    const m = state.days[addDays(date, -i)]?.watch?.moveKcal;
    if (m != null) vals.push(m);
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

// Estimated energy out: resting (Mifflin-St Jeor) + Watch Move calories + 10% of intake for digestion.
export function burn(state, date) {
  const day = state.days[date];
  const own = day?.watch?.moveKcal;
  const move = own ?? avgMove(state, date);
  if (move == null) return null;
  const intake = foodTotals(day).kcal;
  const rest = bmr(state.profile, weightOn(state, date));
  return { total: Math.round(rest + move + 0.1 * intake), rest: Math.round(rest), move, estimated: own == null };
}

export function balance(state, date) {
  const day = state.days[date];
  if (!day?.foods?.length) return null;
  const b = burn(state, date);
  return b ? foodTotals(day).kcal - b.total : null;
}

// ---- One week (Monday start) ----
export function weekSummary(state, monday) {
  const p = state.profile;
  const out = { monday, planned: 0, done: 0, strengthDone: 0, exMin: 0, load: 0, steps: [], kcal: [], protein: [], water: [], waterTarget: [], balance: [], weights: [] };
  const base = targets(p, weightOn(state, monday)).waterBase;
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const day = state.days[date];
    const planned = sessionsFor(p.startDate, date).filter((s) => s.kind !== 'rest');
    out.planned += planned.length;
    out.done += planned.filter((s) => day?.workouts?.some((w) => w.id === s.id)).length;
    out.strengthDone += (day?.workouts ?? []).filter((w) => SESSIONS[w.id]?.kind === 'strength').length;
    out.exMin += effortMinutes(day);
    out.load += trainingLoad(day);
    if (day?.watch?.steps != null) out.steps.push(day.watch.steps);
    if (day?.foods?.length) {
      const t = foodTotals(day);
      out.kcal.push(t.kcal);
      out.protein.push(t.p);
    }
    if (day?.water?.length) {
      out.water.push(waterTotal(day));
      out.waterTarget.push(waterTarget(day, base));
    }
    const b = balance(state, date);
    if (b != null) out.balance.push(b);
    if (day?.weight) out.weights.push([date, day.weight]);
  }
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return {
    ...out,
    stepsAvg: avg(out.steps), kcalAvg: avg(out.kcal), proteinAvg: avg(out.protein),
    waterAvg: avg(out.water), waterTargetAvg: avg(out.waterTarget), balanceAvg: avg(out.balance),
    daysLogged: out.kcal.length,
  };
}

// ---- Weight ----
export function weighIns(state) {
  return Object.entries(state.days).filter(([, v]) => v.weight).map(([d, v]) => [d, v.weight]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// 5% at 12 weeks, 8% at 26 weeks, 10% at 52 weeks.
export function goalPath(profile) {
  const w = profile.startWeight;
  return [[profile.startDate, w], [addDays(profile.startDate, 84), w * 0.95], [addDays(profile.startDate, 182), w * 0.92], [addDays(profile.startDate, 364), w * 0.9]];
}

// Weight predicted from logged energy balance, starting at the first weigh-in.
export function predictedWeights(state, toDate) {
  const ins = weighIns(state);
  if (!ins.length) return [];
  let [date, kg] = ins[0];
  const out = [[date, kg]];
  while (date < toDate) {
    const b = balance(state, date);
    if (b != null) kg += b / KCAL_PER_KG;
    date = addDays(date, 1);
    out.push([date, kg]);
  }
  return out;
}

// ---- Menu ----
// The planned meals for a date as [{ slot, meal }], snacks last.
export function menuFor(date) {
  const m = MENU[weekday(date)];
  return [['breakfast', m.breakfast], ['lunch', m.lunch], ['dinner', m.dinner], ...m.snack.map((id) => ['snack', id])]
    .map(([slot, id]) => ({ slot, meal: MEAL_BY_ID[id] }));
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function mealTotals(meals) {
  return meals.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, fib: t.fib + m.fib }), { kcal: 0, p: 0, fib: 0 });
}

// ---- Imports ----
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanWatch(w) {
  if (!w || typeof w !== 'object') return null;
  const c = { moveKcal: num(w.moveKcal, 0, 20000), exMin: num(w.exMin, 0, 1440), steps: num(w.steps, 0, 200000), rhr: num(w.rhr, 20, 220), vo2: num(w.vo2, 5, 100) };
  return { ...c, src: w.src === 'manual' ? 'manual' : 'import' };
}

// Rebuilds a backup with known fields and types only.
export function cleanBackup(data) {
  if (!data || data.v !== 1 || typeof data.days !== 'object' || data.days === null) throw new Error('This file is not a Steady backup.');
  const p = data.profile || {};
  const profile = data.profile ? {
    sex: p.sex === 'f' ? 'f' : 'm', age: num(p.age, 10, 100), heightCm: num(p.heightCm, 100, 250), startWeight: num(p.startWeight, 30, 400),
    rhr: num(p.rhr, 30, 120), maxHr: num(p.maxHr, 100, 230), startDate: DATE.test(p.startDate) ? p.startDate : null,
    kcalTarget: num(p.kcalTarget, 800, 6000), proteinTarget: num(p.proteinTarget, 20, 400), waterBase: num(p.waterBase, 500, 6000),
  } : null;
  if (profile && (!profile.age || !profile.heightCm || !profile.startWeight || !profile.startDate)) throw new Error('The backup profile is incomplete.');
  const days = {};
  for (const [d, v] of Object.entries(data.days)) {
    if (!DATE.test(d) || !v || typeof v !== 'object') continue;
    const arr = (a) => (Array.isArray(a) ? a.slice(0, 200) : []);
    days[d] = {
      foods: arr(v.foods).map((f) => ({ name: str(f.name, 80), slot: str(f.slot, 12), kcal: num(f.kcal, 0, 5000) ?? 0, p: num(f.p, 0, 500) ?? 0, fib: num(f.fib, 0, 200) ?? 0, ref: str(f.ref, 20), t: str(f.t, 5) })),
      water: arr(v.water).map((w) => ({ ml: num(w.ml, 0, 3000) ?? 0, t: str(w.t, 5) })),
      workouts: arr(v.workouts).map((w) => ({ id: str(w.id, 20), name: str(w.name, 60), min: num(w.min, 0, 600) ?? 0, rpe: num(w.rpe, 0, 10) ?? 0, hr: num(w.hr, 30, 230), note: str(w.note, 200), t: str(w.t, 5) })),
    };
    const watch = cleanWatch(v.watch);
    if (watch) days[d].watch = watch;
    const wt = num(v.weight, 30, 400);
    if (wt) days[d].weight = wt;
  }
  const custom = (Array.isArray(data.custom) ? data.custom.slice(0, 200) : []).map((c) => ({ id: str(c.id, 20), name: str(c.name, 80), kcal: num(c.kcal, 0, 5000) ?? 0, p: num(c.p, 0, 500) ?? 0, fib: num(c.fib, 0, 200) ?? 0 }));
  const shopping = {};
  for (const [k, v] of Object.entries(data.shopping || {})) if (v === true) shopping[str(k, 120)] = true;
  return { v: 1, profile, days, custom, shopping };
}

// Merges the daily file made by export_for_app.py. Values typed in by hand win.
export function mergeWatch(state, data) {
  if (!data || data.kind !== 'steady-watch' || typeof data.days !== 'object' || data.days === null) throw new Error('This file is not a Watch export for Steady.');
  let n = 0;
  for (const [d, w] of Object.entries(data.days)) {
    if (!DATE.test(d)) continue;
    const incoming = cleanWatch({ ...w, src: 'import' });
    if (!incoming) continue;
    const day = (state.days[d] ||= emptyDay());
    const own = day.watch;
    if (own?.src === 'manual') {
      for (const k of ['moveKcal', 'exMin', 'steps', 'rhr', 'vo2']) if (own[k] == null) own[k] = incoming[k];
    } else {
      day.watch = incoming;
    }
    n++;
  }
  return n;
}
