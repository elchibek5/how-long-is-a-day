// "One spin is not one day": a scroll-scrubbed SVG that proves a solar day is
// 360° + θ of spin (or 360° − θ for a backwards spinner like Venus).
//
// Geometry: the Sun sits at S, the planet at orbit angle α (degrees, counter-
// clockwise from +x). A person on the planet marks noon; their sight-line points
// at spin angle β = 180° + s. The Sun, seen from the planet, is at α + 180°, so
// it is overhead exactly when s ≡ α (mod 360°). All angles below follow that rule.
import { PLANET_BY_ID } from '../data/planets.js';
import { solarDayHours, orbitAnglePerDay, formatDuration, clamp } from '../lib/astro.js';
import './solarday.css';

const NS = 'http://www.w3.org/2000/svg';
const SUN = { x: 190, y: 330, r: 44 };
const ORBIT_R = 300;
const PLANET_R = 40;
const SIGHT = 140; // sight-line length from the planet centre
const SIGHT_FROM = 63; // the line starts just past the person's head
const HEAD = PLANET_R + 16.1; // centre of the person's head
const THETA = 28; // orbit angle per spin, exaggerated so it can be seen
const EXTRA = 2.2; // the planet keeps orbiting while it turns the extra θ
const ALPHA_END = THETA + EXTRA; // where noon comes back
const SPIN_END = 360 + ALPHA_END; // the spin that points the person at the Sun again
const VENUS_SPIN = 360 - THETA; // a backwards spin meets the Sun early
const TRIGGER = 0.62; // reading line, as a fraction of the viewport height
const MOVE = [0.06, 0.66]; // a step's motion runs in this part of its scroll, then holds
const R_SUN_ARC = 96; // θ arc radius at the Sun
const R_PLANET_ARC = 88; // θ arc radius at the planet
const R_EXTRA = 80; // the extra-turn wedge, just inside the θ arc
const LINE_LEFT = 14; // the parallel lines run off to here
const TICK_X = 102; // where the parallel ">" marks sit
const START = orbitPoint(0); // the planet at the start of the day

const CAPTIONS = [
  'Noon: the Sun is straight overhead',
  'One full spin (360°) —|but the Sun is no longer overhead',
  'After one spin the Sun sits θ|away from straight overhead',
  'Noon again:|one solar day = 360° + θ',
  '',
  'Backwards spin: the Sun returns|after only 360° − θ',
];
const FORMULAS = ['', 'orbit angle = θ', 'spin = 360° + θ', 'spinning backwards', 'spin = −(360° − θ)'];

let instances = 0;

function rad(d) {
  return (d * Math.PI) / 180;
}
function polar(cx, cy, r, a) {
  return [cx + r * Math.cos(rad(a)), cy - r * Math.sin(rad(a))];
}
function orbitPoint(a) {
  return polar(SUN.x, SUN.y, ORBIT_R, a);
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const win = (t, a, b) => ease(seg(t, a, b));
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const f2 = (x) => Math.round(x * 100) / 100;

/** Arc on a circle from angle a0 to a1 (degrees, counter-clockwise when a1 > a0). */
function arcPath(cx, cy, r, a0, a1) {
  if (Math.abs(a1 - a0) < 0.05) return '';
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 0 : 1; // SVG's y axis points down, so counter-clockwise is sweep 0
  return `M${f2(x0)},${f2(y0)}A${r},${r} 0 ${large} ${sweep} ${f2(x1)},${f2(y1)}`;
}

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  if (parent) parent.appendChild(n);
  return n;
}
function stop(grad, offset, color, opacity = 1) {
  el('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }, grad);
}
/** Writes text into an SVG <text>, styling every θ as an italic serif letter. */
function richText(parent, str, attrs = {}) {
  const span = el('tspan', attrs, parent);
  str.split(/(θ)/).forEach((part) => {
    if (!part) return;
    const t = el('tspan', part === 'θ' ? { class: 'sd-th' } : {}, span);
    t.textContent = part;
  });
  return span;
}

function hexRgb(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim()) || /^#?([0-9a-f]{6})$/i.exec(fallback);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (rgb) => `rgb(${rgb.map((v) => Math.round(v)).join(',')})`;

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  const hex = {
    sun: get('--sun', '#ffb648'),
    sun2: get('--sun-2', '#ff7a3d'),
    sky: get('--sky', '#7cc8ff'),
    violet: get('--violet', '#a594ff'),
    rose: get('--rose', '#ff6f9c'),
    text: get('--text', '#eef1f8'),
    text2: get('--text-2', '#b8c0d4'),
    muted: get('--muted', '#7f88a0'),
  };
  const rgb = {
    sky: hexRgb(hex.sky, '#7cc8ff'),
    gold: hexRgb('#ffd27a', '#ffd27a'),
    violet: hexRgb(hex.violet, '#a594ff'),
    rose: hexRgb(hex.rose, '#ff6f9c'),
  };
  // Backwards spin gets its own cue: halfway between the orbit violet and the θ rose.
  rgb.back = mixRgb(mixRgb(rgb.violet, rgb.rose, 0.5), [255, 255, 255], 0.12);
  return { ...hex, rgb };
}

/** Earth's real numbers, computed rather than typed in. */
function earthNumbers() {
  const earth = PLANET_BY_ID.earth;
  const solar = solarDayHours(earth);
  const tidy = (s) => s.replace(/^0 h /, '').replace(/^0 m /, '').replace(/ 0 s$/, '').replace(/ 0 m$/, '');
  const extra = tidy(formatDuration(solar - earth.spinHours, { seconds: true }));
  return {
    theta: `${orbitAnglePerDay(earth).toFixed(3)}°`,
    spin: tidy(formatDuration(earth.spinHours, { seconds: true })),
    extra,
    extraWords: extra.replace(/(\d+) m\b/, '$1 min'),
    solar: tidy(formatDuration(solar, { seconds: true })),
  };
}

