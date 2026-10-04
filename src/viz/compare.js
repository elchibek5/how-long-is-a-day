// Day-length comparison: one dumbbell per planet, spin (sidereal) vs solar day,
// on a log axis that animates to a linear one. Styles live in compare.css,
// scoped under #compare. Only the DOM inside `root` is touched.
import './compare.css';
import { PLANETS } from '../data/planets.js';
import { solarDayHours, formatDuration, formatNumber } from '../lib/astro.js';

const NS = 'http://www.w3.org/2000/svg';
const LOG_MIN = 6;
const LOG_MAX = 15000;
// Linear axis runs to 6,000 h (not 4,500) so Venus's 5,833 h spin stays on the chart.
const LIN_MAX = 6000;
const LOG_TICKS = [
  { v: 10, label: '10 h', short: '' },
  { v: 24, label: '1 Earth day', short: 'day' },
  { v: 168, label: '1 week', short: 'week' },
  { v: 730, label: '1 month', short: 'month' },
  { v: 8766, label: '1 Earth year', short: 'year' },
];

function h(tag, attrs, parent, text) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
function sv(tag, attrs, parent, text) {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}
function set(n, attrs) { for (const k in attrs) n.setAttribute(k, attrs[k]); }
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

const fmt1 = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hoursAndDays = (hrs) => `${fmt1(hrs)} h · ${fmt1(hrs / 24)} days`;
function valueLabel(hrs, narrow) {
  if (narrow) return hrs >= 72 ? `${fmt1(hrs / 24)} d` : `${fmt1(hrs)} h`;
  return hrs >= 72 ? hoursAndDays(hrs) : formatDuration(hrs).replace(/ 0 m$/, '');
}
function exact(hrs) {
  return hrs >= 72 ? `${fmt1(hrs)} h` : `${hrs.toFixed(2)} h`;
}
function sub(hrs) {
  return hrs >= 72 ? `${fmt1(hrs / 24)} Earth days` : formatDuration(hrs);
}
function gapText(r) {
  const d = r.solar - r.spin;
  const s = Math.abs(d) * 3600;
  if (s < 3600) {
    const t = s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} m ${Math.round(s % 60)} s`;
    return `Solar day is ${t} ${d >= 0 ? 'longer' : 'shorter'} than one spin`;
  }
  const ratio = r.solar / r.spin;
  return ratio >= 1
    ? `One solar day lasts ${formatNumber(ratio, 2)} spins`
    : `One solar day lasts ${formatNumber(ratio, 2)} of a spin`;
}

export function initCompare(root) {
  if (!root) return null;
  const uid = `cmp${Math.random().toString(36).slice(2, 8)}`;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const rows = PLANETS.map((p) => ({ p, spin: p.spinHours, solar: solarDayHours(p) }));
  // t = 0 → log axis, 1 → linear. Rows animate with a small stagger, so each keeps its own t.
  const state = { mode: 'log', grid: 0, rowT: rows.map(() => 0) };
  let anim = 0;

  root.textContent = '';
  const card = h('section', { class: 'panel cmp-card', 'aria-labelledby': `${uid}-title` }, root);
  const head = h('div', { class: 'cmp-head' }, card);
  const titles = h('div', { class: 'cmp-titles' }, head);
  h('p', { class: 'eyebrow' }, titles, 'Day length, all eight planets');
  h('h4', { class: 'cmp-title', id: `${uid}-title` }, titles, 'One spin vs. one solar day, in hours');
  const seg = h('div', { class: 'cmp-seg', role: 'group', 'aria-label': 'Axis scale', 'data-mode': 'log' }, head);
  h('span', { class: 'cmp-seg-thumb', 'aria-hidden': 'true' }, seg);
  const bLog = h('button', { type: 'button', 'aria-pressed': 'true' }, seg, 'Log scale');
  const bLin = h('button', { type: 'button', 'aria-pressed': 'false' }, seg, 'Linear scale');

  const notes = h('div', { class: 'cmp-notes', 'aria-live': 'polite' }, card);
  const noteLog = h('p', { class: 'cmp-note is-on' }, notes,
    'Mercury and Venus: spin and solar day are wildly different. Everywhere else they match to within 4 minutes.');
  const noteLin = h('p', { class: 'cmp-note' }, notes,
    'On a linear scale the fast spinners all pile up near zero — that’s why scientists use log scales.');

  const legend = h('div', { class: 'cmp-legend' }, card);
  const key = (marks, label) => {
    const item = h('span', { class: 'cmp-key' }, legend);
    const ico = sv('svg', { viewBox: '0 0 18 18', width: 18, height: 18, 'aria-hidden': 'true' }, item);
    for (const [cls, r] of marks) sv('circle', { cx: 9, cy: 9, r, class: cls }, ico);
    item.append(label);
  };
  key([['cmp-spin', 7.5]], 'Spin: one full turn against the stars');
  key([['cmp-solar', 4.5]], 'Solar day: noon to noon');
  key([['cmp-spin', 7.5], ['cmp-solar', 4.5]], 'Both in one spot: they match');

  const wrap = h('div', { class: 'cmp-wrap' }, card);
  const svg = sv('svg', { class: 'cmp-svg', role: 'group', 'aria-labelledby': `${uid}-title` }, wrap);
  const tip = h('div', { class: 'cmp-tip', 'aria-hidden': 'true' }, wrap);
  const tipName = h('p', { class: 'cmp-tip-name' }, tip);
  const tipRow = (cls) => {
    const r = h('p', { class: 'cmp-tip-row' }, tip);
    h('span', { class: `cmp-tip-key ${cls}` }, r);
    const v = h('b', null, r);
    const l = h('span', { class: 'cmp-tip-lab' }, r);
    return { v, l };
  };
  const tipSpin = tipRow('is-spin');
  const tipSolar = tipRow('is-solar');
  const tipGap = h('p', { class: 'cmp-tip-gap' }, tip);

  const details = h('details', { class: 'cmp-table' }, card);
  h('summary', null, details, 'Show the numbers as a table');
  const table = h('table', null, details);
  const thr = h('tr', null, h('thead', null, table));
  ['Planet', 'One spin', 'One solar day', 'Difference'].forEach((t) => h('th', { scope: 'col' }, thr, t));
  const tbody = h('tbody', null, table);
  for (const r of rows) {
    const tr = h('tr', null, tbody);
    h('th', { scope: 'row' }, tr, r.p.name);
    h('td', null, tr, `${exact(r.spin)} (${sub(r.spin)})`);
    h('td', null, tr, `${exact(r.solar)} (${sub(r.solar)})`);
    h('td', null, tr, gapText(r));
  }

  /* ---------- layout + drawing ---------- */
  let L = null;
  let els = null;
  let hovered = null;
  const xLog = (v) => L.x0 + (Math.log(Math.max(v, LOG_MIN) / LOG_MIN) / Math.log(LOG_MAX / LOG_MIN)) * (L.x1 - L.x0);
  const xLin = (v) => L.x0 + (v / LIN_MAX) * (L.x1 - L.x0);
  const xAt = (v, t) => xLog(v) + (xLin(v) - xLog(v)) * t;

  function build() {
    const W = Math.max(300, Math.round(wrap.clientWidth || 720));
    const narrow = W < 560;
    const nameW = narrow ? 60 : 92;
    const valW = narrow ? 52 : 176;
    const rowH = narrow ? 40 : 46;
    const top = 26;
    const bottom = 34;
    L = { W, narrow, rowH, top, x0: nameW + (narrow ? 8 : 16), x1: W - valW - (narrow ? 10 : 22) };
    L.plotBottom = top + rowH * rows.length;
    L.H = L.plotBottom + bottom;
    svg.textContent = '';
    set(svg, { viewBox: `0 0 ${W} ${L.H}`, height: L.H });
    const defs = sv('defs', null, svg);
    const clip = sv('clipPath', { id: `${uid}-clip` }, defs);
    sv('rect', { x: L.x0 - 40, y: 0, width: L.x1 - L.x0 + 80, height: L.H }, clip);

    sv('text', { x: W, y: 13, class: 'cmp-colhead', 'text-anchor': 'end' }, svg, 'Solar day');
    const grid = sv('g', { 'clip-path': `url(#${uid}-clip)` }, svg);
    const tickEls = (v, label, kind) => ({
      v, kind,
      line: sv('line', { y1: top - 4, y2: L.plotBottom, class: `cmp-grid ${kind === 'log' && v === 24 ? 'is-day' : ''}` }, grid),
      text: label ? sv('text', { y: L.plotBottom + 20, class: 'cmp-xlab', 'text-anchor': 'middle' }, grid, label) : null,
    });
    const logEls = LOG_TICKS.map((t) => tickEls(t.v, narrow ? t.short : t.label, 'log'));
    const linVals = narrow ? [0, 2000, 4000, 6000] : [0, 1000, 2000, 3000, 4000, 5000, 6000];
    const linEls = linVals.map((v) => tickEls(v, v === 0 ? '0' : `${formatNumber(v, 0)} h`, 'lin'));

    const rowEls = rows.map((r, i) => {
      const cy = top + rowH * (i + 0.5);
      const g = sv('g', {
        class: 'cmp-row', tabindex: '0', role: 'img',
        'aria-label': `${r.p.name}: one spin ${exact(r.spin)}, one solar day ${exact(r.solar)}. ${gapText(r)}.`,
      }, svg);
      sv('rect', { x: 0, y: cy - rowH / 2 + 3, width: W, height: rowH - 6, rx: 10, class: 'cmp-band' }, g);
      sv('line', { x1: L.x0, x2: L.x1, y1: cy, y2: cy, class: 'cmp-track' }, g);
      sv('text', { x: 0, y: cy + 4.5, class: 'cmp-name', style: `fill:${r.p.accent}` }, g, r.p.name);
      const grad = sv('linearGradient', { id: `${uid}-g${i}`, gradientUnits: 'userSpaceOnUse', y1: cy, y2: cy }, defs);
      sv('stop', { offset: '0', style: 'stop-color:var(--sky)' }, grad);
      sv('stop', { offset: '1', style: 'stop-color:var(--sun)' }, grad);
      const link = sv('line', { y1: cy, y2: cy, class: 'cmp-link', stroke: `url(#${uid}-g${i})` }, g);
      const dSpin = sv('circle', { cy, r: narrow ? 6.5 : 7.5, class: 'cmp-spin' }, g); // bottom layer: shows as a ring when the days coincide
      const dSolar = sv('circle', { cy, r: narrow ? 4 : 4.5, class: 'cmp-solar' }, g);
      sv('text', { x: W, y: cy + 4.5, class: 'cmp-val', 'text-anchor': 'end' }, g, valueLabel(r.solar, narrow));
      const enter = () => showTip(i);
      g.addEventListener('pointerenter', enter);
      g.addEventListener('focus', enter);
      g.addEventListener('pointerleave', hideTip);
      g.addEventListener('blur', hideTip);
      return { g, grad, link, dSpin, dSolar, cy };
    });
    els = { logEls, linEls, rowEls };
    draw();
    if (hovered != null) showTip(hovered);
  }

  function draw() {
    if (!els) return;
    const tg = state.grid;
    const oLog = clamp01(1 - tg / 0.6);
    const oLin = clamp01((tg - 0.4) / 0.6);
    for (const e of [...els.logEls, ...els.linEls]) {
      const x = xAt(e.v, tg);
      const o = e.kind === 'log' ? oLog : oLin;
      set(e.line, { x1: x, x2: x });
      e.line.style.opacity = o;
      if (e.text) { e.text.setAttribute('x', x); e.text.style.opacity = o; }
    }
    rows.forEach((r, i) => {
      const e = els.rowEls[i];
      const t = state.rowT[i];
      const xs = xAt(r.spin, t);
      const xo = xAt(r.solar, t);
      set(e.dSpin, { cx: xs });
      set(e.dSolar, { cx: xo });
      set(e.link, { x1: xs, x2: xo });
      set(e.grad, { x1: xs, x2: xo + (Math.abs(xo - xs) < 0.5 ? 0.5 : 0) });
    });
    if (hovered != null) placeTip(hovered);
  }

  function animateTo(target) {
    cancelAnimationFrame(anim);
    if (reduceMotion) {
      state.grid = target;
      state.rowT = rows.map(() => target);
      draw();
      return;
    }
    const fromGrid = state.grid;
    const fromRows = state.rowT.slice();
    const dur = 900;
    const stagger = 45;
    const t0 = performance.now();
    const step = (now) => {
      const el = now - t0;
      state.grid = fromGrid + (target - fromGrid) * ease(clamp01(el / dur));
      state.rowT = fromRows.map((f, i) => f + (target - f) * ease(clamp01((el - i * stagger) / dur)));
      draw();
      if (el < dur + stagger * rows.length) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    seg.dataset.mode = mode;
    bLog.setAttribute('aria-pressed', String(mode === 'log'));
    bLin.setAttribute('aria-pressed', String(mode === 'linear'));
    noteLog.classList.toggle('is-on', mode === 'log');
    noteLin.classList.toggle('is-on', mode === 'linear');
    animateTo(mode === 'linear' ? 1 : 0);
  }
  bLog.addEventListener('click', () => setMode('log'));
  bLin.addEventListener('click', () => setMode('linear'));

  /* ---------- tooltip ---------- */
  function placeTip(i) {
    const r = rows[i];
    const e = els.rowEls[i];
    const t = state.rowT[i];
    const x = Math.max(xAt(r.spin, t), xAt(r.solar, t));
    const scale = svg.getBoundingClientRect().width / L.W || 1;
    const half = Math.min(150, (L.W * scale) / 2);
    tip.style.left = `${Math.min(Math.max(x * scale, half), L.W * scale - half)}px`;
    tip.style.top = `${(e.cy - L.rowH / 2) * scale}px`;
  }
  function showTip(i) {
    hovered = i;
    const r = rows[i];
    tipName.textContent = r.p.name;
    tipSpin.v.textContent = exact(r.spin);
    tipSpin.l.textContent = `spin · ${sub(r.spin)}`;
    tipSolar.v.textContent = exact(r.solar);
    tipSolar.l.textContent = `solar day · ${sub(r.solar)}`;
    tipGap.textContent = gapText(r);
    els.rowEls.forEach((e, j) => e.g.classList.toggle('is-hover', j === i));
    placeTip(i);
    tip.classList.add('is-on');
  }
  function hideTip() {
    hovered = null;
    tip.classList.remove('is-on');
    els?.rowEls.forEach((e) => e.g.classList.remove('is-hover'));
  }

  build();
  let lastW = wrap.clientWidth;
  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { if (wrap.clientWidth !== lastW) { lastW = wrap.clientWidth; build(); } })
    : null;
  ro?.observe(wrap);
  document.fonts?.ready?.then(() => build());
  return {
    destroy() { ro?.disconnect(); cancelAnimationFrame(anim); root.textContent = ''; },
  };
}
