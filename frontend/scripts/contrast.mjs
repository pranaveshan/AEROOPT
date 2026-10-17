// WCAG 2.x contrast check for v3 token pairs. Reads hex values from tokens-v3.css and blends rgba hairlines over their surface.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/v3/styles/tokens-v3.css', import.meta.url), 'utf8');
const tok = n => { const m = css.match(new RegExp(`--${n}:\\s*([^;]+);`)); if (!m) throw new Error(`missing token ${n}`); return m[1].trim(); };
const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const blend = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const c = n => hex(tok(n));
const pairs = [
  // [label, fg, bg, min, note]
  ['text on void', c('text'), c('void'), 4.5],
  ['text on panel', c('text'), c('panel'), 4.5],
  ['text-muted on panel (micro labels, notes)', c('text-muted'), c('panel'), 4.5],
  ['text-muted on void', c('text-muted'), c('void'), 4.5],
  ['text-muted on deep', c('text-muted'), c('deep'), 4.5],
  ['text-faint on panel (non-essential only)', c('text-faint'), c('panel'), 3.0],
  ['accent on void (links, focus ring)', c('accent'), c('void'), 4.5],
  ['accent on panel', c('accent'), c('panel'), 4.5],
  ['primary button: void on text', c('void'), c('text'), 4.5],
  ['success on panel', c('success'), c('panel'), 4.5],
  ['warning on panel', c('warning'), c('panel'), 4.5],
  ['danger on panel', c('danger'), c('panel'), 4.5],
  ['warning on scenario banner (12% amber over void)', c('warning'), blend(c('warning'), 0.12, c('void')), 4.5],
  ['banner body #FCE2B0 on scenario banner', hex('#FCE2B0'), blend(c('warning'), 0.12, c('void')), 4.5],
  ['gantt bar label (void on 90% text)', c('void'), blend(c('text'), 0.9, c('panel')), 4.5],
  ['focus ring accent vs void (non-text, 3:1)', c('accent'), c('void'), 3.0],
  ['hairline-strong vs panel (UI boundary, informative)', blend([255, 255, 255], 0.28, c('panel')), c('panel'), 1.0],
];
let fail = 0;
console.log('pair'.padEnd(56), 'ratio'.padStart(7), ' min  result');
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg); const ok = r >= min; if (!ok) fail++;
  console.log(label.padEnd(56), r.toFixed(2).padStart(7), String(min).padStart(4), ok ? ' PASS' : ' FAIL');
}
console.log(fail ? `\n${fail} pair(s) below target` : '\nAll pairs meet their targets');
process.exit(fail ? 1 : 0);
