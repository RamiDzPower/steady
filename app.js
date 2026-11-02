import * as L from './logic.js';
import {
  EFFORT, EXERCISES, SESSIONS, BLOCKS, PROGRESSION, DELOAD, HOT, HOT_LONGWALK, WATCH_ALERT, MEALS, MENU_NOTE, PANTRY, FOOD_SAFETY,
  EATING_OUT, RULES, SAFETY, SLOTS, LABS, WAIST_TARGET, BP_NOTE, BP_CRISIS, REMINDERS, SHORTCUT_IN, SHORTCUT_OUT,
} from './plan.js';

const KEY = 'steady.v1';
const esc = L.esc;
const $ = (s) => document.querySelector(s);
const fmt = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-GB'));
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
const litres = (ml) => (ml / 1000).toFixed(1);
const todayISO = () => L.iso(new Date());
const clock = () => new Date().toTimeString().slice(0, 5);
const dateText = (d, o = { weekday: 'long', day: 'numeric', month: 'long' }) => L.parse(d).toLocaleDateString('en-GB', o);
const short = (d) => dateText(d, { day: 'numeric', month: 'short' });
const int = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const dec = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', extra: 'Extras' };
const DEFAULT_RPE = { easy: 4, moderate: 5, hard: 7, strength: 7 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
const CLOSE_BTN = `<button class="icon" data-act="sheet-close" aria-label="Close">${ICON.close}</button>`;

let state = load();
const ui = {
  screen: 'today', tab: 'today', date: todayISO(), week: null, food: 'menu', foodWeek: 'this', progress: 'charts', range: 14,
  session: null, addSlot: 'lunch', portion: 1, rest: null, phase: -1, persisted: false, onToday: true, updating: false, pendingFile: null,
};
let ticker = null;
let wakeLock = null;
let audio = null;
let swReg = null;
let undoSnap = null;

// ---------- Storage ----------
function blank() {
  return {
    v: 1, profile: null, days: {}, custom: [], shopping: {}, swaps: {}, repeats: [], skipHolds: [], holdChecked: null,
    labs: [], bp: [], waist: [], settings: { hotMonths: [3, 4, 5], loudBeep: false, reminders: {} }, lastBackup: null, active: null,
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) {
      const b = blank();
      if (s.shopping && Object.keys(s.shopping).some((k) => !/^\d{4}-\d{2}-\d{2}$/.test(k))) s.shopping = {}; // first release kept one flat list
      return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    }
  } catch { /* fall through to a blank state */ }
  return blank();
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Could not save. Phone storage may be full.');
  }
}
const rw = (date) => (state.days[date] ||= L.emptyDay());
const tgt = (date) => L.targets(state.profile, L.weightOn(state, date));
const reps = () => state.repeats || [];
const sessionsOn = (date) => L.sessionsFor(state.profile.startDate, date, reps());
const posOn = (date) => L.planPosition(state.profile.startDate, date, reps());
const nextLab = () => state.profile.nextLab || L.addDays(state.profile.startDate, 84);
const isHot = (date) => (state.settings.hotMonths || []).includes(L.parse(date).getMonth() + 1);
function snapshot() {
  undoSnap = JSON.stringify(state);
}

// ---------- Rendering ----------
const VIEWS = { today: viewToday, train: viewTrain, food: viewFood, progress: viewProgress, more: viewMore, session: viewSession, setup: viewSetup };

function render(top = false) {
  stopTicker();
  if (!state.profile) ui.screen = 'setup';
  const focusKey = top ? null : keyOf(document.activeElement);
  $('#main').innerHTML = VIEWS[ui.screen]();
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  $('.tabs').hidden = ui.screen === 'setup';
  ui.onToday = ui.date === todayISO();
  if (ui.screen === 'session') startTicker();
  if (top) {
    window.scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  } else if (focusKey) {
    document.querySelector(focusKey)?.focus({ preventScroll: true });
  }
}
function keyOf(el) {
  if (!el || !el.dataset || !el.dataset.act || !$('#main').contains(el)) return null;
  const parts = ['act', 'id', 'slot', 'key', 'ml', 'k', 'i', 'n', 'sec', 'date', 'item'].filter((k) => el.dataset[k] != null);
  return parts.map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
}

function gauge(kind, name, value, target, valText, ofText) {
  const x = 11, top = 6, W = 44, H = 122, full = 1.25;
  const ratio = target > 0 ? value / target : 0;
  const fillH = (Math.min(ratio, full) / full) * H;
  const overH = ratio > 1 ? ((Math.min(ratio, full) - 1) / full) * H : 0;
  const y = (f) => top + H - (f / full) * H;
  return `<figure class="gauge">
    <svg viewBox="0 0 66 136" aria-hidden="true">
      <defs>
        <clipPath id="clip-${kind}"><rect x="${x}" y="${top}" width="${W}" height="${H}" rx="11"/></clipPath>
        <pattern id="hatch-${kind}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="g-${kind}"/><line x1="0" y1="0" x2="0" y2="7" class="g-hatch"/></pattern>
      </defs>
      <rect class="g-tube" x="${x}" y="${top}" width="${W}" height="${H}" rx="11"/>
      <g clip-path="url(#clip-${kind})">
        <rect class="g-${kind}" x="${x}" y="${(top + H - fillH).toFixed(1)}" width="${W}" height="${fillH.toFixed(1)}"/>
        ${overH ? `<rect fill="url(#hatch-${kind})" x="${x}" y="${(top + H - fillH).toFixed(1)}" width="${W}" height="${overH.toFixed(1)}"/>` : ''}
      </g>
      ${[0.25, 0.5, 0.75].map((f) => `<line class="g-tick" x1="${x}" x2="${x + 9}" y1="${y(f)}" y2="${y(f)}"/>`).join('')}
      ${target > 0 ? `<line class="g-target" x1="${x - 7}" x2="${x + W + 7}" y1="${y(1)}" y2="${y(1)}"/>` : ''}
    </svg>
    <figcaption><span class="name">${name}</span><span class="val">${valText}</span><span class="of">${ofText}</span></figcaption>
  </figure>`;
}
function minibar(value, target, kind, width = 120) {
  const f = target > 0 ? Math.min(value / target, 1) : 0;
  return `<svg class="minibar" viewBox="0 0 ${width} 8" preserveAspectRatio="none" aria-hidden="true"><rect class="mb-track" width="${width}" height="8" rx="4"/><rect class="mb-${kind}" width="${(width * f).toFixed(1)}" height="8" rx="4"/></svg>`;
}
function meter(label, value, target, kind, unit = '') {
  return `<div class="meter"><div class="meter-top"><span>${label}</span><span>${fmt(value)}${unit} of ${fmt(target)}${unit}</span></div>${minibar(value, target, kind, 300)}</div>`;
}
const note = (html, cls = '') => `<div class="note ${cls}">${html}</div>`;

// ---------- Today ----------
function viewToday() {
  const d = ui.date;
  const p = state.profile;
  const day = state.days[d];
  const t = tgt(d);
  const pos = posOn(d);
  const sessions = sessionsOn(d);
  const food = L.foodTotals(day);
  const water = L.waterTotal(day);
  const wTarget = L.waterTarget(day, t.waterBase);
  const exDone = L.effortMinutes(day);
  const exPlan = L.plannedMinutes(sessions);
  const isToday = d === todayISO();
  const where = pos.before ? `The plan starts ${dateText(p.startDate)}.` : `Week ${pos.week}, ${pos.block.name.toLowerCase()}.`;
  const counts = L.weekCounts(state, L.mondayOf(d));
  return `
  <header class="dayhead">
    <button class="icon" data-act="day" data-n="-1" aria-label="Previous day">${ICON.prev}</button>
    <div class="dayhead-text"><h1>${isToday ? 'Today' : esc(dateText(d, { weekday: 'long' }))}</h1>
      <p class="sub">${esc(dateText(d, { day: 'numeric', month: 'long' }))}. ${esc(where)}</p></div>
    <button class="icon" data-act="day" data-n="1" aria-label="Next day">${ICON.next}</button>
  </header>
  ${isToday ? '' : '<p class="dayhead-text"><button class="link" data-act="day" data-n="0">Back to today</button></p>'}
  ${banners(d, pos, sessions)}
  <section class="gauges" aria-label="Food, water and exercise so far">
    ${gauge('fuel', 'Food', food.kcal, t.kcal, fmt(food.kcal), `of ${fmt(t.kcal)} kcal`)}
    ${gauge('water', 'Water', water, wTarget, `${litres(water)} L`, `of ${litres(wTarget)} L`)}
    ${gauge('effort', 'Exercise', exDone, exPlan, `${exDone} min`, exPlan ? `of ${exPlan} planned` : 'rest day')}
  </section>
  <div class="bars">
    <p>Protein <strong>${food.p} g</strong> of ${t.protein} g ${minibar(food.p, t.protein, 'fuel')}</p>
    <p>Fibre <strong>${food.fib} g</strong> of ${t.fibre} g ${minibar(food.fib, t.fibre, 'effort')}</p>
  </div>
  <p class="counts">This week: ${plural(counts.sugary, 'sugary drink', 'sugary drinks')} (aim for none) and ${plural(counts.purine, 'serving', 'servings')} of red meat, offal or shellfish (aim for 2 or fewer).</p>
  ${pos.before ? beforeStart() : ''}
  <h2>Training</h2>
  ${sessionRows(d, sessions, day)}
  <h2>Water</h2>
  <div class="water-btns">
    ${[250, 500, 750].map((ml) => `<button class="btn water" data-act="water" data-ml="${ml}">+${ml} ml</button>`).join('')}
    <button class="btn" data-act="water-undo" ${day?.water?.length ? '' : 'disabled'}>Undo</button>
  </div>
  <p class="sub">Today's target is ${fmt(t.waterBase)} ml${wTarget > t.waterBase ? `, plus ${fmt(wTarget - t.waterBase)} ml for ${exDone} minutes of exercise` : ''}. It goes up by 500 ml for every 30 exercise minutes.</p>
  <h2>Food</h2>
  ${foodToday(d, day)}
  <h2>From your Watch</h2>
  ${watchForm(d, day)}
  <h2>Weight</h2>
  ${weightForm(d, day)}`;
}

function banners(d, pos, sessions) {
  const out = [];
  const today = todayISO();
  if (d === today && backupDue()) {
    out.push(note(`<p>Your log lives only on this phone. ${state.lastBackup ? `Last backup: ${esc(short(state.lastBackup))}.` : 'There is no backup yet.'}</p><button class="btn" data-act="export-open">Back up now</button>`, 'warn'));
  }
  if (!pos.before && pos.repeating) {
    out.push(note(`<p>This week repeats week ${pos.week}, because last week came in under half the plan. That keeps the step up small.</p><button class="btn" data-act="skip-hold">Move on anyway</button>`));
  }
  const ci = L.checkIn(state.profile.startDate, d);
  if (ci) out.push(note(`<p>${esc(ci.text)}</p>${ci.week !== 27 ? '<button class="btn" data-act="go-health">Add blood test results</button>' : ''}`));
  const lab = nextLab();
  const toLab = L.diffDays(today, lab);
  const labDone = (state.labs || []).some((x) => x.date >= L.addDays(lab, -14));
  if (d === today && !labDone && toLab <= 14 && toLab >= -30) {
    out.push(note(`<p>${toLab >= 0 ? `Blood test due ${esc(short(lab))} (in ${plural(toLab, 'day', 'days')}).` : `Blood test was due ${esc(short(lab))}.`} Ask for fasting glucose, HbA1c, lipids and uric acid.</p>`));
  }
  if (isHot(d) && sessions.some((s) => s.kind === 'cardio' || s.outdoor)) out.push(note(`<p>${esc(HOT)}</p>`, 'hot'));
  return out.join('');
}

function backupDue() {
  const used = Object.values(state.days).filter((x) => x.foods?.length || x.water?.length || x.workouts?.length || x.weight).length;
  return used >= 3 && (!state.lastBackup || L.diffDays(state.lastBackup, todayISO()) >= 7);
}

function beforeStart() {
  return note(`<p><strong>Before the first Monday</strong></p><ul>
    <li>Update your weight in the Health app, so the Watch calorie and cardio fitness numbers are right.</li>
    <li>Set a Move goal you can close on most days, and raise it when it gets easy.</li>
    <li>Shop from Food, Shopping (next week), then do the Sunday prep.</li>
    <li>Add the reminders to your calendar from More.</li>
    <li>Weigh yourself on Monday morning before breakfast and log it below.</li>
  </ul>`);
}

