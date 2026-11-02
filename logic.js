// Pure functions: dates, plan lookup, targets, daily and weekly numbers, menus, shopping, prep,
// health checks, imports and backups. No DOM access here, so all of it runs under node --test.
import { BLOCKS, SESSIONS, MEALS, MENUS, ITEMS, GROUPS, BATCHES, BATCH_ORDER, CHECKINS, REMINDERS, LABS } from './plan.js';

export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]));
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

export function sessionsFor(startDate, date, repeats = []) {
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
export function weekSummary(state, monday) {
  const p = state.profile;
  const reps = state.repeats || [];
  const out = { monday, planned: 0, done: 0, strengthDone: 0, exMin: 0, load: 0, steps: [], kcal: [], protein: [], water: [], waterTarget: [], balance: [], weights: [] };
  const base = targets(p, weightOn(state, monday)).waterBase;
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const day = state.days[date];
    const planned = sessionsFor(p.startDate, date, reps).filter((s) => s.kind !== 'rest');
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
export function applyHolds(state, today) {
  const p = state.profile;
  if (!p) return [];
  state.repeats ||= [];
  state.skipHolds ||= [];
  const current = mondayOf(today);
  let w = state.holdChecked ? addDays(state.holdChecked, 7) : p.startDate;
  const added = [];
  while (w < current) {
    if (w >= p.startDate) {
      const c = weekCompletion(state, w);
      const next = addDays(w, 7);
      if (c != null && c < 0.5 && !state.repeats.includes(next) && !state.skipHolds.includes(next)) {
        state.repeats.push(next);
        added.push(next);
      }
    }
    state.holdChecked = w;
    w = addDays(w, 7);
  }
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

// ---- Weight ----
export function weighIns(state) {
  return Object.entries(state.days).filter(([, v]) => v.weight).map(([d, v]) => [d, v.weight]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// Average of the weigh-ins in the 14 days up to each weigh-in.
export function weightTrend(state) {
  const ins = weighIns(state);
  return ins.map(([d]) => {
    const win = ins.filter(([x]) => x <= d && x > addDays(d, -14)).map(([, v]) => v);
    return [d, mean(win)];
  });
}
// 5% at 12 weeks, 8% at 26 weeks, 10% at 52 weeks.
export function goalPath(profile) {
  const w = profile.startWeight;
  return [[profile.startDate, w], [addDays(profile.startDate, 84), w * 0.95], [addDays(profile.startDate, 182), w * 0.92], [addDays(profile.startDate, 364), w * 0.9]];
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
  const xs = ins.map(([d]) => diffDays(ins[0][0], d));
  const ys = ins.map(([, v]) => v);
  const mx = mean(xs), my = mean(ys);
  const slope = sum(xs.map((x, i) => (x - mx) * (ys[i] - my))) / sum(xs.map((x) => (x - mx) ** 2));
  const avgIn = mean(intake);
  const maint = Math.round(avgIn - slope * KCAL_PER_KG);
  return {
    ready: true, daysLogged: n, weighIns: ins.length, intake: Math.round(avgIn), kgPerWeek: slope * 7,
    maintenance: maint, formula: out.length ? Math.round(mean(out)) : null, suggested: Math.max(1500, Math.round((maint - 550) / 50) * 50),
  };
}

// ---- Menus, swaps, shopping and prep ----
export function menuIndex(startDate, date) {
  const w = Math.floor(diffDays(startDate, mondayOf(date)) / 7);
  return ((w % MENUS.length) + MENUS.length) % MENUS.length;
}
// The meals planned for a date as [{ key, slot, meal, swapped }], with any swaps for that date applied.
export function menuFor(date, state) {
  const idx = state?.profile ? menuIndex(state.profile.startDate, date) : 0;
  const m = MENUS[idx][weekday(date)];
  const sw = state?.swaps?.[date] || {};
  return [['breakfast', m.breakfast], ['lunch', m.lunch], ['dinner', m.dinner], ...m.snack.map((id, i) => [`snack${i}`, id])]
    .map(([key, id]) => {
      const use = sw[key] && MEAL_BY_ID[sw[key]] ? sw[key] : id;
      return { key, slot: key.startsWith('snack') ? 'snack' : key, meal: MEAL_BY_ID[use], swapped: use !== id, planned: id };
    });
}
export function mealTotals(meals) {
  return meals.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, fib: t.fib + m.fib }), { kcal: 0, p: 0, fib: 0 });
}
// Lunches and dinners swap with each other; breakfasts and snacks with their own kind.
export function swapOptions(slot) {
  if (slot === 'breakfast' || slot === 'snack') return MEALS.filter((m) => m.slot === slot);
  return MEALS.filter((m) => m.slot === 'lunch' || m.slot === 'dinner');
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

// ---- Watch numbers pasted from an iPhone Shortcut ----
// Accepts 8,123 and 8.123 and 8 123 as thousands, and 640.5 or 640,5 as decimals.
export function parseNum(raw) {
  let s = String(raw ?? '').replace(/[\s']/g, '');
  if (!s) return null;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''));
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const at = Math.max(dot, comma);
    s = `${s.slice(0, at).replace(/[.,]/g, '')}.${s.slice(at + 1)}`;
  } else {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
const firstNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? parseNum((v.match(/\d[\d.,\s']*/) || [''])[0].trim()) : null);
const pastedDate = (v) => (typeof v === 'string' && DATE.test(v.trim().slice(0, 10)) ? v.trim().slice(0, 10) : null);

export function parseWatchPaste(text, fallbackDate) {
  const raw = String(text ?? '').trim();
  let data = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (data?.kind === 'steady-watch') return { kind: 'file', data };
  const watch = {};
  let date = null;
  const put = (key, v) => {
    const k = String(key).toLowerCase();
    const n = firstNum(v);
    if (n == null) return;
    if (k.includes('step')) watch.steps = Math.round(n);
    else if (k.includes('exer')) watch.exMin = Math.round(n);
    else if (k.includes('move') || k.includes('active') || k.includes('energy')) watch.moveKcal = Math.round(n);
    else if (k.includes('rest')) watch.rhr = Math.round(n);
  };
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (/date/i.test(k)) date = pastedDate(v);
      else put(k, v);
    }
  } else {
    for (const line of raw.split(/[\n;]+/)) {
      const m = line.match(/^\s*([A-Za-z][A-Za-z ]*?)\s*[:=]\s*(.+)$/);
      if (!m) continue;
      if (/date/i.test(m[1])) date = pastedDate(m[2]);
      else put(m[1], m[2]);
    }
  }
  if (!Object.keys(watch).length) throw new Error('No Watch numbers found in what was pasted. Run the Steady Watch shortcut first.');
  return { kind: 'day', date: date || fallbackDate, watch };
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

// ---- Imports ----
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const arr = (a, n = 500) => (Array.isArray(a) ? a.slice(0, n) : []);
const dates = (a) => arr(a).filter((d) => typeof d === 'string' && DATE.test(d));
const tags = (a) => arr(a, 4).filter((t) => t === 'sugary' || t === 'purine');
const TIME = /^\d{2}:\d{2}$/;

function cleanWatch(w) {
  if (!w || typeof w !== 'object') return null;
  const c = { moveKcal: num(w.moveKcal, 0, 20000), exMin: num(w.exMin, 0, 1440), steps: num(w.steps, 0, 200000), rhr: num(w.rhr, 20, 220), vo2: num(w.vo2, 5, 100) };
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
function cleanBp(a) {
  return arr(a, 2000).filter((r) => r && DATE.test(r.date) && num(r.sys, 60, 260) && num(r.dia, 30, 160))
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
  return { hotMonths: o.hotMonths ? [...new Set(hot)] : [3, 4, 5], loudBeep: o.loudBeep === true, reminders };
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
  return {
    v: 1, profile, days, custom, shopping, swaps,
    repeats: dates(data.repeats), skipHolds: dates(data.skipHolds), holdChecked: DATE.test(data.holdChecked) ? data.holdChecked : null,
    labs: cleanLabs(data.labs), bp: cleanBp(data.bp), waist: cleanWaist(data.waist), settings: cleanSettings(data.settings),
    lastBackup: DATE.test(data.lastBackup) ? data.lastBackup : null,
  };
}

// Merges the daily file made by export_for_app.py or a Shortcut paste. Values typed in by hand win.
export function mergeWatch(state, data, src = 'import') {
  if (!data || data.kind !== 'steady-watch' || typeof data.days !== 'object' || data.days === null) throw new Error('This file is not a Watch export for Steady.');
  let n = 0;
  for (const [d, w] of Object.entries(data.days)) {
    if (!DATE.test(d)) continue;
    const incoming = cleanWatch({ ...w, src });
    if (!incoming) continue;
    const day = (state.days[d] ||= emptyDay());
    const own = day.watch;
    if (own?.src === 'manual') {
      for (const k of ['moveKcal', 'exMin', 'steps', 'rhr', 'vo2']) if (own[k] == null) own[k] = incoming[k];
    } else {
      day.watch = { ...(own ?? {}), ...Object.fromEntries(Object.entries(incoming).filter(([, v]) => v != null)) };
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
