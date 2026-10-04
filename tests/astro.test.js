// Checks the site's math against NASA's published solar-day lengths and
// known daylight facts, so every number on the page is trustworthy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANET_BY_ID as P } from '../src/data/planets.js';
import {
  solarDayHours, sunRisesInWest, orbitAnglePerDay, declination,
  daylightFraction, daylightHours, latitudeForFraction, formatDuration,
} from '../src/lib/astro.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);

test('solar day matches NASA for the planets where it differs from the spin', () => {
  near(solarDayHours(P.mercury) / 24, 175.94, 0.05, 'Mercury solar day (days)');
  near(solarDayHours(P.venus) / 24, 116.75, 0.05, 'Venus solar day (days)');
  near(solarDayHours(P.earth), 24.0, 0.001, 'Earth solar day (h)');
  near(solarDayHours(P.mars), 24.6597, 0.0005, 'Mars sol (h)');
  near(solarDayHours(P.jupiter), 9.9259, 0.0005, 'Jupiter (h)');
});

test('Mercury: one solar day is two of its years (3:2 spin-orbit lock)', () => {
  near(solarDayHours(P.mercury) / (P.mercury.yearDays * 24), 2, 0.002, 'day/year');
});

test('Earth: extra turn per day is ~0.986° and ~3 min 56 s', () => {
  near(orbitAnglePerDay(P.earth), 0.9856, 0.0005, 'theta');
  const extraMinutes = (solarDayHours(P.earth) - P.earth.spinHours) * 60;
  near(extraMinutes, 3.93, 0.01, 'extra minutes');
});

test('the Sun rises in the west on Venus and Uranus only', () => {
  const west = Object.values(P).filter((p) => sunRisesInWest(p)).map((p) => p.id);
  assert.deepEqual(west, ['venus', 'uranus']);
});

test('tidally locked world has an infinite day', () => {
  assert.equal(solarDayHours({ spinHours: 720, yearDays: 30, retrograde: false }), Infinity);
});

test('daylight: equator is always half a day; equinox is half everywhere', () => {
  for (const L of [0, 45, 90, 200, 270]) near(daylightFraction(0, declination(23.44, L)), 0.5, 1e-9, `equator L=${L}`);
  for (const lat of [-80, -30, 10, 60, 89]) near(daylightFraction(lat, declination(23.44, 0)), 0.5, 1e-9, `equinox lat=${lat}`);
});

test('daylight: San Francisco June solstice ≈ 14 h 37 m (geometry only, no refraction)', () => {
  const h = daylightHours(P.earth, 37.8, 90);
  near(h, 14.62, 0.02, 'SF daylight');
  assert.equal(formatDuration(h), '14 h 37 m');
});

test('daylight: polar night at Utqiaġvik in December, midnight sun at 70°N in June', () => {
  assert.equal(daylightHours(P.earth, 71.3, 270), 0);
  assert.equal(daylightFraction(70, declination(23.44, 90)), 1);
});

test('Uranus: polar circle at ~7.8°, so 10°N has midnight sun at solstice', () => {
  assert.equal(daylightFraction(10, declination(P.uranus.tiltDeg, 90)), 1);
  assert.ok(daylightFraction(5, declination(P.uranus.tiltDeg, 90)) < 1);
});

test('contour inversion: latitudeForFraction undoes daylightFraction', () => {
  for (const f of [0.25, 0.5, 0.75]) {
    const d = declination(23.44, 120);
    near(daylightFraction(latitudeForFraction(f, d), d), f, 1e-9, `f=${f}`);
  }
});

test('formatDuration', () => {
  assert.equal(formatDuration(solarDayHours(P.mars), { seconds: true }), '24 h 39 m 35 s');
  assert.equal(formatDuration(P.earth.spinHours, { seconds: true }), '23 h 56 m 4 s');
  assert.equal(formatDuration(Infinity), 'forever');
});