function sessionRows(d, sessions, day) {
  if (!sessions.length) return '<p class="sub">Training starts on the plan start date. Week 1 is in the Train tab.</p>';
  return `<ul class="rows">${sessions.map((s) => {
    const done = day?.workouts?.filter((w) => w.id === s.id) ?? [];
    const meta = s.kind === 'rest' ? s.how : `${s.minutes} min, ${EFFORT[s.effort].label.toLowerCase()}${s.reps ? `, ${s.reps} repeats` : ''}${s.deload ? ', easier week' : ''}`;
    const logged = done.length ? `. Logged ${done.map((w) => `${w.min} min`).join(' and ')}` : '';
    const title = s.kind === 'rest' ? `<div class="row-title">${esc(s.name)}</div>`
      : `<button class="link row-title" data-act="open-session" data-id="${s.id}" data-date="${d}">${esc(s.name)}</button>`;
    const action = s.kind === 'rest' ? ''
      : s.id === 'walks' ? `<button class="btn effort" data-act="walk-log" data-date="${d}" aria-label="Log a 10 minute walk">+10 min</button>`
      : `<button class="btn" data-act="open-session" data-id="${s.id}" data-date="${d}">${done.length ? 'View' : 'Open'}</button>`;
    return `<li><span class="dot ${done.length ? 'on' : ''}" aria-hidden="true"></span>
      <div class="row-main">${title}<div class="row-sub">${esc(meta + logged)}</div></div>${action}</li>`;
  }).join('')}</ul>`;
}

function foodToday(d, day) {
  const logged = day?.foods ?? [];
  const planned = L.menuFor(d, state);
  const t = L.foodTotals(day);
  const yesterday = state.days[L.addDays(d, -1)]?.foods?.length;
  const unlogged = planned.filter(({ slot, meal }) => !logged.some((f) => f.ref === meal.id && f.slot === slot)).length;
  const blocks = SLOTS.map((slot) => {
    const plan = planned.filter((x) => x.slot === slot);
    const extra = logged.map((f, i) => ({ f, i })).filter(({ f }) => f.slot === slot && !plan.some((x) => x.meal.id === f.ref));
    const rows = [
      ...plan.map(({ key, meal, swapped }) => {
        const on = logged.some((f) => f.ref === meal.id && f.slot === slot);
        return `<li><div class="row-main"><button class="link row-title" data-act="recipe" data-id="${meal.id}">${esc(meal.name)}</button>
          <div class="row-sub">${meal.kcal} kcal, ${meal.p} g protein${swapped ? ', swapped in' : ''}</div></div>
          <button class="btn small" data-act="swap-open" data-date="${d}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">Swap</button>
          <button class="btn fuel" data-act="log-menu" data-slot="${slot}" data-id="${meal.id}" aria-pressed="${on}">${on ? 'Eaten' : 'Log'}</button></li>`;
      }),
      ...extra.map(({ f, i }) => `<li><div class="row-main"><div class="row-title">${esc(f.name)}</div>
          <div class="row-sub">${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein${f.t ? `, ${esc(f.t)}` : ''}${f.tags?.includes('sugary') ? ', sugary drink' : ''}${f.tags?.includes('purine') ? ', red meat, offal or shellfish' : ''}</div></div>
          <button class="btn icon" data-act="food-del" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ICON.close}</button></li>`),
    ];
    return `<div class="slot-label">${SLOT_LABEL[slot]}</div><ul class="rows">${rows.join('')}</ul>`;
  }).join('');
  return `${blocks}
    <div class="totals"><span>Logged ${fmt(t.kcal)} kcal, ${t.p} g protein, ${t.fib} g fibre</span></div>
    <div class="actions">
      <button class="btn primary big" data-act="add-food-open">Add food</button>
      <button class="btn" data-act="log-day" ${unlogged ? '' : 'disabled'}>Log the rest as planned</button>
      <button class="btn" data-act="same-yesterday" ${yesterday ? '' : 'disabled'}>Same as yesterday</button>
    </div>
    <p class="sub">Tap a meal name for the recipe. Anything off-plan goes in with Add food, so the numbers stay honest.</p>`;
}

function watchForm(d, day) {
  const w = day?.watch ?? {};
  const b = L.burn(state, d);
  const bal = L.balance(state, d);
  const field = (k, label) => `<label>${label}<input inputmode="numeric" data-act="watch" data-k="${k}" value="${esc(w[k] ?? '')}" placeholder="0" autocomplete="off"></label>`;
  let text = 'Copy Move calories, exercise minutes and steps from the Fitness app, or paste them with the Steady Watch shortcut.';
  if (b) {
    text = `Energy out today is about ${fmt(b.total)} kcal: ${fmt(b.rest)} resting, ${fmt(b.move)} from Move${b.estimated ? ' (your recent average)' : ''}, plus digestion.`;
    if (bal != null) text += ` In minus out so far: ${signed(bal)} kcal.`;
  }
  const src = { import: 'Filled from your Watch export. ', shortcut: 'Pasted from the Steady Watch shortcut. ' }[w.src] || '';
  return `<div class="grid3">${field('moveKcal', 'Move kcal')}${field('exMin', 'Exercise min')}${field('steps', 'Steps')}</div>
    <p class="sub">${esc(src + text)}</p>
    <div class="actions"><button class="btn" data-act="paste-watch">Paste from Watch</button><button class="btn" data-act="copy-health">Copy totals for Health</button>
    <button class="link" data-act="shortcut-help">Set up the shortcuts</button></div>`;
}

function weightForm(d, day) {
  const last = L.weighIns(state).filter(([x]) => x <= d).at(-1);
  return `<div class="grid2"><label>Weight on ${esc(short(d))} (kg)<input inputmode="decimal" data-act="weight" value="${esc(day?.weight ?? '')}" placeholder="${(last?.[1] ?? state.profile.startWeight).toFixed(1)}" autocomplete="off"></label>
    <p class="sub">${last ? `Last weigh-in ${esc(short(last[0]))}: ${last[1].toFixed(1)} kg.` : `Start: ${state.profile.startWeight.toFixed(1)} kg.`} Once a week, same morning, before breakfast.</p></div>`;
}

// ---------- Train ----------
function trainMonday() {
  const thisMonday = L.mondayOf(todayISO());
  return ui.week || (thisMonday < state.profile.startDate ? state.profile.startDate : thisMonday);
}

