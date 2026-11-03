# Tools

These run on the Mac and are not part of the app: `sw.js` does not cache them. The browser checks drive Chrome through the [agent-browser](https://github.com/vercel-labs/agent-browser) CLI, against the app served from your checkout.

## Serve the app and open it

```sh
REPO=~/Downloads/steady-app   # your checkout
python3 -I -m http.server 8765 --bind 127.0.0.1 --directory "$REPO" &
cd /private/tmp
export AGENT_BROWSER_SESSION=steady-test
agent-browser open http://127.0.0.1:8765/
agent-browser set viewport 390 844
```

Run agent-browser from `/private/tmp`, not from the repo. Its Chrome writes a folder literally named `${local_app_data}\Chrome\Cache` into the current directory.

The app has a service worker. After you change app code, drop it and its cache before you reload, or the page keeps the old files:

```sh
agent-browser eval "(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); location.reload(); })()"
```

## Load made-up data

`demo-state.mjs` prints a steady.v1 state with about six weeks of invented food, water, Watch numbers with VO2max, weigh-ins, workouts, blood pressure and two blood tests, ending on the date you give it. The same date always gives the same state.

```sh
node "$REPO/tools/demo-state.mjs" 2026-11-02 > /private/tmp/steady-demo.json
agent-browser eval "localStorage.setItem('steady.v1', JSON.stringify($(cat /private/tmp/steady-demo.json))); location.reload()"
```

The state marks What's new as seen. To see that sheet open on load, set `seenVersion` to 0 in the file first.

## Look for sideways overflow

```sh
agent-browser eval "$(cat "$REPO/tools/check-overflow.js")" | sed 's/\\n/\n/g'
```

`agent-browser eval` prints the report as one quoted string, and the `sed` splits it into lines. The check opens every screen and sheet a tap can reach and gives a line for each: `ok`, or `OVERFLOW` with up to three elements that stick out of the viewport and a note when a sheet scrolls sideways. Only the rows of chips and the weekly table may run past the edge, because they scroll sideways on purpose. `MISSING` means a button it looks for is not on the page. In the paste sheet it also sends a bad paste, which changes nothing, then makes the clipboard hand over the same bad paste; `NO ERROR` means the message did not show inside the sheet. It saves a strength session to reach the finish and summary sheets, then removes that log again. When a session is already running it skips those two sheets and says so, because saving or starting another session would end the one running. It also stops Share the list from opening the share sheet so the copy sheet shows instead. It skips the setup screen and the passcode sheet for a protected backup. When you add a sheet, add a line for it.

## Drag the sheet with real input

```sh
zsh "$REPO/tools/check-sheet.sh" steady-test http://127.0.0.1:8765/
```

It taps, drags, flicks, presses Escape and taps the dimmed page, and prints each result next to the one it should give.

## Emulate other media features

`agent-browser set media` covers dark mode and reduced motion. For Increase Contrast and the rest, `emulate-media.mjs` holds a DevTools session open in the background, because Chrome drops the emulation when the session closes. Wait until the page matches the feature, then take your screenshots while it runs. A screenshot taken straight away still shows normal contrast.

```sh
node "$REPO/tools/emulate-media.mjs" "$(agent-browser get cdp-url)" http://127.0.0.1:8765/ 30 prefers-contrast=more &
agent-browser wait --fn "matchMedia('(prefers-contrast: more)').matches"
agent-browser screenshot /private/tmp/steady-contrast.png
```

Other features work the same way, with the matching query in the wait, for example `prefers-reduced-transparency=reduce` or `forced-colors=active`.

## Clean up

```sh
agent-browser close
kill %1   # the server, if it runs in this shell
rm -rf '/private/tmp/${local_app_data}\Chrome\Cache'
```

## Icons

`build_icons.py` turns the Phosphor SVGs in `phosphor/` into `icons.js`, and `make_icons.py` draws the app icons. Their first lines say how to run them.
