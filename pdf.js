// A minimal PDF 1.4 writer (A4 pages, the built-in Helvetica fonts, text, lines and boxes) and the one-page doctor
// summary drawn with it. Nothing is embedded, so the file stays small and any PDF reader can show it.
import { parse, diffDays } from './logic.js';

const PAGE = [595.28, 841.89]; // A4 in points

// WinAnsi text: printable ASCII and Latin-1 pass, the minus sign, curly quotes and the multiplication sign become
// plain ones, and anything else becomes '?'.
export function pdfText(s) {
  return String(s).replace(/\u2212/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u00d7/g, 'x')
    .replace(/[^\x20-\x7e\xa0-\xff]/gu, '?').replace(/[\\()]/g, '\\$&');
}
const num = (v) => +v.toFixed(2);
// Content-stream operators. Gray runs from 0 (black) to 1 (white); y counts up from the bottom of the page.
export const text = (x, y, s, size = 10, bold = false, gray = 0) => `BT ${gray} g /F${bold ? 2 : 1} ${size} Tf ${num(x)} ${num(y)} Td (${pdfText(s)}) Tj ET\n`;
// A straight line, or a polyline through more [x, y] points.
export const line = (pts, width = 0.5, gray = 0) => `${gray} G ${width} w ${pts.map(([x, y], i) => `${num(x)} ${num(y)} ${i ? 'l' : 'm'}`).join(' ')} S\n`;
export const rect = (x, y, w, h, gray = 0) => `${gray} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f\n`;

