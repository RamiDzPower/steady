// Pure functions: dates, plan lookup, targets, daily and weekly numbers, menus, shopping, prep,
// health checks, imports and backups. No DOM access here, so all of it runs under node --test.
import { BLOCKS, SESSIONS, EXERCISES, BODY_PARTS, EX_INFO, MEALS, MENUS, ITEMS, GROUPS, PANTRY, BATCHES, BATCH_ORDER, CHECKINS, REMINDERS, LABS } from './plan.js';

// No prototype, so stored ids like 'constructor' or 'toString' never pass as meals.
export const MEAL_BY_ID = Object.assign(Object.create(null), Object.fromEntries(MEALS.map((m) => [m.id, m])));
export const KCAL_PER_KG = 7700;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);

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
// repeats: Mondays of weeks that repeat the previous plan week instead of moving on.
export function planPosition(startDate, date, repeats = []) {
  const days = diffDays(startDate, date);
  if (days < 0) return { before: true, week: 0, daysToStart: -days };
  const monday = mondayOf(date);
  const held = repeats.filter((r) => r > startDate && r <= monday).length;
  const calWeek = Math.floor(days / 7) + 1;
  const week = Math.max(1, calWeek - held);
  const blockIndex = BLOCKS.findIndex((b) => week >= b.weeks[0] && (b.weeks[1] == null || week <= b.weeks[1]));
  const block = BLOCKS[blockIndex];
  return {
    before: false, week, calWeek, held, repeating: repeats.includes(monday), blockIndex, block,
    weekInBlock: week - block.weeks[0], deload: week >= 16 && week % 4 === 0,
  };
}

export function calendarWeek(startDate, date) {
  const d = diffDays(startDate, date);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}
export function checkIn(startDate, date) {
  const w = calendarWeek(startDate, date);
  return CHECKINS[w] ? { week: w, text: CHECKINS[w] } : null;
}

function plannedSessions(startDate, date, repeats) {
  const pos = planPosition(startDate, date, repeats);
  if (pos.before) return [];
  return pos.block.days[weekday(date)].map((e) => {
    const base = SESSIONS[e.s];
    let minutes = Array.isArray(e.min) ? e.min[Math.min(pos.weekInBlock, e.min.length - 1)] : (e.min ?? base.minutes ?? 0);
    let reps = e.reps ?? null;
    let exercises = base.exercises;
    const easier = pos.deload && base.kind !== 'rest' && e.s !== 'walks';
    if (easier) {
      if (exercises) exercises = exercises.map(([id, sets, r, rest]) => [id, Math.max(1, sets - 1), r, rest]);
      if (e.s === 'intervals' && reps) {
        reps = Math.max(3, reps - 2);
        minutes = 15 + reps * 4;
      } else if (base.kind === 'cardio' || e.s === 'longwalk') {
        minutes = Math.round((minutes * 0.7) / 5) * 5;
      }
    }
    return { ...base, id: e.s, minutes, reps, exercises, deload: easier };
  });
}

// moves: { id, from, to } entries. A moved session leaves its planned day and shows on the new one, planned as it was for its own week.
export function sessionsFor(startDate, date, repeats = [], moves = [], extras = []) {
  const out = plannedSessions(startDate, date, repeats);
  for (const m of moves) {
    if (m.from !== date) continue;
    const i = out.findIndex((x) => x.id === m.id);
    if (i >= 0) out.splice(i, 1);
  }
  for (const m of moves) {
    if (m.to !== date || m.from === date) continue;
    const moved = plannedSessions(startDate, m.from, repeats).find((x) => x.id === m.id);
    if (moved) out.push({ ...moved, movedFrom: m.from });
  }
  for (const x of extras) if (x.date === date && !out.some((o) => o.id === x.id)) out.push(extraSession(startDate, date, repeats, x.id));
  return out;
}

// A session the user added to a day. It is planned as in its own week if the week has it, else as the session is defined.
function extraSession(startDate, date, repeats, id) {
  const monday = mondayOf(date);
  for (let i = 0; i < 7; i++) {
    const found = plannedSessions(startDate, addDays(monday, i), repeats).find((s) => s.id === id);
    if (found) return { ...found, extra: true };
  }
  const base = SESSIONS[id];
  return { ...base, id, minutes: base.minutes || 30, reps: null, exercises: base.exercises, deload: false, extra: true };
}

// The sessions someone could add to `date`: not rest, not the daily walks, not already there.
export function planOptions(state, date) {
  const here = sessionsFor(state.profile.startDate, date, state.repeats || [], state.moves || [], state.extras || []).map((s) => s.id);
  return Object.entries(SESSIONS).filter(([id, s]) => s.kind !== 'rest' && id !== 'walks' && !here.includes(id)).map(([id, s]) => ({ id, name: s.name, minutes: s.minutes || 30 }));
}

// With Rotation, today shows the next session of the week that is not done, whatever weekday it was planned for.
export function rotationSessions(state, date) {
  const p = state.profile;
  const reps = state.repeats || [];
  const monday = mondayOf(date);
  const own = sessionsFor(p.startDate, date, reps, state.moves || [], state.extras || []);
  const walks = own.filter((s) => s.id === 'walks' || s.kind === 'rest');
  const have = {};
  for (let i = 0; i < 7; i++) for (const w of state.days[addDays(monday, i)]?.workouts ?? []) have[w.id] = (have[w.id] ?? 0) + 1;
  for (let i = 0; i < 7; i++) {
    for (const s of sessionsFor(p.startDate, addDays(monday, i), reps, state.moves || [], state.extras || [])) {
      if (s.kind === 'rest' || s.id === 'walks') continue;
      if (have[s.id] > 0) { have[s.id]--; continue; }
      return [...walks.filter((x) => x.kind !== 'rest'), s];
    }
  }
  return walks;
}

// The moves after putting session `id`, now on `at`, on `to`. Moving it back to its planned day removes the move.
export function applyMove(moves, id, at, to) {
  const list = moves.map((m) => ({ ...m }));
  const own = list.find((m) => m.id === id && m.to === at);
  if (own) {
    if (own.from === to) return list.filter((m) => m !== own);
    own.to = to;
    return list;
  }
  if (at === to) return list;
  list.push({ id, from: at, to });
  return list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)).slice(-60);
}

