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

Reload the page between runs: a second run on the same page stops part way (the finish sheet is not there to submit), and since this release the tool reports that as an `ERROR after N lines` line instead of throwing.

```sh
agent-browser eval "$(cat "$REPO/tools/check-overflow.js")" | sed 's/\\n/\n/g'
```

`agent-browser eval` prints the report as one quoted string, and the `sed` splits it into lines. The check opens every screen and sheet a tap can reach and gives a line for each: `ok`, or `OVERFLOW` with up to three elements that stick out of the viewport and a note when a sheet scrolls sideways. Only the rows of chips and the weekly table may run past the edge, because they scroll sideways on purpose. `MISSING` means a button it looks for is not on the page. In the paste sheet it also sends a bad paste, which changes nothing, then makes the clipboard hand over the same bad paste; `NO ERROR` means the message did not show inside the sheet. It saves a strength session to reach the finish and summary sheets, then removes that log again. When a session is already running it skips those two sheets and says so, because saving or starting another session would end the one running. It also stops Share the list from opening the share sheet so the copy sheet shows instead. It skips the setup screen and the passcode sheet for a protected backup. When you add a sheet, add a line for it.

## Check tap targets

```sh
agent-browser eval "$(cat "$REPO/tools/check-targets.js")" | sed 's/\\n/\n/g'
```

It visits most of the screens and sheets the overflow check visits, plus the tab bar and the rest bar, and for every control checks 144 points spread over a 44 by 44 px box around its centre with `document.elementFromPoint`. A screen where every control keeps the whole box gets `ok`. `SHORT` lists the controls that lose part of it, grouped by kind, with the share the worst one keeps and where the rest goes: another control, which would take the tap, or nothing, where the tap would be lost. Chrome treats a point as the pixel to its right and below, so the box starts half a pixel further out on the left and top: a 44 px control passes and a 43 px one does not. Three things stay short: the chart bars and dots, which share the plot edge to edge, the week strip's arrows, which share one row with seven days, and the first or last row of a list, whose box corner falls outside the list's rounded corner. On a 320 px wide phone the strip's seven days are short as well: each is 36 px wide and keeps about 83% of the box, and the rest goes to the next day or an arrow. A 44 px row right under a line of text can also lose its top points to that text by half a pixel; the row itself is fine. Like the overflow check it saves a strength session and removes it again, unless a session is running. It turns off view transitions first, because a session's push or pop sends every hit to the page root for 0.35 s. It ends with a short pause, because Finish, Skip, the remove button and Share the list ignore a second tap within 600 ms. When you add a sheet, add a line for it here too.

## Drag the sheet with real input

```sh
zsh "$REPO/tools/check-sheet.sh" steady-test http://127.0.0.1:8765/
```

It taps, drags, flicks, presses Escape and taps the dimmed page, and prints each result next to the one it should give.

Real input meets the app's double tap guard. A tap that opens or closes a sheet, changes the screen or runs a one-shot action makes the app ignore the next 600 ms of taps within 24 px of it: no drag, no focus, no click. A script that taps the same spot again should wait 600 ms first. Clicks from `el.click()`, as in the two checks above, carry no place and pass.

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
