// "Design your own world": choose a spin, a year and a tilt; the formula gives the day and the
// mandala draws that world's year of sunlight. Every number comes from src/lib/astro.js.
import './create.css';
import {
  solarDayHours,
  sunRisesInWest,
  orbitAnglePerDay,
  effectiveTilt,
  daylightHours,
  formatDuration,
  formatNumber,
} from '../lib/astro.js';
import { drawMandala, drawTidallyLocked, paletteCss } from './mandala.js';

const SPIN = { min: 1, max: 10000 }; // hours, log slider
const YEAR = { min: 1, max: 100000 }; // Earth days, log slider
const STEPS = 1000;
const SNAP = 0.03; // spin and year lock together within 3% (a few px of drag), so "forever" is reachable by hand
const REVEAL_MS = 950;
const POSTER = 1600;

const DEFAULT = { spinHours: 23.9345, retrograde: false, yearDays: 365.256, tiltDeg: 23.44 }; // opens on Earth
const PRESETS = [
  { id: 'earth', label: 'Earth', spinHours: 23.9345, retrograde: false, yearDays: 365.256, tiltDeg: 23.44 },
  { id: 'mercury', label: 'Mercury 3:2', spinHours: 1407.5, retrograde: false, yearDays: 87.969, tiltDeg: 0.034 },
  { id: 'locked', label: 'Tidally locked', spinHours: 720, retrograde: false, yearDays: 30, tiltDeg: 0 },
  { id: 'uranus', label: 'Sideways like Uranus', spinHours: 17.25, retrograde: true, yearDays: 30685, tiltDeg: 97.8 },
  { id: 'flat', label: 'No seasons', spinHours: 24, retrograde: false, yearDays: 365, tiltDeg: 0 },
  { id: 'still', label: 'Sun stands still?', spinHours: 9600, retrograde: false, yearDays: 365, tiltDeg: 10 },
];
const JUPITER = { spinHours: 9.925, retrograde: false, yearDays: 4332.59, tiltDeg: 3.13 };

const TRY = [
  {
    q: 'Make a day that lasts forever.',
    a: 'Make the spin equal to the year, spinning forwards. Then 1/<i>T</i> = 1/<i>spin</i> − 1/<i>year</i> = 0: the planet turns exactly once per orbit, so one side always faces the Sun. This is tidal locking, and the Moon does it to Earth.',
    load: 'locked',
  },
  {
    q: 'Make the Sun rise in the west without spinning backwards.',
    a: 'Spin slower than the year. When 1/<i>spin</i> − 1/<i>year</i> &lt; 0, the orbit outruns the spin, so the Sun drifts backwards across the sky and rises in the west.',
    load: 'still',
  },
  {
    q: 'What tilt pushes the polar circles all the way to the equator?',
    a: '90°. The polar circles sit at 90° − tilt, so a planet lying on its side gets midnight Sun all the way down to the equator at the solstices.',
    load: 'tilt90',
  },
  {
    q: 'Why are Jupiter’s and Mercury’s mandalas almost blank?',
    a: 'Their tilts are tiny (3.1° and 0.03°). The Sun stays over the equator all year, so every place gets half a day of sunlight and the whole disc stays rose.',
    load: 'jupiter',
  },
];

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const logPos = (v, r) => (STEPS * Math.log(v / r.min)) / Math.log(r.max / r.min);
const logVal = (p, r) => r.min * (r.max / r.min) ** (p / STEPS);
const fmtH = (h) => `${formatNumber(h, h < 10 ? 3 : h < 100 ? 2 : h < 1000 ? 1 : 0)} h`;
const fmtDays = (d) => {
  const s = `${formatNumber(d, d < 1000 ? 2 : 0)} Earth days`;
  return d >= 730 ? `${s} · ${formatNumber(d / 365.25, d < 3650 ? 1 : 0)} yr` : s;
};
const fmtTilt = (t) => `${formatNumber(t, t < 1 ? 2 : 1)}°`;
const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Everything the lab shows, computed from astro.js for one world. */
export function computeWorld(s) {
  const T = solarDayHours(s);
  const yearH = s.yearDays * 24;
  const locked = !Number.isFinite(T);
  const rate = s.retrograde ? 1 / s.spinHours + 1 / yearH : 1 / s.spinHours - 1 / yearH;
  const eff = effectiveTilt(s.tiltDeg);
  let longest = 0;
  if (!locked) for (let L = 0; L < 360; L++) longest = Math.max(longest, daylightHours(s, 45, L));
  return {
    T,
    yearH,
    locked,
    rate,
    eff,
    west: sunRisesInWest(s),
    daysPerYear: locked ? 0 : yearH / T,
    theta: orbitAnglePerDay(s),
    polar: eff > 0 ? 90 - eff : null,
    longest,
    longDay: !locked && T > 0.1 * yearH,
  };
}