// Seven days from `today` where a session on `at` could go, nearest first, each with whether it already holds one of the same.
export function moveTargets(state, id, at, today) {
  const start = today < state.profile.startDate ? state.profile.startDate : today;
  return Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter((d) => d !== at);
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
    fibre: 30,
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
  return vals.length ? Math.round(mean(vals)) : null;
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
// n days from monday; the doctor summary uses it for a longer period.
export function weekSummary(state, monday, n = 7) {
  const p = state.profile;
  const reps = state.repeats || [];
  const out = { monday, planned: 0, done: 0, strengthDone: 0, exMin: 0, load: 0, steps: [], kcal: [], protein: [], water: [], waterTarget: [], balance: [], weights: [] };
  const base = targets(p, weightOn(state, monday)).waterBase;
  const want = [], have = {};
  for (let i = 0; i < n; i++) {
    const date = addDays(monday, i);
    const day = state.days[date];
    const planned = sessionsFor(p.startDate, date, reps, state.moves || [], state.extras || []).filter((s) => s.kind !== 'rest');
    out.planned += planned.length;
    want.push(...planned.map((s) => s.id));
    for (const w of day?.workouts ?? []) have[w.id] = (have[w.id] ?? 0) + 1;
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
  // A session done on another day than planned still counts for its week.
  for (const id of want) if (have[id] > 0) { have[id]--; out.done++; }
  const avg = (a) => (a.length ? Math.round(mean(a)) : null);
  return {
    ...out,
    stepsAvg: avg(out.steps), kcalAvg: avg(out.kcal), proteinAvg: avg(out.protein),
    waterAvg: avg(out.water), waterTargetAvg: avg(out.waterTarget), balanceAvg: avg(out.balance),
    daysLogged: out.kcal.length,
  };
}

// The larger of sessions done over sessions planned, and Watch exercise minutes over the week's target.
export function weekCompletion(state, monday) {
  const p = state.profile;
  const s = weekSummary(state, monday);
  if (!s.planned) return null;
  const pos = planPosition(p.startDate, monday, state.repeats || []);
  const target = pos.before ? 0 : pos.block.targets.exMin;
  return Math.max(s.done / s.planned, target ? s.exMin / target : 0);
}

// For each finished week below 50%, the next week repeats it. Returns the Mondays added.
// Watch numbers or a session can reach last week after this week's hold was added, so a hold this added goes again once last week reaches half.
export function applyHolds(state, today) {
  const p = state.profile;
  if (!p) return [];
  state.repeats ||= [];
  state.skipHolds ||= [];
  state.autoHolds ||= [];
  const current = mondayOf(today);
  let w = state.holdChecked ? addDays(state.holdChecked, 7) : p.startDate;
  const added = [];
  while (w < current) {
    if (w >= p.startDate) {
      const c = weekCompletion(state, w);
      const next = addDays(w, 7);
      if (c != null && c < 0.5 && !state.repeats.includes(next) && !state.skipHolds.includes(next)) {
        state.repeats.push(next);
        state.autoHolds.push(next);
        added.push(next);
      }
    }
    state.holdChecked = w;
    w = addDays(w, 7);
  }
  if (state.autoHolds.includes(current) && weekCompletion(state, addDays(current, -7)) >= 0.5) state.repeats = state.repeats.filter((r) => r !== current);
  state.repeats.sort();
  return added;
}

export function weekCounts(state, monday) {
  let sugary = 0, purine = 0;
  for (let i = 0; i < 7; i++) {
    for (const f of state.days[addDays(monday, i)]?.foods ?? []) {
      if (f.tags?.includes('sugary')) sugary++;
      if (f.tags?.includes('purine')) purine++;
    }
  }
  return { sugary, purine };
}

// A day without Watch exercise minutes or a logged workout says nothing about effort, so a missing import is not a rest day.
export const effortKnown = (day) => day?.watch?.exMin != null || !!day?.workouts?.length;
const DAY_TOTALS = ['steps', 'moveKcal', 'exMin'];
// A day with steps, Move or exercise minutes from the Watch, whether pasted, imported or typed in.
const watched = (day) => DAY_TOTALS.some((k) => day?.watch?.[k] != null);
// Up to 4 plain sentences on food and water against effort over from..to. A training day has 30 or more effort minutes
// or a logged workout other than the post-meal walks, which the plan asks for on most days, so alone they would make
// every weekday a training day. A sentence needs 2 days on each side it talks about; with less there is nothing to say.
export function insights(state, from, to) {
  const p = state.profile;
  const base = targets(p, weightOn(state, from)).waterBase;
  const train = [], rest = [], underProtein = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = state.days[d];
    if (day?.foods?.length) underProtein.push(foodTotals(day).p < targets(p, weightOn(state, d)).protein);
    if (effortKnown(day)) (effortMinutes(day) >= 30 || day.workouts?.some((w) => w.id !== 'walks') ? train : rest).push(day);
  }
  const of = (n, m, what) => `${n < m ? `${n} of ${m}` : m === 2 ? 'both' : `all ${m}`} ${what}`;
  const than = (diff) => (diff > 0 ? 'training days than on rest days' : 'rest days than on training days');
  const out = [];
  const tw = train.filter((x) => x.water?.length), rw = rest.filter((x) => x.water?.length);
  if (tw.length >= 2) {
    const short = tw.filter((x) => waterTotal(x) < waterTarget(x, base)).length;
    out.push(short ? `Water fell short on ${of(short, tw.length, 'training days')}.` : `You met the water target on ${of(tw.length, tw.length, 'training days')}.`);
  }
  // Gaps under a glass of water or 150 kcal are day-to-day noise, so they read as the same.
  if (tw.length >= 2 && rw.length >= 2) {
    const diff = mean(tw.map(waterTotal)) - mean(rw.map(waterTotal));
    out.push(Math.abs(diff) < 250 ? 'You drank about the same on training and rest days.' : `You drank about ${(Math.round(Math.abs(diff) / 100) / 10).toFixed(1)} L more on ${than(diff)}.`);
  }
  const kcal = (a) => a.filter((x) => x.foods?.length).map((x) => foodTotals(x).kcal);
  const tk = kcal(train), rk = kcal(rest);
  if (tk.length >= 2 && rk.length >= 2) {
    const diff = mean(tk) - mean(rk);
    out.push(Math.abs(diff) < 150 ? 'You ate about the same on training and rest days.' : `You ate about ${(Math.round(Math.abs(diff) / 50) * 50).toLocaleString('en-GB')} kcal more on ${than(diff)}.`);
  }
  const m = underProtein.length, n = underProtein.filter(Boolean).length;
  if (m >= 2) out.push(n ? `Protein was under the target on ${of(n, m, 'logged days')}.` : `You met the protein target on ${of(m, m, 'logged days')}.`);
  return out;
}

// ---- Weight ----
export function weighIns(state) {
  return Object.entries(state.days).filter(([, v]) => v.weight).map(([d, v]) => [d, v.weight]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// Moving average over dated points: each reading pulls the line 1 - 0.9^days of the way towards it (10% a day).
export function smooth(points) {
  let prev = null;
  return points.map(([d, v]) => (prev = [d, prev ? prev[1] + (1 - 0.9 ** diffDays(prev[0], d)) * (v - prev[1]) : v]));
}
export function weightTrend(state) {
  return smooth(weighIns(state));
}
// Least-squares slope through [date, value] points, per day.
function lineSlope(pts) {
  const xs = pts.map(([d]) => diffDays(pts[0][0], d));
  const ys = pts.map(([, v]) => v);
  const mx = mean(xs), my = mean(ys);
  return sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map((x) => (x - mx) ** 2));
}
// Trend change a week over the last 28 days. Needs 3 weigh-ins at least 14 days apart end to end.
export function weightRate(state, today) {
  const from = addDays(today, -28);
  const pts = weightTrend(state).filter(([d]) => d >= from && d <= today);
  const span = pts.length > 1 ? diffDays(pts[0][0], pts.at(-1)[0]) : 0;
  return { kgPerWeek: pts.length >= 3 && span >= 14 ? lineSlope(pts) * 7 : null, from, weighIns: pts.length };
}
// The weight at a BMI of 18.5, the bottom of the healthy range.
export function minWeight(heightCm) {
  return 18.5 * (heightCm / 100) ** 2;
}
// 5% at 12 weeks, 8% at 26 weeks, 10% at 52 weeks, never under a BMI of 18.5 or over the start weight.
export function goalPath(profile) {
  const w = profile.startWeight;
  const at = (f) => Math.min(w, Math.max(w * f, minWeight(profile.heightCm)));
  return [[profile.startDate, w], [addDays(profile.startDate, 84), at(0.95)], [addDays(profile.startDate, 182), at(0.92)], [addDays(profile.startDate, 364), at(0.9)]];
}
// The goal set in More, or the last milestone, never under a BMI of 18.5.
export function goalFor(profile) {
  return Math.max(profile.goalWeight || goalPath(profile).at(-1)[1], minWeight(profile.heightCm));
}
// A weight in tenths of a kg, rounded as the screen shows it, so "reached" and "kg to go" agree with the numbers on show.
const tenths = (kg) => Math.round(kg.toFixed(1) * 10);
// Days from today to a target on the trend carried on at the rate: 0 once there, at least 1 until a weigh-in shows it, null if it falls 0.005 kg a day or slower.
export function etaDays(last, kgPerDay, target, today) {
  if (tenths(last[1]) <= tenths(target)) return 0;
  if (kgPerDay == null || kgPerDay >= -0.005) return null;
  const now = last[1] + kgPerDay * diffDays(last[0], today);
  return Math.max(1, Math.ceil((now - target) / -kgPerDay - 1e-9));
}
// Days under 4 weeks, weeks under 12 weeks, then months.
export function durationText(days) {
  const [n, unit] = days < 28 ? [days, 'day'] : days < 84 ? [Math.round(days / 7), 'week'] : [Math.round(days / 30.44), 'month'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}
// Mondays, or 7 days after the last weigh-in once the plan runs, until this week has a weigh-in.
export function weighInDue(state, today) {
  const last = weighIns(state).filter(([d]) => d <= today).at(-1)?.[0];
  if (last && last >= mondayOf(today)) return false;
  return weekday(today) === 0 || (today >= state.profile.startDate && (!last || diffDays(last, today) >= 7));
}
// VO2max from the Watch (mL/kg/min) on the days that have a reading.
export function vo2Readings(state) {
  return Object.entries(state.days).filter(([, v]) => v.watch?.vo2).map(([d, v]) => [d, v.watch.vo2]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// Weight expected from the energy balance, one point per week from the first weigh-in on or after fromDate.
// Only weeks with food logged on 6 or more days move the line; other weeks leave it flat.
export function predictedWeights(state, toDate, fromDate = '0000-00-00') {
  const ins = weighIns(state).filter(([d]) => d >= fromDate);
  if (!ins.length) return { points: [], weeks: 0 };
  let [start, kg] = ins[0];
  const points = [[start, kg]];
  let weeks = 0;
  for (let w = start; addDays(w, 7) <= toDate; w = addDays(w, 7)) {
    const bals = [];
    for (let i = 0; i < 7; i++) {
      const b = balance(state, addDays(w, i));
      if (b != null) bals.push(b);
    }
    if (bals.length >= 6) {
      kg += (mean(bals) * 7) / KCAL_PER_KG;
      weeks++;
    }
    points.push([addDays(w, 7), kg]);
  }
  return { points, weeks };
}

// Real maintenance calories from the last 28 days: average intake minus the weight trend in kcal.
// Skips the first 14 days of the plan, when water weight distorts the scale.
export function maintenance(state, today) {
  const p = state.profile;
  const to = addDays(today, -1);
  const from = [addDays(today, -28), addDays(p.startDate, 14)].sort().at(-1);
  let n = 0;
  const intake = [], out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = state.days[d];
    if (!day?.foods?.length) continue;
    n++;
    intake.push(foodTotals(day).kcal);
    const b = burn(state, d);
    if (b) out.push(b.total);
  }
  const ins = weighIns(state).filter(([d]) => d >= addDays(from, -7) && d <= today);
  const span = ins.length > 1 ? diffDays(ins[0][0], ins.at(-1)[0]) : 0;
  if (from > to || n < 20 || ins.length < 3 || span < 14) {
    return { ready: false, daysLogged: n, weighIns: ins.length, needDays: Math.max(0, 20 - n), needWeighIns: Math.max(0, 3 - ins.length), from };
  }
  const slope = lineSlope(ins);
  const avgIn = mean(intake);
  const maint = Math.round(avgIn - slope * KCAL_PER_KG);
  return {
    ready: true, daysLogged: n, weighIns: ins.length, intake: Math.round(avgIn), kgPerWeek: slope * 7,
    maintenance: maint, formula: out.length ? Math.round(mean(out)) : null, suggested: Math.max(1500, Math.round((maint - 550) / 50) * 50),
  };
}

// ---- Milestones ----
// Each plan week so far, replayed a day at a time: the day it reached half and all of the plan, and its 5th day with food.
function planWeeks(state, today) {
  const out = [];
  for (let m = mondayOf(state.profile.startDate); m <= today; m = addDays(m, 7)) {
    const w = { half: null, full: null, food5: null, food: 0, share: 0 };
    const days = {};
    for (let i = 0; i < 7 && addDays(m, i) <= today; i++) {
      const d = addDays(m, i);
      if (!state.days[d]) continue;
      days[d] = state.days[d];
      if (days[d].foods?.length && ++w.food === 5) w.food5 = d;
      w.share = weekCompletion({ ...state, days }, m) ?? 0;
      if (w.share >= 0.5) w.half ||= d;
      if (w.share >= 1) w.full ||= d;
    }
    out.push(w);
  }
  return out;
}
// Weeks in a row at half the plan, and the day each run length was first reached. This week can add to a run but not break it.
function runs(weeks) {
  let run = 0;
  const first = {};
  weeks.forEach((w, i) => {
    if (w.half) {
      run++;
      first[run] ||= w.half;
    } else if (i < weeks.length - 1) run = 0;
  });
  return { run, first };
}
export function weekStreak(state, today) {
  return runs(planWeeks(state, today)).run;
}
// Weight milestones judged on the trend, then habits. A milestone not yet done says what is left in detail.
export function milestones(state, today) {
  const p = state.profile;
  const weeks = planWeeks(state, today);
  const { run, first } = runs(weeks);
  const now = weeks.at(-1); // this week, once the plan has started
  const trend = weightTrend(state).filter(([d]) => d <= today);
  const kgNow = trend.at(-1)?.[1] ?? p.startWeight;
  const days = Object.keys(state.days).filter((d) => d <= today).sort();
  const firstKg = {};
  let heavier = null;
  for (const d of days) {
    for (const e of (state.days[d].workouts ?? []).flatMap((w) => w.ex ?? [])) {
      if (!e.kg || !e.sets) continue; // a weight typed in for an exercise then skipped was not lifted
      firstKg[e.id] ??= e.kg;
      if (e.kg > firstKg[e.id]) heavier ||= d;
    }
  }
  const item = (id, title, date, detail, extra) => ({ id, title, detail: date ? '' : detail, done: !!date, date: date || null, ...extra });
  // Milestones clamped to the same weight collapse into one.
  const kgs = goalPath(p).slice(1).map(([, kg]) => kg).filter((kg, i, a) => kg < p.startWeight && kg !== a[i - 1]);
  const later = 'Counts from the start of the plan';
  const weeksLeft = (n) => `${n} more ${n === 1 ? 'week' : 'weeks'} at half the plan or more`;
  return [
    ...kgs.map((kg, i) => item(`weight-${i + 1}`, `${Math.round((1 - kg / p.startWeight) * 100)}% lighter: ${kg.toFixed(1)} kg`,
      trend.find(([d, v]) => d >= p.startDate && tenths(v) <= tenths(kg))?.[0], `${((tenths(kgNow) - tenths(kg)) / 10).toFixed(1)} kg to go`, { kg })),
    item('strength', 'First strength session', days.find((d) => state.days[d].workouts?.some((w) => SESSIONS[w.id]?.kind === 'strength')), '1 session to go'),
    item('food', 'Food logged on 5 days in a week', weeks.find((w) => w.food5)?.food5, now ? `${now.food} of 5 days so far this week` : later),
    item('full-week', 'A full week of the plan', weeks.find((w) => w.full)?.full, now ? `${Math.round(now.share * 100)}% of the plan so far this week` : later),
    ...[4, 8, 12].map((n) => item(`weeks-${n}`, `${n} weeks in a row`, first[n], weeksLeft(n - run))),
    item('heavier', 'First heavier lift', heavier, 'Lift more than your first time on any exercise'),
  ];
}

// ---- Menus, swaps, shopping and prep ----
export function menuIndex(startDate, date) {
  const w = Math.floor(diffDays(startDate, mondayOf(date)) / 7);
  return ((w % MENUS.length) + MENUS.length) % MENUS.length;
}
// The meals planned for a date as [{ key, slot, meal, swapped, planned }]. An excluded meal gets a stand-in, and a swap to it is ignored but kept.
export function menuFor(date, state) {
  const idx = state?.profile ? menuIndex(state.profile.startDate, date) : 0;
  const m = MENUS[idx][weekday(date)];
  const sw = state?.swaps?.[date] || {};
  const ex = state?.excluded || [];
  const foods = state?.days?.[date]?.foods || [];
  // A meal already logged in its slot keeps its row, so excluding it afterwards cannot open that slot for a second meal.
  const out = (id, slot) => ex.includes(id) && !foods.some((f) => f.ref === id && f.slot === slot);
  const rows = [['breakfast', m.breakfast], ['lunch', m.lunch], ['dinner', m.dinner], ...m.snack.map((id, i) => [`snack${i}`, id])];
  const taken = new Set([...rows.map(([, id]) => id), ...Object.values(sw)]); // so a stand-in is not a meal swapped in elsewhere
  return rows.map(([key, id]) => {
    const slot = key.startsWith('snack') ? 'snack' : key;
    const plan = out(id, slot) ? standIn(id, slot, ex, taken) : id;
    taken.add(plan);
    const use = sw[key] && MEAL_BY_ID[sw[key]] && !out(sw[key], slot) ? sw[key] : plan;
    return { key, slot, meal: MEAL_BY_ID[use], swapped: use !== plan, planned: plan };
  });
}
// The closest option in calories, preferring one not yet on the day, then the same kind (home, prep or out); with none left the meal stays.
function standIn(id, slot, ex, taken) {
  const m = MEAL_BY_ID[id];
  const best = swapOptions(slot, ex)
    .map((o) => [(taken.has(o.id) ? 2 : 0) + (o.where === m.where ? 0 : 1), Math.abs(o.kcal - m.kcal), o.id])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
  return best ? best[2] : id;
}
export function mealTotals(meals) {
  return meals.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, fib: t.fib + m.fib }), { kcal: 0, p: 0, fib: 0 });
}
// Food search keeps only letters, their marks (Thai vowels and tone marks) and digits, so 'saltgrilled' finds 'Salt-grilled fish'.
const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
export const matches = (name, q) => squash(name).includes(squash(q));
// Lunches and dinners swap with each other; breakfasts and snacks with their own kind.
export function swapOptions(slot, excluded = []) {
  const kinds = slot === 'breakfast' || slot === 'snack' ? [slot] : ['lunch', 'dinner'];
  return MEALS.filter((m) => kinds.includes(m.slot) && !excluded.includes(m.id));
}

export function formatAmount(item, q) {
  if (item.pack) {
    const n = Math.ceil(q / item.pack - 1e-9);
    return `${n} ${item.packName}${n > 1 ? 's' : ''}`;
  }
  if (item.unit === 'pcs') return String(Math.max(1, Math.ceil(q - 1e-9)));
  const v = Math.ceil(q / item.step - 1e-9) * item.step;
  if (item.unit === 'ml') return v >= 1000 ? `${Math.round(v / 100) / 10} L` : `${v} ml`;
  return v >= 1000 ? `${Math.round(v / 100) / 10} kg` : `${v} g`;
}

// Everything to buy for the week's meals, batches included, grouped by aisle.
export function shoppingFor(state, monday) {
  const tot = {};
  const add = (k, q) => { if (ITEMS[k]) tot[k] = (tot[k] || 0) + q; };
  for (let i = 0; i < 7; i++) {
    for (const { meal } of menuFor(addDays(monday, i), state)) {
      for (const [k, q] of Object.entries(meal.buy || {})) add(k, q);
      for (const [b, q] of meal.batches || []) for (const [k, per] of Object.entries(BATCHES[b].buy)) add(k, per * q);
    }
  }
  return GROUPS.map(([id, name]) => ({
    id, name,
    items: Object.keys(ITEMS).filter((k) => tot[k] && ITEMS[k].group === id).map((k) => ({ key: k, name: ITEMS[k].name, amount: formatAmount(ITEMS[k], tot[k]) })),
  })).filter((g) => g.items.length);
}

// The week's list as plain text for Messages or Notes: what is still to buy by aisle, then the cupboard checks.
export function shoppingText(state, monday, title) {
  const ticks = state.shopping?.[monday] || {};
  const lines = [title];
  for (const g of shoppingFor(state, monday)) {
    const left = g.items.filter((it) => !ticks[it.key]);
    if (left.length) lines.push('', g.name, ...left.map((it) => `- ${it.name}: ${it.amount}`));
  }
  const cupboard = PANTRY.filter((_, i) => !ticks[`pantry:${i}`]);
  if (cupboard.length) lines.push('', 'Check the cupboard', ...cupboard.map((x) => `- ${x}`));
  return lines.join('\n');
}

// Two prep sessions per week: Sunday cooks for Monday to Wednesday, Wednesday for Thursday to Sunday.
// Portions eaten more than 3 days after cooking go in the freezer.
export function prepFor(state, monday) {
  const plan = [['Sunday', addDays(monday, -1), [0, 1, 2]], ['Wednesday', addDays(monday, 2), [3, 4, 5, 6]]];
  return plan.map(([day, date, offsets]) => {
    const totals = {};
    const covers = [], freeze = [], fresh = [];
    for (const o of offsets) {
      const d = addDays(monday, o);
      for (const { meal } of menuFor(d, state)) {
        if (meal.where === 'out' || meal.slot === 'snack') continue;
        if (meal.batches?.length) {
          for (const [b, q] of meal.batches) totals[b] = (totals[b] || 0) + q;
          (diffDays(date, d) > 3 ? freeze : covers).push({ date: d, name: meal.name });
        }
        if (meal.where === 'home') fresh.push({ date: d, name: meal.name });
      }
    }
    return { day, date, steps: BATCH_ORDER.filter((b) => totals[b]).map((b) => BATCHES[b].how(totals[b])), covers, freeze, fresh };
  });
}

// ---- Strength ----
export function repSpec(spec) {
  const nums = (String(spec).match(/\d+/g) || []).map(Number);
  return { top: nums.length ? Math.max(...nums) : null, unit: /second/.test(spec) ? 's' : /\d\s*m\b/.test(spec) ? 'm' : 'reps' };
}
export function lastStrength(state, exId, beforeDate) {
  const dates = Object.keys(state.days).filter((d) => d < beforeDate).sort().reverse();
  for (const d of dates) {
    for (const w of [...(state.days[d].workouts ?? [])].reverse()) {
      const e = w.ex?.find((x) => x.id === exId);
      if (e && (e.kg != null || e.reps != null)) return { date: d, ...e };
    }
  }
  return null;
}
export function strengthHint(last, spec) {
  if (!last) return null;
  const { top, unit } = repSpec(spec);
  const word = unit === 'reps' ? 'reps' : unit === 's' ? 'seconds' : 'metres';
  const allSets = (last.sets ?? 0) >= (last.planned ?? 1);
  const topReached = top == null || (last.reps ?? 0) >= top;
  if (!allSets || !topReached) return `Stay at ${last.kg ? `${last.kg} kg` : 'the same level'} and aim for ${top ?? 'every'} ${word} on every set.`;
  if (last.kg) {
    const next = Math.max(last.kg + 1, Math.round(last.kg * 1.05 * 2) / 2);
    return `You hit every set last time. Try ${+next.toFixed(1)} kg.`;
  }
  return unit === 's' ? 'You hit every set last time. Add 5 seconds or try the harder version.' : 'You hit every set last time. Add 2 reps or try the harder version.';
}

// ---- The running session ----
// Milliseconds the session has run, leaving out the time it spent paused.
export function activeMs(a, now) {
  return Math.max(0, (a.pausedAt ?? now) - a.start - (a.pausedMs || 0));
}
// A clock past 10 hours, or one still running since an earlier day, timed a session nobody finished, not the workout.
// A pause stops the clock, so a session paused yesterday still knows its minutes.
export function leftRunning(a, now) {
  return activeMs(a, now) > 600 * 60000 || (!a.pausedAt && iso(new Date(a.start)) < iso(new Date(now)));
}
// Resuming adds the pause to the running total, so a pause survives the app being closed.
export function setPaused(a, on, now) {
  if (on && !a.pausedAt) a.pausedAt = now;
  else if (!on && a.pausedAt) {
    a.pausedMs = (a.pausedMs || 0) + now - a.pausedAt;
    a.pausedAt = null;
  }
}
// The next set to do: the first exercise from index `from` on that has sets left, wrapping round to the start.
export function nextUp(exercises, sets, from = 0) {
  for (let j = 0; j < exercises.length; j++) {
    const i = (from + j) % exercises.length;
    const done = sets?.[i] ?? 0;
    if (done < exercises[i][1]) return { i, set: done + 1, of: exercises[i][1] };
  }
  return null;
}
// Lifts with at least one set done at more weight than the last log of that exercise before `date`.
// A last log with no kg is left out: it can mean bodyweight, a loaded backpack or a weight nobody typed in.
export function heavierLifts(state, ex, date) {
  return ex.flatMap((e) => {
    const last = lastStrength(state, e.id, date);
    return e.kg && e.sets && last?.kg && e.kg > last.kg ? [{ id: e.id, kg: e.kg, was: last.kg }] : [];
  });
}
// ---- Week streak with freezes, challenges, recent workouts ----
export const STREAK_BADGES = [4, 12, 26, 52, 104];
export const FREEZE_MAX = 2;
// Weeks in a row at half the plan or more. A missed week spends a freeze and keeps the run; a freeze comes back after 4 good weeks in a row.
// Without a freeze a missed week ends the run. This week can add to it but not break it.
export function streakInfo(state, today) {
  const weeks = state.profile ? planWeeks(state, today) : [];
  let run = 0, best = 0, freezes = FREEZE_MAX, good = 0, used = 0;
  weeks.forEach((w, i) => {
    if (w.half) {
      run++;
      if (++good >= 4 && freezes < FREEZE_MAX) { freezes++; good = 0; }
    } else if (i < weeks.length - 1) {
      good = 0;
      if (freezes > 0) { freezes--; used++; } else run = 0;
    }
    best = Math.max(best, run);
  });
  return { current: run, best, freezes, used, next: STREAK_BADGES.find((b) => b > run) ?? null, earned: STREAK_BADGES.filter((b) => b <= best) };
}

// Three goals for the month of `today`, each with how far along it is.
export function monthlyChallenges(state, today) {
  const month = today.slice(0, 7);
  const base = state.profile ? targets(state.profile, weightOn(state, today)).waterBase : 2500;
  let sessions = 0, food = 0, water = 0;
  for (const [d, day] of Object.entries(state.days)) {
    if (!d.startsWith(month) || d > today) continue;
    sessions += (day.workouts ?? []).filter((w) => w.id !== 'walks').length;
    if (day.foods?.length) food++;
    if (day.water?.length && waterTotal(day) >= waterTarget(day, base)) water++;
  }
  const item = (id, title, value, target) => ({ id, title, value, target, done: value >= target });
  return [item('train', 'Train 8 times', sessions, 8), item('food', 'Log your food on 20 days', food, 20), item('water', 'Reach your water target on 15 days', water, 15)];
}

// A workout's weight lifted, and how many of its lifts beat everything logged before that day.
function liftStats(state, date, w) {
  let sets = 0, kg = 0, prs = 0;
  for (const e of w.ex ?? []) {
    if (!(e.sets > 0)) continue;
    sets += e.sets;
    if (e.kg > 0 && e.reps > 0) kg += e.kg * e.reps * e.sets;
    const best = e.kg > 0 ? bestKg(state, e.id, date) : null;
    if (best != null && e.kg > best) prs++;
  }
  return { sets, kg: Math.round(kg * 10) / 10, prs };
}
// The latest logged workouts, newest first, not counting the daily walks.
export function recentWorkouts(state, today, n = 5) {
  const out = [];
  for (const d of Object.keys(state.days).filter((x) => x <= today).sort().reverse()) {
    for (const w of [...(state.days[d].workouts ?? [])].reverse()) {
      if (w.id === 'walks') continue;
      out.push({ date: d, id: w.id, name: SESSIONS[w.id]?.name ?? w.name ?? 'Workout', min: w.min ?? 0, ...liftStats(state, d, w) });
      if (out.length >= n) return out;
    }
  }
  return out;
}
// Trend change over the last 30 days, or since the first weigh-in once that is at least 14 days ago. Null before that.
export function weightChange30(state, today) {
  const t = weightTrend(state).filter(([d]) => d <= today);
  if (t.length < 2) return null;
  const now = t.at(-1);
  const old = [...t].reverse().find(([d]) => d <= addDays(today, -30)) ?? t[0];
  return diffDays(old[0], now[0]) >= 14 ? Math.round((now[1] - old[1]) * 10) / 10 : null;
}
// A weight chart's points for 1M, 3M, 1Y or All, as [date, kg] readings and the trend through them.
export function weightRange(state, range, today) {
  const days = { '1M': 30, '3M': 91, '1Y': 365 }[range];
  const from = days ? addDays(today, -days) : '0000-00-00';
  return { readings: weighIns(state).filter(([d]) => d >= from && d <= today), trend: weightTrend(state).filter(([d]) => d >= from && d <= today) };
}

// An exercise by id: the plan's, or one the user made.
export function exerciseOf(state, id) {
  if (Object.hasOwn(EXERCISES, id)) return { ...EXERCISES[id], ...EX_INFO[id] };
  const c = (state.customEx ?? []).find((x) => x.id === id);
  return c ? { name: c.name, cue: '', alt: '', part: c.part, gear: 'Your own', unit: c.unit, custom: true } : null;
}

// The most weight ever logged for an exercise on a day before `date`, or null when it has never been logged with a weight.
export function bestKg(state, exId, date) {
  let best = null;
  for (const [d, day] of Object.entries(state.days)) {
    if (d >= date) continue;
    for (const w of day.workouts ?? []) for (const e of w.ex ?? []) if (e.id === exId && e.kg > 0 && e.sets && (best == null || e.kg > best)) best = e.kg;
  }
  return best;
}

// The last `weeks` weeks as columns that start on Monday, ending with the week of `today`.
// Each day has its exercise minutes (`min`), the weight lifted (`vol`) and a level from 0 (nothing) to 4 for the chosen metric;
// days after today are marked `future`. `months` lists the columns that hold the 1st of a month, for labels.
export function activityGrid(state, today, weeks = 12, metric = 'time') {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const cols = [], months = [];
  let active = 0, counted = 0, top = 0;
  const volumeOf = (day) => {
    let v = 0;
    for (const w of day?.workouts ?? []) for (const e of w.ex ?? []) if (e.kg > 0 && e.reps > 0 && e.sets > 0) v += e.kg * e.reps * e.sets;
    return Math.round(v);
  };
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(first, w * 7 + d);
      const future = date > today;
      const min = future ? 0 : effortMinutes(state.days[date]);
      const vol = future ? 0 : volumeOf(state.days[date]);
      top = Math.max(top, vol);
      if (!future && date >= (state.profile?.startDate ?? first)) { counted++; if (min || vol) active++; }
      if (date.endsWith('-01')) months.push({ col: w, month: Number(date.slice(5, 7)) });
      col.push({ date, min, vol, level: 0, future });
    }
    cols.push(col);
  }
  for (const col of cols) for (const c of col) {
    c.level = metric === 'volume'
      ? (c.vol ? Math.max(1, Math.ceil((c.vol / top) * 4)) : 0)
      : !c.min ? 0 : c.min < 20 ? 1 : c.min < 40 ? 2 : c.min < 70 ? 3 : 4;
  }
  return { cols, months, active, counted };
}