/**
 * The whole story as a function of scroll progress P (step index + progress in
 * that step). Every field is continuous in P, so scrubbing never jumps.
 */
export function stateAt(P) {
  P = clamp(P, 0, 6);
  const i = Math.min(5, Math.floor(P));
  const t = P - i;
  const s = {
    step: i,
    alpha: 0,
    spin: 0,
    spinShown: 0, // what the counter reads (negative for the backwards spin)
    ghost: 0,
    counter: 0,
    fRow: 0, // the counter's third (formula) row
    formula: 0,
    venus: 0,
    spinArrow: 0,
    thetaSun: 0, // sweep of θ at the Sun (deg)
    thetaPlanet: 0, // sweep of θ at the planet (deg), measured from the 180° star line
    theta: 0, // θ arcs opacity
    thetaLabel: 0,
    par: 0, // parallel lines opacity
    parDraw: 0, // how far the parallel lines have been drawn (0..1)
    ticks: 0,
    parCaption: 0,
    sunRay: 0, // the line planet → Sun
    wedge: 0, // extra-turn wedge opacity
    card: 0,
  };
  if (i === 0) return s;

  if (i === 1) {
    const e = win(t, ...MOVE);
    s.alpha = THETA * e;
    s.spin = 360 * e;
    s.spinShown = s.spin;
    s.ghost = seg(t, 0, 0.05);
    s.counter = seg(t, 0, 0.05);
    s.spinArrow = seg(t, 0.02, 0.1);
    s.sunRay = 0.55 * seg(t, 0.62, 0.78);
    s.fRow = seg(P, 1.94, 2.0);
    return s;
  }

  // From here on the ghost and counter stay.
  s.ghost = 1;
  s.counter = 1;
  s.fRow = 1;
  s.spinArrow = 1;

  if (i === 2) {
    s.alpha = THETA;
    s.spin = 360;
    s.spinShown = 360;
    s.sunRay = 0.55;
    s.par = 1;
    s.parDraw = win(t, 0.0, 0.3);
    const a = win(t, 0.16, 0.44);
    s.theta = seg(t, 0.14, 0.2);
    s.thetaSun = THETA * a;
    s.thetaPlanet = THETA * a;
    s.thetaLabel = seg(t, 0.36, 0.5);
    s.ticks = seg(t, 0.24, 0.36);
    s.parCaption = seg(t, 0.34, 0.5);
    s.formula = t > 0.38 ? 1 : 0;
    return s;
  }

  if (i === 3 || i === 4) {
    const e = i === 3 ? win(t, ...MOVE) : 1;
    s.alpha = THETA + EXTRA * e;
    s.spin = 360 + (SPIN_END - 360) * e;
    s.spinShown = s.spin;
    s.sunRay = 0.55;
    s.par = i === 3 ? 1 - 0.45 * seg(t, 0, 0.2) : 0.55;
    s.parDraw = 1;
    s.ticks = s.par;
    s.parCaption = i === 3 ? 1 - seg(t, 0, 0.12) : 0;
    s.theta = 1;
    s.thetaLabel = 1;
    s.thetaSun = s.alpha;
    s.thetaPlanet = s.alpha;
    s.wedge = 1;
    s.formula = i === 4 || t > 0.6 ? 2 : 1;
    s.card = i === 4 ? win(t, 0.04, 0.22) : 0;
    return s;
  }

  // Step 5: glide back to the start (the person keeps facing the Sun), then spin backwards.
  const back = win(t, 0, 0.16);
  const v = win(t, 0.22, 0.74);
  const out = 1 - seg(t, 0, 0.08); // step-4 overlays leave
  const end = seg(t, 0.7, 0.82); // the closing θ picture arrives
  s.venus = seg(t, 0.1, 0.22);
  if (t < 0.2) {
    s.alpha = ALPHA_END * (1 - back);
    s.spin = 360 + s.alpha;
  } else {
    s.alpha = THETA * v;
    s.spin = 360 - VENUS_SPIN * v;
  }
  // The counter fades out while the planet glides back, and swaps to the backwards
  // reading only once it is invisible (t ≥ 0.1), so its numbers never jump on screen.
  s.counter = t < 0.11 ? 1 - seg(t, 0, 0.06) : seg(t, 0.16, 0.24);
  s.spinShown = t < 0.1 ? s.spin : s.spin - 360;
  s.card = out;
  s.wedge = out;
  s.parCaption = 0;
  s.sunRay = 0.55 * Math.max(out, end);
  s.par = Math.max(0.55 * out, 0.8 * end);
  s.parDraw = 1;
  s.ticks = s.par;
  s.theta = Math.max(out, end);
  s.thetaLabel = s.theta;
  s.thetaSun = t < 0.2 ? s.alpha : THETA * v;
  s.thetaPlanet = s.thetaSun;
  s.formula = t < 0.1 ? 2 : t < 0.72 ? 3 : 4;
  return s;
}

