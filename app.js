import * as L from './logic.js';
import { icon } from './icons.js';
import { summaryPdf } from './pdf.js';
import {
  EFFORT, EXERCISES, BODY_PARTS, SWAPS, SESSIONS, BLOCKS, PROGRESSION, DELOAD, HOT, HOT_LONGWALK, WATCH_ALERT, MEALS, MENU_NOTE, PANTRY, FOOD_SAFETY,
  EATING_OUT, RULES, SAFETY, SLOTS, LABS, WAIST_TARGET, BP_NOTE, BP_CRISIS, REMINDERS, SHORTCUT_IN, SHORTCUT_OUT,
  APP_VERSION, CHANGES,
} from './plan.js';

const KEY = 'steady.v1';
const esc = L.esc;
const $ = (s) => document.querySelector(s);
const fmt = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-GB'));
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');
const signedDec = (n, dp = 1) => { const s = Math.abs(n).toFixed(dp); return +s ? `${n > 0 ? '+' : '−'}${s}` : s; };
const litres = (ml) => (ml / 1000).toFixed(1);
const todayISO = () => L.iso(new Date());
const clock = () => new Date().toTimeString().slice(0, 5);
const dateText = (d, o = { weekday: 'long', day: 'numeric', month: 'long' }) => L.parse(d).toLocaleDateString('en-GB', o);
const short = (d) => dateText(d, { day: 'numeric', month: 'short' });
const int = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const dec = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', extra: 'Extras' };
// The words for the two weekly counters, the same on Today and in the food lists.
const flagText = (tags) => `${tags?.includes('sugary') ? ', sugary drink' : ''}${tags?.includes('purine') ? ', red meat, offal or shellfish' : ''}`;
// Pass fib false for foods entered under Something else: the form never asks for fibre, so their 0 g is not a real value.
const foodSub = (f, per = '', fib = true) => `${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein${fib ? `, ${fmt(f.fib || 0)} g fibre` : ''}${per}${flagText(f.tags)}`;
const DEFAULT_RPE = { easy: 4, moderate: 5, hard: 7, strength: 7 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TABS = [['today', 'Today', 'calendar-check'], ['train', 'Train', 'barbell'], ['food', 'Food', 'fork-knife'], ['progress', 'Progress', 'trend-up']];
const SESSION_ICON = { walks: 'person-simple-walk', longwalk: 'footprints', cardio: 'heartbeat', intervals: 'timer', rest: 'bed' };
const sessionIcon = (s) => SESSION_ICON[s.id] || (s.kind === 'strength' ? 'barbell' : 'heartbeat');
const CLOSE_BTN = `<button class="icon-btn" data-act="sheet-close" aria-label="Close">${icon('x')}</button>`;

let state = load();
const ui = {
  screen: 'today', tab: 'today', settingsPage: null, date: todayISO(), week: null, food: 'menu', foodWeek: 'this', trainView: 'schedule', exQuery: '', exPart: 'All', progress: 'overview', weightRange: '3M', weightTable: false, heatMetric: 'time', heatRange: '12w', range: 14, reportDays: '91',
  session: null, addSlot: 'lunch', portion: 1, rest: null, hold: null, phase: -1, persisted: false, onToday: true, updating: false, pendingFile: null,
};
let ticker = null;
let wakeLock = null;
let audio = null;
let swReg = null;
let undoSnap = null;
let undoLive = false; // the Undo toast is showing, so a later save would make its snapshot stale
let undoTimers = null;
let titleObserver = null;
let tapAt = null; // the latest real tap, by time and place
let guardTap = null; // the latest tap that put something new under the finger, so a second tap there must do nothing
let resending = false;
let back = null; // where the screen a session opened from was scrolled to, and the button that opened it

// ---------- Storage ----------
function blank() {
  return {
    v: 1, profile: null, days: {}, custom: [], shopping: {}, swaps: {}, excluded: [], moves: [], extras: [], customEx: [], repeats: [], skipHolds: [], autoHolds: [], holdChecked: null,
    labs: [], bp: [], waist: [], settings: { hotMonths: [3, 4, 5], loudBeep: false, reminders: {} }, lastBackup: null, active: null,
    seenVersion: 0,
  };
}
function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    const s = JSON.parse(raw);
    if (s && s.v === 1) {
      const b = blank();
      if (s.shopping && Object.keys(s.shopping).some((k) => !/^\d{4}-\d{2}-\d{2}$/.test(k))) s.shopping = {}; // first release kept one flat list
      return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    }
  } catch { /* fall through to a blank state */ }
  // Set aside what this version cannot read, so the first save of the blank state cannot destroy the only copy.
  try { if (raw) localStorage.setItem(`${KEY}.unreadable`, raw); } catch { /* storage full */ }
  return blank();
}
function save() {
  if (undoLive) { // anything saved while Undo shows would be lost by restoring the old state
    undoLive = false;
    undoSnap = null;
    clearTimeout(toastTimer);
    $('#toast').classList.remove('show', 'has-btn');
  }
  L.applyHolds(state, todayISO()); // a paste or a late log can bring last week up to half, which lifts this week's automatic hold
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Could not save. Phone storage may be full.');
  }
}
const rw = (date) => (state.days[date] ||= L.emptyDay());
const tgt = (date) => L.targets(state.profile, L.weightOn(state, date));
const reps = () => state.repeats || [];
// What the plan has for a date, with the moves and sessions added to it. With Rotation, today shows the next session of the week instead.
const plannedOn = (date) => L.sessionsFor(state.profile.startDate, date, reps(), state.moves || [], state.extras || []);
const exInfo = (id) => L.exerciseOf(state, id);
const exName = (id) => exInfo(id)?.name ?? '';
const sessionsOn = (date) => (date === todayISO() && state.settings?.train === 'rotation' ? L.rotationSessions(state, date) : plannedOn(date));
const posOn = (date) => L.planPosition(state.profile.startDate, date, reps());
const nextLab = () => state.profile.nextLab || L.addDays(state.profile.startDate, 84);
const isHot = (date) => (state.settings.hotMonths || []).includes(L.parse(date).getMonth() + 1);
const hasLog = (d) => { const x = state.days[d]; return !!(x && (x.foods?.length || x.water?.length || x.workouts?.length)); };
function snapshot() {
  undoSnap = JSON.stringify(state);
  undoLive = false;
  undoTimers = { rest: ui.rest, hold: ui.hold }; // Undo also puts back a rest or hold that the action started or stopped
}

// ---------- Theme ----------
// Light and dark live in prefers-color-scheme rules. Forcing a theme rewrites those rules' conditions, so the CSS is written once.
const DARK_Q = '(prefers-color-scheme: dark)';
let mediaRules = null;
let themeNow = null;
function applyTheme() {
  const want = state?.settings?.theme || 'auto';
  if (want === themeNow) return;
  themeNow = want;
  if (!mediaRules) {
    mediaRules = [];
    for (const sheet of document.styleSheets) {
      try { for (const r of sheet.cssRules) if (r.media && r.media.mediaText.includes('prefers-color-scheme: dark')) mediaRules.push([r, r.media.mediaText]); } catch { /* a sheet from another origin */ }
    }
  }
  const t = state?.settings?.theme || 'auto';
  for (const [r, orig] of mediaRules) r.media.mediaText = t === 'auto' ? orig : orig.replace(DARK_Q, t === 'dark' ? '(min-width: 0px)' : '(max-width: 0px)');
  document.documentElement.style.colorScheme = t === 'auto' ? '' : t;
  const metas = document.querySelectorAll('meta[name=theme-color]');
  metas[0]?.setAttribute('media', t === 'auto' ? '(prefers-color-scheme: light)' : t === 'light' ? 'all' : 'not all');
  metas[1]?.setAttribute('media', t === 'auto' ? '(prefers-color-scheme: dark)' : t === 'dark' ? 'all' : 'not all');
}

// ---------- Rendering ----------
const VIEWS = { today: viewToday, train: viewTrain, food: viewFood, progress: viewProgress, settings: viewSettings, session: viewSession, setup: viewSetup };

// The control a tap just switched on gets a short pulse and its new icon fades in, as a re-render replaces it.
let pressed = null;
function render(top = false) {
  stopTicker();
  applyTheme();
  if (ui.screen === 'settings' && !SETTINGS_PAGES.includes(ui.settingsPage) && ui.settingsPage) ui.settingsPage = null;
  if (top) guardTap = tapAt; // a new screen comes up under the finger, and the second tap of a double tap would land on it
  if (!state.profile) ui.screen = 'setup';
  if (swipe && ui.screen !== 'session') { clearTimeout(swipe.timer); swipe.under?.remove(); swipe = null; } // a tab tapped mid-swipe
  const focusKey = top ? null : keyOf(document.activeElement);
  const chipX = $('#main .chips')?.scrollLeft ?? 0;
  $('#main').innerHTML = VIEWS[ui.screen]();
  const pk = pressed;
  pressed = null;
  const now = pk?.key && pk.was !== 'true' && document.querySelector(pk.key);
  if (now?.getAttribute('aria-pressed') === 'true') now.classList.add('pop');
  rollRings();
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  const at = TABS.findIndex((t) => t[0] === ui.tab);
  const bar = $('.tabs'), col = String(at < 2 ? at : at + 1); // the big Start button holds the middle column
  if (bar.style.getPropertyValue('--col') !== col) {
    bar.style.setProperty('--col', col);
    bar.classList.remove('moving');
    void bar.offsetWidth;
    bar.classList.add('moving');
  }
  const go = $('.tabs .tab-go .go-label');
  if (go) go.textContent = state.active ? 'Resume' : 'Start';
  if (top) { // content rises in, a little after the one before it
    const m = $('#main');
    m.classList.remove('enter');
    void m.offsetWidth;
    m.classList.add('enter');
  }
  const bare = ui.screen === 'setup' || ui.screen === 'session'; // a session has its own Start, and a running one gets the whole screen
  $('.tabs').hidden = bare;
  document.body.classList.toggle('no-tabs', bare);
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
  if (ui.foodScroll) { ui.foodScroll = false; $('#food-today')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8); }
  if (swipe?.under && ui.screen === 'session') reswipe();
}
// As on iOS only a session's push and pop slide; tabs, and browsers without view transitions, switch at once.
let sliding = null;
function slide(dir, update) {
  if (!dir || !document.startViewTransition) return update();
  const root = document.documentElement;
  delete root.dataset.slide; // a slide still running ends as this one starts
  // Set only once the old screen is captured, so its title bar is captured as it looked.
  const t = (sliding = document.startViewTransition(() => { root.dataset.slide = dir; update(); }));
  t.ready.catch(() => {}); // a hidden document aborts the transition; the screen still changes
  t.finished.catch(() => {}).finally(() => {
    if (sliding !== t) return; // a newer slide owns the attribute now
    sliding = null;
    delete root.dataset.slide;
  });
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
  if (['today', 'train', 'food', 'progress'].includes(ui.screen)) actions += `<button class="icon-btn" data-act="settings-open" aria-label="Settings">${icon('gear-six')}</button>`;
  return `<header class="nav"><div class="nav-row"><div class="nav-text">${cap ? `<p class="nav-cap">${cap}</p>` : ''}<h1 class="nav-title">${title}</h1></div>${actions ? `<div class="nav-actions">${actions}</div>` : ''}</div></header>`;
}
const sectionHead = (title, meta = '') => `<div class="section-head"><h2>${title}</h2>${meta ? `<span class="section-meta">${meta}</span>` : ''}</div>`;
const callout = (iconName, html, cls = '') => `<div class="callout ${cls}"><span class="tile ${cls || 'info'}">${icon(iconName)}</span><div class="callout-body">${html}</div></div>`;
const foot = (html) => `<p class="section-foot">${html}</p>`;

function ring(kind, name, value, target, valText, unit, ofText, limit = false) {
  const r = 40, c = 2 * Math.PI * r;
  const f = target > 0 ? value / target : value > 0 ? 1 : 0;
  const arc = (frac, cls) => (frac > 0.001 ? `<circle class="${cls}" cx="50" cy="50" r="${r}" stroke-dasharray="${(c * frac).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 50 50)"/>` : '');
  return `<figure class="ring ${kind}">
    <div class="ring-art"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="${r}"/>${arc(Math.min(f, 1), 'ring-arc')}${arc(Math.min(Math.max(f - 1, 0), 1), 'ring-over')}${limit ? '<line class="ring-notch" x1="50" y1="3" x2="50" y2="17"/>' : ''}</svg>
      <span class="ring-val"><span class="num">${valText}</span><span class="unit">${unit}</span></span></div>
    <figcaption><span class="ring-name">${name}</span><span class="ring-of">${ofText}</span></figcaption>
  </figure>`;
}
// Kept per day, and over screens without rings, so a workout saved in a session still rolls in on Today.
let rings = null;
function rollRings(root = $('#main')) {
  const nums = [...root.querySelectorAll('.ring-val .num')];
  if (!nums.length) return;
  const was = rings?.date === ui.date ? rings.vals : [];
  rings = { date: ui.date, vals: nums.map((n) => n.textContent) };
  nums.forEach((n, i) => {
    const now = rings.vals[i];
    if (was[i] == null || was[i] === now) return;
    const roll = L.rollMask(was[i], now);
    n.innerHTML = `<span class="sr-only">${esc(now)}</span><span class="rolling" aria-hidden="true">${[...now].map((c, j) => (roll[j] ? `<span class="roll">${c}</span>` : esc(c))).join('')}</span>`;
  });
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
  ${runningBanner()}
  <p class="lede today-lede">${todayLede(d, sessions, day, food, t)}</p>
  <section class="card summary" aria-label="Food, water and exercise so far">
    <div class="rings">
      ${ring('fuel', 'Food', food.kcal, t.kcal, fmt(Math.abs(t.kcal - food.kcal)), food.kcal > t.kcal ? 'over' : 'left', `${fmt(food.kcal)} eaten`, true)}
      ${ring('water', 'Water', water, wTarget, litres(water), 'L', `of ${litres(wTarget)}`)}
      ${ring('effort', 'Exercise', exDone, exPlan, String(exDone), 'min', exPlan ? `of ${exPlan}` : 'rest day')}
    </div>
    <div class="mini-bars">
      <div class="mini"><span class="mini-label">Protein</span><span class="mini-val"><span class="num">${food.p}</span> of ${t.protein} g</span>${minibar(food.p, t.protein, 'fuel')}</div>
      <div class="mini"><span class="mini-label">Fibre</span><span class="mini-val"><span class="num">${food.fib}</span> of ${t.fibre} g</span>${minibar(food.fib, t.fibre, 'fuel')}</div>
    </div>
  </section>
  ${banners(d, pos, sessions)}
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
  ${weightForm(d, day)}
  ${sectionHead('This week')}
  <div class="group">
    <div class="cell"><div class="cell-main"><div class="cell-title">Sugary drinks</div><div class="cell-sub">Aim for none</div></div><span class="cell-value num">${counts.sugary}</span></div>
    <div class="cell"><div class="cell-main"><div class="cell-title">Red meat, offal or shellfish</div><div class="cell-sub">Aim for 2 or fewer</div></div><span class="cell-value num">${counts.purine}</span></div>
  </div>`;
}

// A workout that is still going stays at the top of Today, above the rings.
function runningBanner() {
  const out = [];
  const today = todayISO();
  const a = state.active;
  if (a && SESSIONS[a.id]) {
    const min = Math.max(1, Math.round(L.activeMs(a, Date.now()) / 60000));
    const sofar = L.leftRunning(a, Date.now()) ? `Started ${esc(startedAt(a))}.` : `${fmt(min)} min so far.`;
    out.push(callout('timer', `<p><strong>${a.pausedAt ? 'Paused' : 'Still running'}: ${esc(SESSIONS[a.id].name)}${a.date === today ? '' : ` for ${esc(short(a.date))}`}.</strong> ${sofar}</p>
      <div class="btn-row"><button class="btn btn-fill btn-sm" data-act="resume" data-id="${esc(a.id)}" data-date="${esc(a.date)}">Resume</button><button class="btn btn-gray btn-sm" data-act="finish">Finish</button></div>`, 'effort'));
  }
  return out.join('');
}

// One line under the title that answers "what is left today": the sessions still to do and the calories left.
function todayLede(d, sessions, day, food, t) {
  const words = ['No', 'One', 'Two', 'Three', 'Four'];
  const main = sessions.filter((x) => x.kind !== 'rest' && x.id !== 'walks');
  const left = main.filter((x) => !day?.workouts?.some((w) => w.id === x.id)).length;
  const train = !main.length ? (sessions.some((x) => x.id === 'walks') ? 'A walking day.' : 'A rest day.') : left ? `${words[Math.min(left, 4)]} ${left === 1 ? 'session' : 'sessions'} to do.` : 'Training done.';
  const kcal = food.kcal > t.kcal ? `${fmt(food.kcal - t.kcal)} kcal over.` : food.kcal ? `${fmt(t.kcal - food.kcal)} kcal left.` : `${fmt(t.kcal)} kcal to eat.`;
  return `${train} ${kcal}`;
}

function banners(d, pos, sessions) {
  const out = [];
  const today = todayISO();
  if (d === today && L.weighInDue(state, today)) {
    out.push(callout('scales', '<p><strong>Weigh in before breakfast.</strong> Once a week is enough for the trend.</p><button class="btn btn-fill btn-sm" data-act="weigh-open">Weigh in</button>'));
  }
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
    ['calendar-plus', 'Add the reminders to your calendar from Settings.'],
    ['scales', 'Weigh yourself on Monday morning before breakfast and log it below.'],
  ].map(([ic, text]) => `<div class="cell"><span class="tile gray">${icon(ic)}</span><div class="cell-main"><div class="cell-text">${esc(text)}</div></div></div>`).join('')}</div>`;
}

