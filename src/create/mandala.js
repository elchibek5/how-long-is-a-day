// Sunlight Mandalas: a whole year of daylight on a planet, drawn in one circle.
//
//   angle  = season L. 0° (northern spring equinox) sits at 12 o'clock and L grows clockwise:
//            90° June solstice at 3, 180° September equinox at 6, 270° December solstice at 9.
//   radius = latitude φ. South pole on the inner rim r_in = 0.14·R, north pole on the outer rim R:
//            φ = −90 + 180·(r − r_in)/(R − r_in)
//   colour = f, the fraction of the day the Sun is up: f = daylightFraction(φ, declination(tilt, L)).
//
// The pixel field is exact. Each pixel uses the exact latitude of its own radius and the astro.js
// declination of its own angle (tabulated per angle column, finer than one rim pixel, and interpolated);
// cos H0 = −tan φ · tan δ then becomes a colour through a lookup table that is extra fine at the
// polar-circle edges, where acos is infinitely steep. Contours are vector curves from
// latitudeForFraction, drawn on top.

import { declination, latitudeForFraction } from '../lib/astro.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Inner rim (the south pole) as a fraction of the outer radius R (the north pole). */
export const INNER_RATIO = 0.14;

/** Daylight fraction → colour stops. f = 0.5 (equal day and night) is the rose #c85a83. */
export const PALETTE_STOPS = [
  [0.0, '#05071a'],
  [0.15, '#1a1f5c'],
  [0.32, '#4b2a8a'],
  [0.45, '#9a3f8f'],
  [0.5, '#c85a83'],
  [0.62, '#f08a5d'],
  [0.78, '#ffc46b'],
  [0.92, '#ffe7a8'],
  [1.0, '#fffaf0'],
];

const SEASON_LABELS = [
  ['SPRING EQUINOX', 0],
  ['SUMMER SOLSTICE', 90],
  ['AUTUMN EQUINOX', 180],
  ['WINTER SOLSTICE', 270],
];

/* ------------------------------------------------------------------ colour */

const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l) => 255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055);
const LINEAR_STOPS = PALETTE_STOPS.map(([f, hex]) => [
  f,
  [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16))),
]);

/** Palette colour for a daylight fraction f ∈ [0, 1], interpolated in linear RGB. Returns sRGB floats 0–255. */
export function paletteColor(f) {
  const x = f > 0 ? (f < 1 ? f : 1) : 0;
  let i = 1;
  while (i < LINEAR_STOPS.length - 1 && x > LINEAR_STOPS[i][0]) i++;
  const [f0, a] = LINEAR_STOPS[i - 1];
  const [f1, b] = LINEAR_STOPS[i];
  const t = (x - f0) / (f1 - f0);
  return [toSrgb(a[0] + (b[0] - a[0]) * t), toSrgb(a[1] + (b[1] - a[1]) * t), toSrgb(a[2] + (b[2] - a[2]) * t)];
}

