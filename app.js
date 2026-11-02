import * as L from './logic.js';
import { icon } from './icons.js';
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
const TABS = [['today', 'Today', 'calendar-check'], ['train', 'Train', 'barbell'], ['food', 'Food', 'fork-knife'], ['progress', 'Progress', 'chart-line-up'], ['more', 'More', 'dots-three-circle']];
const SESSION_ICON = { walks: 'person-simple-walk', longwalk: 'footprints', cardio: 'heartbeat', intervals: 'timer', rest: 'bed' };
const sessionIcon = (s) => SESSION_ICON[s.id] || (s.kind === 'strength' ? 'barbell' : 'heartbeat');
const CLOSE_BTN = `<button class="icon-btn" data-act="sheet-close" aria-label="Close">${icon('x')}</button>`;

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
let titleObserver = null;

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
const hasLog = (d) => { const x = state.days[d]; return !!(x && (x.foods?.length || x.water?.length || x.workouts?.length)); };
function snapshot() {
  undoSnap = JSON.stringify(state);
}

// ---------- Rendering ----------
const VIEWS = { today: viewToday, train: viewTrain, food: viewFood, progress: viewProgress, more: viewMore, session: viewSession, setup: viewSetup };

function render(top = false) {
  stopTicker();
  if (!state.profile) ui.screen = 'setup';
  const focusKey = top ? null : keyOf(document.activeElement);
  const chipX = $('#main .chips')?.scrollLeft ?? 0;
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
  observeTitle();
  keepChip(chipX);
}
// The section chips scroll sideways: keep the row where it was and bring the selected chip into view.
function keepChip(x) {
  const row = $('#main .chips');
  const on = row?.querySelector('[aria-pressed="true"]');
  if (!on) return;
  row.scrollLeft = x;
  const r = row.getBoundingClientRect();
  const c = on.getBoundingClientRect();
  if (c.right > r.right - 16) row.scrollLeft += c.right - r.right + 16;
  else if (c.left < r.left + 16) row.scrollLeft -= r.left + 16 - c.left;
}
function keyOf(el) {
  if (!el || !el.dataset || !el.dataset.act || !$('#main').contains(el)) return null;
  const parts = ['act', 'id', 'slot', 'key', 'ml', 'k', 'i', 'n', 'sec', 'date', 'item'].filter((k) => el.dataset[k] != null);
  return parts.map((k) => `[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('');
}
// The large title folds into the blurred bar at the top once it scrolls away, as on iOS.
function observeTitle() {
  titleObserver?.disconnect();
  const bar = $('#navbar');
  const title = $('#main .nav-title');
  bar.classList.remove('on');
  if (!title || !('IntersectionObserver' in window)) return;
  $('#navbar-title').textContent = title.textContent;
  titleObserver = new IntersectionObserver(([e]) => bar.classList.toggle('on', !e.isIntersecting), { rootMargin: '-52px 0px 0px 0px' });
  titleObserver.observe(title);
}

function nav(title, cap = '', actions = '') {
  return `<header class="nav"><div class="nav-row"><div class="nav-text">${cap ? `<p class="nav-cap">${cap}</p>` : ''}<h1 class="nav-title">${title}</h1></div>${actions ? `<div class="nav-actions">${actions}</div>` : ''}</div></header>`;
}
const sectionHead = (title, meta = '') => `<div class="section-head"><h2>${title}</h2>${meta ? `<span class="section-meta">${meta}</span>` : ''}</div>`;
const callout = (iconName, html, cls = '') => `<div class="callout ${cls}"><span class="tile ${cls || 'info'}">${icon(iconName)}</span><div class="callout-body">${html}</div></div>`;
const foot = (html) => `<p class="section-foot">${html}</p>`;

function ring(kind, name, value, target, valText, unit, ofText, iconName) {
  const r = 40, c = 2 * Math.PI * r;
  const f = target > 0 ? value / target : value > 0 ? 1 : 0;
  const arc = (frac, cls) => (frac > 0.001 ? `<circle class="${cls}" cx="50" cy="50" r="${r}" stroke-dasharray="${(c * frac).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 50 50)"/>` : '');
  return `<figure class="ring ${kind}">
    <div class="ring-art"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="${r}"/>${arc(Math.min(f, 1), 'ring-arc')}${arc(Math.min(Math.max(f - 1, 0), 1), 'ring-over')}</svg>${icon(iconName, 'ring-icon')}</div>
    <figcaption><span class="ring-name">${name}</span><span class="ring-val"><span class="num">${valText}</span><span class="unit"> ${unit}</span></span><span class="ring-of">${ofText}</span></figcaption>
  </figure>`;
}
function minibar(value, target, kind, width = 120) {
  const f = target > 0 ? Math.min(value / target, 1) : 0;
  return `<svg class="minibar" viewBox="0 0 ${width} 6" preserveAspectRatio="none" aria-hidden="true"><rect class="mb-track" width="${width}" height="6" rx="3"/>${f > 0 ? `<rect class="mb-${kind}" width="${Math.max(6, width * f).toFixed(1)}" height="6" rx="3"/>` : ''}</svg>`;
}
function meter(label, value, target, kind, unit = '') {
  return `<div class="meter"><div class="meter-top"><span>${label}</span><span class="meter-val"><span class="num">${fmt(value)}</span>${unit} of ${fmt(target)}${unit}</span></div>${minibar(value, target, kind, 300)}</div>`;
}

// ---------- Today ----------
function weekStrip(d) {
  const monday = L.mondayOf(d);
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(monday, i));
  return `<div class="week-strip" role="group" aria-label="Pick a day">
    <button class="strip-nav" data-act="strip" data-n="-7" aria-label="Previous week">${icon('caret-left')}</button>
    ${days.map((x) => `<button class="day${x === d ? ' sel' : ''}${x === today ? ' now' : ''}" data-act="day-pick" data-date="${x}" aria-pressed="${x === d}" aria-label="${esc(dateText(x))}">
      <span class="dow">${esc(dateText(x, { weekday: 'narrow' }))}</span><span class="dn num">${L.parse(x).getDate()}</span><span class="mark${hasLog(x) ? ' on' : ''}"></span></button>`).join('')}
    <button class="strip-nav" data-act="strip" data-n="7" aria-label="Next week">${icon('caret-right')}</button>
  </div>`;
}

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
  const counts = L.weekCounts(state, L.mondayOf(d));
  const planMeta = pos.before ? `Starts ${esc(short(p.startDate))}` : `Week ${pos.week}, ${esc(pos.block.name.toLowerCase())}`;
  return `
  ${nav(isToday ? 'Today' : esc(dateText(d, { weekday: 'long' })), esc(dateText(d, { day: 'numeric', month: 'long', year: 'numeric' })),
    isToday ? '' : '<button class="btn btn-gray btn-sm" data-act="day" data-n="0">Today</button>')}
  ${weekStrip(d)}
  ${banners(d, pos, sessions)}
  <section class="card summary" aria-label="Food, water and exercise so far">
    <div class="rings">
      ${ring('fuel', 'Food', food.kcal, t.kcal, fmt(food.kcal), 'kcal', `of ${fmt(t.kcal)}`, 'fork-knife')}
      ${ring('water', 'Water', water, wTarget, litres(water), 'L', `of ${litres(wTarget)}`, 'drop')}
      ${ring('effort', 'Exercise', exDone, exPlan, String(exDone), 'min', exPlan ? `of ${exPlan}` : 'rest day', 'flame')}
    </div>
    <div class="mini-bars">
      <div class="mini"><span class="mini-label">Protein</span><span class="mini-val"><span class="num">${food.p}</span> of ${t.protein} g</span>${minibar(food.p, t.protein, 'fuel')}</div>
      <div class="mini"><span class="mini-label">Fibre</span><span class="mini-val"><span class="num">${food.fib}</span> of ${t.fibre} g</span>${minibar(food.fib, t.fibre, 'fuel')}</div>
    </div>
  </section>
  <div class="tiles">
    <div class="tile-card"><span class="tile-num num">${counts.sugary}</span><span class="tile-label">Sugary drinks this week</span><span class="tile-sub">Aim for none</span></div>
    <div class="tile-card"><span class="tile-num num">${counts.purine}</span><span class="tile-label">Red meat, offal or shellfish</span><span class="tile-sub">Aim for 2 or fewer</span></div>
  </div>
  ${pos.before ? beforeStart() : ''}
  ${sectionHead('Training', planMeta)}
  ${sessionRows(d, sessions, day)}
  ${sectionHead('Water', `${litres(water)} of ${litres(wTarget)} L`)}
  <div class="card water-card">
    <div class="water-btns">
      ${[250, 500, 750].map((ml) => `<button class="btn btn-tinted water" data-act="water" data-ml="${ml}">${icon('drop')}+${ml}</button>`).join('')}
      <button class="icon-btn" data-act="water-undo" aria-label="Undo the last drink" ${day?.water?.length ? '' : 'disabled'}>${icon('arrow-u-up-left')}</button>
    </div>
  </div>
  ${foot(`The target is ${fmt(t.waterBase)} ml${wTarget > t.waterBase ? `, plus ${fmt(wTarget - t.waterBase)} ml for ${exDone} minutes of exercise` : ''}. It rises 500 ml for every 30 exercise minutes.`)}
  ${sectionHead('Food', `${fmt(food.kcal)} of ${fmt(t.kcal)} kcal`)}
  ${foodToday(d, day)}
  ${sectionHead('From your Watch')}
  ${watchForm(d, day)}
  ${sectionHead('Weight')}
  ${weightForm(d, day)}`;
}

function banners(d, pos, sessions) {
  const out = [];
  const today = todayISO();
  if (d === today && backupDue()) {
    out.push(callout('cloud-arrow-up', `<p><strong>Back up your log.</strong> It lives only on this phone. ${state.lastBackup ? `Last backup ${esc(short(state.lastBackup))}.` : 'There is no backup yet.'}</p><button class="btn btn-fill btn-sm" data-act="export-open">Back up now</button>`, 'warn'));
  }
  if (!pos.before && pos.repeating) {
    out.push(callout('repeat', `<p><strong>This week repeats week ${pos.week}.</strong> Last week came in under half the plan, so the step up stays small.</p><button class="btn btn-gray btn-sm" data-act="skip-hold">Move on anyway</button>`));
  }
  const ci = L.checkIn(state.profile.startDate, d);
  if (ci) out.push(callout('calendar-check', `<p>${esc(ci.text)}</p>${ci.week !== 27 ? '<button class="btn btn-gray btn-sm" data-act="go-health">Add blood test results</button>' : ''}`));
  const lab = nextLab();
  const toLab = L.diffDays(today, lab);
  const labDone = (state.labs || []).some((x) => x.date >= L.addDays(lab, -14));
  if (d === today && !labDone && toLab <= 14 && toLab >= -30) {
    out.push(callout('test-tube', `<p><strong>${toLab >= 0 ? `Blood test due ${esc(short(lab))}, in ${plural(toLab, 'day', 'days')}.` : `Blood test was due ${esc(short(lab))}.`}</strong> Ask for fasting glucose, HbA1c, lipids and uric acid.</p>`));
  }
  if (isHot(d) && sessions.some((s) => s.kind === 'cardio' || s.outdoor)) out.push(callout('thermometer-hot', `<p>${esc(HOT)}</p>`, 'hot'));
  return out.join('');
}

function backupDue() {
  const used = Object.values(state.days).filter((x) => x.foods?.length || x.water?.length || x.workouts?.length || x.weight).length;
  return used >= 3 && (!state.lastBackup || L.diffDays(state.lastBackup, todayISO()) >= 7);
}

function beforeStart() {
  return `${sectionHead('Before the first Monday')}<div class="group checklist-plain">${[
    ['scales', 'Update your weight in the Health app, so the Watch calorie and cardio fitness numbers are right.'],
    ['flame', 'Set a Move goal you can close on most days, and raise it when it gets easy.'],
    ['shopping-cart', 'Shop from Food, Shopping (next week), then do the Sunday prep.'],
    ['calendar-plus', 'Add the reminders to your calendar from More.'],
    ['scales', 'Weigh yourself on Monday morning before breakfast and log it below.'],
  ].map(([ic, text]) => `<div class="cell"><span class="tile gray">${icon(ic)}</span><div class="cell-main"><div class="cell-text">${esc(text)}</div></div></div>`).join('')}</div>`;
}

function sessionRows(d, sessions, day) {
  if (!sessions.length) return `<div class="group"><div class="cell"><span class="tile gray">${icon('calendar-check')}</span><div class="cell-main"><div class="cell-text">Training starts on the plan start date. Week 1 is in Train.</div></div></div></div>`;
  return `<div class="group">${sessions.map((s) => {
    const done = day?.workouts?.filter((w) => w.id === s.id) ?? [];
    const meta = s.kind === 'rest' ? s.how : `${s.minutes} min, ${EFFORT[s.effort].label.toLowerCase()}${s.reps ? `, ${s.reps} repeats` : ''}${s.deload ? ', easier week' : ''}`;
    const logged = done.length ? `. Logged ${done.map((w) => `${w.min} min`).join(' and ')}` : '';
    const tile = `<span class="tile ${s.kind === 'rest' ? 'gray' : 'effort'}">${icon(sessionIcon(s))}</span>`;
    const body = `<div class="cell-main"><div class="cell-title">${esc(s.name)}</div><div class="cell-sub">${esc(meta + logged)}</div></div>`;
    if (s.kind === 'rest') return `<div class="cell">${tile}${body}</div>`;
    if (s.id === 'walks') {
      return `<div class="cell">${tile}<button class="cell-main as-link" data-act="open-session" data-id="${s.id}" data-date="${d}"><span class="cell-title">${esc(s.name)}</span><span class="cell-sub">${esc(meta + logged)}</span></button>
        <button class="btn btn-tinted effort btn-sm" data-act="walk-log" data-date="${d}" aria-label="Log a 10 minute walk">+10 min</button></div>`;
    }
    return `<button class="cell cell-button" data-act="open-session" data-id="${s.id}" data-date="${d}">${tile}${body}
      <span class="accessory ${done.length ? 'done' : ''}">${done.length ? icon('check-circle') : icon('caret-right')}</span></button>`;
  }).join('')}</div>`;
}

function foodToday(d, day) {
  const logged = day?.foods ?? [];
  const planned = L.menuFor(d, state);
  const yesterday = state.days[L.addDays(d, -1)]?.foods?.length;
  const unlogged = planned.filter(({ slot, meal }) => !logged.some((f) => f.ref === meal.id && f.slot === slot)).length;
  const groups = SLOTS.map((slot) => {
    const plan = planned.filter((x) => x.slot === slot);
    const extra = logged.map((f, i) => ({ f, i })).filter(({ f }) => f.slot === slot && !plan.some((x) => x.meal.id === f.ref));
    const rows = [
      ...plan.map(({ key, meal, swapped }) => {
        const on = logged.some((f) => f.ref === meal.id && f.slot === slot);
        return `<div class="cell"><button class="cell-main as-link" data-act="recipe" data-id="${meal.id}"><span class="cell-title">${esc(meal.name)}</span>
            <span class="cell-sub">${meal.kcal} kcal, ${meal.p} g protein${swapped ? ', swapped in' : ''}</span></button>
          <button class="icon-btn" data-act="swap-open" data-date="${d}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">${icon('arrows-left-right')}</button>
          <button class="btn btn-tinted fuel btn-sm log${on ? ' on' : ''}" data-act="log-menu" data-slot="${slot}" data-id="${meal.id}" aria-pressed="${on}">${on ? `${icon('check')}Eaten` : 'Log'}</button></div>`;
      }),
      ...extra.map(({ f, i }) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(f.name)}</div>
          <div class="cell-sub">${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein${f.t ? `, ${esc(f.t)}` : ''}${f.tags?.includes('sugary') ? ', sugary drink' : ''}${f.tags?.includes('purine') ? ', red meat, offal or shellfish' : ''}</div></div>
          <button class="icon-btn" data-act="food-del" data-i="${i}" aria-label="Remove ${esc(f.name)}">${icon('x')}</button></div>`),
    ];
    return `<p class="group-label">${SLOT_LABEL[slot]}</p><div class="group">${rows.join('')}</div>`;
  }).join('');
  return `${groups}
    <div class="group actions-group">
      <button class="cell cell-action" data-act="add-food-open">${icon('plus-circle')}<span>Add food</span></button>
      <button class="cell cell-action" data-act="log-day" ${unlogged ? '' : 'disabled'}>${icon('check-circle')}<span>Log the rest as planned</span></button>
      <button class="cell cell-action" data-act="same-yesterday" ${yesterday ? '' : 'disabled'}>${icon('repeat')}<span>Same as yesterday</span></button>
    </div>
    ${foot('Tap a meal for its recipe. Anything off-plan goes in with Add food, so the numbers stay honest.')}`;
}