function sessionRows(d, sessions, day) {
  if (!sessions.length) return `<div class="group"><div class="cell"><span class="tile gray">${icon('calendar-check')}</span><div class="cell-main"><div class="cell-text">Training starts on the plan start date. Week 1 is in Train.</div></div></div></div>`;
  return `<div class="group">${sessions.map((s) => {
    const done = day?.workouts?.filter((w) => w.id === s.id) ?? [];
    const meta = s.kind === 'rest' ? s.how : `${s.minutes} min, ${EFFORT[s.effort].label.toLowerCase()}${s.reps ? `, ${s.reps} repeats` : ''}${s.deload ? ', easier week' : ''}${s.movedFrom ? `, moved from ${dateText(s.movedFrom, { weekday: 'long' })}` : ''}`;
    const logged = done.length ? `. Logged ${done.map((w) => `${w.min} min`).join(' and ')}` : '';
    const tile = `<span class="tile ${s.kind === 'rest' ? 'gray' : 'effort'}">${icon(sessionIcon(s))}</span>`;
    const body = `<div class="cell-main"><div class="cell-title">${esc(s.name)}</div><div class="cell-sub">${esc(meta + logged)}</div></div>`;
    if (s.kind === 'rest') return `<div class="cell">${tile}${body}</div>`;
    const link = `<button class="cell-main as-link" data-act="open-session" data-id="${s.id}" data-date="${d}"><span class="cell-title">${esc(s.name)}</span><span class="cell-sub">${esc(meta + logged)}</span></button>`;
    if (s.id === 'walks') {
      return `<div class="cell">${tile}${link}
        <button class="btn btn-tinted effort btn-sm" data-act="walk-log" data-date="${d}" aria-label="Log a 10 minute walk">+10 min</button></div>`;
    }
    if ((s.kind === 'cardio' || s.id === 'longwalk') && !done.length && !isActive(d, s.id)) {
      return `<div class="cell">${tile}${link}
        <button class="btn btn-tinted effort btn-sm" data-act="quick-log" data-id="${s.id}" data-date="${d}" data-n="${s.minutes}" aria-label="Log ${esc(s.name)} as planned, ${s.minutes} minutes">Log</button></div>`;
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
        return `<div class="swipe-row"><button class="swipe-act" data-act="swap-open" data-date="${d}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">${icon('arrows-left-right')}Swap</button>
          <div class="cell swipe-front"><button class="cell-main as-link" data-act="recipe" data-id="${meal.id}" data-date="${d}" data-key="${key}" data-slot="${slot}"><span class="cell-title">${esc(meal.name)}</span>
            <span class="cell-sub">${meal.kcal} kcal, ${meal.p} g protein${swapped ? ', swapped in' : ''}</span></button>
          <button class="btn btn-tinted fuel btn-sm log${on ? ' on' : ''}" data-act="log-menu" data-slot="${slot}" data-id="${meal.id}" aria-pressed="${on}">${on ? `${icon('check')}Eaten` : 'Log'}</button></div></div>`;
      }),
      ...extra.map(({ f, i }) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(f.name)}</div>
          <div class="cell-sub">${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein${f.t ? `, ${esc(f.t)}` : ''}${flagText(f.tags)}</div></div>
          <button class="icon-btn" data-act="food-del" data-i="${i}" aria-label="Remove ${esc(f.name)}">${icon('x')}</button></div>`),
    ];
    const label = SLOT_LABEL[slot];
    return `<div class="group-head"><p class="group-label">${label}</p><button class="icon-btn" data-act="add-to" data-slot="${slot}" aria-label="Add to ${label.toLowerCase()}">${icon('plus')}</button></div>
      <div class="group">${rows.join('')}</div>`;
  }).join('');
  return `${groups}
    <div class="group actions-group">
      <button class="cell cell-action" data-act="add-food-open">${icon('plus-circle')}<span>Add food</span></button>
      <button class="cell cell-action" data-act="log-day" ${unlogged ? '' : 'disabled'}>${icon('check-circle')}<span>Log the rest as planned</span></button>
      <button class="cell cell-action" data-act="same-yesterday" ${yesterday ? '' : 'disabled'}>${icon('repeat')}<span>Same as yesterday</span></button>
    </div>
    ${foot('Tap a meal for its recipe, or swipe it left to swap it. Anything off-plan goes in with Add food, so the numbers stay honest.')}`;
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
  return `<div class="group"><button class="cell cell-button" data-act="weigh-open" data-id="row"><span class="tile gray">${icon('scales')}</span><span class="cell-main"><span class="cell-title">${esc(short(d))}</span></span>
    <span class="cell-value">${day?.weight ? `${day.weight.toFixed(1)} kg` : 'Weigh in'}</span><span class="accessory">${icon('caret-right')}</span></button></div>
    ${foot(`${last ? `Last weigh-in ${esc(short(last[0]))}: ${last[1].toFixed(1)} kg.` : `Start: ${state.profile.startWeight.toFixed(1)} kg.`} Once a week, same morning, before breakfast.`)}`;
}

// ---------- Train ----------
function trainMonday() {
  const thisMonday = L.mondayOf(todayISO());
  return ui.week || (thisMonday < state.profile.startDate ? state.profile.startDate : thisMonday);
}

// Which parts of the body a session works, from its exercises. Runs and cardio count as legs.
function sessionParts(s) {
  if (s.exercises) return [...new Set(s.exercises.flatMap(([id]) => exInfo(id)?.part ?? []))];
  return s.kind === 'cardio' || s.id === 'longwalk' ? ['Legs'] : [];
}
// One day of the schedule: a row for each workout, or a Rest day row that opens Plan something.
function planRows(date) {
  const ss = plannedOn(date);
  const dayLabel = (first) => `<span class="plan-day${date === todayISO() ? ' now' : ''}">${first ? esc(dateText(date, { weekday: 'short' }).slice(0, 2)) : ''}</span>`;
  const day = state.days[date];
  const main = ss.filter((x) => x.kind !== 'rest' && x.id !== 'walks');
  if (!ss.length) return `<div class="cell plan-row">${dayLabel(true)}<span class="tile gray">${icon('calendar-check')}</span><div class="cell-main"><div class="cell-title dim">Before the plan starts</div></div></div>`;
  if (!main.length) {
    const walks = ss.find((x) => x.id === 'walks');
    return `<button class="cell cell-button plan-row" data-act="plan-open" data-date="${date}">${dayLabel(true)}<span class="tile gray">${icon(walks ? 'person-simple-walk' : 'moon')}</span>
      <div class="cell-main"><div class="cell-title">${walks ? esc(walks.name) : 'Rest day'}</div><div class="cell-sub">${walks ? `${walks.minutes} min. Tap to plan something` : 'Tap to plan something'}</div></div><span class="accessory">${icon('caret-right')}</span></button>`;
  }
  return main.map((s, k) => {
    const done = day?.workouts?.some((w) => w.id === s.id);
    const parts = sessionParts(s);
    const partText = parts.length ? `, ${parts.slice(0, 3).join(', ').replace(/(?<=, )./g, (c) => c.toLowerCase())}` : '';
    const sub = `${s.exercises ? `${plural(s.exercises.length, 'exercise', 'exercises')}` : `${s.minutes} min`}${partText}${s.movedFrom ? `, from ${dateText(s.movedFrom, { weekday: 'short' })}` : ''}${s.extra ? ', added' : ''}`;
    return `<button class="cell cell-button plan-row" data-act="open-session" data-id="${s.id}" data-date="${date}">${dayLabel(k === 0)}<span class="tile effort">${icon(sessionIcon(s))}</span>
      <div class="cell-main"><div class="cell-title">${esc(s.name)}</div><div class="cell-sub">${esc(sub)}</div></div>
      <span class="accessory ${done ? 'done' : ''}">${done ? icon('check-circle') : icon('caret-right')}</span></button>`;
  }).join('');
}

function sheetPlan(date) {
  const walks = plannedOn(date).find((x) => x.id === 'walks');
  const opts = L.planOptions(state, date);
  return `<div class="sheet">${sheetHead(`Plan ${esc(dateText(date, { weekday: 'long' }))}`)}
    ${foot(`${esc(dateText(date))}. Pick a session to add to this day. It counts for the week like the others, and you can take it off again.`)}
    ${walks ? `<div class="group actions-group"><button class="cell cell-action" data-act="plan-walks" data-id="walks" data-date="${date}">${icon('person-simple-walk')}<span>Open ${esc(walks.name.toLowerCase())}</span></button></div>` : ''}
    <div class="group sheet-list">${opts.map((o) => `<div class="cell"><span class="tile effort">${icon(sessionIcon(SESSIONS[o.id]))}</span><div class="cell-main"><div class="cell-title">${esc(o.name)}</div><div class="cell-sub">${o.minutes} min${SESSIONS[o.id].exercises ? `, ${plural(SESSIONS[o.id].exercises.length, 'exercise', 'exercises')}` : ''}</div></div>
      <button class="btn btn-gray btn-sm" data-act="plan-add" data-id="${o.id}" data-date="${date}">Add</button></div>`).join('')}</div></div>`;
}

