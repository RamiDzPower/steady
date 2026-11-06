// Samples document.elementFromPoint over a 44 by 44 px box around the centre of every control on each screen and sheet
// Steady reaches by a tap, and lists the controls that lose part of that box. Run it in the page:
// agent-browser eval "$(cat tools/check-targets.js)" (see tools/README.md). It needs a profile. Like check-overflow.js
// it saves a strength session to reach the finish and summary sheets, then removes that log, unless a session is
// already running. It skips the setup screen and the passcode sheet for a protected backup.
(async () => {
  const $ = (s) => document.querySelector(s);
  document.startViewTransition = undefined; // a push or pop sends every hit to the page root for 0.35 s
  const running = !!JSON.parse(localStorage.getItem('steady.v1') || 'null')?.active;
  const out = [];
  const total = { screens: 0, controls: 0, short: 0 };
  // Chrome tests a point as the pixel to its right and below; from 22.5 before the centre to 21 after it, only a full 44 px keeps every step.
  const STEPS = [-22.5, -18, -14, -10, -6, -2, 1, 5, 9, 13, 17, 21];
  const usable = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width >= 2 && r.height >= 2 && s.visibility !== 'hidden' && s.pointerEvents !== 'none' && !el.closest('[inert], [hidden]');
  };
  // A label counts as the control when the input it works is hidden, as in Hot months and Import backup.
  const controls = (scope) => [...scope.querySelectorAll('button, a[href], input, select, textarea, summary, [data-tip], label')]
    .filter((el) => (el.tagName === 'LABEL' ? el.control && !usable(el.control) && !el.closest('button') : true) && usable(el));
  // A tap on a label works its input.
  const owns = (el, hit) => !!hit && (el === hit || el.contains(hit) || hit.closest('label')?.control === el);
  const chart = (el) => el.closest('svg[aria-label]')?.getAttribute('aria-label').split('.')[0];
  const kind = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${el.dataset?.act ? `[${el.dataset.act}]` : ''}${chart(el) ? ` in ${chart(el)}` : ''}`;
  const where = (hit, all) => {
    if (!hit) return 'off the page';
    const other = all.find((c) => owns(c, hit));
    return other ? kind(other) : `nothing (${kind(hit)})`;
  };
  const sample = (label, scope = $('dialog[open]') || $('#main')) => {
    const all = controls(scope);
    const groups = new Map();
    for (const el of all) {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let n = 0, hits = 0;
      const lost = new Map();
      for (const dy of STEPS) {
        for (const dx of STEPS) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          n++;
          const hit = document.elementFromPoint(x, y);
          if (owns(el, hit)) hits++;
          else { const w = where(hit, all); lost.set(w, (lost.get(w) || 0) + 1); }
        }
      }
      total.controls++;
      if (hits === n) continue;
      total.short++;
      const g = groups.get(kind(el)) || { count: 0, worst: 1, lost: new Map() };
      g.count++;
      g.worst = Math.min(g.worst, hits / n);
      for (const [w, k] of lost) g.lost.set(w, (g.lost.get(w) || 0) + k);
      groups.set(kind(el), g);
    }
    total.screens++;
    const shortHere = [...groups.values()].reduce((a, g) => a + g.count, 0);
    out.push(`${shortHere ? 'SHORT   ' : 'ok      '} ${label}: ${all.length} controls${shortHere ? `, ${shortHere} short` : ''}`);
    for (const [k, g] of groups) {
      const to = [...g.lost].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w).join(' and ');
      out.push(`    ${String(Math.round(g.worst * 100)).padStart(3)}% at worst, ${g.count} x ${k}, the rest goes to ${to}`);
    }
  };
  const click = (sel) => {
    const el = $(sel);
    if (el) el.click();
    else out.push(`MISSING  ${sel}`);
    return !!el;
  };
  const sheetEl = $('#sheet');
  const shut = () => { sheetEl.classList.remove('closing'); if (sheetEl.open) sheetEl.close(); };
  const settle = async () => { for (let i = 0; i < 10; i++) await null; };
  const sheet = async (sel, label, then) => {
    if (!click(sel)) return;
    await settle();
    if (sheetEl.open) { sample(`sheet: ${label}`); then?.(); }
    else out.push(`NO SHEET ${label}`);
    shut();
  };
  const clip = navigator.clipboard;
  const refuse = () => Promise.reject(new Error('refused for the check'));
  if (clip) clip.readText = clip.writeText = refuse; // so Paste and Copy open their sheets
  navigator.share = refuse; // so Share the list opens its copy sheet instead of the share sheet
  sheetEl.style.transition = 'none'; // sample a sheet where it settles, not on its way up
  try {
    shut();
    click('[data-tab=today]');
    sample('tab bar', $('.tabs'));
    sample('today');
    click('#main [data-act=strip][data-n="-7"]'); sample('today, last week');
    click('#main [data-act=day][data-n="0"]');
    await sheet('#main [data-act=add-food-open]', 'add food');
    await sheet('#main [data-act=swap-open]', 'swap');
    await sheet('#main [data-act=recipe]', 'recipe from Today');
    await sheet('#main [data-act=paste-watch]', 'paste Watch numbers');
    await sheet('#main [data-act=weigh-open]', 'weigh in');
    await sheet('#main [data-act=copy-health]', 'totals for Health');
    await sheet('#main [data-act=shortcut-help]', 'iPhone shortcuts');

    click('[data-tab=train]'); sample('train');
    if (click('#main [data-act=open-session][data-id^=str], #main [data-act=open-session][data-id^=gym]')) {
      sample('session: strength');
      if (running) out.push('SKIPPED  running session, rest bar, finish and session saved sheets: a session is running');
      else {
        click('#main [data-act=start]'); sample('session: strength, running');
        click('#main [data-act=rest]'); sample('session: strength, resting');
        click('#main [data-act=rest-skip]');
        if (click('#main [data-act=finish]')) {
          await settle();
          sample('sheet: finish session');
          $('#sheet [data-form=finish]').requestSubmit();
          if (sheetEl.open) sample('sheet: session saved');
          else out.push('NO SHEET session saved');
          shut();
          [...document.querySelectorAll('#main [data-act=workout-del]')].at(-1)?.click(); // the log the save just added
          $('#toast').classList.remove('show', 'has-btn');
        }
      }
      click('#main [data-act=close-session]');
    }
    if (click('#main [data-act=open-session]:not([data-id^=str]):not([data-id^=gym])')) {
      sample('session: cardio or walk');
      click('#main [data-act=close-session]');
    }

    click('[data-tab=food]');
    for (const k of ['menu', 'prep', 'shopping', 'recipes', 'out', 'rules']) {
      click(`#main [data-act=food-sec][data-id=${k}]`); sample(`food: ${k}`);
      if (k === 'shopping') await sheet('#main [data-act=shop-share]', 'shopping list as text');
    }
    click('#main [data-act=food-sec][data-id=menu]');

    click('[data-tab=progress]'); sample('progress: overview');
    click('#main [data-act=progress-view][data-id=goals]'); sample('progress: goals');
    click('#main [data-act=progress-view][data-id=charts]'); sample('progress: charts, 14 days');
    click('#main [data-act=range][data-id="28"]'); sample('progress: charts, 28 days');
    click('#main [data-act=range][data-id="14"]');
    click('#main [data-act=progress-view][data-id=health]'); sample('progress: health checks');
    await sheet('#main [data-act=lab-open]', 'blood test');
    click('#main [data-act=progress-view][data-id=charts]');

    click('[data-tab=more]');
    document.querySelectorAll('#main details').forEach((d) => { d.open = true; });
    sample('more, targets open');
    await sheet('#main [data-act=export-open]', 'export a backup');
    await sheet('#main [data-act=whats-new]', "what's new");
    click('[data-tab=today]');
    window.scrollTo(0, 0);
  } finally {
    if (clip) { delete clip.readText; delete clip.writeText; }
    delete navigator.share;
    sheetEl.style.transition = '';
  }
  out.push(`TOTAL    ${total.controls} controls on ${total.screens} screens and sheets: ${total.controls - total.short} keep the whole box, ${total.short} short`);
  await new Promise((r) => setTimeout(r, 650)); // Finish and Share the list ignore a repeat within 600 ms, so the next check starts clear
  return out.join('\n');
})()