// One content stream per page. Every character is a single byte, so string offsets are byte offsets for the xref table.
// The catalog names the language and the Info dictionary the title, which screen readers and viewers show.
export function pdfBytes(pages, title) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R /Lang (en-GB) >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ...pages.flatMap((ops, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.join(' ')}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`,
      `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
    ]),
    `<< /Title (${pdfText(title)}) >>`,
  ];
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const at = objs.map((o, i) => { const pos = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((pos) => `${String(pos).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

const day = (d) => parse(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmt = (v) => Math.round(v).toLocaleString('en-GB');
const signed = (v, dp = 1) => { const s = Math.abs(v).toFixed(dp); return +s ? `${v > 0 ? '+' : '-'}${s}` : s; };
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;
const SOFT = 0.35; // secondary text and labels

// The weight trend as a line and each weigh-in as a dot across from..to, with the kg range at the left.
// The legend sits at y; returns the operators and the y below the dates.
function trendChart(w, from, to, y) {
  const x0 = 86, x1 = 545, h = 80, y0 = y - h - 16;
  const vals = [...w.trend, ...w.weighIns].map(([, v]) => v);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const span = Math.max(1, diffDays(from, to));
  const X = (d) => x0 + ((x1 - x0) * diffDays(from, d)) / span;
  const Y = (v) => y0 + (h * (v - lo)) / (hi - lo);
  let ops = line([[x0, y - 3], [x0 + 14, y - 3]], 1.2) + text(x0 + 19, y - 6, 'Trend', 8, false, SOFT);
  ops += rect(x0 + 62, y - 4.6, 3, 3) + text(x0 + 70, y - 6, 'Weigh-ins', 8, false, SOFT);
  for (const v of [hi, lo]) ops += line([[x0, Y(v)], [x1, Y(v)]], 0.5, 0.75) + text(50, Y(v) - 3, `${v} kg`, 8, false, SOFT);
  ops += line(w.trend.map(([d, v]) => [X(d), Y(v)]), 1.2);
  ops += w.weighIns.map(([d, v]) => rect(X(d) - 1.5, Y(v) - 1.5, 3, 3)).join('');
  // shortcut: the end date is right-aligned on an average character width, fine for a short date in Helvetica.
  const end = day(to);
  ops += text(x0, y0 - 12, day(from), 8, false, SOFT) + text(x1 - end.length * 4, y0 - 12, end, 8, false, SOFT);
  return [ops, y0 - 26];
}

// The summary from doctorSummary on one A4 page, made on the date given. Returns the file's bytes.
export function summaryPdf(s, made) {
  let y = 790, ops = '';
  const say = (str) => { ops += text(50, y, str); y -= 14; };
  const head = (str) => { y -= 12; ops += text(50, y, str, 12, true); y -= 17; };
  ops += text(50, y, 'Health summary from Steady', 18, true);
  y -= 22;
  say(s.days ? `${day(s.from)} to ${day(s.to)}, ${plural(s.days, 'day')}. Made ${day(made)}.` : `The plan starts on ${day(s.from)}. Made ${day(made)}.`);

  head('Weight');
  const w = s.weight;
  if (!w) say('No weigh-ins yet.');
  else {
    // The change is taken from the two rounded values, so the printed numbers add up.
    say(w.change == null ? `Trend: ${w.end[1].toFixed(1)} kg on ${day(w.end[0])}.`
      : `Trend: ${w.start[1].toFixed(1)} kg on ${day(w.start[0])} and ${w.end[1].toFixed(1)} kg on ${day(w.end[0])}, a change of ${signed(w.end[1].toFixed(1) - w.start[1].toFixed(1))} kg.`);
    say(w.kgPerWeek == null ? 'Too few weigh-ins in the last 4 weeks to give a weekly rate.' : `Rate over the last 4 weeks: ${signed(w.kgPerWeek, 2)} kg a week.`);
    say(`Last weigh-in: ${w.last[1].toFixed(1)} kg on ${day(w.last[0])}. Weigh-ins in this period: ${w.weighIns.length}.`);
    if (w.trend.length > 1) {
      const [chart, below] = trendChart(w, s.from, s.to, y);
      ops += chart;
      y = below;
    }
  }

  head('Blood pressure at home');
  const b = s.bp;
  if (b.week) say(`Last 7 days: ${b.week.sys}/${b.week.dia} mmHg on average, from ${plural(b.week.n, 'reading')}.`);
  if (b.n) say(`Whole period: ${b.sys}/${b.dia} mmHg on average, from ${plural(b.n, 'reading')}. Highest: ${b.high.sys}/${b.high.dia} on ${day(b.high.date)}.`);
  if (!b.week && !b.n) say('No home readings in this period.');

  head('Blood tests');
  if (!s.labs.some((l) => l.latest)) say('No results yet.');
  else {
    const cols = [50, 140, 260, 365, 440];
    const row = (cells, bold = false) => { cells.forEach((c, i) => { ops += text(cols[i], y, c, 9, bold); }); y -= 13; };
    row(['Test', 'Latest', 'Previous', 'Target', 'Status'], true);
    for (const l of s.labs) row([l.name, l.latest ? `${l.latest[1]} ${l.unit}, ${day(l.latest[0])}` : 'no result', l.previous ? `${l.previous[1]}, ${day(l.previous[0])}` : '', l.target, l.status ?? '']);
  }

  head('Waist');
  const ws = s.waist;
  say(!ws ? 'No measurements yet.' : `${ws.latest[1]} cm on ${day(ws.latest[0])}${ws.change == null ? '' : `, ${signed(ws.change)} cm since ${day(ws.since)}`}.`);

  if (s.days) {
    const t = s.training, f = s.food;
    head('Training');
    say(`Sessions done: ${t.done} of ${t.planned} planned, post-meal walks included.`);
    say(t.exDays ? `Exercise: ${plural(t.exMinPerWeek, 'minute')} a week on average, over ${t.exDays} of ${plural(s.days, 'day')}.` : 'No exercise data.');
    say(t.stepsAvg == null ? 'No step data.' : `Steps: ${fmt(t.stepsAvg)} a day on average.`);
    head('Food');
    say(`Food logged on ${f.daysLogged} of ${plural(s.days, 'day')}.`);
    if (f.daysLogged) {
      say(`Energy: ${fmt(f.kcal)} kcal a day on average, against a limit of ${fmt(f.kcalTarget)} kcal.`);
      say(`Protein: ${f.protein} g a day on average, against a target of ${f.proteinTarget} g.`);
    }
  }

  ops += line([[50, 54], [545, 54]], 0.5, 0.75) + text(50, 40, 'Self-logged in Steady. Estimates, not a diagnosis.', 8, false, SOFT);
  return pdfBytes([ops], 'Health summary from Steady');
}