// ---------- Exercises ----------
const norm = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function libraryList() {
  const own = (state.customEx || []).map((c) => ({ id: c.id, ...exInfo(c.id) }));
  const plan = Object.keys(EXERCISES).map((id) => ({ id, ...exInfo(id) }));
  const q = norm(ui.exQuery);
  return [...plan, ...own].filter((e) => {
    if (ui.exPart === 'Mine' ? !e.custom : ui.exPart !== 'All' && e.part !== ui.exPart) return false;
    return !q || norm(`${e.name}${e.part}${e.muscles ?? ''}${e.gear}`).includes(q);
  });
}
function exCards() {
  const list = libraryList();
  if (!list.length) return `<p class="section-foot ex-none">${ui.exPart === 'Mine' && !(state.customEx || []).length ? 'Nothing here yet. Create your own exercise above.' : 'No exercise matches. Try another word or body part.'}</p>`;
  return list.map((e) => `<article class="ex-card">
    <button class="ex-open" data-act="ex-detail" data-id="${esc(e.id)}" aria-label="${esc(e.name)}, details">
      <span class="ex-thumb">${e.pic ? `<img class="ex-pic" src="img/ex/${esc(e.pic)}.svg" alt="" width="512" height="512" loading="lazy">` : icon(e.custom ? 'sparkle' : 'barbell')}</span>
      <span class="ex-card-name">${esc(e.name)}</span>
      <span class="ex-card-sub">${esc(e.muscles ?? e.part)}, ${esc(e.gear.toLowerCase())}</span>
    </button>
    ${state.active && SESSIONS[state.active.id]?.exercises ? `<button class="icon-btn" data-act="ex-add" data-id="${esc(e.id)}" aria-label="Add ${esc(e.name)} to the running workout">${icon('plus')}</button>` : ''}
  </article>`).join('');
}
function viewExercises() {
  const total = Object.keys(EXERCISES).length + (state.customEx || []).length;
  return `${nav('Exercises', `${plural(total, 'exercise', 'exercises')}`)}
  ${segmented('train-view', [['schedule', 'Schedule'], ['exercises', 'Exercises']], ui.trainView, 'Train views')}
  <label class="search">${icon('magnifying-glass')}<input type="search" id="ex-q" placeholder="Search exercises" value="${esc(ui.exQuery)}" autocomplete="off" aria-label="Search exercises"></label>
  <div class="chips" role="group" aria-label="Body part">${['All', ...BODY_PARTS, 'Mine'].map((p) => `<button class="chip-btn" data-act="ex-part" data-id="${p}" aria-pressed="${ui.exPart === p}">${p}</button>`).join('')}</div>
  <div class="group actions-group"><button class="cell cell-action" data-act="ex-new">${icon('plus-circle')}<span>Create your own exercise</span></button></div>
  ${foot('Name it, pick a body part, and add it to a workout while you train. The + on a card adds that exercise to the workout that is running.')}
  <p class="sr-only" id="ex-count" aria-live="polite"></p><div class="ex-grid" id="ex-grid">${exCards()}</div>`;
}
function sheetExNew() {
  const opt = (v, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${v}</option>`;
  return `<div class="sheet">${sheetHead('New exercise')}
    <form data-form="exnew">
      <div class="group">
        <label class="cell field"><span class="tile gray">${icon('barbell')}</span><span class="field-label">Name</span><input name="name" maxlength="60" required autocomplete="off" placeholder="Required"></label>
        <label class="cell field"><span class="tile gray">${icon('ruler')}</span><span class="field-label">Body part</span><select name="part">${BODY_PARTS.map((p) => opt(p, 'Full body')).join('')}</select></label>
        <label class="cell field"><span class="tile gray">${icon('timer')}</span><span class="field-label">Counted in</span><select name="unit"><option value="reps">Reps</option><option value="s">Seconds</option></select></label>
      </div>
      ${foot('It shows under Mine. Add it to a workout from the + while you train.')}
      <button class="btn-start" type="submit">Save</button>
    </form></div>`;
}
function sheetExDetail(id) {
  const e = exInfo(id);
  const last = L.lastStrength(state, id, '9999-12-31');
  const best = L.bestKg(state, id, '9999-12-31');
  let times = 0, mostReps = 0;
  for (const day of Object.values(state.days)) for (const w of day.workouts ?? []) if (w.ex?.some((x) => x.id === id && x.sets > 0)) { times++; for (const x of w.ex) if (x.id === id) mostReps = Math.max(mostReps, x.reps ?? 0); }
  const running = state.active && SESSIONS[state.active.id]?.exercises;
  return `<div class="sheet">${sheetHead(esc(e.name))}
    ${e.pic ? `<div class="ex-hero"><img class="ex-pic" src="img/ex/${esc(e.pic)}.svg" alt="" width="512" height="512"></div>` : ''}
    <p class="ex-card-sub">${esc(e.part)}${e.muscles ? `, ${esc(e.muscles)}` : ''}, ${esc(e.gear.toLowerCase())}</p>
    ${e.cue ? `<p class="cue">${esc(e.cue)}</p>` : ''}${e.alt ? `<p class="ex-alt">${esc(e.alt)}</p>` : ''}
    ${sectionHead('Your history')}
    <div class="group">
      <div class="cell"><div class="cell-main"><div class="cell-title">Logged in</div></div><span class="cell-value">${times ? plural(times, 'workout', 'workouts') : 'not yet'}</span></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">Last time</div></div><span class="cell-value">${last ? `${esc(short(last.date))}, ${last.kg ? `${last.kg} kg × ` : ''}${last.reps ?? '?'}` : 'not yet'}</span></div>
      <div class="cell"><div class="cell-main"><div class="cell-title">${best || !mostReps ? 'Heaviest' : 'Most reps'}</div></div><span class="cell-value">${best ? `${best} kg` : mostReps ? `${mostReps}` : 'no weight logged'}</span></div>
    </div>
    <div class="group actions-group">
      ${running ? `<button class="cell cell-action" data-act="ex-add" data-id="${esc(id)}">${icon('plus-circle')}<span>Add to the running workout</span></button>` : ''}
      ${e.custom ? `<button class="cell cell-action danger" data-act="ex-del" data-id="${esc(id)}">${icon('x')}<span>Delete this exercise</span></button>` : ''}
    </div>
    ${running ? '' : foot('Start a strength workout first. Then you can add this to it.')}</div>`;
}
// Sets, reps and rest for an exercise added to a workout: as the plan has it somewhere, else 3 sets of 10 (or 30 seconds) and a minute's rest.
function defaultSlot(id) {
  for (const s of Object.values(SESSIONS)) {
    const hit = s.exercises?.find((e) => e[0] === id);
    if (hit) return [id, hit[1], hit[2], hit[3]];
  }
  return [id, 3, exInfo(id)?.unit === 's' ? '30 seconds' : '10', 60];
}

// Today's main session with Start, above everything else on Train.
function todayCard() {
  const today = todayISO();
  const s = sessionsOn(today).find((x) => x.kind !== 'rest' && x.id !== 'walks') ?? sessionsOn(today).find((x) => x.kind !== 'rest');
  if (!s) return '';
  const done = state.days[today]?.workouts?.some((w) => w.id === s.id);
  return `<section class="card today-card"><p class="streak-cap">Today</p><p class="today-name">${esc(s.name)}</p><p class="hero-sub">${s.exercises ? `${plural(s.exercises.length, 'exercise', 'exercises')}, ` : ''}about ${s.minutes} minutes${done ? ', done' : ''}</p>
    <button class="btn btn-tinted effort btn-wide" data-act="open-session" data-id="${s.id}" data-date="${today}">${icon(done ? 'check' : 'caret-right')}${done ? 'Open' : 'Open the session'}</button></section>`;
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
  if (ui.trainView === 'exercises') return viewExercises();
  return `
  ${nav(pos.before ? 'Before the plan' : `Week ${pos.week}`, cap, actions)}
  ${segmented('train-view', [['schedule', 'Schedule'], ['exercises', 'Exercises']], ui.trainView, 'Train views')}
  ${isCurrent && !pos.before ? todayCard() : ''}
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
  <div class="group plan-list">${days.map((date) => planRows(date)).join('')}</div>
  ${foot('Tap a session to open it. Tap a rest day, or a day with only walks, to plan something there.')}
  ${sectionHead('How hard')}
  <div class="group">
    ${zone('Easy', `under ${z.easy[1]} bpm`, 'easy', EFFORT.easy)}
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
  <div class="card prose"><ul class="prose-list">${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`;
}

// ---------- Session ----------
function currentSession() {
  const { date, id } = ui.session;
  const s = sessionsOn(date).find((x) => x.id === id) || plannedOn(date).find((x) => x.id === id) || { ...SESSIONS[id], id, minutes: SESSIONS[id].minutes || 30, reps: 5, exercises: SESSIONS[id].exercises };
  if (!isActive(date, id) || !s.exercises) return s;
  const swap = state.active.swap || {};
  // A swapped exercise keeps its slot's sets, reps and rest, so everything that reads the list sees the stand-in. Added ones come last.
  return { ...s, exercises: [...s.exercises.map((e, i) => (swap[i] ? [swap[i], ...e.slice(1)] : e)), ...(state.active.extra || [])] };
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
// Starts the open session unless it runs already; a different one running is discarded at once, and the returned toast offers Undo.
// A weigh-in is due and this is today's session, so Start asks for the weight first, unless it was skipped today.
function checkInDue() {
  const { date, id } = ui.session;
  const today = todayISO();
  return date === today && id !== 'walks' && ui.checkinSkipped !== today && L.weighInDue(state, today) && !isActive(date, id);
}
function begin() {
  const note = startOver();
  save();
  render();
  if (note) toast(note, true);
}
function startOver() {
  if (isActive(ui.session.date, ui.session.id)) return '';
  const other = state.active;
  if (other) snapshot();
  startActive();
  // The date tells last week's Strength A from the one starting now.
  return other ? `${SESSIONS[other.id]?.name ?? 'The other session'}${other.date === ui.session.date ? '' : ` for ${short(other.date)}`} discarded` : '';
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
  const placed = !active && !logged.length && s.id !== 'walks' && s.kind !== 'rest' && plannedOn(date).some((x) => x.id === id);
  const movable = placed && !s.extra;
  const hot = isHot(date) && (s.kind === 'cardio' || s.outdoor);
  const actionBlock = `${active
    ? `<div class="card timer-card${active.pausedAt ? ' paused' : ''}"><div class="timer-label">${active.pausedAt ? 'Paused' : 'Elapsed'}</div><div class="timer num" id="elapsed">0:00</div>
      <div class="start-row"><button class="btn-start" data-act="finish">Finish</button><button class="btn btn-gray btn-wide" data-act="pause">${active.pausedAt ? `${icon('play')}Resume` : `${icon('pause')}Pause`}</button></div></div>`
    : `<div class="start-row"><button class="btn-start" data-act="start">${icon('play')}Start</button>${s.id === 'walks'
      ? '<button class="btn btn-gray btn-wide" data-act="quick-log" data-n="10">Log a 10 min walk</button>'
      : `<button class="btn btn-gray btn-wide" data-act="quick-log" data-n="${s.minutes}">Log as planned</button>`}</div>`}`;
  // The rest bar stays outside the part an edge swipe moves, as a moved parent would pin the fixed bar to itself.
  return `<div class="pushed">
  <div class="back-row"><button class="back" data-act="close-session">${icon('caret-left')}<span>${ui.tab === 'today' ? 'Today' : 'Train'}</span></button></div>
  ${nav(esc(s.name), `${esc(dateText(date))}, about ${s.minutes} minutes${s.reps && s.id === 'intervals' ? `, ${s.reps} repeats` : ''}`)}
  <div class="chip-row"><span class="chip ${s.effort}">${eff.label}</span>${hr ? `<span class="chip num">${hr}</span>` : ''}<span class="chip">RPE ${eff.rpe}</span></div>
  ${actionBlock}
  <p class="lede">${esc(eff.talk)}.</p>
  <details class="how"><summary>How to do it</summary><p class="lede">${esc(s.how)}</p>${foot(esc(s.why))}</details>
  ${s.deload ? callout('arrow-clockwise', `<p>${esc(DELOAD)}</p>`) : ''}
  ${hot ? callout('thermometer-hot', `<p>${esc(s.outdoor ? HOT_LONGWALK : HOT)}</p>`, 'hot') : ''}
  ${hr && s.kind !== 'strength' && !state.settings?.watchSeen ? callout('watch', `<p>${esc(WATCH_ALERT)}</p><button class="btn btn-gray btn-sm" data-act="watch-seen">Got it</button>`) : ''}
  ${otherActive ? callout('warning', `<p>Another session is running (${esc(SESSIONS[state.active.id]?.name ?? '')}). Starting this one discards it.</p>`, 'warn') : ''}
  ${placed && s.extra ? `<button class="text-danger" data-act="extra-del">Take it off this day</button>${foot('You added this session to the day. The plan itself does not change.')}` : ''}
  ${movable ? `<div class="group actions-group"><button class="cell cell-action" data-act="move-open">${icon('calendar-plus')}<span>Move to another day</span></button></div>${s.movedFrom ? foot(`Moved from ${esc(dateText(s.movedFrom))}. It still counts for its own week's plan.`) : ''}` : ''}
  ${s.id === 'intervals' && active ? '<div class="card phase" id="phase"></div>' : ''}
  ${s.id === 'intervals' ? foot(`Timing: 10 minutes easy, then ${s.reps} rounds of 2 minutes hard and 2 easy, then 5 minutes easy. Each change beeps and flashes the screen.`) : ''}
  ${s.exercises ? `<div class="exlist">${s.exercises.map(([exId, sets, spec, rest], i) => exerciseCard(exId, sets, spec, rest, i, active)).join('')}</div>${foot(esc(PROGRESSION))}` : ''}
  ${logged.length ? `${sectionHead('Logged')}<div class="group">${logged.map(({ w, i }) => `<div class="cell"><span class="tile effort">${icon('check')}</span><div class="cell-main"><div class="cell-title">${w.min} min, RPE ${w.rpe}${w.hr ? `, ${w.hr} bpm` : ''}</div>
      <div class="cell-sub">${esc(w.t || '')}${w.note ? `. ${esc(w.note)}` : ''}${w.ex?.length ? `. ${esc(w.ex.filter((e) => e.kg || e.reps).map((e) => `${exName(e.id)}: ${e.kg ? `${e.kg} kg × ` : ''}${e.reps ?? ''}`).join(', '))}` : ''}</div></div>
      <button class="icon-btn" data-act="workout-del" data-i="${i}" aria-label="Remove this log">${icon('x')}</button></div>`).join('')}</div>` : ''}</div>
  <div id="rest" class="rest" hidden></div>`;
}

function exerciseCard(exId, sets, spec, rest, i, active) {
  const ex = exInfo(exId);
  const done = active?.sets?.[i] ?? 0;
  const last = L.lastStrength(state, exId, ui.session.date);
  const hint = L.strengthHint(last, spec);
  const { unit } = L.repSpec(spec);
  const unitLabel = unit === 's' ? 'Seconds' : unit === 'm' ? 'Metres' : 'Reps';
  const kg = active?.log?.[i]?.kg ?? last?.kg ?? '';
  const rp = active?.log?.[i]?.reps ?? last?.reps ?? L.repSpec(spec).top ?? '';
  const held = active && ui.hold?.i === i ? ui.hold.k : -1;
  const baseLen = SESSIONS[ui.session.id]?.exercises?.length ?? 0;
  const orig = SESSIONS[ui.session.id]?.exercises?.[i]?.[0];
  const swapped = !!orig && orig !== exId;
  const kgNow = Number(active?.log?.[i]?.kg) || 0;
  const best = active && done > 0 && kgNow > 0 ? L.bestKg(state, exId, ui.session.date) : null;
  return `<section class="card ex"><div class="ex-head"><span class="ex-num num">${i + 1}</span><div><h3 class="ex-name">${esc(ex.name)}</h3><p class="ex-meta">${sets} sets of ${esc(spec)}, ${rest} s rest</p></div></div>
    ${ex.pic ? `<img class="ex-pic" src="img/ex/${esc(ex.pic)}.svg" alt="" width="512" height="512">` : ''}
    ${ex.cue ? `<p class="cue">${esc(ex.cue)}</p>` : ''}${ex.alt ? `<p class="ex-alt">${esc(ex.alt)}</p>` : ''}
    ${ex.custom || i >= baseLen ? `<p class="ex-alt">${esc(ex.part)}${ex.muscles ? `, ${esc(ex.muscles)}` : ''}${i >= baseLen ? '. Added to this workout.' : '.'}</p>` : ''}
    ${swapped ? `<p class="ex-alt">Swapped in for ${esc(EXERCISES[orig].name)}.</p>` : ''}
    ${last ? `<p class="ex-last">Last time, ${esc(short(last.date))}: ${last.kg ? `${last.kg} kg, ` : ''}${last.reps ?? '?'} ${unitLabel.toLowerCase()}, ${last.sets} of ${last.planned} sets. ${esc(hint)}</p>` : ''}
    ${best != null && kgNow > best ? `<p class="ex-best" role="status">${icon('flame')}New best: ${kgNow} kg, up from ${best} kg.</p>` : ''}
    <div class="ex-log">
      <label class="pill-field"><span>kg</span><input inputmode="decimal" data-act="ex-kg" data-i="${i}" value="${esc(kg)}" placeholder="body" autocomplete="off"></label>
      <label class="pill-field"><span>${unitLabel}</span><input inputmode="numeric" data-act="ex-reps" data-i="${i}" value="${esc(rp)}" autocomplete="off"></label>
    </div>
    <div class="sets">${Array.from({ length: sets }, (_, k) => `<button class="setbtn num" data-act="set" data-i="${i}" data-k="${k}" aria-pressed="${k < done}" aria-label="Set ${k + 1}${k === held ? ', holding' : ''}">${k < done ? icon('check') : k === held ? icon('timer') : k + 1}<label class="tap" aria-hidden="true"><input type="checkbox" switch></label></button>`).join('')}
      ${active && i >= baseLen && i === baseLen + (state.active.extra?.length ?? 0) - 1 && done === 0 ? `<button class="btn btn-gray btn-sm" data-act="ex-extra-del" data-i="${i}">${icon('x')}Remove</button>` : ''}
      ${orig && active && done === 0 && (SWAPS[exId] || swapped) ? `<button class="btn btn-gray btn-sm" data-act="ex-swap-open" data-i="${i}">${icon('arrows-left-right')}Swap</button>` : ''}
      <button class="btn btn-gray btn-sm" data-act="rest" data-i="${i}" data-sec="${rest}">${icon('timer')}Rest ${rest} s</button></div></section>`;
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
  const on = a && ui.session && isActive(ui.session.date, ui.session.id);
  if (on) {
    const secs = L.activeMs(a, Date.now()) / 1000;
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
  if (!r) return;
  const exs = on ? currentSession().exercises : null;
  const name = (i) => esc(exName(exs[i][0]));
  const h = on && ui.hold;
  if (h) {
    const left = Math.ceil((h.until - Date.now()) / 1000);
    if (left <= 0) return holdDone();
    const first = h.sides && left > h.sec;
    if (h.sides && !first && !h.switched) {
      h.switched = true;
      beep(1);
      flash('Switch sides', 'easy');
    }
    return bar(r, 'rest', h.sides ? `Hold, ${first ? 'first' : 'second'} side` : 'Hold', mmss(first ? left - h.sec : left), `${name(h.i)}, set ${h.k + 1} of ${exs[h.i][1]}`, '<button class="btn btn-gray btn-sm" data-act="hold-done">Done</button>');
  }
  const up = exs && L.nextUp(exs, a.sets, ui.rest?.i ?? 0);
  const next = up ? `Next: ${name(up.i)}, set ${up.set} of ${up.of}` : '';
  if (ui.rest) {
    const left = Math.ceil((ui.rest.until - Date.now()) / 1000);
    if (left > 0) return bar(r, 'rest', 'Rest', mmss(left), next, '<button class="btn btn-gray btn-sm" data-act="rest-skip">Skip</button>');
    if (!ui.rest.beeped) {
      ui.rest.beeped = true;
      beep(2);
      flash('Rest over. Next set.', 'easy');
    }
    if (left >= -8) return bar(r, 'rest go', 'Rest is over', 'Go', next, '<button class="btn btn-gray btn-sm" data-act="rest-skip">OK</button>');
    ui.rest = null;
  }
  if (exs && !up) return bar(r, 'rest done', '', 'All sets done', '', '<button class="btn btn-fill btn-sm" data-act="finish">Finish</button>');
  if (up && r.contains(document.activeElement)) focusSet(up.i, up.set - 1); // the bar takes its button with it
  r.hidden = true;
}
const focusSet = (i, k) => $(`#main [data-act="set"][data-i="${i}"][data-k="${k}"]`)?.focus();
// The bar rewrites its markup only when the content changes, so its button stays pressable and keeps focus between ticks.
function bar(r, cls, label, time, sub, btn) {
  const html = `<div>${label ? `<div class="rest-label">${label}</div>` : ''}<div class="rest-time"></div>${sub ? `<div class="rest-next">${sub}</div>` : ''}</div>${btn}`;
  r.hidden = false;
  r.className = cls;
  const fresh = r.dataset.html !== html;
  if (fresh) {
    const had = r.contains(document.activeElement);
    r.innerHTML = html;
    r.dataset.html = html;
    if (had) r.querySelector('button').focus({ preventScroll: true }); // a new label must not drop the focus its button had
  }
  r.querySelector('.rest-time').textContent = time;
  if (fresh) document.body.style.setProperty('--rest-h', `${r.offsetHeight}px`); // the toast rises above the bar, one line of text or two
}
// Ticks set k and the ones before it, or unticks from k if it was done. A new set starts the rest, unless nothing is left.
function tickSet(i, k, show = render) {
  const exs = currentSession().exercises;
  const done = state.active.sets[i] ?? 0;
  const next = k < done ? k : k + 1;
  state.active.sets[i] = next;
  if (next > done) {
    // A set done means training again, so it ends a pause rather than starting a rest on a stopped clock.
    L.setPaused(state.active, false, Date.now());
    ui.rest = L.nextUp(exs, state.active.sets, i) ? { until: Date.now() + exs[i][3] * 1000, beeped: false, i } : null;
  }
  save();
  show();
}
function startHold(i, k) {
  const [, , spec] = currentSession().exercises[i];
  const sec = state.active.log[i]?.reps || L.repSpec(spec).top;
  // A hold done on each side runs twice, with a beep to switch sides halfway.
  const sides = /\beach\b/.test(spec);
  // A hold ends a pause too, and the save keeps the session if this tap is the one that started it.
  L.setPaused(state.active, false, Date.now());
  save();
  ui.rest = null;
  ui.hold = { i, k, sec, sides, until: Date.now() + sec * (sides ? 2000 : 1000) };
  render();
}
function holdDone() {
  const { i, k } = ui.hold;
  ui.hold = null;
  beep(2);
  flash('Hold done', 'easy');
  if ($('#rest').contains(document.activeElement)) focusSet(i, k); // its Done button goes with the hold
  // The timer ends the hold, so a kg, reps or seconds box being typed in keeps its number until it loses focus.
  tickSet(i, k, renderWhenIdle);
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
  ${weekly ? segmented('food-sec', [['menu', 'Menu'], ['prep', 'Prep'], ['shopping', 'Shopping']], ui.food, 'Food sections') : `<div class="back-row"><button class="back" data-act="food-sec" data-id="menu">${icon('caret-left')}<span>Menu</span></button></div>`}
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
  const off = (state.excluded || []).map((id) => L.MEAL_BY_ID[id]).filter(Boolean);
  return `${foot(`Each day comes to about 2,100 to 2,300 kcal and over 140 g of protein. Your limit is ${fmt(t.kcal)} kcal, so there is room for the odd extra. ${esc(MENU_NOTE)}`)}
  ${Array.from({ length: 7 }, (_, i) => {
    const date = L.addDays(monday, i);
    const items = L.menuFor(date, state);
    const tot = L.mealTotals(items.map((x) => x.meal));
    return `<div${date === todayISO() ? ' id="food-today"' : ''}></div>${sectionHead(esc(dateText(date, { weekday: 'long', day: 'numeric', month: 'short' })), `${fmt(tot.kcal)} kcal, ${tot.p} g protein`)}
      <div class="group">${items.map(({ key, slot, meal, swapped }) => `<div class="cell"><button class="cell-main as-link" data-act="recipe" data-id="${meal.id}"><span class="cell-title">${esc(meal.name)}</span><span class="cell-sub">${SLOT_LABEL[slot]}, ${meal.kcal} kcal${swapped ? ', swapped in' : ''}</span></button>
        <button class="icon-btn" data-act="swap-open" data-date="${date}" data-key="${key}" data-slot="${slot}" aria-label="Swap ${esc(meal.name)}">${icon('arrows-left-right')}</button></div>`).join('')}</div>`;
  }).join('')}
  ${sectionHead('Guides')}
  <div class="group">${FOOD_SECTIONS.slice(3).map(([k, label, ic]) => `<button class="cell cell-button" data-act="food-sec" data-id="${k}"><span class="tile fuel">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${label}</div></div><span class="accessory">${icon('caret-right')}</span></button>`).join('')}</div>
  ${off.length ? `${sectionHead('Not suggested')}<div class="group">${off.map((m) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(m.name)}</div><div class="cell-sub">${SLOT_LABEL[m.slot]}, ${m.kcal} kcal</div></div>
      <button class="btn btn-gray btn-sm" data-act="include" data-id="${esc(m.id)}" aria-label="Suggest again: ${esc(m.name)}">Suggest again</button></div>`).join('')}</div>
    ${foot('These stay out of the menus, the prep plan and the shopping list. A similar meal takes their place.')}` : ''}`;
}

function foodRecipes() {
  return SLOTS.map((slot) => `${sectionHead(SLOT_LABEL[slot])}<div class="group">${MEALS.filter((m) => m.slot === slot).map((m) => `<details class="cell-details"><summary class="cell"><div class="cell-main"><span class="cell-title">${esc(m.name)}</span><span class="cell-sub">${m.kcal} kcal, ${m.p} g protein</span></div><span class="accessory">${icon('caret-right')}</span></summary><div class="details-body">${recipeBody(m)}</div></details>`).join('')}</div>`).join('')
    + `${sectionHead('Extras to log honestly')}<div class="group">${MEALS.filter((m) => m.slot === 'extra').map((m) => `<div class="cell"><div class="cell-main"><span class="cell-title">${esc(m.name)}</span><span class="cell-sub">${esc(foodSub(m))}</span></div></div>`).join('')}</div>
    ${foot('Typical values for one portion, so they go in the log in one tap from Add food. The sources of the Thai dish values are credited at the bottom of Settings, About.')}`;
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
  // Count only what is on the list now: a swap or an exclusion can leave ticks behind for items it removed.
  const keys = [...groups.flatMap((g) => g.items.map((it) => it.key)), ...PANTRY.map((_, i) => `pantry:${i}`)];
  const total = keys.length;
  const done = keys.filter((k) => ticks[k]).length;
  return `<div class="group actions-group"><button class="cell cell-action" data-act="shop-share" ${done < total ? '' : 'disabled'}>${icon('export')}<span>Share the list</span></button></div>
  ${foot(`Everything for the week of ${esc(short(monday))}, worked out from that week's menu and your swaps. Shop before the Sunday prep. ${done} of ${total} ticked.`)}
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
function openAddFood(slot) {
  ui.addSlot = slot;
  ui.portion = 1;
  showSheet(sheetAddFood());
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
// Where toast() puts a message while the sheet is open, as the sheet covers the toast.
const formError = (id) => `<p class="section-foot form-error" id="${id}" role="alert"></p>`;

function sheetAddFood(query = '') {
  return `<div class="sheet">${sheetHead('Add food')}
    ${segmented('add-slot-seg', SLOTS.map((s) => [s, SLOT_LABEL[s]]), ui.addSlot, 'Meal')}
    <div class="chips compact" role="group" aria-label="Portion">${[0.5, 1, 1.5, 2].map((x) => `<button class="chip-btn" data-act="portion" data-n="${x}" aria-pressed="${ui.portion === x}">${x === 1 ? '1 portion' : `${x} portions`}</button>`).join('')}</div>
    <label class="search">${icon('magnifying-glass')}<input type="search" id="food-q" placeholder="Search meals, extras and your foods" value="${esc(query)}" autocomplete="off" aria-label="Search"></label>
    <p class="sr-only" id="food-count" aria-live="polite"></p><div class="group sheet-list" id="food-list">${foodListItems(query)}</div>
    ${sectionHead('Something else')}
    <form data-form="quick">
      <div class="group">
        <label class="cell field"><span class="field-label">Name</span><input name="name" required maxlength="80" autocomplete="off" placeholder="Required"></label>
        <label class="cell field"><span class="field-label">Energy</span><input name="kcal" inputmode="numeric" required autocomplete="off" placeholder="0"><span class="unit">kcal</span></label>
        <label class="cell field"><span class="field-label">Protein</span><input name="p" inputmode="numeric" autocomplete="off" placeholder="0"><span class="unit">g</span></label>
        <label class="cell field"><span class="field-label">Values are</span><select name="per"><option value="portion">for the portion</option><option value="100g">per 100 g</option></select></label>
        <label class="cell field"><span class="field-label">Grams eaten</span><input name="grams" inputmode="numeric" placeholder="if per 100 g" autocomplete="off"><span class="unit">g</span></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Sugary drink</span></span><input type="checkbox" class="switch" switch name="sugary"></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Red meat, offal or shellfish</span></span><input type="checkbox" class="switch" switch name="purine"></label>
        <label class="cell switch-cell"><span class="cell-main"><span class="cell-title">Save to my foods</span></span><input type="checkbox" class="switch" switch name="fav" checked></label>
      </div>
      ${formError('quick-error')}
      <button class="btn-start" type="submit">Add</button>
    </form>
  </div>`;
}

function foodListItems(query) {
  const q = query.trim();
  const row = (name, sub, act, attrs, extra = '') => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(name)}</div><div class="cell-sub">${esc(sub)}</div></div>${extra}<button class="btn btn-tinted fuel btn-sm" data-act="${act}" ${attrs}>Add</button></div>`;
  const head = (t) => `<div class="cell list-head">${t}</div>`;
  const recent = q ? [] : recentFoods();
  const own = state.custom.filter((c) => !q || L.matches(c.name, q));
  const lib = MEALS.filter((m) => !q || L.matches(m.name, q)).slice(0, 80);
  const parts = [];
  if (recent.length) parts.push(head('Recent'), ...recent.map((f, i) => row(f.name, foodSub(f, '', !!f.ref), 'add-recent', `data-i="${i}"`)));
  if (own.length) {
    parts.push(head('My foods'), ...own.map((c) => (c.per === '100g'
      ? row(c.name, foodSub(c, ' per 100 g', false), 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`, `<input class="grams" inputmode="numeric" data-grams="${esc(c.id)}" value="100" aria-label="Grams of ${esc(c.name)}">`)
      : row(c.name, foodSub(c, '', false), 'add-food', `data-kind="custom" data-id="${esc(c.id)}"`))));
  }
  if (lib.length) parts.push(head('Meals and extras'), ...lib.map((m) => row(m.name, foodSub(m), 'add-food', `data-kind="meal" data-id="${m.id}"`)));
  return parts.join('') || '<div class="cell"><div class="cell-main"><div class="cell-sub">Nothing matches. Add it under Something else.</div></div></div>';
}

