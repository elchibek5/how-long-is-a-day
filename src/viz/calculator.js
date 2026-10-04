// Solar-day calculator: pick a planet and watch 1/T_solar = 1/T_spin ∓ 1/T_year
// worked out step by step. Every number comes from PLANETS + astro.js.
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { PLANETS, PLANET_BY_ID } from '../data/planets.js';
import { solarDayHours, orbitAnglePerDay, formatDuration, formatNumber } from '../lib/astro.js';
import './calculator.css';

// Reference solar-day lengths from the NASA NSSDC fact sheet ("Length of Day"),
// shown only as a check on our own computed value.
const NASA = {
  mercury: { text: '175.94 days', ours: (T) => `${(T / 24).toFixed(2)} days` },
  venus: { text: '116.75 days', ours: (T) => `${(T / 24).toFixed(2)} days` },
  earth: { text: '24 h', ours: (T) => clock(T) },
  mars: { text: '24 h 39 m 35 s', ours: (T) => clock(T) },
  jupiter: { text: '9 h 55 m 33 s', ours: (T) => clock(T) },
};
const OUTER = new Set(['jupiter', 'saturn', 'uranus', 'neptune']);
const DEFAULT_ID = 'mars';

let instances = 0;

/** "24 h 0 m 0 s" → "24 h", "0 h 3 m 56 s" → "3 m 56 s". */
function tidy(s) {
  return s.replace(/^0 h /, '').replace(/^0 m /, '').replace(/ 0 s$/, '').replace(/ 0 m$/, '');
}
function clock(hours) {
  return tidy(formatDuration(hours, { seconds: true }));
}
/** Human duration: clock time under 72 h, Earth days beyond. */
function human(hours) {
  return hours < 72 ? clock(hours) : formatDuration(hours);
}
/** "2 min 13 s" from a duration in hours. */
function minSec(hours) {
  const total = Math.round(Math.abs(hours) * 3600);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m} min ${s} s` : `${s} s`;
}
const groupDigits = (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');
/** A number for TeX with thousands separators that do not add space. */
function texNum(x, digits = 4) {
  return formatNumber(x, digits).replace(/,/g, '{,}');
}
/** Six significant figures; scientific notation for very small numbers. */
function sig(x, n = 6) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e9) {
    const [int, frac] = x.toPrecision(n).split('.');
    return groupDigits(int) + (frac ? `.${frac}` : '');
  }
  const [m, e] = x.toExponential(n - 1).split('e');
  return `${m} \\times 10^{${parseInt(e, 10)}}`;
}
/** Three significant figures without exponent noise: 0.538, 187, 720, 0.00401. */
function sig3(x) {
  return String(Number(x.toPrecision(3)));
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  };
  return {
    sky: get('--sky', '#7cc8ff'),
    violet: get('--violet', '#a594ff'),
    sun: get('--sun', '#ffb648'),
    rose: get('--rose', '#ff6f9c'),
  };
}

function h(tag, className, html) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html != null) n.innerHTML = html;
  return n;
}

/** Builds the planet calculator inside #calc. */
export function initCalculator(root, { simple = false } = {}) {
  root = typeof root === 'string' ? document.querySelector(root) : root || document.getElementById('calc');
  if (!root) return null;
  const uid = `calc${++instances}`;
  const C = readColors();
  const tex = (s, display = false) =>
    katex.renderToString(s, { displayMode: display, fleqn: display, throwOnError: false, output: 'htmlAndMathml' });
  const col = (color, s) => `\\textcolor{${color}}{${s}}`;
  const Tspin = col(C.sky, 'T_{\\text{spin}}');
  const Tyear = col(C.violet, 'T_{\\text{year}}');
  const Tsolar = col(C.sun, 'T_{\\text{solar}}');

  root.innerHTML = '';
  const card = h('section', 'calc panel');
  card.setAttribute('aria-labelledby', `${uid}-title`);
  card.innerHTML = `
    <header class="calc-head">
      <p class="eyebrow">Check the rule</p>
      <h3 class="calc-title" id="${uid}-title">Does it match NASA?</h3>
      <p class="calc-sub">Pick a planet. The rule uses only its spin and its year.</p>
      <div class="calc-chips" role="group" aria-label="Choose a planet"></div>
    </header>
    <div class="calc-body">
      <ol class="calc-steps" id="${uid}-steps"></ol>
      <aside class="calc-answer" aria-live="polite"></aside>
    </div>
    <button type="button" class="chip calc-toggle" aria-controls="${uid}-steps" aria-expanded="false" hidden>Show the working</button>`;
  root.appendChild(card);
  // Simple mode shows just the answer; the step-by-step working opens on demand.
  const toggle = card.querySelector('.calc-toggle');
  if (simple) {
    card.classList.add('is-simple');
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      const open = card.classList.toggle('is-simple') === false;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide the working' : 'Show the working';
    });
  }
  const chipsRow = card.querySelector('.calc-chips');
  const stepsEl = card.querySelector('.calc-steps');
  const answerEl = card.querySelector('.calc-answer');

  const chips = PLANETS.map((p) => {
    const b = h('button', 'chip calc-chip');
    b.type = 'button';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="calc-dot" style="--c:${p.accent}"></span>${p.name}`;
    b.addEventListener('click', () => select(p.id));
    b.addEventListener('keydown', (e) => {
      const k = chips.indexOf(b);
      const next = e.key === 'ArrowRight' ? k + 1 : e.key === 'ArrowLeft' ? k - 1 : null;
      if (next == null) return;
      e.preventDefault();
      const target = chips[(next + chips.length) % chips.length];
      target.focus();
      select(target.dataset.id);
    });
    chipsRow.appendChild(b);
    return b;
  });

  // Answer panel skeleton (kept between planets so the bars can animate).
  answerEl.innerHTML = `
    <p class="calc-answer-label"></p>
    <p class="calc-big"></p>
    <p class="calc-hours"></p>
    <div class="calc-bars">
      <div class="calc-bar-row">
        <span class="calc-bar-name"><i class="calc-key is-spin"></i>One spin</span>
        <span class="calc-bar-val" data-k="spin"></span>
        <span class="calc-track"><span class="calc-fill is-spin" data-k="spin"></span></span>
      </div>
      <div class="calc-bar-row">
        <span class="calc-bar-name"><i class="calc-key is-solar"></i>Solar day</span>
        <span class="calc-bar-val" data-k="solar"></span>
        <span class="calc-track"><span class="calc-fill is-solar" data-k="solar"></span></span>
      </div>
    </div>
    <p class="calc-insight"></p>
    <p class="calc-nasa"></p>`;
  const $ = (sel) => answerEl.querySelector(sel);

  function stepItem(n, title, body) {
    return `<li class="calc-step"><span class="calc-num" aria-hidden="true">${String(n).padStart(2, '0')}</span>
      <div class="calc-step-body"><h4 class="calc-step-title">${title}</h4>${body}</div></li>`;
  }

  function select(id) {
    const p = PLANET_BY_ID[id] || PLANET_BY_ID[DEFAULT_ID];
    chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === p.id)));
    card.style.setProperty('--planet', p.accent);

    const T = solarDayHours(p);
    const Y = p.yearDays * 24;
    const r1 = 1 / p.spinHours;
    const r2 = 1 / Y;
    const r = p.retrograde ? r1 + r2 : r1 - r2;
    const op = p.retrograde ? '+' : '-';
    const theta = orbitAnglePerDay(p);

    // 1. The two measured motions.
    const spinLine =
      `${Tspin} = ${texNum(p.spinHours, 4)}\\ \\text{h}` +
      (p.spinHours > 72 ? ` \\approx ${texNum(p.spinHours / 24, 2)}\\ \\text{days}` : '');
    const yearLine = `${Tyear} = ${texNum(p.yearDays, 3)}\\ \\text{days} = ${texNum(Y, 3)}\\ \\text{h}`;
    const s1 = `<div class="calc-tex">${tex(spinLine)}</div><div class="calc-tex">${tex(yearLine)}</div>`;

    // 2. The rule for this planet.
    const rule = `\\frac{1}{${Tsolar}} = \\frac{1}{${Tspin}} ${op} \\frac{1}{${Tyear}}`;
    const why = p.retrograde
      ? `${p.name} spins backwards, so the angles add.`
      : `${p.name} spins the same way it orbits, so it must turn an extra θ: subtract.`;
    const s2 = `${tex(rule, true)}<p class="calc-note${p.retrograde ? ' is-back' : ''}">${why.replace('θ', '<i class="calc-theta">θ</i>')}</p>`;

    // 3. Numbers in, answer out (each reciprocal to 6 significant figures).
    const result = T < 72 ? `\\text{${clock(T)}}` : `\\text{${formatDuration(T)}}`;
    const work = [
      `\\frac{1}{${Tsolar}} &= \\frac{1}{${texNum(p.spinHours, 4)}} ${op} \\frac{1}{${texNum(Y, 3)}}`,
      `&= ${sig(r1)} ${op} ${sig(r2)}`,
      `&= ${sig(r)}\\ \\text{h}^{-1}`,
      `${Tsolar} &= \\frac{1}{${sig(r)}} = ${sig(1 / r)}\\ \\text{h}`,
      `&${T < 72 ? '=' : '\\approx'} ${col(C.sun, result)}`,
    ].join(' \\\\[3pt] ');
    const s3 = tex(`\\begin{aligned}${work}\\end{aligned}`, true);

    // 4. How far it orbits in one solar day.
    const thetaTex = [
      `\\theta &= 360^\\circ \\times \\frac{${Tsolar}}{${Tyear}}`,
      `&= 360^\\circ \\times \\frac{${sig(T)}}{${texNum(Y, 3)}} \\approx ${col(C.rose, `${sig3(theta)}^\\circ`)}`,
    ].join(' \\\\[3pt] ');
    const orbits = theta >= 359.5 ? `<p class="calc-note">That is ${sig3(theta / 360)} full orbits in one day.</p>` : '';
    const s4 = tex(`\\begin{aligned}${thetaTex}\\end{aligned}`, true) + orbits;

    stepsEl.innerHTML =
      stepItem(1, 'Measure the two motions', s1) +
      stepItem(2, 'Pick the rule', s2) +
      stepItem(3, 'Put the numbers in', s3) +
      stepItem(4, 'Orbit angle in one solar day', s4);

    // Answer panel.
    $('.calc-answer-label').textContent = `Solar day on ${p.name}`;
    $('.calc-big').textContent = human(T);
    $('.calc-hours').textContent = `= ${formatNumber(T, T < 100 ? 4 : 1)} hours, noon to noon`;
    const max = Math.max(T, p.spinHours);
    answerEl.querySelector('.calc-fill[data-k="spin"]').style.setProperty('--w', (p.spinHours / max).toFixed(4));
    answerEl.querySelector('.calc-fill[data-k="solar"]').style.setProperty('--w', (T / max).toFixed(4));
    answerEl.querySelector('.calc-bar-val[data-k="spin"]').textContent = human(p.spinHours);
    answerEl.querySelector('.calc-bar-val[data-k="solar"]').textContent = human(T);
    $('.calc-insight').innerHTML = insight(p, T);

    const nasa = NASA[p.id];
    const nasaEl = $('.calc-nasa');
    if (nasa) {
      const ok = nasa.ours(T) === nasa.text;
      nasaEl.hidden = false;
      nasaEl.className = `calc-nasa${ok ? ' is-ok' : ''}`;
      nasaEl.innerHTML = `<span class="calc-nasa-k">NASA</span> ${nasa.text} <span class="calc-nasa-v">${ok ? '✓ matches' : `≈ ours ${nasa.ours(T)}`}</span>`;
    } else {
      nasaEl.hidden = true;
    }

    // Replay the entrance animation.
    for (const n of [stepsEl, answerEl]) {
      n.classList.remove('is-in');
      void n.offsetWidth;
      n.classList.add('is-in');
    }
  }

  select(DEFAULT_ID);
  return { select };
}

function insight(p, T) {
  const diff = T - p.spinHours;
  if (p.id === 'mercury') {
    const ratio = T / (p.yearDays * 24);
    return `Solar day = <b>${ratio.toFixed(2)} ×</b> its year (${(T / 24).toFixed(1)} days): one day lasts two years.`;
  }
  if (p.id === 'venus') {
    return `<b>${formatDuration(T)}</b>: shorter than one spin (${formatDuration(p.spinHours)}), because it spins backwards.`;
  }
  if (OUTER.has(p.id)) {
    const sec = Math.abs(diff) * 3600;
    const n = sec < 10 ? sec.toFixed(1) : String(Math.round(sec));
    return `Spin and solar day differ by only <b>${n} seconds</b> — the year is so long the orbit barely matters.`;
  }
  return `<b>${minSec(diff)}</b> ${diff >= 0 ? 'longer' : 'shorter'} than one spin.`;
}
