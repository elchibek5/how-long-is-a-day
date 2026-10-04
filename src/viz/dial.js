// 2.1 — a 24-hour dial that turns time into angle (15° per hour).
const NS = 'http://www.w3.org/2000/svg';
const C = 200;
const R = 160;

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
// angle 0° at the top, clockwise (like a clock)
const pt = (deg, r) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];

function wedgePath(deg, r) {
  if (deg <= 0.01) return '';
  if (deg >= 359.99) return `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`;
  const [x, y] = pt(deg, r);
  return `M ${C} ${C} L ${C} ${C - r} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x} ${y} Z`;
}

export function initDial(root) {
  root.innerHTML = '';
  const svg = el('svg', { viewBox: '0 0 400 400', class: 'dial-svg', role: 'img', 'aria-label': '24-hour dial: every hour is 15 degrees' }, root);
  const defs = el('defs', {}, svg);
  const g = el('radialGradient', { id: 'dial-sun' }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff6dc' }, g);
  el('stop', { offset: '0.45', 'stop-color': '#ffb648' }, g);
  el('stop', { offset: '1', 'stop-color': '#ff7a3d', 'stop-opacity': '0' }, g);

  // hour wedges
  for (let h = 0; h < 24; h++) {
    el('path', {
      d: `M ${C} ${C} L ${pt(h * 15, R).join(' ')} A ${R} ${R} 0 0 1 ${pt((h + 1) * 15, R).join(' ')} Z`,
      fill: h % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)',
      stroke: 'rgba(255,255,255,0.08)',
    }, svg);
  }
  const wedge = el('path', { fill: 'rgba(255,182,72,0.22)', stroke: 'none' }, svg);
  el('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: 'rgba(255,255,255,0.22)' }, svg);
  // labels: hours outside, degrees inside
  for (let h = 0; h < 24; h += 3) {
    const [hx, hy] = pt(h * 15, R + 20);
    const t = el('text', { x: hx, y: hy + 4, 'text-anchor': 'middle', class: 'svg-label', 'font-size': '12' }, svg);
    t.textContent = `${h} h`;
    const [dx, dy] = pt(h * 15, R - 26);
    const d = el('text', { x: dx, y: dy + 4, 'text-anchor': 'middle', fill: '#ffb648', 'font-size': '11', 'font-family': 'JetBrains Mono, monospace' }, svg);
    d.textContent = `${h * 15}°`;
  }
  const arc = el('path', { fill: 'none', stroke: '#ff6f9c', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
  const hand = el('line', { x1: C, y1: C, stroke: '#ffb648', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
  el('line', { x1: C, y1: C, x2: C, y2: C - R, stroke: 'rgba(255,255,255,0.35)', 'stroke-dasharray': '4 5' }, svg);
  const glow = el('circle', { r: 26, fill: 'url(#dial-sun)' }, svg);
  const sun = el('circle', { r: 10, fill: '#ffd27a' }, svg);
  el('circle', { cx: C, cy: C, r: 5, fill: '#eef1f8' }, svg);
  const angleText = el('text', { 'text-anchor': 'middle', class: 'svg-math', 'font-size': '20' }, svg);

  const controls = document.createElement('div');
  controls.className = 'dial-controls';
  controls.innerHTML = `
    <div class="dial-readout">
      <div class="stat"><b data-k="time">06:00</b><span>Time of day</span></div>
      <div class="stat"><b data-k="angle">90°</b><span>Earth has turned</span></div>
      <div class="stat"><b data-k="calc">6 × 15°</b><span>Hours × 15°</span></div>
    </div>
    <div class="range">
      <label for="dial-hour"><span>Drag the hour</span><output data-k="out">6.00 h</output></label>
      <input id="dial-hour" type="range" min="0" max="24" step="0.05" value="6" />
    </div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="chip" type="button" aria-pressed="true" data-k="play">Playing · tap to pause</button></div>`;
  root.appendChild(controls);
  const q = (k) => controls.querySelector(`[data-k="${k}"]`);
  const input = controls.querySelector('input');
  const play = q('play');

  let hour = 6;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  play.setAttribute('aria-pressed', String(playing));
  play.textContent = playing ? 'Playing · tap to pause' : 'Paused · tap to play';

  function render() {
    const deg = (hour / 24) * 360;
    wedge.setAttribute('d', wedgePath(deg, R));
    const [x, y] = pt(deg, R - 4);
    hand.setAttribute('x2', x);
    hand.setAttribute('y2', y);
    glow.setAttribute('cx', x); glow.setAttribute('cy', y);
    sun.setAttribute('cx', x); sun.setAttribute('cy', y);
    const ar = 46;
    if (deg > 0.5) {
      const [ax, ay] = pt(Math.min(deg, 359.9), ar);
      arc.setAttribute('d', `M ${C} ${C - ar} A ${ar} ${ar} 0 ${deg > 180 ? 1 : 0} 1 ${ax} ${ay}`);
    } else arc.setAttribute('d', '');
    const [tx, ty] = pt(Math.max(deg / 2, 12), ar + 22);
    angleText.setAttribute('x', tx);
    angleText.setAttribute('y', ty + 6);
    angleText.textContent = `${Math.round(deg)}°`;
    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour % 1) * 60);
    q('time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    q('angle').textContent = `${deg.toFixed(1)}°`;
    q('calc').textContent = `${hour.toFixed(2)} × 15°`;
    q('out').textContent = `${hour.toFixed(2)} h`;
    input.value = String(hour);
    input.style.setProperty('--fill', `${(hour / 24) * 100}%`);
  }

  input.addEventListener('input', () => { hour = Number(input.value); playing = false; play.setAttribute('aria-pressed', 'false'); play.textContent = 'Paused · tap to play'; render(); });
  play.addEventListener('click', () => {
    playing = !playing;
    play.setAttribute('aria-pressed', String(playing));
    play.textContent = playing ? 'Playing · tap to pause' : 'Paused · tap to play';
  });

  let last = performance.now();
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  function tick(t) {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (playing && visible) { hour = (hour + dt * 2) % 24; render(); }
    requestAnimationFrame(tick);
  }
  render();
  requestAnimationFrame(tick);
}