function texts(s, w) {
  const polarDigits = w.polar !== null && w.polar > 89.5 ? 2 : 1;
  return {
    day: w.locked ? 'forever — one side always faces the Sun' : formatDuration(w.T),
    rise: w.locked ? 'never: it hangs still in the sky' : w.west ? 'in the west' : 'in the east',
    days: formatNumber(w.daysPerYear, 1),
    theta: w.locked ? '— (no day ever ends)' : `${formatNumber(w.theta, w.theta < 10 ? 3 : 1)}°`,
    polar: w.polar === null ? 'none' : w.polar < 0.05 ? '0°, the equator' : `±${formatNumber(w.polar, polarDigits)}°`,
    longest: w.locked ? 'forever, on the day side' : formatDuration(w.longest),
  };
}

function formulaHTML(s, w) {
  const sign = s.retrograde ? '+' : '−';
  const head = `1/<i>T</i> = 1/<i>spin</i> ${sign} 1/<i>year</i>`;
  const nums = `1/${fmtH(s.spinHours)} ${sign} 1/${fmtH(w.yearH)}`;
  const tail = w.locked
    ? `= 0 &nbsp;⇒&nbsp; <i>T</i> = ∞`
    : `= ${w.rate < 0 ? '−' : ''}1/${fmtH(1 / Math.abs(w.rate))} &nbsp;⇒&nbsp; <i>T</i> = ${formatDuration(w.T)}`;
  return `<span class="wl-f-head">${head}</span><span class="wl-f-nums">${nums} ${tail}</span>`;
}

