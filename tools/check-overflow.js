// Visits every screen and sheet Steady reaches by a tap and lists elements that stick out of the viewport sideways.
// Run it in the page: agent-browser eval "$(cat tools/check-overflow.js)" (see tools/README.md). It needs a profile,
// and it saves a strength session to reach the finish and summary sheets, then removes that log, unless a session
// is already running: that one it leaves alone, as saving or starting another would end it. Clicks render
// synchronously, so it never waits on a timer, which a background tab would slow to about one a second. That is
// why it turns off view transitions, which would draw a session's push and pop a frame later.
(async () => {
  const W = document.documentElement.clientWidth;
  const running = !!JSON.parse(localStorage.getItem('steady.v1') || 'null')?.active;
  const $ = (s) => document.querySelector(s);
  const out = [];
  // Only the rows built to scroll sideways are exempt; a clipping .group or a scrolling sheet or list would hide real overflow.
  const inScroller = (el) => !!el.parentElement?.closest('.chips, .scroll-x');
  const check = (label) => {
    const scope = $('dialog[open]') || $('#main');
    const bad = [...scope.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) && !inScroller(el);
    });
    const top = bad.filter((el) => !bad.includes(el.parentElement));
    const where = top.slice(0, 3).map((el) => {
      const r = el.getBoundingClientRect();
      return `\n    ${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} left ${Math.round(r.left)} right ${Math.round(r.right)}`;
    });
    const s = $('dialog[open] .sheet');
    if (s && s.scrollWidth > s.clientWidth) where.unshift(`\n    the sheet scrolls sideways: ${s.scrollWidth} of ${s.clientWidth} px`);
    // Pseudo-element tap areas are not elements, but they still widen the page.
    if (document.documentElement.scrollWidth > W) where.unshift(`\n    the page scrolls sideways: ${document.documentElement.scrollWidth} of ${W} px`);
    out.push(`${where.length ? 'OVERFLOW' : 'ok      '} ${label} (page ${document.documentElement.scrollWidth} of ${W} px)${where.join('')}`);
  };
  const click = (sel) => {
    const el = $(sel);
    if (el) el.click();
    else out.push(`MISSING  ${sel}`);
    return !!el;
  };
  const shut = () => { const d = $('#sheet'); d.classList.remove('closing'); if (d.open) d.close(); };
  // Paste and Copy fall back to a sheet when the clipboard refuses, after an await: a few microtasks let that run.
  const settle = async () => { for (let i = 0; i < 10; i++) await null; };
  const sheet = async (sel, label, then) => {
    if (!click(sel)) return;
    await settle();
    if ($('#sheet').open) { check(`sheet: ${label}`); then?.(); }
    else out.push(`NO SHEET ${label}`);
    shut();
  };
  // A bad paste has to show its message inside the sheet, which covers the toast, and a long pasted word has to wrap.
  const bad = `{"date": "${'W'.repeat(40)}", "steps": 1}`;
  const badPaste = () => {
    const f = $('#sheet [data-form=paste]');
    f.elements.text.value = bad;
    f.requestSubmit();
    if ($('#sheet[open] [role=alert]')?.textContent) check('sheet: paste Watch numbers, with an error');
    else out.push('NO ERROR paste Watch numbers: a bad paste showed no message in the sheet');
  };
  // Read straight from the clipboard, the same bad paste opens that sheet on its text, with the message.
  const clipError = () => { if (!$('#sheet[open] [role=alert]')?.textContent) out.push('NO ERROR paste Watch numbers from the clipboard: the sheet showed no message'); };
  const clip = navigator.clipboard;
  const confirmWas = window.confirm;
  const refuse = () => Promise.reject(new Error('refused for the check'));
  if (clip) clip.readText = clip.writeText = refuse;
  navigator.share = refuse; // so Share the list falls back to its copy sheet instead of opening the share sheet
  window.confirm = () => true;
  document.startViewTransition = undefined;
  try {
    shut();
    click('[data-tab=today]'); check('today');
    await sheet('#main [data-act=add-food-open]', 'add food');
    await sheet('#main [data-act=swap-open]', 'swap');
    await sheet('#main [data-act=recipe]', 'recipe from Today');
    await sheet('#main [data-act=paste-watch]', 'paste Watch numbers', badPaste);
    if (clip) {
      clip.readText = () => Promise.resolve(bad);
      await sheet('#main [data-act=paste-watch]', 'paste Watch numbers, read from the clipboard', clipError);
      clip.readText = refuse;
    }
    await sheet('#main [data-act=weigh-open]', 'weigh in');
    await sheet('#main [data-act=copy-health]', 'totals for Health');
    await sheet('#main [data-act=shortcut-help]', 'iPhone shortcuts');

    click('[data-tab=train]'); check('train');
    await sheet('#main [data-act=plan-open]', 'plan something');
    click('#main [data-act=train-view][data-id=exercises]'); check('train: exercises');
    click('#main [data-act=ex-part][data-id=Core]'); check('train: exercises, Core');
    click('#main [data-act=ex-part][data-id=All]');
    await sheet('#main [data-act=ex-new]', 'new exercise');
    await sheet('#main [data-act=ex-detail]', 'exercise detail');
    click('#main [data-act=train-view][data-id=schedule]');
    click('[data-tab=more]'); click('#main [data-act=train-mode][data-id=rotation]'); click('[data-tab=train]'); check('train: rotation');
    click('[data-tab=today]'); check('today: rotation');
    click('[data-tab=more]'); click('#main [data-act=train-mode][data-id=fixed]'); click('[data-tab=train]');
    click('#main [data-act=week][data-n="7"]'); check('train, next week');
    // A logged session cannot move, so the move sheet is opened on one from next week.
    if (click('#main [data-act=open-session][data-id^=str], #main [data-act=open-session][data-id^=gym]')) {
      await sheet('#main [data-act=move-open]', 'move to another day');
      click('#main [data-act=close-session]');
    }
    click('#main [data-act=week][data-n="-7"]');
    if (click('#main [data-act=open-session][data-id^=str], #main [data-act=open-session][data-id^=gym]')) {
      check('session: strength');
      if (running) out.push('SKIPPED  finish and session saved sheets: a session is running');
      else {
        if ($('#main [data-act=start]')) { click('#main [data-act=start]'); check('session: strength, running'); await sheet('#main [data-act=ex-swap-open]', 'swap exercise'); }
        if (click('#main [data-act=finish]')) {
          check('sheet: finish session');
          $('#sheet [data-form=finish]').requestSubmit();
          if ($('#sheet').open) check('sheet: session saved');
          else out.push('NO SHEET session saved');
          shut();
          [...document.querySelectorAll('#main [data-act=workout-del]')].at(-1)?.click(); // the log the save just added
        }
      }
      click('#main [data-act=close-session]');
    }
    if (click('#main [data-act=open-session]:not([data-id^=str]):not([data-id^=gym])')) {
      check('session: cardio or walk');
      click('#main [data-act=close-session]');
    }

    click('[data-tab=food]');
    for (const k of ['menu', 'prep', 'shopping', 'recipes', 'out', 'rules']) {
      click('#main [data-act=food-sec][data-id=menu]'); click(`#main [data-act=food-sec][data-id=${k}]`); check(`food: ${k}`);
      if (k === 'shopping') await sheet('#main [data-act=shop-share]', 'shopping list as text');
      if ($('#main [data-act=food-week][data-id=next]')) {
        click('#main [data-act=food-week][data-id=next]'); check(`food: ${k}, next week`);
        click('#main [data-act=food-week][data-id=this]');
      }
    }
    click('#main [data-act=food-sec][data-id=menu]'); click('#main [data-act=food-sec][data-id=recipes]');
    document.querySelectorAll('#main details').forEach((d) => { d.open = true; });
    check('food: recipes, all open');
    click('#main [data-act=food-sec][data-id=menu]');

    // Progress opens on Overview: the streak, challenges, the grid by weeks and by months, records and the weight chart.
    click('[data-tab=progress]'); click('#main [data-act=progress-view][data-id=overview]'); check('progress: overview');
    click('#main [data-act=heat-range][data-id=year]'); check('progress: overview, activity by year');
    click('#main [data-act=heat-metric][data-id=volume]'); check('progress: overview, volume');
    click('#main [data-act=heat-range][data-id="12w"]'); click('#main [data-act=heat-metric][data-id=time]');
    click('#main [data-act=progress-view][data-id=charts]'); check('progress: charts, 14 days');
    for (const r of ['1M', '1Y', 'All']) { click(`#main [data-act=weight-range][data-id="${r}"]`); check(`progress: charts, weight ${r}`); }
    click('#main [data-act=weight-table]'); check('progress: charts, weight table');
    click('#main [data-act=progress-view][data-id=goals]'); check('progress: goals');
    click('#main [data-act=progress-view][data-id=charts]');
    click('#main [data-act=range][data-id="28"]'); check('progress: charts, 28 days');
    click('#main [data-act=range][data-id="14"]');
    click('#main [data-act=progress-view][data-id=health]'); check('progress: health checks');
    await sheet('#main [data-act=lab-open]', 'blood test');
    click('#main [data-act=progress-view][data-id=charts]');

    click('[data-tab=more]'); check('more');
    await sheet('#main [data-act=export-open]', 'export a backup');
    await sheet('#main [data-act=shortcut-help]', 'iPhone shortcuts from More');
    await sheet('#main [data-act=whats-new]', "what's new");
    click('[data-tab=today]');
    window.scrollTo(0, 0);
  } catch (err) {
    out.push(`ERROR after ${out.length} lines: ${err.message}`); // a stop part way is a finding, not a silent clean report
  } finally {
    if (clip) { delete clip.readText; delete clip.writeText; }
    delete navigator.share;
    delete document.startViewTransition;
    window.confirm = confirmWas;
  }
  return out.join('\n');
})()