/** CSS colour string for a daylight fraction (legends, captions). */
export function paletteCss(f, alpha = 1) {
  const [r, g, b] = paletteColor(f).map(Math.round);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Colour as a function of cos H0 = −tan φ · tan δ, so the inner loop needs no trigonometry.
// f = H0/180° = acos(cos H0)/π, exactly as astro.js daylightFraction; cos H0 ≤ −1 → polar day (f = 1),
// ≥ 1 → polar night (f = 0). The last 2% at each end gets its own table, 400× finer than the main one.
const NX = 16384;
const HALF_NX1 = (NX - 1) / 2;
const END = 0.02;
const NE = 8192;
const END_SCALE = (NE - 1) / END;
const LO = NX * 3; // table for cos H0 ∈ [−1, −0.98]
const HI = LO + NE * 3; // table for cos H0 ∈ [0.98, 1]
// Entries are fixed point (colour × 256) plus ½ for rounding, so a pixel is (entry + dither) >> 8.
let colorLut = null;
function getColorLut() {
  if (colorLut) return colorLut;
  colorLut = new Uint16Array((NX + 2 * NE) * 3);
  const put = (o, cosH0) => {
    const c = paletteColor(Math.acos(clamp(cosH0, -1, 1)) / Math.PI);
    colorLut[o] = Math.round(c[0] * 256) + 128;
    colorLut[o + 1] = Math.round(c[1] * 256) + 128;
    colorLut[o + 2] = Math.round(c[2] * 256) + 128;
  };
  for (let k = 0; k < NX; k++) put(k * 3, k / HALF_NX1 - 1);
  for (let k = 0; k < NE; k++) {
    put(LO + k * 3, -1 + k / END_SCALE);
    put(HI + k * 3, 1 - k / END_SCALE);
  }
  return colorLut;
}

// 8×8 ordered dither (±½ of one 8-bit step, in 1/256 units) keeps the long dark gradients free of banding.
const BAYER = new Int8Array(64);
{
  const m2 = (x, y) => 2 * (x ^ y) + y;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 16 * m2(x & 1, y & 1) + 4 * m2((x >> 1) & 1, (y >> 1) & 1) + m2((x >> 2) & 1, (y >> 2) & 1);
      BAYER[y * 8 + x] = v * 4 - 126; // −126 … 126
    }
  }
}

/* ------------------------------------------------------------------ geometry */

/** Where everything sits on a canvas of `size` CSS px. Labels need a margin outside the rim. */
export function mandalaLayout(size, labels = true) {
  const u = Math.max(1, size / 520); // line and label unit: 1 up to the 520 px design size, then proportional
  const font = clamp(size * 0.0215, 7.5, 12.5 * u);
  const margin = labels ? font + 17 * u : Math.max(5, size * 0.035);
  const R = Math.max(4, size / 2 - margin);
  return { size, c: size / 2, R, rIn: INNER_RATIO * R, font, u };
}

