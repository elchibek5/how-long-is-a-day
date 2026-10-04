// Single source of truth for every number on the site.
// Spin = sidereal rotation (one full turn measured against the distant stars).
// Values: NASA NSSDC Planetary Fact Sheets, except Saturn (Cassini ring
// seismology, 2019) and Uranus (Hubble aurora tracking, 2025), which replaced
// the older Voyager-era numbers still printed in many tables.

export const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercury',
    spinHours: 1407.5,        // 58.646 Earth days
    retrograde: false,
    yearDays: 87.969,
    tiltDeg: 0.034,
    diameterKm: 4879,
    distanceMkm: 57.9,
    accent: '#c9bfb2',
    glow: '#9b8f80',
    texture: 'textures/mercury.jpg',
    tagline: 'One day lasts two whole years',
    fact: 'It spins 3 times for every 2 orbits, so sunrise to sunrise takes 176 Earth days: two Mercury years.',
  },
  {
    id: 'venus',
    name: 'Venus',
    spinHours: 5832.6,        // 243.025 Earth days, backwards
    retrograde: true,
    yearDays: 224.701,
    tiltDeg: 177.36,
    diameterKm: 12104,
    distanceMkm: 108.2,
    accent: '#f0c987',
    glow: '#e8b25c',
    texture: 'textures/venus_atmosphere.jpg',
    tagline: 'The Sun rises in the west',
    fact: 'It spins backwards, so the Sun rises in the west. One spin takes longer than its whole year.',
  },
  {
    id: 'earth',
    name: 'Earth',
    spinHours: 23.9345,       // 23 h 56 m 4 s
    retrograde: false,
    yearDays: 365.256,
    tiltDeg: 23.44,
    diameterKm: 12756,
    distanceMkm: 149.6,
    accent: '#6fb6ff',
    glow: '#4d9bff',
    texture: 'textures/earth_daymap.jpg',
    tagline: 'One spin is not one day',
    fact: 'One spin takes 23 h 56 m, yet the Sun returns every 24 h. The missing 4 minutes is geometry.',
  },
  {
    id: 'mars',
    name: 'Mars',
    spinHours: 24.6229,       // 24 h 37 m 22 s
    retrograde: false,
    yearDays: 686.98,
    tiltDeg: 25.19,
    diameterKm: 6792,
    distanceMkm: 228.0,
    accent: '#ff7b54',
    glow: '#e2552e',
    texture: 'textures/mars.jpg',
    tagline: 'Almost like home — 39 minutes off',
    fact: 'A Mars day, called a sol, is 39 minutes longer than ours. Rover teams have lived on Mars time.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    spinHours: 9.925,         // 9 h 55 m 30 s
    retrograde: false,
    yearDays: 4332.59,
    tiltDeg: 3.13,
    diameterKm: 142984,
    distanceMkm: 778.5,
    accent: '#e8b98a',
    glow: '#d8935a',
    texture: 'textures/jupiter.jpg',
    tagline: 'The biggest planet, the shortest day',
    fact: '11 times wider than Earth, yet it spins in under 10 hours, so fast that it bulges at the equator.',
  },
  {
    id: 'saturn',
    name: 'Saturn',
    spinHours: 10.5606,       // 10 h 33 m 38 s
    retrograde: false,
    yearDays: 10759.22,
    tiltDeg: 26.73,
    diameterKm: 120536,
    distanceMkm: 1432.0,
    accent: '#f1dba6',
    glow: '#d9b86c',
    texture: 'textures/saturn.jpg',
    ring: 'textures/saturn_ring_alpha.png',
    tagline: 'A day measured by waves in its rings',
    fact: 'With no solid surface to watch, scientists timed its day from waves in its rings (2019).',
  },
  {
    id: 'uranus',
    name: 'Uranus',
    spinHours: 17.2479,       // 17 h 14 m 52 s, backwards
    retrograde: true,
    yearDays: 30685.4,
    tiltDeg: 97.77,
    diameterKm: 51118,
    distanceMkm: 2867.0,
    accent: '#9eeef0',
    glow: '#6fd6dc',
    texture: 'textures/uranus.jpg',
    tagline: 'A planet rolling on its side',
    fact: 'Tipped on its side: near the poles the Sun stays up for 42 years, then sets for 42.',
  },
  {
    id: 'neptune',
    name: 'Neptune',
    spinHours: 16.11,         // 16 h 6 m 36 s
    retrograde: false,
    yearDays: 60189,
    tiltDeg: 28.32,
    diameterKm: 49528,
    distanceMkm: 4515.0,
    accent: '#6f8dff',
    glow: '#4a66f0',
    texture: 'textures/neptune.jpg',
    tagline: 'Ninety thousand days in one year',
    fact: 'One Neptune year lasts 165 Earth years: about 89,700 of its 16-hour days.',
  },
];

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

// On-screen spin speed for every 3D planet: one Earth spin = this many real seconds.
// All planets use the same scale, so their speeds compare honestly.
export const SECONDS_PER_EARTH_SPIN = 10;