function viewTrain() {
  const p = state.profile;
  const monday = trainMonday();
  const pos = posOn(monday);
  const block = pos.before ? BLOCKS[0] : pos.block;
  const wk = L.weekSummary(state, monday);
  const z = L.hrZones(p);
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(monday, i));
  const title = pos.before ? 'Before the plan' : `Week ${pos.week}`;
  const nextMon = L.addDays(L.mondayOf(todayISO()), 7);
  const isCurrent = monday === L.mondayOf(todayISO());
  const nextRepeats = reps().includes(nextMon);
  return `
  <header class="dayhead">
    <button class="icon" data-act="week" data-n="-7" aria-label="Previous week">${ICON.prev}</button>
    <div class="dayhead-text"><h1>${title}</h1><p class="sub">${esc(short(monday))} to ${esc(short(days[6]))}. ${esc(block.name)}${pos.held ? `. Calendar week ${pos.calWeek}` : ''}</p></div>
    <button class="icon" data-act="week" data-n="7" aria-label="Next week">${ICON.next}</button>
  </header>
  <p>${esc(block.intro)}</p>
  ${pos.deload ? note(`<p>${esc(DELOAD)}</p>`) : ''}
  ${pos.repeating ? note(`<p>This week repeats week ${pos.week}.</p>${isCurrent ? '<button class="btn" data-act="skip-hold">Move on anyway</button>' : ''}`) : ''}
  <div class="meters">
    ${meter('Exercise minutes', wk.exMin, block.targets.exMin, 'effort')}
    ${meter('Strength sessions', wk.strengthDone, block.targets.strength, 'effort')}
    ${meter('Average steps', wk.stepsAvg ?? 0, block.targets.steps, 'effort')}
  </div>
  ${isCurrent && !pos.before ? `<div class="actions">${nextRepeats
    ? '<button class="btn" data-act="repeat-week" data-n="0">Move on next week after all</button>'
    : '<button class="btn" data-act="repeat-week" data-n="1">Repeat this week next week</button>'}</div>
    <p class="sub">The plan also holds a week on its own when a week comes in under half: fewer than half the sessions logged and under half the exercise minutes.</p>` : ''}
  <ul class="rows week">${days.map((date) => {
    const day = state.days[date];
    const ss = sessionsOn(date);
    const items = ss.length ? ss.map((s) => {
      if (s.kind === 'rest') return `<div class="linkrow"><span>${esc(s.name)}</span></div>`;
      const done = day?.workouts?.some((w) => w.id === s.id);
      return `<button class="linkrow" data-act="open-session" data-id="${s.id}" data-date="${date}"><span>${esc(s.name)} <span class="sub">${s.minutes} min</span></span>${done ? '<span class="done">Done</span>' : ''}</button>`;
    }).join('') : '<div class="linkrow sub">Before the plan starts</div>';
    return `<li><div class="wd ${date === todayISO() ? 'today' : ''}"><span>${esc(dateText(date, { weekday: 'short' }))}</span><span class="num">${L.parse(date).getDate()}</span></div><div class="row-main">${items}</div></li>`;
  }).join('')}</ul>
  <h2>How hard</h2>
  <table class="zones"><thead><tr><th>Effort</th><th>Heart rate</th><th>Feels like</th></tr></thead><tbody>
    <tr><td>Easy</td><td>under ${z.easy[1]}</td><td>RPE ${EFFORT.easy.rpe}. ${EFFORT.easy.talk}.</td></tr>
    <tr><td>Moderate</td><td>${z.moderate[0]} to ${z.moderate[1]}</td><td>RPE ${EFFORT.moderate.rpe}. ${EFFORT.moderate.talk}.</td></tr>
    <tr><td>Hard</td><td>${z.hard[0]} to ${z.hard[1]}</td><td>RPE ${EFFORT.hard.rpe}. ${EFFORT.hard.talk}.</td></tr>
    <tr><td>Strength</td><td></td><td>RPE ${EFFORT.strength.rpe}. ${EFFORT.strength.talk}.</td></tr>
  </tbody></table>
  <p class="sub">Heart rates use a resting rate of ${z.rest} and an estimated maximum of ${z.max}. RPE is how hard it feels from 1 to 10. When heart rate and feel disagree, go by feel.</p>
  <p class="sub">${esc(WATCH_ALERT)} For most sessions that is ${z.moderate[0]} to ${z.moderate[1]}.</p>
  <h2>The plan</h2>
  ${BLOCKS.map((b) => `<h3>${esc(b.name)}, ${b.weeks[1] ? `weeks ${b.weeks[0]} to ${b.weeks[1]}` : `week ${b.weeks[0]} on`}</h3>
    <p>${esc(b.intro)}</p><p class="sub">Targets: ${b.targets.exMin} exercise minutes and ${b.targets.strength} strength ${b.targets.strength > 1 ? 'sessions' : 'session'} a week, ${fmt(b.targets.steps)} steps a day on average.</p>`).join('')}
  <p class="sub">${esc(DELOAD)} Check-ins fall on the 3-month, 6-month and 1-year marks.</p>
  <h2>Stop and check</h2>
  <ul>${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
}

// ---------- Session ----------
function currentSession() {
  const { date, id } = ui.session;
  return sessionsOn(date).find((x) => x.id === id) || { ...SESSIONS[id], id, minutes: SESSIONS[id].minutes || 30, reps: 5, exercises: SESSIONS[id].exercises };
}
function isActive(date, id) {
  return !!state.active && state.active.date === date && state.active.id === id;
}
function startActive() {
  const s = currentSession();
  const log = {};
  (s.exercises || []).forEach(([exId, , spec], i) => {
    const last = L.lastStrength(state, exId, ui.session.date);
    log[i] = { kg: last?.kg ?? null, reps: last?.reps ?? L.repSpec(spec).top };
  });
  state.active = { date: ui.session.date, id: ui.session.id, start: Date.now(), sets: {}, log };
  unlockAudio();
  wake(true);
}

function viewSession() {
  const { date, id } = ui.session;
  const s = currentSession();
  const z = L.hrZones(state.profile);
  const eff = EFFORT[s.effort];
  const hr = s.effort === 'easy' ? `under ${z.easy[1]} bpm` : eff.hrr ? `${z[s.effort][0]} to ${z[s.effort][1]} bpm` : '';
  const active = isActive(date, id) ? state.active : null;
  const logged = state.days[date]?.workouts?.map((w, i) => ({ w, i })).filter(({ w }) => w.id === id) ?? [];
  const otherActive = state.active && !active;
  const hot = isHot(date) && (s.kind === 'cardio' || s.outdoor);
  return `
  <div class="sessionhead"><button class="btn" data-act="close-session">${ICON.prev} Back</button></div>
  <h1>${esc(s.name)}</h1>
  <p class="sub">${esc(dateText(date))}. About ${s.minutes} minutes${s.reps && s.id === 'intervals' ? `, ${s.reps} repeats` : ''}.</p>
  <div class="effort-band ${s.effort === 'hard' ? 'hard' : ''}"><strong>${eff.label}</strong>${hr ? `, ${hr}` : ''}. RPE ${eff.rpe}. ${esc(eff.talk)}.</div>
  ${s.deload ? note(`<p>${esc(DELOAD)}</p>`) : ''}
  ${hot ? note(`<p>${esc(s.outdoor ? HOT_LONGWALK : HOT)}</p>`, 'hot') : ''}
  <p>${esc(s.how)}</p>
  <p class="sub">${esc(s.why)}</p>
  ${hr && s.kind !== 'strength' ? `<p class="sub">${esc(WATCH_ALERT)}</p>` : ''}
  ${otherActive ? note(`<p>Another session is running (${esc(SESSIONS[state.active.id]?.name ?? '')}). Starting this one discards it.</p>`) : ''}
  ${active
    ? '<div class="timerbar"><div><div class="sub">Elapsed</div><div class="timer" id="elapsed">0:00</div></div><button class="btn effort big" data-act="finish">Finish</button></div>'
    : `<div class="actions"><button class="btn effort big" data-act="start">Start</button>${s.id === 'walks'
      ? '<button class="btn" data-act="quick-log" data-n="10">Log a 10 min walk</button>'
      : `<button class="btn" data-act="quick-log" data-n="${s.minutes}">Log as planned</button>`}</div>`}
  ${s.id === 'intervals' && active ? '<div class="phase" id="phase"></div>' : ''}
  ${s.id === 'intervals' ? `<p class="sub">Timing: 10 minutes easy, then ${s.reps} rounds of 2 minutes hard and 2 easy, then 5 minutes easy. Each change beeps and flashes the screen.</p>` : ''}
  <div id="rest" class="rest" hidden></div>
  ${s.exercises ? `<ul class="exlist">${s.exercises.map(([exId, sets, spec, rest], i) => exerciseCard(exId, sets, spec, rest, i, active)).join('')}</ul><p class="sub">${esc(PROGRESSION)}</p>` : ''}
  ${logged.length ? `<h2>Logged</h2><ul class="rows">${logged.map(({ w, i }) => `<li><div class="row-main"><div class="row-title">${w.min} min, RPE ${w.rpe}${w.hr ? `, ${w.hr} bpm` : ''}</div>
      <div class="row-sub">${esc(w.t || '')}${w.note ? `. ${esc(w.note)}` : ''}${w.ex?.length ? `. ${esc(w.ex.filter((e) => e.kg || e.reps).map((e) => `${EXERCISES[e.id]?.name}: ${e.kg ? `${e.kg} kg × ` : ''}${e.reps ?? ''}`).join(', '))}` : ''}</div></div>
      <button class="btn icon" data-act="workout-del" data-i="${i}" aria-label="Remove this log">${ICON.close}</button></li>`).join('')}</ul>` : ''}`;
}

function exerciseCard(exId, sets, spec, rest, i, active) {
  const ex = EXERCISES[exId];
  const done = active?.sets?.[i] ?? 0;
  const last = L.lastStrength(state, exId, ui.session.date);
  const hint = L.strengthHint(last, spec);
  const { unit } = L.repSpec(spec);
  const unitLabel = unit === 's' ? 'Seconds' : unit === 'm' ? 'Metres' : 'Reps';
  const kg = active?.log?.[i]?.kg ?? last?.kg ?? '';
  const rp = active?.log?.[i]?.reps ?? last?.reps ?? L.repSpec(spec).top ?? '';
  return `<li class="ex"><div class="row-title">${i + 1}. ${esc(ex.name)}</div><div class="row-sub">${sets} sets of ${esc(spec)}, ${rest} s rest</div>
    <p class="cue">${esc(ex.cue)}</p><p class="sub">${esc(ex.alt)}</p>
    ${last ? `<p class="sub">Last time, ${esc(short(last.date))}: ${last.kg ? `${last.kg} kg, ` : ''}${last.reps ?? '?'} ${unitLabel.toLowerCase()}, ${last.sets} of ${last.planned} sets. ${esc(hint)}</p>` : ''}
    <div class="ex-log">
      <label>kg<input inputmode="decimal" data-act="ex-kg" data-i="${i}" value="${esc(kg)}" placeholder="body" autocomplete="off"></label>
      <label>${unitLabel}<input inputmode="numeric" data-act="ex-reps" data-i="${i}" value="${esc(rp)}" autocomplete="off"></label>
    </div>
    <div class="sets">${Array.from({ length: sets }, (_, k) => `<button class="setbtn" data-act="set" data-i="${i}" data-k="${k}" aria-pressed="${k < done}" aria-label="Set ${k + 1}">${k + 1}</button>`).join('')}
      <button class="btn" data-act="rest" data-sec="${rest}">Rest ${rest} s</button></div></li>`;
}

function intervalPhases(n) {
  const out = [{ name: 'Warm up, easy', sec: 600, hard: false }];
  for (let i = 1; i <= n; i++) out.push({ name: `Hard ${i} of ${n}`, sec: 120, hard: true }, { name: `Easy ${i} of ${n}`, sec: 120, hard: false });
  out.push({ name: 'Cool down, easy', sec: 300, hard: false });
  return out;
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function tick() {
  const a = state.active;
  if (a && ui.session && isActive(ui.session.date, ui.session.id)) {
    const secs = (Date.now() - a.start) / 1000;
    const el = $('#elapsed');
    if (el) el.textContent = mmss(secs);
    const ph = $('#phase');
    if (ph) {
      const phases = intervalPhases(currentSession().reps || 5);
      let t = secs, i = 0;
      while (i < phases.length && t >= phases[i].sec) t -= phases[i++].sec;
      if (i !== ui.phase && ui.phase !== -1) {
        const hard = i < phases.length && phases[i].hard;
        beep(hard ? 3 : 2);
        flash(i < phases.length ? phases[i].name : 'Done', hard ? 'hard' : 'easy');
      }
      ui.phase = i;
      if (i >= phases.length) {
        ph.className = 'phase';
        ph.innerHTML = '<div class="phase-name">Done. Tap Finish.</div>';
      } else {
        ph.className = `phase${phases[i].hard ? ' hard' : ''}`;
        const next = phases[i + 1];
        ph.innerHTML = `<div class="phase-name">${esc(phases[i].name)}</div><div class="timer">${mmss(phases[i].sec - t)}</div>${next ? `<div class="sub">Next: ${esc(next.name)}</div>` : ''}`;
      }
    }
  }
  const r = $('#rest');
  if (r && ui.rest) {
    const left = Math.ceil((ui.rest.until - Date.now()) / 1000);
    r.hidden = false;
    if (left > 0) {
      r.className = 'rest';
      r.innerHTML = `<div><div class="sub">Rest</div><div class="timer">${mmss(left)}</div></div><button class="btn" data-act="rest-skip">Skip</button>`;
    } else {
      if (!ui.rest.beeped) {
        ui.rest.beeped = true;
        beep(2);
        flash('Rest over. Next set.', 'easy');
      }
      r.className = 'rest go';
      r.innerHTML = '<div><div class="sub">Rest is over</div><div class="timer">Go</div></div><button class="btn" data-act="rest-skip">OK</button>';
      if (left < -8) { ui.rest = null; r.hidden = true; }
    }
  }
}
function startTicker() {
  ui.phase = -1;
  tick();
  ticker = setInterval(tick, 500);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

let flashTimer = null;
function flash(text, kind) {
  const f = $('#flash');
  f.textContent = text;
  f.className = `flash ${kind}`;
  f.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.hidden = true; }, 2500);
}
async function wake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
function unlockAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = state.settings.loudBeep ? 'playback' : 'auto';
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
function beep(times) {
  if (navigator.vibrate) navigator.vibrate(150 * times);
  if (!audio) return;
  let t = audio.currentTime + 0.02;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.22);
    t += 0.32;
  }
}

// ---------- Food ----------
const FOOD_SECTIONS = [['menu', 'Menu'], ['prep', 'Meal prep'], ['shopping', 'Shopping'], ['recipes', 'Recipes'], ['out', 'Eating out'], ['rules', 'Rules']];
const foodMonday = () => L.addDays(L.mondayOf(todayISO()), ui.foodWeek === 'next' ? 7 : 0);

function viewFood() {
  const body = { menu: foodMenu, recipes: foodRecipes, prep: foodPrep, shopping: foodShopping, out: foodOut, rules: foodRules }[ui.food]();
  const weekly = ['menu', 'prep', 'shopping'].includes(ui.food);
  return `<h1>Food</h1>
  <div class="seg" role="group" aria-label="Food sections">${FOOD_SECTIONS.map(([k, label]) => `<button data-act="food-sec" data-id="${k}" aria-pressed="${ui.food === k}">${label}</button>`).join('')}</div>
  ${weekly ? `<div class="seg" role="group" aria-label="Which week">${[['this', 'This week'], ['next', 'Next week']].map(([k, label]) => `<button data-act="food-week" data-id="${k}" aria-pressed="${ui.foodWeek === k}">${label}</button>`).join('')}</div>` : ''}
  ${body}`;
}

function recipeBody(m) {
  return `${m.ing.length ? `<h3>You need</h3><ul>${m.ing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${m.steps.length ? `<h3>${m.where === 'out' ? 'How to order' : 'How to make it'}</h3><ol>${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    <p class="sub">About ${m.kcal} kcal, ${m.p} g protein and ${m.fib} g fibre per portion.</p>`;
}

function foodMenu() {
  const monday = foodMonday();
  const t = tgt(todayISO());
  const idx = L.menuIndex(state.profile.startDate, monday);
  return `<p>Menu ${idx + 1} of 3 for the week of ${esc(short(monday))}. Each day comes to about 2,100 to 2,300 kcal and over 140 g of protein. Your limit is ${fmt(t.kcal)} kcal, so there is room for the odd extra.</p>
  <p class="sub">${esc(MENU_NOTE)}</p>
  ${Array.from({ length: 7 }, (_, i) => {
    const date = L.addDays(monday, i);
    const items = L.menuFor(date, state);
    const tot = L.mealTotals(items.map((x) => x.meal));
    return `<section class="menu-day"><h3><span>${esc(dateText(date, { weekday: 'long', day: 'numeric', month: 'short' }))}</span><span class="sub">${fmt(tot.kcal)} kcal, ${tot.p} g protein</span></h3>
      <ul class="rows">${items.map(({ key, slot, meal, swapped }) => `<li><div class="row-main"><button class="link row-title" data-act="recipe" data-id="${meal.id}">${esc(meal.name)}</button><div class="row-sub">${SLOT_LABEL[slot]}, ${meal.kcal} kcal${swapped ? ', swapped in' : ''}</div></div>
        <button class="btn small" data-act="swap-open" data-date="${date}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">Swap</button></li>`).join('')}</ul></section>`;
  }).join('')}`;
}

function foodRecipes() {
  return SLOTS.map((slot) => `<h2>${SLOT_LABEL[slot]}</h2>${MEALS.filter((m) => m.slot === slot).map((m) => `<details><summary><span>${esc(m.name)}</span><span class="sub">${m.kcal} kcal</span></summary><div class="body">${recipeBody(m)}</div></details>`).join('')}`).join('')
    + `<h2>Extras to log honestly</h2><p class="sub">Typical values for common treats and dishes, so they go in the log in one tap: ${MEALS.filter((m) => m.slot === 'extra').map((m) => `${esc(m.name)} ${m.kcal}`).join(', ')} kcal.</p>`;
}

function foodPrep() {
  const monday = foodMonday();
  const sessions = L.prepFor(state, monday);
  const list = (items) => items.map((x) => `${esc(dateText(x.date, { weekday: 'long' }))}: ${esc(x.name)}`);
  return `${sessions.map((s) => `<h2>${esc(s.day)} ${esc(short(s.date))}</h2>
    ${s.steps.length ? `<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="sub">Nothing to batch-cook for these days.</p>'}
    ${s.covers.length ? `<h3>This covers</h3><ul>${list(s.covers).map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${s.freeze.length ? `<h3>Freeze straight away</h3><ul>${list(s.freeze).map((x) => `<li>${x}</li>`).join('')}</ul><p class="sub">Move them to the fridge the night before.</p>` : ''}
    ${s.fresh.length ? `<h3>Cook on the day</h3><ul>${list(s.fresh).map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}`).join('')}
  <h2>Keeping it safe</h2><ul>${FOOD_SAFETY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  <p class="sub">No oven? Everything here works in an air fryer, a rice cooker and one large pan. Swaps you make change this plan and the shopping list.</p>`;
}

function foodShopping() {
  const monday = foodMonday();
  const ticks = state.shopping[monday] || {};
  const groups = L.shoppingFor(state, monday);
  const row = (key, name, amount) => `<li><label><input type="checkbox" data-act="shop" data-item="${esc(key)}" ${ticks[key] ? 'checked' : ''}><span>${esc(name)}${amount ? `, <strong>${esc(amount)}</strong>` : ''}</span></label></li>`;
  return `<p class="sub">Everything for the week of ${esc(short(monday))}, worked out from that week's menu and your swaps. Shop before the Sunday prep.</p>
  ${groups.map((g) => `<h3>${esc(g.name)}</h3><ul class="checklist rows">${g.items.map((it) => row(it.key, it.name, it.amount)).join('')}</ul>`).join('')}
  <h3>Check the cupboard</h3><ul class="checklist rows">${PANTRY.map((x, i) => row(`pantry:${i}`, x, '')).join('')}</ul>
  <div class="actions"><button class="btn" data-act="shop-clear" ${Object.keys(ticks).length ? '' : 'disabled'}>Untick everything</button></div>`;
}

function foodOut() {
  return `<h2>Good choices</h2><ul>${EATING_OUT.good.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  <h2>Now and then</h2><ul>${EATING_OUT.sometimes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  <h2>Useful phrases</h2>
  <table class="zones phrases"><tbody>${EATING_OUT.phrases.map(([th, ro, en]) => `<tr><td lang="th">${th}</td><td>${esc(ro)}</td><td>${esc(en)}</td></tr>`).join('')}</tbody></table>`;
}

function foodRules() {
  return `<ol>${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
}

function slotNow() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21.5) return 'dinner';
  return 'snack';
}

function recentFoods() {
  const seen = new Set();
  const out = [];
  for (let i = 0; i <= 14 && out.length < 8; i++) {
    for (const f of [...(state.days[L.addDays(ui.date, -i)]?.foods ?? [])].reverse()) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        out.push(f);
      }
    }
  }
  return out.slice(0, 8);
}

function sheetAddFood(query = '') {
  return `<div class="sheet">
    <div class="sheet-head"><h2 id="sheet-title">Add food</h2>${CLOSE_BTN}</div>
    <div class="seg" role="group" aria-label="Meal">${SLOTS.map((s) => `<button data-act="add-slot" data-slot="${s}" aria-pressed="${ui.addSlot === s}">${SLOT_LABEL[s]}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Portion">${[0.5, 1, 1.5, 2].map((x) => `<button data-act="portion" data-n="${x}" aria-pressed="${ui.portion === x}">${x === 1 ? '1 portion' : `${x} portions`}</button>`).join('')}</div>
    <label>Search<input type="search" id="food-q" placeholder="Meals, extras and your own foods" value="${esc(query)}" autocomplete="off"></label>
    <ul class="rows" id="food-list">${foodListItems(query)}</ul>
    <h3>Something else</h3>
    <form class="grid-quick" data-form="quick">
      <label class="span2">Name<input name="name" required maxlength="80" autocomplete="off"></label>
      <label>kcal<input name="kcal" inputmode="numeric" required autocomplete="off"></label>
      <label>Protein (g)<input name="p" inputmode="numeric" autocomplete="off"></label>
      <label>Values are<select name="per"><option value="portion">for the portion</option><option value="100g">per 100 g</option></select></label>
      <label>Grams eaten<input name="grams" inputmode="numeric" placeholder="if per 100 g" autocomplete="off"></label>
      <label class="check span2"><input type="checkbox" name="sugary"> It's a sugary drink</label>
      <label class="check span2"><input type="checkbox" name="purine"> It's red meat, offal or shellfish</label>
      <label class="check span2"><input type="checkbox" name="fav" checked> Save to my foods</label>
      <button class="btn primary span2" type="submit">Add</button>
    </form>
  </div>`;
}

function foodListItems(query) {
  const q = query.trim().toLowerCase();
  const row = (name, sub, act, attrs, extra = '') => `<li><div class="row-main"><div class="row-title">${esc(name)}</div><div class="row-sub">${esc(sub)}</div></div>${extra}<button class="btn" data-act="${act}" ${attrs}>Add</button></li>`;
  const recent = q ? [] : recentFoods();
  const own = state.custom.filter((c) => !q || c.name.toLowerCase().includes(q));
  const lib = MEALS.filter((m) => !q || m.name.toLowerCase().includes(q)).slice(0, 80);
  const parts = [];
  if (recent.length) parts.push('<li class="list-head">Recent</li>', ...recent.map((f, i) => row(f.name, `${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein`, 'add-recent', `data-i="${i}"`)));
  if (own.length) {
    parts.push('<li class="list-head">My foods</li>', ...own.map((c) => (c.per === '100g'
      ? row(c.name, `${fmt(c.kcal)} kcal and ${fmt(c.p)} g protein per 100 g`, 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`, `<input class="grams" inputmode="numeric" data-grams="${esc(c.id)}" value="100" aria-label="Grams of ${esc(c.name)}">`)
      : row(c.name, `${fmt(c.kcal)} kcal, ${fmt(c.p)} g protein`, 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`))));
  }
  if (lib.length) parts.push('<li class="list-head">Meals and extras</li>', ...lib.map((m) => row(m.name, `${m.kcal} kcal, ${m.p} g protein`, 'add-food', `data-kind="meal" data-id="${m.id}"`)));
  return parts.join('') || '<li class="sub">Nothing matches. Add it under Something else.</li>';
}

function sheetSwap(date, key, slot) {
  const current = L.menuFor(date, state).find((x) => x.key === key);
  const opts = L.swapOptions(slot);
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Swap ${SLOT_LABEL[slot].toLowerCase()}</h2>${CLOSE_BTN}</div>
    <p class="sub">${esc(dateText(date))}. Planned: ${esc(L.MEAL_BY_ID[current.planned].name)}.</p>
    ${current.swapped ? `<div class="actions"><button class="btn" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="">Back to the plan</button></div>` : ''}
    <ul class="rows">${opts.map((m) => `<li><div class="row-main"><div class="row-title">${esc(m.name)}</div><div class="row-sub">${m.kcal} kcal, ${m.p} g protein, ${m.fib} g fibre</div></div>
      <button class="btn" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="${m.id}" ${m.id === current.meal.id ? 'disabled' : ''}>Choose</button></li>`).join('')}</ul></div>`;
}

// ---------- Progress ----------
const CW = 340, CH = 170, PL = 38, PR = 10, PT = 10, PB = 24;
function niceMax(v, step) {
  return Math.max(step, Math.ceil(v / step) * step);
}
function roundedBar(x, y, w, h, cls) {
  if (h <= 0.5 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `<path class="${cls}" d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z"/>`;
}
function yAxis(max, step, label) {
  const y = (v) => PT + (CH - PT - PB) * (1 - v / max);
  let s = '';
  for (let v = 0; v <= max + 0.001; v += step) s += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${PL}" x2="${CW - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`;
  return { y, s };
}
function xLabels(dates, xAt) {
  const every = Math.ceil(dates.length / 6);
  return dates.map((d, i) => ((dates.length - 1 - i) % every === 0 ? `<text class="ax" x="${xAt(i)}" y="${CH - 6}" text-anchor="middle">${L.parse(d).getDate()}</text>` : '')).join('');
}
function legend(items) {
  return `<div class="legend">${items.map(([cls, label]) => `<span class="key"><i class="${cls}"></i>${label}</span>`).join('')}</div>`;
}
function chartBox(title, legendHtml, svg) {
  return `<h3>${title}</h3><div class="chart">${legendHtml}<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(title)}. Tap a day for its numbers.">${svg}</svg></div>`;
}
function hits(n, bw, tip) {
  return Array.from({ length: n }, (_, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(tip(i))}"/>`).join('');
}

function energyChart(dates) {
  const rows = dates.map((d) => {
    const day = state.days[d];
    return { d, intake: day?.foods?.length ? L.foodTotals(day).kcal : null, out: L.burn(state, d)?.total ?? null, target: tgt(d).kcal };
  });
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.intake ?? 0, r.out ?? 0, r.target])) * 1.05, 1000);
  const { y, s } = yAxis(max, 1000, (v) => (v ? `${v / 1000}k` : '0'));
  const bw = (CW - PL - PR) / dates.length;
  const xAt = (i) => PL + i * bw + bw / 2;
  const bars = rows.map((r, i) => (r.intake == null ? '' : roundedBar(PL + i * bw + 1, y(r.intake), bw - 2, y(0) - y(r.intake), 'm-fuel'))).join('');
  let path = '', pen = false;
  rows.forEach((r, i) => {
    if (r.out == null) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${y(r.out).toFixed(1)}`;
    pen = true;
  });
  const dots = rows.map((r, i) => (r.out == null ? '' : `<circle class="d-effort" cx="${xAt(i)}" cy="${y(r.out)}" r="3.5"/>`)).join('');
  const target = `<path class="l-target" d="${rows.map((r, i) => `${i ? 'L' : 'M'}${(PL + i * bw).toFixed(1)},${y(r.target).toFixed(1)}H${(PL + (i + 1) * bw).toFixed(1)}`).join('')}"/>`;
  const tip = (i) => {
    const r = rows[i];
    return `${dateText(r.d, { weekday: 'short', day: 'numeric', month: 'short' })}\nIn: ${r.intake == null ? 'not logged' : `${fmt(r.intake)} kcal`}\nOut: ${r.out == null ? 'no Watch data' : `${fmt(r.out)} kcal`}\nLimit: ${fmt(r.target)} kcal${r.intake != null && r.out != null ? `\nBalance: ${signed(r.intake - r.out)} kcal` : ''}`;
  };
  return chartBox('Energy in and out', legend([['sw-fuel', 'Eaten'], ['sw-effort ln', 'Burned (estimate)'], ['dash', 'Your limit']]),
    `${s}${target}${bars}${path ? `<path class="l-effort" d="${path}"/>` : ''}${dots}${xLabels(dates, xAt)}${hits(dates.length, bw, tip)}`);
}

function waterChart(dates) {
  const rows = dates.map((d) => ({ d, ml: L.waterTotal(state.days[d]), target: L.waterTarget(state.days[d], tgt(d).waterBase) }));
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.ml, r.target])) * 1.05, 1000);
  const { y, s } = yAxis(max, 1000, (v) => `${v / 1000} L`);
  const bw = (CW - PL - PR) / dates.length;
  const xAt = (i) => PL + i * bw + bw / 2;
  const bars = rows.map((r, i) => roundedBar(PL + i * bw + 1, y(r.ml), bw - 2, y(0) - y(r.ml), 'm-water')).join('');
  const ticks = rows.map((r, i) => `<line class="t-target" x1="${PL + i * bw + 2}" x2="${PL + (i + 1) * bw - 2}" y1="${y(r.target)}" y2="${y(r.target)}"/>`).join('');
  const tip = (i) => `${dateText(rows[i].d, { weekday: 'short', day: 'numeric', month: 'short' })}\nDrank: ${litres(rows[i].ml)} L\nTarget: ${litres(rows[i].target)} L`;
  return chartBox('Water against the target', legend([['sw-water', 'Drank'], ['sw-ink ln', 'Target (rises with exercise)']]), `${s}${bars}${ticks}${xLabels(dates, xAt)}${hits(dates.length, bw, tip)}`);
}

function exerciseChart(mondays) {
  const rows = mondays.map((m) => {
    const pos = posOn(m);
    return { m, ex: L.weekSummary(state, m).exMin, target: pos.before ? 0 : pos.block.targets.exMin };
  });
  const top = Math.max(60, ...rows.flatMap((r) => [r.ex, r.target])) * 1.05;
  const step = top > 200 ? 100 : 50;
  const { y, s } = yAxis(niceMax(top, step), step, (v) => `${v}`);
  const bw = (CW - PL - PR) / mondays.length;
  const xAt = (i) => PL + i * bw + bw / 2;
  const bars = rows.map((r, i) => roundedBar(PL + i * bw + 3, y(r.ex), bw - 6, y(0) - y(r.ex), 'm-effort')).join('');
  const ticks = rows.map((r, i) => (r.target ? `<line class="t-target" x1="${PL + i * bw + 3}" x2="${PL + (i + 1) * bw - 3}" y1="${y(r.target)}" y2="${y(r.target)}"/>` : '')).join('');
  const labels = rows.map((r, i) => `<text class="ax" x="${xAt(i)}" y="${CH - 6}" text-anchor="middle">${esc(short(r.m))}</text>`).filter((_, i) => mondays.length <= 6 || i % 2 === (mondays.length - 1) % 2).join('');
  const tip = (i) => `Week of ${short(rows[i].m)}\nExercise: ${rows[i].ex} min\nTarget: ${rows[i].target ? `${rows[i].target} min` : 'none'}`;
  return chartBox('Exercise minutes per week', legend([['sw-effort', 'Done'], ['sw-ink ln', 'Weekly target']]), `${s}${bars}${ticks}${labels}${hits(mondays.length, bw, tip)}`);
}

function weightChart() {
  const p = state.profile;
  const windowFrom = L.addDays(p.startDate, -28);
  const ins = L.weighIns(state).filter(([d]) => d >= windowFrom);
  const trend = L.weightTrend(state).filter(([d]) => d >= windowFrom);
  const today = todayISO();
  const startD = [p.startDate, ins[0]?.[0] ?? p.startDate].sort()[0];
  const lastD = [today, ins.at(-1)?.[0] ?? today].sort().at(-1);
  const endD = [L.addDays(lastD, 14), L.addDays(p.startDate, 84)].sort().at(-1);
  const span = Math.max(1, L.diffDays(startD, endD));
  const goal = L.goalPath(p);
  const goalAt = (d) => {
    if (d <= goal[0][0]) return goal[0][1];
    for (let i = 1; i < goal.length; i++) {
      if (d <= goal[i][0]) {
        const [d0, w0] = goal[i - 1], [d1, w1] = goal[i];
        return w0 + (L.diffDays(d0, d) / L.diffDays(d0, d1)) * (w1 - w0);
      }
    }
    return goal.at(-1)[1];
  };
  const goalPts = [[startD, goalAt(startD)], ...goal.filter(([d]) => d > startD && d < endD), [endD, goalAt(endD)]];
  const pred = L.predictedWeights(state, today, L.addDays(p.startDate, -7));
  const predOk = pred.weeks >= 1;
  const vals = [...ins.map((x) => x[1]), ...goalPts.map((x) => x[1]), ...(predOk ? pred.points.map((x) => x[1]) : [])];
  const step = Math.max(...vals) - Math.min(...vals) > 10 ? 4 : 2;
  const lo = Math.floor((Math.min(...vals) - 1) / step) * step, hi = Math.ceil((Math.max(...vals) + 1) / step) * step;
  const yv = (v) => PT + (CH - PT - PB) * (1 - (v - lo) / (hi - lo));
  const x = (d) => PL + ((CW - PL - PR) * L.diffDays(startD, d)) / span;
  let s = '';
  for (let v = lo; v <= hi; v += step) s += `<line class="grid" x1="${PL}" x2="${CW - PR}" y1="${yv(v)}" y2="${yv(v)}"/><text class="ax" x="${PL - 6}" y="${yv(v) + 4}" text-anchor="end">${v}</text>`;
  for (let i = 0; i <= 3; i++) {
    const d = L.addDays(startD, Math.round((span * i) / 3));
    s += `<text class="ax" x="${x(d)}" y="${CH - 6}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${esc(short(d))}</text>`;
  }
  const line = (pts, cls) => (pts.length > 1 ? `<path class="${cls}" d="${pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${yv(v).toFixed(1)}`).join('')}"/>` : '');
  const dots = ins.map(([d, v]) => `<circle class="d-weight" cx="${x(d)}" cy="${yv(v)}" r="4.5" data-tip="${esc(`${short(d)}: ${v.toFixed(1)} kg\nGoal line: ${goalAt(d).toFixed(1)} kg`)}"/>`).join('');
  const last = trend.at(-1);
  const lbl = last ? `<text class="lbl" x="${Math.min(x(last[0]) + 8, CW - PR - 40)}" y="${yv(last[1]) - 8}">${last[1].toFixed(1)}</text>` : '';
  const keys = [['sw-ink', 'Weigh-ins'], ['sw-ink ln', 'Trend (14-day average)'], ['dash', 'Goal line'], ...(predOk ? [['sw-pred ln', `Expected from ${pred.weeks} fully logged ${pred.weeks === 1 ? 'week' : 'weeks'}`]] : [])];
  return chartBox('Weight', legend(keys), `${s}${line(goalPts, 'l-target')}${predOk ? line(pred.points, 'l-pred') : ''}${line(trend, 'l-weight')}${dots}${lbl}`);
}

function maintenanceCard() {
  const p = state.profile;
  const m = L.maintenance(state, todayISO());
  if (!m.ready) {
    return note(`<p><strong>Your real burn</strong></p><p class="sub">It shows up after 20 days of food logs and 3 weigh-ins over at least 2 weeks, counting from ${esc(short(m.from))}. So far: ${plural(m.daysLogged, 'day', 'days')} logged and ${plural(m.weighIns, 'weigh-in', 'weigh-ins')}.</p>`);
  }
  const using = p.kcalTarget === m.suggested;
  return note(`<p><strong>Your real burn</strong></p>
    <p>Over the last ${plural(m.daysLogged, 'logged day', 'logged days')} you ate about ${fmt(m.intake)} kcal a day and your weight trend moved ${m.kgPerWeek >= 0 ? '+' : '−'}${Math.abs(m.kgPerWeek).toFixed(2)} kg a week. So you burn about <strong>${fmt(m.maintenance)} kcal</strong> a day${m.formula ? `, against ${fmt(m.formula)} from the formula and the Watch` : ''}.</p>
    <p>To keep losing about 0.5 kg a week, the limit would be ${fmt(m.suggested)} kcal.</p>
    <div class="actions">${using ? '<span class="done">Using it</span>' : `<button class="btn" data-act="use-limit" data-n="${m.suggested}">Use ${fmt(m.suggested)} kcal</button>`}
    ${p.kcalTarget ? '<button class="btn" data-act="use-limit" data-n="0">Back to the automatic limit</button>' : ''}</div>`);
}

function viewProgress() {
  return `<h1>Progress</h1>
  <div class="seg" role="group" aria-label="Progress views">${[['charts', 'Charts'], ['health', 'Health checks']].map(([k, label]) => `<button data-act="progress-view" data-id="${k}" aria-pressed="${ui.progress === k}">${label}</button>`).join('')}</div>
  ${ui.progress === 'health' ? viewHealth() : viewCharts()}`;
}

function viewCharts() {
  const p = state.profile;
  const today = todayISO();
  const dates = Array.from({ length: ui.range }, (_, i) => L.addDays(today, i - ui.range + 1));
  const monday = L.mondayOf(today);
  const mondays = Array.from({ length: 8 }, (_, i) => L.addDays(monday, (i - 7) * 7)).filter((m) => L.addDays(m, 6) >= p.startDate || m === monday);
  const wk = L.weekSummary(state, monday);
  const pos = posOn(monday);
  const tg = tgt(today);
  const kgWeek = wk.balance.length >= 3 ? (-wk.balanceAvg * 7) / L.KCAL_PER_KG : null;
  const counts = L.weekCounts(state, monday);
  const any = Object.values(state.days).some((d) => d.foods?.length || d.water?.length || d.workouts?.length || d.watch || d.weight);
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<h2>This week</h2>
  <dl class="stats">
    ${stat('Sessions done', `${wk.done} of ${wk.planned}`)}
    ${stat('Exercise minutes', `${wk.exMin}${pos.before ? '' : ` of ${pos.block.targets.exMin}`}`)}
    ${stat('Training load (RPE x minutes)', fmt(wk.load))}
    ${stat('Average steps', wk.stepsAvg != null ? fmt(wk.stepsAvg) : 'no data')}
    ${stat('Food logged', `${wk.daysLogged} of 7 days`)}
    ${stat('Average eaten', wk.kcalAvg != null ? `${fmt(wk.kcalAvg)} of ${fmt(tg.kcal)} kcal` : 'no data')}
    ${stat('Average protein', wk.proteinAvg != null ? `${wk.proteinAvg} of ${tg.protein} g` : 'no data')}
    ${stat('Average water', wk.waterAvg != null ? `${litres(wk.waterAvg)} of ${litres(wk.waterTargetAvg)} L` : 'no data')}
    ${stat('Sugary drinks', `${counts.sugary} (aim for none)`)}
    ${stat('Red meat, offal or shellfish', `${counts.purine} (aim for 2 or fewer)`)}
    ${stat('In minus out, per day', wk.balanceAvg != null ? `${signed(wk.balanceAvg)} kcal` : 'no data')}
    ${kgWeek != null ? stat('At that rate', `about ${Math.abs(kgWeek).toFixed(1)} kg a week ${kgWeek > 0 ? 'down' : 'up'}`) : ''}
  </dl>
  ${maintenanceCard()}
  ${any ? '' : note('<p>Log a few days of food, water and Watch numbers and these charts fill in.</p>')}
  <div class="seg" role="group" aria-label="Days shown">${[14, 28].map((n) => `<button data-act="range" data-n="${n}" aria-pressed="${ui.range === n}">${n} days</button>`).join('')}</div>
  ${energyChart(dates)}
  ${waterChart(dates)}
  ${exerciseChart(mondays)}
  ${weightChart()}
  <h2>Week by week</h2>
  <div class="scroll-x"><table class="tbl"><thead><tr><th>Week of</th><th>Sessions</th><th>Ex min</th><th>Load</th><th>Steps</th><th>kcal</th><th>Protein</th><th>Water L</th><th>In minus out</th><th>Weight</th></tr></thead><tbody>
  ${mondays.slice().reverse().map((m) => {
    const w = L.weekSummary(state, m);
    const wt = w.weights.at(-1)?.[1];
    return `<tr><td>${esc(short(m))}</td><td>${w.done}/${w.planned}</td><td>${w.exMin}</td><td>${fmt(w.load)}</td><td>${w.stepsAvg != null ? fmt(w.stepsAvg) : ''}</td><td>${w.kcalAvg != null ? fmt(w.kcalAvg) : ''}</td><td>${w.proteinAvg ?? ''}</td><td>${w.waterAvg != null ? litres(w.waterAvg) : ''}</td><td>${w.balanceAvg != null ? signed(w.balanceAvg) : ''}</td><td>${wt ? wt.toFixed(1) : ''}</td></tr>`;
  }).join('')}</tbody></table></div>
  <p class="sub">Burned is resting energy from your weight, height and age, plus the Watch Move calories, plus about 10% of what you eat for digestion. Both sides are estimates, so watch the trend over weeks. Early on the scale often drops faster than this predicts, because of water.</p>`;
}

function viewHealth() {
  const today = todayISO();
  const labs = [...(state.labs || [])].reverse();
  const bp = [...(state.bp || [])].reverse();
  const waist = [...(state.waist || [])];
  const sum = L.bpSummary(state.bp, today);
  const lab = nextLab();
  const toLab = L.diffDays(today, lab);
  const cell = (l, key) => {
    const v = l[key];
    if (v == null) return '<td></td>';
    return `<td>${v}<span class="status">${esc(L.labStatus(key, v))}</span></td>`;
  };
  const levelText = { normal: 'Normal.', elevated: 'Slightly above 120. Keep an eye on it.', raised: 'At or above 130/80 on average. Show this to your GP.', high: 'At or above 140/90 on average. See your GP soon.' };
  const firstW = waist[0], lastW = waist.at(-1);
  return `<h2>Blood tests</h2>
  <p>Next blood test: <strong>${esc(dateText(lab))}</strong>${toLab >= 0 ? `, in ${plural(toLab, 'day', 'days')}` : ''}. Ask for fasting glucose, HbA1c, lipids and uric acid.</p>
  <label class="inline">Change the date<input type="date" data-act="next-lab" value="${lab}"></label>
  <div class="scroll-x"><table class="tbl labs"><thead><tr><th>Date</th>${LABS.map((l) => `<th>${esc(l.name)}<span class="status">${esc(l.unit)}</span></th>`).join('')}<th></th></tr></thead><tbody>
    <tr class="targets"><td>Target</td>${LABS.map((l) => `<td>${esc(l.target.split(' (')[0])}</td>`).join('')}<td></td></tr>
    ${labs.map((l) => `<tr><td>${esc(short(l.date))} ${L.parse(l.date).getFullYear()}</td>${LABS.map((x) => cell(l, x.key)).join('')}<td><button class="btn icon" data-act="health-del" data-k="labs" data-date="${l.date}" aria-label="Remove the results from ${esc(short(l.date))}">${ICON.close}</button></td></tr>`).join('')}
  </tbody></table></div>
  ${labs.length ? '' : '<p class="sub">No results yet. Add your last checkup, or import the checkup file from the Mac in More.</p>'}
  <div class="actions"><button class="btn primary" data-act="lab-open">Add results</button></div>
  <h2>Blood pressure at home</h2>
  ${sum ? `<p>Last 7 days: <strong>${sum.sys}/${sum.dia}</strong> on average from ${plural(sum.n, 'reading', 'readings')}. ${esc(levelText[sum.level])}</p>` : `<p class="sub">${esc(BP_NOTE)}</p>`}
  ${sum?.crisis ? note(`<p>${esc(BP_CRISIS)}</p>`, 'warn') : ''}
  <form class="bp-form" data-form="bp">
    <label>Top<input name="sys" inputmode="numeric" required placeholder="120" autocomplete="off"></label>
    <label>Bottom<input name="dia" inputmode="numeric" required placeholder="80" autocomplete="off"></label>
    <label>Pulse<input name="pulse" inputmode="numeric" placeholder="70" autocomplete="off"></label>
    <button class="btn primary" type="submit">Add</button>
  </form>
  ${bp.length ? `<ul class="rows">${bp.slice(0, 14).map((r) => `<li><div class="row-main"><div class="row-title">${r.sys}/${r.dia}${r.pulse ? `, pulse ${r.pulse}` : ''}</div><div class="row-sub">${esc(short(r.date))}${r.t ? ` ${esc(r.t)}` : ''}${r.clinic ? ', at the clinic' : ''}</div></div>
    <button class="btn icon" data-act="health-del" data-k="bp" data-date="${r.date}" data-item="${esc(`${r.t}|${r.sys}|${r.dia}`)}" aria-label="Remove this reading">${ICON.close}</button></li>`).join('')}</ul>` : ''}
  <h2>Waist</h2>
  ${lastW ? `<p>Latest: <strong>${lastW.cm} cm</strong> on ${esc(short(lastW.date))}${firstW !== lastW ? `, ${signed(lastW.cm - firstW.cm)} cm since ${esc(short(firstW.date))}` : ''}.</p>` : '<p class="sub">Measure once a month at the navel, breathing out normally.</p>'}
  <p class="sub">${esc(WAIST_TARGET)}</p>
  <form class="bp-form" data-form="waist">
    <label>Waist (cm)<input name="cm" inputmode="decimal" required autocomplete="off"></label>
    <button class="btn primary" type="submit">Add</button>
  </form>
  ${waist.length ? `<ul class="rows">${waist.slice().reverse().map((w) => `<li><div class="row-main"><div class="row-title">${w.cm} cm</div><div class="row-sub">${esc(short(w.date))}</div></div>
    <button class="btn icon" data-act="health-del" data-k="waist" data-date="${w.date}" aria-label="Remove this measurement">${ICON.close}</button></li>`).join('')}</ul>` : ''}`;
}

function sheetLab() {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Add blood test results</h2>${CLOSE_BTN}</div>
    <form class="form" data-form="lab">
      <label>Date<input type="date" name="date" value="${todayISO()}" required></label>
      <div class="grid2">${LABS.map((l) => `<label>${esc(l.name)} (${esc(l.unit)})<input name="${l.key}" inputmode="decimal" autocomplete="off"></label>`).join('')}</div>
      <label>Note<input name="note" maxlength="120" autocomplete="off"></label>
      <button class="btn primary big" type="submit">Save results</button>
    </form></div>`;
}

// ---------- More, setup ----------
function profileForm(p) {
  const d = p || { sex: 'm', startDate: L.nextMonday(todayISO()), waterBase: 2500 };
  const v = (k) => (d[k] == null ? '' : esc(d[k]));
  const auto = p ? `Automatic now: ${fmt(L.autoKcal(p, L.weightOn(state, todayISO())))} kcal and ${L.autoProtein(p, L.weightOn(state, todayISO()))} g protein. Leave blank to follow your weight.` : 'Leave blank to have them worked out from your weight.';
  return `<form class="form" data-form="profile">
    <div class="grid2">
      <label>Sex<select name="sex"><option value="m" ${d.sex !== 'f' ? 'selected' : ''}>Male</option><option value="f" ${d.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      <label>Age<input name="age" inputmode="numeric" required value="${v('age')}" autocomplete="off"></label>
      <label>Height (cm)<input name="heightCm" inputmode="decimal" required value="${v('heightCm')}" autocomplete="off"></label>
      <label>Weight now (kg)<input name="startWeight" inputmode="decimal" required value="${v('startWeight')}" autocomplete="off"></label>
      <label>Resting heart rate<input name="rhr" inputmode="numeric" value="${v('rhr')}" placeholder="From Health" autocomplete="off"></label>
      <label>Plan starts (Monday)<input name="startDate" type="date" required value="${v('startDate')}"></label>
    </div>
    <details class="plain"><summary>Set your own targets</summary>
      <p class="sub">${esc(auto)}</p>
      <div class="grid2">
        <label>Calories a day<input name="kcalTarget" inputmode="numeric" value="${v('kcalTarget')}" placeholder="Automatic" autocomplete="off"></label>
        <label>Protein a day (g)<input name="proteinTarget" inputmode="numeric" value="${v('proteinTarget')}" placeholder="Automatic" autocomplete="off"></label>
        <label>Water base (ml)<input name="waterBase" inputmode="numeric" value="${v('waterBase')}" placeholder="2500" autocomplete="off"></label>
        <label>Max heart rate<input name="maxHr" inputmode="numeric" value="${v('maxHr')}" placeholder="Automatic" autocomplete="off"></label>
      </div>
    </details>
    <button class="btn primary big" type="submit">${p ? 'Save' : 'Start the plan'}</button>
  </form>`;
}

function viewSetup() {
  return `<h1>Steady</h1>
  <p>A training plan that starts with walking, three rotating weekly menus with meal prep and shopping lists, and a log for food, water, effort and health checks. It works offline, and everything you enter stays on this phone.</p>
  <p class="sub">Your numbers set the calorie, protein and heart-rate targets. Resting heart rate is in the Health app under Heart.</p>
  ${profileForm(null)}
  <p class="sub">Moving phones or restoring? <label class="link">Import a backup<input type="file" accept=".json,application/json" data-act="import-backup" hidden></label></p>`;
}

function viewMore() {
  const p = state.profile;
  const st = state.settings;
  const rem = st.reminders || {};
  return `<h1>More</h1>
  <h2>You and your targets</h2>
  ${profileForm(p)}
  <h2>Gym alerts</h2>
  <label class="check"><input type="checkbox" data-act="setting" data-k="loudBeep" ${st.loudBeep ? 'checked' : ''}> Beep even when the phone is on silent (this can pause your music)</label>
  <p class="sub">The screen also flashes when rest ends and at each interval change, and it stays on during a session. ${esc(WATCH_ALERT)}</p>
  <h2>Hot months</h2>
  <p class="sub">In these months, Today and the session screens remind you to train indoors or in the cool of the day.</p>
  <div class="months">${MONTHS.map((m, i) => `<label class="check"><input type="checkbox" data-act="hot-month" data-n="${i + 1}" ${(st.hotMonths || []).includes(i + 1) ? 'checked' : ''}> ${m}</label>`).join('')}</div>
  <h2>Reminders</h2>
  <p class="sub">Web apps on iPhone cannot send their own reminders, so these go into your calendar as repeating events with an alert.</p>
  <ul class="rows rem-list">${REMINDERS.map((r) => `<li><label class="check"><input type="checkbox" data-act="rem-on" data-id="${r.id}" ${rem[r.id]?.on === false ? '' : 'checked'}> ${esc(r.label)}</label>
    <input type="time" data-act="rem-time" data-id="${r.id}" value="${esc(rem[r.id]?.time || r.time)}" aria-label="Time for ${esc(r.label)}"></li>`).join('')}</ul>
  <div class="actions"><button class="btn primary" data-act="ics">Add to Calendar</button><button class="btn" data-act="ics-save">Save the calendar file</button></div>
  <p class="sub">On the iPhone, tap Add All when the events appear. If nothing opens, save the file, then open it from Files. To change them later, delete the Steady events in Calendar and add them again.</p>
  <h2>Your data</h2>
  <p class="sub">Everything stays in this app's storage on this phone. ${ui.persisted ? 'The phone has agreed to keep it.' : ''} ${state.lastBackup ? `Last backup: ${esc(short(state.lastBackup))}.` : 'No backup yet.'}</p>
  <div class="actions">
    <button class="btn" data-act="export-open">Export backup</button>
    <label class="btn">Import backup<input type="file" accept=".json,application/json" data-act="import-backup" hidden></label>
    <label class="btn">Import Watch or checkup file<input type="file" accept=".json,application/json" data-act="import-data" hidden></label>
  </div>
  <p class="sub">The Watch file and the checkup file come from the Mac. Run export_for_app.py there, AirDrop the file to the phone, then import it here. Days you typed in yourself keep your numbers.</p>
  <h2>iPhone shortcuts</h2>
  <p class="sub">Two shortcuts move numbers without the Mac: one copies today's steps, Move and exercise minutes from Health into Steady, the other writes your food and water totals into Apple Health.</p>
  <div class="actions"><button class="btn" data-act="shortcut-help">Show the steps</button></div>
  <h2>How the numbers work</h2>
  <ul>
    <li>Calorie limit: resting energy (Mifflin-St Jeor) times 1.375, minus 550. It drops as your weight drops. After 4 weeks, Progress can replace it with your real burn.</li>
    <li>Protein: 1.3 g per kg of adjusted body weight. Fibre: 30 g.</li>
    <li>Water: the base plus 500 ml for every 30 exercise minutes, from the Watch or your logged sessions, whichever is higher.</li>
    <li>Heart rate ranges: 30, 40, 60 and 80% of heart-rate reserve.</li>
    <li>The plan holds a week when a week comes in under half, and every fourth week from week 16 is easier.</li>
    <li>Meal values are estimates for the portions in each recipe.</li>
  </ul>
  <h2>Stop and check</h2>
  <ul>${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  <h2>Start over</h2>
  <div class="actions"><button class="btn danger" data-act="reset">Delete all data</button></div>`;
}

function sheetShortcuts() {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">iPhone shortcuts</h2>${CLOSE_BTN}</div>
    <h3>Steady Watch: Health into Steady</h3><ol>${SHORTCUT_IN.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <h3>Steady to Health: Steady into Health</h3><ol>${SHORTCUT_OUT.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <p class="sub">Shortcuts menus differ a little between iOS versions. If a name doesn't match exactly, pick the closest one.</p></div>`;
}

function sheetPaste() {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Paste Watch numbers</h2>${CLOSE_BTN}</div>
    <p class="sub">The phone didn't let Steady read the clipboard. Long-press the box, tap Paste, then Use these numbers.</p>
    <form class="form" data-form="paste"><textarea name="text" rows="5" aria-label="Pasted numbers"></textarea>
    <button class="btn primary big" type="submit">Use these numbers</button></form></div>`;
}

function sheetCopy(text) {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Totals for Health</h2>${CLOSE_BTN}</div>
    <p class="sub">The phone didn't let Steady copy. Select the text, copy it, then run the Steady to Health shortcut.</p>
    <textarea rows="4" readonly aria-label="Totals">${esc(text)}</textarea></div>`;
}

function sheetExport() {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Export a backup</h2>${CLOSE_BTN}</div>
    <form class="form" data-form="export">
      <p class="sub">The file holds your weight, food, training and health checks. Add a passcode if it will sit in Files, iCloud or a chat. Without the passcode, nobody can open it, including you.</p>
      <label>Passcode (optional)<input type="password" name="pass" autocomplete="new-password"></label>
      <label>Passcode again<input type="password" name="pass2" autocomplete="new-password"></label>
      <button class="btn primary big" type="submit">Export</button>
    </form></div>`;
}

function sheetUnlock() {
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Open a protected backup</h2>${CLOSE_BTN}</div>
    <form class="form" data-form="unlock"><label>Passcode<input type="password" name="pass" required autocomplete="current-password"></label>
    <button class="btn primary big" type="submit">Open</button></form></div>`;
}

// ---------- Sheet, tooltip, toast ----------
function showSheet(html) {
  const s = $('#sheet');
  s.innerHTML = html;
  if (!s.open) s.showModal();
}
function closeSheet() {
  const s = $('#sheet');
  if (s.open) s.close();
  s.innerHTML = '';
}
function showTip(el, e) {
  const tip = $('#tip');
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(8, e.clientX - r.width / 2), window.innerWidth - r.width - 8)}px`;
  tip.style.top = `${e.clientY - r.height - 14 < 8 ? e.clientY + 18 : e.clientY - r.height - 14}px`;
}
function hideTip() {
  $('#tip').hidden = true;
}
let toastTimer = null;
function toast(msg, undo = false) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="btn small" data-act="undo">Undo</button>' : ''}`;
  t.classList.toggle('has-btn', undo);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show', 'has-btn');
    if (undo) undoSnap = null;
  }, undo ? 6000 : 2200);
}

async function shareFile(name, type, text) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e.name === 'AbortError') return false;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