/** Shows the scroll-scrubbed solar-day diagram inside #solarday. */
export function initSolarDay(root) {
  root = typeof root === 'string' ? document.querySelector(root) : root || document.getElementById('solarday');
  if (!root || root.dataset.sdReady) return null;
  root.dataset.sdReady = '1';
  const uid = `sd${++instances}`;
  const id = (name) => `${uid}-${name}`;
  const url = (name) => `url(#${id(name)})`;
  const C = readColors();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let graphic = root.querySelector('.scrolly-graphic');
  if (!graphic) {
    graphic = document.createElement('div');
    graphic.className = 'scrolly-graphic';
    root.prepend(graphic);
  }
  const steps = [...root.querySelectorAll('.step')]
    .map((node, k) => ({ node, n: Number.isFinite(+node.dataset.step) ? +node.dataset.step : k }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.node);
  steps.forEach(wrapStepCard);

  // ---------------------------------------------------------------- the SVG
  const svg = el('svg', {
    viewBox: '0 0 640 640',
    preserveAspectRatio: 'xMidYMid meet',
    class: 'sd-svg',
    role: 'img',
    'aria-labelledby': id('title'),
  });
  el('title', { id: id('title') }, svg).textContent =
    'A planet spins once while moving along its orbit, so the Sun is no longer overhead; it must turn an extra angle θ to bring noon back.';

  const defs = el('defs', {}, svg);
  const sunGlow = el('radialGradient', { id: id('sunGlow') }, defs);
  stop(sunGlow, 0, C.sun, 0.5);
  stop(sunGlow, 0.3, C.sun, 0.26);
  stop(sunGlow, 0.55, C.sun2, 0.09);
  stop(sunGlow, 1, C.sun2, 0);
  const sunCore = el('radialGradient', { id: id('sunCore'), cx: '44%', cy: '42%', r: '60%' }, defs);
  stop(sunCore, 0, '#fffaf0');
  stop(sunCore, 0.4, '#ffe3a3');
  stop(sunCore, 0.78, C.sun);
  stop(sunCore, 1, C.sun2);
  const night = el('radialGradient', { id: id('night'), cx: '50%', cy: '50%', r: '50%' }, defs);
  stop(night, 0, '#5d9bff');
  stop(night, 0.75, '#4d8dff');
  stop(night, 1, '#3466d6');
  // In the planet's "lit" frame the Sun is always along +x.
  const lin = (name) =>
    el('linearGradient', { id: id(name), gradientUnits: 'userSpaceOnUse', x1: -PLANET_R, y1: 0, x2: PLANET_R, y2: 0 }, defs);
  const day = lin('day');
  stop(day, 0, '#ffd27a', 0);
  stop(day, 0.47, '#ffd27a', 0);
  stop(day, 0.55, '#ffd27a', 0.82);
  stop(day, 0.8, '#ffe1a0', 0.95);
  stop(day, 1, '#fff6dc', 1);
  const shade = lin('shade');
  stop(shade, 0, '#020414', 0.6);
  stop(shade, 0.46, '#020414', 0.2);
  stop(shade, 0.52, '#020414', 0);
  stop(shade, 1, '#020414', 0);
  const shine = el('radialGradient', { id: id('shine') }, defs);
  stop(shine, 0, '#ffffff', 0.42);
  stop(shine, 1, '#ffffff', 0);
  const limb = el('radialGradient', { id: id('limb') }, defs);
  stop(limb, 0, '#000010', 0);
  stop(limb, 0.7, '#000010', 0);
  stop(limb, 1, '#000010', 0.34);
  const atmo = el('radialGradient', { id: id('atmo') }, defs);
  stop(atmo, 0.8, C.sky, 0.24);
  stop(atmo, 1, C.sky, 0);
  const starGlow = el('radialGradient', { id: id('starGlow') }, defs);
  stop(starGlow, 0, '#ffffff', 0.55);
  stop(starGlow, 0.35, '#cfe6ff', 0.18);
  stop(starGlow, 1, '#cfe6ff', 0);
  const rays = el('linearGradient', { id: id('rays'), gradientUnits: 'userSpaceOnUse', x1: 40, y1: 0, x2: 214, y2: 0 }, defs);
  stop(rays, 0, '#dbe9ff', 0.4);
  stop(rays, 1, '#dbe9ff', 0);
  const clip = el('clipPath', { id: id('clip') }, defs);
  el('circle', { r: PLANET_R }, clip);
  // Filter region in user space: thin horizontal lines have an empty bounding box.
  const glow = el('filter', { id: id('glow'), filterUnits: 'userSpaceOnUse', x: -400, y: -400, width: 1440, height: 1440 }, defs);
  el('feGaussianBlur', { stdDeviation: 3.2 }, glow);

  const layer = (cls) => el('g', { class: cls }, svg);
  const gStars = layer('sd-stars');
  const gFar = layer('sd-far');
  const gOrbit = layer('sd-orbit');
  const gGeo = layer('sd-geo');
  const gSun = layer('sd-sun');
  const gAngles = layer('sd-angles');
  const gGhost = layer('sd-ghost');
  const gPlanet = layer('sd-planet');
  const gSpin = layer('sd-spin');
  const gLabels = layer('sd-labels');
  const gUi = layer('sd-ui');

  // Faint background stars (seeded, so every visit looks the same).
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) {
    const x = rnd() * 640;
    const y = rnd() * 640;
    const r = 0.35 + rnd() * 0.8;
    const o = 0.06 + rnd() * 0.34;
    if (Math.hypot(x - SUN.x, y - SUN.y) < 150) continue;
    el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(2), fill: '#dfe8ff', opacity: o.toFixed(2) }, gStars);
  }

  // A distant star: so far away that every line pointing at it is parallel.
  const STAR = { x: 30, y: 52 };
  const farRays = [-1, 0, 1].map((k) =>
    el('line', { x1: STAR.x + 10, x2: 214 - Math.abs(k) * 34, stroke: url('rays'), 'stroke-width': 1, 'stroke-linecap': 'round' }, gFar),
  );
  el('circle', { cx: STAR.x, cy: STAR.y, r: 15, fill: url('starGlow'), class: 'sd-twinkle' }, gFar);
  el('path', { d: sparkle(STAR.x, STAR.y, 7.5, 1.5), fill: '#ffffff' }, gFar);
  const farLabel = el('text', { x: STAR.x - 8, class: 'sd-far-label' }, gFar);
  farLabel.textContent = 'a distant star';

  // Orbit: a faint dotted circle, the stretch travelled, and a chevron for direction.
  el('circle', {
    cx: SUN.x, cy: SUN.y, r: ORBIT_R, fill: 'none', stroke: C.violet, 'stroke-opacity': 0.34,
    'stroke-width': 1.2, 'stroke-dasharray': '2.5 6.5', 'stroke-linecap': 'round',
  }, gOrbit);
  const orbitArc = el('path', { fill: 'none', stroke: C.violet, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, gOrbit);
  const orbitLabel = el('text', { class: 'sd-orbit-label', 'text-anchor': 'middle' }, gOrbit);
  orbitLabel.textContent = 'orbit';

  // Parallel lines (start sight-line and today's sight-line, extended) + ">" marks.
  const lineA = el('line', { class: 'sd-par' }, gGeo);
  const lineB = el('line', { class: 'sd-par' }, gGeo);
  const tickA = el('path', { class: 'sd-tick' }, gGeo);
  const tickB = el('path', { class: 'sd-tick' }, gGeo);
  const parCaption = el('text', { class: 'sd-par-caption' }, gGeo);
  // The line from the planet to the Sun; it glows gold at noon.
  const sunRayGlow = el('line', { stroke: C.sun, 'stroke-width': 7, 'stroke-linecap': 'round', filter: url('glow') }, gGeo);
  const sunRay = el('line', { stroke: C.sun, 'stroke-width': 2, 'stroke-linecap': 'round' }, gGeo);

  // The Sun.
  const sunG = el('g', { transform: `translate(${SUN.x} ${SUN.y})` }, gSun);
  el('circle', { r: 150, fill: url('sunGlow'), class: 'sd-sun-glow' }, sunG);
  el('circle', { r: SUN.r, fill: url('sunCore') }, sunG);
  el('circle', { r: SUN.r - 0.5, fill: 'none', stroke: '#fff4d8', 'stroke-opacity': 0.5, 'stroke-width': 1 }, sunG);
  const sunLabel = el('text', { class: 'sd-sun-label', 'text-anchor': 'middle' }, sunG);
  sunLabel.textContent = 'Sun';

  // θ at the Sun, θ at the planet, and the extra-turn wedge.
  const thSunWedge = el('path', { fill: C.rose, 'fill-opacity': 0.12 }, gAngles);
  const thSunArc = el('path', { fill: 'none', stroke: C.rose, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, gAngles);
  const thPlWedge = el('path', { fill: C.rose, 'fill-opacity': 0.1 }, gAngles);
  const extraWedge = el('path', { fill: C.sky, 'fill-opacity': 0.3 }, gAngles);
  const extraArc = el('path', { fill: 'none', stroke: C.sky, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, gAngles);
  const thPlArc = el('path', { fill: 'none', stroke: C.rose, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, gAngles);
  const thSunLabel = el('text', { class: 'sd-theta', 'text-anchor': 'middle' }, gLabels);
  const thPlLabel = el('text', { class: 'sd-theta', 'text-anchor': 'middle' }, gLabels);
  thSunLabel.textContent = 'θ';
  thPlLabel.textContent = 'θ';

  // Ghost of the start position.
  const ghostG = el('g', { transform: `translate(${f2(START[0])} ${f2(START[1])})` }, gGhost);
  el('circle', { r: PLANET_R, fill: '#4d8dff', 'fill-opacity': 0.07, stroke: C.sky, 'stroke-opacity': 0.42, 'stroke-width': 1, 'stroke-dasharray': '3 4' }, ghostG);
  const ghostSpin = el('g', { transform: 'rotate(-180)' }, ghostG);
  el('line', { x1: SIGHT_FROM, x2: SIGHT, y1: 0, y2: 0, stroke: C.sky, 'stroke-opacity': 0.55, 'stroke-width': 1.5, 'stroke-dasharray': '4 4', 'stroke-linecap': 'round' }, ghostSpin);
  drawPerson(ghostSpin, 'sd-person sd-person-ghost');
  const ghostLabel = el('text', { class: 'sd-small', 'text-anchor': 'middle' }, gGhost);
  ghostLabel.textContent = 'start';

  // The planet: blue night side, gold-tinted day side that always faces the Sun.
  const planetG = el('g', {}, gPlanet);
  el('circle', { r: PLANET_R + 8, fill: url('atmo') }, planetG);
  const body = el('g', { 'clip-path': url('clip') }, planetG);
  el('circle', { r: PLANET_R, fill: url('night') }, body);
  const lit = el('g', {}, body);
  el('circle', { r: PLANET_R, fill: url('day') }, lit);
  el('circle', { r: PLANET_R, fill: url('shade') }, lit);
  el('circle', { cx: 17, cy: -6, r: 24, fill: url('shine') }, lit);
  el('circle', { r: PLANET_R, fill: url('limb') }, body);
  el('circle', { r: PLANET_R, fill: 'none', stroke: '#d6e6ff', 'stroke-opacity': 0.28, 'stroke-width': 0.8 }, planetG);

  // Spin direction: a small curved arrow by the planet (counter-clockwise, or clockwise for Venus).
  const arrowFwd = el('g', { class: 'sd-spin-arrow' }, planetG);
  el('path', { d: arcPath(0, 0, 51, 28, 76) }, arrowFwd);
  el('path', { d: arrowHead(0, 0, 51, 76, 1) }, arrowFwd);
  const arrowBack = el('g', { class: 'sd-spin-arrow' }, planetG);
  el('path', { d: arcPath(0, 0, 51, 28, 76) }, arrowBack);
  el('path', { d: arrowHead(0, 0, 51, 28, -1) }, arrowBack);

  // The person and their sight-line spin with the planet.
  const spinG = el('g', {}, gSpin);
  el('line', { x1: 0, y1: 0, x2: PLANET_R, y2: 0, stroke: '#ffffff', 'stroke-opacity': 0.4, 'stroke-width': 1, 'stroke-dasharray': '1.5 3' }, spinG);
  el('circle', { r: 2.2, fill: '#ffffff', 'fill-opacity': 0.7 }, spinG);
  const sightGlow = el('line', { x1: SIGHT_FROM, x2: SIGHT, y1: 0, y2: 0, 'stroke-width': 7, 'stroke-linecap': 'round', filter: url('glow') }, spinG);
  const sight = el('line', { x1: SIGHT_FROM, x2: SIGHT, y1: 0, y2: 0, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, spinG);
  const sightTip = el('circle', { cx: SIGHT, cy: 0, r: 3 }, spinG);
  const halo = el('circle', { cx: HEAD, cy: 0, r: 10, fill: C.sun, filter: url('glow') }, spinG);
  const person = drawPerson(spinG, 'sd-person');

  // ---------------------------------------------------------------- UI
  const counter = el('g', { class: 'sd-counter' }, gUi);
  const cBox = el('rect', { class: 'sd-glass', rx: 12 }, counter);
  const cDot1 = el('circle', { r: 3.4 }, counter);
  const cK1 = el('text', { class: 'sd-k' }, counter);
  cK1.textContent = 'SPIN';
  const cV1 = el('text', { class: 'sd-v', 'text-anchor': 'end' }, counter);
  const cDot2 = el('circle', { r: 3.4, fill: C.violet }, counter);
  const cK2 = el('text', { class: 'sd-k' }, counter);
  cK2.textContent = 'ORBIT';
  const cV2 = el('text', { class: 'sd-v', 'text-anchor': 'end' }, counter);
  const cRule = el('line', { stroke: '#ffffff', 'stroke-opacity': 0.08 }, counter);
  const cForm = FORMULAS.map((str, k) => {
    const node = el('text', { class: `sd-f${k === 3 ? ' sd-f-back' : ''}` }, counter);
    if (str) richText(node, str);
    return node;
  });

  const card = el('g', { class: 'sd-card-svg' }, gUi);
  const E = earthNumbers();
  const cardBox = el('rect', { class: 'sd-glass sd-glass-strong', rx: 14 }, card);
  const cardAccent = el('line', { stroke: C.sun, 'stroke-opacity': 0.7, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, card);
  const cardTitle = el('text', { class: 'sd-eyebrow' }, card);
  cardTitle.textContent = 'EARTH’S REAL NUMBERS';
  const cardL1 = el('text', { class: 'sd-card-line' }, card);
  richText(cardL1, `θ ≈ ${E.theta} per day`);
  const cardL2 = el('text', { class: 'sd-card-line' }, card);
  cardL2.textContent = `extra turn ≈ ${E.extraWords}`;
  const cardL3 = el('text', { class: 'sd-card-sum' }, card);
  el('tspan', { class: 'sd-c-spin' }, cardL3).textContent = E.spin;
  el('tspan', {}, cardL3).textContent = ' + ';
  el('tspan', { class: 'sd-c-extra' }, cardL3).textContent = E.extra;
  el('tspan', {}, cardL3).textContent = ' = ';
  el('tspan', { class: 'sd-c-solar' }, cardL3).textContent = E.solar;

  const captions = CAPTIONS.map((str) => {
    const g = el('g', { class: 'sd-caption' }, gUi);
    const box = el('rect', { class: 'sd-glass', rx: 16 }, g);
    const text = el('text', { class: 'sd-cap', 'text-anchor': 'middle' }, g);
    return { g, box, text, str };
  });
  const note = el('text', { class: 'sd-note', 'text-anchor': 'middle', x: 320 }, gUi);
  note.textContent = 'angles exaggerated so you can see them';

  graphic.appendChild(svg);

  // ---------------------------------------------------------------- layout (font scale)
  let u = 1;
  let small = false; // phone layout: compact counter, Earth card centred at the bottom
  let L = null;
  const width = (node) => {
    try {
      return node.getBBox().width;
    } catch {
      return 0;
    }
  };

  function layout() {
    const box = graphic.getBoundingClientRect();
    const k = Math.min(box.width, box.height) / 640 || 1;
    u = clamp(0.9 / k, 1, 1.55); // keep labels legible (~11–13px) on small screens
    small = u > 1.25;
    svg.style.setProperty('--u', u.toFixed(3));
    svg.dataset.size = small ? 's' : 'l';

    // Captions: one line if it fits, otherwise break at "|".
    captions.forEach((c) => {
      c.text.textContent = '';
      if (!c.str) return;
      richText(c.text, c.str.replace('|', ' '), { x: 320 });
      const tooWide = width(c.text) > 560;
      if (tooWide) {
        c.text.textContent = '';
        c.str.split('|').forEach((line, n) => richText(c.text, line, { x: 320, dy: n ? '1.3em' : 0 }));
      }
      const lines = tooWide ? 2 : 1;
      const lh = 15 * u * 1.3;
      const padX = 18 * u;
      const padY = 10 * u;
      const h = lines * lh + padY * 2 - 4 * u;
      const bottom = 640 - 30 * u;
      const top = bottom - h;
      c.text.setAttribute('y', f2(top + padY + 12 * u));
      const w = width(c.text) + padX * 2;
      c.box.setAttribute('x', f2(320 - w / 2));
      c.box.setAttribute('y', f2(top));
      c.box.setAttribute('width', f2(w));
      c.box.setAttribute('height', f2(h));
      c.box.setAttribute('rx', f2(Math.min(h / 2, 18 * u)));
      c.top = top;
    });
    note.setAttribute('y', f2(640 - 10 * u));

    // Counter box, sized for its widest content.
    const pad = 14 * u;
    const row1 = pad + 12 * u;
    const row2 = row1 + 23 * u;
    const row3 = row2 + 26 * u;
    cV1.textContent = '−332°';
    const vW = Math.max(width(cV1), width(cV2.textContent ? cV2 : cV1));
    const kW = width(cK2);
    const fW = small ? 0 : Math.max(...cForm.map(width));
    const cw = Math.max(pad + 13 * u + kW + 20 * u + vW + pad, pad + fW + pad, 150 * u);
    const cx0 = 626 - cw;
    counter.setAttribute('transform', `translate(${f2(cx0)} 14)`);
    cBox.setAttribute('width', f2(cw));
    [cDot1, cDot2].forEach((d, n) => {
      d.setAttribute('cx', f2(pad + 3));
      d.setAttribute('cy', f2((n ? row2 : row1) - 4 * u));
    });
    [cK1, cK2].forEach((t, n) => {
      t.setAttribute('x', f2(pad + 13 * u));
      t.setAttribute('y', f2(n ? row2 : row1));
    });
    [cV1, cV2].forEach((t, n) => {
      t.setAttribute('x', f2(cw - pad));
      t.setAttribute('y', f2(n ? row2 : row1));
    });
    cRule.setAttribute('x1', f2(pad));
    cRule.setAttribute('x2', f2(cw - pad));
    cRule.setAttribute('y1', f2(row2 + 9 * u));
    cRule.setAttribute('y2', f2(row2 + 9 * u));
    cForm.forEach((t) => {
      t.setAttribute('x', f2(pad));
      t.setAttribute('y', f2(row3));
    });

    // Earth card, bottom-right, above the caption.
    const cpad = 16 * u;
    const lines = [cardTitle, cardL1, cardL2, cardL3];
    const cardW = Math.max(...lines.map(width)) + cpad * 2;
    const gaps = [0, 27, 22, 26].map((g) => g * u);
    const cardH = cpad + 10 * u + gaps.reduce((a, b) => a + b, 0) + cpad - 2 * u;
    const capTop = Math.min(...captions.filter((c) => c.str).map((c) => c.top));
    // Phones: the card takes the caption's place (step 4 has no caption), clear of the drawing.
    const cardY = small ? 640 - 30 * u - cardH : Math.min(capTop - 14 * u - cardH, 470);
    const cardX = small ? 320 - cardW / 2 : 626 - cardW;
    card.dataset.y = cardY;
    card.dataset.x = cardX;
    cardBox.setAttribute('width', f2(cardW));
    cardBox.setAttribute('height', f2(cardH));
    cardAccent.setAttribute('x1', f2(cpad));
    cardAccent.setAttribute('x2', f2(cpad + 22 * u));
    cardAccent.setAttribute('y1', 0.75);
    cardAccent.setAttribute('y2', 0.75);
    let y = cpad + 10 * u;
    lines.forEach((t, n) => {
      y += gaps[n];
      t.setAttribute('x', f2(cpad));
      t.setAttribute('y', f2(y));
    });

    // Fixed labels.
    sunLabel.setAttribute('y', f2(SUN.r + 24 * u));
    // "orbit" sits on the top of the orbit, turned to follow the curve.
    const OL = 61;
    const [olx, oly] = polar(SUN.x, SUN.y, ORBIT_R + 9 * u, OL);
    orbitLabel.setAttribute('x', f2(olx));
    orbitLabel.setAttribute('y', f2(oly));
    orbitLabel.setAttribute('transform', `rotate(${90 - OL} ${f2(olx)} ${f2(oly)})`);
    ghostLabel.setAttribute('x', f2(START[0]));
    ghostLabel.setAttribute('y', f2(START[1] + PLANET_R + 20 * u));
    farLabel.setAttribute('y', f2(STAR.y - 19 * u));
    farRays.forEach((ln, n) => {
      const ry = STAR.y + (n - 1) * 7;
      ln.setAttribute('y1', f2(ry));
      ln.setAttribute('y2', f2(ry));
    });
    parCaption.textContent = '';
    richText(parCaption, 'parallel lines →', { x: 22, dy: 0 });
    richText(parCaption, 'alternate angles are equal', { x: 22, dy: '1.35em' });

    L = { pad, row1, row2, row3, cw };
    dirty = true;
  }

  // ---------------------------------------------------------------- draw
  let lastFormula = -1;
  let lastCaption = -1;
  function draw(s) {
    const [px, py] = orbitPoint(s.alpha);
    const sunDir = 180 + s.alpha; // direction from the planet to the Sun
    const beta = 180 + s.spin; // the person's zenith
    const noonOff = Math.abs(wrap180(s.spin - s.alpha));
    const noon = Math.pow(clamp(1 - noonOff / 7, 0, 1), 2);

    planetG.setAttribute('transform', `translate(${f2(px)} ${f2(py)})`);
    lit.setAttribute('transform', `rotate(${f2(-sunDir)})`);
    spinG.setAttribute('transform', `translate(${f2(px)} ${f2(py)}) rotate(${f2(-beta)})`);

    const base = mixRgb(C.rgb.sky, C.rgb.back, s.venus);
    const spinColor = css(mixRgb(base, C.rgb.gold, noon));
    sight.setAttribute('stroke', spinColor);
    sightTip.setAttribute('fill', spinColor);
    sightTip.setAttribute('opacity', f2(1 - noon * 0.8));
    sightGlow.setAttribute('stroke', css(C.rgb.gold));
    sightGlow.setAttribute('opacity', f2(noon * 0.55));
    halo.setAttribute('opacity', f2(noon * 0.75));
    const skin = css(mixRgb([255, 255, 255], [255, 236, 190], noon));
    person.setAttribute('stroke', skin);
    person.setAttribute('fill', skin);
    arrowFwd.setAttribute('opacity', f2(s.spinArrow * (1 - s.venus) * 0.85));
    arrowBack.setAttribute('opacity', f2(s.spinArrow * s.venus * 0.95));
    arrowFwd.setAttribute('stroke', css(C.rgb.sky));
    arrowBack.setAttribute('stroke', css(C.rgb.back));

    // Planet → Sun line: faint direction to the Sun, bright gold at noon.
    for (const ln of [sunRay, sunRayGlow]) {
      ln.setAttribute('x1', f2(SUN.x));
      ln.setAttribute('y1', f2(SUN.y));
      ln.setAttribute('x2', f2(px));
      ln.setAttribute('y2', f2(py));
    }
    sunRay.setAttribute('opacity', f2(Math.max(noon * 0.95, s.sunRay)));
    sunRay.setAttribute('stroke-width', f2(1.4 + noon * 0.9));
    sunRayGlow.setAttribute('opacity', f2(noon * 0.6));

    // Orbit travelled.
    orbitArc.setAttribute('d', arcPath(SUN.x, SUN.y, ORBIT_R, 0, s.alpha));
    orbitArc.setAttribute('opacity', s.alpha > 0.3 ? 0.9 : 0);
    sunLabel.setAttribute('opacity', small ? f2(1 - s.card) : 1);

    // Ghost.
    gGhost.setAttribute('opacity', f2(s.ghost));

    // Parallel lines grow out from each sight-line towards the distant star.
    const dA = START[0] - (START[0] - LINE_LEFT) * s.parDraw;
    const dB = px - (px - LINE_LEFT) * s.parDraw;
    setLine(lineA, START[0], START[1], dA, START[1]);
    setLine(lineB, px, py, dB, py);
    lineA.setAttribute('opacity', f2(s.par * (s.parDraw > 0.001 ? 1 : 0)));
    lineB.setAttribute('opacity', f2(s.par * (s.parDraw > 0.001 ? 1 : 0)));
    tickA.setAttribute('d', chevronAt(TICK_X, START[1]));
    tickB.setAttribute('d', chevronAt(TICK_X, py));
    tickA.setAttribute('opacity', f2(s.ticks));
    tickB.setAttribute('opacity', f2(s.ticks));
    parCaption.setAttribute('opacity', f2(s.parCaption));
    parCaption.setAttribute('transform', `translate(0 ${f2(py + (START[1] - py) * 0.5 - 6 * u)})`);

    // θ at the Sun (between Sun→start and Sun→now) and at the planet (between the
    // star line and the line to the Sun): alternate angles between parallel lines.
    const swS = s.thetaSun;
    const swP = s.thetaPlanet;
    thSunArc.setAttribute('d', arcPath(SUN.x, SUN.y, R_SUN_ARC, 0, swS));
    thSunWedge.setAttribute('d', ring(SUN.x, SUN.y, SUN.r + 3, R_SUN_ARC, 0, swS));
    thPlArc.setAttribute('d', arcPath(px, py, R_PLANET_ARC, 180, 180 + swP));
    thPlWedge.setAttribute('d', ring(px, py, PLANET_R + 3, R_PLANET_ARC, 180, 180 + swP));
    for (const n of [thSunArc, thSunWedge, thPlArc, thPlWedge]) n.setAttribute('opacity', f2(s.theta));
    const labelSun = polar(SUN.x, SUN.y, R_SUN_ARC + 17 * u, Math.max(swS, 8) / 2);
    const labelPl = polar(px, py, R_PLANET_ARC + 16 * u, 180 + Math.max(swP, 8) / 2);
    thSunLabel.setAttribute('x', f2(labelSun[0]));
    thSunLabel.setAttribute('y', f2(labelSun[1] + 7 * u));
    thPlLabel.setAttribute('x', f2(labelPl[0]));
    thPlLabel.setAttribute('y', f2(labelPl[1] + 7 * u));
    thSunLabel.setAttribute('opacity', f2(s.thetaLabel));
    thPlLabel.setAttribute('opacity', f2(s.thetaLabel));

    // The extra turn beyond 360°, filling θ.
    const extra = clamp(s.spin - 360, 0, 90);
    extraWedge.setAttribute('d', s.wedge > 0 && extra > 0.05 ? ring(px, py, PLANET_R + 3, R_EXTRA, 180, 180 + extra) : '');
    extraWedge.setAttribute('opacity', f2(s.wedge));
    extraArc.setAttribute('d', s.wedge > 0 && extra > 0.05 ? arcPath(px, py, R_EXTRA, 180, 180 + extra) : '');
    extraArc.setAttribute('opacity', f2(s.wedge * 0.9));

    // Counter.
    counter.setAttribute('opacity', f2(s.counter));
    const shown = Math.round(s.spinShown);
    cV1.textContent = `${shown < 0 ? '−' : ''}${Math.abs(shown)}°`;
    cV2.textContent = `${s.alpha.toFixed(1)}°`;
    cDot1.setAttribute('fill', css(base));
    cV1.setAttribute('fill', css(mixRgb([238, 241, 248], base, 0.35 + 0.4 * s.venus)));
    const h0 = L.row2 + 12 * u;
    const h1 = L.row3 + 12 * u;
    const fRow = small ? 0 : s.fRow;
    cBox.setAttribute('height', f2(h0 + (h1 - h0) * fRow));
    cRule.setAttribute('opacity', f2(fRow));
    if (s.formula !== lastFormula) {
      cForm.forEach((n, k) => n.classList.toggle('is-on', k === s.formula && k > 0));
      lastFormula = s.formula;
    }

    // Earth card.
    card.setAttribute('opacity', f2(s.card));
    card.setAttribute('transform', `translate(${f2(+card.dataset.x)} ${f2(+card.dataset.y + 10 * (1 - s.card))})`);
    card.style.visibility = s.card > 0.002 ? 'visible' : 'hidden';

    // Caption for the step on screen.
    if (s.step !== lastCaption) {
      captions.forEach((c, k) => c.g.classList.toggle('is-on', k === s.step && !!c.str));
      lastCaption = s.step;
    }
  }

  // ---------------------------------------------------------------- scroll
  let Pd = null;
  let drawn = NaN;
  let dirty = true;
  let raf = 0;
  let running = false;
  let lastTime = 0;
  let active = -1;

  function readP() {
    const line = innerHeight * TRIGGER;
    let idx = -1;
    let local = 0;
    for (let k = 0; k < steps.length; k++) {
      const r = steps[k].getBoundingClientRect();
      if (r.top < line) {
        idx = k;
        local = clamp((line - r.top) / Math.max(1, r.height), 0, 1);
      }
    }
    return idx < 0 ? { P: 0, idx: 0 } : { P: idx + local, idx };
  }

  function tick(now) {
    raf = 0;
    const { P, idx } = readP();
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    if (Pd === null || reduceMotion) Pd = P;
    else {
      Pd += (P - Pd) * (1 - Math.exp(-dt / 0.085));
      if (Math.abs(P - Pd) < 2e-4) Pd = P;
    }
    if (dirty || Math.abs(Pd - drawn) > 1e-5) {
      draw(stateAt(Pd));
      drawn = Pd;
      dirty = false;
    }
    if (idx !== active) {
      steps.forEach((n, k) => n.classList.toggle('is-active', k === idx));
      active = idx;
    }
    if (running) raf = requestAnimationFrame(tick);
  }
  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    raf = requestAnimationFrame(tick);
  }
  function stopLoop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.isIntersecting ? start : stopLoop)();
    },
    { rootMargin: '30% 0px 30% 0px' },
  );
  io.observe(root);
  const ro = new ResizeObserver(() => {
    layout();
    if (!running) tick(performance.now());
  });
  ro.observe(graphic);
  document.fonts?.ready.then(() => {
    layout();
    if (!running) tick(performance.now());
  });

  layout();
  Pd = readP().P;
  tick(performance.now());

  return {
    destroy() {
      stopLoop();
      io.disconnect();
      ro.disconnect();
      svg.remove();
      delete root.dataset.sdReady;
    },
    stateAt,
  };
}

// ---------------------------------------------------------------- helpers
/** Ring sector between radii r0 < r1 from angle a0 to a1 (counter-clockwise). */
function ring(cx, cy, r0, r1, a0, a1) {
  if (Math.abs(a1 - a0) < 0.05) return '';
  const [ox0, oy0] = polar(cx, cy, r1, a0);
  const [ox1, oy1] = polar(cx, cy, r1, a1);
  const [ix1, iy1] = polar(cx, cy, r0, a1);
  const [ix0, iy0] = polar(cx, cy, r0, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sw = a1 > a0 ? 0 : 1;
  return `M${f2(ox0)},${f2(oy0)}A${r1},${r1} 0 ${large} ${sw} ${f2(ox1)},${f2(oy1)}L${f2(ix1)},${f2(iy1)}A${r0},${r0} 0 ${large} ${1 - sw} ${f2(ix0)},${f2(iy0)}Z`;
}
function setLine(n, x1, y1, x2, y2) {
  n.setAttribute('x1', f2(x1));
  n.setAttribute('y1', f2(y1));
  n.setAttribute('x2', f2(x2));
  n.setAttribute('y2', f2(y2));
}
function chevronAt(x, y) {
  return `M${f2(x - 4)},${f2(y - 5.5)}L${f2(x + 3.5)},${f2(y)}L${f2(x - 4)},${f2(y + 5.5)}`;
}
function sparkle(cx, cy, r, w) {
  return `M${cx},${cy - r}Q${cx + w * 0.4},${cy - w * 0.4} ${cx + r},${cy}Q${cx + w * 0.4},${cy + w * 0.4} ${cx},${cy + r}Q${cx - w * 0.4},${cy + w * 0.4} ${cx - r},${cy}Q${cx - w * 0.4},${cy - w * 0.4} ${cx},${cy - r}Z`;
}
/** Arrowhead at angle a on a circle, pointing counter-clockwise (dir 1) or clockwise (dir −1). */
function arrowHead(cx, cy, r, a, dir) {
  const [x, y] = polar(cx, cy, r, a);
  const tangent = a + 90 * dir; // direction of travel
  const back = tangent + 180;
  const [x1, y1] = polar(x, y, 6.5, back + 32);
  const [x2, y2] = polar(x, y, 6.5, back - 32);
  return `M${f2(x1)},${f2(y1)}L${f2(x)},${f2(y)}L${f2(x2)},${f2(y2)}`;
}
/** A tiny person standing on the surface, drawn along +x (feet at the surface). */
function drawPerson(parent, cls) {
  // Drawn upright (up = −y, feet at 0), then turned so "up" points away from the planet.
  const limbs = 'M-2.4,0L-1.5,-6.8M2.4,0L1.5,-6.8M-1.7,-11.8L-5.2,-7.6M1.7,-11.8L5.2,-7.6';
  const torso = 'M0,-6.4L0,-12.2';
  const headY = -(HEAD - PLANET_R + 0.5);
  const transform = `translate(${PLANET_R - 0.5} 0) rotate(90)`;
  const draw = (g, w) => {
    el('path', { d: limbs, fill: 'none', 'stroke-width': 2.3 + w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    el('path', { d: torso, fill: 'none', 'stroke-width': 3.6 + w, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: 0, cy: headY, r: 3.4 + w / 2, stroke: 'none' }, g);
  };
  draw(el('g', { class: 'sd-person-outline', transform }, parent), 2.6);
  const g = el('g', { class: cls, transform }, parent);
  draw(g, 0);
  return g;
}
/** Every step's text sits in a glass card. */
function wrapStepCard(step) {
  let card = [...step.children].find((c) => c.classList.contains('panel'));
  if (!card) {
    const kids = [...step.childNodes].filter((n) => n.nodeType === 1 || n.textContent.trim());
    if (kids.length === 1 && kids[0].nodeType === 1) card = kids[0];
    else {
      card = document.createElement('div');
      while (step.firstChild) card.appendChild(step.firstChild);
      step.appendChild(card);
    }
    card.classList.add('panel');
  }
  card.classList.add('sd-card');
}
