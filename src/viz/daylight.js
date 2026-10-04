// Daylight geometry lab: why the Sun stays up longer or shorter depending on
// latitude, season and tilt. Two linked views of one geometry:
//   A. side view, sunlight from the left: the spin axis leans δ toward the Sun,
//      the latitude circle is seen edge-on and the terminator splits it;
//   B. the same latitude circle seen from above the pole: the lit arc is 2H₀,
//      so the daylight fraction is 2H₀ / 360°.
// Below them: a live readout, the formula with today's numbers, and the
// daylight curve across the whole year. Styles live in daylight.css, scoped
// under #daylight-lab. Only the DOM inside `root` is touched.
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './daylight.css';
import { PLANETS, PLANET_BY_ID } from '../data/planets.js';
import {
  solarDayHours, declination, effectiveTilt, sunriseHourAngle, daylightFraction,
  formatDuration, formatNumber, clamp,
} from '../lib/astro.js';

const NS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
// Both diagrams share one frame: 380 × 360, circle of radius R centred at (CX, CY).
const VB_W = 380;
const VB_H = 360;
const CX = 190;
const CY = 180;
const R = 120;

const QUICK = [
  { label: 'San Francisco', lat: 37.8 },
  { label: 'Equator', lat: 0 },
  { label: 'Arctic Circle', lat: 66.6 },
  { label: 'North Pole', lat: 90 },
  { label: 'Utqiaġvik, Alaska', lat: 71.3 },
];

// Season angle L: 0 = northern spring equinox, 90 = June solstice, ...
// Month names only make sense on Earth; elsewhere we name the northern season.
const SEASONS_EARTH = [
  { at: 0, name: 'March equinox', tick: 'Mar equinox', short: 'Mar' },
  { at: 90, name: 'June solstice', tick: 'Jun solstice', short: 'Jun' },
  { at: 180, name: 'September equinox', tick: 'Sep equinox', short: 'Sep' },
  { at: 270, name: 'December solstice', tick: 'Dec solstice', short: 'Dec' },
];
const SEASONS_OTHER = [
  { at: 0, name: 'northern spring equinox', tick: 'Spring equinox', short: 'Spring' },
  { at: 90, name: 'northern summer solstice', tick: 'Summer solstice', short: 'Summer' },
  { at: 180, name: 'northern autumn equinox', tick: 'Autumn equinox', short: 'Autumn' },
  { at: 270, name: 'northern winter solstice', tick: 'Winter solstice', short: 'Winter' },
];
const seasonsFor = (planet) => (planet.id === 'earth' ? SEASONS_EARTH : SEASONS_OTHER);

// Real 2026 dates of Earth's equinoxes/solstices, for "≈ Jul 21" labels.
const EARTH_ANCHORS = [
  [0, Date.UTC(2026, 2, 20)], [90, Date.UTC(2026, 5, 21)], [180, Date.UTC(2026, 8, 22)],
  [270, Date.UTC(2026, 11, 21)], [360, Date.UTC(2027, 2, 20)],
];

/* ---------- small DOM helpers ---------- */
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
function show(n, on) { n.style.display = on ? '' : 'none'; }
function bbox(n, fallbackChars = 8) {
  try { const b = n.getBBox(); if (b.width > 0) return b; } catch { /* not rendered yet */ }
  return { x: 0, y: 0, width: fallbackChars * 7, height: 14 };
}
const ital = (parent, txt) => h('i', { class: 'dl-var' }, parent, txt);

/* ---------- number formatting ---------- */
const MINUS = '−';
function fix(x, d = 1) {
  const p = 10 ** d;
  const v = Math.round(x * p) / p;
  return (Object.is(v, -0) ? 0 : v).toFixed(d);
}
const signed1 = (x) => { const s = fix(x); return s === '0.0' ? '0.0' : (x > 0 ? '+' : MINUS) + s.replace('-', ''); };
const dur = (hours) => formatDuration(hours).replace(/ 0 m$/, '');
function pct(f) {
  const p = f * 100;
  if ((p > 0 && p < 1) || (p > 99 && p < 100)) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}
