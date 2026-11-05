import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

// The colour tokens of each theme, read from app.css: light, dark, and the dark sheet with its raised greys.
const vars = (re) => {
  const m = css.match(re);
  assert.ok(m, `app.css has no block matching ${re}`);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
};
const soft = vars(/^:root, dialog#sheet \{([^}]*)\}/m);
const light = { ...vars(/^:root \{([^}]*)\}/m), ...soft };
const dark = { ...light, ...vars(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/) };
const sheet = { ...dark, ...vars(/dialog#sheet \{ (--bg[^}]*)\}/) };

const rgba = (v, t) => {
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return rgba(t[ref[1]], t);
  const hex = v.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3').match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) return [...hex.slice(1).map((h) => parseInt(h, 16) / 255), 1];
  const fn = v.match(/^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/);
  if (fn) return [fn[1] / 255, fn[2] / 255, fn[3] / 255, Number(fn[4] ?? 1)];
  const mix = v.match(/^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/);
  if (mix) { const a = rgba(mix[1], t), b = rgba(mix[3], t), p = mix[2] / 100; return a.map((x, i) => x * p + b[i] * (1 - p)); }
  throw new Error(`cannot read the colour ${v}`);
};
const color = (name, t) => rgba(name.startsWith('#') ? name : `var(--${name})`, t);
const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3]));
const lum = (c) => c.slice(0, 3).reduce((s, x, i) => s + [0.2126, 0.7152, 0.0722][i] * (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4), 0);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// [needed ratio, colour, surface, and the surface under it when the first one is see-through]
const PAIRS = [
  [4.5, 'label-2', 'bg'], [4.5, 'label-2', 'cell'], [4.5, 'label-2', 'cell-2'], [4.5, 'effort-ink', 'cell'], [4.5, 'effort-ink', 'bg'], [4.5, 'danger', 'cell'], [4.5, 'danger', 'bg'],
  [4.5, 'fuel-ink', 'fuel-soft'], [4.5, 'water-ink', 'water-soft'], [4.5, 'effort-ink', 'effort-soft'],
  [4.5, '#ffffff', 'fuel-tile'], [4.5, '#ffffff', 'effort-tile-num'], [3, '#ffffff', 'effort-tile'], [4.5, '#ffffff', 'gray-tile'],
  [3, 'fuel', 'cell'], [3, 'water', 'cell'], [3, 'effort', 'cell'], [3, 'label-2', 'fill', 'bg'], [3, '#ffffff', 'water-tile'],
];
// The sheet has no glass bars and no kg or reps boxes, and its only --label-3 is placeholder text and the grabber.
const PAGE_ONLY = [[4.5, 'label-2', 'glass', 'bg'], [4.5, 'label-2', 'fill', 'cell'], [3, 'label-3', 'cell'], [3, 'label-3', 'bg']];

for (const [name, t, pairs] of [['light', light, [...PAIRS, ...PAGE_ONLY]], ['dark', dark, [...PAIRS, ...PAGE_ONLY]], ['dark sheet', sheet, PAIRS]]) {
  test(`${name}: text reaches 4.5:1, and icons and chart marks 3:1, on the surfaces they sit on`, () => {
    for (const [min, fg, top, base] of pairs) {
      const bg = base ? over(color(top, t), color(base, t)) : color(top, t);
      const r = ratio(color(fg, t), bg);
      assert.ok(r >= min, `${fg} on ${top}${base ? ` over ${base}` : ''} is ${r.toFixed(2)}:1, under ${min}:1`);
    }
  });
}

// The over-target arcs have their own rules, not tokens: the first for each ring draws light mode, and a dark-mode one after it replaces it.
const arcs = (kind) => [...css.matchAll(new RegExp(`\\.ring\\.${kind} \\.ring-over \\{ stroke: ([^;]+); \\}`, 'g'))].map((m) => m[1]);
test('the over-target arcs on Today reach 3:1 on the card in light and dark', () => {
  for (const kind of ['fuel', 'water', 'effort']) {
    const [lightArc, darkArc] = arcs(kind);
    for (const [name, t, v] of [['light', light, lightArc], ['dark', dark, darkArc ?? lightArc]]) {
      const r = ratio(rgba(v, t), color('cell', t));
      assert.ok(r >= 3, `${name}: the ${kind} over arc is ${r.toFixed(2)}:1 on the card, under 3:1`);
    }
  }
});

test('the contrast maths matches known pairs', () => {
  assert.equal(ratio([0, 0, 0], [1, 1, 1]).toFixed(1), '21.0');
  assert.equal(ratio(rgba('#767676', {}), [1, 1, 1]).toFixed(2), '4.54');
  assert.deepEqual(rgba('color-mix(in srgb, #ffffff 50%, #000000)', {}).map((x) => x.toFixed(2)), ['0.50', '0.50', '0.50', '1.00']);
});

test('labels stay in sentence case and upright', () => {
  assert.doesNotMatch(css, /text-transform:\s*uppercase|small-caps|font-style:\s*(italic|oblique)/);
});