function sheetMove() {
  const { date, id } = ui.session;
  const s = currentSession();
  const days = L.moveTargets(state, id, date, todayISO());
  const today = todayISO();
  const row = (d, label, sub, home = false) => `<button class="cell cell-button" data-act="move-to" data-date="${d}">${home ? `<span class="tile gray">${icon('arrow-u-up-left')}</span>` : ''}
      <div class="cell-main"><div class="cell-title">${esc(label)}</div>${sub ? `<div class="cell-sub">${esc(sub)}</div>` : ''}</div><span class="accessory">${icon('caret-right')}</span></button>`;
  const names = (d) => plannedOn(d).filter((x) => x.kind !== 'rest' && x.id !== 'walks').map((x) => x.name);
  const label = (d) => (d === today ? 'Today' : d === L.addDays(today, 1) ? 'Tomorrow' : dateText(d, { weekday: 'long' }));
  return `<div class="sheet">${sheetHead(`Move ${esc(s.name)}`)}
    ${foot(`Now on ${esc(dateText(date))}. Pick the day you will do it.`)}
    <div class="group">${s.movedFrom ? row(s.movedFrom, `Back to ${dateText(s.movedFrom, { weekday: 'long' })}`, 'Where the plan has it', true) : ''}
      ${days.filter((d) => d !== s.movedFrom).map((d) => { const other = names(d); return row(d, `${label(d)}, ${short(d)}`, other.length ? `Also planned: ${other.join(', ')}` : 'Nothing else planned'); }).join('')}</div>
    ${foot('Only this one workout moves. The rest of the week stays as planned.')}</div>`;
}

function sheetExSwap(i) {
  const orig = SESSIONS[ui.session.id].exercises[i][0];
  const here = currentSession().exercises;
  const cur = here[i][0];
  // Another slot already holds the stand-in, so the choices leave those out: a session logs each exercise once.
  const taken = new Set(here.map((e) => e[0]));
  const opts = [...new Set([orig, ...(SWAPS[orig] || []), ...(SWAPS[cur] || [])])].filter((id) => id !== cur && (id === orig || !taken.has(id)));
  const first = (t) => t.split('. ')[0].replace(/\.$/, '') + '.';
  return `<div class="sheet">${sheetHead('Swap exercise')}
    ${foot(`This slot is ${here[i][1]} sets of ${esc(here[i][2])} with ${here[i][3]} s rest. The stand-in uses the same sets, reps and rest.`)}
    <div class="group sheet-list">${opts.map((id) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(EXERCISES[id].name)}${id === orig ? ' (the plan)' : ''}</div><div class="cell-sub">${esc(first(EXERCISES[id].cue))}</div></div>
      <button class="btn btn-gray btn-sm" data-act="ex-swap-set" data-i="${i}" data-id="${id}">Use</button></div>`).join('')}</div></div>`;
}

function sheetSwap(date, key, slot) {
  const current = L.menuFor(date, state).find((x) => x.key === key);
  const opts = L.swapOptions(slot, state.excluded);
  // A row keeps an excluded meal that was already eaten, and that meal needs no second exclude action.
  const canExclude = opts.length > 1 && opts.some((m) => m.id === current.meal.id);
  return `<div class="sheet">${sheetHead(`Swap ${SLOT_LABEL[slot].toLowerCase()}`)}
    ${foot(`${esc(dateText(date))}. Planned: ${esc(L.MEAL_BY_ID[current.planned].name)}.`)}
    ${current.swapped ? `<div class="group actions-group"><button class="cell cell-action" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="">${icon('arrow-u-up-left')}<span>Back to the plan</span></button></div>` : ''}
    <div class="group sheet-list">${opts.map((m) => `<div class="cell"><div class="cell-main"><div class="cell-title">${esc(m.name)}</div><div class="cell-sub">${m.kcal} kcal, ${m.p} g protein, ${m.fib} g fibre</div></div>
      ${m.id === current.meal.id ? `<span class="accessory done">${icon('check-circle')}</span>` : `<button class="btn btn-gray btn-sm" data-act="swap-set" data-date="${date}" data-key="${key}" data-id="${m.id}">Choose</button>`}</div>`).join('')}</div>
    ${canExclude ? `<div class="group danger-group"><button class="cell cell-action danger" data-act="exclude" data-id="${esc(current.meal.id)}">${icon('x')}<span>Do not suggest this again</span></button></div>
      ${foot(`This takes ${esc(current.meal.name)} out of all three menus and puts a similar meal in its place. The prep plan and shopping list follow. You can bring it back in Food, Menu.`)}` : ''}</div>`;
}

// ---------- Progress ----------
let CH = 170; // the weight chart is taller and sets it for the length of one call
const CW = 340, PL = 38, PR = 10, PT = 10, PB = 24;
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
function chartBox(title, big, legendHtml, svg, hint = 'Tap a day for its numbers.') {
  return `<section class="card chart"><div class="chart-head"><h3>${title}</h3>${big ? `<p class="chart-big">${big}</p>` : ''}</div>${legendHtml}<svg viewBox="0 0 ${CW} ${CH}" role="group" aria-label="${esc(title)}">${svg}</svg></section>`;
}
// Each small dot answers taps over the plot's height out to the midpoints with its neighbours; 29 units either way is 44 px on a 320 px phone.
const dotHits = (xs, tips) => L.tapSpans(xs, 29, 0, CW).map(([l, r], i) => `<rect class="hit" x="${l.toFixed(1)}" y="${PT}" width="${(r - l).toFixed(1)}" height="${CH - PT - PB}" data-tip="${esc(tips[i])}" role="img" aria-label="${esc(tips[i].replace(/\n/g, ', '))}"/>`).join('');
function hits(n, bw, tip) {
  return Array.from({ length: n }, (_, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(tip(i))}" role="img" aria-label="${esc(tip(i).replace(/\n/g, ', '))}"/>`).join('');
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
  return chartBox('Exercise minutes', bigNum(last.ex, 'min', `this week${last.target ? ` of ${last.target}` : ''}`), legend([['sw-effort', 'Done'], ['sw-ink ln', 'Weekly target']]), `${s}${bars}${ticks}${labels}${hits(mondays.length, bw, tip)}`, 'Tap a week for its numbers.');
}

// One date axis for the weight and VO2max charts, so the two read the same way.
function timeAxis(startD, endD, vals) {
  const span = Math.max(1, L.diffDays(startD, endD));
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
  return { x, yv, s, line };
}