// ---------- Actions ----------
function finishSheet() {
  const s = currentSession();
  const mins = Math.max(1, Math.round((Date.now() - state.active.start) / 60000));
  const rpe = DEFAULT_RPE[s.effort] ?? 5;
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Finish ${esc(s.name.toLowerCase())}</h2>${CLOSE_BTN}</div>
    <form class="form" data-form="finish">
      <label>Minutes<input name="min" inputmode="numeric" value="${mins}" required autocomplete="off"></label>
      <div><div class="slot-label">How hard was it? (RPE, target ${esc(EFFORT[s.effort].rpe)})</div>
        <div class="rpe" role="group" aria-label="RPE">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-act="rpe" data-n="${i + 1}" aria-pressed="${i + 1 === rpe}">${i + 1}</button>`).join('')}</div>
        <input type="hidden" name="rpe" value="${rpe}"></div>
      <label>Average heart rate (optional)<input name="hr" inputmode="numeric" placeholder="From the Watch summary" autocomplete="off"></label>
      <label>Note (optional)<input name="note" maxlength="200" autocomplete="off"></label>
      <div class="actions"><button class="btn effort big" type="submit">Save session</button><button class="btn" type="button" data-act="discard">Discard</button></div>
    </form></div>`;
}

function strengthLog(s, a) {
  if (!s.exercises) return [];
  return s.exercises.map(([id, sets, spec], i) => {
    const last = L.lastStrength(state, id, ui.session.date);
    const log = a?.log?.[i] ?? { kg: last?.kg ?? null, reps: last?.reps ?? L.repSpec(spec).top };
    return { id, kg: log.kg ?? null, reps: log.reps ?? null, sets: a ? (a.sets[i] ?? 0) : sets, planned: sets };
  });
}
function logWorkout(id, min, rpe, hr, note, ex = []) {
  rw(ui.session.date).workouts.push({ id, name: SESSIONS[id].name, min, rpe, hr: hr ?? null, note: note || '', t: clock(), ex });
}
function foodFromMeal(m, slot, x = 1) {
  return {
    name: x === 1 ? m.name : `${m.name} (${x} portions)`, slot, kcal: Math.round(m.kcal * x), p: Math.round(m.p * x), fib: Math.round((m.fib || 0) * x),
    ref: m.id, t: clock(), tags: m.tags || [],
  };
}
function applyPaste(text) {
  try {
    const r = L.parseWatchPaste(text, ui.date);
    if (r.kind === 'file') {
      snapshot();
      const n = L.mergeWatch(state, r.data);
      save(); closeSheet(); render();
      return toast(`Added Watch numbers for ${plural(n, 'day', 'days')}`, true);
    }
    snapshot();
    const day = rw(r.date);
    day.watch = { ...(day.watch ?? {}), ...r.watch, src: 'shortcut' };
    save(); closeSheet(); render();
    toast(`Watch numbers added for ${short(r.date)}`, true);
  } catch (e) {
    toast(e.message);
  }
}