// Lifetime numbers: sessions (not the daily walks), this month's, active days, and the weight lifted in logged sets.
export function totals(state, today) {
  const month = today.slice(0, 7);
  let sessions = 0, thisMonth = 0, activeDays = 0, liftedKg = 0;
  for (const [d, day] of Object.entries(state.days)) {
    if (d > today) continue;
    if (effortMinutes(day)) activeDays++;
    for (const w of day.workouts ?? []) {
      if (w.id !== 'walks') { sessions++; if (d.startsWith(month)) thisMonth++; }
      for (const e of w.ex ?? []) if (e.kg > 0 && e.reps > 0 && e.sets > 0) liftedKg += e.kg * e.reps * e.sets;
    }
  }
  return { sessions, thisMonth, activeDays, liftedKg: Math.round(liftedKg) };
}
// The first planned session on or after `from` that is not a rest day or the daily walks, and is not logged yet.
export function nextSession(state, from) {
  for (let i = 0; i < 14; i++) {
    const date = addDays(from, i);
    const s = sessionsFor(state.profile.startDate, date, state.repeats || [], state.moves || [], state.extras || [])
      .find((x) => x.kind !== 'rest' && x.id !== 'walks' && !state.days[date]?.workouts?.some((w) => w.id === x.id));
    if (s) return { date, session: s };
  }
  return null;
}