function weightChart() {
  const p = state.profile;
  const today = todayISO();
  const span = { '1M': 30, '3M': 91, '1Y': 365 }[ui.weightRange]; // undefined for All
  const windowFrom = span ? L.addDays(today, -span) : L.addDays(p.startDate, -28);
  const ins = L.weighIns(state).filter(([d]) => d >= windowFrom);
  const trend = L.weightTrend(state).filter(([d]) => d >= windowFrom);
  const rate = L.weightRate(state, today).kgPerWeek;
  const last = trend.at(-1);
  const startD = span ? windowFrom : [p.startDate, ins[0]?.[0] ?? p.startDate].sort()[0];
  const lastD = [today, ins.at(-1)?.[0] ?? today].sort().at(-1);
  const endD = L.addDays(lastD, span && span <= 91 ? 7 : 14);
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
  const vals = [...ins.map((x) => x[1]), ...goalPts.map((x) => x[1])];
  CH = 220;
  try {
    const { x, yv, s, line } = timeAxis(startD, endD, vals);
    const dots = ins.map(([d, v]) => `<circle class="d-weight" cx="${x(d)}" cy="${yv(v)}" r="4.5"/>`).join('')
      + dotHits(ins.map(([d]) => x(d)), ins.map(([d, v]) => `${short(d)}: ${v.toFixed(1)} kg\nPlan line: ${goalAt(d).toFixed(1)} kg`));
    const big = last ? bigNum(last[1].toFixed(1), 'kg', `trend, plan line ${goalAt(today).toFixed(1)} today`) : '';
    const g = L.goalFor(p);
    const days = last ? L.etaDays(last, rate == null ? null : rate / 7, g, today) : null;
    const note = days === 0 ? 'Goal reached.'
      : rate == null ? 'The rate shows after 3 weigh-ins over 2 weeks.'
      : days ? `At this pace you reach ${g.toFixed(1)} kg around ${esc(dateText(L.addDays(today, days), { day: 'numeric', month: 'short', year: 'numeric' }))}.`
      : `At this pace there is no date for ${g.toFixed(1)} kg yet.`;
    const pct = rate != null && last ? ` (${signedDec((rate / last[1]) * 100, 2)}%)` : '';
    const trendText = rate != null ? `Trend ${signedDec(rate, 1)} kg a week${pct}. ` : '';
    const trendAt = Object.fromEntries(trend);
    const table = ui.weightTable ? `<div class="card table-card"><div class="scroll-x"><table class="tbl"><thead><tr><th>Date</th><th>Weigh-in kg</th><th>Trend kg</th><th>Plan kg</th></tr></thead><tbody>${ins.slice().reverse().map(([d, v]) => `<tr><td>${esc(short(d))}</td><td>${v.toFixed(1)}</td><td>${trendAt[d] != null ? trendAt[d].toFixed(1) : ''}</td><td>${goalAt(d).toFixed(1)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    return `${chartBox('Weight', big, legend([['sw-ink', 'Weigh-ins'], ['sw-ink ln', 'Trend'], ['dash', 'Plan line']]), `${s}${line(goalPts, 'l-target')}${line(trend, 'l-weight')}${dots}`, 'Tap a weigh-in for its numbers.')}
  ${foot(trendText + note)}
  <button class="link-btn" data-act="weight-table" aria-expanded="${!!ui.weightTable}">${ui.weightTable ? 'Hide the table' : 'Show as table'}</button>${table}`;
  } finally { CH = 170; }
}

function vo2Chart() {
  const p = state.profile;
  const pts = L.vo2Readings(state).filter(([d]) => d >= L.addDays(p.startDate, -28));
  if (pts.length < 2) return foot('VO2max shows here once the Steady Watch shortcut brings in 2 readings. If yours has no Cardio Fitness step, make it again from Settings, Data and backup, iPhone shortcuts.');
  const [d0, v0] = pts[0], [d1, v1] = pts.at(-1);
  const startD = [p.startDate, d0].sort()[0];
  const endD = [todayISO(), d1].sort().at(-1);
  const t = p.vo2Target;
  const { x, yv, s, line } = timeAxis(startD, endD, [...pts.map((r) => r[1]), ...(t ? [t] : [])]);
  const dots = pts.map(([d, v]) => `<circle class="d-effort" cx="${x(d)}" cy="${yv(v)}" r="4.5"/>`).join('')
    + dotHits(pts.map(([d]) => x(d)), pts.map(([d, v]) => `${short(d)}: ${v.toFixed(1)} mL/kg/min`));
  const keys = [['sw-effort', 'Readings'], ['sw-effort ln', 'Trend'], ...(t ? [['dash', 'Your target']] : [])];
  return `${chartBox('VO2max', bigNum(v1.toFixed(1), 'mL/kg/min', `on ${esc(short(d1))}`), legend(keys), `${s}${t ? line([[startD, t], [endD, t]], 'l-target') : ''}${line(L.smooth(pts), 'l-effort')}${dots}`, 'Tap a reading for its value.')}
  ${foot(`${signedDec(v1 - v0)} mL/kg/min since ${esc(short(d0))}.`)}`;
}

function weightTiles(items) {
  const p = state.profile;
  const today = todayISO();
  const now = L.weightTrend(state).filter(([d]) => d <= today).at(-1);
  const rate = L.weightRate(state, today).kgPerWeek;
  const ws = items.filter((m) => m.kg != null);
  const next = ws.find((m) => !m.done);
  const shown = next ?? ws.at(-1);
  const n = next && now ? L.etaDays(now, rate == null ? null : rate / 7, next.kg, today) : null;
  const kg = (v) => `${v} <span class="big-unit">kg</span>`;
  const tile = (num, label, sub) => `<div class="tile-card"><span class="tile-num num">${num}</span><span class="tile-label">${label}</span><span class="tile-sub">${sub}</span></div>`;
  return `<div class="tiles">
    ${tile(kg(now ? signedDec(now[1] - p.startWeight) : '0.0'), 'Since start', now ? `From ${p.startWeight.toFixed(1)} kg` : 'No weigh-ins yet')}
    ${tile(rate == null ? 'Not yet' : kg(signedDec(rate, 2)), 'Per week', rate == null ? 'After 3 weigh-ins over 2 weeks' : 'Over the last 4 weeks')}
    ${tile(!next || n === 0 ? 'Reached' : rate == null ? 'Too early to tell' : n == null ? 'No date yet' : L.durationText(n).replace(/^(\d+) (\w+)$/, '$1 <span class="big-unit">$2</span>'), 'Next milestone', shown ? `${shown.kg.toFixed(1)} kg${next && n ? ' at this pace' : ''}` : '')}
    ${tile(L.streakInfo(state, today).current, 'Weeks in a row', 'At half the plan or more')}
  </div>`;
}

function milestoneList(items) {
  return `${sectionHead('Milestones', `${items.filter((m) => m.done).length} of ${items.length}`)}
  <div class="group milestones">${items.map((m) => `<div class="cell"><span class="accessory${m.done ? ' done' : ''}">${m.done ? icon('check-circle') : '<span class="open-mark"></span>'}</span>
    <div class="cell-main"><div class="cell-title">${esc(m.title)}</div><div class="cell-sub">${esc(m.done ? `Earned ${short(m.date)}` : m.detail)}</div></div></div>`).join('')}</div>`;
}

function maintenanceCard() {
  const p = state.profile;
  const m = L.maintenance(state, todayISO());
  if (!m.ready) {
    return callout('flame', `<p><strong>Your real burn</strong> shows up after 20 days of food logs and 3 weigh-ins over at least 2 weeks, counting from ${esc(short(m.from))}. So far: ${plural(m.daysLogged, 'day', 'days')} logged and ${plural(m.weighIns, 'weigh-in', 'weigh-ins')}.</p>`);
  }
  const using = p.kcalTarget === m.suggested;
  return `<section class="card burn-card"><div class="chart-head"><h3>Your real burn</h3><p class="chart-big">${bigNum(fmt(m.maintenance), 'kcal', 'a day')}</p></div>
    <p>Over the last ${plural(m.daysLogged, 'logged day', 'logged days')} you ate about ${fmt(m.intake)} kcal a day and your weigh-ins moved ${m.kgPerWeek >= 0 ? '+' : '−'}${Math.abs(m.kgPerWeek).toFixed(2)} kg a week${m.formula ? `. The formula and the Watch said ${fmt(m.formula)}` : ''}. To keep losing about 0.5 kg a week, the limit would be ${fmt(m.suggested)} kcal.</p>
    <div class="btn-row">${using ? `<span class="accessory done">${icon('check-circle')} Using it</span>` : `<button class="btn btn-fill btn-sm" data-act="use-limit" data-n="${m.suggested}">Use ${fmt(m.suggested)} kcal</button>`}
    ${p.kcalTarget ? '<button class="btn btn-gray btn-sm" data-act="use-limit" data-n="0">Back to automatic</button>' : ''}</div></section>`;
}

// Finished days only, so a half-logged today never reads as short. Until 2 of them say something about effort, last week's show instead.
function weekInsights(today) {
  const monday = L.mondayOf(today);
  const done = Array.from({ length: L.weekday(today) }, (_, i) => L.addDays(monday, i));
  const last = done.filter((d) => L.effortKnown(state.days[d])).length < 2;
  const lines = last ? L.insights(state, L.addDays(monday, -7), L.addDays(monday, -1)) : L.insights(state, monday, L.addDays(today, -1));
  return lines.length ? callout('chart-line-up', `${last ? '<p><strong>Last week</strong></p>' : ''}<ul>${lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`) : '';
}

function viewProgress() {
  const sub = { overview: 'Your weight, streak and records', charts: 'Weight, food, water and training', goals: 'Totals, challenges and milestones', health: 'Blood tests, blood pressure and waist' }[ui.progress] ?? '';
  const views = [['overview', 'Overview'], ['charts', 'Charts'], ['goals', 'Goals'], ['health', 'Health checks']];
  return `${nav('Progress', sub)}
  <div class="chips" role="group" aria-label="Progress views">${views.map(([k, label]) => `<button class="chip-btn" data-act="progress-view" data-id="${k}" aria-pressed="${ui.progress === k}">${label}</button>`).join('')}</div>
  ${ui.progress === 'health' ? viewHealth() : ui.progress === 'charts' ? viewCharts() : ui.progress === 'goals' ? viewGoals() : viewOverview()}`;
}

const tileCard = (num, label, sub) => `<div class="tile-card"><span class="tile-num num">${num}</span><span class="tile-label">${label}</span><span class="tile-sub">${sub}</span></div>`;
const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`);

// Four blocks: where the weight stands, the streak, the activity grid and the latest workouts.
function viewOverview() {
  return `${weightHero()}
  ${streakCard()}
  ${activityCard()}
  ${recentCard(todayISO())}`;
}

function weightHero() {
  const today = todayISO();
  const trend = L.weightTrend(state).filter(([d]) => d <= today);
  const last = trend.at(-1);
  const w30 = L.weightChange30(state, today);
  const pts = trend.filter(([d]) => d >= L.addDays(today, -90));
  let spark = '';
  if (pts.length > 1) {
    const lo = Math.min(...pts.map((q) => q[1])), hi = Math.max(...pts.map((q) => q[1])), span = L.diffDays(pts[0][0], pts.at(-1)[0]) || 1;
    const d = pts.map(([dt, v], i) => `${i ? 'L' : 'M'}${(2 + (296 * L.diffDays(pts[0][0], dt)) / span).toFixed(1)},${(4 + 44 * (1 - (v - lo) / (hi - lo || 1))).toFixed(1)}`).join('');
    spark = `<svg class="spark" viewBox="0 0 300 52" preserveAspectRatio="none" aria-hidden="true"><path class="l-weight" d="${d}"/></svg>`;
  }
  const ms = L.milestones(state, today).filter((m) => m.kg != null);
  const next = ms.find((m) => !m.done);
  const rate = L.weightRate(state, today).kgPerWeek;
  const eta = next && last ? L.etaDays(last, rate == null ? null : rate / 7, next.kg, today) : null;
  const sub = w30 == null ? 'The 30-day change shows after 2 weeks of weigh-ins.' : `${signedDec(w30)} kg in 30 days, on the trend line.`;
  const nextLine = next ? `Next: ${next.kg.toFixed(1)} kg${eta ? `, about ${L.durationText(eta)} at this pace` : ''}.` : ms.length ? 'Every weight milestone is reached.' : '';
  return `<section class="card weight-hero" aria-label="Body weight">
    <p class="streak-cap">Body weight</p>
    <p class="hero-num">${last ? `<span class="num">${last[1].toFixed(1)}</span> <span class="big-unit">kg</span>` : '<span class="hero-none">No weigh-ins yet</span>'}</p>
    <p class="hero-sub">${esc(sub)}${nextLine ? `<br>${esc(nextLine)}` : ''}</p>${spark}
    <div class="btn-row"><button class="btn btn-fill btn-sm" data-act="weigh-open">${icon('plus')}Log weight</button><button class="btn btn-gray btn-sm" data-act="progress-view" data-id="charts">See chart</button></div>
  </section>`;
}

function viewGoals() {
  const today = todayISO();
  const t = L.totals(state, today);
  const ms = L.milestones(state, today);
  return `<div class="tiles">
    ${tileCard(fmt(t.sessions), 'Workouts', 'Not counting the daily walks')}
    ${tileCard(fmt(t.thisMonth), 'This month', esc(dateText(today, { month: 'long' })))}
    ${tileCard(L.streakInfo(state, today).current, 'Weeks in a row', 'At half the plan or more')}
  </div>
  ${challengesCard(today)}
  ${sectionHead('Weight goals')}
  ${weightTiles(ms)}
  ${milestoneList(ms)}`;
}

// Weeks in a row at half the plan, with freezes that cover a missed week and badges at 4, 12, 26, 52 and 104 weeks.
function streakCard() {
  const s = L.streakInfo(state, todayISO());
  const flakes = Array.from({ length: L.FREEZE_MAX }, (_, i) => `<span class="flake${i < s.freezes ? ' on' : ''}">${icon('snowflake')}</span>`).join('');
  const badges = L.STREAK_BADGES.map((n) => {
    const got = s.earned.includes(n);
    return `<li class="badge${got ? ' on' : ''}" aria-label="${n} weeks, ${got ? 'earned' : 'not yet'}">${icon(got ? 'medal' : 'lock-simple')}<span class="num">${n}</span></li>`;
  }).join('');
  const note = s.freezes === L.FREEZE_MAX ? 'Freezes full. A missed week uses one, no harm done.'
    : s.freezes ? `${plural(s.freezes, 'freeze', 'freezes')} left. A missed week uses one. Four good weeks in a row earn one back.`
    : 'No freezes left. A missed week now ends the streak. Four good weeks in a row earn one back.';
  return `<section class="card streak" aria-label="Week streak">
    <div class="streak-top"><div><p class="streak-cap">Week streak</p><p class="streak-num num">${icon('flame')}${s.current}</p></div>
      <div class="streak-side"><p class="streak-best">Best: <span class="num">${s.best}</span></p><p class="flakes" aria-label="${plural(s.freezes, 'freeze', 'freezes')} of ${L.FREEZE_MAX}">${flakes}</p></div></div>
    <ul class="badges">${badges}</ul>
    ${s.next ? `<div class="streak-next"><span>Next badge at ${s.next} weeks.</span><span class="num">${s.current} / ${s.next}</span></div>${minibar(s.current, s.next, 'win', 300)}` : '<p class="streak-next"><span>Every badge is earned.</span></p>'}
    <p class="streak-note">${note}</p>
  </section>`;
}

function challengesCard(today) {
  const list = L.monthlyChallenges(state, today);
  const done = list.filter((c) => c.done).length;
  return `<section class="card challenges">
    <div class="cell-head"><span class="cell-main"><span class="cell-sub">Challenges</span><span class="cell-title">${esc(dateText(today, { month: 'long', year: 'numeric' }))}, ${done} of ${list.length} done</span></span></div>
    <div class="ch-list">${list.map((c) => `<div class="ch-row"><div class="cell-main"><span class="cell-title">${esc(c.title)}</span><span class="cell-sub num">${Math.min(c.value, c.target)} of ${c.target}</span></div>${c.done ? `<span class="accessory done">${icon('check-circle')}</span>` : ''}${minibar(c.value, c.target, 'win', 300)}</div>`).join('')}</div>
  </section>`;
}

// The last 12 weeks (tap a square) or 12 months as a grid, one square a day, shaded by exercise minutes or by the weight lifted.
function activityCard() {
  const today = todayISO();
  const year = ui.heatRange === 'year';
  const weeks = year ? 52 : 12;
  const vol = ui.heatMetric === 'volume';
  const g = L.activityGrid(state, today, weeks, ui.heatMetric);
  const tipOf = (c) => `${dateText(c.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${vol ? (c.vol ? `${fmt(c.vol)} kg lifted` : 'no lifting') : (c.min ? `${c.min} min of exercise` : 'no exercise logged')}`;
  const cell = (c) => (c.future ? '<span class="heat-cell future"></span>' : year ? `<span class="heat-cell l${c.level}" data-m="${c.date.slice(0, 7)}" data-n="${(vol ? c.vol : c.min) || 0}" data-unit="${vol ? 'kg lifted' : 'min of exercise'}"></span>` : `<button class="heat-cell l${c.level}" data-tip="${esc(tipOf(c))}" aria-label="${esc(tipOf(c))}"></button>`);
  const at = Object.fromEntries(g.months.map((m) => [m.col, m.month]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels = g.cols.map((_, i) => `<span class="heat-month">${at[i] && (year || i < weeks - 1) ? MONTHS[at[i] - 1] : ''}</span>`).join('');
  return `${sectionHead('Activity', g.counted ? `${g.active} of ${g.counted} days` : '')}
  ${segmented('heat-metric', [['time', 'Time'], ['volume', 'Volume']], ui.heatMetric, 'Shade by')}
  <section class="card heat-card" aria-label="Activity for the last ${year ? '12 months' : '12 weeks'}, shaded by ${vol ? 'weight lifted' : 'exercise minutes'}">
    <div class="heat-months${year ? ' y' : ''}" aria-hidden="true">${labels}</div>
    <div class="heat${year ? ' y' : ''}">${g.cols.map((col) => col.map(cell).join('')).join('')}</div>
    <div class="heat-foot"><div class="heat-range" role="group" aria-label="Range">${[['12w', '12 weeks'], ['year', '12 months']].map(([k, label]) => `<button class="chip-btn small" data-act="heat-range" data-id="${k}" aria-pressed="${(year ? 'year' : '12w') === k}">${label}</button>`).join('')}</div>
      <div class="heat-legend" aria-hidden="true"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<i class="heat-cell l${l}"></i>`).join('')}<span>More</span></div></div>
    ${foot(year ? 'One column a week, Monday at the top. Switch to 12 weeks to tap a day.' : `Weeks of ${esc(short(g.cols[0][0].date))} to ${esc(short(g.cols[weeks - 1][0].date))}, one column a week, Monday at the top. Tap a square for its numbers.`)}
  </section>`;
}

function recentCard(today) {
  const list = L.recentWorkouts(state, today);
  if (!list.length) return `${sectionHead('Recent workouts')}${foot('Your logged workouts show here, with a trophy on each one that beat an earlier weight.')}`;
  return `${sectionHead('Recent workouts')}
  <div class="group">${list.map((r) => `<button class="cell cell-button" data-act="open-session" data-id="${esc(r.id)}" data-date="${r.date}">
    <span class="tile effort">${icon(SESSIONS[r.id] ? sessionIcon(SESSIONS[r.id]) : 'barbell')}</span>
    <div class="cell-main"><div class="cell-title">${esc(r.name)}</div><div class="cell-sub">${esc(dateText(r.date, { weekday: 'short', day: 'numeric', month: 'short' }))}, ${duration(r.min)}${r.sets ? `, ${plural(r.sets, 'set', 'sets')}` : ''}${r.kg ? `, ${fmt(Math.round(r.kg))} kg` : ''}</div></div>
    ${r.prs ? `<span class="pr" aria-label="${plural(r.prs, 'record', 'records')}">${icon('trophy')}${r.prs} ${r.prs === 1 ? 'best' : 'bests'}</span>` : ''}<span class="accessory">${icon('caret-right')}</span></button>`).join('')}</div>`;
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
  const stat = (label, value, bar = '') => `<div class="cell${bar ? ' meter-cell' : ''}"><div class="cell-main"><div class="cell-title">${label}</div></div><span class="cell-value">${value}</span>${bar}</div>`;
  // Rows with a target show the week as a bar, as Train does; no bar without data or a target.
  const bar = (value, target, kind) => (value != null && target > 0 ? minibar(value, target, kind, 300) : '');
  return `${sectionHead('Body weight', `<button class="btn btn-gray btn-sm" data-act="weigh-open">${icon('plus')}Log weight</button>`)}
  ${segmented('weight-range', [['1M', '1 month'], ['3M', '3 months'], ['1Y', '1 year'], ['All', 'All']], ui.weightRange, 'Weight chart range')}
  ${weightChart()}
  ${sectionHead('This week')}
  ${weekInsights(today)}
  <div class="group">
    ${stat('Sessions done', `${wk.done} of ${wk.planned}`, bar(wk.done, wk.planned, 'effort'))}
    ${stat('Exercise minutes', `${wk.exMin}${pos.before ? '' : ` of ${pos.block.targets.exMin}`}`, bar(wk.exMin, pos.before ? 0 : pos.block.targets.exMin, 'effort'))}
    ${stat('Lifted in total', `${fmt(L.totals(state, today).liftedKg)} kg`)}
    ${stat('Training load', `${fmt(wk.load)} (RPE × min)`)}
    ${stat('Average steps', wk.stepsAvg != null ? fmt(wk.stepsAvg) : 'no data')}
    ${stat('Food logged', `${wk.daysLogged} of 7 days`, bar(wk.daysLogged, 7, 'gray'))}
    ${stat('Average eaten', wk.kcalAvg != null ? `${fmt(wk.kcalAvg)} of ${fmt(tg.kcal)} kcal${wk.kcalAvg > tg.kcal ? `, ${fmt(wk.kcalAvg - tg.kcal)} over` : ''}` : 'no data', bar(wk.kcalAvg, tg.kcal, wk.kcalAvg > tg.kcal ? 'fuel-over' : 'fuel'))}
    ${stat('Average protein', wk.proteinAvg != null ? `${wk.proteinAvg} of ${tg.protein} g` : 'no data', bar(wk.proteinAvg, tg.protein, 'fuel'))}
    ${stat('Average water', wk.waterAvg != null ? `${litres(wk.waterAvg)} of ${litres(wk.waterTargetAvg)} L` : 'no data', bar(wk.waterAvg, wk.waterTargetAvg, 'water'))}
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
  ${vo2Chart()}
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
  return `${sectionHead('For your doctor')}
  ${segmented('report-days', [['28', '1 month'], ['91', '3 months'], ['182', '6 months'], ['start', 'All']], ui.reportDays, 'Period of the summary')}
  <div class="group"><button class="cell cell-action" data-act="doctor-pdf">${icon('export')}<span>Share as PDF</span></button></div>
  ${foot('The summary fits on one page: weight, blood pressure, blood tests, waist, training and food. Blood tests and the waist show the latest results, whatever the period. The file stays on this phone until you share it.')}
  ${sectionHead('Blood tests')}
  <div class="group">
    <div class="cell"><span class="tile info">${icon('test-tube')}</span><div class="cell-main"><div class="cell-title">Next blood test</div><div class="cell-sub">${esc(dateText(lab))}${toLab >= 0 ? `, in ${plural(toLab, 'day', 'days')}` : ''}. Ask for fasting glucose, HbA1c, lipids and uric acid.</div></div></div>
    ${dateRow('Change the date', 'data-act="next-lab"', lab)}
  </div>
  <div class="group">${LABS.map(labRow).join('')}</div>
  ${labs.length ? '' : foot('No results yet. Add your last checkup, or import the checkup file from the Mac in Settings, Data and backup.')}
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
    </div>${formError('lab-error')}<button class="btn-start" type="submit">Save results</button></form></div>`;
}

// ---------- More, setup ----------
// The native date field shows dd/mm/yyyy; it sits invisibly over a row that shows the date as the rest of the app writes it.
function dateRow(label, attrs, value) {
  const text = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? dateText(value, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Pick a date';
  return `<label class="cell field date-row"><span class="field-label">${label}</span><span class="date-text">${esc(text)}</span><input type="date" ${attrs} value="${esc(value || '')}"></label>`;
}

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
      ${row(p ? 'Start weight' : 'Weight now', 'startWeight', 'kg', 'inputmode="decimal" required placeholder="Required"')}
      ${row('Resting heart rate', 'rhr', 'bpm', 'inputmode="numeric" placeholder="From Health"')}
      ${dateRow('Plan starts', 'name="startDate" required', d.startDate)}
    </div>
    ${foot(`${p ? 'Progress counts your milestones from the start weight, so log new weigh-ins on Today. ' : ''}The plan always starts on a Monday. Resting heart rate is in the Health app under Heart.`)}
    <details class="plain"><summary>${icon('caret-right')}Set your own targets</summary>
      ${foot(esc(auto))}
      <div class="group">
        ${row('Calories a day', 'kcalTarget', 'kcal', 'inputmode="numeric" placeholder="Automatic"')}
        ${row('Protein a day', 'proteinTarget', 'g', 'inputmode="numeric" placeholder="Automatic"')}
        ${row('Water base', 'waterBase', 'ml', 'inputmode="numeric" placeholder="2500"')}
        ${row('Max heart rate', 'maxHr', 'bpm', 'inputmode="numeric" placeholder="Automatic"')}
        ${row('Goal weight', 'goalWeight', 'kg', 'inputmode="decimal" placeholder="Automatic"')}
        ${row('VO2max target', 'vo2Target', 'mL/kg/min', 'inputmode="decimal" placeholder="Optional"')}
      </div>
    </details>
    ${p ? foot('Changes save as you go.') : '<button class="btn-start" type="submit">Start the plan</button>'}
  </form>`;
}

function viewSetup() {
  const feature = (ic, kind, title, text) => `<div class="feature"><span class="tile ${kind} tile-lg">${icon(ic)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`;
  let unreadable = null;
  try { unreadable = localStorage.getItem(`${KEY}.unreadable`); } catch { /* storage blocked */ }
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
  ${unreadable ? callout('warning', '<p><strong>Steady could not read the log on this phone.</strong> It kept a copy. Share the copy as a file to keep it safe before you start again, or import a backup at the bottom.</p><button class="btn btn-fill btn-sm" data-act="unreadable-share">Share the copy</button>', 'warn') : ''}
  ${sectionHead('About you')}
  ${profileForm(null)}
  <p class="center-foot">Moving phones? <label class="link">Import a backup<input type="file" accept=".json,application/json" data-act="import-backup" hidden></label></p>`;
}

const SETTINGS_PAGES = ['profile', 'train', 'alerts', 'reminders', 'look', 'data', 'about'];
const THEMES = [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']];
function settingsRow(page, ic, kind, title, value) {
  return `<button class="cell cell-button" data-act="settings-page" data-id="${page}"><span class="tile ${kind}">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${title}</div></div><span class="cell-value">${esc(value)}</span><span class="accessory">${icon('caret-right')}</span></button>`;
}

function viewSettings() {
  const p = state.profile;
  const st = state.settings;
  const rem = st.reminders || {};
  const action = (act, ic, kind, title, extra = '') => `<button class="cell cell-button" data-act="${act}"><span class="tile ${kind}">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${title}</div></div>${extra}<span class="accessory">${icon('caret-right')}</span></button>`;
  const fileRow = (act, ic, kind, title) => `<label class="cell cell-button"><span class="tile ${kind}">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${title}</div></div><span class="accessory">${icon('caret-right')}</span><input type="file" accept=".json,application/json" data-act="${act}" hidden></label>`;
  const page = ui.settingsPage;
  const back = (label) => `<div class="back-row"><button class="back" data-act="${page ? 'settings-page' : 'settings-close'}" data-id="">${icon('caret-left')}<span>${label}</span></button></div>`;
  if (!page) {
    const on = (st.reminders && Object.values(st.reminders).filter((r) => r.on !== false).length) || REMINDERS.length;
    return `${back(ui.tab === 'today' ? 'Today' : TABS.find((t) => t[0] === ui.tab)?.[1] ?? 'Back')}
    ${nav('Settings')}
    <div class="group"><button class="cell cell-button settings-me" data-act="settings-page" data-id="profile"><span class="tile gray">${icon('user-circle')}</span><div class="cell-main"><div class="cell-title">You and your targets</div><div class="cell-sub">${p ? `${p.age} years, ${p.heightCm} cm, from ${p.startWeight} kg` : ''}</div></div><span class="accessory">${icon('caret-right')}</span></button></div>
    <div class="group">
      ${settingsRow('train', 'barbell', 'effort', 'Training', st.train === 'rotation' ? 'Rotation' : 'Fixed week')}
      ${settingsRow('alerts', 'speaker-high', 'fuel', 'Timer alerts', `${st.loudBeep ? 'Beep on silent' : 'Quiet'}, flash`)}
    </div>
    <div class="group">
      ${settingsRow('reminders', 'bell', 'water', 'Reminders', plural(on, 'reminder', 'reminders'))}
      ${settingsRow('look', 'palette', 'info', 'Look', THEMES.find((t) => t[0] === (st.theme || 'auto'))[1])}
    </div>
    <div class="group">
      ${settingsRow('data', 'cloud-arrow-up', 'water', 'Data and backup', state.lastBackup ? `Backed up ${short(state.lastBackup)}` : 'Never backed up')}
      ${settingsRow('about', 'info', 'gray', 'About', `Version ${APP_VERSION}`)}
    </div>`;
  }
  const titles = { profile: 'You and your targets', train: 'Training', alerts: 'Timer alerts', reminders: 'Reminders', look: 'Look', data: 'Data and backup', about: 'About' };
  const content = {
    profile: () => `${profileForm(p)}`,
    train: () => `<div class="group"><div class="cell how-train"><span class="tile fuel">${icon('repeat')}</span><span class="cell-title">How you train</span>${segmented('train-mode', [['fixed', 'Fixed week'], ['rotation', 'Rotation']], (st.train === 'rotation') ? 'rotation' : 'fixed', 'How you train')}</div></div>
  ${foot(st.train === 'rotation' ? 'Today shows the next session of the week you have not done, whatever weekday it was planned for. Nothing counts as missed.' : 'The same sessions on the same weekdays, every week.')}`,
    alerts: () => `${sectionHead('Gym alerts')}
  <div class="group"><label class="cell switch-cell"><span class="tile fuel">${icon('speaker-high')}</span><span class="cell-main"><span class="cell-title">Beep on silent</span><span class="cell-sub">This can pause your music</span></span><input type="checkbox" class="switch" switch data-act="setting" data-k="loudBeep" ${st.loudBeep ? 'checked' : ''}></label></div>
  ${foot(`The screen also flashes when rest ends and at each interval change, and it stays on during a session. ${esc(WATCH_ALERT)}`)}
  ${sectionHead('Hot months')}
  <div class="card months">${MONTHS.map((m, i) => `<label class="month"><input type="checkbox" data-act="hot-month" data-n="${i + 1}" ${(st.hotMonths || []).includes(i + 1) ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
  ${foot('In these months, Today and the session screens remind you to train indoors or in the cool of the day.')}`,
    reminders: () => `<div class="group">${REMINDERS.map((r) => `<div class="cell switch-cell"><span class="cell-main"><span class="cell-title">${esc(r.label.split(',')[0])}</span><span class="cell-sub">${esc(r.label.split(', ').slice(1).join(', '))}</span></span>
    <input type="time" class="time" data-act="rem-time" data-id="${r.id}" value="${esc(rem[r.id]?.time || r.time)}" aria-label="Time for ${esc(r.label)}">
    <input type="checkbox" class="switch" switch data-act="rem-on" data-id="${r.id}" ${rem[r.id]?.on === false ? '' : 'checked'} aria-label="${esc(r.label)}"></div>`).join('')}
    ${action('ics', 'calendar-plus', 'effort', 'Add to Calendar')}
    ${action('ics-save', 'export', 'gray', 'Save the calendar file')}
  </div>
  ${foot('Web apps on iPhone cannot send their own reminders, so these go into Calendar as repeating events with an alert. Tap Add All when they appear. If nothing opens, save the file and open it from Files. To change them later, delete the Steady events in Calendar and add them again.')}`,
    look: () => `${sectionHead('Theme')}
  ${segmented('theme', THEMES, st.theme || 'auto', 'Theme')}
  ${foot('Automatic follows the phone. Light and dark stay as you set them, whatever the phone does.')}`,
    data: () => `<div class="group">
    ${action('export-open', 'cloud-arrow-up', 'water', 'Export backup', `<span class="cell-value">${state.lastBackup ? esc(short(state.lastBackup)) : 'Never'}</span>`)}
    ${fileRow('import-backup', 'arrow-clockwise', 'gray', 'Import backup')}
    ${fileRow('import-data', 'watch', 'effort', 'Import Watch or checkup file')}
    ${action('shortcut-help', 'clipboard-text', 'fuel', 'iPhone shortcuts')}
  </div>
  ${foot(`Everything stays in this app's storage on this phone${ui.persisted ? ', and the phone has agreed to keep it' : ''}. Watch numbers come in with the Steady Watch shortcut: run it, then tap Paste from Watch on Today. A Watch or checkup file from the Mac still imports here, and keeps the numbers you typed in.`)}`,
    about: () => `${sectionHead('How the numbers work')}
  <div class="card prose"><ul class="prose-list">
    <li>Calorie limit: resting energy (Mifflin-St Jeor) times 1.375, minus 550. It drops as your weight drops. After 4 weeks, Progress can replace it with your real burn.</li>
    <li>Protein: 1.3 g per kg of adjusted body weight. Fibre: 30 g.</li>
    <li>Water: the base plus 500 ml for every 30 exercise minutes, from the Watch or your logged sessions, whichever is higher.</li>
    <li>Notes at the top of Progress: a training day has 30 or more exercise minutes or a logged session other than the post-meal walks. A day with no Watch minutes and no session counts as neither a training nor a rest day. Today is left out until it is over.</li>
    <li>Heart rate ranges: 30, 40, 60 and 80% of heart-rate reserve.</li>
    <li>Weight trend: each weigh-in pulls it part of the way, about half when you weigh in once a week and more after a longer gap, so one heavy morning moves it less than the scale does. The rate per week is a straight line through the last 4 weeks of the trend.</li>
    <li>Milestones: 5%, 8% and 10% below your start weight. The plan line on the weight chart reaches them at 12, 26 and 52 weeks. The goal is the last of them unless you set your own, and none goes under a BMI of 18.5.</li>
    <li>The plan holds a week when a week comes in under half, and every fourth week from week 16 is easier.</li>
    <li>Meal values are estimates for the portions in each recipe.</li>
  </ul></div>
  ${sectionHead('Stop and check')}
  <div class="card prose"><ul class="prose-list">${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
  <div class="group">${action('whats-new', 'sparkle', 'water', "What's new")}</div>
  <div class="group danger-group"><button class="cell cell-action danger" data-act="reset">${icon('trash')}<span>Delete all data</span></button></div>
  ${foot('Icons by Phosphor Icons, MIT licence. Exercise drawings from Workout Guide by Bryl Lim, some traced from Everkinetic, under CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0), shown in black in light mode and dimmed to 85% brightness in dark mode. Full credits for them are in img/ex/LICENSE.txt. Thai dish values from the Thai Food Composition Database (INMU, Mahidol University, 2025), the Thai Department of Health food tables (2008 and 2018) and a Bangkok delivery food study (IJERPH, 2023).')}`,
  }[page]();
  return `${back('Settings')}
  ${nav(titles[page])}
  ${content}`;
}

function sheetShortcuts() {
  return `<div class="sheet">${sheetHead('iPhone shortcuts')}
    ${sectionHead('Steady Watch', 'Health into Steady')}<div class="card prose"><ol class="steps">${SHORTCUT_IN.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    ${sectionHead('Steady to Health', 'Steady into Health')}<div class="card prose"><ol class="steps">${SHORTCUT_OUT.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>
    ${foot('Shortcuts menus differ a little between iOS versions. If a name does not match exactly, pick the closest one.')}</div>`;
}
function sheetChanges(seen) {
  const cards = L.changesSince(CHANGES, seen).map((c, i) => `${sectionHead(i ? 'Earlier' : 'This update')}
    <div class="card prose"><ul class="prose-list">${c.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('');
  return `<div class="sheet">${sheetHead("What's new")}${cards}</div>`;
}
function sheetPaste(text = null) {
  return `<div class="sheet">${sheetHead('Paste Watch numbers')}
    ${foot(text == null ? 'The phone did not let Steady read the clipboard. Long-press the box, tap Paste, then Use these numbers.' : 'Steady read this from the clipboard but could not use it. Run the Steady Watch shortcut again, or fix the text and tap Use these numbers.')}
    <form data-form="paste"><div class="card"><textarea name="text" rows="5" aria-label="Pasted numbers" aria-describedby="paste-error">${esc(text ?? '')}</textarea></div>
    <p class="section-foot form-error" id="paste-error" role="alert"></p>
    <button class="btn-start" type="submit">Use these numbers</button></form></div>`;
}
function sheetCopy(title, note, text) {
  return `<div class="sheet">${sheetHead(title)}
    ${foot(note)}
    <div class="card"><textarea rows="4" readonly aria-label="${title}">${esc(text)}</textarea></div></div>`;
}
function sheetExport() {
  return `<div class="sheet">${sheetHead('Export a backup')}
    <form data-form="export">
      ${foot('The file holds your weight, food, training and health checks. Add a passcode if it will sit in Files, iCloud or a chat. Without the passcode nobody can open it, including you.')}
      <div class="group">
        <label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Passcode</span><input type="password" name="pass" autocomplete="new-password" placeholder="Optional"></label>
        <label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Again</span><input type="password" name="pass2" autocomplete="new-password" placeholder="Optional"></label>
      </div>
      ${formError('export-error')}
      <button class="btn-start" type="submit">Export</button>
    </form></div>`;
}
function sheetWeigh() {
  const d = ui.date;
  const last = L.weighIns(state).filter(([x]) => x <= d).at(-1);
  return `<div class="sheet">${sheetHead('Weigh in')}
    <form data-form="weigh">
      <div class="card weigh">
        <button type="button" class="btn btn-gray num" data-act="weigh-step" data-n="-0.1" aria-label="0.1 kg less">−0.1</button>
        <label class="weigh-num"><input name="kg" inputmode="decimal" value="${(last?.[1] ?? state.profile.startWeight).toFixed(1)}" autocomplete="off" aria-label="Weight in kg" aria-describedby="weigh-error"><span class="big-unit">kg</span></label>
        <button type="button" class="btn btn-gray num" data-act="weigh-step" data-n="0.1" aria-label="0.1 kg more">+0.1</button>
      </div>
      <p class="sr-only" id="weigh-said" aria-live="polite"></p>
      ${formError('weigh-error')}
      ${foot(`${esc(dateText(d))}. ${last ? `Last weigh-in ${esc(short(last[0]))}: ${last[1].toFixed(1)} kg.` : `Start: ${state.profile.startWeight.toFixed(1)} kg.`}${state.days[d]?.weight ? ' Clear the number and save to remove this weigh-in.' : ''}`)}
      <button class="btn-start" type="submit">Save</button>
    </form></div>`;
}
// Asked before a workout when a weigh-in is due: the weight, then the workout starts. It can be skipped or the workout swapped for another.
function sheetCheckIn() {
  const last = L.weighIns(state).filter(([x]) => x <= todayISO()).at(-1);
  const start = Math.round((last?.[1] ?? state.profile.startWeight) * 10) / 10;
  return `<div class="sheet">${sheetHead('Quick check-in')}
    ${foot('Tap the number to type it, or use the 0.1 steps. Once a week keeps your trend honest.')}
    <form data-form="checkin">
      <div class="card weigh">
        <button type="button" class="btn btn-gray num" data-act="weigh-step" data-n="-0.1" aria-label="0.1 kg less">−0.1</button>
        <label class="weigh-num"><input name="kg" inputmode="decimal" value="${start.toFixed(1)}" autocomplete="off" aria-label="Weight in kg" aria-describedby="weigh-error"><span class="big-unit">kg</span></label>
        <button type="button" class="btn btn-gray num" data-act="weigh-step" data-n="0.1" aria-label="0.1 kg more">+0.1</button>
      </div>
      <p class="sr-only" id="weigh-said" aria-live="polite"></p>
      ${formError('weigh-error')}
      <button class="btn-start" type="submit">Save &amp; start workout</button>
    </form>
    <div class="check-links"><button class="btn btn-plain btn-wide" data-act="checkin-skip">Start without weighing in</button>
      <button class="btn btn-plain btn-wide" data-act="checkin-other">${icon('arrows-left-right')}Choose a different workout</button></div></div>`;
}
function sheetUnlock() {
  return `<div class="sheet">${sheetHead('Open a protected backup')}
    <form data-form="unlock"><div class="group"><label class="cell field"><span class="tile gray">${icon('lock-simple')}</span><span class="field-label">Passcode</span><input type="password" name="pass" required autocomplete="current-password"></label></div>
    ${formError('unlock-error')}<button class="btn-start" type="submit">Open</button></form></div>`;
}

// ---------- Sheet, tooltip, toast ----------
let sheetReturn = null;
function showSheet(html) {
  const s = $('#sheet');
  guardTap = tapAt; // the sheet comes up under the finger, and the second tap of a double tap would land on it or its backdrop
  s.classList.remove('closing');
  s.style.transform = '';
  s.innerHTML = html;
  if (!s.open) {
    sheetReturn = keyOf(document.activeElement);
    s.showModal();
    const t = $('#sheet-title'); // the first button would take focus, and its ring would sit on Close
    if (t) { t.tabIndex = -1; t.focus({ preventScroll: true }); }
  }
}
// The sheet slides back down the way it came, then empties and hands focus back to what opened it.
function closeSheet() {
  const s = $('#sheet');
  if (!s.open || s.classList.contains('closing')) return;
  guardTap = tapAt; // the page comes back under the finger, and a slow second tap would land on whatever is there
  s.classList.add('closing');
  s.firstElementChild.inert = true; // nothing in it takes a tap or a key on the way down, so Save cannot run twice
  const done = (e) => {
    // The backdrop's fade ends first and reports on the dialog too, and Safari gives it no pseudoElement name,
    // so wait for the property only the sheet animates: its slide, or its fade under Reduce Motion.
    if (e && (e.target !== s || e.propertyName !== (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'opacity' : 'transform'))) return;
    s.removeEventListener('transitionend', done);
    clearTimeout(timer);
    if (!s.classList.contains('closing')) return; // reopened on the way down; a closing sheet takes no drag
    s.classList.remove('closing');
    s.close();
    s.innerHTML = '';
    // What opened the sheet can be gone, as Finish is once the session is saved, so focus falls back to the page.
    ((sheetReturn && document.querySelector(sheetReturn)) || $('#main')).focus({ preventScroll: true });
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
// A meal row slides left to show Swap. A drag that starts on the title or the Log button still swipes, and the tap that follows it is dropped.
let swipedAt = 0;
function swipeRow(e) {
  const front = e.target.closest?.('.swipe-front');
  if (!front || !e.isPrimary || e.button > 0) return;
  const row = front.parentElement;
  const W = row.querySelector('.swipe-act').offsetWidth;
  const was = row.classList.contains('open');
  document.querySelectorAll('.swipe-row.open').forEach((r) => { if (r !== row) { r.classList.remove('open'); r.querySelector('.swipe-front').style.transform = ''; } });
  const x0 = e.clientX, y0 = e.clientY;
  let axis = null, last = 0, trail = [[e.timeStamp, 0]];
  const base = new DOMMatrixReadOnly(getComputedStyle(front).transform).m41; // caught mid-slide, it carries on from where it is
  const move = (m) => {
    if (m.pointerId !== e.pointerId) return;
    const dx = m.clientX - x0, dy = m.clientY - y0;
    if (!axis && Math.abs(dx) + Math.abs(dy) > 8) axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (axis !== 'x') return;
    row.classList.add('drag');
    const raw = base + dx;
    const x = raw > 0 ? rubberband(raw, W) : raw < -W ? -W - rubberband(-W - raw, W) : raw;
    front.style.transition = 'none';
    front.style.transform = `translateX(${x}px)`;
    last = x;
    trail = [...trail.slice(-4), [m.timeStamp, x]];
  };
  const up = (u) => {
    if (u.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    front.style.transition = '';
    row.classList.remove('drag');
    if (axis === 'x') {
      swipedAt = u.timeStamp;
      // Velocity over the last 100 ms, so a row held still before letting go settles by position alone.
      const recent = trail.filter(([t]) => u.timeStamp - t <= 100);
      const v = recent.length > 1 ? (recent.at(-1)[1] - recent[0][1]) / Math.max(1, recent.at(-1)[0] - recent[0][0]) : 0;
      const open = u.type === 'pointerup' && (v < -0.3 || (v < 0.3 && last < -W / 2));
      row.classList.toggle('open', open);
      front.style.transform = '';
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

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
  let moved = false;
  const move = (m) => {
    if (m.pointerId !== e.pointerId) return; // a second finger does not take over the drag
    if (!moved && Math.abs(m.clientY - start) > 8) { moved = true; if (s.contains(document.activeElement)) document.activeElement.blur(); } // the keyboard goes down with the sheet
    s.style.transform = `translateY(${at(m.clientY)}px)`;
    trail = [...trail.slice(-4), [m.timeStamp, m.clientY]];
  };
  const up = (u) => {
    if (u.pointerId !== e.pointerId) return;
    s.removeEventListener('pointermove', move);
    s.removeEventListener('pointerup', up);
    s.removeEventListener('pointercancel', up);
    // Velocity over the last 100 ms up to the release, so a finger that stopped before lifting throws nothing.
    const recent = [...trail, [u.timeStamp, u.clientY]].filter(([t]) => u.timeStamp - t <= 100);
    const [t0, y0] = recent[0];
    const [t1, y1] = recent.at(-1);
    s.style.transition = '';
    if (u.type === 'pointerup' && at(u.clientY) + project((y1 - y0) / Math.max(1, t1 - t0)) > h / 2) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) s.style.setProperty('transform', s.style.transform, 'important'); // fade out where it was let go
      closeSheet();
    }
    else s.style.transform = '';
  };
  s.addEventListener('pointermove', move);
  s.addEventListener('pointerup', up);
  s.addEventListener('pointercancel', up);
}

// ---------- Edge swipe back ----------
// As on iOS, a drag from a session's left edge pulls it aside over the screen it came from.
let swipe = null;
const pushedParts = () => [$('#main > .pushed'), $('#rest')]; // looked up each time, as a render can replace them
const onScreen = () => new DOMMatrixReadOnly(getComputedStyle(swipe.under).transform).m41 + innerWidth; // swipe.x is the target mid-settle
function swipeTo(x) {
  const w = innerWidth;
  const [page, dim] = swipe.under.children;
  for (const el of pushedParts()) if (el) el.style.transform = `translate3d(${x}px, 0, 0)`;
  // The screen behind starts 30% to the left, where a push leaves it.
  swipe.under.style.transform = `translateX(${x - w}px)`;
  page.style.transform = `translate(${0.7 * (w - x)}px, ${-(back?.y ?? 0)}px)`;
  dim.style.opacity = 0.1 * (1 - x / w);
  swipe.x = x;
}
function swipeEase(ms) {
  const t = ms ? `transform ${ms}ms var(--ease), opacity ${ms}ms var(--ease)` : 'none';
  for (const el of [...pushedParts(), swipe.under, ...swipe.under.children]) if (el) el.style.transition = t;
}
function settle(to, v) {
  const { x } = swipe;
  // var(--ease) starts at 2.5 times its average speed, so this duration hands the finger's speed on to the screen.
  const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0
    : Math.round(Math.min(350, Math.max(160, (2.5 * Math.abs(to - x)) / Math.max(0.5, Math.sign(to - x) * v))));
  swipeEase(ms);
  swipeTo(to);
  const done = () => {
    swipe.under.remove();
    if (!to) rings = swipe.rings; // a cancelled swipe has not shown the numbers, so Back still rolls them
    swipe = null;
    for (const el of pushedParts()) el?.removeAttribute('style');
    if (to && ui.screen === 'session') ACT['close-session']();
  };
  if (ms) swipe.timer = setTimeout(done, ms + 50);
  else done();
}
// A render mid-swipe drew new parts: they go where the old ones are on screen, and a settle starts again from there.
function reswipe() {
  if (!swipe.timer) return swipeTo(swipe.x);
  const to = swipe.x;
  const x = onScreen();
  clearTimeout(swipe.timer);
  swipeEase(0);
  swipeTo(x);
  void document.body.offsetWidth; // so the new parts move on from there rather than jump
  settle(to, 0);
}
// Zoomed in, a sideways drag must pan the view, so the edge swipe and its touch-action rule step aside; 1.01 allows for rounding.
const zoomed = () => document.documentElement.toggleAttribute('data-zoomed', window.visualViewport?.scale > 1.01);
window.visualViewport?.addEventListener('resize', zoomed);
zoomed();
let pressAt = null;
document.addEventListener('pointerdown', (e) => {
  // A press during a slide lands on the page root: it ends the slide, and the click handler passes its click on.
  pressAt = sliding && [e.clientX, e.clientY];
  sliding?.skipTransition();
  if (ui.screen !== 'session' || $('#sheet').open || !e.isPrimary || e.button > 0 || zoomed()) return;
  if (!e.target.closest?.('#main') && e.target !== document.body && e.target !== document.documentElement) return;
  const at = { id: e.pointerId, x0: e.clientX, y0: e.clientY, trail: [[e.timeStamp, e.clientX]] };
  if (swipe?.under) {
    if (!swipe.timer) return;
    // Caught on its way: it carries on from where it is on screen.
    clearTimeout(swipe.timer);
    const x = onScreen();
    Object.assign(swipe, at, { timer: null, from: x });
    swipeEase(0);
    swipeTo(x);
    $('#main').setPointerCapture(e.pointerId);
    return;
  }
  swipe = e.clientX < 20 ? { ...at, from: 0 } : null;
});
document.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id || swipe.timer) return;
  const dx = e.clientX - swipe.x0;
  if (!swipe.under) {
    const dy = e.clientY - swipe.y0;
    if (Math.hypot(dx, dy) < 10) return;
    if (Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; } // a scroll, which stays with the page
    swipe.under = document.createElement('div');
    swipe.under.className = 'under';
    swipe.under.inert = true;
    swipe.under.innerHTML = `<main>${VIEWS[ui.tab]()}</main><div class="under-dim"></div>`;
    swipe.rings = rings;
    rollRings(swipe.under); // its numbers roll here as on a pop, so the screen that lands does not roll them again
    document.body.append(swipe.under);
    swipeEase(0);
    $('#main').setPointerCapture(e.pointerId);
  }
  const x = swipe.from + dx;
  swipeTo(x < 0 ? -rubberband(-x, innerWidth) : x);
  swipe.trail = [...swipe.trail.slice(-4), [e.timeStamp, e.clientX]];
});
const swipeEnd = (e) => {
  if (!swipe || e.pointerId !== swipe.id || swipe.timer) return;
  if (!swipe.under) { swipe = null; return; } // a tap, or a scroll the page took over
  // Velocity over the last 100 ms up to the release, as for the sheet.
  const recent = [...swipe.trail, [e.timeStamp, e.clientX]].filter(([t]) => e.timeStamp - t <= 100);
  const [t0, x0] = recent[0];
  const [t1, x1] = recent.at(-1);
  const v = (x1 - x0) / Math.max(1, t1 - t0);
  // The drag, or a tap that caught the screen, still ends in a click, which must not act; the next press is a new tap.
  const stop = (c) => { c.stopPropagation(); c.preventDefault(); };
  const off = () => window.removeEventListener('click', stop, true);
  window.addEventListener('click', stop, { capture: true, once: true });
  window.addEventListener('pointerdown', off, { capture: true, once: true });
  setTimeout(off, 300);
  settle(e.type === 'pointerup' && swipe.x + project(v) > innerWidth / 3 ? innerWidth : 0, v);
};
document.addEventListener('pointerup', swipeEnd);
document.addEventListener('pointercancel', swipeEnd);

function showTip(el, e) {
  const tip = $('#tip');
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(8, e.clientX - r.width / 2), window.innerWidth - r.width - 8)}px`;
  const below = e.clientY - r.height - 14 < 8;
  tip.style.top = `${below ? e.clientY + 18 : e.clientY - r.height - 14}px`;
  tip.style.transformOrigin = below ? '50% 0' : '50% 100%';
}
function hideTip() {
  $('#tip').hidden = true;
}
// A tap or a sideways drag over the activity grid reads the nearest square; in the year view the squares are too small, so a tap reads that square's whole month.
function heatTip(e) {
  const g = e.target.closest?.('.heat');
  if (!g) return false;
  const cells = [...g.children].filter((x) => x.dataset.tip || x.dataset.m);
  let best = null, gap = Infinity;
  for (const x of cells) {
    const r = x.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (r.left + r.right) / 2, e.clientY - (r.top + r.bottom) / 2);
    if (d < gap) { gap = d; best = x; }
  }
  if (!best) return false;
  if (best.dataset.tip) { showTip(best, e); return true; }
  const days = cells.filter((x) => x.dataset.m === best.dataset.m);
  const total = days.reduce((t, x) => t + Number(x.dataset.n), 0);
  const active = days.filter((x) => Number(x.dataset.n) > 0).length;
  const box = document.createElement('span');
  box.dataset.tip = `${dateText(`${best.dataset.m}-01`, { month: 'long', year: 'numeric' })}: ${active ? `${plural(active, 'active day', 'active days')}, ${fmt(total)} ${best.dataset.unit}` : 'no activity'}`;
  showTip(box, e);
  return true;
}
document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && !e.buttons) return;
  heatTip(e);
});
let toastTimer = null, toastHide = null;
// The toast waits while VoiceOver or a keyboard is on it, and while the app is in the background.
const toastRestart = () => { clearTimeout(toastTimer); if (toastHide) toastTimer = setTimeout(toastHide, 6000); };
$('#toast').addEventListener('focusin', () => clearTimeout(toastTimer));
$('#toast').addEventListener('focusout', toastRestart);
document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(toastTimer) : toastRestart()));
let toastLater = null;
function toast(msg, undo = false, typing = false) {
  const err = !undo && $('#sheet[open]:not(.closing) .form-error'); // the open sheet covers the toast
  if (err) {
    if (err.textContent !== msg) err.textContent = msg;
    else { err.textContent = ''; requestAnimationFrame(() => { err.textContent = msg; }); } // the same words again are only read out if they change
    return;
  }
  // A modal sheet makes the page under it inert, so VoiceOver would not hear the toast; it shows once the sheet has closed.
  const s = $('#sheet');
  if (s.open) {
    if (!toastLater) s.addEventListener('close', () => { const a = toastLater; toastLater = null; toast(...a); }, { once: true });
    toastLater = [msg, undo, typing];
    return;
  }
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="btn btn-sm toast-undo" data-act="undo">Undo</button>' : ''}`;
  t.classList.toggle('has-btn', undo);
  t.classList.add('show');
  undoLive = undo && !!undoSnap;
  clearTimeout(toastTimer);
  const hide = () => {
    t.classList.remove('show', 'has-btn');
    if (undo) { undoSnap = null; undoLive = false; }
    toastHide = null;
    setTimeout(() => { if (!t.classList.contains('show')) t.textContent = ''; }, 300); // after the fade, so no dead Undo is left for VoiceOver
  };
  toastHide = hide;
  // Only a toast raised while typing waits: the phone keyboard hides it, so its 6 seconds start once no field has focus; the first look waits, as the next field takes focus only after the change event.
  const wait = () => { toastTimer = document.activeElement?.matches?.('#main input') ? setTimeout(wait, 300) : setTimeout(hide, 6000); };
  toastTimer = typing ? setTimeout(wait, 300) : setTimeout(hide, undo ? 6000 : 2200);
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
    // Closed, or a second tap while the share sheet was opening (only one share runs at a time): not a refusal.
    if (e.name === 'AbortError' || e.name === 'InvalidStateError') return false;
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
const startedAt = (a) => { const t = new Date(a.start); return `${short(L.iso(t))} at ${t.toTimeString().slice(0, 5)}`; };
function finishSheet() {
  const s = currentSession();
  // A session left running would put its whole clock in the box, past what Save accepts, so the plan's minutes go there.
  const left = L.leftRunning(state.active, Date.now());
  const mins = left ? s.minutes : Math.max(1, Math.round(L.activeMs(state.active, Date.now()) / 60000));
  const rpe = DEFAULT_RPE[s.effort] ?? 5;
  return `<div class="sheet">${sheetHead(`Finish ${esc(s.name)}`)}
    <form data-form="finish">
      <div class="group"><label class="cell field"><span class="tile effort">${icon('timer')}</span><span class="field-label">Minutes</span><input name="min" inputmode="numeric" value="${mins}" required autocomplete="off" aria-describedby="finish-error"><span class="unit">min</span></label></div>
      ${left ? foot(`The timer has run since ${esc(startedAt(state.active))}, so this shows the planned ${s.minutes} minutes. Change it to how long you trained.`) : ''}
      ${formError('finish-error')}
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
function summarySheet(s, w, date) {
  const planned = w.ex.reduce((t, e) => t + e.planned, 0);
  const sets = w.ex.reduce((t, e) => t + e.sets, 0);
  const up = L.heavierLifts(state, w.ex, date);
  const next = L.nextSession(state, todayISO());
  const row = (ic, label, value) => `<div class="cell"><span class="tile effort">${icon(ic)}</span><div class="cell-main"><div class="cell-title">${label}</div></div><span class="cell-value num">${value}</span></div>`;
  return `<div class="sheet">${sheetHead(`${esc(s.name)} saved`)}
    <svg class="success" viewBox="0 0 56 56" aria-hidden="true"><path pathLength="1" d="M28 3a25 25 0 1 1 0 50a25 25 0 1 1 0-50"/><path pathLength="1" d="M17 29l7.5 7.5L39 22"/></svg>
    <div class="group">${row('timer', 'Minutes', `${fmt(w.min)} min`)}${row('flame', 'Effort', `RPE ${w.rpe}`)}${planned ? row('list-checks', 'Sets done', `${sets} of ${planned}`) : ''}</div>
    ${up.length ? `${sectionHead('Heavier than last time')}<div class="group">${up.map((x) => row('barbell', esc(exName(x.id)), `${x.was} to ${x.kg} kg`)).join('')}</div>` : ''}
    ${next ? `${sectionHead('Next session')}<div class="group"><div class="cell"><span class="tile effort">${icon(sessionIcon(next.session))}</span><div class="cell-main"><div class="cell-title">${esc(next.session.name)}</div><div class="cell-sub">${esc(dateText(next.date))}, ${next.session.minutes} min</div></div></div></div>` : ''}
    <button class="btn-start" data-act="sheet-close">Done</button></div>`;
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
  // A toast is gone before these can be read, so they go in the paste sheet's alert line, opened on the clipboard text if need be.
  const fail = (msg) => { if (!$('#sheet[open] #paste-error')) showSheet(sheetPaste(text)); $('#paste-error').textContent = msg; };
  try {
    const data = L.parseWatchPaste(text, ui.date);
    snapshot();
    const n = L.mergeWatch(state, data, 'shortcut', todayISO());
    if (!n) return fail('Those numbers are out of range. Check the shortcut against the instructions in Settings, Data and backup, iPhone shortcuts.');
    save(); closeSheet(); render();
    toast(`Added Watch numbers for ${plural(n, 'day', 'days')}`, true);
  } catch (e) {
    fail(e.message);
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
    if (ui.tab === 'food') ui.foodScroll = ui.food === 'menu' && ui.foodWeek === 'this';
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
    Object.assign(ui, undoTimers);
    if (state.active) wake(true); // a discarded session that comes back keeps the screen on again
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
    const { date, key, slot } = el.dataset;
    // Opened from a meal row, the sheet also offers Swap, for anyone who does not swipe.
    const swap = date && key ? `<div class="group actions-group"><button class="cell cell-action" data-act="swap-open" data-date="${esc(date)}" data-key="${esc(key)}" data-slot="${esc(slot)}">${icon('arrows-left-right')}<span>Swap this meal</span></button></div>` : '';
    showSheet(`<div class="sheet">${sheetHead(esc(m.name))}${swap}<div class="card prose recipe">${recipeBody(m)}</div></div>`);
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
  'move-open': () => showSheet(sheetMove()),
  'train-view': (el) => { ui.trainView = el.dataset.id; render(); },
  'ex-part': (el) => { ui.exPart = el.dataset.id; render(); },
  'ex-new': () => showSheet(sheetExNew()),
  'ex-detail': (el) => showSheet(sheetExDetail(el.dataset.id)),
  'ex-add': (el) => {
    const a = state.active;
    if (!a || !SESSIONS[a.id]?.exercises) return toast('Start a strength workout first, then add it.');
    const id = el.dataset.id;
    const here = [...SESSIONS[a.id].exercises, ...(a.extra || [])].map((e) => e[0]);
    if (here.includes(id)) return toast(`${exName(id)} is already in this workout.`);
    snapshot();
    a.extra = [...(a.extra || []), defaultSlot(id)];
    save();
    closeSheet();
    render();
    toast(`Added ${exName(id)} to ${SESSIONS[a.id].name}`, true);
  },
  'ex-extra-del': (el) => {
    const a = state.active;
    if (!a?.extra?.length || Number(el.dataset.i) !== SESSIONS[a.id].exercises.length + a.extra.length - 1) return;
    snapshot();
    a.extra = a.extra.slice(0, -1);
    delete a.log[el.dataset.i];
    save();
    render();
    toast('Removed from this workout', true);
  },
  'ex-del': (el) => {
    snapshot();
    state.customEx = (state.customEx || []).filter((x) => x.id !== el.dataset.id);
    save();
    closeSheet();
    render();
    toast('Exercise deleted. Past logs keep their numbers.', true);
  },
  'train-mode': (el) => { state.settings.train = el.dataset.id === 'rotation' ? 'rotation' : 'fixed'; save(); render(); },
  'plan-open': (el) => showSheet(sheetPlan(el.dataset.date)),
  'plan-walks': (el) => { closeSheet(); ACT['open-session'](el); },
  'plan-add': (el) => {
    const { id, date } = el.dataset;
    snapshot();
    state.extras = [...(state.extras || []).filter((x) => !(x.id === id && x.date === date)), { id, date }].slice(-60);
    save();
    closeSheet();
    render();
    toast(`Added ${SESSIONS[id].name} to ${dateText(date, { weekday: 'long' })}`, true);
  },
  'extra-del': () => {
    const { date, id } = ui.session;
    snapshot();
    state.extras = (state.extras || []).filter((x) => !(x.id === id && x.date === date));
    save();
    ACT['close-session']();
    toast('Taken off this day', true);
  },
  'ex-swap-open': (el) => {
    if (state.active?.sets?.[Number(el.dataset.i)]) return; // sets are already ticked for this one
    showSheet(sheetExSwap(Number(el.dataset.i)));
  },
  'ex-swap-set': (el) => {
    const i = Number(el.dataset.i);
    const { id } = ui.session;
    const orig = SESSIONS[id].exercises[i][0];
    if (!isActive(ui.session.date, id) || state.active.sets?.[i]) return closeSheet();
    snapshot();
    const swap = { ...(state.active.swap || {}) };
    if (el.dataset.id === orig) delete swap[i]; else swap[i] = el.dataset.id;
    state.active.swap = swap;
    delete state.active.log[i]; // the typed weight and reps belonged to the other exercise
    ui.hold = ui.hold?.i === i ? null : ui.hold;
    save();
    closeSheet();
    render();
    toast(el.dataset.id === orig ? `Back to ${EXERCISES[orig].name}` : `Swapped for ${EXERCISES[el.dataset.id].name}`, true);
  },
  'move-to': (el) => {
    const { date, id } = ui.session;
    const to = el.dataset.date;
    snapshot();
    state.moves = L.applyMove(state.moves || [], id, date, to);
    save();
    closeSheet();
    // The session is no longer on this day, so the screen goes back to the list it came from.
    ACT['close-session']();
    toast(`Moved to ${dateText(to, { weekday: 'long' })}`, true);
  },
  exclude: (el) => {
    snapshot();
    state.excluded = [...new Set([...(state.excluded || []), el.dataset.id])];
    save();
    closeSheet();
    render();
    toast('Not suggested any more', true);
  },
  include: (el) => {
    const at = [...document.querySelectorAll('#main [data-act="include"]')].indexOf(el);
    snapshot();
    state.excluded = (state.excluded || []).filter((id) => id !== el.dataset.id);
    save();
    render();
    // The button goes with its row, so focus moves to the next Suggest again, or to the Menu chip once none is left.
    const rest = document.querySelectorAll('#main [data-act="include"]');
    (rest[at] ?? rest[at - 1] ?? $('#main [data-act="food-sec"][data-id="menu"]'))?.focus({ preventScroll: true });
    toast('Suggested again', true);
  },
  'add-food-open': () => openAddFood(slotNow()),
  'add-to': (el) => openAddFood(el.dataset.slot),
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
    back = { y: window.scrollY, key: keyOf(el) };
    ui.session = { date: el.dataset.date || ui.date, id: el.dataset.id };
    ui.screen = 'session';
    ui.rest = null;
    ui.hold = null;
    slide('push', () => render(true));
  },
  // An edge swipe calls this with no button once it has moved the screens itself, so then nothing slides.
  'close-session': (el) => {
    ui.screen = ui.tab;
    ui.rest = null;
    ui.hold = null;
    if (!state.active) wake(false);
    slide(el && 'pop', () => {
      render(true);
      window.scrollTo(0, back?.y ?? 0);
      (back?.key && $(back.key))?.focus({ preventScroll: true });
    });
  },
  start: () => {
    if (checkInDue()) return showSheet(sheetCheckIn());
    begin();
  },
  'checkin-skip': () => {
    ui.checkinSkipped = todayISO();
    closeSheet();
    begin();
  },
  'checkin-other': () => {
    closeSheet();
    ACT['close-session']();
  },
  'walk-log': (el) => {
    rw(el.dataset.date).workouts.push({ id: 'walks', name: SESSIONS.walks.name, min: 10, rpe: DEFAULT_RPE.easy, hr: null, note: '', t: clock(), ex: [] });
    save();
    render();
    toast('Walk logged');
  },
  'quick-log': (el) => {
    if (el.dataset.id) ui.session = { date: el.dataset.date, id: el.dataset.id };
    const s = currentSession();
    snapshot();
    logWorkout(s.id, Number(el.dataset.n), DEFAULT_RPE[s.effort] ?? 5, null, '', strengthLog(s, null));
    save();
    render();
    // The Log button on a Today row goes once the session is logged, so focus moves to the row, which stays.
    if (el.dataset.id) $(`#main [data-act="open-session"][data-id="${el.dataset.id}"][data-date="${el.dataset.date}"]`)?.focus({ preventScroll: true });
    toast('Logged', true);
  },
  set: (el) => {
    const i = Number(el.dataset.i), k = Number(el.dataset.k);
    const note = startOver();
    unlockAudio();
    const held = ui.hold?.i === i && ui.hold.k === k;
    ui.hold = null;
    // A timed set runs its hold first; a tap during the hold ticks it straight away.
    if (!held && k >= (state.active.sets[i] ?? 0) && L.repSpec(currentSession().exercises[i][2]).unit === 's') startHold(i, k);
    else tickSet(i, k);
    if (note) toast(note, true);
  },
  'hold-done': () => {
    const h = ui.hold;
    ui.hold = null;
    if (!h || !state.active) return;
    tickSet(h.i, h.k);
    focusSet(h.i, h.k); // the redraw replaced the Done button, so focus stays with the set just done
  },
  rest: (el) => {
    unlockAudio();
    const held = ui.hold;
    ui.hold = null;
    // A rest ends a pause of this session too, so it never counts down while the clock stands still.
    const paused = isActive(ui.session.date, ui.session.id) && state.active.pausedAt;
    if (paused) {
      L.setPaused(state.active, false, Date.now());
      save();
    }
    ui.rest = { until: Date.now() + Number(el.dataset.sec) * 1000, beeped: false, i: Number(el.dataset.i) };
    if (held || paused) render();
    else tick();
  },
  'rest-skip': () => {
    ui.rest = null;
    tick();
  },
  pause: () => {
    const a = state.active;
    L.setPaused(a, !a.pausedAt, Date.now());
    // Nothing should count down or beep during a pause.
    if (a.pausedAt) {
      ui.rest = null;
      ui.hold = null;
    }
    save();
    render();
  },
  // Resume on Today means carry on, so it ends a pause as well as opening the session.
  resume: (el) => {
    L.setPaused(state.active, false, Date.now());
    save();
    ACT['open-session'](el);
  },
  'flash-hide': () => { $('#flash').hidden = true; },
  finish: () => {
    if (!state.active) return;
    // Today's callout can finish the running session from any screen, so point the sheet at it.
    ui.session = { date: state.active.date, id: state.active.id };
    showSheet(finishSheet());
  },
  rpe: (el) => {
    el.closest('form').elements.rpe.value = el.dataset.n;
    pressSegment(el);
  },
  discard: () => {
    snapshot();
    state.active = null;
    ui.rest = null;
    ui.hold = null;
    save();
    wake(false);
    closeSheet();
    render();
    toast('Session discarded', true);
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
  'food-sec': (el) => { ui.food = el.dataset.id; ui.foodScroll = el.dataset.id === 'menu'; render(); },
  'food-week': (el) => { ui.foodWeek = el.dataset.id; ui.foodScroll = false; render(); },
  'progress-view': (el) => { ui.progress = el.dataset.id; render(); },
  'weight-range': (el) => { ui.weightRange = el.dataset.id; render(); },
  'weight-table': () => { ui.weightTable = !ui.weightTable; render(); },
  'heat-metric': (el) => { ui.heatMetric = el.dataset.id; render(); },
  'heat-range': (el) => { ui.heatRange = el.dataset.id; render(); },
  'shop-clear': () => {
    snapshot();
    delete state.shopping[foodMonday()];
    save();
    render();
    toast('Unticked', true);
  },
  // share() runs straight from the tap, before anything async, because Safari only allows it during the gesture.
  'shop-share': () => {
    const monday = foodMonday();
    const title = `Shopping for the week of ${short(monday)}`;
    const text = L.shoppingText(state, monday, title);
    const copy = () => showSheet(sheetCopy('Shopping list', 'The phone did not let Steady share. Select the text and copy it into Notes or Messages.', text));
    if (!navigator.share) return copy();
    navigator.share({ title, text }).catch((e) => { if (e.name !== 'AbortError' && e.name !== 'InvalidStateError') copy(); });
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
  'report-days': (el) => {
    ui.reportDays = el.dataset.id;
    pressSegment(el);
  },
  // Built inside the tap with nothing awaited first: iOS opens the share sheet only while the tap still counts.
  'doctor-pdf': () => {
    const today = todayISO();
    const from = ui.reportDays === 'start' ? state.profile.startDate : L.addDays(today, 1 - Number(ui.reportDays));
    shareFile(`steady-summary-${today}.pdf`, 'application/pdf', summaryPdf(L.doctorSummary(state, from, today), today));
  },
  'watch-seen': () => { state.settings = { ...state.settings, watchSeen: true }; save(); render(); },
  go: () => {
    if (state.active) return ACT['open-session']({ dataset: { id: state.active.id, date: state.active.date } });
    const today = todayISO();
    const ss = sessionsOn(today);
    const next = ss.find((x) => x.kind !== 'rest' && x.id !== 'walks' && !state.days[today]?.workouts?.some((w) => w.id === x.id)) ?? ss.find((x) => x.kind !== 'rest' && !state.days[today]?.workouts?.some((w) => w.id === x.id));
    if (!next) { ui.tab = ui.screen = 'train'; ui.week = null; return render(true); }
    ACT['open-session']({ dataset: { id: next.id, date: today } });
  },
  'settings-open': () => { ui.screen = 'settings'; ui.settingsPage = null; slide('push', () => render(true)); },
  'settings-close': () => { ui.screen = ui.tab; ui.settingsPage = null; slide('pop', () => render(true)); },
  'settings-page': (el) => { const to = el.dataset.id || null; ui.settingsPage = to; slide(to ? 'push' : 'pop', () => render(true)); },
  theme: (el) => { state.settings.theme = el.dataset.id; save(); applyTheme(); render(); },
  'weigh-open': () => showSheet(sheetWeigh()),
  'weigh-step': (el) => {
    const input = el.closest('form').elements.kg;
    const v = dec(input.value) ?? dec(input.defaultValue);
    input.value = (Math.round((v + Number(el.dataset.n)) * 10) / 10).toFixed(1);
    const slide = el.closest('form').elements.slide;
    if (slide) slide.value = input.value;
    $('#weigh-said').textContent = `${input.value} kg`; // focus stays on the button, so the new number is read out from here
  },
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
      showSheet(sheetCopy('Totals for Health', 'The phone did not let Steady copy. Select the text, copy it, then run the Steady to Health shortcut.', text));
    }
  },
  'shortcut-help': () => showSheet(sheetShortcuts()),
  'whats-new': () => showSheet(sheetChanges(state.seenVersion)),
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
  'unreadable-share': () => shareFile(`steady-unreadable-${todayISO()}.json`, 'application/json', localStorage.getItem(`${KEY}.unreadable`) ?? ''),
  'update-now': () => {
    ui.updating = true;
    swReg?.waiting?.postMessage('skip');
  },
  reset: () => {
    // This asks first instead of offering Undo: it replaces all the data, more than an in-memory Undo can promise back.
    if (!confirm('Delete everything in Steady on this phone? Export a backup first if you might want it back.')) return;
    localStorage.removeItem(KEY);
    localStorage.removeItem(`${KEY}.unreadable`);
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
  const started = !isActive(ui.session.date, ui.session.id);
  const note = startOver();
  const i = Number(el.dataset.i);
  state.active.log[i] = { ...(state.active.log[i] ?? {}), [key]: value };
  save();
  if (started || (key === 'kg' && state.active.sets?.[i])) renderWhenIdle(); // the session running, or the New best line, once the keyboard is done
  if (note) toast(note, true, true);
}

const CHANGE = {
  watch: (el) => {
    const day = rw(ui.date);
    day.watch = { ...(day.watch ?? {}), [el.dataset.k]: int(el.value), src: 'manual' };
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
  profile: (f, auto = false) => {
    const g = (k) => f.elements[k]?.value;
    const p = {
      ...(state.profile || {}),
      sex: g('sex') === 'f' ? 'f' : 'm', age: int(g('age')), heightCm: dec(g('heightCm')), startWeight: dec(g('startWeight')),
      rhr: int(g('rhr')), startDate: g('startDate'), kcalTarget: int(g('kcalTarget')), proteinTarget: int(g('proteinTarget')),
      waterBase: int(g('waterBase')) || 2500, maxHr: int(g('maxHr')),
      goalWeight: dec(g('goalWeight')), vo2Target: dec(g('vo2Target')),
    };
    const bad = (!p.age || p.age < 15 || p.age > 90) ? 'Enter your age in years.'
      : (!p.heightCm || p.heightCm < 120 || p.heightCm > 230) ? 'Enter your height in centimetres.'
      : (!p.startWeight || p.startWeight < 35 || p.startWeight > 350) ? 'Enter your weight in kg.'
      : (p.rhr != null && (p.rhr < 35 || p.rhr > 110)) ? 'Resting heart rate should be between 35 and 110.'
      : !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate || '') ? 'Pick the date the plan starts.'
      : (p.kcalTarget != null && (p.kcalTarget < 1200 || p.kcalTarget > 5000)) ? 'A calorie limit under 1,200 or over 5,000 is not safe to use here.'
      : (p.goalWeight != null && (p.goalWeight < 35 || p.goalWeight > 350)) ? 'Enter the goal weight in kg.'
      : (p.goalWeight != null && p.goalWeight < L.minWeight(p.heightCm)) ? `For your height, a goal under ${(Math.ceil(L.minWeight(p.heightCm) * 10) / 10).toFixed(1)} kg is below a healthy weight.`
      : (p.goalWeight != null && p.goalWeight >= p.startWeight) ? 'Set a goal weight below your start weight.'
      : (p.vo2Target != null && (p.vo2Target < 10 || p.vo2Target > 90)) ? 'Enter a VO2max target between 10 and 90.'
      : null;
    if (bad) return toast(bad);
    p.startDate = L.mondayOf(p.startDate);
    const first = !state.profile;
    if (state.profile && state.profile.startDate !== p.startDate) {
      state.repeats = [];
      state.skipHolds = [];
      state.autoHolds = [];
      state.holdChecked = null;
    }
    state.profile = p;
    if (first) state.seenVersion = APP_VERSION; // a new user has nothing to compare What's new with
    L.applyHolds(state, todayISO());
    save();
    if (first) ui.screen = ui.tab = 'today';
    if (!auto) render(true); // a field saved on blur keeps the screen where it is
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
    if (!min || min > 600) return toast('Enter the minutes, up to 600.');
    const hr = int(f.elements.hr.value);
    const s = currentSession();
    const { date } = ui.session;
    logWorkout(state.active.id, min, Number(f.elements.rpe.value), hr && hr >= 40 && hr <= 230 ? hr : null, f.elements.note.value.trim().slice(0, 200), strengthLog(s, state.active));
    state.active = null;
    ui.rest = null;
    ui.hold = null;
    save();
    wake(false);
    render();
    showSheet(summarySheet(s, state.days[date].workouts.at(-1), date));
    // The form that had focus is gone, so move focus to the new title, which also reads it out.
    const title = $('#sheet-title');
    title.tabIndex = -1;
    title.focus();
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
  weigh: (f) => {
    const v = dec(f.elements.kg.value);
    if (v != null && (v < 30 || v > 400)) return toast('Enter the weight in kg, like 82.5');
    if (v == null && !state.days[ui.date]?.weight) return closeSheet(); // nothing to save and nothing to remove
    snapshot();
    const day = rw(ui.date);
    if (v == null) delete day.weight;
    else day.weight = Math.round(v * 10) / 10;
    save();
    closeSheet();
    render();
    toast(v == null ? 'Weigh-in removed' : `Saved ${day.weight.toFixed(1)} kg`, true);
  },
  exnew: (f) => {
    const name = f.elements.name.value.trim();
    if (!name) return toast('Give the exercise a name.');
    if ([...Object.values(EXERCISES), ...(state.customEx || [])].some((x) => norm(x.name) === norm(name))) return toast(`There is already an exercise called ${name}.`);
    snapshot();
    const part = BODY_PARTS.includes(f.elements.part.value) ? f.elements.part.value : 'Full body';
    state.customEx = [...(state.customEx || []), { id: `x${Date.now().toString(36)}`, name: name.slice(0, 60), part, unit: f.elements.unit.value === 's' ? 's' : 'reps' }].slice(-60);
    ui.exPart = 'Mine';
    save();
    closeSheet();
    render();
    toast(`Added ${name}`, true);
  },
  checkin: (f) => {
    const v = dec(f.elements.kg.value);
    if (v == null || v < 30 || v > 400) return toast('Enter the weight in kg, like 82.5');
    snapshot();
    rw(todayISO()).weight = Math.round(v * 10) / 10;
    save();
    closeSheet();
    begin();
    toast(`Saved ${(Math.round(v * 10) / 10).toFixed(1)} kg. Have a good session.`, true);
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
    const body = pass ? await busy(f, 'Locking…', () => L.encryptJson(data, pass)) : data;
    if (!f.isConnected || dismissed()) return;
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
      const data = await busy(f, 'Opening…', () => L.decryptJson(ui.pendingFile, f.elements.pass.value));
      if (!f.isConnected || dismissed()) return;
      ui.pendingFile = null;
      closeSheet();
      restoreBackup(data);
    } catch (e) {
      toast(e.message);
    }
  },
};

// A sheet closed during the wait means the user backed out; the finished work must not go on.
const dismissed = () => !$('#sheet').open || $('#sheet').classList.contains('closing');
// A passcode means 250,000 PBKDF2 rounds, a noticeable wait on a phone: the button says what it is doing meanwhile.
async function busy(f, label, work) {
  const b = f.querySelector('[type="submit"]');
  const text = b.textContent;
  const hadFocus = document.activeElement === b;
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  b.textContent = label;
  try {
    return await work();
  } finally {
    b.disabled = false;
    b.removeAttribute('aria-busy');
    b.textContent = text;
    if (hadFocus && b.isConnected) b.focus({ preventScroll: true }); // disabling dropped focus to body
  }
}

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
    // This asks first instead of offering Undo: it replaces all the data, more than an in-memory Undo can promise back.
    if (!confirm('Replace everything in Steady with this backup?')) return;
    // An older backup must not bring back a What's new this phone has already shown.
    state = { ...blank(), ...clean, seenVersion: Math.max(state.seenVersion || 0, clean.seenVersion) };
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
const tabBtn = ([id, label, ic]) => `<button type="button" data-act="tab" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`;
$('.tabs').innerHTML = `${TABS.slice(0, 2).map(tabBtn).join('')}<button type="button" class="tab-go" data-act="go"><span class="go-disc">${icon('play')}</span><span class="go-label">Start</span></button>${TABS.slice(2).map(tabBtn).join('')}`;

// One-shot actions, toggles, remove buttons and forms, the app's idempotency keys: a repeat within 600 ms is the same tap, so a double tap on a button neither switches a toggle back nor removes the row that moves up, and a second tap on Undo or the flash, which stop taking taps, cannot reach what lies under them. Ticks and switches are not guarded. Taps meant to add up, like +250 ml, stay out.
const ONCE = new Set(['plan-add', 'ex-add', 'form:exnew', 'move-to', 'ex-swap-set', 'checkin-skip', 'form:checkin', 'finish', 'quick-log', 'add-food', 'add-recent', 'same-yesterday', 'exclude', 'shop-share', 'doctor-pdf', 'hold-done', 'rest-skip',
  'use-limit', 'log-menu', 'repeat-week', 'pause', 'food-del', 'workout-del', 'health-del', 'include', 'undo', 'flash-hide',
  'log-day', 'shop-clear', 'water-undo', 'swap-set', 'skip-hold', 'discard',
  'form:finish', 'form:quick', 'form:weigh', 'form:paste', 'form:bp', 'form:waist']);
const lastTap = {};
// The key is the button itself, so Log on two different meals in quick succession logs both.
const repeated = (kind, e, key = kind) => {
  if (!ONCE.has(kind)) return false;
  guardTap = tapAt;
  return !L.firstTap(lastTap, key, e.timeStamp);
};
// The second tap of a double tap would act on whatever the first one put there, so near it, for 600 ms, a tap starts no drag, opens no keyboard and clicks nothing.
const ghost = (e) => e.isTrusted && L.sameTap(guardTap, e.timeStamp, e.clientX, e.clientY);
document.addEventListener('pointerdown', (e) => { if (ghost(e)) e.stopPropagation(); }, true);
document.addEventListener('mousedown', (e) => { if (ghost(e)) e.preventDefault(); }, true);

document.addEventListener('click', (e) => {
  if (ghost(e)) {
    e.preventDefault();
    return;
  }
  const press = pressAt;
  pressAt = null;
  if (press && e.target === document.documentElement) {
    // A press made during a slide sends its click to the page root; it goes where the press and release both were.
    const up = document.elementFromPoint(e.clientX, e.clientY);
    let el = document.elementFromPoint(...press);
    while (el && !el.contains(up)) el = el.parentElement;
    tapAt = e.isTrusted && e.detail ? { t: e.timeStamp, x: e.clientX, y: e.clientY } : null;
    resending = true; // the re-sent click keeps this real tap's place for the double-tap guard
    el?.dispatchEvent(new MouseEvent('click', e));
    resending = false;
    return;
  }
  if (!resending) tapAt = e.isTrusted && e.detail ? { t: e.timeStamp, x: e.clientX, y: e.clientY } : null; // a key press or a script's click() has no place
  const tipEl = e.target.closest?.('[data-tip]');
  if (tipEl) showTip(tipEl, e);
  else if (!heatTip(e)) hideTip();
  const sheet = $('#sheet');
  if (e.target === sheet) {
    // A drag of the sheet also ends with a click here, wherever it was let go; only a tap that began on the dimmed page closes.
    if (backdropDown && outside(e, sheet.getBoundingClientRect())) closeSheet();
    return;
  }
  const el = e.target.closest?.('[data-act]');
  // A tap on a .tap label comes back as a click on its hidden switch: that click runs the action, and iOS buzzes for it.
  if (!el || el.matches('input, select, textarea') || e.target.matches('.tap')) return;
  const fn = ACT[el.dataset.act];
  if (fn) {
    e.preventDefault();
    pressed = el.hasAttribute('aria-pressed') ? { key: keyOf(el), was: el.getAttribute('aria-pressed') } : null;
    if (!repeated(el.dataset.act, e, Object.values(el.dataset).join())) fn(el);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches?.('.date-row input') && el.value) el.parentElement.querySelector('.date-text').textContent = dateText(el.value, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const pf = el.closest?.('form[data-form=profile]');
  if (pf && state.profile) SUBMIT.profile(pf, true);
  if (el.matches?.('[data-act]')) CHANGE[el.dataset.act]?.(el);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  // A form whose button is still busy with a passcode takes no second submit.
  if (f.querySelector('[aria-busy="true"]') || repeated(`form:${f.dataset.form}`, e)) return;
  SUBMIT[f.dataset.form]?.(f);
});
// Said once typing pauses, so VoiceOver reads the latest count, not every keystroke's.
let countTimer = null;
const sayCount = (sel, n) => { clearTimeout(countTimer); countTimer = setTimeout(() => { const el = $(sel); if (el) el.textContent = n ? plural(n, 'match', 'matches') : 'Nothing matches'; }, 600); };
document.addEventListener('input', (e) => {
  if (e.target.id === 'ex-q') { ui.exQuery = e.target.value; $('#ex-grid').innerHTML = exCards(); sayCount('#ex-count', $('#ex-grid').querySelectorAll('.ex-card').length); }
  if (e.target.id === 'food-q') { $('#food-list').innerHTML = foodListItems(e.target.value); sayCount('#food-count', $('#food-list').querySelectorAll('[data-act^="add-"]').length); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('input[data-act="watch"], input[data-act^="ex-"]')) e.target.blur();
});
$('#sheet').addEventListener('pointerdown', dragSheet);
document.addEventListener('pointerdown', swipeRow);
// The click that ends a swipe is not a tap on the row.
document.addEventListener('click', (e) => { if (e.timeStamp - swipedAt < 400 && e.target.closest?.('.swipe-front')) { e.stopPropagation(); e.preventDefault(); } }, true);
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
  } else if (state.active && ui.screen === 'today') renderWhenIdle(); // the running session's minutes have moved on
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
// Ask on every launch until granted: WebKit decides by heuristics, grants it to Home Screen apps, and never prompts.
navigator.storage?.persisted?.().then((ok) => ok || navigator.storage.persist?.()).then((ok) => { ui.persisted = !!ok; }).catch(() => {});
if (state.profile && L.applyHolds(state, todayISO()).length) save();
if (state.active) ui.session = { date: state.active.date, id: state.active.id };
render(true);
if (state.profile && state.seenVersion < APP_VERSION) {
  const seen = state.seenVersion;
  state.seenVersion = APP_VERSION;
  save();
  showSheet(sheetChanges(seen));
}