const ACT = {
  tab: (el) => {
    ui.tab = ui.screen = el.dataset.tab;
    if (ui.tab === 'today') ui.date = todayISO();
    if (ui.tab === 'train') ui.week = null;
    render(true);
  },
  day: (el) => {
    const n = Number(el.dataset.n);
    ui.date = n === 0 ? todayISO() : L.addDays(ui.date, n);
    render();
  },
  week: (el) => {
    ui.week = L.addDays(trainMonday(), Number(el.dataset.n));
    render();
  },
  undo: () => {
    if (!undoSnap) return;
    state = JSON.parse(undoSnap);
    undoSnap = null;
    save();
    render();
    toast('Undone');
  },
  water: (el) => {
    rw(ui.date).water.push({ ml: Number(el.dataset.ml), t: clock() });
    save();
    render();
  },
  'water-undo': () => {
    rw(ui.date).water.pop();
    save();
    render();
  },
  'log-menu': (el) => {
    const { slot, id } = el.dataset;
    const day = rw(ui.date);
    const i = day.foods.findIndex((f) => f.ref === id && f.slot === slot);
    if (i >= 0) {
      snapshot();
      day.foods.splice(i, 1);
      save();
      render();
      return toast('Removed from the log', true);
    }
    day.foods.push(foodFromMeal(L.MEAL_BY_ID[id], slot));
    save();
    render();
  },
  'log-day': () => {
    snapshot();
    const day = rw(ui.date);
    let n = 0;
    for (const { slot, meal } of L.menuFor(ui.date, state)) {
      if (!day.foods.some((f) => f.ref === meal.id && f.slot === slot)) { day.foods.push(foodFromMeal(meal, slot)); n++; }
    }
    save();
    render();
    toast(`Logged ${plural(n, 'meal', 'meals')} as planned`, true);
  },
  'same-yesterday': () => {
    snapshot();
    const prev = state.days[L.addDays(ui.date, -1)]?.foods ?? [];
    rw(ui.date).foods.push(...prev.map((f) => ({ ...f, t: clock() })));
    save();
    render();
    toast(`Copied ${plural(prev.length, 'item', 'items')} from yesterday`, true);
  },
  'food-del': (el) => {
    snapshot();
    rw(ui.date).foods.splice(Number(el.dataset.i), 1);
    save();
    render();
    toast('Removed', true);
  },
  recipe: (el) => {
    const m = L.MEAL_BY_ID[el.dataset.id];
    showSheet(`<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">${esc(m.name)}</h2>${CLOSE_BTN}</div>${recipeBody(m)}</div>`);
  },
  'swap-open': (el) => showSheet(sheetSwap(el.dataset.date, el.dataset.key, el.dataset.slot)),
  'swap-set': (el) => {
    const { date, key, id } = el.dataset;
    snapshot();
    state.swaps ||= {};
    if (id) (state.swaps[date] ||= {})[key] = id;
    else if (state.swaps[date]) {
      delete state.swaps[date][key];
      if (!Object.keys(state.swaps[date]).length) delete state.swaps[date];
    }
    save();
    closeSheet();
    render();
    toast(id ? `Swapped in ${L.MEAL_BY_ID[id].name}` : 'Back to the plan', true);
  },
  'add-food-open': () => {
    ui.addSlot = slotNow();
    ui.portion = 1;
    showSheet(sheetAddFood());
  },
  'add-slot': (el) => {
    ui.addSlot = el.dataset.slot;
    el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  portion: (el) => {
    ui.portion = Number(el.dataset.n);
    el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  'add-food': (el) => {
    const kind = el.dataset.kind;
    const x = ui.portion;
    let food;
    if (kind === 'custom') {
      const c = state.custom.find((f) => f.id === el.dataset.id);
      if (!c) return;
      if (c.per === '100g') {
        const g = int(document.querySelector(`[data-grams="${CSS.escape(c.id)}"]`)?.value) || 100;
        const f = (g / 100) * x;
        food = { name: `${c.name} (${Math.round(g * x)} g)`, slot: ui.addSlot, kcal: Math.round(c.kcal * f), p: Math.round(c.p * f), fib: Math.round((c.fib || 0) * f), ref: '', t: clock(), tags: c.tags || [] };
      } else {
        food = { ...foodFromMeal(c, ui.addSlot, x), ref: '' };
      }
    } else {
      food = foodFromMeal(L.MEAL_BY_ID[el.dataset.id], ui.addSlot, x);
    }
    rw(ui.date).foods.push(food);
    save();
    closeSheet();
    render();
    toast(`Added to ${SLOT_LABEL[ui.addSlot].toLowerCase()}`);
  },
  'add-recent': (el) => {
    const f = recentFoods()[Number(el.dataset.i)];
    if (!f) return;
    const x = ui.portion;
    rw(ui.date).foods.push({ ...f, slot: ui.addSlot, kcal: Math.round(f.kcal * x), p: Math.round(f.p * x), fib: Math.round((f.fib || 0) * x), t: clock() });
    save();
    closeSheet();
    render();
    toast(`Added to ${SLOT_LABEL[ui.addSlot].toLowerCase()}`);
  },
  'sheet-close': () => closeSheet(),
  'open-session': (el) => {
    ui.session = { date: el.dataset.date || ui.date, id: el.dataset.id };
    ui.screen = 'session';
    ui.rest = null;
    render(true);
  },
  'close-session': () => {
    ui.screen = ui.tab;
    ui.rest = null;
    if (!state.active) wake(false);
    render(true);
  },
  start: () => {
    if (state.active && !confirm('Another session is running. Discard it and start this one?')) return;
    startActive();
    save();
    render();
  },
  'walk-log': (el) => {
    rw(el.dataset.date).workouts.push({ id: 'walks', name: SESSIONS.walks.name, min: 10, rpe: DEFAULT_RPE.easy, hr: null, note: '', t: clock(), ex: [] });
    save();
    render();
    toast('Walk logged');
  },
  'quick-log': (el) => {
    const s = currentSession();
    logWorkout(s.id, Number(el.dataset.n), DEFAULT_RPE[s.effort] ?? 5, null, '', strengthLog(s, null));
    save();
    render();
    toast('Logged');
  },
  set: (el) => {
    const i = Number(el.dataset.i), k = Number(el.dataset.k);
    if (!isActive(ui.session.date, ui.session.id)) {
      if (state.active && !confirm('Another session is running. Discard it and start this one?')) return;
      startActive();
    }
    unlockAudio();
    const done = state.active.sets[i] ?? 0;
    const next = k < done ? k : k + 1;
    state.active.sets[i] = next;
    save();
    if (next > done) ui.rest = { until: Date.now() + currentSession().exercises[i][3] * 1000, beeped: false };
    render();
  },
  rest: (el) => {
    unlockAudio();
    ui.rest = { until: Date.now() + Number(el.dataset.sec) * 1000, beeped: false };
    tick();
  },
  'rest-skip': () => {
    ui.rest = null;
    $('#rest').hidden = true;
  },
  'flash-hide': () => { $('#flash').hidden = true; },
  finish: () => showSheet(finishSheet()),
  rpe: (el) => {
    el.closest('form').elements.rpe.value = el.dataset.n;
    el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  },
  discard: () => {
    if (!confirm('Discard this session without saving it?')) return;
    state.active = null;
    save();
    wake(false);
    closeSheet();
    render();
  },
  'workout-del': (el) => {
    snapshot();
    rw(ui.session.date).workouts.splice(Number(el.dataset.i), 1);
    save();
    render();
    toast('Session removed', true);
  },
  'repeat-week': (el) => {
    snapshot();
    const next = L.addDays(L.mondayOf(todayISO()), 7);
    state.repeats ||= [];
    if (el.dataset.n === '1') {
      if (!state.repeats.includes(next)) state.repeats.push(next);
      state.skipHolds = (state.skipHolds || []).filter((x) => x !== next);
    } else {
      state.repeats = state.repeats.filter((x) => x !== next);
      (state.skipHolds ||= []).push(next);
    }
    state.repeats.sort();
    save();
    render();
    toast(el.dataset.n === '1' ? 'Next week repeats this one' : 'Next week moves on', true);
  },
  'skip-hold': () => {
    snapshot();
    const mon = L.mondayOf(todayISO());
    state.repeats = (state.repeats || []).filter((x) => x !== mon);
    (state.skipHolds ||= []).push(mon);
    save();
    render();
    toast('Moved on to the next week', true);
  },
  'go-health': () => {
    ui.tab = ui.screen = 'progress';
    ui.progress = 'health';
    render(true);
  },
  'food-sec': (el) => { ui.food = el.dataset.id; render(); },
  'food-week': (el) => { ui.foodWeek = el.dataset.id; render(); },
  'progress-view': (el) => { ui.progress = el.dataset.id; render(); },
  'shop-clear': () => {
    snapshot();
    delete state.shopping[foodMonday()];
    save();
    render();
    toast('Unticked', true);
  },
  range: (el) => { ui.range = Number(el.dataset.n); render(); },
  'use-limit': (el) => {
    snapshot();
    const n = Number(el.dataset.n);
    state.profile.kcalTarget = n || null;
    save();
    render();
    toast(n ? `Limit set to ${fmt(n)} kcal` : 'Back to the automatic limit', true);
  },
  'lab-open': () => showSheet(sheetLab()),
  'health-del': (el) => {
    snapshot();
    const { k, date, item } = el.dataset;
    if (k === 'bp') state.bp = state.bp.filter((r) => !(r.date === date && `${r.t}|${r.sys}|${r.dia}` === item));
    else state[k] = (state[k] || []).filter((x) => x.date !== date);
    save();
    render();
    toast('Removed', true);
  },
  'paste-watch': async () => {
    try {
      applyPaste(await navigator.clipboard.readText());
    } catch {
      showSheet(sheetPaste());
    }
  },
  'copy-health': async () => {
    const text = JSON.stringify(L.healthTotals(state, ui.date));
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Now run Steady to Health.');
    } catch {
      showSheet(sheetCopy(text));
    }
  },
  'shortcut-help': () => showSheet(sheetShortcuts()),
  ics: () => {
    const cal = reminderFile();
    if (!cal) return;
    const url = URL.createObjectURL(new Blob([cal], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  'ics-save': async () => {
    const cal = reminderFile();
    if (cal) await shareFile('steady-reminders.ics', 'text/calendar', cal);
  },
  'export-open': () => showSheet(sheetExport()),
  'update-now': () => {
    ui.updating = true;
    swReg?.waiting?.postMessage('skip');
  },
  reset: () => {
    if (!confirm('Delete everything in Steady on this phone? Export a backup first if you might want it back.')) return;
    localStorage.removeItem(KEY);
    state = blank();
    ui.tab = 'today';
    render(true);
  },
};

// Re-render after a field edit only once no field in the page has focus, so moving
// from one number box to the next does not close the phone keyboard.
let pending = false;
function renderWhenIdle() {
  pending = true;
  setTimeout(() => {
    if (!pending || document.activeElement?.matches?.('#main input')) return;
    pending = false;
    render();
  }, 60);
}
document.addEventListener('focusout', () => { if (pending) renderWhenIdle(); });

function exLog(el, key, value) {
  if (!isActive(ui.session.date, ui.session.id)) {
    if (state.active && !confirm('Another session is running. Discard it and start this one?')) return;
    startActive();
  }
  const i = Number(el.dataset.i);
  state.active.log[i] = { ...(state.active.log[i] ?? {}), [key]: value };
  save();
}

const CHANGE = {
  watch: (el) => {
    const day = rw(ui.date);
    day.watch = { ...(day.watch ?? {}), [el.dataset.k]: int(el.value), src: 'manual' };
    save();
    renderWhenIdle();
  },
  weight: (el) => {
    const v = dec(el.value);
    const day = rw(ui.date);
    if (v == null) delete day.weight;
    else if (v >= 30 && v <= 400) day.weight = Math.round(v * 10) / 10;
    else return toast('Enter the weight in kg, like 124.6');
    save();
    renderWhenIdle();
  },
  'ex-kg': (el) => exLog(el, 'kg', dec(el.value)),
  'ex-reps': (el) => exLog(el, 'reps', int(el.value)),
  shop: (el) => {
    const mon = foodMonday();
    state.shopping[mon] ||= {};
    if (el.checked) state.shopping[mon][el.dataset.item] = true;
    else delete state.shopping[mon][el.dataset.item];
    save();
    render();
  },
  'next-lab': (el) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return;
    state.profile.nextLab = el.value;
    save();
    render();
  },
  setting: (el) => {
    state.settings[el.dataset.k] = el.checked;
    save();
  },
  'hot-month': (el) => {
    const m = Number(el.dataset.n);
    const set = new Set(state.settings.hotMonths || []);
    if (el.checked) set.add(m);
    else set.delete(m);
    state.settings.hotMonths = [...set].sort((a, b) => a - b);
    save();
  },
  'rem-on': (el) => {
    const r = (state.settings.reminders ||= {});
    r[el.dataset.id] = { ...(r[el.dataset.id] ?? {}), on: el.checked };
    save();
  },
  'rem-time': (el) => {
    if (!/^\d{2}:\d{2}$/.test(el.value)) return;
    const r = (state.settings.reminders ||= {});
    r[el.dataset.id] = { ...(r[el.dataset.id] ?? {}), time: el.value };
    save();
  },
  'import-backup': (el) => importFile(el, 'backup'),
  'import-data': (el) => importFile(el, 'data'),
};

const SUBMIT = {
  profile: (f) => {
    const g = (k) => f.elements[k]?.value;
    const p = {
      ...(state.profile || {}),
      sex: g('sex') === 'f' ? 'f' : 'm', age: int(g('age')), heightCm: dec(g('heightCm')), startWeight: dec(g('startWeight')),
      rhr: int(g('rhr')), startDate: g('startDate'), kcalTarget: int(g('kcalTarget')), proteinTarget: int(g('proteinTarget')),
      waterBase: int(g('waterBase')) || 2500, maxHr: int(g('maxHr')),
    };
    const bad = (!p.age || p.age < 15 || p.age > 90) ? 'Enter your age in years.'
      : (!p.heightCm || p.heightCm < 120 || p.heightCm > 230) ? 'Enter your height in centimetres.'
      : (!p.startWeight || p.startWeight < 35 || p.startWeight > 350) ? 'Enter your weight in kg.'
      : (p.rhr != null && (p.rhr < 35 || p.rhr > 110)) ? 'Resting heart rate should be between 35 and 110.'
      : !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate || '') ? 'Pick the date the plan starts.'
      : (p.kcalTarget != null && (p.kcalTarget < 1200 || p.kcalTarget > 5000)) ? 'A calorie limit under 1,200 or over 5,000 is not safe to use here.'
      : null;
    if (bad) return toast(bad);
    p.startDate = L.mondayOf(p.startDate);
    const first = !state.profile;
    if (state.profile && state.profile.startDate !== p.startDate) {
      state.repeats = [];
      state.skipHolds = [];
      state.holdChecked = null;
    }
    state.profile = p;
    L.applyHolds(state, todayISO());
    save();
    if (first) {
      ui.screen = ui.tab = 'today';
      navigator.storage?.persist?.().then((ok) => { ui.persisted = ok; });
    }
    render(true);
    toast(first ? 'Plan set up' : 'Saved');
  },
  quick: (f) => {
    const el = f.elements;
    const name = String(el.name.value).trim().slice(0, 80);
    const kcal = int(el.kcal.value);
    const p = int(el.p.value) ?? 0;
    if (!name || kcal == null) return toast('Add a name and the calories.');
    const per = el.per.value === '100g' ? '100g' : 'portion';
    const grams = int(el.grams.value) || 100;
    const tg = [el.sugary.checked && 'sugary', el.purine.checked && 'purine'].filter(Boolean);
    if (el.fav.checked && !state.custom.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      state.custom.unshift({ id: `c${Date.now().toString(36)}`, name, kcal, p, fib: 0, per, tags: tg });
    }
    const x = (per === '100g' ? grams / 100 : 1) * ui.portion;
    rw(ui.date).foods.push({ name: per === '100g' ? `${name} (${Math.round(grams * ui.portion)} g)` : name, slot: ui.addSlot, kcal: Math.round(kcal * x), p: Math.round(p * x), fib: 0, ref: '', t: clock(), tags: tg });
    save();
    closeSheet();
    render();
    toast(`Added to ${SLOT_LABEL[ui.addSlot].toLowerCase()}`);
  },
  finish: (f) => {
    const min = int(f.elements.min.value);
    if (!min || min > 600) return toast('Enter the minutes.');
    const hr = int(f.elements.hr.value);
    const s = currentSession();
    logWorkout(state.active.id, min, Number(f.elements.rpe.value), hr && hr >= 40 && hr <= 230 ? hr : null, f.elements.note.value.trim().slice(0, 200), strengthLog(s, state.active));
    state.active = null;
    save();
    wake(false);
    closeSheet();
    render();
    toast('Session saved');
  },
  lab: (f) => {
    const date = f.elements.date.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('Pick the date of the test.');
    const entry = { date, note: f.elements.note.value.trim().slice(0, 120) };
    for (const l of LABS) entry[l.key] = dec(f.elements[l.key].value);
    if (LABS.every((l) => entry[l.key] == null)) return toast('Enter at least one result.');
    const clean = L.cleanBackup({ v: 1, days: {}, labs: [entry] }).labs[0];
    snapshot();
    state.labs = [...(state.labs || []).filter((x) => x.date !== date), clean].sort((a, b) => (a.date < b.date ? -1 : 1));
    save();
    closeSheet();
    render();
    toast('Results saved', true);
  },
  bp: (f) => {
    const sys = int(f.elements.sys.value), dia = int(f.elements.dia.value), pulse = int(f.elements.pulse.value);
    if (!sys || !dia || sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys) return toast('Enter the top and bottom numbers, like 128 and 82.');
    (state.bp ||= []).push({ date: todayISO(), t: clock(), sys, dia, pulse: pulse && pulse >= 30 && pulse <= 220 ? pulse : null, clinic: false });
    save();
    render();
    toast(sys >= 180 || dia >= 120 ? 'Saved. Read the warning below.' : 'Reading saved');
  },
  waist: (f) => {
    const cm = dec(f.elements.cm.value);
    if (!cm || cm < 40 || cm > 250) return toast('Enter your waist in centimetres.');
    state.waist = [...(state.waist || []).filter((w) => w.date !== todayISO()), { date: todayISO(), cm: Math.round(cm * 10) / 10 }].sort((a, b) => (a.date < b.date ? -1 : 1));
    save();
    render();
    toast('Waist saved');
  },
  paste: (f) => applyPaste(f.elements.text.value),
  export: async (f) => {
    const pass = f.elements.pass.value;
    if (pass !== f.elements.pass2.value) return toast('The two passcodes do not match.');
    if (pass && pass.length < 6) return toast('Use at least 6 characters for the passcode.');
    const data = { ...state, active: null };
    const body = pass ? await L.encryptJson(data, pass) : data;
    const ok = await shareFile(`steady-backup-${todayISO()}${pass ? '-protected' : ''}.json`, 'application/json', JSON.stringify(body));
    if (!ok) return;
    state.lastBackup = todayISO();
    save();
    closeSheet();
    render();
    toast('Backup exported');
  },
  unlock: async (f) => {
    try {
      const data = await L.decryptJson(ui.pendingFile, f.elements.pass.value);
      ui.pendingFile = null;
      closeSheet();
      restoreBackup(data);
    } catch (e) {
      toast(e.message);
    }
  },
};

function reminderFile() {
  const start = [todayISO(), state.profile.startDate].sort().at(-1);
  const { text, count } = L.icsFile(state.settings.reminders, start, new Date());
  if (!count) {
    toast('Turn on at least one reminder first.');
    return null;
  }
  return text;
}

function restoreBackup(data) {
  try {
    const clean = L.cleanBackup(data);
    if (!confirm('Replace everything in Steady with this backup?')) return;
    state = { ...blank(), ...clean };
    save();
    ui.tab = ui.screen = 'today';
    render(true);
    toast('Backup restored');
  } catch (e) {
    toast(e.message);
  }
}

async function importFile(input, kind) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (f.size > 8e6) return toast('That file is too big to be a Steady file.');
  let data;
  try {
    data = JSON.parse(await f.text());
  } catch {
    return toast('That file is not valid JSON.');
  }
  if (kind === 'backup') {
    if (data?.kind === 'steady-encrypted') {
      ui.pendingFile = data;
      return showSheet(sheetUnlock());
    }
    return restoreBackup(data);
  }
  try {
    snapshot();
    if (data?.kind === 'steady-watch') {
      const n = L.mergeWatch(state, data);
      toast(`Added Watch numbers for ${plural(n, 'day', 'days')}`, true);
    } else if (data?.kind === 'steady-health') {
      const n = L.mergeHealth(state, data);
      toast(`Added ${plural(n, 'checkup entry', 'checkup entries')}`, true);
    } else {
      throw new Error('This is not a Watch or checkup file for Steady. Backups go in Import backup.');
    }
    save();
    render(true);
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Wiring ----------
document.addEventListener('click', (e) => {
  const tipEl = e.target.closest?.('[data-tip]');
  if (tipEl) showTip(tipEl, e);
  else hideTip();
  if (e.target === $('#sheet')) return closeSheet();
  const el = e.target.closest?.('[data-act]');
  if (!el || el.matches('input, select, textarea')) return;
  const fn = ACT[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches?.('[data-act]')) CHANGE[el.dataset.act]?.(el);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  SUBMIT[f.dataset.form]?.(f);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'food-q') $('#food-list').innerHTML = foodListItems(e.target.value);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('input[data-act="watch"], input[data-act="weight"], input[data-act^="ex-"]')) e.target.blur();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.profile && L.applyHolds(state, todayISO()).length) save();
  if (ui.onToday && ui.date !== todayISO() && ui.screen === 'today') {
    ui.date = todayISO();
    render();
  }
  if (state.active && ui.screen === 'session') wake(true);
});
window.addEventListener('scroll', hideTip, { passive: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    swReg = reg;
    const ready = () => { if (reg.waiting && navigator.serviceWorker.controller) $('#update').hidden = false; };
    ready();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') ready(); });
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ui.updating) location.reload();
  });
}
navigator.storage?.persisted?.().then((ok) => { ui.persisted = ok; });
if (state.profile && L.applyHolds(state, todayISO()).length) save();
if (state.active) ui.session = { date: state.active.date, id: state.active.id };
render(true);
