// Sunlight Mandalas gallery: one mandala per planet. Each print "develops" with a clock-hand sweep
// through the year the first time it scrolls into view.
import './create.css';
import { PLANETS } from '../data/planets.js';
import { solarDayHours, effectiveTilt, formatDuration, formatNumber } from '../lib/astro.js';
import { drawMandala } from './mandala.js';

const SWEEP_MS = 1400;
const STAGGER_MS = 120;
const LABELS_MIN_PX = 210; // below this the rim labels are too small to read; the section legend explains the layout

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
const fmtTilt = (t) => `${formatNumber(t, t < 1 ? 2 : 1)}°`;

function describe(p) {
  const eff = effectiveTilt(p.tiltDeg);
  const flip = p.tiltDeg > 90 ? ` (tipped past 90°, so it acts like ${fmtTilt(eff)})` : '';
  if (eff < 5) {
    return `Sunlight mandala for ${p.name}, tilt ${fmtTilt(p.tiltDeg)}${flip}: almost uniformly rose, because every place gets about half a day of sunlight all year.`;
  }
  return `Sunlight mandala for ${p.name}, tilt ${fmtTilt(p.tiltDeg)}${flip}: a yin-yang of light. The north is bright while the south is dark, then the reverse half a year later; polar circles at ±${formatNumber(90 - eff, 1)}°.`;
}

export function initMandalaGallery(root) {
  if (!root) return null;
  root.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'mg-grid';
  root.append(grid);

  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = PLANETS.map((p, index) => {
    const el = document.createElement('article');
    el.className = 'mg-card';
    el.style.setProperty('--accent', p.accent);
    el.style.setProperty('--accent-rgb', hexToRgb(p.accent));

    const canvas = document.createElement('canvas');
    canvas.className = 'mg-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', describe(p));

    const meta = document.createElement('div');
    meta.className = 'mg-meta';
    const name = document.createElement('h3');
    name.className = 'mg-name';
    name.textContent = p.name;
    const no = document.createElement('span');
    no.className = 'mg-no';
    no.textContent = `${String(index + 1).padStart(2, '0')} / ${String(PLANETS.length).padStart(2, '0')}`;
    meta.append(name, no);

    const facts = document.createElement('p');
    facts.className = 'mg-facts';
    const tilt = document.createElement('span');
    tilt.textContent = `tilt ${fmtTilt(p.tiltDeg)}`;
    const day = document.createElement('span');
    day.textContent = `day: ${formatDuration(solarDayHours(p))}`;
    facts.append(tilt, day);

    el.append(canvas, meta, facts);
    grid.append(el);
    return { el, canvas, planet: p, index, sweep: reduceMotion ? 1 : 0, started: reduceMotion };
  });

  const draw = (card) =>
    drawMandala(card.canvas, {
      tiltDeg: card.planet.tiltDeg,
      labels: card.canvas.clientWidth >= LABELS_MIN_PX,
      sweep: card.sweep,
    });

  const animate = (card, delay) => {
    card.started = true;
    const t0 = performance.now() + delay;
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / SWEEP_MS));
      card.sweep = easeInOutCubic(t);
      draw(card);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // first paint: an empty plate waiting for its year (or the finished print with reduced motion)
  cards.forEach(draw);

  let io = null;
  if (!reduceMotion && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((e) => e.isIntersecting)
          .map((e) => cards.find((c) => c.el === e.target))
          .filter((c) => c && !c.started)
          .sort((a, b) => a.index - b.index);
        entering.forEach((card, k) => {
          io.unobserve(card.el);
          animate(card, k * STAGGER_MS);
        });
      },
      { threshold: 0.35 },
    );
    cards.forEach((c) => io.observe(c.el));
  } else if (!reduceMotion) {
    cards.forEach((c) => animate(c, c.index * STAGGER_MS));
  }

  // keep prints sharp when the grid reflows; redraw once the label font has arrived
  let pending = 0;
  const redrawAll = () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      cards.forEach(draw);
    });
  };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(redrawAll) : null;
  if (ro) cards.forEach((c) => ro.observe(c.canvas));
  else window.addEventListener('resize', redrawAll);
  if (document.fonts) {
    document.fonts.load('500 10px "JetBrains Mono"').then(redrawAll, () => {});
    document.fonts.ready.then(redrawAll, () => {});
  }

  return {
    destroy() {
      io?.disconnect();
      ro?.disconnect();
      window.removeEventListener('resize', redrawAll);
      root.textContent = '';
    },
  };
}