function watchForm(d, day) {
  const w = day?.watch ?? {};
  const b = L.burn(state, d);
  const bal = L.balance(state, d);
  const field = (k, label, unit, ic, kind) => `<label class="cell field"><span class="tile ${kind}">${icon(ic)}</span><span class="field-label">${label}</span>
    <input inputmode="numeric" data-act="watch" data-k="${k}" value="${esc(w[k] ?? '')}" placeholder="0" autocomplete="off"><span class="unit">${unit}</span></label>`;
  let text = 'Copy Move, exercise minutes and steps from the Fitness app, or paste them with the Steady Watch shortcut.';
  if (b) {
    text = `Energy out today is about ${fmt(b.total)} kcal: ${fmt(b.rest)} resting, ${fmt(b.move)} from Move${b.estimated ? ' (your recent average)' : ''}, plus digestion.`;
    if (bal != null) text += ` In minus out so far: ${signed(bal)} kcal.`;
  }
  const src = { import: 'Filled from your Watch export. ', shortcut: 'Pasted from the Steady Watch shortcut. ' }[w.src] || '';
  return `<div class="group">${field('moveKcal', 'Move', 'kcal', 'flame', 'fuel')}${field('exMin', 'Exercise', 'min', 'heartbeat', 'effort')}${field('steps', 'Steps', '', 'footprints', 'water')}</div>
    ${foot(esc(src + text))}
    <div class="group actions-group">
      <button class="cell cell-action" data-act="paste-watch">${icon('watch')}<span>Paste from Watch</span></button>
      <button class="cell cell-action" data-act="copy-health">${icon('heart')}<span>Copy totals for Health</span></button>
      <button class="cell cell-action" data-act="shortcut-help">${icon('info')}<span>Set up the shortcuts</span></button>
    </div>`;
}