// ---- Health checks ----
export function labStatus(key, v) {
  const lab = LABS.find((l) => l.key === key);
  return lab && v != null ? lab.status(v) : null;
}
// Home readings from the last 7 days (clinic readings are left out).
export function bpSummary(bp, today) {
  const recent = (bp ?? []).filter((r) => !r.clinic && r.date > addDays(today, -7) && r.date <= today);
  if (!recent.length) return null;
  const sys = Math.round(mean(recent.map((r) => r.sys)));
  const dia = Math.round(mean(recent.map((r) => r.dia)));
  const level = sys >= 140 || dia >= 90 ? 'high' : sys >= 130 || dia >= 80 ? 'raised' : sys >= 120 ? 'elevated' : 'normal';
  return { n: recent.length, sys, dia, level, crisis: recent.some((r) => r.sys >= 180 || r.dia >= 120) };
}

// The numbers for a one-page summary for a doctor, over from..to but not before the plan start. No names or identifiers.
// Points are [date, value]. Blood tests take the last two results up to the end however old, as tests are months apart.
export function doctorSummary(state, from, to) {
  const p = state.profile;
  if (from < p.startDate) from = p.startDate;
  const days = Math.max(0, diffDays(from, to) + 1);
  const wk = weekSummary(state, from, days);
  const byDate = (a, b) => (a.date < b.date ? -1 : 1);
  const avg = (a) => (a.length ? Math.round(mean(a)) : null);
  // The trend holds its value between weigh-ins, so the one before the period is its value on the first day, and dated so.
  const tr = weightTrend(state).filter(([d]) => d <= to);
  const held = tr.filter(([d]) => d <= from).at(-1) ?? tr[0], end = tr.at(-1);
  const start = held && [held[0] < from ? from : held[0], held[1]];
  const ins = weighIns(state).filter(([d]) => d <= to);
  const home = (state.bp ?? []).filter((r) => !r.clinic && r.date >= from && r.date <= to);
  const waist = (state.waist ?? []).filter((w) => w.date <= to).sort(byDate);
  const w0 = waist.filter((w) => w.date <= from).at(-1) ?? waist[0], w1 = waist.at(-1);
  const fed = []; // the targets on each day with food logged, as the limit moves with weight
  for (let d = from; d <= to; d = addDays(d, 1)) if (state.days[d]?.foods?.length) fed.push(targets(p, weightOn(state, d)));
  // Exercise counts the days that say something about it: Watch numbers or a logged session, and every day of a week with
  // sessions but no Watch numbers, as without the Watch a day with no session is a rest day. A day never pasted is not.
  const weeks = {};
  for (let d = from; d <= to; d = addDays(d, 1)) (weeks[mondayOf(d)] ||= []).push(state.days[d]);
  const ex = Object.values(weeks).flatMap((w) => (w.some(watched) ? w.filter((x) => watched(x) || x?.workouts?.length) : w.some((x) => x?.workouts?.length) ? w : []));
  return {
    from, to, days,
    weight: end ? {
      start, end, change: end[0] > start[0] ? end[1] - start[1] : null, kgPerWeek: weightRate(state, to).kgPerWeek, last: ins.at(-1),
      trend: [start, ...tr.filter(([d]) => d > held[0])], weighIns: ins.filter(([d]) => d >= from),
    } : null,
    bp: {
      week: bpSummary(state.bp, to), n: home.length, sys: avg(home.map((r) => r.sys)), dia: avg(home.map((r) => r.dia)),
      high: home.reduce((a, r) => (!a || r.sys > a.sys || (r.sys === a.sys && r.dia > a.dia) ? r : a), null),
    },
    labs: LABS.map((l) => {
      const rows = (state.labs ?? []).filter((x) => x[l.key] != null && x.date <= to).sort(byDate);
      const now = rows.at(-1), was = rows.at(-2);
      return { name: l.name, unit: l.unit, target: l.target.split(' (')[0], latest: now ? [now.date, now[l.key]] : null, previous: was ? [was.date, was[l.key]] : null, status: now ? labStatus(l.key, now[l.key]) : null };
    }),
    waist: w1 ? { latest: [w1.date, w1.cm], since: w0.date, change: w1 !== w0 ? w1.cm - w0.cm : null } : null,
    training: { done: wk.done, planned: wk.planned, exMinPerWeek: ex.length ? Math.round((sum(ex.map(effortMinutes)) * 7) / ex.length) : null, exDays: ex.length, stepsAvg: wk.stepsAvg },
    food: { daysLogged: wk.daysLogged, kcal: wk.kcalAvg, protein: wk.proteinAvg, kcalTarget: avg(fed.map((t) => t.kcal)), proteinTarget: avg(fed.map((t) => t.protein)) },
  };
}

