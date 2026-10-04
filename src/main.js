// Fonts ship with the site (no Google Fonts request), so it renders the same on any school network.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/main.css';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import Lenis from 'lenis';
import { PLANETS } from './data/planets.js';
import { solarDayHours, formatDuration, clamp } from './lib/astro.js';

document.documentElement.classList.add('js');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------- tour stages (built from the data so every number stays in sync) ----------
function buildTour() {
  const tour = document.getElementById('tour');
  tour.innerHTML = PLANETS.map((p, i) => {
    const day = solarDayHours(p);
    const ratio = day / 24;
    const overflow = ratio > 2;
    const fill = Math.min(ratio * 50, 100);
    const ratioText = ratio < 10 ? `${ratio.toFixed(2)}×` : `${Math.round(ratio)}×`;
    return `
    <div class="planet-stage" data-planet="${p.id}">
      <div class="stage-sticky">
        <article class="planet-card panel" style="--accent:${p.accent}">
          <p class="eyebrow">Planet ${i + 1} of 8</p>
          <h3 class="planet-name">${p.name}</h3>
          <p class="planet-tagline">${p.tagline}</p>
          <dl class="planet-stats">
            <div class="hl"><dt>Solar day</dt><dd>${formatDuration(day, { seconds: true })}</dd></div>
            <div><dt>One spin${p.retrograde ? ' (backwards)' : ''}</dt><dd>${formatDuration(p.spinHours, { seconds: true })}</dd></div>
            <div><dt>Tilt</dt><dd>${p.tiltDeg}°</dd></div>
          </dl>
          <div class="ratio">
            <p class="ratio-label"><span>Day compared with Earth's</span><b>${ratioText} an Earth day</b></p>
            <div class="ratio-track${overflow ? ' overflow' : ''}">
              <div class="ratio-fill" style="width:${fill}%"></div>
              <div class="ratio-earth" style="left:50%"></div>
            </div>
          </div>
          <p class="planet-fact">${p.fact}</p>
        </article>
        <div class="planet-slot" aria-hidden="true"></div>
      </div>
    </div>`;
  }).join('');
  return [...tour.querySelectorAll('.planet-stage')];
}

const stages = buildTour();
const cards = stages.map((s) => s.querySelector('.planet-card'));

// ---------- formulas ----------
document.querySelectorAll('[data-tex]').forEach((el) => {
  try {
    katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false, output: 'html' });
  } catch (err) {
    el.textContent = el.dataset.tex;
  }
});

// ---------- smooth scroll ----------
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({ duration: 1.15, smoothWheel: true, wheelMultiplier: 0.95 });
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: a.getAttribute('href') === '#hero' ? 0 : -10, duration: 1.6 });
    else target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  });
});

// ---------- reveal on scroll ----------
const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 70}ms`;
  revealer.observe(el);
});

// ---------- top bar, progress, active section, tour cards ----------
const topbar = document.querySelector('.topbar');
const bar = document.querySelector('.progress i');
const navLinks = [...document.querySelectorAll('.nav a')];
const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
const tourEl = document.getElementById('tour');

function frame() {
  const y = scrollY;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  topbar.classList.toggle('scrolled', y > 40);

  // the tour belongs to "Notice" (it is the visual evidence)
  let active = -1;
  sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * 0.4) active = i; });
  const tourRect = tourEl.getBoundingClientRect();
  if (tourRect.top < innerHeight * 0.4 && tourRect.bottom > innerHeight * 0.4) active = 0;
  navLinks.forEach((a, i) => a.classList.toggle('active', i === active));

  for (let i = 0; i < stages.length; i++) {
    const r = stages[i].getBoundingClientRect();
    if (r.bottom < -50 || r.top > innerHeight + 50) { cards[i].style.opacity = '0'; continue; }
    const p = clamp((innerHeight - r.top) / (r.height + innerHeight), 0, 1);
    const vis = smoothstep(0.24, 0.36, p) * (1 - smoothstep(0.64, 0.76, p));
    const enter = 1 - smoothstep(0.24, 0.36, p);
    const exit = smoothstep(0.64, 0.76, p);
    cards[i].style.opacity = vis.toFixed(3);
    cards[i].style.transform = `translate3d(${(-exit * 40).toFixed(1)}px, ${(enter * 40 - exit * 20).toFixed(1)}px, 0)`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- loader ----------
const loader = document.getElementById('loader');
const pct = document.getElementById('loader-pct');
const started = performance.now();
let loaderDone = false;
function hideLoader() {
  if (loaderDone) return;
  loaderDone = true;
  const wait = Math.max(0, 700 - (performance.now() - started));
  setTimeout(() => loader.classList.add('done'), wait);
}
addEventListener('space:progress', (e) => {
  const { loaded, total } = e.detail || {};
  if (total) pct.textContent = `${Math.round((loaded / total) * 100)}%`;
});
setTimeout(hideLoader, 7000);

// ---------- feature modules (each isolated: one failure never breaks the page) ----------
// import.meta.glob lazy-loads each module as its own chunk, so the page paints before three.js arrives.
const modules = import.meta.glob(['./scene/space.js', './viz/*.js', './create/*.js']);
async function boot(name, path, run) {
  try {
    if (!modules[path]) throw new Error(`module not found: ${path}`);
    const mod = await modules[path]();
    return await run(mod);
  } catch (err) {
    console.error(`[${name}] failed to start`, err);
    return null;
  }
}

boot('space', './scene/space.js', async (m) => {
  const api = m.initSpace({ canvas: document.getElementById('space'), hero: document.getElementById('hero'), stages });
  await (api && api.ready);
}).finally(hideLoader);

boot('solarday', './viz/solarday.js', (m) => m.initSolarDay(document.getElementById('solarday')));
boot('calculator', './viz/calculator.js', (m) => m.initCalculator(document.getElementById('calc'), { simple: true }));
boot('daylight', './viz/daylight.js', (m) => m.initDaylight(document.getElementById('daylight-lab'), { simple: true }));
boot('gallery', './create/gallery.js', (m) => m.initMandalaGallery(document.getElementById('mandala-gallery')));
boot('lab', './create/lab.js', (m) => m.initWorldLab(document.getElementById('world-lab')));