function weightForm(d, day) {
  const last = L.weighIns(state).filter(([x]) => x <= d).at(-1);
  return `<div class="group"><label class="cell field"><span class="tile gray">${icon('scales')}</span><span class="field-label">${esc(short(d))}</span>
    <input inputmode="decimal" data-act="weight" value="${esc(day?.weight ?? '')}" placeholder="${(last?.[1] ?? state.profile.startWeight).toFixed(1)}" autocomplete="off"><span class="unit">kg</span></label></div>
    ${foot(`${last ? `Last weigh-in ${esc(short(last[0]))}: ${last[1].toFixed(1)} kg.` : `Start: ${state.profile.startWeight.toFixed(1)} kg.`} Once a week, same morning, before breakfast.`)}`;
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
  const nextMon = L.addDays(L.mondayOf(todayISO()), 7);
  const isCurrent = monday === L.mondayOf(todayISO());
  const nextRepeats = reps().includes(nextMon);
  const cap = `${esc(short(monday))} to ${esc(short(days[6]))}, ${esc(block.name.toLowerCase())}${pos.held ? `, calendar week ${pos.calWeek}` : ''}`;
  const actions = `<button class="icon-btn" data-act="week" data-n="-7" aria-label="Previous week">${icon('caret-left')}</button><button class="icon-btn" data-act="week" data-n="7" aria-label="Next week">${icon('caret-right')}</button>`;
  const zone = (name, range, kind, e) => `<div class="cell"><span class="zone-dot ${kind}"></span><div class="cell-main"><div class="cell-title">${name}</div><div class="cell-sub">RPE ${e.rpe}. ${esc(e.talk)}.</div></div>${range ? `<span class="cell-value num">${range}</span>` : ''}</div>`;
  return `
  ${nav(pos.before ? 'Before the plan' : `Week ${pos.week}`, cap, actions)}
  <p class="lede">${esc(block.intro)}</p>
  ${pos.deload ? callout('arrow-clockwise', `<p>${esc(DELOAD)}</p>`) : ''}
  ${pos.repeating ? callout('repeat', `<p><strong>This week repeats week ${pos.week}.</strong></p>${isCurrent ? '<button class="btn btn-gray btn-sm" data-act="skip-hold">Move on anyway</button>' : ''}`) : ''}
  <div class="card meters">
    ${meter('Exercise minutes', wk.exMin, block.targets.exMin, 'effort')}
    ${meter('Strength sessions', wk.strengthDone, block.targets.strength, 'effort')}
    ${meter('Average steps', wk.stepsAvg ?? 0, block.targets.steps, 'effort')}
  </div>
  ${isCurrent && !pos.before ? `<div class="group actions-group">${nextRepeats
    ? `<button class="cell cell-action" data-act="repeat-week" data-n="0">${icon('caret-right')}<span>Move on next week after all</span></button>`
    : `<button class="cell cell-action" data-act="repeat-week" data-n="1">${icon('repeat')}<span>Repeat this week next week</span></button>`}</div>
    ${foot('The plan also holds a week on its own when a week comes in under half: fewer than half the sessions logged and under half the exercise minutes.')}` : ''}
  ${sectionHead('This week')}
  <div class="group week-list">${days.map((date) => {
    const day = state.days[date];
    const ss = sessionsOn(date);
    const items = ss.length ? ss.map((s) => {
      if (s.kind === 'rest') return `<div class="line"><span class="line-name">${esc(s.name)}</span></div>`;
      const done = day?.workouts?.some((w) => w.id === s.id);
      return `<button class="line as-link" data-act="open-session" data-id="${s.id}" data-date="${date}"><span class="line-name">${esc(s.name)}</span><span class="line-meta">${s.minutes} min</span>${done ? `<span class="accessory done">${icon('check-circle')}</span>` : `<span class="accessory">${icon('caret-right')}</span>`}</button>`;
    }).join('') : '<div class="line"><span class="line-name dim">Before the plan starts</span></div>';
    return `<div class="cell day-cell"><div class="date-badge${date === todayISO() ? ' now' : ''}"><span>${esc(dateText(date, { weekday: 'short' }))}</span><span class="num">${L.parse(date).getDate()}</span></div><div class="cell-main">${items}</div></div>`;
  }).join('')}</div>
  ${sectionHead('How hard')}
  <div class="group">
    ${zone('Easy', `under ${z.easy[1]}`, 'easy', EFFORT.easy)}
    ${zone('Moderate', `${z.moderate[0]} to ${z.moderate[1]}`, 'moderate', EFFORT.moderate)}
    ${zone('Hard', `${z.hard[0]} to ${z.hard[1]}`, 'hard', EFFORT.hard)}
    ${zone('Strength', '', 'strength', EFFORT.strength)}
  </div>
  ${foot(`Heart rates in bpm, from a resting rate of ${z.rest} and an estimated maximum of ${z.max}. When heart rate and feel disagree, go by feel. ${esc(WATCH_ALERT)} For most sessions that is ${z.moderate[0]} to ${z.moderate[1]}.`)}
  ${sectionHead('The plan')}
  <div class="group">${BLOCKS.map((b, i) => `<div class="cell block-cell${!pos.before && pos.blockIndex === i ? ' current' : ''}"><span class="tile ${!pos.before && pos.blockIndex === i ? 'effort' : 'gray'}"><span class="num">${i + 1}</span></span>
    <div class="cell-main"><div class="cell-title">${esc(b.name)}</div><div class="cell-sub">${b.weeks[1] ? `Weeks ${b.weeks[0]} to ${b.weeks[1]}` : `Week ${b.weeks[0]} on`}. ${b.targets.exMin} exercise minutes and ${b.targets.strength} strength ${b.targets.strength > 1 ? 'sessions' : 'session'} a week, ${fmt(b.targets.steps)} steps a day.</div><p class="cell-text">${esc(b.intro)}</p></div></div>`).join('')}</div>
  ${foot(`${esc(DELOAD)} Check-ins fall on the 3-month, 6-month and 1-year marks.`)}
  ${sectionHead('Stop and check')}
  <div class="card prose"><ul>${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`;
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
  <div class="back-row"><button class="back" data-act="close-session">${icon('caret-left')}<span>${ui.tab === 'today' ? 'Today' : 'Train'}</span></button></div>
  ${nav(esc(s.name), `${esc(dateText(date))}, about ${s.minutes} minutes${s.reps && s.id === 'intervals' ? `, ${s.reps} repeats` : ''}`)}
  <div class="chip-row"><span class="chip ${s.effort}">${eff.label}</span>${hr ? `<span class="chip num">${hr}</span>` : ''}<span class="chip">RPE ${eff.rpe}</span></div>
  <p class="lede">${esc(eff.talk)}. ${esc(s.how)}</p>
  ${foot(esc(s.why))}
  ${s.deload ? callout('arrow-clockwise', `<p>${esc(DELOAD)}</p>`) : ''}
  ${hot ? callout('thermometer-hot', `<p>${esc(s.outdoor ? HOT_LONGWALK : HOT)}</p>`, 'hot') : ''}
  ${hr && s.kind !== 'strength' ? callout('watch', `<p>${esc(WATCH_ALERT)}</p>`) : ''}
  ${otherActive ? callout('warning', `<p>Another session is running (${esc(SESSIONS[state.active.id]?.name ?? '')}). Starting this one discards it.</p>`, 'warn') : ''}
  ${active
    ? `<div class="card timer-card"><div class="timer-label">Elapsed</div><div class="timer num" id="elapsed">0:00</div><button class="btn-start" data-act="finish">Finish</button></div>`
    : `<div class="start-row"><button class="btn-start" data-act="start">${icon('play')}Start</button>${s.id === 'walks'
      ? '<button class="btn btn-gray btn-wide" data-act="quick-log" data-n="10">Log a 10 min walk</button>'
      : `<button class="btn btn-gray btn-wide" data-act="quick-log" data-n="${s.minutes}">Log as planned</button>`}</div>`}
  ${s.id === 'intervals' && active ? '<div class="card phase" id="phase"></div>' : ''}
  ${s.id === 'intervals' ? foot(`Timing: 10 minutes easy, then ${s.reps} rounds of 2 minutes hard and 2 easy, then 5 minutes easy. Each change beeps and flashes the screen.`) : ''}
  <div id="rest" class="rest" hidden></div>
  ${s.exercises ? `<div class="exlist">${s.exercises.map(([exId, sets, spec, rest], i) => exerciseCard(exId, sets, spec, rest, i, active)).join('')}</div>${foot(esc(PROGRESSION))}` : ''}
  ${logged.length ? `${sectionHead('Logged')}<div class="group">${logged.map(({ w, i }) => `<div class="cell"><span class="tile effort">${icon('check')}</span><div class="cell-main"><div class="cell-title">${w.min} min, RPE ${w.rpe}${w.hr ? `, ${w.hr} bpm` : ''}</div>
      <div class="cell-sub">${esc(w.t || '')}${w.note ? `. ${esc(w.note)}` : ''}${w.ex?.length ? `. ${esc(w.ex.filter((e) => e.kg || e.reps).map((e) => `${EXERCISES[e.id]?.name}: ${e.kg ? `${e.kg} kg × ` : ''}${e.reps ?? ''}`).join(', '))}` : ''}</div></div>
      <button class="icon-btn" data-act="workout-del" data-i="${i}" aria-label="Remove this log">${icon('x')}</button></div>`).join('')}</div>` : ''}`;
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
  return `<section class="card ex"><div class="ex-head"><span class="ex-num num">${i + 1}</span><div><h3 class="ex-name">${esc(ex.name)}</h3><p class="ex-meta">${sets} sets of ${esc(spec)}, ${rest} s rest</p></div></div>
    <p class="cue">${esc(ex.cue)}</p><p class="ex-alt">${esc(ex.alt)}</p>
    ${last ? `<p class="ex-last">Last time, ${esc(short(last.date))}: ${last.kg ? `${last.kg} kg, ` : ''}${last.reps ?? '?'} ${unitLabel.toLowerCase()}, ${last.sets} of ${last.planned} sets. ${esc(hint)}</p>` : ''}
    <div class="ex-log">
      <label class="pill-field"><span>kg</span><input inputmode="decimal" data-act="ex-kg" data-i="${i}" value="${esc(kg)}" placeholder="body" autocomplete="off"></label>
      <label class="pill-field"><span>${unitLabel}</span><input inputmode="numeric" data-act="ex-reps" data-i="${i}" value="${esc(rp)}" autocomplete="off"></label>
    </div>
    <div class="sets">${Array.from({ length: sets }, (_, k) => `<button class="setbtn num" data-act="set" data-i="${i}" data-k="${k}" aria-pressed="${k < done}" aria-label="Set ${k + 1}">${k < done ? icon('check') : k + 1}</button>`).join('')}
      <button class="btn btn-gray btn-sm" data-act="rest" data-sec="${rest}">${icon('timer')}Rest ${rest} s</button></div></section>`;
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
        ph.className = 'card phase';
        ph.innerHTML = '<div class="phase-name">Done. Tap Finish.</div>';
      } else {
        ph.className = `card phase${phases[i].hard ? ' hard' : ''}`;
        const next = phases[i + 1];
        ph.innerHTML = `<div class="phase-name">${esc(phases[i].name)}</div><div class="timer num">${mmss(phases[i].sec - t)}</div>${next ? `<div class="phase-next">Next: ${esc(next.name)}</div>` : ''}`;
      }
    }
  }
  const r = $('#rest');
  if (r && ui.rest) {
    const left = Math.ceil((ui.rest.until - Date.now()) / 1000);
    r.hidden = false;
    if (left > 0) {
      r.className = 'rest';
      r.innerHTML = `<div><div class="rest-label">Rest</div><div class="rest-time num">${mmss(left)}</div></div><button class="btn btn-gray btn-sm" data-act="rest-skip">Skip</button>`;
    } else {
      if (!ui.rest.beeped) {
        ui.rest.beeped = true;
        beep(2);
        flash('Rest over. Next set.', 'easy');
      }
      r.className = 'rest go';
      r.innerHTML = '<div><div class="rest-label">Rest is over</div><div class="rest-time">Go</div></div><button class="btn btn-gray btn-sm" data-act="rest-skip">OK</button>';
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
const FOOD_SECTIONS = [['menu', 'Menu', 'fork-knife'], ['prep', 'Meal prep', 'cooking-pot'], ['shopping', 'Shopping', 'shopping-cart'], ['recipes', 'Recipes', 'book-open'], ['out', 'Eating out', 'storefront'], ['rules', 'Rules', 'list-checks']];
const foodMonday = () => L.addDays(L.mondayOf(todayISO()), ui.foodWeek === 'next' ? 7 : 0);
const segmented = (act, items, current, label) => `<div class="segmented" role="group" aria-label="${label}">${items.map(([k, text]) => `<button data-act="${act}" data-id="${k}" aria-pressed="${current === k}">${text}</button>`).join('')}</div>`;

function viewFood() {
  const body = { menu: foodMenu, recipes: foodRecipes, prep: foodPrep, shopping: foodShopping, out: foodOut, rules: foodRules }[ui.food]();
  const weekly = ['menu', 'prep', 'shopping'].includes(ui.food);
  const monday = foodMonday();
  const cap = weekly ? `Menu ${L.menuIndex(state.profile.startDate, monday) + 1} of 3, week of ${esc(short(monday))}` : 'Recipes, eating out and the rules';
  return `${nav('Food', cap)}
  <div class="chips" role="group" aria-label="Food sections">${FOOD_SECTIONS.map(([k, label, ic]) => `<button class="chip-btn" data-act="food-sec" data-id="${k}" aria-pressed="${ui.food === k}">${icon(ic)}${label}</button>`).join('')}</div>
  ${weekly ? segmented('food-week', [['this', 'This week'], ['next', 'Next week']], ui.foodWeek, 'Which week') : ''}
  ${body}`;
}

function recipeBody(m) {
  return `<div class="recipe-stats"><span><span class="num">${m.kcal}</span> kcal</span><span><span class="num">${m.p}</span> g protein</span><span><span class="num">${m.fib}</span> g fibre</span></div>
    ${m.ing.length ? `<h3>You need</h3><ul class="prose-list">${m.ing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${m.steps.length ? `<h3>${m.where === 'out' ? 'How to order' : 'How to make it'}</h3><ol class="steps">${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}`;
}

function foodMenu() {
  const monday = foodMonday();
  const t = tgt(todayISO());
  return `${foot(`Each day comes to about 2,100 to 2,300 kcal and over 140 g of protein. Your limit is ${fmt(t.kcal)} kcal, so there is room for the odd extra. ${esc(MENU_NOTE)}`)}
  ${Array.from({ length: 7 }, (_, i) => {
    const date = L.addDays(monday, i);
    const items = L.menuFor(date, state);
    const tot = L.mealTotals(items.map((x) => x.meal));
    return `${sectionHead(esc(dateText(date, { weekday: 'long', day: 'numeric', month: 'short' })), `${fmt(tot.kcal)} kcal, ${tot.p} g protein`)}
      <div class="group">${items.map(({ key, slot, meal, swapped }) => `<div class="cell"><button class="cell-main as-link" data-act="recipe" data-id="${meal.id}"><span class="cell-title">${esc(meal.name)}</span><span class="cell-sub">${SLOT_LABEL[slot]}, ${meal.kcal} kcal${swapped ? ', swapped in' : ''}</span></button>
        <button class="icon-btn" data-act="swap-open" data-date="${date}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">${icon('arrows-left-right')}</button></div>`).join('')}</div>`;
  }).join('')}`;
}

function foodRecipes() {
  return SLOTS.map((slot) => `${sectionHead(SLOT_LABEL[slot])}<div class="group">${MEALS.filter((m) => m.slot === slot).map((m) => `<details class="cell-details"><summary class="cell"><div class="cell-main"><span class="cell-title">${esc(m.name)}</span><span class="cell-sub">${m.kcal} kcal, ${m.p} g protein</span></div><span class="accessory">${icon('caret-right')}</span></summary><div class="details-body">${recipeBody(m)}</div></details>`).join('')}</div>`).join('')
    + `${sectionHead('Extras to log honestly')}${foot(`Typical values, so they go in the log in one tap: ${MEALS.filter((m) => m.slot === 'extra').map((m) => `${esc(m.name)} ${m.kcal}`).join(', ')} kcal.`)}`;
}

function foodPrep() {
  const monday = foodMonday();
  const sessions = L.prepFor(state, monday);
  const list = (items) => items.map((x) => `<li><strong>${esc(dateText(x.date, { weekday: 'long' }))}</strong> ${esc(x.name)}</li>`).join('');
  return `${sessions.map((s) => `${sectionHead(`${esc(s.day)}`, esc(short(s.date)))}
    <div class="card prose">${s.steps.length ? `<ol class="steps">${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="dim">Nothing to batch-cook for these days.</p>'}
    ${s.covers.length ? `<h3>This covers</h3><ul class="prose-list">${list(s.covers)}</ul>` : ''}
    ${s.freeze.length ? `<h3>Freeze straight away</h3><ul class="prose-list">${list(s.freeze)}</ul><p class="dim">Move them to the fridge the night before.</p>` : ''}
    ${s.fresh.length ? `<h3>Cook on the day</h3><ul class="prose-list">${list(s.fresh)}</ul>` : ''}</div>`).join('')}
  ${sectionHead('Keeping it safe')}<div class="card prose"><ul class="prose-list">${FOOD_SAFETY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  ${foot('No oven? Everything here works in an air fryer, a rice cooker and one large pan. Swaps you make change this plan and the shopping list.')}`;
}

function foodShopping() {
  const monday = foodMonday();
  const ticks = state.shopping[monday] || {};
  const groups = L.shoppingFor(state, monday);
  const row = (key, name, amount) => `<label class="cell check-cell"><input type="checkbox" class="round-check" data-act="shop" data-item="${esc(key)}" ${ticks[key] ? 'checked' : ''}><span class="cell-main"><span class="cell-title">${esc(name)}</span></span>${amount ? `<span class="cell-value num">${esc(amount)}</span>` : ''}</label>`;
  const total = groups.reduce((n, g) => n + g.items.length, 0) + PANTRY.length;
  const done = Object.keys(ticks).length;
  return `${foot(`Everything for the week of ${esc(short(monday))}, worked out from that week's menu and your swaps. Shop before the Sunday prep. ${done} of ${total} ticked.`)}
  ${groups.map((g) => `${sectionHead(esc(g.name))}<div class="group">${g.items.map((it) => row(it.key, it.name, it.amount)).join('')}</div>`).join('')}
  ${sectionHead('Check the cupboard')}<div class="group">${PANTRY.map((x, i) => row(`pantry:${i}`, x, '')).join('')}</div>
  <div class="group actions-group"><button class="cell cell-action" data-act="shop-clear" ${done ? '' : 'disabled'}>${icon('arrow-u-up-left')}<span>Untick everything</span></button></div>`;
}

function foodOut() {
  return `${sectionHead('Good choices')}<div class="card prose"><ul class="prose-list">${EATING_OUT.good.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  ${sectionHead('Now and then')}<div class="card prose"><ul class="prose-list">${EATING_OUT.sometimes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
  ${sectionHead('Useful phrases')}
  <div class="group">${EATING_OUT.phrases.map(([th, ro, en]) => `<div class="cell"><div class="cell-main"><span class="cell-title thai" lang="th">${th}</span><span class="cell-sub">${esc(ro)}</span></div><span class="cell-value">${esc(en)}</span></div>`).join('')}</div>`;
}

function foodRules() {
  return `<div class="card prose"><ol class="steps">${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></div>`;
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

const sheetHead = (title) => `<div class="grabber" aria-hidden="true"></div><div class="sheet-head"><h2 id="sheet-title">${title}</h2>${CLOSE_BTN}</div>`;

function sheetAddFood(query = '') {
  return `<div class="sheet">${sheetHead('Add food')}
    ${segmented('add-slot-seg', SLOTS.map((s) => [s, SLOT_LABEL[s]]), ui.addSlot, 'Meal')}
    <div class="chips compact" role="group" aria-label="Portion">${[0.5, 1, 1.5, 2].map((x) => `<button class="chip-btn" data-act="portion" data-n="${x}" aria-pressed="${ui.portion === x}">${x === 1 ? '1 portion' : `${x} portions`}</button>`).join('')}</div>
    <label class="search">${icon('magnifying-glass')}<input type="search" id="food-q" placeholder="Search meals, extras and your foods" value="${esc(query)}" autocomplete="off" aria-label="Search"></label>
    <div class="group sheet-list" id="food-list">${foodListItems(query)}</div>
    ${sectionHead('Something else')}
    <form data-form="quick">
      <div class="group">
        <label class="cell field"><span class="field-label">Name</span><input name="name" required maxlength="80" autocomplete="off" placeholder="Required"></label>
        <label class="cell field"><span class="field-label">Energy</span><input name="kcal" inputmode="numeric" required autocomplete="off" placeholder="0"><span class="unit">kcal</span></label>
        <label class="cell field"><span class="field-label">Protein</span><input name="p" inputmode="numeric" autocomplete="off" placeholder="0"><span class="unit">g</span></label>
        <label class="cell field"><span class="field-label">Values are</span><select name="per"><option value="portion">for the portion</option><option value="100g">per 100 g</option></select></label>
        <label class="cell field"><span class="field-label">Grams eaten</span><input name="grams" inputmode="numeric" placeholder="if per 100 g" autocomplete="off"><span class="unit">g</span></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Sugary drink</span></span><input type="checkbox" class="switch" name="sugary"></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Red meat, offal or shellfish</span></span><input type="checkbox" class="switch" name="purine"></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Save to my foods</span></span><input type="checkbox" class="switch" name="fav" checked></label>
      </div>
      <button class="btn-start" type="submit">Add</button>
    </form>
  </div>`;
}

function foodListItems(query) {
  const q = query.trim().toLowerCase();
  const row = (name, sub, act, attrs, extra = '') => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(name)}</div><div class="cell-sub">${esc(sub)}</div></div>${extra}<button class="btn btn-tinted fuel btn-sm" data-act="${act}" ${attrs}>Add</button></div>`;
  const head = (t) => `<div class="cell list-head">${t}</div>`;
  const recent = q ? [] : recentFoods();
  const own = state.custom.filter((c) => !q || c.name.toLowerCase().includes(q));
  const lib = MEALS.filter((m) => !q || m.name.toLowerCase().includes(q)).slice(0, 80);
  const parts = [];
  if (recent.length) parts.push(head('Recent'), ...recent.map((f, i) => row(f.name, `${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein`, 'add-recent', `data-i="${i}"`)));
  if (own.length) {
    parts.push(head('My foods'), ...own.map((c) => (c.per === '100g'
      ? row(c.name, `${fmt(c.kcal)} kcal and ${fmt(c.p)} g protein per 100 g`, 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`, `<input class="grams" inputmode="numeric" data-grams="${esc(c.id)}" value="100" aria-label="Grams of ${esc(c.name)}">`)
      : row(c.name, `${fmt(c.kcal)} kcal, ${fmt(c.p)} g protein`, 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`))));
  }
  if (lib.length) parts.push(head('Meals and extras'), ...lib.map((m) => row(m.name, `${m.kcal} kcal, ${m.p} g protein`, 'add-food', `data-kind="meal" data-id="${m.id}"`)));
  return parts.join('') || '<div class="cell"><div class="cell-main"><div class="cell-sub">Nothing matches. Add it under Something else.</div></div></div>';
}

function sheetSwap(date, key, slot) {
  const current = L.menuFor(date, state).find((x) => x.key === key);
  const opts = L.swapOptions(slot);
  return `<div class="sheet">${sheetHead(`Swap ${SLOT_LABEL[slot].toLowerCase()}`)}
    ${foot(`${esc(dateText(date))}. Planned: ${esc(L.MEAL_BY_ID[current.planned].name)}.`)}
    ${current.swapped ? `<div class="group actions-group"><button class="cell cell-action" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="">${icon('arrow-u-up-left')}<span>Back to the plan</span></button></div>` : ''}
    <div class="group sheet-list">${opts.map((m) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(m.name)}</div><div class="cell-sub">${m.kcal} kcal, ${m.p} g protein, ${m.fib} g fibre</div></div>
      ${m.id === current.meal.id ? `<span class="accessory done">${icon('check-circle')}</span>` : `<button class="btn btn-gray btn-sm" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="${m.id}">Choose</button>`}</div>`).join('')}</div></div>`;
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
function chartBox(title, big, legendHtml, svg) {
  return `<section class="card chart"><div class="chart-head"><h3>${title}</h3>${big ? `<p class="chart-big">${big}</p>` : ''}</div>${legendHtml}<svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(title)}. Tap a day for its numbers.">${svg}</svg></section>`;
}
function hits(n, bw, tip) {
  return Array.from({ length: n }, (_, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(tip(i))}"/>`).join('');
}
const bigNum = (value, unit, label) => `<span class="num">${value}</span> <span class="big-unit">${unit}</span> <span class="big-label">${label}</span>`;

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
  const eaten = rows.filter((r) => r.intake != null);
  const big = eaten.length ? bigNum(fmt(eaten.reduce((a, r) => a + r.intake, 0) / eaten.length), 'kcal', 'average eaten') : '';
  return chartBox('Energy in and out', big, legend([['sw-fuel', 'Eaten'], ['sw-effort ln', 'Burned (estimate)'], ['dash', 'Your limit']]),
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
  const drank = rows.filter((r) => r.ml > 0);
  const big = drank.length ? bigNum(litres(drank.reduce((a, r) => a + r.ml, 0) / drank.length), 'L', 'average a day') : '';
  return chartBox('Water', big, legend([['sw-water', 'Drank'], ['sw-ink ln', 'Target (rises with exercise)']]), `${s}${bars}${ticks}${xLabels(dates, xAt)}${hits(dates.length, bw, tip)}`);
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
  const last = rows.at(-1);
  return chartBox('Exercise minutes', bigNum(last.ex, 'min', `this week${last.target ? ` of ${last.target}` : ''}`), legend([['sw-effort', 'Done'], ['sw-ink ln', 'Weekly target']]), `${s}${bars}${ticks}${labels}${hits(mondays.length, bw, tip)}`);
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
  const keys = [['sw-ink', 'Weigh-ins'], ['sw-ink ln', 'Trend (14-day average)'], ['dash', 'Goal line'], ...(predOk ? [['sw-pred ln', `Expected from ${pred.weeks} fully logged ${pred.weeks === 1 ? 'week' : 'weeks'}`]] : [])];
  const big = last ? bigNum(last[1].toFixed(1), 'kg', `trend, goal ${goalAt(today).toFixed(1)} today`) : '';
  return chartBox('Weight', big, legend(keys), `${s}${line(goalPts, 'l-target')}${predOk ? line(pred.points, 'l-pred') : ''}${line(trend, 'l-weight')}${dots}`);
}

function maintenanceCard() {
  const p = state.profile;
  const m = L.maintenance(state, todayISO());
  if (!m.ready) {
    return callout('flame', `<p><strong>Your real burn</strong> shows up after 20 days of food logs and 3 weigh-ins over at least 2 weeks, counting from ${esc(short(m.from))}. So far: ${plural(m.daysLogged, 'day', 'days')} logged and ${plural(m.weighIns, 'weigh-in', 'weigh-ins')}.</p>`);
  }
  const using = p.kcalTarget === m.suggested;
  return `<section class="card burn-card"><div class="chart-head"><h3>Your real burn</h3><p class="chart-big">${bigNum(fmt(m.maintenance), 'kcal', 'a day')}</p></div>
    <p>Over the last ${plural(m.daysLogged, 'logged day', 'logged days')} you ate about ${fmt(m.intake)} kcal a day and your weight trend moved ${m.kgPerWeek >= 0 ? '+' : '−'}${Math.abs(m.kgPerWeek).toFixed(2)} kg a week${m.formula ? `. The formula and the Watch said ${fmt(m.formula)}` : ''}. To keep losing about 0.5 kg a week, the limit would be ${fmt(m.suggested)} kcal.</p>
    <div class="btn-row">${using ? `<span class="accessory done">${icon('check-circle')} Using it</span>` : `<button class="btn btn-fill btn-sm" data-act="use-limit" data-n="${m.suggested}">Use ${fmt(m.suggested)} kcal</button>`}
    ${p.kcalTarget ? '<button class="btn btn-gray btn-sm" data-act="use-limit" data-n="0">Back to automatic</button>' : ''}</div></section>`;
}

function viewProgress() {
  return `${nav('Progress', ui.progress === 'health' ? 'Blood tests, blood pressure and waist' : 'Food, water, training and weight')}
  ${segmented('progress-view', [['charts', 'Charts'], ['health', 'Health checks']], ui.progress, 'Progress views')}
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
  const stat = (label, value) => `<div class="cell"><div class="cell-main"><div class="cell-title">${label}</div></div><span class="cell-value">${value}</span></div>`;
  return `${sectionHead('This week')}
  <div class="group">
    ${stat('Sessions done', `${wk.done} of ${wk.planned}`)}
    ${stat('Exercise minutes', `${wk.exMin}${pos.before ? '' : ` of ${pos.block.targets.exMin}`}`)}
    ${stat('Training load', `${fmt(wk.load)} (RPE × min)`)}
    ${stat('Average steps', wk.stepsAvg != null ? fmt(wk.stepsAvg) : 'no data')}
    ${stat('Food logged', `${wk.daysLogged} of 7 days`)}
    ${stat('Average eaten', wk.kcalAvg != null ? `${fmt(wk.kcalAvg)} of ${fmt(tg.kcal)} kcal` : 'no data')}
    ${stat('Average protein', wk.proteinAvg != null ? `${wk.proteinAvg} of ${tg.protein} g` : 'no data')}
    ${stat('Average water', wk.waterAvg != null ? `${litres(wk.waterAvg)} of ${litres(wk.waterTargetAvg)} L` : 'no data')}
    ${stat('Sugary drinks', `${counts.sugary}, aim for none`)}
    ${stat('Red meat, offal or shellfish', `${counts.purine}, aim for 2 or fewer`)}
    ${stat('In minus out, per day', wk.balanceAvg != null ? `${signed(wk.balanceAvg)} kcal` : 'no data')}
    ${kgWeek != null ? stat('At that rate', `about ${Math.abs(kgWeek).toFixed(1)} kg a week ${kgWeek > 0 ? 'down' : 'up'}`) : ''}
  </div>
  ${maintenanceCard()}
  ${any ? '' : callout('chart-line-up', '<p>Log a few days of food, water and Watch numbers and these charts fill in.</p>')}
  ${segmented('range', [['14', '14 days'], ['28', '28 days']], String(ui.range), 'Days shown')}
  ${energyChart(dates)}
  ${waterChart(dates)}
  ${exerciseChart(mondays)}
  ${weightChart()}
  ${sectionHead('Week by week')}
  <div class="card table-card"><div class="scroll-x"><table class="tbl"><thead><tr><th>Week of</th><th>Sessions</th><th>Ex min</th><th>Load</th><th>Steps</th><th>kcal</th><th>Protein</th><th>Water L</th><th>In minus out</th><th>Weight</th></tr></thead><tbody>
  ${mondays.slice().reverse().map((m) => {
    const w = L.weekSummary(state, m);
    const wt = w.weights.at(-1)?.[1];
    return `<tr><td>${esc(short(m))}</td><td>${w.done}/${w.planned}</td><td>${w.exMin}</td><td>${fmt(w.load)}</td><td>${w.stepsAvg != null ? fmt(w.stepsAvg) : ''}</td><td>${w.kcalAvg != null ? fmt(w.kcalAvg) : ''}</td><td>${w.proteinAvg ?? ''}</td><td>${w.waterAvg != null ? litres(w.waterAvg) : ''}</td><td>${w.balanceAvg != null ? signed(w.balanceAvg) : ''}</td><td>${wt ? wt.toFixed(1) : ''}</td></tr>`;
  }).join('')}</tbody></table></div></div>
  ${foot('Burned is resting energy from your weight, height and age, plus the Watch Move calories, plus about 10% of what you eat for digestion. Both sides are estimates, so watch the trend over weeks. Early on the scale often drops faster than this predicts, because of water.')}`;
}

function viewHealth() {
  const today = todayISO();
  const labs = [...(state.labs || [])].reverse();
  const bp = [...(state.bp || [])].reverse();
  const waist = [...(state.waist || [])];
  const sum = L.bpSummary(state.bp, today);
  const lab = nextLab();
  const toLab = L.diffDays(today, lab);
  const dated = (d) => dateText(d, { day: 'numeric', month: 'short', year: 'numeric' });
  // One row per test, as the Health app does: the newest value with its status, the one before it underneath.
  const labRow = (x) => {
    const [now, was] = labs.filter((l) => l[x.key] != null);
    const when = now && now.date !== labs[0].date ? `, ${esc(dated(now.date))}` : '';
    return `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(x.name)}</div><div class="cell-sub">Target ${esc(x.target.split(' (')[0])}.${was ? ` Was ${was[x.key]} on ${esc(dated(was.date))}.` : ''}</div></div>
      <span class="cell-value">${now ? `<span class="lab-v num">${now[x.key]} <small>${esc(x.unit)}</small></span>${esc(L.labStatus(x.key, now[x.key]))}${when}` : 'no result yet'}</span></div>`;
  };
  const levelText = { normal: 'Normal.', elevated: 'Slightly above 120. Keep an eye on it.', raised: 'At or above 130/80 on average. Show this to your GP.', high: 'At or above 140/90 on average. See your GP soon.' };
  const firstW = waist[0], lastW = waist.at(-1);
  return `${sectionHead('Blood tests')}
  <div class="group">
    <div class="cell"><span class="tile info">${icon('test-tube')}</span><div class="cell-main"><div class="cell-title">Next blood test</div><div class="cell-sub">${esc(dateText(lab))}${toLab >= 0 ? `, in ${plural(toLab, 'day', 'days')}` : ''}. Ask for fasting glucose, HbA1c, lipids and uric acid.</div></div></div>
    <label class="cell field"><span class="field-label">Change the date</span><input type="date" data-act="next-lab" value="${lab}"></label>
  </div>
  <div class="group">${LABS.map(labRow).join('')}</div>
  ${labs.length ? '' : foot('No results yet. Add your last checkup, or import the checkup file from the Mac in More.')}
  ${labs.length ? '<p class="group-label">Results by date</p>' : ''}
  <div class="group">${labs.map((l) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(dated(l.date))}</div><div class="cell-sub">${plural(LABS.filter((x) => l[x.key] != null).length, 'result', 'results')}</div></div>
    <button class="icon-btn" data-act="health-del" data-k="labs" data-date="${l.date}" aria-label="Remove the results from ${esc(dated(l.date))}">${icon('x')}</button></div>`).join('')}
    <button class="cell cell-action" data-act="lab-open">${icon('plus-circle')}<span>Add results</span></button></div>
  ${sectionHead('Blood pressure at home', sum ? `${plural(sum.n, 'reading', 'readings')} this week` : '')}
  ${sum ? `<section class="card bp-card"><p class="chart-big">${bigNum(`${sum.sys}/${sum.dia}`, '', '7-day average')}</p><p>${esc(levelText[sum.level])}</p></section>` : foot(esc(BP_NOTE))}
  ${sum?.crisis ? callout('warning', `<p>${esc(BP_CRISIS)}</p>`, 'warn') : ''}
  <form data-form="bp"><div class="group">
    <label class="cell field"><span class="tile fuel">${icon('heart')}</span><span class="field-label">Top</span><input name="sys" inputmode="numeric" required placeholder="120" autocomplete="off"><span class="unit">mmHg</span></label>
    <label class="cell field"><span class="tile fuel">${icon('heart')}</span><span class="field-label">Bottom</span><input name="dia" inputmode="numeric" required placeholder="80" autocomplete="off"><span class="unit">mmHg</span></label>
    <label class="cell field"><span class="tile gray">${icon('heartbeat')}</span><span class="field-label">Pulse</span><input name="pulse" inputmode="numeric" placeholder="70" autocomplete="off"><span class="unit">bpm</span></label>
    <button class="cell cell-action" type="submit">${icon('plus-circle')}<span>Add reading</span></button>
  </div></form>
  ${bp.length ? `<div class="group">${bp.slice(0, 14).map((r) => `<div class="cell"><div class="cell-main"><div class="cell-title num">${r.sys}/${r.dia}${r.pulse ? `<span class="dim">, pulse ${r.pulse}</span>` : ''}</div><div class="cell-sub">${esc(short(r.date))}${r.t ? ` ${esc(r.t)}` : ''}${r.clinic ? ', at the clinic' : ''}</div></div>
    <button class="icon-btn" data-act="health-del" data-k="bp" data-date="${r.date}" data-item="${esc(`${r.t}|${r.sys}|${r.dia}`)}" aria-label="Remove this reading">${icon('x')}</button></div>`).join('')}</div>` : ''}
  ${sectionHead('Waist')}
  ${lastW ? `<section class="card bp-card"><p class="chart-big">${bigNum(lastW.cm, 'cm', `on ${esc(short(lastW.date))}`)}</p>${firstW !== lastW ? `<p>${signed(lastW.cm - firstW.cm)} cm since ${esc(short(firstW.date))}.</p>` : ''}</section>` : ''}
  <form data-form="waist"><div class="group">
    <label class="cell field"><span class="tile gray">${icon('ruler')}</span><span class="field-label">Waist today</span><input name="cm" inputmode="decimal" required autocomplete="off" placeholder="0"><span class="unit">cm</span></label>
    <button class="cell cell-action" type="submit">${icon('plus-circle')}<span>Save</span></button>
  </div></form>
  ${foot(`${esc(WAIST_TARGET)} Measure once a month at the navel, breathing out normally.`)}
  ${waist.length ? `<div class="group">${waist.slice().reverse().map((w) => `<div class="cell"><div class="cell-main"><div class="cell-title num">${w.cm} cm</div><div class="cell-sub">${esc(short(w.date))}</div></div>
    <button class="icon-btn" data-act="health-del" data-k="waist" data-date="${w.date}" aria-label="Remove this measurement">${icon('x')}</button></div>`).join('')}</div>` : ''}`;
}

function sheetLab() {
  return `<div class="sheet">${sheetHead('Blood test results')}
    <form data-form="lab"><div class="group">
      <label class="cell field"><span class="field-label">Date</span><input type="date" name="date" value="${todayISO()}" required></label>
      ${LABS.map((l) => `<label class="cell field"><span class="field-label">${esc(l.name)}</span><input name="${l.key}" inputmode="decimal" autocomplete="off" placeholder="0"><span class="unit">${esc(l.unit)}</span></label>`).join('')}
      <label class="cell field"><span class="field-label">Note</span><input name="note" maxlength="120" autocomplete="off" placeholder="Optional"></label>
    </div><button class="btn-start" type="submit">Save results</button></form></div>`;
}

// ---------- More, setup ----------
function profileForm(p) {
  const d = p || { sex: 'm', startDate: L.nextMonday(todayISO()), waterBase: 2500 };
  const v = (k) => (d[k] == null ? '' : esc(d[k]));
  const auto = p ? `Automatic now: ${fmt(L.autoKcal(p, L.weightOn(state, todayISO())))} kcal and ${L.autoProtein(p, L.weightOn(state, todayISO()))} g protein. Leave blank to follow your weight.` : 'Leave blank to have them worked out from your weight.';
  const row = (label, name, unit, attrs) => `<label class="cell field"><span class="field-label">${label}</span><input name="${name}" ${attrs} value="${v(name)}" autocomplete="off">${unit ? `<span class="unit">${unit}</span>` : ''}</label>`;
  return `<form data-form="profile">
    <div class="group">
      <label class="cell field"><span class="field-label">Sex</span><select name="sex"><option value="m" ${d.sex !== 'f' ? 'selected' : ''}>Male</option><option value="f" ${d.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      ${row('Age', 'age', 'years', 'inputmode="numeric" required placeholder="Required"')}
      ${row('Height', 'heightCm', 'cm', 'inputmode="decimal" required placeholder="Required"')}
      ${row('Weight now', 'startWeight', 'kg', 'inputmode="decimal" required placeholder="Required"')}
      ${row('Resting heart rate', 'rhr', 'bpm', 'inputmode="numeric" placeholder="From Health"')}
      <label class="cell field"><span class="field-label">Plan starts</span><input name="startDate" type="date" required value="${v('startDate')}"></label>
    </div>
    ${foot('The plan always starts on a Monday. Resting heart rate is in the Health app under Heart.')}
    <details class="plain"><summary>${icon('caret-right')}Set your own targets</summary>
      ${foot(esc(auto))}
      <div class="group">
        ${row('Calories a day', 'kcalTarget', 'kcal', 'inputmode="numeric" placeholder="Automatic"')}
        ${row('Protein a day', 'proteinTarget', 'g', 'inputmode="numeric" placeholder="Automatic"')}
        ${row('Water base', 'waterBase', 'ml', 'inputmode="numeric" placeholder="2500"')}
        ${row('Max heart rate', 'maxHr', 'bpm', 'inputmode="numeric" placeholder="Automatic"')}
      </div>
    </details>
    <button class="btn-start" type="submit">${p ? 'Save' : 'Start the plan'}</button>
  </form>`;
}

function viewSetup() {
  const feature = (ic, kind, title, text) => `<div class="feature"><span class="tile ${kind} tile-lg">${icon(ic)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`;
  return `<div class="welcome">
    <img class="app-icon" src="icons/icon-192.png" alt="" width="84" height="84">
    <h1 class="nav-title">Steady</h1>
    <p class="lede">Training, meals and health checks in one place, at a pace you can keep.</p>
    <div class="features">
      ${feature('person-simple-walk', 'effort', 'A plan that starts with walking', 'Twelve weeks that build slowly, and hold back when a week goes badly.')}
      ${feature('cooking-pot', 'fuel', 'Meals worked out for you', 'Three rotating menus, with the prep plan and shopping list for each week.')}
      ${feature('lock-simple', 'water', 'Stays on this phone', 'It works offline, and nothing you enter leaves the phone unless you export it.')}
    </div>
  </div>
  ${sectionHead('About you')}
  ${profileForm(null)}
  <p class="center-foot">Moving phones? <label class="link">Import a backup<input type="file" accept=".json,application/json" data-act="import-backup" hidden></label></p>`;
}

function viewMore() {
  const p = state.profile;
  const st = state.settings;
  const rem = st.reminders || {};
  const action = (act, ic, kind, title, extra = '') => `<button class="cell cell-button" data-act="${act}"><span class="tile ${kind}">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${title}</div></div>${extra}<span class="accessory">${icon('caret-right')}</span></button>`;
  const fileRow = (act, ic, kind, title) => `<label class="cell cell-button"><span class="tile ${kind}">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${title}</div></div><span class="accessory">${icon('caret-right')}</span><input type="file" accept=".json,application/json" data-act="${act}" hidden></label>`;
  return `${nav('More', 'Targets, reminders and your data')}
  ${sectionHead('You and your targets')}
  ${profileForm(p)}
  ${sectionHead('Gym alerts')}
  <div class="group"><label class="cell switch-cell"><span class="tile fuel">${icon('speaker-high')}</span><span class="cell-main"><span class="cell-title">Beep on silent</span><span class="cell-sub">This can pause your music</span></span><input type="checkbox" class="switch" data-act="setting" data-k="loudBeep" ${st.loudBeep ? 'checked' : ''}></label></div>
  ${foot(`The screen also flashes when rest ends and at each interval change, and it stays on during a session. ${esc(WATCH_ALERT)}`)}
  ${sectionHead('Hot months')}
  <div class="card months">${MONTHS.map((m, i) => `<label class="month"><input type="checkbox" data-act="hot-month" data-n="${i + 1}" ${(st.hotMonths || []).includes(i + 1) ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
  ${foot('In these months, Today and the session screens remind you to train indoors or in the cool of the day.')}
  ${sectionHead('Reminders')}
  <div class="group">${REMINDERS.map((r) => `<div class="cell switch-cell"><span class="cell-main"><span class="cell-title">${esc(r.label.split(',')[0])}</span><span class="cell-sub">${esc(r.label.split(', ').slice(1).join(', '))}</span></span>
    <input type="time" class="time" data-act="rem-time" data-id="${r.id}" value="${esc(rem[r.id]?.time || r.time)}" aria-label="Time for ${esc(r.label)}">
    <input type="checkbox" class="switch" data-act="rem-on" data-id="${r.id}" ${rem[r.id]?.on === false ? '' : 'checked'} aria-label="${esc(r.label)}"></div>`).join('')}
    ${action('ics', 'calendar-plus', 'effort', 'Add to Calendar')}
    ${action('ics-save', 'export', 'gray', 'Save the calendar file')}
  </div>
  ${foot('Web apps on iPhone cannot send their own reminders, so these go into Calendar as repeating events with an alert. Tap Add All when they appear. If nothing opens, save the file and open it from Files. To change them later, delete the Steady events in Calendar and add them again.')}
  ${sectionHead('Your data')}
  <div class="group">
    ${action('export-open', 'cloud-arrow-up', 'water', 'Export backup', `<span class="cell-value">${state.lastBackup ? esc(short(state.lastBackup)) : 'Never'}</span>`)}
    ${fileRow('import-backup', 'arrow-clockwise', 'gray', 'Import backup')}
    ${fileRow('import-data', 'watch', 'effort', 'Import Watch or checkup file')}
    ${action('shortcut-help', 'clipboard-text', 'fuel', 'iPhone shortcuts')}
  </div>
  ${foot(`Everything stays in this app's storage on this phone${ui.persisted ? ', and the phone has agreed to keep it' : ''}. The Watch and checkup files come from the Mac: run export_for_app.py there, AirDrop the file, then import it here. Days you typed in yourself keep your numbers.`)}
  ${sectionHead('How the numbers work')}
  <div class="card prose"><ul class="prose-list">
    <li>Calorie limit: resting energy (Mifflin-St Jeor) times 1.375, minus 550. It drops as your weight drops. After 4 weeks, Progress can replace it with your real burn.</li>
    <li>Protein: 1.3 g per kg of adjusted body weight. Fibre: 30 g.</li>
    <li>Water: the base plus 500 ml for every 30 exercise minutes, from the Watch or your logged sessions, whichever is higher.</li>
    <li>Heart rate ranges: 30, 40, 60 and 80% of heart-rate reserve.</li>
    <li>The plan holds a week when a week comes in under half, and every fourth week from week 16 is easier.</li>
    <li>Meal values are estimates for the portions in each recipe.</li>
  </ul></div>
  ${sectionHead('Stop and check')}
  <div class="card prose"><ul class="prose-list">${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <div class="group danger-group"><button class="cell cell-action danger" data-act="reset">${icon('trash')}<span>Delete all data</span></button></div>
  ${foot('Icons by Phosphor Icons, MIT licence.')}`;
}

function sheetShortcuts() {
  return `<div class="sheet">${sheetHead('iPhone shortcuts')}
    ${sectionHead('Steady Watch', 'Health into Steady')}<div class="card prose"><ol class="steps">${SHORTCUT_IN.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    ${sectionHead('Steady to Health', 'Steady into Health')}<div class="card prose"><ol class="steps">${SHORTCUT_OUT.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    ${foot('Shortcuts menus differ a little between iOS versions. If a name does not match exactly, pick the closest one.')}</div>`;
}
function sheetPaste() {
  return `<div class="sheet">${sheetHead('Paste Watch numbers')}
    ${foot('The phone did not let Steady read the clipboard. Long-press the box, tap Paste, then Use these numbers.')}
    <form data-form="paste"><div class="card"><textarea name="text" rows="5" aria-label="Pasted numbers"></textarea></div>
    <button class="btn-start" type="submit">Use these numbers</button></form></div>`;
}
function sheetCopy(text) {
  return `<div class="sheet">${sheetHead('Totals for Health')}
    ${foot('The phone did not let Steady copy. Select the text, copy it, then run the Steady to Health shortcut.')}
    <div class="card"><textarea rows="4" readonly aria-label="Totals">${esc(text)}</textarea></div></div>`;
}
function sheetExport() {
  return `<div class="sheet">${sheetHead('Export a backup')}
    <form data-form="export">
      ${foot('The file holds your weight, food, training and health checks. Add a passcode if it will sit in Files, iCloud or a chat. Without the passcode nobody can open it, including you.')}
      <div class="group">
        <label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Passcode</span><input type="password" name="pass" autocomplete="new-password" placeholder="Optional"></label>
        <label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Again</span><input type="password" name="pass2" autocomplete="new-password" placeholder="Optional"></label>
      </div>
      <button class="btn-start" type="submit">Export</button>
    </form></div>`;
}
function sheetUnlock() {
  return `<div class="sheet">${sheetHead('Open a protected backup')}
    <form data-form="unlock"><div class="group"><label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Passcode</span><input type="password" name="pass" required autocomplete="current-password"></label></div>
    <button class="btn-start" type="submit">Open</button></form></div>`;
}

// ---------- Sheet, tooltip, toast ----------
let sheetReturn = null;
function showSheet(html) {
  const s = $('#sheet');
  s.classList.remove('closing');
  s.style.transform = '';
  s.innerHTML = html;
  if (!s.open) {
    sheetReturn = keyOf(document.activeElement);
    s.showModal();
  }
}
// The sheet slides back down the way it came, then empties and hands focus back to what opened it.
function closeSheet() {
  const s = $('#sheet');
  if (!s.open || s.classList.contains('closing')) return;
  s.classList.add('closing');
  const done = (e) => {
    // The backdrop's fade ends first and reports on the dialog too; wait for the sheet's own slide.
    if (e && (e.target !== s || e.pseudoElement || !['transform', 'opacity'].includes(e.propertyName))) return;
    s.removeEventListener('transitionend', done);
    clearTimeout(timer);
    if (!s.classList.contains('closing')) return; // reopened or caught by a drag on the way down
    s.classList.remove('closing');
    s.close();
    s.innerHTML = '';
    if (sheetReturn) document.querySelector(sheetReturn)?.focus({ preventScroll: true });
  };
  const timer = setTimeout(done, 500);
  s.addEventListener('transitionend', done);
}
// Drag by the grabber or title row: the sheet follows the finger 1:1 from wherever it is on screen, resists
// being pulled up, and on release goes where the flick's momentum projects it (Apple's deceleration formula).
const rubberband = (x, size, c = 0.55) => (x * size * c) / (size + c * x);
const project = (v, rate = 0.998) => (v * rate) / (1 - rate); // v in px per ms
const outside = (e, r) => e.clientY < r.top || e.clientX < r.left || e.clientX > r.right;
let backdropDown = false; // a tap on the dimmed page closes the sheet only if it also started there
function dragSheet(e) {
  const s = $('#sheet');
  backdropDown = e.target === s && outside(e, s.getBoundingClientRect());
  if (!e.isPrimary || e.button > 0 || !e.target.closest('.grabber, .sheet-head') || e.target.closest('button, input, a')) return;
  const from = new DOMMatrixReadOnly(getComputedStyle(s).transform).m42;
  const start = e.clientY;
  const h = s.offsetHeight;
  const at = (y) => { const d = from + y - start; return d < 0 ? -rubberband(-d, h) : d; };
  let trail = [[e.timeStamp, e.clientY]];
  s.setPointerCapture(e.pointerId);
  s.style.transition = 'none';
  s.style.transform = `translateY(${from}px)`;
  s.classList.remove('closing');
  const move = (m) => {
    s.style.transform = `translateY(${at(m.clientY)}px)`;
    trail = [...trail.slice(-4), [m.timeStamp, m.clientY]];
  };
  const up = (u) => {
    s.removeEventListener('pointermove', move);
    s.removeEventListener('pointerup', up);
    s.removeEventListener('pointercancel', up);
    // Velocity over the last 100 ms up to the release, so a finger that stopped before lifting throws nothing.
    const recent = [...trail, [u.timeStamp, u.clientY]].filter(([t]) => u.timeStamp - t <= 100);
    const [t0, y0] = recent[0];
    const [t1, y1] = recent.at(-1);
    s.style.transition = '';
    if (u.type === 'pointerup' && at(u.clientY) + project((y1 - y0) / Math.max(1, t1 - t0)) > h / 2) closeSheet();
    else s.style.transform = '';
  };
  s.addEventListener('pointermove', move);
  s.addEventListener('pointerup', up);
  s.addEventListener('pointercancel', up);
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
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="btn btn-sm toast-undo" data-act="undo">Undo</button>' : ''}`;
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
  return `<div class="sheet">${sheetHead(`Finish ${esc(s.name.toLowerCase())}`)}
    <form data-form="finish">
      <div class="group"><label class="cell field"><span class="tile effort">${icon('timer')}</span><span class="field-label">Minutes</span><input name="min" inputmode="numeric" value="${mins}" required autocomplete="off"><span class="unit">min</span></label></div>
      ${sectionHead('How hard was it?', `target RPE ${esc(EFFORT[s.effort].rpe)}`)}
      <div class="rpe" role="group" aria-label="RPE">${Array.from({ length: 10 }, (_, i) => `<button type="button" class="num" data-act="rpe" data-n="${i + 1}" aria-pressed="${i + 1 === rpe}">${i + 1}</button>`).join('')}</div>
      <input type="hidden" name="rpe" value="${rpe}">
      <div class="group">
        <label class="cell field"><span class="tile fuel">${icon('heartbeat')}</span><span class="field-label">Average heart rate</span><input name="hr" inputmode="numeric" placeholder="Optional" autocomplete="off"><span class="unit">bpm</span></label>
        <label class="cell field"><span class="tile gray">${icon('list-checks')}</span><span class="field-label">Note</span><input name="note" maxlength="200" autocomplete="off" placeholder="Optional"></label>
      </div>
      <button class="btn-start" type="submit">Save session</button>
      <button class="btn btn-plain danger btn-wide" type="button" data-act="discard">Discard session</button>
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
function pressSegment(el) {
  el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
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
  'day-pick': (el) => {
    ui.date = el.dataset.date;
    render();
  },
  strip: (el) => {
    ui.date = L.addDays(ui.date, Number(el.dataset.n));
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
    showSheet(`<div class="sheet">${sheetHead(esc(m.name))}<div class="card prose recipe">${recipeBody(m)}</div></div>`);
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
  'add-slot-seg': (el) => {
    ui.addSlot = el.dataset.id;
    pressSegment(el);
  },
  portion: (el) => {
    ui.portion = Number(el.dataset.n);
    pressSegment(el);
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
    pressSegment(el);
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
  range: (el) => { ui.range = Number(el.dataset.id); render(); },
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
$('.tabs').innerHTML = TABS.map(([id, label, ic]) => `<button type="button" data-act="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`).join('');

document.addEventListener('click', (e) => {
  const tipEl = e.target.closest?.('[data-tip]');
  if (tipEl) showTip(tipEl, e);
  else hideTip();
  const sheet = $('#sheet');
  if (e.target === sheet) {
    // A drag of the sheet also ends with a click here, wherever it was let go; only a tap that began on the dimmed page closes.
    if (backdropDown && outside(e, sheet.getBoundingClientRect())) closeSheet();
    return;
  }
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
$('#sheet').addEventListener('pointerdown', dragSheet);
// Escape slides it down as well. Without a recent tap the browser closes the dialog itself, and the event says so.
$('#sheet').addEventListener('cancel', (e) => { if (e.cancelable) { e.preventDefault(); closeSheet(); } });
// iOS Safari only applies :active press styles on pages that listen for touches.
document.addEventListener('touchstart', () => {}, { passive: true });
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
