import * as L from './logic.js';
import { EFFORT, EXERCISES, SESSIONS, BLOCKS, PROGRESSION, MEALS, MENU_NOTE, PREP, FOOD_SAFETY, SHOPPING, EATING_OUT, RULES, SAFETY, SLOTS } from './plan.js';

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
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks', extra: 'Extras' };
const DEFAULT_RPE = { easy: 4, moderate: 5, hard: 7, strength: 7 };
const ICON = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};

let state = load();
const ui = { screen: 'today', tab: 'today', date: todayISO(), week: null, food: 'menu', range: 14, session: null, addSlot: 'lunch', portion: 1, rest: null, phase: -1, persisted: false, onToday: true };
let ticker = null;
let wakeLock = null;
let audio = null;

// ---------- Storage ----------
function blank() {
  return { v: 1, profile: null, days: {}, custom: [], shopping: {}, active: null };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return { ...blank(), ...s };
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
  const parts = ['act', 'id', 'slot', 'ml', 'k', 'i', 'n', 'sec', 'date', 'item'].filter((k) => el.dataset[k] != null);
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

// ---------- Today ----------
function viewToday() {
  const d = ui.date;
  const p = state.profile;
  const day = state.days[d];
  const t = tgt(d);
  const pos = L.planPosition(p.startDate, d);
  const sessions = L.sessionsFor(p.startDate, d);
  const food = L.foodTotals(day);
  const water = L.waterTotal(day);
  const wTarget = L.waterTarget(day, t.waterBase);
  const exDone = L.effortMinutes(day);
  const exPlan = L.plannedMinutes(sessions);
  const isToday = d === todayISO();
  const where = pos.before ? `The plan starts ${dateText(p.startDate)}.` : `Week ${pos.week}, ${pos.block.name.toLowerCase()}.`;
  return `
  <header class="dayhead">
    <button class="icon" data-act="day" data-n="-1" aria-label="Previous day">${ICON.prev}</button>
    <div class="dayhead-text"><h1>${isToday ? 'Today' : esc(dateText(d, { weekday: 'long' }))}</h1>
      <p class="sub">${esc(dateText(d, { day: 'numeric', month: 'long' }))}. ${esc(where)}</p></div>
    <button class="icon" data-act="day" data-n="1" aria-label="Next day">${ICON.next}</button>
  </header>
  ${isToday ? '' : '<p class="dayhead-text"><button class="link" data-act="day" data-n="0">Back to today</button></p>'}
  <section class="gauges" aria-label="Food, water and exercise so far">
    ${gauge('fuel', 'Food', food.kcal, t.kcal, fmt(food.kcal), `of ${fmt(t.kcal)} kcal`)}
    ${gauge('water', 'Water', water, wTarget, `${litres(water)} L`, `of ${litres(wTarget)} L`)}
    ${gauge('effort', 'Exercise', exDone, exPlan, `${exDone} min`, exPlan ? `of ${exPlan} planned` : 'rest day')}
  </section>
  <p class="protein">Protein <strong>${food.p} g</strong> of ${t.protein} g ${minibar(food.p, t.protein, 'fuel')}</p>
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

function beforeStart() {
  return `<div class="note"><p><strong>Before the first Monday</strong></p><ul>
    <li>Update your weight in the Health app, so the Watch calorie and cardio fitness numbers are right.</li>
    <li>Set a Move goal you can close on most days, and raise it when it gets easy.</li>
    <li>Shop from Food, Shopping, then do the Sunday prep.</li>
    <li>Weigh yourself on Monday morning before breakfast and log it below.</li>
  </ul></div>`;
}

function sessionRows(d, sessions, day) {
  if (!sessions.length) return '<p class="sub">Training starts on the plan start date. Week 1 is in the Train tab.</p>';
  return `<ul class="rows">${sessions.map((s) => {
    const done = day?.workouts?.filter((w) => w.id === s.id) ?? [];
    const meta = s.kind === 'rest' ? s.how : `${s.minutes} min, ${EFFORT[s.effort].label.toLowerCase()}${s.reps ? `, ${s.reps} repeats` : ''}`;
    const logged = done.length ? `. Logged ${done.map((w) => `${w.min} min`).join(' and ')}` : '';
    const title = s.kind === 'rest' ? `<div class="row-title">${esc(s.name)}</div>`
      : `<button class="link row-title" data-act="open-session" data-id="${s.id}" data-date="${d}">${esc(s.name)}</button>`;
    const action = s.kind === 'rest' ? ''
      : s.id === 'walks' ? `<button class="btn effort" data-act="walk-log" data-date="${d}" aria-label="Log a 10 minute walk">+10 min</button>`
      : `<button class="btn" data-act="open-session" data-id="${s.id}" data-date="${d}">${done.length ? 'View' : 'Open'}</button>`;
    return `<li>
      <span class="dot ${done.length ? 'on' : ''}" aria-hidden="true"></span>
      <div class="row-main">${title}<div class="row-sub">${esc(meta + logged)}</div></div>
      ${action}
    </li>`;
  }).join('')}</ul>`;
}

function foodToday(d, day) {
  const logged = day?.foods ?? [];
  const planned = L.menuFor(d);
  const t = L.foodTotals(day);
  const blocks = SLOTS.map((slot) => {
    const plan = planned.filter((x) => x.slot === slot);
    const extra = logged.map((f, i) => ({ f, i })).filter(({ f }) => f.slot === slot && !plan.some((x) => x.meal.id === f.ref));
    const rows = [
      ...plan.map(({ meal }) => {
        const on = logged.some((f) => f.ref === meal.id && f.slot === slot);
        return `<li><div class="row-main"><button class="link row-title" data-act="recipe" data-id="${meal.id}">${esc(meal.name)}</button>
          <div class="row-sub">${meal.kcal} kcal, ${meal.p} g protein</div></div>
          <button class="btn fuel" data-act="log-menu" data-slot="${slot}" data-id="${meal.id}" aria-pressed="${on}">${on ? 'Eaten' : 'Log'}</button></li>`;
      }),
      ...extra.map(({ f, i }) => `<li><div class="row-main"><div class="row-title">${esc(f.name)}</div>
          <div class="row-sub">${fmt(f.kcal)} kcal, ${fmt(f.p)} g protein${f.t ? `, ${esc(f.t)}` : ''}</div></div>
          <button class="btn icon" data-act="food-del" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ICON.close}</button></li>`),
    ];
    return `<div class="slot-label">${SLOT_LABEL[slot]}</div><ul class="rows">${rows.join('')}</ul>`;
  }).join('');
  return `${blocks}
    <div class="totals"><span>Logged ${fmt(t.kcal)} kcal, ${t.p} g protein, ${t.fib} g fibre</span></div>
    <div class="actions"><button class="btn primary big" data-act="add-food-open">Add food</button></div>
    <p class="sub">Tap a meal name for the recipe. Anything off-plan goes in with Add food, so the numbers stay honest.</p>`;
}

function watchForm(d, day) {
  const w = day?.watch ?? {};
  const b = L.burn(state, d);
  const bal = L.balance(state, d);
  const field = (k, label) => `<label>${label}<input inputmode="numeric" data-act="watch" data-k="${k}" value="${esc(w[k] ?? '')}" placeholder="0" autocomplete="off"></label>`;
  let text = 'Copy Move calories, exercise minutes and steps from the Fitness app at the end of the day.';
  if (b) {
    text = `Energy out today is about ${fmt(b.total)} kcal: ${fmt(b.rest)} resting, ${fmt(b.move)} from Move${b.estimated ? ' (your recent average)' : ''}, plus digestion.`;
    if (bal != null) text += ` In minus out so far: ${signed(bal)} kcal.`;
  }
  return `<div class="grid3">${field('moveKcal', 'Move kcal')}${field('exMin', 'Exercise min')}${field('steps', 'Steps')}</div>
    <p class="sub">${w.src === 'import' ? 'Filled from your Watch export. ' : ''}${esc(text)}</p>`;
}

function weightForm(d, day) {
  const last = L.weighIns(state).filter(([x]) => x <= d).at(-1);
  return `<div class="grid2"><label>Weight on ${esc(short(d))} (kg)<input inputmode="decimal" data-act="weight" value="${esc(day?.weight ?? '')}" placeholder="${(last?.[1] ?? state.profile.startWeight).toFixed(1)}" autocomplete="off"></label>
    <p class="sub">${last ? `Last weigh-in ${esc(short(last[0]))}: ${last[1].toFixed(1)} kg.` : `Start: ${state.profile.startWeight.toFixed(1)} kg.`} Once a week, same morning, before breakfast.</p></div>`;
}

// ---------- Train ----------
function viewTrain() {
  const p = state.profile;
  const thisMonday = L.mondayOf(todayISO());
  const monday = ui.week || (thisMonday < p.startDate ? p.startDate : thisMonday);
  const pos = L.planPosition(p.startDate, monday);
  const block = pos.before ? BLOCKS[0] : pos.block;
  const wk = L.weekSummary(state, monday);
  const z = L.hrZones(p);
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(monday, i));
  const title = pos.before ? 'Before the plan' : `Week ${pos.week}`;
  return `
  <header class="dayhead">
    <button class="icon" data-act="week" data-n="-7" aria-label="Previous week">${ICON.prev}</button>
    <div class="dayhead-text"><h1>${title}</h1><p class="sub">${esc(short(monday))} to ${esc(short(days[6]))}. ${esc(block.name)}</p></div>
    <button class="icon" data-act="week" data-n="7" aria-label="Next week">${ICON.next}</button>
  </header>
  <p>${esc(block.intro)}</p>
  <div class="meters">
    ${meter('Exercise minutes', wk.exMin, block.targets.exMin, 'effort')}
    ${meter('Strength sessions', wk.strengthDone, block.targets.strength, 'effort')}
    ${meter('Average steps', wk.stepsAvg ?? 0, block.targets.steps, 'effort')}
  </div>
  <ul class="rows week">${days.map((date) => {
    const day = state.days[date];
    const ss = L.sessionsFor(p.startDate, date);
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
  <h2>The plan</h2>
  ${BLOCKS.map((b) => `<h3>${esc(b.name)}, ${b.weeks[1] ? `weeks ${b.weeks[0]} to ${b.weeks[1]}` : `week ${b.weeks[0]} on`}</h3>
    <p>${esc(b.intro)}</p><p class="sub">Targets: ${b.targets.exMin} exercise minutes and ${b.targets.strength} strength ${b.targets.strength > 1 ? 'sessions' : 'session'} a week, ${fmt(b.targets.steps)} steps a day on average.</p>`).join('')}
  <h2>Stop and check</h2>
  <ul>${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
}

// ---------- Session ----------
function currentSession() {
  const { date, id } = ui.session;
  return L.sessionsFor(state.profile.startDate, date).find((x) => x.id === id) || { ...SESSIONS[id], id, minutes: SESSIONS[id].minutes || 30, reps: 5 };
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
  return `
  <div class="sessionhead"><button class="btn" data-act="close-session">${ICON.prev} Back</button></div>
  <h1>${esc(s.name)}</h1>
  <p class="sub">${esc(dateText(date))}. About ${s.minutes} minutes${s.reps && s.id === 'intervals' ? `, ${s.reps} repeats` : ''}.</p>
  <div class="effort-band ${s.effort === 'hard' ? 'hard' : ''}"><strong>${eff.label}</strong>${hr ? `, ${hr}` : ''}. RPE ${eff.rpe}. ${esc(eff.talk)}.</div>
  <p>${esc(s.how)}</p>
  <p class="sub">${esc(s.why)}</p>
  ${otherActive ? `<p class="note">Another session is running (${esc(SESSIONS[state.active.id]?.name ?? '')}). Starting this one discards it.</p>` : ''}
  ${active
    ? `<div class="timerbar"><div><div class="sub">Elapsed</div><div class="timer" id="elapsed">0:00</div></div><button class="btn effort big" data-act="finish">Finish</button></div>`
    : `<div class="actions"><button class="btn effort big" data-act="start">Start</button>${s.kind === 'walk' && s.id === 'walks'
      ? '<button class="btn" data-act="quick-log" data-n="10">Log a 10 min walk</button>'
      : `<button class="btn" data-act="quick-log" data-n="${s.minutes}">Log as planned</button>`}</div>`}
  ${s.id === 'intervals' && active ? '<div class="phase" id="phase"></div>' : ''}
  ${s.id === 'intervals' ? `<p class="sub">Timing: 10 minutes easy, then ${s.reps} rounds of 2 minutes hard and 2 easy, then 5 minutes easy. The timer above calls each change with a beep.</p>` : ''}
  <div id="rest" class="rest" hidden></div>
  ${s.exercises ? `<ul class="exlist">${s.exercises.map(([exId, sets, reps, rest], i) => {
    const ex = EXERCISES[exId];
    const done = active?.sets?.[i] ?? 0;
    return `<li class="ex"><div class="row-title">${i + 1}. ${esc(ex.name)}</div><div class="row-sub">${sets} sets of ${esc(reps)}, ${rest} s rest</div>
      <p class="cue">${esc(ex.cue)}</p><p class="sub">${esc(ex.alt)}</p>
      <div class="sets">${Array.from({ length: sets }, (_, k) => `<button class="setbtn" data-act="set" data-i="${i}" data-k="${k}" aria-pressed="${k < done}" aria-label="Set ${k + 1}">${k + 1}</button>`).join('')}
        <button class="btn" data-act="rest" data-sec="${rest}">Rest ${rest} s</button></div></li>`;
  }).join('')}</ul><p class="sub">${esc(PROGRESSION)}</p>` : ''}
  ${logged.length ? `<h2>Logged</h2><ul class="rows">${logged.map(({ w, i }) => `<li><div class="row-main"><div class="row-title">${w.min} min, RPE ${w.rpe}${w.hr ? `, ${w.hr} bpm` : ''}</div><div class="row-sub">${esc(w.t || '')}${w.note ? `. ${esc(w.note)}` : ''}</div></div>
      <button class="btn icon" data-act="workout-del" data-i="${i}" aria-label="Remove this log">${ICON.close}</button></li>`).join('')}</ul>` : ''}`;
}

function isActive(date, id) {
  return !!state.active && state.active.date === date && state.active.id === id;
}

function intervalPhases(reps) {
  const out = [{ name: 'Warm up, easy', sec: 600, hard: false }];
  for (let i = 1; i <= reps; i++) out.push({ name: `Hard ${i} of ${reps}`, sec: 120, hard: true }, { name: `Easy ${i} of ${reps}`, sec: 120, hard: false });
  out.push({ name: 'Cool down, easy', sec: 300, hard: false });
  return out;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function tick() {
  const a = state.active;
  if (a && ui.session && isActive(ui.session.date, ui.session.id)) {
    const el = $('#elapsed');
    const secs = (Date.now() - a.start) / 1000;
    if (el) el.textContent = mmss(secs);
    const ph = $('#phase');
    if (ph) {
      const phases = intervalPhases(currentSession().reps || 5);
      let t = secs, i = 0;
      while (i < phases.length && t >= phases[i].sec) t -= phases[i++].sec;
      if (i !== ui.phase && ui.phase !== -1) beep(i < phases.length && phases[i].hard ? 3 : 2);
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
      if (!ui.rest.beeped) { ui.rest.beeped = true; beep(2); }
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
const FOOD_SECTIONS = [['menu', 'Menu'], ['recipes', 'Recipes'], ['prep', 'Meal prep'], ['shopping', 'Shopping'], ['out', 'Eating out'], ['rules', 'Rules']];

function viewFood() {
  const body = { menu: foodMenu, recipes: foodRecipes, prep: foodPrep, shopping: foodShopping, out: foodOut, rules: foodRules }[ui.food]();
  return `<h1>Food</h1>
  <div class="seg" role="group" aria-label="Food sections">${FOOD_SECTIONS.map(([k, label]) => `<button data-act="food-sec" data-id="${k}" aria-pressed="${ui.food === k}">${label}</button>`).join('')}</div>
  ${body}`;
}

function recipeBody(m) {
  return `${m.ing.length ? `<h3>You need</h3><ul>${m.ing.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${m.steps.length ? `<h3>${m.where === 'out' ? 'How to order' : 'How to make it'}</h3><ol>${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    <p class="sub">About ${m.kcal} kcal, ${m.p} g protein and ${m.fib} g fibre per portion.</p>`;
}

function foodMenu() {
  const p = state.profile;
  const t = tgt(todayISO());
  const monday = L.mondayOf(todayISO());
  return `<p>Each day comes to about 2,150 to 2,300 kcal and over 140 g of protein. Your limit is ${fmt(t.kcal)} kcal, so there is room for the odd extra.</p>
  <p class="sub">${esc(MENU_NOTE)}</p>
  ${Array.from({ length: 7 }, (_, i) => {
    const date = L.addDays(monday, i);
    const items = L.menuFor(date);
    const tot = L.mealTotals(items.map((x) => x.meal));
    return `<section class="menu-day"><h3><span>${esc(dateText(date, { weekday: 'long' }))}</span><span class="sub">${fmt(tot.kcal)} kcal, ${tot.p} g protein</span></h3>
      <ul class="rows">${items.map(({ slot, meal }) => `<li><div class="row-main"><button class="link row-title" data-act="recipe" data-id="${meal.id}">${esc(meal.name)}</button><div class="row-sub">${SLOT_LABEL[slot]}, ${meal.kcal} kcal</div></div></li>`).join('')}</ul></section>`;
  }).join('')}
  <p class="sub">Plan start: ${esc(dateText(p.startDate))}.</p>`;
}

function foodRecipes() {
  return SLOTS.map((slot) => `<h2>${SLOT_LABEL[slot]}</h2>${MEALS.filter((m) => m.slot === slot).map((m) => `<details><summary><span>${esc(m.name)}</span><span class="sub">${m.kcal} kcal</span></summary><div class="body">${recipeBody(m)}</div></details>`).join('')}`).join('')
    + `<h2>Extras to log honestly</h2><p class="sub">Typical values for common treats and dishes, so they can go in the log in one tap: ${MEALS.filter((m) => m.slot === 'extra').map((m) => `${esc(m.name)} ${m.kcal}`).join(', ')} kcal.</p>`;
}

function foodPrep() {
  return `${PREP.map((p) => `<h2>${esc(p.day)}</h2><p class="sub">${esc(p.time)}. Covers ${esc(p.covers.charAt(0).toLowerCase() + p.covers.slice(1))}.</p><ol>${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`).join('')}
  <h2>Keeping it safe</h2><ul>${FOOD_SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  <p class="sub">No oven? Everything here works in an air fryer, a rice cooker and one large pan.</p>`;
}

function foodShopping() {
  const ticked = Object.keys(state.shopping).length;
  return `<p class="sub">One week of the menu. Tick items as they go in the basket.</p>
  ${SHOPPING.map((g) => `<h3>${esc(g.group)}</h3><ul class="checklist rows">${g.items.map((it) => `<li><label><input type="checkbox" data-act="shop" data-item="${esc(it)}" ${state.shopping[it] ? 'checked' : ''}><span>${esc(it)}</span></label></li>`).join('')}</ul>`).join('')}
  <div class="actions"><button class="btn" data-act="shop-clear" ${ticked ? '' : 'disabled'}>Untick everything</button></div>`;
}

function foodOut() {
  return `<h2>Good choices</h2><ul>${EATING_OUT.good.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  <h2>Now and then</h2><ul>${EATING_OUT.sometimes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
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

function sheetAddFood(query = '') {
  return `<div class="sheet">
    <div class="sheet-head"><h2 id="sheet-title">Add food</h2><button class="icon" data-act="sheet-close" aria-label="Close">${ICON.close}</button></div>
    <div class="seg" role="group" aria-label="Meal">${SLOTS.map((s) => `<button data-act="add-slot" data-slot="${s}" aria-pressed="${ui.addSlot === s}">${SLOT_LABEL[s]}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Portion">${[0.5, 1, 1.5, 2].map((x) => `<button data-act="portion" data-n="${x}" aria-pressed="${ui.portion === x}">${x === 1 ? '1 portion' : `${x} portions`}</button>`).join('')}</div>
    <label>Search<input type="search" id="food-q" placeholder="Meals, extras and your own foods" value="${esc(query)}" autocomplete="off"></label>
    <ul class="rows" id="food-list">${foodListItems(query)}</ul>
    <h3>Something else</h3>
    <form class="grid-quick" data-form="quick">
      <label class="span2">Name<input name="name" required maxlength="80" autocomplete="off"></label>
      <label>kcal<input name="kcal" inputmode="numeric" required autocomplete="off"></label>
      <label>Protein (g)<input name="p" inputmode="numeric" autocomplete="off"></label>
      <label class="check span2"><input type="checkbox" name="fav" checked> Save to my foods</label>
      <button class="btn primary span2" type="submit">Add</button>
    </form>
  </div>`;
}

function foodListItems(query) {
  const q = query.trim().toLowerCase();
  const all = [...state.custom.map((c) => ({ ...c, kind: 'custom' })), ...MEALS.map((m) => ({ ...m, kind: 'meal' }))];
  const list = (q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all).slice(0, 80);
  if (!list.length) return '<li class="sub">Nothing matches. Add it under Something else.</li>';
  return list.map((m) => `<li><div class="row-main"><div class="row-title">${esc(m.name)}</div><div class="row-sub">${fmt(m.kcal)} kcal, ${fmt(m.p)} g protein${m.kind === 'custom' ? ', my food' : ''}</div></div>
    <button class="btn" data-act="add-food" data-kind="${m.kind}" data-id="${esc(m.id)}">Add</button></li>`).join('');
}

// ---------- Progress ----------
const CW = 340, CH = 170, PL = 38, PR = 10, PT = 10, PB = 24;

function niceMax(v, step) {
  return Math.max(step, Math.ceil(v / step) * step);
}
function roundedBar(x, y, w, h, cls, tip) {
  if (h <= 0.5 || w <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `<path class="${cls}" d="M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z"${tip ? ` data-tip="${esc(tip)}"` : ''}/>`;
}
function yAxis(max, step, label) {
  const y = (v) => PT + (CH - PT - PB) * (1 - v / max);
  let s = '';
  for (let v = 0; v <= max + 0.001; v += step) {
    s += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${PL}" x2="${CW - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${label(v)}</text>`;
  }
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
  const hits = rows.map((r, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(`${dateText(r.d, { weekday: 'short', day: 'numeric', month: 'short' })}\nIn: ${r.intake == null ? 'not logged' : `${fmt(r.intake)} kcal`}\nOut: ${r.out == null ? 'no Watch data' : `${fmt(r.out)} kcal`}\nLimit: ${fmt(r.target)} kcal${r.intake != null && r.out != null ? `\nBalance: ${signed(r.intake - r.out)} kcal` : ''}`)}"/>`).join('');
  const outLine = path ? `<path class="l-effort" d="${path}"/>` : '';
  return chartBox('Energy in and out', legend([['sw-fuel', 'Eaten'], ['sw-effort ln', 'Burned (estimate)'], ['dash', 'Your limit']]), `${s}${target}${bars}${outLine}${dots}${xLabels(dates, xAt)}${hits}`);
}

function waterChart(dates) {
  const rows = dates.map((d) => {
    const day = state.days[d];
    return { d, ml: L.waterTotal(day), target: L.waterTarget(day, tgt(d).waterBase) };
  });
  const max = niceMax(Math.max(...rows.flatMap((r) => [r.ml, r.target])) * 1.05, 1000);
  const { y, s } = yAxis(max, 1000, (v) => `${v / 1000} L`);
  const bw = (CW - PL - PR) / dates.length;
  const xAt = (i) => PL + i * bw + bw / 2;
  const bars = rows.map((r, i) => roundedBar(PL + i * bw + 1, y(r.ml), bw - 2, y(0) - y(r.ml), 'm-water')).join('');
  const ticks = rows.map((r, i) => `<line class="t-target" x1="${PL + i * bw + 2}" x2="${PL + (i + 1) * bw - 2}" y1="${y(r.target)}" y2="${y(r.target)}"/>`).join('');
  const hits = rows.map((r, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(`${dateText(r.d, { weekday: 'short', day: 'numeric', month: 'short' })}\nDrank: ${litres(r.ml)} L\nTarget: ${litres(r.target)} L`)}"/>`).join('');
  return chartBox('Water against the target', legend([['sw-water', 'Drank'], ['sw-ink ln', 'Target (rises with exercise)']]), `${s}${bars}${ticks}${xLabels(dates, xAt)}${hits}`);
}

function exerciseChart(mondays) {
  const p = state.profile;
  const rows = mondays.map((m) => {
    const pos = L.planPosition(p.startDate, m);
    return { m, ex: L.weekSummary(state, m).exMin, target: pos.before ? 0 : pos.block.targets.exMin };
  });
  const max = niceMax(Math.max(60, ...rows.flatMap((r) => [r.ex, r.target])) * 1.05, 50);
  const step = max > 200 ? 100 : 50;
  const { y, s } = yAxis(niceMax(max, step), step, (v) => `${v}`);
  const bw = (CW - PL - PR) / mondays.length;
  const xAt = (i) => PL + i * bw + bw / 2;
  const bars = rows.map((r, i) => roundedBar(PL + i * bw + 3, y(r.ex), bw - 6, y(0) - y(r.ex), 'm-effort')).join('');
  const ticks = rows.map((r, i) => (r.target ? `<line class="t-target" x1="${PL + i * bw + 3}" x2="${PL + (i + 1) * bw - 3}" y1="${y(r.target)}" y2="${y(r.target)}"/>` : '')).join('');
  const labels = rows.map((r, i) => `<text class="ax" x="${xAt(i)}" y="${CH - 6}" text-anchor="middle">${esc(short(r.m))}</text>`).filter((_, i) => mondays.length <= 6 || i % 2 === (mondays.length - 1) % 2).join('');
  const hits = rows.map((r, i) => `<rect class="hit" x="${PL + i * bw}" y="${PT}" width="${bw}" height="${CH - PT - PB}" data-tip="${esc(`Week of ${short(r.m)}\nExercise: ${r.ex} min\nTarget: ${r.target || 'none'}${r.target ? ' min' : ''}`)}"/>`).join('');
  return chartBox('Exercise minutes per week', legend([['sw-effort', 'Done'], ['sw-ink ln', 'Weekly target']]), `${s}${bars}${ticks}${labels}${hits}`);
}

function weightChart() {
  const p = state.profile;
  const ins = L.weighIns(state);
  const today = todayISO();
  const startD = p.startDate < (ins[0]?.[0] ?? p.startDate) ? p.startDate : (ins[0]?.[0] ?? p.startDate);
  const lastD = [today, ins.at(-1)?.[0] ?? today].sort().at(-1);
  const endD = [L.addDays(lastD, 14), L.addDays(p.startDate, 84)].sort().at(-1);
  const span = Math.max(1, L.diffDays(startD, endD));
  const goal = L.goalPath(p);
  const goalAt = (d) => {
    for (let i = 1; i < goal.length; i++) {
      if (d <= goal[i][0]) {
        const [d0, w0] = goal[i - 1], [d1, w1] = goal[i];
        const f = Math.max(0, L.diffDays(d0, d)) / L.diffDays(d0, d1);
        return w0 + f * (w1 - w0);
      }
    }
    return goal.at(-1)[1];
  };
  const goalPts = [[startD, goalAt(startD)], ...goal.filter(([d]) => d > startD && d < endD), [endD, goalAt(endD)]];
  const pred = L.predictedWeights(state, today);
  const predOk = pred.length > 7;
  const vals = [...ins.map((x) => x[1]), ...goalPts.map((x) => x[1]), ...(predOk ? pred.map((x) => x[1]) : [])];
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const step = hi - lo > 12 ? 4 : 2;
  const lo2 = Math.floor(lo / step) * step, hi2 = Math.ceil(hi / step) * step;
  const yv = (v) => PT + (CH - PT - PB) * (1 - (v - lo2) / (hi2 - lo2));
  const x = (d) => PL + ((CW - PL - PR) * L.diffDays(startD, d)) / span;
  let s = '';
  for (let v = lo2; v <= hi2; v += step) s += `<line class="grid" x1="${PL}" x2="${CW - PR}" y1="${yv(v)}" y2="${yv(v)}"/><text class="ax" x="${PL - 6}" y="${yv(v) + 4}" text-anchor="end">${v}</text>`;
  for (let i = 0; i <= 3; i++) {
    const d = L.addDays(startD, Math.round((span * i) / 3));
    s += `<text class="ax" x="${x(d)}" y="${CH - 6}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${esc(short(d))}</text>`;
  }
  const line = (pts, cls) => (pts.length > 1 ? `<path class="${cls}" d="${pts.map(([d, v], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${yv(v).toFixed(1)}`).join('')}"/>` : '');
  const dots = ins.map(([d, v]) => `<circle class="d-weight" cx="${x(d)}" cy="${yv(v)}" r="4.5" data-tip="${esc(`${short(d)}: ${v.toFixed(1)} kg\nGoal line: ${goalAt(d).toFixed(1)} kg`)}"/>`).join('');
  const last = ins.at(-1);
  const lbl = last ? `<text class="lbl" x="${Math.min(x(last[0]) + 8, CW - PR - 40)}" y="${yv(last[1]) - 8}">${last[1].toFixed(1)}</text>` : '';
  const keys = [['sw-ink ln', 'Your weigh-ins'], ['dash', 'Goal line'], ...(predOk ? [['sw-pred ln', 'Expected from your log']] : [])];
  return chartBox('Weight', legend(keys), `${s}${line(goalPts, 'l-target')}${predOk ? line(pred, 'l-pred') : ''}${line(ins, 'l-weight')}${dots}${lbl}`);
}

function viewProgress() {
  const p = state.profile;
  const today = todayISO();
  const dates = Array.from({ length: ui.range }, (_, i) => L.addDays(today, i - ui.range + 1));
  const monday = L.mondayOf(today);
  const mondays = Array.from({ length: 8 }, (_, i) => L.addDays(monday, (i - 7) * 7)).filter((m) => L.addDays(m, 6) >= p.startDate || m === monday);
  const wk = L.weekSummary(state, monday);
  const pos = L.planPosition(p.startDate, monday);
  const tg = tgt(today);
  const kgWeek = wk.balance.length >= 3 ? (-wk.balanceAvg * 7) / L.KCAL_PER_KG : null;
  const any = Object.values(state.days).some((d) => d.foods?.length || d.water?.length || d.workouts?.length || d.watch || d.weight);
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  return `<h1>Progress</h1>
  <h2>This week</h2>
  <dl class="stats">
    ${stat('Sessions done', `${wk.done} of ${wk.planned}`)}
    ${stat('Exercise minutes', `${wk.exMin}${pos.before ? '' : ` of ${pos.block.targets.exMin}`}`)}
    ${stat('Training load (RPE x minutes)', fmt(wk.load))}
    ${stat('Average steps', wk.stepsAvg != null ? fmt(wk.stepsAvg) : 'no data')}
    ${stat('Food logged', `${wk.daysLogged} of 7 days`)}
    ${stat('Average eaten', wk.kcalAvg != null ? `${fmt(wk.kcalAvg)} of ${fmt(tg.kcal)} kcal` : 'no data')}
    ${stat('Average protein', wk.proteinAvg != null ? `${wk.proteinAvg} of ${tg.protein} g` : 'no data')}
    ${stat('Average water', wk.waterAvg != null ? `${litres(wk.waterAvg)} of ${litres(wk.waterTargetAvg)} L` : 'no data')}
    ${stat('In minus out, per day', wk.balanceAvg != null ? `${signed(wk.balanceAvg)} kcal` : 'no data')}
    ${kgWeek != null ? stat('At that rate', `about ${Math.abs(kgWeek).toFixed(1)} kg a week ${kgWeek > 0 ? 'down' : 'up'}`) : ''}
  </dl>
  ${any ? '' : '<p class="note">Log a few days of food, water and Watch numbers and these charts fill in.</p>'}
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
  <p class="sub">Burned is resting energy from your weight, height and age, plus the Watch Move calories, plus about 10% of what you eat for digestion. Both sides are estimates, so watch the trend over weeks, not single days. Early on the scale often drops faster than this predicts, because of water.</p>`;
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
  <p>A 12-week training plan that starts with walking, a weekly menu with meal prep, and a log for food, water and effort. It works offline, and everything you enter stays on this phone.</p>
  <p class="sub">Your numbers set the calorie, protein and heart-rate targets. Resting heart rate is in the Health app under Heart.</p>
  ${profileForm(null)}`;
}

function viewMore() {
  const p = state.profile;
  return `<h1>More</h1>
  <h2>You and your targets</h2>
  ${profileForm(p)}
  <h2>Your data</h2>
  <p class="sub">Everything stays in this app's storage on this phone. ${ui.persisted ? 'The phone has agreed to keep it.' : 'Export a backup now and then, and keep it in Files.'}</p>
  <div class="actions">
    <button class="btn" data-act="export">Export backup</button>
    <label class="btn">Import backup<input type="file" accept=".json,application/json" data-act="import-backup" hidden></label>
    <label class="btn">Import Watch data<input type="file" accept=".json,application/json" data-act="import-watch" hidden></label>
  </div>
  <p class="sub">Watch data comes from the Health export on the Mac. Run the export_for_app.py script there, AirDrop the file to the phone, then import it here. It fills in Move calories, exercise minutes, steps, resting heart rate and VO2max for each day you haven't typed in yourself.</p>
  <h2>How the numbers work</h2>
  <ul>
    <li>Calorie limit: resting energy (Mifflin-St Jeor) times 1.375, minus 550. It drops as your weight drops.</li>
    <li>Protein: 1.3 g per kg of adjusted body weight.</li>
    <li>Water: the base plus 500 ml for every 30 exercise minutes, from the Watch or your logged sessions, whichever is higher.</li>
    <li>Heart rate ranges: 30, 40, 60 and 80% of heart-rate reserve.</li>
    <li>Meal values are estimates for the portions in each recipe.</li>
  </ul>
  <h2>Stop and check</h2>
  <ul>${SAFETY.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  <h2>Start over</h2>
  <div class="actions"><button class="btn danger" data-act="reset">Delete all data</button></div>`;
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
  const x = Math.min(Math.max(8, e.clientX - r.width / 2), window.innerWidth - r.width - 8);
  const y = e.clientY - r.height - 14 < 8 ? e.clientY + 18 : e.clientY - r.height - 14;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
function hideTip() {
  $('#tip').hidden = true;
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Actions ----------
function finishSheet() {
  const s = currentSession();
  const mins = Math.max(1, Math.round((Date.now() - state.active.start) / 60000));
  const rpe = DEFAULT_RPE[s.effort] ?? 5;
  return `<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">Finish ${esc(s.name.toLowerCase())}</h2><button class="icon" data-act="sheet-close" aria-label="Close">${ICON.close}</button></div>
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

function logWorkout(id, min, rpe, hr, note) {
  const s = SESSIONS[id];
  rw(ui.session.date).workouts.push({ id, name: s.name, min, rpe, hr: hr ?? null, note: note || '', t: clock() });
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
    const p = state.profile;
    const thisMonday = L.mondayOf(todayISO());
    ui.week = L.addDays(ui.week || (thisMonday < p.startDate ? p.startDate : thisMonday), Number(el.dataset.n));
    render();
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
    if (i >= 0) day.foods.splice(i, 1);
    else {
      const m = L.MEAL_BY_ID[id];
      day.foods.push({ name: m.name, slot, kcal: m.kcal, p: m.p, fib: m.fib, ref: m.id, t: clock() });
    }
    save();
    render();
  },
  'food-del': (el) => {
    rw(ui.date).foods.splice(Number(el.dataset.i), 1);
    save();
    render();
  },
  recipe: (el) => {
    const m = L.MEAL_BY_ID[el.dataset.id];
    showSheet(`<div class="sheet"><div class="sheet-head"><h2 id="sheet-title">${esc(m.name)}</h2><button class="icon" data-act="sheet-close" aria-label="Close">${ICON.close}</button></div>${recipeBody(m)}</div>`);
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
    const src = kind === 'custom' ? state.custom.find((c) => c.id === el.dataset.id) : L.MEAL_BY_ID[el.dataset.id];
    if (!src) return;
    const x = ui.portion;
    rw(ui.date).foods.push({
      name: x === 1 ? src.name : `${src.name} (${x} portions)`, slot: ui.addSlot,
      kcal: Math.round(src.kcal * x), p: Math.round(src.p * x), fib: Math.round((src.fib || 0) * x), ref: kind === 'custom' ? '' : src.id, t: clock(),
    });
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
    unlockAudio();
    state.active = { date: ui.session.date, id: ui.session.id, start: Date.now(), sets: {} };
    save();
    wake(true);
    render();
  },
  'walk-log': (el) => {
    rw(el.dataset.date).workouts.push({ id: 'walks', name: SESSIONS.walks.name, min: 10, rpe: DEFAULT_RPE.easy, hr: null, note: '', t: clock() });
    save();
    render();
    toast('Walk logged');
  },
  'quick-log': (el) => {
    const s = currentSession();
    logWorkout(s.id, Number(el.dataset.n), DEFAULT_RPE[s.effort] ?? 5);
    save();
    render();
    toast('Logged');
  },
  set: (el) => {
    const i = Number(el.dataset.i), k = Number(el.dataset.k);
    unlockAudio();
    if (!isActive(ui.session.date, ui.session.id)) {
      if (state.active && !confirm('Another session is running. Discard it and start this one?')) return;
      state.active = { date: ui.session.date, id: ui.session.id, start: Date.now(), sets: {} };
      wake(true);
    }
    const done = state.active.sets[i] ?? 0;
    const next = k < done ? k : k + 1;
    state.active.sets[i] = next;
    save();
    if (next > done) {
      const rest = currentSession().exercises[i][3];
      ui.rest = { until: Date.now() + rest * 1000, beeped: false };
    }
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
    if (!confirm('Remove this logged session?')) return;
    rw(ui.session.date).workouts.splice(Number(el.dataset.i), 1);
    save();
    render();
  },
  'food-sec': (el) => {
    ui.food = el.dataset.id;
    render();
  },
  'shop-clear': () => {
    state.shopping = {};
    save();
    render();
  },
  range: (el) => {
    ui.range = Number(el.dataset.n);
    render();
  },
  export: () => exportBackup(),
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
  shop: (el) => {
    if (el.checked) state.shopping[el.dataset.item] = true;
    else delete state.shopping[el.dataset.item];
    save();
    render();
  },
  'import-backup': (el) => importFile(el, 'backup'),
  'import-watch': (el) => importFile(el, 'watch'),
};

const SUBMIT = {
  profile: (f) => {
    const g = (k) => f.elements[k]?.value;
    const p = {
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
    state.profile = p;
    save();
    if (first) {
      ui.screen = ui.tab = 'today';
      navigator.storage?.persist?.().then((ok) => { ui.persisted = ok; });
    }
    render(true);
    toast(first ? 'Plan set up' : 'Saved');
  },
  quick: (f) => {
    const name = String(f.elements.name.value).trim().slice(0, 80);
    const kcal = int(f.elements.kcal.value);
    const p = int(f.elements.p.value) ?? 0;
    if (!name || kcal == null) return toast('Add a name and the calories.');
    if (f.elements.fav.checked && !state.custom.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      state.custom.unshift({ id: `c${Date.now().toString(36)}`, name, kcal, p, fib: 0 });
    }
    rw(ui.date).foods.push({ name, slot: ui.addSlot, kcal, p, fib: 0, ref: '', t: clock() });
    save();
    closeSheet();
    render();
    toast(`Added to ${SLOT_LABEL[ui.addSlot].toLowerCase()}`);
  },
  finish: (f) => {
    const min = int(f.elements.min.value);
    if (!min || min > 600) return toast('Enter the minutes.');
    const hr = int(f.elements.hr.value);
    logWorkout(state.active.id, min, Number(f.elements.rpe.value), hr && hr >= 40 && hr <= 230 ? hr : null, f.elements.note.value.trim().slice(0, 200));
    state.active = null;
    save();
    wake(false);
    closeSheet();
    render();
    toast('Session saved');
  },
};

async function exportBackup() {
  const name = `steady-backup-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importFile(input, kind) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (f.size > 8e6) return toast('That file is too big to be a Steady file.');
  try {
    const data = JSON.parse(await f.text());
    if (kind === 'backup') {
      const clean = L.cleanBackup(data);
      if (!confirm('Replace everything in Steady with this backup?')) return;
      state = { ...blank(), ...clean };
      toast('Backup restored');
    } else {
      const n = L.mergeWatch(state, data);
      toast(`Added Watch numbers for ${n} days`);
    }
    save();
    render(true);
  } catch (e) {
    toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message);
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
  if (e.key === 'Enter' && e.target.matches?.('input[data-act="watch"], input[data-act="weight"]')) e.target.blur();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ui.onToday && ui.date !== todayISO() && ui.screen === 'today') {
    ui.date = todayISO();
    render();
  }
  if (state.active && ui.screen === 'session') wake(true);
});
window.addEventListener('scroll', hideTip, { passive: true });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}
navigator.storage?.persisted?.().then((ok) => { ui.persisted = ok; });
if (state.active) {
  ui.session = { date: state.active.date, id: state.active.id };
}
render(true);
