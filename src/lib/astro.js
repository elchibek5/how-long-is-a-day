// The mathematics of a day, shared by every diagram on the site.
// Angles are in degrees at the edges of this module; radians stay inside.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Length of a solar day (Sun overhead → Sun overhead) in Earth hours.
 * In one solar day T the planet travels θ = 360°·T/year along its orbit, so it
 * must spin 360° + θ (prograde) or 360° − θ (retrograde) to face the Sun again:
 *   1/T = 1/spin − 1/year   (prograde)
 *   1/T = 1/spin + 1/year   (retrograde)
 * Returns Infinity when the spin exactly matches the year (tidally locked).
 */
export function solarDayHours({ spinHours, yearDays, retrograde }) {
  const yearHours = yearDays * 24;
  const rate = retrograde ? 1 / spinHours + 1 / yearHours : 1 / spinHours - 1 / yearHours;
  if (Math.abs(rate) < 1e-12) return Infinity;
  return 1 / Math.abs(rate);
}

/** True when the Sun moves the "wrong way" across the sky (rises in the west). */
export function sunRisesInWest({ spinHours, yearDays, retrograde }) {
  if (retrograde) return true;
  return spinHours > yearDays * 24; // spin slower than orbit: orbit wins, Sun drifts backwards
}

/** Angle (degrees) the planet moves along its orbit during one solar day. */
export function orbitAnglePerDay(planet) {
  const T = solarDayHours(planet);
  if (!isFinite(T)) return Infinity;
  return (360 * T) / (planet.yearDays * 24);
}

/** Total angle the planet spins (against the stars) during one solar day. */
export function spinAnglePerDay(planet) {
  const T = solarDayHours(planet);
  if (!isFinite(T)) return Infinity;
  return (360 * T) / planet.spinHours;
}

/** Spin speed in degrees per Earth hour; negative = spins backwards. */
export function degreesPerHour({ spinHours, retrograde }) {
  return (retrograde ? -360 : 360) / spinHours;
}

/** Tilts above 90° are the same geometry as 180° − tilt with a backwards spin. */
export function effectiveTilt(tiltDeg) {
  return tiltDeg > 90 ? 180 - tiltDeg : tiltDeg;
}

/**
 * Sun's declination (how far north/south of the equator the Sun is overhead)
 * at season angle L: L = 0° northern spring equinox, 90° northern summer
 * solstice, 180° autumn equinox, 270° winter solstice.
 *   sin δ = sin(tilt) · sin(L)
 */
export function declination(tiltDeg, seasonDeg) {
  const eps = effectiveTilt(tiltDeg) * RAD;
  return Math.asin(Math.sin(eps) * Math.sin(seasonDeg * RAD)) * DEG;
}

/**
 * Half the daylight arc, H0 in degrees, for latitude φ and declination δ:
 *   cos H0 = −tan φ · tan δ
 * Clamped: 180° = Sun never sets (polar day), 0° = Sun never rises (polar night).
 */
export function sunriseHourAngle(latDeg, declDeg) {
  const x = -Math.tan(latDeg * RAD) * Math.tan(declDeg * RAD);
  if (x <= -1) return 180;
  if (x >= 1) return 0;
  return Math.acos(x) * DEG;
}

/** Fraction of one solar day that the Sun is above the horizon (0..1). */
export function daylightFraction(latDeg, declDeg) {
  return sunriseHourAngle(latDeg, declDeg) / 180;
}

/** Daylight in Earth hours at a latitude and season, for a planet. */
export function daylightHours(planet, latDeg, seasonDeg) {
  const delta = declination(planet.tiltDeg, seasonDeg);
  return daylightFraction(latDeg, delta) * solarDayHours(planet);
}

/**
 * Latitude where the daylight fraction equals f, for declination δ (≠ 0).
 * Inverts cos(180°·f) = −tan φ · tan δ  →  φ = atan(−cos(180°·f) / tan δ).
 * Used to draw contour lines on the sunlight mandalas.
 */
export function latitudeForFraction(f, declDeg) {
  const t = Math.tan(declDeg * RAD);
  if (Math.abs(t) < 1e-9) return NaN;
  return Math.atan(-Math.cos(Math.PI * f) / t) * DEG;
}

/** "24 h 39 m 35 s", "58.4 Earth days", "42 Earth years" — human-friendly durations. */
export function formatDuration(hours, { seconds = false } = {}) {
  if (!isFinite(hours)) return 'forever';
  if (hours < 72) {
    const totalSeconds = Math.round(hours * 3600);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (seconds) return `${h} h ${m} m ${s} s`;
    const mr = Math.round((totalSeconds % 3600) / 60);
    return mr === 60 ? `${h + 1} h 0 m` : `${h} h ${mr} m`;
  }
  const days = hours / 24;
  if (days < 1000) return `${days < 10 ? days.toFixed(1) : Math.round(days * 10) / 10} Earth days`;
  const years = days / 365.25;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)} Earth years`;
}

/** Compact numeric formatting: 1407.5 → "1,407.5". */
export function formatNumber(x, digits = 2) {
  return x.toLocaleString('en-US', { maximumFractionDigits: digits });
}