// ---- Watch numbers pasted from an iPhone Shortcut ----
// Shortcuts writes the phone's decimal mark and never groups thousands, so one mark is a decimal point (640.538 or
// 640,538). With two different marks the last is the decimal point (1,196.4); one mark used twice groups thousands
// (1.234.567), and so does a single mark before exactly three digits in a whole count like steps or Move (8,123).
export function parseNum(raw, whole = false) {
  let s = String(raw ?? '').replace(/[\s'\u2019]/g, '');
  const marks = s.match(/[.,]/g) || [];
  const at = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (new Set(marks).size === 1 && (marks.length > 1 || (whole && s.length - at === 4))) s = s.replace(/[.,]/g, '');
  else if (marks.length) s = `${s.slice(0, at).replace(/[.,]/g, '')}.${s.slice(at + 1)}`;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
// The first number in a value, without its label or unit ('Steps: 8,123', '640.5 kcal'). A plain space joins only
// before exactly three digits, so '8 123' is one number and '640 kcal' stops at the unit. A whole count that reads
// past its range had a decimal point after all (640.538 kcal when Round Number is left out), so it is read as one.
function firstNum(v, key) {
  if (typeof v === 'number') return v;
  const m = typeof v === 'string' ? v.match(/\d(?:[\d.,'\u2019\u00a0\u202f]| (?=\d{3}(?!\d)))*/) : null;
  if (!m) return null;
  const n = parseNum(m[0], WHOLE.includes(key));
  return n > WATCH_RANGE[key]?.[1] ? parseNum(m[0]) : n;
}
// yyyy-MM-dd with an optional ISO time. A year of 2400 or more is Buddhist (a Thai-region phone writes 2569 for 2026),
// and a time with Z or an offset is moved to the phone's own time zone before the date is read.
const STAMP = /\b(\d{4})-(\d\d)-(\d\d)(?:T(\d\d:\d\d(?::\d\d(?:\.\d+)?)?)(Z|[+-]\d\d:?\d\d)?)?/;
const STAMPS = new RegExp(STAMP.source, 'g');
function readDay(text, m = String(text).match(STAMP)) {
  const [, y, mo, d, time, zone] = m || [];
  const day = m && `${+y >= 2400 ? +y - 543 : y}-${mo}-${d}`;
  const t = zone ? new Date(`${day}T${time}${zone.replace(/^([+-]\d\d)(\d\d)$/, '$1:$2')}`) : null;
  if (!m || iso(parse(day)) !== day || (t && Number.isNaN(t.getTime()))) {
    throw new Error(`Steady cannot read the date in "${String(text).trim().slice(0, 30)}". In the shortcut, set Date Format to Custom and the format string to yyyy-MM-dd.`);
  }
  return t ? iso(t) : day;
}
const FIELDS = [['vo2', /vo2|cardio/], ['steps', /step/], ['exMin', /exer|exmin/], ['rhr', /rhr|resting ?heart/], ['moveKcal', /move|active/]];
const fieldOf = (s) => FIELDS.find(([, re]) => re.test(s.toLowerCase()))?.[0];
const FIELD_NAME = { steps: 'Steps', moveKcal: 'Active Energy', exMin: 'Exercise Minutes', rhr: 'Resting Heart Rate', vo2: 'Cardio Fitness' };
const WHOLE = ['steps', 'moveKcal', 'exMin']; // kept as whole numbers, so a Move of 1,234 typed into the paste box is 1234 kcal, not 1
const WATCH_RANGE = { moveKcal: [0, 20000], exMin: [0, 1440], steps: [0, 200000], rhr: [20, 220], vo2: [5, 100] };
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Reads what the Steady Watch shortcut copies: a line naming the type (steps, move, exercise, vo2), then its dates
// and its values in the same order, so a week pastes at once. Also takes one-day lines ('Steps: 8,123'), a JSON object
// or array of days, and the Mac's steady-watch file. Returns a steady-watch document; mergeWatch checks the ranges.
export function parseWatchPaste(text, fallbackDate) {
  const raw = String(text ?? '').trim();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (data?.kind === 'steady-watch') return data;
  const parts = []; // { key, dates, nums, at }: one type, with its dates and values paired in order
  let date = null;
  if (data && typeof data === 'object') {
    for (const o of [data].flat()) {
      if (!o || typeof o !== 'object') continue;
      const dk = Object.keys(o).find((k) => /date/i.test(k));
      const dates = [o[dk] ?? []].flat().filter((s) => s != null && s !== '').map((s) => readDay(s));
      for (const [k, v] of Object.entries(o)) {
        const key = k === dk ? null : fieldOf(k);
        if (key) parts.push({ key, dates, nums: [v].flat().map((x) => firstNum(x, key)) });
      }
    }
  } else {
    for (const line of raw.split(/[\r\n;]+/)) {
      const found = [...line.matchAll(STAMPS)];
      const rest = line.replace(STAMPS, ' ');
      const word = /^\s*[a-z]/i.test(rest);
      const key = word ? fieldOf(rest) : null;
      if (word && !key && /\bdate\b/i.test(rest)) { if (/\d/.test(line)) date = readDay(line); continue; } // names the day of one-day lines; a blank one is skipped
      // A type name starts a part, and a label or plain words end it. Words with digits (Nov 2, 2026) stay in it as values,
      // so a date in the wrong format shows up as a count that does not match.
      if (key || (word && (!/\d/.test(rest) || /[:=]/.test(rest)))) parts.push({ key, dates: [], nums: [], at: date });
      const p = parts.at(-1);
      if (!p) continue;
      p.dates.push(...found.map((m) => readDay(m[0], m)));
      const n = firstNum(rest.replace(/vo2/gi, ''), p.key);
      if (n != null) p.nums.push(n);
    }
  }
  const days = {};
  for (const { key, dates, nums, at } of parts) {
    if (!key) continue;
    const pairs = dates.length === nums.length ? dates.map((d, i) => [d, nums[i]])
      : !dates.length && nums.length === 1 ? [[at ?? date ?? fallbackDate, nums[0]]] : null;
    if (!pairs) throw new Error(`${FIELD_NAME[key]} came with ${count(dates.length, 'date')} and ${count(nums.length, 'number')}. In the shortcut, check its Format Date and Round Number.`);
    for (const [d, n] of pairs) {
      if (!d || n == null || (!n && key !== 'exMin')) continue; // blank, or a zero meaning no samples that day
      const v = key === 'vo2' ? Math.round(n * 10) / 10 : Math.round(n);
      const [lo, hi] = WATCH_RANGE[key];
      // A number no day can have would be dropped later without a word, while the paste still counted its day.
      if (v < lo || v > hi) throw new Error(`${FIELD_NAME[key]} for ${d} came as ${v}, which is out of range. In the shortcut, check its Unit and Round Number.`);
      const w = (days[d] ||= {});
      w[key] = Math.max(w[key] ?? 0, v); // a day that comes twice keeps the larger
    }
  }
  if (!Object.keys(days).length) throw new Error('No Watch numbers found in what was pasted. Run the Steady Watch shortcut first.');
  // Grouped by day, the exercise search leaves out a day with no exercise, so a day the Watch counted steps or Move on had
  // 0 minutes. Not the first day, though: a 7-day search can start partway through it, after that day's exercise.
  if (parts.some((p) => p.key === 'exMin')) for (const d of Object.keys(days).sort().slice(1)) if (days[d].exMin == null && (days[d].steps || days[d].moveKcal)) days[d].exMin = 0;
  return { kind: 'steady-watch', days };
}

// Daily totals for the Steady to Health shortcut.
export function healthTotals(state, date) {
  const day = state.days[date];
  const t = foodTotals(day);
  return { date, energy: t.kcal, protein: t.p, water: waterTotal(day), fibre: t.fib };
}

// ---- Reminders as an iCalendar file ----
function firstOccurrence(rule, startDate) {
  const by = rule.match(/BYDAY=(\w\w)/)?.[1];
  let d = startDate;
  if (by) {
    const target = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(by);
    while (weekday(d) !== target) d = addDays(d, 1);
  }
  const md = rule.match(/BYMONTHDAY=(\d+)/)?.[1];
  if (md) while (parse(d).getDate() !== Number(md)) d = addDays(d, 1);
  return d;
}
export function icsFile(settings, startDate, now) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const text = (s) => s.replace(/([\\,;])/g, '\\$1');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Steady//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let n = 0;
  for (const r of REMINDERS) {
    const s = settings?.[r.id] ?? {};
    if (s.on === false) continue;
    const time = /^\d{2}:\d{2}$/.test(s.time || '') ? s.time : r.time;
    const first = firstOccurrence(r.rule, startDate);
    lines.push('BEGIN:VEVENT', `UID:steady-${r.id}@steady-app`, `DTSTAMP:${stamp}`, `DTSTART:${first.replace(/-/g, '')}T${time.replace(':', '')}00`,
      'DURATION:PT10M', `RRULE:${r.rule}`, `SUMMARY:${text(r.title)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    n++;
  }
  lines.push('END:VCALENDAR');
  return { text: `${lines.join('\r\n')}\r\n`, count: n };
}

// ---- Passcode-protected backups: AES-GCM with a PBKDF2 key (Web Crypto) ----
const te = new TextEncoder(), td = new TextDecoder();
function toB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
async function keyFrom(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptJson(obj, pass, iterations = 250000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(pass, salt, iterations);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { kind: 'steady-encrypted', v: 1, iterations, salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
}
export async function decryptJson(file, pass) {
  if (file?.kind !== 'steady-encrypted') throw new Error('This file is not a protected Steady backup.');
  try {
    const key = await keyFrom(pass, fromB64(file.salt), file.iterations || 250000);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv) }, key, fromB64(file.data));
    return JSON.parse(td.decode(plain));
  } catch {
    throw new Error('Wrong passcode, or the file is damaged.');
  }
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
// Which characters of a new number roll in: the digits that differ from the old number in the same place counted from the right.
export const rollMask = (was, now) => [...now].map((c, i) => /\d/.test(c) && was[was.length - now.length + i] !== c);

// ---- Taps ----
// A one-shot action tapped again within ms of the last tap is a double tap, not a second request, so it should not run.
// Every entry newer than the one the user last saw, newest first; with none, the latest, as the More row opens it too.
export function changesSince(changes, seen) {
  const fresh = changes.filter((c) => c.version > seen);
  return fresh.length ? fresh : changes.slice(0, 1);
}
export function firstTap(last, key, now, ms = 600) {
  const repeat = now - (last[key] ?? -Infinity) < ms;
  last[key] = now;
  return !repeat;
}
// The second tap of a double tap lands where the first one did, on whatever the first one put there, so only time and place tell it.
export function sameTap(first, t, x, y, ms = 600, px = 24) {
  return !!first && t - first.t < ms && Math.hypot(x - first.x, y - first.y) < px;
}
// The stretch of the x axis each chart point answers taps on: out to the midpoints with its neighbours, at most reach either way.
export function tapSpans(xs, reach, lo, hi) {
  return xs.map((x, i) => [Math.max(lo, x - reach, i ? (xs[i - 1] + x) / 2 : lo), Math.min(hi, x + reach, i < xs.length - 1 ? (x + xs[i + 1]) / 2 : hi)]);
}

// ---- Imports ----
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const arr = (a, n = 500) => (Array.isArray(a) ? a.slice(0, n) : []);
const dates = (a) => arr(a).filter((d) => typeof d === 'string' && DATE.test(d));
const tags = (a) => arr(a, 4).filter((t) => t === 'sugary' || t === 'purine');
const TIME = /^\d{2}:\d{2}$/;

function cleanWatch(w) {
  if (!w || typeof w !== 'object') return null;
  const c = Object.fromEntries(Object.entries(WATCH_RANGE).map(([k, [lo, hi]]) => [k, num(w[k], lo, hi)]));
  return { ...c, src: ['manual', 'shortcut'].includes(w.src) ? w.src : 'import' };
}
function cleanLabs(a) {
  const ranges = { fbs: [30, 600], a1c: [3, 20], uric: [0.5, 20], ldl: [10, 400], hdl: [5, 200], tg: [10, 3000] };
  return arr(a).filter((l) => l && DATE.test(l.date)).map((l) => {
    const out = { date: l.date, note: str(l.note, 120) };
    for (const [k, [lo, hi]] of Object.entries(ranges)) out[k] = num(l[k], lo, hi);
    return out;
  });
}
// Readings are kept oldest first, so the cap drops the oldest ones.
function cleanBp(a) {
  return (Array.isArray(a) ? a.slice(-2000) : []).filter((r) => r && DATE.test(r.date) && num(r.sys, 60, 260) && num(r.dia, 30, 160))
    .map((r) => ({ date: r.date, t: TIME.test(r.t) ? r.t : '', sys: r.sys, dia: r.dia, pulse: num(r.pulse, 30, 220), clinic: r.clinic === true }));
}
function cleanWaist(a) {
  return arr(a).filter((w) => w && DATE.test(w.date) && num(w.cm, 40, 250)).map((w) => ({ date: w.date, cm: w.cm }));
}
function cleanSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const reminders = {};
  for (const r of REMINDERS) {
    const v = o.reminders?.[r.id];
    if (v && typeof v === 'object') reminders[r.id] = { on: v.on !== false, time: TIME.test(v.time) ? v.time : r.time };
  }
  const hot = arr(o.hotMonths, 12).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return { hotMonths: o.hotMonths ? [...new Set(hot)] : [3, 4, 5], loudBeep: o.loudBeep === true, train: o.train === 'rotation' ? 'rotation' : 'fixed', watchSeen: o.watchSeen === true, theme: ['light', 'dark'].includes(o.theme) ? o.theme : 'auto', reminders };
}

// Rebuilds a backup with known fields and types only.
export function cleanBackup(data) {
  if (!data || data.v !== 1 || typeof data.days !== 'object' || data.days === null) throw new Error('This file is not a Steady backup.');
  const p = data.profile || {};
  const profile = data.profile ? {
    sex: p.sex === 'f' ? 'f' : 'm', age: num(p.age, 10, 100), heightCm: num(p.heightCm, 100, 250), startWeight: num(p.startWeight, 30, 400),
    rhr: num(p.rhr, 30, 120), maxHr: num(p.maxHr, 100, 230), startDate: DATE.test(p.startDate) ? p.startDate : null,
    kcalTarget: num(p.kcalTarget, 800, 6000), proteinTarget: num(p.proteinTarget, 20, 400), waterBase: num(p.waterBase, 500, 6000),
    nextLab: DATE.test(p.nextLab) ? p.nextLab : null,
    goalWeight: num(p.goalWeight, 30, 400), vo2Target: num(p.vo2Target, 5, 100),
  } : null;
  if (profile && (!profile.age || !profile.heightCm || !profile.startWeight || !profile.startDate)) throw new Error('The backup profile is incomplete.');
  const days = {};
  for (const [d, v] of Object.entries(data.days)) {
    if (!DATE.test(d) || !v || typeof v !== 'object') continue;
    days[d] = {
      foods: arr(v.foods, 200).map((f) => ({ name: str(f.name, 80), slot: str(f.slot, 12), kcal: num(f.kcal, 0, 5000) ?? 0, p: num(f.p, 0, 500) ?? 0, fib: num(f.fib, 0, 200) ?? 0, ref: str(f.ref, 20), t: str(f.t, 5), tags: tags(f.tags) })),
      water: arr(v.water, 200).map((w) => ({ ml: num(w.ml, 0, 3000) ?? 0, t: str(w.t, 5) })),
      workouts: arr(v.workouts, 50).map((w) => ({
        id: str(w.id, 20), name: str(w.name, 60), min: num(w.min, 0, 600) ?? 0, rpe: num(w.rpe, 0, 10) ?? 0, hr: num(w.hr, 30, 230), note: str(w.note, 200), t: str(w.t, 5),
        ex: arr(w.ex, 20).map((e) => ({ id: str(e.id, 20), kg: num(e.kg, 0, 500), reps: num(e.reps, 0, 1000), sets: num(e.sets, 0, 20) ?? 0, planned: num(e.planned, 0, 20) ?? 0 })),
      })),
    };
    const watch = cleanWatch(v.watch);
    if (watch) days[d].watch = watch;
    const wt = num(v.weight, 30, 400);
    if (wt) days[d].weight = wt;
  }
  const custom = arr(data.custom, 200).map((c) => ({ id: str(c.id, 20), name: str(c.name, 80), kcal: num(c.kcal, 0, 5000) ?? 0, p: num(c.p, 0, 500) ?? 0, fib: num(c.fib, 0, 200) ?? 0, per: c.per === '100g' ? '100g' : 'portion', tags: tags(c.tags) }));
  const shopping = {};
  for (const [wk, items] of Object.entries(data.shopping || {})) {
    if (!DATE.test(wk) || !items || typeof items !== 'object') continue;
    shopping[wk] = {};
    for (const [k, v] of Object.entries(items)) if (v === true && (ITEMS[k] || k.startsWith('pantry:'))) shopping[wk][str(k, 60)] = true;
  }
  const swaps = {};
  for (const [d, s] of Object.entries(data.swaps || {})) {
    if (!DATE.test(d) || !s || typeof s !== 'object') continue;
    for (const [k, id] of Object.entries(s)) if (/^(breakfast|lunch|dinner|snack\d)$/.test(k) && MEAL_BY_ID[id]) (swaps[d] ||= {})[k] = id;
  }
  const moves = arr(data.moves, 60).flatMap((m) => (m && typeof m.id === 'string' && Object.hasOwn(SESSIONS, m.id) && SESSIONS[m.id].kind !== 'rest' && DATE.test(m.from) && DATE.test(m.to) && m.from !== m.to ? [{ id: m.id, from: m.from, to: m.to }] : []));
  const extras = arr(data.extras, 60).flatMap((x) => (x && typeof x.id === 'string' && Object.hasOwn(SESSIONS, x.id) && SESSIONS[x.id].kind !== 'rest' && x.id !== 'walks' && DATE.test(x.date) ? [{ id: x.id, date: x.date }] : []));
  const customEx = arr(data.customEx, 60).flatMap((x) => (x && typeof x.id === 'string' && /^x[a-z0-9]{1,12}$/.test(x.id) && typeof x.name === 'string' && x.name.trim() ? [{ id: x.id, name: str(x.name.trim(), 60), part: BODY_PARTS.includes(x.part) ? x.part : 'Full body', unit: x.unit === 's' ? 's' : 'reps' }] : []));
  const excluded = [...new Set(arr(data.excluded, 100).filter((id) => typeof id === 'string' && MEAL_BY_ID[id]))];
  return {
    v: 1, profile, days, custom, shopping, swaps, excluded, moves, extras, customEx,
    repeats: dates(data.repeats), skipHolds: dates(data.skipHolds), autoHolds: dates(data.autoHolds), holdChecked: DATE.test(data.holdChecked) ? data.holdChecked : null,
    labs: cleanLabs(data.labs), bp: cleanBp(data.bp), waist: cleanWaist(data.waist), settings: cleanSettings(data.settings),
    lastBackup: DATE.test(data.lastBackup) ? data.lastBackup : null, seenVersion: num(data.seenVersion, 0, 1000) ?? 0,
  };
}

// Merges the daily file made by export_for_app.py or a Shortcut paste. Values typed in by hand win over a file.
// A paste replaces the steps, Move and exercise minutes of a finished day, as a later run's total is the whole day.
// It only raises the ones that can be a part-day reading: today's, the first day of each type in the paste, which a
// 7-day search can start partway through, and typed ones.
const WATCH_KEYS = ['moveKcal', 'exMin', 'steps', 'rhr', 'vo2'];
export function mergeWatch(state, data, src = 'import', today) {
  if (!data || data.kind !== 'steady-watch' || typeof data.days !== 'object' || data.days === null) throw new Error('This file is not a Watch export for Steady.');
  const first = Object.fromEntries(DAY_TOTALS.map((k) => [k, Object.keys(data.days).filter((d) => data.days[d]?.[k] != null).sort()[0]]));
  let n = 0;
  for (const [d, w] of Object.entries(data.days)) {
    if (!DATE.test(d)) continue;
    const incoming = cleanWatch({ ...w, src });
    if (WATCH_KEYS.every((k) => incoming[k] == null)) continue;
    const day = (state.days[d] ||= emptyDay());
    const own = day.watch;
    if (src === 'shortcut') for (const k of DAY_TOTALS) if (own?.[k] != null && incoming[k] != null && (d >= today || d === first[k] || own.src === 'manual')) incoming[k] = Math.max(own[k], incoming[k]);
    if (own?.src === 'manual' && src !== 'shortcut') {
      for (const k of WATCH_KEYS) if (own[k] == null) own[k] = incoming[k];
    } else {
      day.watch = { ...(own ?? {}), ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null)) };
      if (own?.src === 'manual') day.watch.src = 'manual'; // a paste leaves a typed day typed, so a Mac file still fills only its blanks
    }
    n++;
  }
  return n;
}

// Merges lab results, blood pressure, waist and weights from a steady-health file.
export function mergeHealth(state, data) {
  if (!data || data.kind !== 'steady-health') throw new Error('This file is not a Steady health file.');
  const c = cleanBackup({ v: 1, days: {}, labs: data.labs, bp: data.bp, waist: data.waist });
  state.labs ||= [];
  state.bp ||= [];
  state.waist ||= [];
  let n = 0;
  for (const l of c.labs) { state.labs = state.labs.filter((x) => x.date !== l.date); state.labs.push(l); n++; }
  for (const r of c.bp) {
    if (!state.bp.some((x) => x.date === r.date && x.t === r.t && x.sys === r.sys && x.dia === r.dia)) { state.bp.push(r); n++; }
  }
  for (const w of c.waist) { state.waist = state.waist.filter((x) => x.date !== w.date); state.waist.push(w); n++; }
  for (const [d, kg] of Object.entries(data.weights || {})) {
    if (DATE.test(d) && num(kg, 30, 400)) {
      const day = (state.days[d] ||= emptyDay());
      if (!day.weight) { day.weight = kg; n++; }
    }
  }
  const byDate = (a, b) => (a.date + (a.t || '') < b.date + (b.t || '') ? -1 : 1);
  state.labs.sort(byDate);
  state.bp.sort(byDate);
  state.waist.sort(byDate);
  return n;
}
