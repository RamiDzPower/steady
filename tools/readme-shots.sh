#!/bin/zsh
# Takes the README screenshots into docs/screenshots, at 390 x 844 and 2x, from the invented state that demo-state.mjs builds for today.
# Usage: zsh tools/readme-shots.sh (from the repo). It runs agent-browser from /private/tmp, as its Chrome writes a cache folder into the current directory.
REPO=${0:A:h:h}
OUT=$REPO/docs/screenshots
mkdir -p "$OUT"
node "$REPO/tools/demo-state.mjs" > /private/tmp/steady-readme.json || exit 1
cd /private/tmp
export AGENT_BROWSER_SESSION=steady-readme
curl -s -o /dev/null http://127.0.0.1:8765/ || { python3 -I -m http.server 8765 --bind 127.0.0.1 --directory "$REPO" >/dev/null 2>&1 & sleep 1; }
agent-browser open http://127.0.0.1:8765/ >/dev/null
agent-browser set viewport 390 844 2 >/dev/null
agent-browser set media light >/dev/null
agent-browser eval "(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); const s = $(cat /private/tmp/steady-readme.json); s.settings.watchSeen = true; localStorage.setItem('steady.v1', JSON.stringify(s)); return 1; })()" >/dev/null
agent-browser eval "location.reload(); 1" >/dev/null
sleep 2
# Headless Chrome paints only when asked, so a few captures let animations finish before the one that is kept.
pump() { for i in 1 2 3; do agent-browser screenshot /private/tmp/steady-readme.png >/dev/null; sleep 0.4; done; }
ck() { agent-browser eval "(() => { const b = document.querySelector('$1'); if (!b) return 'MISSING $1'; b.click(); return 'ok'; })()" | tr -d '"' | grep MISSING; pump; }
top() { agent-browser eval "window.scrollTo(0, 0); 1" >/dev/null; pump; }
shot() { agent-browser screenshot "$OUT/$1.png" >/dev/null; echo "$1"; }

ck '[data-tab=today]'; top; shot today
ck '[data-tab=train]'; top; shot train
ck '[data-act=go]'; top; shot session
ck '[data-act=close-session]'
ck '[data-tab=food]'; top; shot food
ck '[data-tab=progress]'; ck '#main [data-act=progress-view][data-id=overview]'; top; shot progress
ck '#main [data-act=progress-view][data-id=charts]'; top; shot charts
ck '#main [data-act=progress-view][data-id=overview]'
ck '[data-tab=today]'; ck '[data-act=settings-open]'; top; shot settings
ck '#main [data-act=settings-close]'
agent-browser set media dark >/dev/null; ck '[data-tab=today]'; top; shot today-dark
agent-browser close >/dev/null
