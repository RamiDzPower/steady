#!/bin/zsh
# Drives the Steady sheet with real mouse input: a tap, a slow drag and hold, a pull upwards, a long drag, a flick,
# Escape and a tap on the dimmed page. Each line prints what happened next to what should happen.
# Usage: zsh tools/check-sheet.sh SESSION URL, for example zsh tools/check-sheet.sh steady-test http://127.0.0.1:8765/
# The page needs a profile (load tools/demo-state.mjs first). Headless Chrome paints only when asked, and the sheet's
# transitions need painted frames, so pump takes a throwaway screenshot.
if (( $# != 2 )); then
  print -u2 "Usage: zsh tools/check-sheet.sh SESSION URL"
  exit 1
fi
export AGENT_BROWSER_SESSION="$1"
URL="$2"
SHOT=$(mktemp /private/tmp/steady-pump.XXXXXX) || exit 1
cd /private/tmp || exit 1 # agent-browser's Chrome writes a cache folder into the current directory
pump() { agent-browser screenshot "$SHOT.png" >/dev/null; }
st() { agent-browser eval "(() => { const s = document.getElementById('sheet'); return (s.open ? 'open' : 'closed') + (s.classList.contains('closing') ? '+closing' : '') + ' y=' + Math.round(new DOMMatrixReadOnly(getComputedStyle(s).transform).m42); })()" | tr -d '"'; }
open_sheet() { agent-browser click '#main [data-act=add-food-open]' >/dev/null; pump; sleep 0.4; pump; }
# A slow flick in step 5 can leave the sheet open, and then it covers the button the next step opens it with.
shut() { agent-browser eval "(() => { const s = document.getElementById('sheet'); s.classList.remove('closing'); if (s.open) s.close(); })()" >/dev/null; pump; }
title_xy() { agent-browser eval "(() => { const r = document.querySelector('#sheet h2').getBoundingClientRect(); return Math.round(r.left + 20) + ' ' + Math.round(r.top + r.height / 2); })()" | tr -d '"'; }

agent-browser open "$URL" >/dev/null || exit 1
agent-browser set viewport 390 844 >/dev/null
open_sheet; read X Y <<<"$(title_xy)"
agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null; agent-browser mouse up >/dev/null; sleep 0.6
echo "1 tap on title:            $(st)   (want open y=0)"

agent-browser mouse down >/dev/null
for d in 30 60 90 120; do agent-browser mouse move $X $((Y + d)) >/dev/null; done
echo "2 dragging 120px:          $(st)   (want open y=120)"
sleep 0.3; agent-browser mouse up >/dev/null; sleep 0.6
echo "2 held, then released:     $(st)   (want open y=0, sprang back)"

agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null
for d in -40 -80 -160; do agent-browser mouse move $X $((Y + d)) >/dev/null; done
echo "3 pulled up 160px:         $(st)   (want a small negative y: rubber band)"
sleep 0.3; agent-browser mouse up >/dev/null; sleep 0.6
echo "3 released:                $(st)   (want open y=0)"

agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null
for d in 100 200 300 420; do agent-browser mouse move $X $((Y + d)) >/dev/null; done
sleep 0.3; agent-browser mouse up >/dev/null; sleep 0.08
echo "4 long drag 420px, held:   $(st)   (want open+closing, past half the height)"
pump; sleep 0.3; pump; echo "4 settled:                 $(st)   (want closed)"

open_sheet; read X Y <<<"$(title_xy)"
agent-browser mouse move $X $Y >/dev/null; agent-browser mouse down >/dev/null
agent-browser mouse move $X $((Y + 40)) >/dev/null; agent-browser mouse move $X $((Y + 80)) >/dev/null; agent-browser mouse up >/dev/null; sleep 0.08
echo "5 quick 80px flick:        $(st)   (closes only if the flick was fast)"
pump; sleep 0.3; pump; echo "5 settled:                 $(st)"

shut; open_sheet; agent-browser press Escape >/dev/null; sleep 0.08
echo "6 Escape:                  $(st)   (want open+closing: slides down)"
pump; sleep 0.3; pump; echo "6 settled:                 $(st)   (want closed)"
agent-browser eval "document.activeElement?.dataset?.act || document.activeElement?.tagName" | tr -d '"' | sed 's/^/6 focus returned to:        /'

shut; open_sheet; agent-browser mouse move 195 30 >/dev/null; agent-browser mouse down >/dev/null; agent-browser mouse up >/dev/null; pump; sleep 0.3; pump
echo "7 tap on dimmed area:      $(st)   (want closed)"
rm -f "$SHOT" "$SHOT.png"