/** Pixel offset from the centre (dx right, dy down) → season L (deg, clockwise from the top) and latitude φ (deg). */
export function seasonLatitudeAt(dx, dy, R, rIn) {
  let L = Math.atan2(dx, -dy) / RAD;
  if (L < 0) L += 360;
  const r = Math.hypot(dx, dy);
  const phi = -90 + (180 * (clamp(r, rIn, R) - rIn)) / (R - rIn);
  return { L, phi, inside: r >= rIn && r <= R };
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Per-size pixel tables (exact tan φ and angle per pixel, edge coverage, dither), built once per size
// from one quadrant and mirrored. A tilt change then costs a few multiplies and table reads per pixel.
const geometries = new Map();
function getGeometry(S, R, rIn, cache) {
  const key = `${S}|${R}|${rIn}`;
  const hit = geometries.get(key);
  if (hit) {
    geometries.delete(key);
    geometries.set(key, hit);
    return hit;
  }
  const geo = buildGeometry(S, R, rIn);
  if (cache) {
    geometries.set(key, geo);
    while (geometries.size > 2) geometries.delete(geometries.keys().next().value);
  }
  return geo;
}

function buildGeometry(S, R, rIn) {
  const h = S >> 1; // S is always even, so the four quadrants mirror exactly
  const nAng = Math.max(1024, nextPow2(Math.ceil(4 * Math.PI * R))); // ≥ 2 columns per rim pixel
  const halfAng = nAng >> 1;
  const outer = R + 0.5;
  const inner = Math.max(0, rIn - 0.5);
  const outer2 = outer * outer;
  const inner2 = inner * inner;
  let count = 0;
  for (let j = 0; j < h; j++) {
    const dy2 = (j + 0.5) * (j + 0.5);
    for (let i = 0; i < h; i++) {
      const d2 = (i + 0.5) * (i + 0.5) + dy2;
      if (d2 < outer2 && d2 > inner2) count++;
    }
  }
  const n = count * 4;
  const pix = new Uint32Array(n);
  const tanPhi = new Float32Array(n);
  const pos = new Float32Array(n); // angle in columns: L/360° · nAng
  const cov = new Uint8Array(n);
  const dith = new Int8Array(n);
  const span = R - rIn;
  let o = 0;
  for (let j = 0; j < h; j++) {
    const dy = j + 0.5; // distance above the centre for the top quadrants
    const dy2 = dy * dy;
    const yt = h - 1 - j;
    const yb = h + j;
    for (let i = 0; i < h; i++) {
      const dx = i + 0.5;
      const d2 = dx * dx + dy2;
      if (d2 >= outer2 || d2 <= inner2) continue;
      const r = Math.sqrt(d2);
      const a = Math.round(255 * Math.min(1, outer - r) * Math.min(1, r - inner));
      const rr = r < rIn ? rIn : r > R ? R : r;
      const t = Math.tan((-90 + (180 * (rr - rIn)) / span) * RAD);
      const k = (Math.atan2(dx, dy) / TAU) * nAng; // top-right quadrant: L ∈ (0°, 90°)
      const xr = h + i;
      const xl = h - 1 - i;
      // top-right: L
      pix[o] = yt * S + xr; pos[o] = k; tanPhi[o] = t; cov[o] = a; dith[o] = BAYER[((yt & 7) << 3) | (xr & 7)]; o++;
      // top-left: 360° − L
      pix[o] = yt * S + xl; pos[o] = nAng - k; tanPhi[o] = t; cov[o] = a; dith[o] = BAYER[((yt & 7) << 3) | (xl & 7)]; o++;
      // bottom-right: 180° − L
      pix[o] = yb * S + xr; pos[o] = halfAng - k; tanPhi[o] = t; cov[o] = a; dith[o] = BAYER[((yb & 7) << 3) | (xr & 7)]; o++;
      // bottom-left: 180° + L
      pix[o] = yb * S + xl; pos[o] = halfAng + k; tanPhi[o] = t; cov[o] = a; dith[o] = BAYER[((yb & 7) << 3) | (xl & 7)]; o++;
    }
  }
  return { S, R, rIn, n, nAng, pix, tanPhi, pos, cov, dith };
}

/**
 * Fill RGBA `data` (S×S, Uint8ClampedArray) with the daylight field of a planet with axial tilt `tiltDeg`.
 * R and rIn are in device pixels. Pure (no DOM), so it can be checked in Node.
 */
export function renderField(S, R, rIn, tiltDeg, data, { cache = true } = {}) {
  const geo = getGeometry(S, R, rIn, cache);
  const { n, nAng, pix, tanPhi, pos, cov, dith } = geo;
  // tan δ per angle column from astro.js declination, linearly interpolated between columns
  const tanDelta = new Float64Array(nAng + 2);
  for (let k = 0; k < nAng + 2; k++) tanDelta[k] = Math.tan(declination(tiltDeg, (k * 360) / nAng) * RAD);
  const lut = getColorLut();
  const out = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2);
  const ML = 1 - END;
  for (let i = 0; i < n; i++) {
    const a = pos[i];
    const k = a | 0;
    const x = -tanPhi[i] * (tanDelta[k] + (a - k) * (tanDelta[k + 1] - tanDelta[k])); // cos H0
    let o;
    if (x > -ML && x < ML) o = 3 * (((x + 1) * HALF_NX1 + 0.5) | 0);
    else if (x <= -1) o = LO;
    else if (x >= 1) o = HI;
    else if (x < 0) o = LO + 3 * (((x + 1) * END_SCALE + 0.5) | 0);
    else o = HI + 3 * (((1 - x) * END_SCALE + 0.5) | 0);
    const d = dith[i];
    const r = (lut[o] + d) >> 8;
    const g = (lut[o + 1] + d) >> 8;
    const b = (lut[o + 2] + d) >> 8;
    out[pix[i]] = LITTLE_ENDIAN ? (cov[i] << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | cov[i];
  }
  return geo;
}

/* ------------------------------------------------------------------ contours */

/**
 * Polylines (CSS px) of the latitude where the daylight fraction equals f, for every season.
 * The two half-years are traced separately: at the equinoxes δ = 0 and the curve jumps pole to pole.
 */
export function contourPolylines(lay, tiltDeg, f) {
  const { c, R, rIn } = lay;
  const span = R - rIn;
  const steps = Math.round(clamp(R * 2.2, 360, 1600));
  const lines = [];
  for (let half = 0; half < 2; half++) {
    let pts = [];
    for (let j = 0; j <= steps; j++) {
      const L = half * 180 + 0.002 + (179.996 * j) / steps;
      const phi = latitudeForFraction(f, declination(tiltDeg, L));
      if (!Number.isFinite(phi)) {
        if (pts.length > 2) lines.push(pts);
        pts = [];
        continue;
      }
      const r = rIn + ((phi + 90) / 180) * span;
      const a = L * RAD;
      pts.push(c + r * Math.sin(a), c - r * Math.cos(a));
    }
    if (pts.length > 2) lines.push(pts);
  }
  return lines;
}

function strokeLines(ctx, lines) {
  ctx.beginPath();
  for (const p of lines) {
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  }
  ctx.stroke();
}

function ringPath(ctx, c, R, rIn) {
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.moveTo(c + rIn, c);
  ctx.arc(c, c, rIn, 0, TAU, true);
}

function drawContours(ctx, lay, tiltDeg) {
  const { c, R, rIn, u } = lay;
  ctx.save();
  ringPath(ctx, c, R - 0.6, rIn + 0.6);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Polar-day edge (f = 1: φ = 90° − δ in the summer hemisphere) and polar-night edge (f = 0).
  const polar = [...contourPolylines(lay, tiltDeg, 1), ...contourPolylines(lay, tiltDeg, 0)];
  ctx.strokeStyle = 'rgba(70, 36, 8, 0.22)';
  ctx.lineWidth = 2.6 * u;
  strokeLines(ctx, polar);
  ctx.strokeStyle = 'rgba(255, 206, 120, 0.92)';
  ctx.lineWidth = 1.25 * u;
  strokeLines(ctx, polar);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = u;
  strokeLines(ctx, [...contourPolylines(lay, tiltDeg, 0.25), ...contourPolylines(lay, tiltDeg, 0.75)]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.2 * u;
  strokeLines(ctx, contourPolylines(lay, tiltDeg, 0.5));
  ctx.restore();
}

/* ------------------------------------------------------------------ decoration */

let tokenCache = null;
function tokens() {
  if (tokenCache) return tokenCache;
  const fallback = {
    muted: '#7f88a0',
    mono: '"JetBrains Mono", ui-monospace, monospace',
    serif: '"Instrument Serif", Georgia, serif',
  };
  if (typeof document === 'undefined') return fallback;
  const cs = getComputedStyle(document.documentElement);
  const read = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  const t = { muted: read('--muted', fallback.muted), mono: read('--font-mono', fallback.mono), serif: read('--font-serif', fallback.serif) };
  if (cs.getPropertyValue('--muted').trim()) tokenCache = t; // cache once the stylesheet is in
  return t;
}

function drawGlow(ctx, lay) {
  const { c, R } = lay;
  const w = Math.max(10, R * 0.2);
  const g = ctx.createRadialGradient(c, c, R * 0.97, c, c, R + w);
  g.addColorStop(0, 'rgba(255, 190, 120, 0.15)');
  g.addColorStop(0.3, 'rgba(232, 112, 138, 0.07)');
  g.addColorStop(0.65, 'rgba(120, 90, 210, 0.025)');
  g.addColorStop(1, 'rgba(90, 80, 200, 0)');
  ctx.fillStyle = g;
  ringPath(ctx, c, R + w, R * 0.97);
  ctx.fill();
}

function drawPlate(ctx, lay, layer) {
  const { c, R, rIn } = lay;
  ctx.save();
  ringPath(ctx, c, R, rIn);
  ctx.fillStyle = 'rgba(9, 11, 30, 0.92)';
  ctx.fill();
  ctx.globalAlpha = 0.07; // a faint ghost of the finished print
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function drawFrame(ctx, lay, scale, labels) {
  const { c, R, rIn, u } = lay;
  ctx.save();
  ctx.lineWidth = Math.max(0.7 * u, 1 / scale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  ctx.arc(c, c, R, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, rIn, 0, TAU);
  ctx.stroke();
  if (labels) {
    // twelve month ticks; the four season ticks are longer and point at their labels
    ctx.lineCap = 'round';
    for (let m = 0; m < 12; m++) {
      const major = m % 3 === 0;
      const a = m * 30 * RAD;
      const s = Math.sin(a);
      const k = -Math.cos(a);
      const r0 = R + 3 * u;
      const r1 = R + (major ? 8 : 5.5) * u;
      ctx.strokeStyle = major ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(c + r0 * s, c + r0 * k);
      ctx.lineTo(c + r1 * s, c + r1 * k);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Text along a circle. Outward text reads clockwise with tops pointing out; inward text reads counter-clockwise, upright at the bottom. */
function drawArcText(ctx, text, c, radius, angleDeg, tracking, inward) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + tracking * (chars.length - 1);
  const dir = inward ? -1 : 1;
  let a = angleDeg * RAD - (dir * total) / 2 / radius;
  for (let i = 0; i < chars.length; i++) {
    const mid = a + (dir * widths[i]) / 2 / radius;
    ctx.save();
    ctx.translate(c + radius * Math.sin(mid), c - radius * Math.cos(mid));
    ctx.rotate(inward ? mid - Math.PI : mid);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    a += (dir * (widths[i] + tracking)) / radius;
  }
}

function trackedWidth(ctx, text, tracking) {
  return ctx.measureText(text).width + tracking * (text.length - 1);
}

/** Horizontal text centred on (x, y) with letter spacing (canvas letterSpacing is not universal yet). */
function drawTrackedText(ctx, text, x, y, tracking) {
  let pen = x - trackedWidth(ctx, text, tracking) / 2;
  ctx.save();
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, pen, y);
    pen += ctx.measureText(ch).width + tracking;
  }
  ctx.restore();
}

function drawLabels(ctx, lay) {
  const { c, R, rIn, font, u } = lay;
  const t = tokens();
  ctx.save();
  ctx.fillStyle = t.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${font}px ${t.mono}`;
  const rho = R + 11 * u + font * 0.5;
  for (const [text, deg] of SEASON_LABELS) drawArcText(ctx, text, c, rho, deg, font * 0.16, deg === 180);
  // which edge is which pole
  const small = Math.max(6.5, font * 0.78);
  const tr = small * 0.14;
  ctx.font = `500 ${small}px ${t.mono}`;
  ctx.globalAlpha = 0.85;
  drawArcText(ctx, 'N POLE', c, R + 6 * u + small * 0.5, 45, tr, false);
  if (trackedWidth(ctx, 'S POLE', tr) <= rIn * 1.8) {
    drawTrackedText(ctx, 'S POLE', c, c, tr);
  } else if (trackedWidth(ctx, 'POLE', tr) <= rIn * 1.75) {
    drawTrackedText(ctx, 'S', c, c - small * 0.58, tr);
    drawTrackedText(ctx, 'POLE', c, c + small * 0.58, tr);
  }
  ctx.restore();
}

function drawHand(ctx, lay, sweep, scale) {
  const { c, R, rIn, u } = lay;
  const a = sweep * TAU;
  if (typeof ctx.createConicGradient === 'function') {
    // a soft trail of light behind the hand, inside the annulus
    const trail = 0.5;
    const g = ctx.createConicGradient(a - Math.PI / 2 - trail, c, c);
    const t = trail / TAU;
    g.addColorStop(0, 'rgba(255, 236, 200, 0)');
    g.addColorStop(t * 0.995, 'rgba(255, 236, 200, 0.2)');
    g.addColorStop(t * 0.995 + 0.002, 'rgba(255, 236, 200, 0)');
    g.addColorStop(1, 'rgba(255, 236, 200, 0)');
    ctx.save();
    ringPath(ctx, c, R, rIn);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }
  const s = Math.sin(a);
  const k = -Math.cos(a);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(255, 196, 107, 0.95)';
  ctx.shadowBlur = 9 * u * scale;
  ctx.strokeStyle = 'rgba(255, 249, 235, 0.98)';
  ctx.lineWidth = 1.3 * u;
  ctx.beginPath();
  ctx.moveTo(c + (rIn - 2 * u) * s, c + (rIn - 2 * u) * k);
  ctx.lineTo(c + (R + 6 * u) * s, c + (R + 6 * u) * k);
  ctx.stroke();
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(c + (R + 6 * u) * s, c + (R + 6 * u) * k, 1.9 * u, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ canvas plumbing */

function sizeCanvas(canvas, size, pixelRatio) {
  const css = size || canvas.clientWidth || 0;
  if (!css) return null;
  const dpr = pixelRatio || Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const S = Math.max(2, 2 * Math.round((css * dpr) / 2));
  if (canvas.width !== S) canvas.width = S;
  if (canvas.height !== S) canvas.height = S;
  return { css, S, scale: S / css };
}

// The finished field (pixels + contours) is cached per canvas, so a sweep animation only re-composites.
// Pixel buffers are shared per geometry: every gallery card of one size reuses the same one.
const layers = new WeakMap();
const buffers = new Map();
function pixelBuffer(lctx, S, geoKey) {
  let img = buffers.get(geoKey);
  if (!img) {
    img = lctx.createImageData(S, S); // same geometry → same annulus, so pixels outside it stay transparent
    if (S <= 1400) {
      buffers.set(geoKey, img);
      while (buffers.size > 3) buffers.delete(buffers.keys().next().value);
    }
  }
  return img;
}
function fieldLayer(canvas, S, lay, scale, tiltDeg, contours) {
  const geoKey = `${S}|${lay.R}`;
  let st = layers.get(canvas);
  if (!st || st.geoKey !== geoKey) {
    const layer = document.createElement('canvas');
    layer.width = S;
    layer.height = S;
    const lctx = layer.getContext('2d');
    st = { geoKey, key: '', layer, lctx };
    layers.set(canvas, st);
  }
  const key = `${tiltDeg}|${contours}`;
  if (st.key !== key) {
    const img = pixelBuffer(st.lctx, S, geoKey);
    renderField(S, lay.R * scale, lay.rIn * scale, tiltDeg, img.data, { cache: S <= 1400 });
    st.lctx.setTransform(1, 0, 0, 1, 0, 0);
    st.lctx.putImageData(img, 0, 0);
    if (contours) {
      st.lctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawContours(st.lctx, lay, tiltDeg);
      st.lctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    st.key = key;
  }
  return st.layer;
}

/**
 * Draw a sunlight mandala.
 * @param {HTMLCanvasElement} canvas  sized by CSS (square); the backing store follows clientWidth × dpr (≤ 2)
 * @param {object} o
 * @param {number} o.tiltDeg   axial tilt; tilts above 90° act as 180° − tilt (astro.js effectiveTilt)
 * @param {boolean} [o.labels=true]    season names, month ticks and pole labels around the rim
 * @param {boolean} [o.contours=true]  25/50/75% lines plus the gold polar-day and polar-night edges
 * @param {number} [o.sweep=1]  0–1: draw only seasons L ∈ [0, 360°·sweep], with a clock hand at the edge
 * @param {number} [o.size]  CSS size override (for canvases outside the DOM, e.g. a PNG export)
 * @param {number} [o.pixelRatio]  backing-store ratio override
 */
export function drawMandala(canvas, { tiltDeg = 0, labels = true, contours = true, sweep = 1, size, pixelRatio } = {}) {
  const dims = sizeCanvas(canvas, size, pixelRatio);
  if (!dims) return null;
  const { css, S, scale } = dims;
  const lay = mandalaLayout(css, labels);
  const tilt = Number.isFinite(+tiltDeg) ? +tiltDeg : 0;
  const sw = clamp(Number.isFinite(+sweep) ? +sweep : 1, 0, 1);
  const layer = fieldLayer(canvas, S, lay, scale, tilt, contours);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawGlow(ctx, lay);
  if (sw < 1) drawPlate(ctx, lay, layer);
  if (sw > 0) {
    ctx.save();
    if (sw < 1) {
      ctx.beginPath();
      ctx.moveTo(lay.c, lay.c);
      ctx.arc(lay.c, lay.c, lay.R + 2, -Math.PI / 2, -Math.PI / 2 + sw * TAU);
      ctx.closePath();
      ctx.clip();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
  drawFrame(ctx, lay, scale, labels);
  if (labels) drawLabels(ctx, lay);
  if (sw > 0 && sw < 1) drawHand(ctx, lay, sw, scale);
  return { size: css, R: lay.R, rIn: lay.rIn };
}

/**
 * A tidally locked world has no sunrise at all, so there is no daylight fraction to map.
 * Draw the planet instead: one hemisphere in permanent day, the other in permanent night.
 */
export function drawTidallyLocked(
  canvas,
  { size, pixelRatio, message = 'Permanent day on one side, permanent night on the other' } = {},
) {
  const dims = sizeCanvas(canvas, size, pixelRatio);
  if (!dims) return null;
  const { css, S, scale } = dims;
  const lay = mandalaLayout(css, true);
  const t = tokens();
  const R = lay.R * 0.78;
  const cx = lay.c;
  const cy = lay.c - lay.R * 0.1;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // sunlight arriving from the right
  const halo = ctx.createRadialGradient(cx + R * 0.9, cy, R * 0.2, cx + R * 0.6, cy, R * 1.6);
  halo.addColorStop(0, 'rgba(255, 196, 107, 0.22)');
  halo.addColorStop(1, 'rgba(255, 196, 107, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, css, css);

  // night (f = 0) → rose terminator (f = ½) → day (f = 1), in the mandala palette
  const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    g.addColorStop(u, paletteCss(0.5 + 0.5 * Math.tanh((u - 0.5) * 18)));
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const shade = ctx.createRadialGradient(cx + R * 0.25, cy - R * 0.2, R * 0.2, cx, cy, R * 1.02);
  shade.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
  shade.addColorStop(0.75, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 10, 0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  ctx.lineWidth = Math.max(0.7 * lay.u, 1 / scale);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.stroke();

  const font = lay.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${font}px ${t.mono}`;
  ctx.fillStyle = 'rgba(70, 38, 10, 0.72)';
  drawTrackedText(ctx, 'DAY SIDE', cx + R * 0.5, cy, font * 0.16);
  ctx.fillStyle = 'rgba(184, 192, 212, 0.72)';
  drawTrackedText(ctx, 'NIGHT SIDE', cx - R * 0.5, cy, font * 0.16);

  ctx.fillStyle = '#b8c0d4';
  const msgSize = Math.max(13, css * 0.043);
  ctx.font = `italic ${msgSize}px ${t.serif}`;
  const cut = message.indexOf(', ');
  const lines = cut > 0 ? [message.slice(0, cut + 1), message.slice(cut + 2)] : [message];
  const y0 = cy + R + msgSize * 1.25;
  lines.forEach((line, i) => ctx.fillText(line, cx, y0 + i * msgSize * 1.2));
  return { size: css, R };
}
