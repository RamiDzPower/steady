#!/bin/zsh
# Runs Steady in the iOS Simulator's Safari with the invented demo state, to check real WebKit rendering, text sizes and dark mode.
#   zsh tools/sim.sh setup                        copy the app to /private/tmp/steady-sim, serve it, boot the simulator, load the demo state
#   zsh tools/sim.sh shot NAME SCREEN SIZE MODE   screenshot to /private/tmp/steady-sim-NAME.png
#   zsh tools/sim.sh down                         reset the simulator settings, shut it down and stop the server
# SCREEN is today, train, food, progress, settings or session, then optionally /ACTION=ID (an ACT name in app.js) and :Y to scroll,
#   for example progress/progress-view=charts:1400 or today/weigh-open.
# SIZE is a content size: large (the default), accessibility-medium ... accessibility-extra-extra-extra-large. MODE is light or dark.
# Uses the installed simctl, never xcrun simctl, which on this Mac asks for an admin password. The live https site does not load in the
# simulator behind the corporate proxy, so the copy is served on 127.0.0.1 with no caching and a service worker that removes itself.
SIMCTL=/Library/Developer/PrivateFrameworks/CoreSimulator.framework/Versions/A/Resources/bin/simctl
REPO=${0:A:h:h}
W=/private/tmp/steady-sim
PORT=${PORT:-8768}
D=$($SIMCTL list devices available | grep -m1 -E '^ +iPhone' | grep -oE '[0-9A-F-]{36}')
[[ -n $D ]] || { echo "no iPhone simulator found"; exit 1; }
if [[ $1 == setup ]]; then
  rsync -a --delete --exclude .git --exclude docs "$REPO/" "$W/"
  node "$REPO/tools/demo-state.mjs" > "$W/demo.json" || exit 1
  printf "self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.map((x) => caches.delete(x)))).then(() => self.registration.unregister())));\n" > "$W/sw.js"
  cat >> "$W/app.js" <<'JS'
// Simulator copy only: the address hash picks the screen (see tools/sim.sh).
const simGo = () => {
  const [v, y] = location.hash.slice(1).split(':');
  if (!v) return;
  if ($('#sheet').open) { $('#sheet').close(); $('#sheet').innerHTML = ''; }
  const [t, act] = v.split('/');
  if (t === 'settings') ACT['settings-open'](); else if (t === 'session') ACT.go(); else ACT.tab({ dataset: { tab: t } });
  if (act) { const [a, id] = act.split('='); setTimeout(() => ACT[a]({ dataset: { id, date: todayISO() } }), 300); }
  setTimeout(() => scrollTo(0, Number(y) || 0), 900);
};
addEventListener('hashchange', simGo);
setTimeout(simGo, 300);
JS
  printf '(async () => { const s = await (await fetch("demo.json")).json(); s.settings.watchSeen = true; localStorage.setItem("steady.v1", JSON.stringify(s)); location.replace("./"); })();\n' > "$W/load-demo.js"
  printf '<!doctype html><meta charset="utf-8"><title>Load demo</title><script src="load-demo.js"></script>\n' > "$W/load-demo.html"
  cat > "$W/serve.py" <<'PY'
import functools, http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # Safari would otherwise keep serving the old copy
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
PY
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || { (cd /private/tmp && python3 -I "$W/serve.py" $PORT "$W" >/dev/null 2>&1 &); sleep 1; }
  $SIMCTL boot $D 2>/dev/null; $SIMCTL bootstatus $D -b >/dev/null
  $SIMCTL openurl $D "http://127.0.0.1:$PORT/load-demo.html"; sleep 6
elif [[ $1 == shot ]]; then
  $SIMCTL ui $D content_size ${4:-large}; $SIMCTL ui $D appearance ${5:-light}
  $SIMCTL openurl $D "http://127.0.0.1:$PORT/#$3"; sleep 4
  $SIMCTL io $D screenshot "/private/tmp/steady-sim-$2.png" >/dev/null 2>&1 && echo "/private/tmp/steady-sim-$2.png"
elif [[ $1 == down ]]; then
  $SIMCTL ui $D content_size large; $SIMCTL ui $D appearance light; $SIMCTL shutdown $D; pkill -f "serve.py $PORT"
else
  sed -n 2,11p "$0"
fi
