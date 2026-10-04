# How Long Is a Day?

**The geometry of sunrise on eight worlds.** A *Geometry in the World* midterm project.

Why is a day 24 hours on Earth, under 10 hours on Jupiter, and 117 Earth days on Venus (where the Sun rises in the west)?
This site answers it with three ideas from geometry:

1. **Notice + Name**: a scroll-driven 3D tour of the eight planets, each spinning at its true relative speed with its real tilt.
2. **Explain**: angular speed (360° ÷ T), why one spin is not one day (360° + θ, alternate angles), the formula
   `1/T = 1/T_spin − 1/T_year`, and daylight from the sunrise equation `cos H₀ = −tan φ · tan δ`.
3. **Create**: *Sunlight Mandalas*, generative art of a planet's whole year of daylight, plus a lab to design your own world.

## Run it

```bash
npm install
npm run dev      # local preview at http://localhost:5173
npm test         # checks the math against NASA's numbers
npm run build    # static site in dist/
```

## Deploy

Pushing to `main` deploys automatically to GitHub Pages (`.github/workflows/deploy.yml`).
The build in `dist/` is plain static files with relative paths, so it also works on Netlify, Vercel,
or any static host: just upload the folder.

## Credits

Data: NASA NSSDC Planetary Fact Sheets, NASA/JPL (Saturn, 2019), ESA/Hubble (Uranus, 2025).
Photo: NASA/JPL-Caltech/MSSS/Texas A&M Univ. (PIA19400).
Textures: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0) and the three.js examples.