const latText = (lat) => (Math.abs(lat) < 0.05 ? '0.0° (equator)' : `${fix(Math.abs(lat))}° ${lat > 0 ? 'N' : 'S'}`);
const latSpoken = (lat) => (Math.abs(lat) < 0.05 ? 'the equator' : `${fix(Math.abs(lat))} degrees ${lat > 0 ? 'north' : 'south'}`);
// "14 h 37 m" → 14\,\text{h}\;37\,\text{m}
function texDur(str) {
  let out = '';
  let words = [];
  const flush = () => { if (words.length) { out += `\\,\\text{${words.join(' ')}}`; words = []; } };
  for (const p of str.split(' ')) {
    if (/^[\d.,]+$/.test(p)) { flush(); out += (out ? '\\;' : '') + p.replace(/,/g, '{,}'); } else words.push(p);
  }
  flush();
  return out;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- the model ---------- */
function cleanDecl(planet, L) {
  const d = declination(planet.tiltDeg, L);
  return Math.abs(d) < 1e-9 ? 0 : d; // sin(180°) is 1e-16 in floating point, not 0
}
function model(state) {
  const planet = PLANET_BY_ID[state.planetId];
  const T = solarDayHours(planet);
  const delta = cleanDecl(planet, state.season);
  const lat = state.lat;
  const cosH0 = -Math.tan(lat * RAD) * Math.tan(delta * RAD);
  const H0 = sunriseHourAngle(lat, delta);
  const frac = daylightFraction(lat, delta);
  return { planet, T, delta, lat, season: state.season, cosH0, H0, frac, dayH: frac * T, nightH: (1 - frac) * T };
}
const dayAt = (planet, T, lat, L) => daylightFraction(lat, cleanDecl(planet, L)) * T;

function seasonName(planet, L) {
  const names = seasonsFor(planet);
  const i = Math.round(L / 90) % 4;
  const diff = Math.abs(L - Math.round(L / 90) * 90);
  return diff < 0.5 ? cap(names[i].name) : `near ${names[i].name}`;
}
function seasonPoint(planet, L) {
  const names = seasonsFor(planet);
  const exact = names.find((n) => Math.abs(n.at - (L % 360)) < 0.5);
  if (exact) return cap(exact.name);
  if (planet.id === 'earth') {
    const i = Math.min(3, Math.floor(L / 90));
    const [a0, m0] = EARTH_ANCHORS[i];
    const [, m1] = EARTH_ANCHORS[i + 1];
    const ms = m0 + ((L - a0) / 90) * (m1 - m0);
    return `≈ ${new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  }
  return `Season ${Math.round(L)}°`;
}
function arc(cx, cy, r, a0, a1) {
  // SVG polar degrees (0 = +x, 90 = down). Draws from a0 to a1 in the direction of the sign of a1 − a0.
  const x0 = cx + r * Math.cos(a0 * RAD);
  const y0 = cy + r * Math.sin(a0 * RAD);
  const x1 = cx + r * Math.cos(a1 * RAD);
  const y1 = cy + r * Math.sin(a1 * RAD);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)},${y1.toFixed(2)}`;
}
const pt2 = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
function pickStep(max, days) {
  const steps = days ? [1, 2, 5, 10, 20, 25, 50, 100, 200, 500] : [1, 2, 3, 4, 6, 8, 12, 24, 48];
  return steps.find((s) => s >= max / 5) || steps[steps.length - 1];
}

export function initDaylight(root) {
  if (!root) return null;
  const uid = `dl${Math.random().toString(36).slice(2, 8)}`;
  const state = { planetId: 'earth', lat: 37.8, season: 90 };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

  root.textContent = '';
  const card = h('section', { class: 'panel dl-card', 'aria-labelledby': `${uid}-title` }, root);

  /* ---------- header ---------- */
  const head = h('header', { class: 'dl-head' }, card);
  h('p', { class: 'eyebrow' }, head, 'Daylight geometry lab');
  h('h3', { class: 'dl-title', id: `${uid}-title` }, head, 'Why the Sun stays up longer, or shorter');
  h('p', { class: 'dl-lede' }, head,
    'Every place rides once around its circle of latitude per day. Lean the spin axis toward the Sun and more of that circle sits in sunlight, so the day gets longer. Both views below show the same geometry.');

  /* ---------- controls ---------- */
  const controls = h('div', { class: 'dl-controls' }, card);
  const planetRow = h('div', { class: 'dl-planets', role: 'group', 'aria-label': 'Planet' }, controls);
  const planetBtns = PLANETS.map((p) => {
    const b = h('button', { type: 'button', class: 'chip dl-planet', 'aria-pressed': 'false' }, planetRow);
    h('span', { class: 'dl-planet-dot', 'aria-hidden': 'true', style: `--c:${p.accent}` }, b);
    b.append(p.name);
    b.addEventListener('click', () => { state.planetId = p.id; schedule(); });
    return { b, id: p.id };
  });
  const planetInfo = h('p', { class: 'dl-planet-info' }, controls);

  const sliders = h('div', { class: 'dl-sliders' }, controls);
  // latitude
  const latBox = h('div', { class: 'range dl-range' }, sliders);
  const latLab = h('label', { for: `${uid}-lat` }, latBox);
  const latName = h('span', { class: 'dl-range-name' }, latLab, 'Latitude ');
  ital(latName, 'φ');
  const latOut = h('output', { for: `${uid}-lat`, class: 'dl-out' }, latLab);
  const latIn = h('input', { type: 'range', id: `${uid}-lat`, min: '-90', max: '90', step: '0.1', value: String(state.lat) }, latBox);
  const quick = h('div', { class: 'dl-quick', role: 'group', 'aria-label': 'Quick latitude picks' }, latBox);
  const quickBtns = QUICK.map((q) => {
    const b = h('button', { type: 'button', class: 'chip dl-qchip', 'aria-pressed': 'false' }, quick, `${q.label} `);
    h('span', { class: 'dl-qlat' }, b, `${q.lat}°`);
    b.addEventListener('click', () => { state.lat = q.lat; latIn.value = String(q.lat); schedule(); });
    return { b, lat: q.lat };
  });
  latIn.addEventListener('input', () => { state.lat = Number(latIn.value); schedule(); });

  // season
  const seaBox = h('div', { class: 'range dl-range' }, sliders);
  const seaLab = h('label', { for: `${uid}-sea` }, seaBox);
  h('span', { class: 'dl-range-name' }, seaLab, 'Season');
  const seaOut = h('output', { for: `${uid}-sea`, class: 'dl-out' }, seaLab);
  const seaIn = h('input', { type: 'range', id: `${uid}-sea`, min: '0', max: '360', step: '1', value: String(state.season) }, seaBox);
  const seaTicks = h('div', { class: 'dl-sea-ticks' }, seaBox);
  const seaTickBtns = [0, 90, 180, 270].map((at) => {
    const b = h('button', { type: 'button', class: 'dl-sea-tick', style: `--p:${at / 360}` }, seaTicks);
    b.addEventListener('click', () => { state.season = at; seaIn.value = String(at); schedule(); });
    return { b, at };
  });
  seaIn.addEventListener('input', () => { state.season = Number(seaIn.value); schedule(); });

  /* ---------- the two views ---------- */
  const views = h('div', { class: 'dl-views' }, card);
  const figA = h('figure', { class: 'dl-view' }, views);
  h('figcaption', { class: 'dl-view-title' }, figA, 'Side view — sunlight from the left');
  const svgA = sv('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, class: 'dl-svg', role: 'img' }, figA);
  h('p', { class: 'dl-view-cap' }, figA,
    'The axis leans δ toward the Sun. The bar is your latitude circle seen edge-on: gold where it is in sunlight, blue in shadow.');

  const figB = h('figure', { class: 'dl-view' }, views);
  h('figcaption', { class: 'dl-view-title' }, figB, 'Looking down at that latitude circle');
  const svgB = sv('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, class: 'dl-svg', role: 'img' }, figB);
  const capB = h('div', { class: 'dl-view-cap dl-size' }, figB);
  const sizeIco = sv('svg', { viewBox: '0 0 34 34', class: 'dl-size-ico', 'aria-hidden': 'true' }, capB);
  sv('circle', { cx: 17, cy: 17, r: 14, class: 'dl-size-R' }, sizeIco);
  const sizeInner = sv('circle', { cx: 17, cy: 17, r: 10, class: 'dl-size-r' }, sizeIco);
  const sizeText = h('p', null, capB);
  const sizeLine = h('span', { class: 'dl-size-line' }, sizeText);
  sizeLine.append('Drawn at one size. The real radius shrinks to ');
  ital(sizeLine, 'R');
  sizeLine.append('·cos ');
  ital(sizeLine, 'φ');
  sizeLine.append(' = ');
  const sizeVal = h('b', null, sizeLine);
  h('br', null, sizeText);
  const tickLine = h('span', { class: 'dl-tick-line' }, sizeText);

  /* ----- view A skeleton ----- */
  const A = {};
  {
    const defs = sv('defs', null, svgA);
    const lit = sv('linearGradient', { id: `${uid}-lit`, x1: CX - R, y1: 0, x2: CX, y2: 0, gradientUnits: 'userSpaceOnUse' }, defs);
    sv('stop', { offset: '0', class: 'dl-st-lit0' }, lit);
    sv('stop', { offset: '0.6', class: 'dl-st-lit1' }, lit);
    sv('stop', { offset: '1', class: 'dl-st-lit2' }, lit);
    const night = sv('linearGradient', { id: `${uid}-night`, x1: CX, y1: 0, x2: CX + R, y2: 0, gradientUnits: 'userSpaceOnUse' }, defs);
    sv('stop', { offset: '0', class: 'dl-st-n0' }, night);
    sv('stop', { offset: '1', class: 'dl-st-n1' }, night);
    const halo = sv('radialGradient', { id: `${uid}-halo`, cx: CX, cy: CY, r: R + 36, gradientUnits: 'userSpaceOnUse' }, defs);
    sv('stop', { offset: String(R / (R + 36)), class: 'dl-st-h0' }, halo);
    sv('stop', { offset: '1', class: 'dl-st-h1' }, halo);
    const clip = sv('clipPath', { id: `${uid}-disc` }, defs);
    sv('circle', { cx: CX, cy: CY, r: R }, clip);
    const left = sv('clipPath', { id: `${uid}-left` }, defs);
    sv('rect', { x: 0, y: 0, width: CX, height: VB_H }, left);
    const mk = sv('marker', { id: `${uid}-ray`, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '8', markerHeight: '8', markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
    sv('path', { d: 'M0,1.5 L9,5 L0,8.5 Z', class: 'dl-ray-head' }, mk);

    sv('circle', { cx: CX, cy: CY, r: R + 36, fill: `url(#${uid}-halo)`, 'clip-path': `url(#${uid}-left)` }, svgA);
    sv('line', { x1: CX, y1: CY - R - 36, x2: CX, y2: CY + R + 36, class: 'dl-ref' }, svgA);
    const rays = sv('g', { class: 'dl-rays' }, svgA);
    for (const dy of [-100, -60, -20, 20, 60, 100]) {
      sv('line', { x1: 10, y1: CY + dy, x2: CX - Math.sqrt(R * R - dy * dy) - 6, y2: CY + dy, 'marker-end': `url(#${uid}-ray)` }, rays);
    }
    sv('text', { x: 10, y: CY - 112, class: 'dl-t dl-t-cap' }, svgA, 'sunlight');
    const disc = sv('g', { 'clip-path': `url(#${uid}-disc)` }, svgA);
    sv('rect', { x: CX - R, y: CY - R, width: R, height: 2 * R, fill: `url(#${uid}-lit)` }, disc);
    sv('rect', { x: CX, y: CY - R, width: R, height: 2 * R, fill: `url(#${uid}-night)` }, disc);
    sv('line', { x1: CX, y1: CY - R, x2: CX, y2: CY + R, class: 'dl-term' }, svgA);
    sv('circle', { cx: CX, cy: CY, r: R, class: 'dl-limb' }, svgA);
    A.equator = sv('line', { class: 'dl-eq' }, svgA);
    A.eqLabel = sv('text', { class: 'dl-t dl-t-eq dl-halo', 'text-anchor': 'middle' }, svgA, 'equator');
    A.axis = sv('line', { class: 'dl-axis' }, svgA);
    A.phiRay = sv('line', { class: 'dl-phi-ray' }, svgA);
    A.phiArc = sv('path', { class: 'dl-angle' }, svgA);
    A.chordGlow = sv('line', { class: 'dl-chord-glow' }, svgA);
    A.chordLit = sv('line', { class: 'dl-chord dl-chord-lit' }, svgA);
    A.chordDark = sv('line', { class: 'dl-chord dl-chord-dark' }, svgA);
    A.chordLabel = sv('text', { class: 'dl-t dl-t-chord dl-halo' }, svgA, 'your latitude');
    A.cross = sv('circle', { r: 4, class: 'dl-cross' }, svgA);
    A.poleN = sv('circle', { r: 3.5, class: 'dl-pole' }, svgA);
    A.poleS = sv('circle', { r: 3.5, class: 'dl-pole' }, svgA);
    A.dArc = sv('path', { class: 'dl-angle' }, svgA);
    A.dLabel = sv('text', { class: 'svg-math dl-math dl-halo', 'text-anchor': 'middle' }, svgA, 'δ');
    A.phiLabel = sv('text', { class: 'svg-math dl-math dl-halo', 'text-anchor': 'middle' }, svgA, 'φ');
    A.nLabel = sv('text', { class: 'svg-label-strong dl-ns', 'text-anchor': 'middle' }, svgA, 'N');
    A.sLabel = sv('text', { class: 'svg-label-strong dl-ns', 'text-anchor': 'middle' }, svgA, 'S');
    sv('text', { x: 10, y: VB_H - 8, class: 'dl-t dl-t-side' }, svgA, 'day side');
    sv('text', { x: VB_W - 10, y: VB_H - 8, class: 'dl-t dl-t-side', 'text-anchor': 'end' }, svgA, 'night side');
  }

  /* ----- view B skeleton ----- */
  const B = {};
  {
    const defs = sv('defs', null, svgB);
    const glow = sv('filter', { id: `${uid}-glow`, x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    sv('feGaussianBlur', { stdDeviation: '5' }, glow);
    const rays = sv('g', { class: 'dl-rays' }, svgB);
    for (const dy of [-84, -42, 42, 84]) {
      sv('line', { x1: 10, y1: CY + dy, x2: CX - Math.sqrt((R + 22) ** 2 - dy * dy) - 2, y2: CY + dy, 'marker-end': `url(#${uid}-ray)` }, rays);
    }
    sv('text', { x: 10, y: CY - 100, class: 'dl-t dl-t-cap' }, svgB, 'sunlight');
    B.litFill = sv('path', { class: 'dl-fill-lit' }, svgB);
    B.darkFill = sv('path', { class: 'dl-fill-dark' }, svgB);
    const ticks = sv('g', null, svgB);
    B.ticks = Array.from({ length: 24 }, (_, n) => sv('line', { class: n % 6 === 0 ? 'dl-tick is-major' : 'dl-tick' }, ticks));
    B.litGlow = sv('path', { class: 'dl-arc-glow', filter: `url(#${uid}-glow)` }, svgB);
    B.litArc = sv('path', { class: 'dl-arc dl-arc-lit' }, svgB);
    B.darkArc = sv('path', { class: 'dl-arc dl-arc-dark' }, svgB);
    B.chord = sv('line', { class: 'dl-chord-b' }, svgB);
    B.r1 = sv('line', { class: 'dl-radius' }, svgB);
    B.r2 = sv('line', { class: 'dl-radius' }, svgB);
    B.angArc = sv('path', { class: 'dl-ang-arc' }, svgB);
    sv('circle', { cx: CX, cy: CY, r: 2.5, class: 'dl-center' }, svgB);
    B.chev = [sv('path', { class: 'dl-chev' }, svgB), sv('path', { class: 'dl-chev' }, svgB)];
    B.rise = sv('circle', { r: 4.5, class: 'dl-sunpt' }, svgB);
    B.set = sv('circle', { r: 4.5, class: 'dl-sunpt' }, svgB);
    B.riseL = sv('text', { class: 'dl-t dl-t-pt' }, svgB, 'sunrise');
    B.setL = sv('text', { class: 'dl-t dl-t-pt' }, svgB, 'sunset');
    B.noon = sv('text', { x: CX - R - 24, y: CY + 4, class: 'dl-t dl-t-hour', 'text-anchor': 'end' }, svgB, 'noon');
    B.midnight = sv('text', { x: CX + R + 24, y: CY + 4, class: 'dl-t dl-t-hour' }, svgB, 'midnight');
    B.angG = sv('g', null, svgB);
    B.angBg = sv('rect', { class: 'dl-pill', rx: 12 }, B.angG);
    // two-line badge between the angle arc and the rim: "2H₀ =" over the value
    B.angT = sv('text', { class: 'dl-ang-t', 'text-anchor': 'middle' }, B.angG);
    sv('tspan', { x: CX - 80, y: CY - 4 }, B.angT, '2');
    sv('tspan', { class: 'dl-ang-var' }, B.angT, 'H');
    sv('tspan', { class: 'dl-ang-sub', dy: '4' }, B.angT, '0');
    sv('tspan', { dy: '-4' }, B.angT, ' =');
    B.angVal = sv('tspan', { x: CX - 80, y: CY + 14, class: 'dl-ang-val' }, B.angT, '0°');
    B.polarG = sv('g', null, svgB);
    B.polarBg = sv('rect', { class: 'dl-pill', rx: 16, height: 32 }, B.polarG);
    B.polarT = sv('text', { class: 'dl-polar-t', 'text-anchor': 'middle', x: CX, y: CY + 5 }, B.polarG);
  }

  /* ---------- readout + formula ---------- */
  const readout = h('div', { class: 'dl-readout' }, card);
  const stat = () => {
    const box = h('div', { class: 'stat dl-stat' }, readout);
    const label = h('span', null, box);
    const value = h('b', null, box);
    const sub = h('small', { class: 'dl-stat-sub' }, box);
    return { label, value, sub };
  };
  const stD = stat();
  stD.label.append('Declination ');
  ital(stD.label, 'δ');
  const stH = stat();
  stH.label.append('Half day-arc ');
  const hLab = ital(stH.label, 'H');
  h('sub', null, hLab, '0');
  const stDay = stat();
  stDay.label.textContent = 'Daylight';
  const stNight = stat();
  stNight.label.textContent = 'Night';
  const meter = h('div', { class: 'dl-meter', role: 'img' }, readout);
  const meterDay = h('span', { class: 'dl-meter-day' }, meter);
  const meterNight = h('span', { class: 'dl-meter-night' }, meter);

  const formula = h('div', { class: 'dl-formula' }, card);
  h('p', { class: 'dl-formula-label' }, formula, 'The formula, with your numbers');
  const tex1 = h('div', { class: 'dl-tex' }, formula);
  const tex2 = h('div', { class: 'dl-tex' }, formula);
  const note = h('p', { class: 'dl-note', hidden: true }, card);
  h('span', { class: 'dl-note-icon', 'aria-hidden': 'true' }, note, 'i');
  h('span', null, note,
    'Here one day is long compared with the year, so the season changes during a single day — treat this as an approximation (their tilt is ~0°, so every place gets about half a day of light anyway).');

  /* ---------- year chart ---------- */
  const chart = h('figure', { class: 'dl-chart' }, card);
  const chartHead = h('figcaption', { class: 'dl-chart-head' }, chart);
  const chartTitle = h('span', { class: 'dl-chart-title' }, chartHead);
  const chartKey = h('span', { class: 'dl-chart-key' }, chartHead);
  h('span', { class: 'dl-key-dash', 'aria-hidden': 'true' }, chartKey);
  chartKey.append('half the day · drag the chart to change the season');
  const chartWrap = h('div', { class: 'dl-chart-wrap' }, chart);
  const chartSvg = sv('svg', { class: 'dl-chart-svg', role: 'img' }, chartWrap);
  const tip = h('div', { class: 'dl-tip', 'aria-hidden': 'true' }, chartWrap);
  const tipV = h('b', null, tip);
  const tipL = h('span', null, tip);
  const details = h('details', { class: 'dl-table' }, chart);
  h('summary', null, details, 'Show the year as a table');
  const table = h('table', null, details);
  const thead = h('thead', null, table);
  const thr = h('tr', null, thead);
  ['Season', 'Sun’s declination', 'Daylight', 'Share of the day'].forEach((t) => h('th', { scope: 'col' }, thr, t));
  const tbody = h('tbody', null, table);
  const tableRows = Array.from({ length: 12 }, () => {
    const tr = h('tr', null, tbody);
    return [h('td', null, tr), h('td', null, tr), h('td', null, tr), h('td', null, tr)];
  });

  /* ---------- view A update ---------- */
  function updateSide(m) {
    const d = m.delta * RAD;
    const ph = m.lat * RAD;
    const ax = -Math.sin(d); // unit vector toward N (SVG y points down): δ > 0 leans N toward the Sun (left)
    const ay = -Math.cos(d);
    const ex = Math.cos(d); // along the equator, away from the Sun
    const ey = -Math.sin(d);
    const P = (t) => [CX + t * ax, CY + t * ay];
    const [x1, y1] = P(-(R + 30));
    const [x2, y2] = P(R + 30);
    set(A.axis, { x1, y1, x2, y2 });
    const [pnx, pny] = P(R);
    const [psx, psy] = P(-R);
    set(A.poleN, { cx: pnx, cy: pny });
    set(A.poleS, { cx: psx, cy: psy });
    const [nx, ny] = P(R + 48);
    const [sx, sy] = P(-(R + 48));
    set(A.nLabel, { x: nx, y: ny + 5 });
    set(A.sLabel, { x: sx, y: sy + 5 });

    set(A.equator, { x1: CX - R * ex, y1: CY - R * ey, x2: CX + R * ex, y2: CY + R * ey });
    const elx = CX + (R - 38) * ex;
    const ely = CY + (R - 38) * ey;
    // below the line, so it never crowds the φ label that sits above it
    set(A.eqLabel, { x: elx, y: ely + (m.lat >= 0 ? 14 : -6), transform: `rotate(${-m.delta} ${elx} ${ely})` });

    // Latitude circle, edge-on: a chord ⟂ axis, centred R·sinφ up the axis, half-length R·cosφ.
    const sp = Math.sin(ph);
    const hl = Math.max(R * Math.cos(ph), 1.5); // keep a visible dot at the pole
    const ccx = CX + R * sp * ax;
    const ccy = CY + R * sp * ay;
    const pt = (u) => [ccx + u * ex, ccy + u * ey];
    const uT = (CX - ccx) / ex; // where the chord crosses the terminator (x = CX); ex ≥ cos 82.3° > 0
    const litTo = Math.min(hl, uT);
    const darkFrom = Math.max(-hl, uT);
    const seg = (n, on, a, b) => { show(n, on); if (on) set(n, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); };
    seg(A.chordGlow, litTo > -hl, pt(-hl), pt(litTo));
    seg(A.chordLit, litTo > -hl, pt(-hl), pt(litTo));
    seg(A.chordDark, darkFrom < hl, pt(darkFrom), pt(hl));
    show(A.cross, uT > -hl && uT < hl);
    if (uT > -hl && uT < hl) { const [qx, qy] = pt(uT); set(A.cross, { cx: qx, cy: qy }); }
    // label above the left (Sun-side) end of the chord
    show(A.chordLabel, hl > 52);
    if (hl > 52) {
      const [lx, ly] = pt(-hl + 12);
      const ox = lx + 9 * ax;
      const oy = ly + 9 * ay;
      set(A.chordLabel, { x: ox, y: oy, transform: `rotate(${-m.delta} ${ox} ${oy})` });
    }

    // φ: angle at the centre between the equator and the radius to the chord's end
    const [e2x, e2y] = pt(R * Math.cos(ph));
    set(A.phiRay, { x1: CX, y1: CY, x2: e2x, y2: e2y });
    const a0 = -m.delta;
    const a1 = -m.delta - m.lat;
    show(A.phiArc, Math.abs(m.lat) > 0.4);
    if (Math.abs(m.lat) > 0.4) A.phiArc.setAttribute('d', arc(CX, CY, 42, a0, a1));
    const la = Math.abs(m.lat) >= 12 ? (a0 + a1) / 2 : a0 - (m.lat >= 0 ? 1 : -1) * 15;
    set(A.phiLabel, { x: CX + 58 * Math.cos(la * RAD), y: CY + 58 * Math.sin(la * RAD) + 6 });
    A.phiLabel.textContent = Math.abs(m.lat) <= 0.4 ? 'φ = 0°' : 'φ';

    // δ: angle between the dashed vertical and the spin axis, above the north pole
    const b0 = -90;
    const b1 = -90 - m.delta;
    show(A.dArc, Math.abs(m.delta) > 0.3);
    if (Math.abs(m.delta) > 0.3) A.dArc.setAttribute('d', arc(CX, CY, R + 18, b0, b1));
    const lb = Math.abs(m.delta) >= 10 ? (b0 + b1) / 2 : b0 + (m.delta >= 0 ? 1 : -1) * 12;
    set(A.dLabel, { x: CX + (R + 33) * Math.cos(lb * RAD), y: CY + (R + 33) * Math.sin(lb * RAD) + 6 });
    A.dLabel.textContent = Math.abs(m.delta) <= 0.3 ? 'δ = 0°' : 'δ';

    svgA.setAttribute('aria-label',
      `Side view. Sunlight comes from the left. The spin axis leans ${fix(Math.abs(m.delta))} degrees ${m.delta >= 0 ? 'toward' : 'away from'} the Sun. ` +
      `The circle of latitude ${latSpoken(m.lat)} is ${pct(m.frac)} in sunlight.`);
  }

  /* ---------- view B update ---------- */
  function placePointLabel(n, a) {
    const c = Math.cos(a * RAD);
    const s = Math.sin(a * RAD);
    let x = CX + (R + 26) * c;
    let y = CY + (R + 26) * s + (s < -0.35 ? -2 : s > 0.35 ? 11 : 4);
    const anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
    const w = 44;
    if (Math.abs(y - (CY + 4)) < 18 && Math.abs(c) > 0.8) y = CY + 4 + (s < 0 ? -18 : 18); // clear noon/midnight
    if (anchor === 'start') x = Math.min(x, VB_W - 4 - w);
    if (anchor === 'end') x = Math.max(x, 4 + w);
    set(n, { x, y, 'text-anchor': anchor });
  }
  function updateTop(m) {
    const polarDay = m.frac >= 1;
    const polarNight = m.frac <= 0;
    const th = 180 - m.H0; // angle from the midnight direction (+x) to each terminator point
    const k = Math.cos(th * RAD); // signed terminator offset / radius = tan φ · tan δ
    const at = (a, r = R) => [CX + r * Math.cos(a * RAD), CY + r * Math.sin(a * RAD)];
    const P1 = at(-th); // top end of the terminator chord
    const P2 = at(th); // bottom end
    const full = `M${CX - R},${CY} A${R},${R} 0 1 0 ${CX + R},${CY} A${R},${R} 0 1 0 ${CX - R},${CY}`;
    const normal = !polarDay && !polarNight;
    for (const n of [B.chord, B.r1, B.r2, B.angArc, B.angG, B.rise, B.set, B.riseL, B.setL]) show(n, normal);
    show(B.polarG, !normal);
    if (normal) {
      const litD = `M${pt2(P1)} A${R},${R} 0 ${2 * m.H0 > 180 ? 1 : 0} 0 ${pt2(P2)}`; // through noon (left)
      const darkD = `M${pt2(P2)} A${R},${R} 0 ${2 * th > 180 ? 1 : 0} 0 ${pt2(P1)}`; // through midnight (right)
      B.litArc.setAttribute('d', litD);
      B.litGlow.setAttribute('d', litD);
      B.darkArc.setAttribute('d', darkD);
      B.litFill.setAttribute('d', `${litD} Z`);
      B.darkFill.setAttribute('d', `${darkD} Z`);
      set(B.chord, { x1: P1[0], y1: P1[1], x2: P2[0], y2: P2[1] });
      set(B.r1, { x1: CX, y1: CY, x2: P1[0], y2: P1[1] });
      set(B.r2, { x1: CX, y1: CY, x2: P2[0], y2: P2[1] });
      B.angArc.setAttribute('d', arc(CX, CY, 34, -th, th - 360));
      B.angVal.textContent = `${fix(2 * Number(fix(m.H0)))}°`;
      const bb = bbox(B.angT, 7);
      set(B.angBg, { x: bb.x - 9, y: bb.y - 5, width: bb.width + 18, height: bb.height + 10 });
      // Prograde spin runs counter-clockwise seen from above the north pole: after noon (left)
      // the place moves down to the bottom end, so that end is sunset. Retrograde flips it.
      const retro = m.planet.retrograde;
      const riseP = retro ? P2 : P1;
      const setP = retro ? P1 : P2;
      set(B.rise, { cx: riseP[0], cy: riseP[1] });
      set(B.set, { cx: setP[0], cy: setP[1] });
      placePointLabel(B.riseL, retro ? th : -th);
      placePointLabel(B.setL, retro ? -th : th);
    } else {
      B.litArc.setAttribute('d', polarDay ? full : '');
      B.litGlow.setAttribute('d', polarDay ? full : '');
      B.darkArc.setAttribute('d', polarNight ? full : '');
      B.litFill.setAttribute('d', polarDay ? `${full} Z` : '');
      B.darkFill.setAttribute('d', polarNight ? `${full} Z` : '');
      B.polarT.textContent = polarDay ? 'The Sun never sets' : 'The Sun never rises';
      const bb = bbox(B.polarT, 18);
      set(B.polarBg, { x: bb.x - 16, y: CY - 16, width: bb.width + 32 });
    }
    // hour ticks: noon at the left, one tick per 1/24 of the day; gold if that moment is in sunlight
    for (let n = 0; n < 24; n++) {
      const a = 180 + n * 15;
      const major = n % 6 === 0;
      const [xa, ya] = at(a, R + 6);
      const [xb, yb] = at(a, R + (major ? 17 : 12));
      set(B.ticks[n], { x1: xa, y1: ya, x2: xb, y2: yb });
      B.ticks[n].classList.toggle('is-lit', polarDay || (normal && Math.cos(a * RAD) <= k + 1e-9));
    }
    // direction-of-travel chevrons on the circle (afternoon and small hours)
    const retro = m.planet.retrograde;
    [135, -45].forEach((base, i) => {
      const a = retro ? -base : base;
      const c = at(a);
      const tx = retro ? -Math.sin(a * RAD) : Math.sin(a * RAD);
      const ty = retro ? Math.cos(a * RAD) : -Math.cos(a * RAD);
      const nx = Math.cos(a * RAD);
      const ny = Math.sin(a * RAD);
      const tipP = [c[0] + 3.5 * tx, c[1] + 3.5 * ty];
      const w1 = [c[0] - 3 * tx + 3.6 * nx, c[1] - 3 * ty + 3.6 * ny];
      const w2 = [c[0] - 3 * tx - 3.6 * nx, c[1] - 3 * ty - 3.6 * ny];
      B.chev[i].setAttribute('d', `M${pt2(w1)} L${pt2(tipP)} L${pt2(w2)}`);
    });

    const cphi = Math.cos(m.lat * RAD);
    sizeInner.setAttribute('r', Math.max(0.6, 14 * cphi).toFixed(2));
    sizeVal.textContent = cphi < 0.0005 ? '0 (a single point)' : `${fix(cphi, 2)} R`;
    tickLine.textContent = m.planet.id === 'earth'
      ? 'Each tick is one hour; gold ticks are hours with the Sun up.'
      : `Each tick is 1/24 of a ${m.planet.name} day (${dur(m.T / 24)}); gold = Sun up.`;
    svgB.setAttribute('aria-label',
      `The latitude circle seen from above the pole, with the Sun to the left. ${normal
        ? `The sunlit arc spans 2H0 = ${fix(2 * Number(fix(m.H0)))} degrees of 360.`
        : polarDay ? 'The whole circle is in sunlight: the Sun never sets.' : 'The whole circle is in shadow: the Sun never rises.'}`);
  }

  /* ---------- readout + formula ---------- */
  function updateReadout(m) {
    stD.value.textContent = `${signed1(m.delta)}°`;
    stD.sub.textContent = m.delta === 0 ? 'Sun overhead at the equator' : `Sun overhead at ${fix(Math.abs(m.delta))}° ${m.delta > 0 ? 'N' : 'S'}`;
    stH.value.textContent = `${fix(m.H0)}°`;
    stH.sub.textContent = 'how far the planet turns from sunrise to noon';
    stDay.value.textContent = dur(m.dayH);
    const Y = dur(m.T);
    stDay.sub.textContent = /Earth/.test(Y)
      ? `of one ${m.planet.name} day, ${Y} (${pct(m.frac)})`
      : `of a ${Y} day (${pct(m.frac)})`;
    stNight.value.textContent = dur(m.nightH);
    stNight.sub.textContent = `${pct(1 - m.frac)} of the day`;
    meterDay.style.flexBasis = `${m.frac * 100}%`;
    show(meterDay, m.frac > 0);
    show(meterNight, m.frac < 1);
    meter.setAttribute('aria-label', `${pct(m.frac)} of the day in sunlight`);
    note.hidden = !(m.planet.id === 'mercury' || m.planet.id === 'venus');
  }
  function renderTex(m) {
    const x = m.cosH0;
    const rhs = !isFinite(x) || Math.abs(x) > 1e4 ? (x < 0 ? '\\to -\\infty' : '\\to +\\infty') : `= ${fix(x, 3)}`;
    let tail;
    if (m.frac >= 1) tail = '\\le -1 \\Rightarrow \\text{the Sun never sets: } H_0 = 180^\\circ';
    else if (m.frac <= 0) tail = '\\ge 1 \\Rightarrow \\text{the Sun never rises: } H_0 = 0^\\circ';
    else tail = `\\Rightarrow H_0 = ${fix(m.H0)}^\\circ`;
    const l1 = `\\cos H_0 = -\\tan(${fix(m.lat)}^\\circ)\\,\\tan(${fix(m.delta)}^\\circ) ${rhs} ${tail}`;
    const l2 = `\\displaystyle \\text{daylight} = \\frac{2H_0}{360^\\circ} \\times ${texDur(dur(m.T))} = ${texDur(dur(m.dayH))}`;
    katex.render(l1, tex1, { throwOnError: false });
    katex.render(l2, tex2, { throwOnError: false });
  }

  /* ---------- year chart ---------- */
  let geo = null;
  let hoverL = null;
  let dragging = false;
  function renderChart(m) {
    const W = Math.max(280, Math.round(chartWrap.clientWidth || 640));
    const narrow = W < 560;
    const H = narrow ? 210 : 236;
    const ml = narrow ? 40 : 48;
    const mr = 12;
    const mt = 30;
    const mb = 28;
    const pw = W - ml - mr;
    const ph = H - mt - mb;
    const T = m.T;
    const X = (L) => ml + (L / 360) * pw;
    const Y = (v) => mt + ph * (1 - v / T);
    set(chartSvg, { viewBox: `0 0 ${W} ${H}`, height: H });
    chartSvg.textContent = '';
    const defs = sv('defs', null, chartSvg);
    const grad = sv('linearGradient', { id: `${uid}-area`, x1: 0, y1: mt, x2: 0, y2: mt + ph, gradientUnits: 'userSpaceOnUse' }, defs);
    sv('stop', { offset: '0', style: 'stop-color:var(--sun);stop-opacity:.2' }, grad);
    sv('stop', { offset: '1', style: 'stop-color:var(--sun);stop-opacity:.03' }, grad);

    const pts = [];
    for (let L = 0; L <= 360; L++) pts.push([X(L), Y(dayAt(m.planet, T, m.lat, L))]);
    const lineD = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    const back = pts.slice().reverse().map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    sv('path', { d: `M${X(0)},${Y(T)} L${X(360)},${Y(T)} ${back} Z`, class: 'dl-c-night' }, chartSvg);
    sv('path', { d: `${lineD} L${X(360)},${Y(0)} L${X(0)},${Y(0)} Z`, fill: `url(#${uid}-area)` }, chartSvg);

    const grid = sv('g', null, chartSvg);
    const days = T >= 72;
    const unit = days ? 24 : 1;
    const step = pickStep(T / unit, days);
    for (let i = 0; i * step <= T / unit + 1e-9; i++) {
      const v = i * step;
      const y = Y(v * unit);
      // where the dashed half-day line sits, it replaces the gridline (the label stays)
      if (i === 0 || Math.abs(y - Y(T / 2)) >= 4) sv('line', { x1: ml, x2: W - mr, y1: y, y2: y, class: i === 0 ? 'dl-c-base' : 'dl-c-grid' }, grid);
      sv('text', { x: ml - 8, y: y + 3.5, class: 'dl-c-lab', 'text-anchor': 'end' }, grid, i === 0 ? '0' : `${formatNumber(v, 1)} ${days ? 'd' : 'h'}`);
    }
    const names = seasonsFor(m.planet);
    names.forEach((n, i) => {
      const x = X(n.at);
      if (i > 0) sv('line', { x1: x, x2: x, y1: mt, y2: mt + ph, class: 'dl-c-grid' }, grid);
      sv('text', { x, y: H - 8, class: 'dl-c-lab', 'text-anchor': i === 0 ? 'start' : 'middle' }, grid, narrow ? n.short : n.tick);
    });
    sv('line', { x1: X(360), x2: X(360), y1: mt, y2: mt + ph, class: 'dl-c-grid' }, grid);
    const yHalf = Y(T / 2);
    sv('line', { x1: ml, x2: W - mr, y1: yHalf, y2: yHalf, class: 'dl-c-half' }, chartSvg);
    sv('path', { d: lineD, class: 'dl-c-line' }, chartSvg);

    // current season
    const cx = X(m.season);
    const cy = Y(m.dayH);
    sv('line', { x1: cx, x2: cx, y1: mt, y2: mt + ph, class: 'dl-c-now' }, chartSvg);
    const labelG = sv('g', null, chartSvg);
    const pill = sv('rect', { class: 'dl-c-pill', rx: 8, height: 18 }, labelG);
    const below = cy - mt < 24;
    const lx = clamp(cx, ml + 36, W - mr - 36);
    const ly = below ? cy + 22 : cy - 12;
    const val = sv('text', { x: lx, y: ly, class: 'dl-c-val', 'text-anchor': 'middle' }, labelG, dur(m.dayH));
    const bb = bbox(val, 9);
    set(pill, { x: bb.x - 7, y: ly - 13, width: bb.width + 14 });
    sv('circle', { cx, cy, r: 5.5, class: 'dl-c-dot' }, chartSvg);

    const cross = sv('line', { y1: mt, y2: mt + ph, class: 'dl-c-cross' }, chartSvg);
    const hdot = sv('circle', { r: 4.5, class: 'dl-c-hdot' }, chartSvg);
    show(cross, false);
    show(hdot, false);
    geo = { W, ml, pw, X, Y, T, m, cross, hdot };
    if (hoverL != null) hover(hoverL);

    chartTitle.textContent = `Daylight through the year at ${latText(m.lat).replace(' (equator)', '')} on ${m.planet.name}`;
    const lo = Math.min(...pts.map((p) => p[1]));
    const hi = Math.max(...pts.map((p) => p[1]));
    chartSvg.setAttribute('aria-label',
      `Line chart of daylight across one ${m.planet.name} year at ${latSpoken(m.lat)}. ` +
      `Longest: ${dur(T * (1 - (lo - mt) / ph))}. Shortest: ${dur(T * (1 - (hi - mt) / ph))}. Full table below.`);
    for (let i = 0; i < 12; i++) {
      const L = i * 30;
      const v = dayAt(m.planet, T, m.lat, L);
      const cells = tableRows[i];
      cells[0].textContent = seasonPoint(m.planet, L);
      cells[1].textContent = `${signed1(cleanDecl(m.planet, L))}°`;
      cells[2].textContent = dur(v);
      cells[3].textContent = pct(v / T);
    }
  }
  function hover(L) {
    if (!geo) return;
    hoverL = L;
    const v = dayAt(geo.m.planet, geo.T, geo.m.lat, L);
    const x = geo.X(L);
    const y = geo.Y(v);
    set(geo.cross, { x1: x, x2: x });
    set(geo.hdot, { cx: x, cy: y });
    show(geo.cross, true);
    show(geo.hdot, true);
    tipV.textContent = dur(v);
    tipL.textContent = `${seasonPoint(geo.m.planet, L)} · ${pct(v / geo.T)} of the day`;
    const scale = chartSvg.getBoundingClientRect().width / geo.W || 1;
    tip.style.left = `${clamp(x, 70, geo.W - 70) * scale}px`;
    tip.style.top = `${y * scale}px`;
    tip.classList.add('is-on');
  }
  function unhover() {
    hoverL = null;
    tip.classList.remove('is-on');
    if (geo) { show(geo.cross, false); show(geo.hdot, false); }
  }
  const seasonFromEvent = (ev) => {
    const r = chartSvg.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (geo.W / r.width);
    return clamp(Math.round(((x - geo.ml) / geo.pw) * 360), 0, 360);
  };
  const setSeason = (L) => { state.season = L; seaIn.value = String(L); schedule(); };
  chartSvg.addEventListener('pointermove', (ev) => {
    if (!geo) return;
    const L = seasonFromEvent(ev);
    hover(L);
    if (dragging) setSeason(L);
  });
  chartSvg.addEventListener('pointerdown', (ev) => {
    if (!geo) return;
    dragging = true;
    chartSvg.setPointerCapture?.(ev.pointerId);
    setSeason(seasonFromEvent(ev));
  });
  const endDrag = () => { dragging = false; };
  chartSvg.addEventListener('pointerup', endDrag);
  chartSvg.addEventListener('pointercancel', () => { endDrag(); unhover(); });
  chartSvg.addEventListener('pointerleave', () => { if (!dragging) unhover(); });

  /* ---------- render ---------- */
  const setFill = (input, p) => input.style.setProperty('--fill', `calc(10px + (100% - 20px) * ${p})`);
  function planetLine(m) {
    const p = m.planet;
    const eff = effectiveTilt(p.tiltDeg);
    const tilt = p.tiltDeg > 90
      ? `axial tilt ${formatNumber(p.tiltDeg, 2)}° (upside down: acts like ${formatNumber(eff, 2)}° spinning backwards)`
      : `axial tilt ${formatNumber(p.tiltDeg, 2)}°`;
    return `${p.name} · ${tilt} · one solar day = ${dur(m.T)}`;
  }
  function render() {
    const m = model(state);
    for (const { b, id } of planetBtns) b.setAttribute('aria-pressed', String(id === m.planet.id));
    planetInfo.textContent = planetLine(m);
    latOut.textContent = latText(m.lat);
    latIn.setAttribute('aria-valuetext', latSpoken(m.lat));
    setFill(latIn, (m.lat + 90) / 180);
    for (const { b, lat } of quickBtns) b.setAttribute('aria-pressed', String(Math.abs(lat - m.lat) < 0.05));
    seaOut.textContent = `${seasonName(m.planet, m.season)} · δ = ${signed1(m.delta)}°`;
    seaIn.setAttribute('aria-valuetext', `${seasonName(m.planet, m.season)}, Sun's declination ${fix(m.delta)} degrees`);
    setFill(seaIn, m.season / 360);
    const names = seasonsFor(m.planet);
    for (const t of seaTickBtns) {
      const n = names[(t.at / 90) % 4];
      t.b.textContent = n.short;
      t.b.setAttribute('aria-label', `Jump to ${n.name}`);
      t.b.classList.toggle('is-active', Math.abs(m.season - t.at) < 0.5);
    }
    updateSide(m);
    updateTop(m);
    updateReadout(m);
    renderTex(m);
    renderChart(m);
  }

  render();
  document.fonts?.ready?.then(schedule);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  ro?.observe(chartWrap);
  return {
    destroy() { ro?.disconnect(); cancelAnimationFrame(raf); root.textContent = ''; },
  };
}