const TEMPLATE = `
<div class="panel wl-panel">
  <div class="wl-controls">
    <div class="wl-block">
      <p class="wl-kicker">Start from a world</p>
      <div class="wl-presets" role="group" aria-label="Preset worlds">
        ${PRESETS.map((p) => `<button type="button" class="chip" data-preset="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}
      </div>
    </div>

    <div class="range wl-range">
      <label for="wl-spin"><span>Spin period <small>one turn against the stars</small></span><output id="wl-spin-out" for="wl-spin"></output></label>
      <div class="wl-track"><input id="wl-spin" type="range" min="0" max="${STEPS}" step="any" /><i class="wl-mark" data-mark="spin" aria-hidden="true" title="Spin = year: tidally locked"></i></div>
      <div class="wl-scale" aria-hidden="true"><span>1 h</span><span>100 h</span><span>10,000 h</span></div>
    </div>
    <div class="wl-dir" role="group" aria-label="Spin direction">
      <span class="wl-kicker">Spin direction</span>
      <button type="button" class="chip" data-dir="fwd" aria-pressed="true">Forwards</button>
      <button type="button" class="chip" data-dir="bwd" aria-pressed="false">Backwards</button>
    </div>

    <div class="range wl-range">
      <label for="wl-year"><span>Year length <small>one trip around the star</small></span><output id="wl-year-out" for="wl-year"></output></label>
      <div class="wl-track"><input id="wl-year" type="range" min="0" max="${STEPS}" step="any" /><i class="wl-mark" data-mark="year" aria-hidden="true" title="Year = spin: tidally locked"></i></div>
      <div class="wl-scale" aria-hidden="true"><span>1 day</span><span>316 days</span><span>100,000 days</span></div>
    </div>

    <div class="range wl-range">
      <label for="wl-tilt"><span>Tilt <small>of the spin axis</small></span><output id="wl-tilt-out" for="wl-tilt"></output></label>
      <div class="wl-track"><input id="wl-tilt" type="range" min="0" max="180" step="0.1" /></div>
      <div class="wl-scale" aria-hidden="true"><span>0°</span><span>90° on its side</span><span>180°</span></div>
    </div>

    <p class="wl-formula" aria-live="polite"></p>

    <div class="wl-stats">
      <div class="stat wl-stat"><span>Solar day</span><b data-out="day"></b></div>
      <div class="stat wl-stat"><span>The Sun rises</span><b data-out="rise"></b></div>
      <div class="stat wl-stat"><span>Days in one year</span><b data-out="days"></b></div>
      <div class="stat wl-stat"><span>Orbit angle per day <i class="wl-sym">θ</i></span><b data-out="theta"></b></div>
      <div class="stat wl-stat"><span>Polar circles at</span><b data-out="polar"></b></div>
      <div class="stat wl-stat"><span>Longest daylight at 45°N</span><b data-out="longest"></b></div>
    </div>

    <p class="wl-warn" role="note" hidden>
      <span class="wl-warn-icon" aria-hidden="true">!</span>
      <span>This world's day is long compared with its year, so the season shifts during a single day — read the mandala as an approximation.</span>
    </p>
  </div>

  <figure class="wl-stage">
    <div class="wl-art"><canvas class="wl-canvas" role="img"></canvas></div>
    <figcaption class="wl-stage-foot">
      <span class="wl-stage-note">Clockwise from the top: one year.<br />Rim = north pole, centre = south pole.</span>
      <button type="button" class="btn wl-download">Download PNG</button>
    </figcaption>
  </figure>
</div>

<div class="wl-try">
  <p class="eyebrow">Try this</p>
  <div class="wl-try-grid">
    ${TRY.map(
      (t, i) => `
    <article class="wl-try-card">
      <span class="wl-try-no">${String(i + 1).padStart(2, '0')}</span>
      <h4 class="wl-try-q">${t.q}</h4>
      <details class="wl-try-a">
        <summary>Show answer</summary>
        <p>${t.a}</p>
        <button type="button" class="wl-try-load" data-load="${t.load}">Load it in the lab ↗</button>
      </details>
    </article>`,
    ).join('')}
  </div>
</div>`;

export function initWorldLab(root) {
  if (!root) return null;
  root.innerHTML = TEMPLATE;
  const $ = (sel) => root.querySelector(sel);
  const spinIn = $('#wl-spin');
  const yearIn = $('#wl-year');
  const tiltIn = $('#wl-tilt');
  const canvas = $('.wl-canvas');
  const formula = $('.wl-formula');
  const warn = $('.wl-warn');
  const outs = Object.fromEntries([...root.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]));
  const presetBtns = [...root.querySelectorAll('[data-preset]')];
  const dirBtns = [...root.querySelectorAll('[data-dir]')];
  const downloadBtn = $('.wl-download');
  const markSpin = $('[data-mark="spin"]');
  const markYear = $('[data-mark="year"]');

  const state = { ...DEFAULT };
  let reveal = 1; // sweep of the clock hand when a preset is picked
  let revealRaf = 0;
  let frame = 0;

  const setFill = (input) => {
    const min = +input.min;
    const max = +input.max;
    input.style.setProperty('--fill', `${(((+input.value - min) / (max - min)) * 100).toFixed(2)}%`);
  };
  const syncSliders = () => {
    spinIn.value = logPos(state.spinHours, SPIN);
    yearIn.value = logPos(state.yearDays, YEAR);
    tiltIn.value = state.tiltDeg;
    [spinIn, yearIn, tiltIn].forEach(setFill);
  };

  function render() {
    frame = 0;
    const w = computeWorld(state);
    const t = texts(state, w);
    $('#wl-spin-out').textContent = formatDuration(state.spinHours);
    $('#wl-year-out').textContent = fmtDays(state.yearDays);
    $('#wl-tilt-out').textContent = fmtTilt(state.tiltDeg);
    spinIn.setAttribute('aria-valuetext', `${formatDuration(state.spinHours)}`);
    yearIn.setAttribute('aria-valuetext', fmtDays(state.yearDays));
    tiltIn.setAttribute('aria-valuetext', fmtTilt(state.tiltDeg));
    for (const [k, el] of Object.entries(outs)) {
      el.textContent = t[k];
      el.classList.toggle('is-long', t[k].length > 14);
    }
    formula.innerHTML = formulaHTML(state, w);
    // where spin = year on each slider (only a forwards spin can lock)
    const atSpin = logPos(state.yearDays * 24, SPIN) / STEPS;
    const atYear = logPos(state.spinHours / 24, YEAR) / STEPS;
    markSpin.hidden = state.retrograde || atSpin < 0 || atSpin > 1;
    markYear.hidden = state.retrograde || atYear < 0 || atYear > 1;
    markSpin.style.setProperty('--at', atSpin.toFixed(4));
    markYear.style.setProperty('--at', atYear.toFixed(4));
    warn.hidden = !w.longDay;
    dirBtns.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.dir === 'bwd') === state.retrograde)));
    presetBtns.forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      const on = same(p.spinHours, state.spinHours) && same(p.yearDays, state.yearDays) && same(p.tiltDeg, state.tiltDeg) && p.retrograde === state.retrograde;
      b.setAttribute('aria-pressed', String(on));
    });
    if (w.locked) {
      drawTidallyLocked(canvas);
      canvas.setAttribute('aria-label', 'Tidally locked world: permanent day on one side, permanent night on the other.');
    } else {
      drawMandala(canvas, { tiltDeg: state.tiltDeg, labels: true, contours: true, sweep: reveal });
      canvas.setAttribute(
        'aria-label',
        `Sunlight mandala for your world: tilt ${fmtTilt(state.tiltDeg)}, solar day ${t.day}, polar circles ${t.polar}.`,
      );
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const stopReveal = () => {
    if (revealRaf) cancelAnimationFrame(revealRaf);
    revealRaf = 0;
    reveal = 1;
  };
  const playReveal = () => {
    stopReveal();
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return schedule();
    const t0 = performance.now();
    reveal = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / REVEAL_MS);
      reveal = easeInOutCubic(t);
      render();
      revealRaf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    revealRaf = requestAnimationFrame(step);
  };

  const applyWorld = (world) => {
    Object.assign(state, world);
    syncSliders();
    playReveal();
  };

  spinIn.addEventListener('input', () => {
    stopReveal();
    let h = logVal(+spinIn.value, SPIN);
    const yearH = state.yearDays * 24;
    if (!state.retrograde && Math.abs(Math.log(h / yearH)) < SNAP) h = yearH; // lock to the year
    state.spinHours = h;
    setFill(spinIn);
    schedule();
  });
  yearIn.addEventListener('input', () => {
    stopReveal();
    let d = logVal(+yearIn.value, YEAR);
    if (!state.retrograde && Math.abs(Math.log((d * 24) / state.spinHours)) < SNAP) d = state.spinHours / 24;
    state.yearDays = d;
    setFill(yearIn);
    schedule();
  });
  tiltIn.addEventListener('input', () => {
    stopReveal();
    state.tiltDeg = +tiltIn.value;
    setFill(tiltIn);
    schedule();
  });
  dirBtns.forEach((b) =>
    b.addEventListener('click', () => {
      state.retrograde = b.dataset.dir === 'bwd';
      schedule();
    }),
  );
  presetBtns.forEach((b) =>
    b.addEventListener('click', () => {
      const { id, label, ...world } = PRESETS.find((x) => x.id === b.dataset.preset);
      applyWorld(world);
    }),
  );
  root.querySelectorAll('[data-load]').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.load;
      const preset = PRESETS.find((x) => x.id === key);
      if (preset) {
        const { id, label, ...world } = preset;
        applyWorld(world);
      } else if (key === 'tilt90') {
        const keep = computeWorld(state).locked ? { spinHours: DEFAULT.spinHours, yearDays: DEFAULT.yearDays } : {};
        applyWorld({ ...keep, tiltDeg: 90 });
      } else if (key === 'jupiter') {
        applyWorld(JUPITER);
      }
      const box = canvas.getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Rendering…';
    try {
      const blob = await renderPoster({ ...state });
      if (!blob) throw new Error('canvas.toBlob returned nothing');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-sunlight-mandala.png';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error('[lab] download failed', err);
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = 'Download PNG';
    }
  });

  let resizeRaf = 0;
  const onResize = () => {
    if (!resizeRaf) resizeRaf = requestAnimationFrame(() => ((resizeRaf = 0), render()));
  };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  if (ro) ro.observe(canvas);
  else window.addEventListener('resize', onResize);
  if (document.fonts) {
    document.fonts.load('500 12px "JetBrains Mono"').then(schedule, () => {});
    document.fonts.ready.then(schedule, () => {});
  }

  syncSliders();
  render();

  return {
    get state() {
      return { ...state };
    },
    setWorld: applyWorld,
    destroy() {
      stopReveal();
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
      root.textContent = '';
    },
  };
}

/* ------------------------------------------------------------------ PNG poster */

async function fontsReady() {
  if (!document.fonts) return;
  const wait = Promise.all([
    document.fonts.load('600 52px "Space Grotesk"'),
    document.fonts.load('600 30px Inter'),
    document.fonts.load('500 17px "JetBrains Mono"'),
    document.fonts.load('italic 40px "Instrument Serif"'),
  ]).catch(() => {});
  await Promise.race([wait, new Promise((r) => setTimeout(r, 1500))]);
}

function fitFont(ctx, text, maxW, px, weight, family) {
  let size = px;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 14 && ctx.measureText(text).width > maxW) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
}

function tracked(ctx, text, x, y, tracking) {
  let pen = x;
  for (const ch of text) {
    ctx.fillText(ch, pen, y);
    pen += ctx.measureText(ch).width + tracking;
  }
  return pen - x;
}

/** The 1600 px mandala with this world's numbers printed underneath, as a PNG blob. */
async function renderPoster(s) {
  await fontsReady();
  const w = computeWorld(s);
  const t = texts(s, w);
  const W = POSTER;
  const CAP = 470;
  const art = document.createElement('canvas');
  if (w.locked) drawTidallyLocked(art, { size: W, pixelRatio: 1 });
  else drawMandala(art, { tiltDeg: s.tiltDeg, labels: true, contours: true, sweep: 1, size: W, pixelRatio: 1 });

  const out = document.createElement('canvas');
  out.width = W;
  out.height = W + CAP;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#04050b';
  ctx.fillRect(0, 0, W, W + CAP);
  const bg = ctx.createRadialGradient(W / 2, W / 2, W * 0.15, W / 2, W / 2, W * 0.72);
  bg.addColorStop(0, 'rgba(44, 34, 96, 0.32)');
  bg.addColorStop(1, 'rgba(4, 5, 11, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, W);
  ctx.drawImage(art, 0, 0);

  const display = '"Space Grotesk", system-ui, sans-serif';
  const body = 'Inter, system-ui, sans-serif';
  const mono = '"JetBrains Mono", ui-monospace, monospace';
  const x0 = 120;
  const x1 = W - 120;
  const top = W + 6;
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, top);
  ctx.lineTo(x1, top);
  ctx.stroke();

  ctx.fillStyle = '#eef1f8';
  ctx.font = `600 52px ${display}`;
  ctx.fillText('My sunlight mandala', x0, top + 82);
  ctx.fillStyle = '#ffb648';
  ctx.font = `600 16px ${mono}`;
  tracked(ctx, 'SUNLIGHT MANDALAS · DESIGN YOUR OWN WORLD', x0, top + 116, 2.6);

  // colour key, top right
  const barW = 440;
  const bx = x1 - barW;
  ctx.fillStyle = '#7f88a0';
  ctx.font = `500 15px ${mono}`;
  ctx.textAlign = 'right';
  ctx.fillText('SHARE OF THE DAY IN SUNLIGHT', x1, top + 46);
  const grad = ctx.createLinearGradient(bx, 0, x1, 0);
  for (let i = 0; i <= 40; i++) grad.addColorStop(i / 40, paletteCss(i / 40));
  ctx.fillStyle = grad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, top + 60, barW, 14, 7);
  else ctx.rect(bx, top + 60, barW, 14);
  ctx.fill();
  ctx.fillStyle = '#7f88a0';
  ctx.textAlign = 'left';
  ctx.fillText('0%', bx, top + 100);
  ctx.textAlign = 'center';
  ctx.fillText('50%', bx + barW / 2, top + 100);
  ctx.textAlign = 'right';
  ctx.fillText('100%', x1, top + 100);
  ctx.textAlign = 'left';

  // the world's numbers, 4 × 2
  const dir = s.retrograde ? 'backwards' : 'forwards';
  const cells = [
    ['SPIN', `${formatDuration(s.spinHours)}, ${dir}`],
    ['YEAR', fmtDays(s.yearDays).replace(' · ', ' (') + (s.yearDays >= 730 ? ')' : '')],
    ['TILT', fmtTilt(s.tiltDeg)],
    ['SOLAR DAY', w.locked ? 'forever' : formatDuration(w.T)],
    ['THE SUN RISES', w.locked ? 'never' : t.rise],
    ['DAYS IN ONE YEAR', t.days],
    ['POLAR CIRCLES AT', t.polar],
    ['LONGEST DAY AT 45°N', w.locked ? 'forever (day side)' : t.longest],
  ];
  const colW = (x1 - x0) / 4;
  cells.forEach(([label, value], i) => {
    const cx = x0 + (i % 4) * colW;
    const cy = top + 178 + Math.floor(i / 4) * 104;
    ctx.fillStyle = '#7f88a0';
    ctx.font = `500 15px ${mono}`;
    tracked(ctx, label, cx, cy, 1.8);
    ctx.fillStyle = '#eef1f8';
    fitFont(ctx, value, colW - 28, 32, 600, body);
    ctx.fillText(value, cx, cy + 44);
  });

  const sign = s.retrograde ? '+' : '−';
  ctx.fillStyle = '#b8c0d4';
  const serif = '"Instrument Serif", Georgia, serif';
  let pen = x0;
  for (const [text, sub] of [[`1/T = 1/spin ${sign} 1/year     ·     cos H`, false], ['0', true], [' = −tan φ · tan δ', false]]) {
    ctx.font = `italic ${sub ? 19 : 29}px ${serif}`;
    ctx.fillText(text, pen, top + CAP - 64 + (sub ? 7 : 0));
    pen += ctx.measureText(text).width + (sub ? 2 : 0);
  }
  ctx.fillStyle = '#7f88a0';
  ctx.font = `500 14px ${mono}`;
  tracked(ctx, 'ANGLE = SEASON (CLOCKWISE FROM THE SPRING EQUINOX) · RADIUS = LATITUDE (S POLE INSIDE, N POLE ON THE RIM)', x0, top + CAP - 26, 1.4);

  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}
