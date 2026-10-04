// The fixed WebGL backdrop: starfield, hero Sun, and the eight-planet scroll tour.
// One renderer, one rAF loop. Planets sit exactly on the DOM `.planet-slot`
// rects (re-measured every frame), so CSS owns the layout and this file owns depth.
//
// Spin geometry (the maths the site teaches):
//   - Each planet's tilt group is rotated about the screen axis (world Z) by its
//     tilt, so the axis leans LEFT toward the Sun by exactly tiltDeg.
//   - It spins about that tilted axis at 2π / (spin in Earth spins × SECONDS_PER_EARTH_SPIN).
//   - A tilt above 90° already encodes backwards rotation (astro.js effectiveTilt:
//     177° ≡ 3° spinning backwards). So the retrograde flag only flips the spin when
//     the tilt does NOT already say so; flipping both would make Venus spin forwards.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { PLANETS, SECONDS_PER_EARTH_SPIN } from '../data/planets.js';
import {
  VERT_SHELL, FRAG_HALO, FRAG_RIM, FRAG_CITY, FRAG_SUN,
  VERT_STARS, FRAG_STARS, VERT_WARP, FRAG_WARP, VERT_RING, FRAG_RING,
} from './shaders.js';

const FOV = 35;
const CAM_Z = 10;
const EARTH_SPIN_HOURS = 23.9345;
const READY_TIMEOUT_MS = 6000;

// Atmosphere glow per planet: [outer halo, crisp limb rim]. Thick air glows, bare rock barely does.
const ATMO = {
  mercury: [0.1, 0.12], venus: [0.85, 0.55], earth: [1.15, 0.9], mars: [0.22, 0.22],
  jupiter: [0.14, 0.16], saturn: [0.06, 0.1], uranus: [0.34, 0.1], neptune: [0.7, 0.5],
};
// Real polar flattening, visible on the gas giants.
const OBLATE = { jupiter: 0.935, saturn: 0.902 };
// Albedo trim for very bright textures so the sunlit limb doesn't clip to white.
const ALBEDO = { uranus: 0.8 };
// Saturn only: view its orbit plane from 17° above, otherwise a ring lying in the
// equatorial plane is seen exactly edge-on. The tilt stays exact in 3D.
const VIEW_ELEVATION = { saturn: 0.3 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export function initSpace({ canvas, hero, stages }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (err) {
    document.documentElement.classList.add('no-webgl');
    return { ready: Promise.resolve() };
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x04050b, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1200);
  camera.position.set(0, 0, CAM_Z);

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // Sunlight from the left. Mostly side-on (not from the camera) so that a planet
  // sitting on the right half of the screen still shows ~30% night side.
  const LIGHT_DIR = new THREE.Vector3(-10, 2.5, 1.4).normalize();

  // ---------- loading ----------
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  const manager = new THREE.LoadingManager();
  const emit = (loaded, total) => window.dispatchEvent(new CustomEvent('space:progress', { detail: { loaded, total } }));
  manager.onProgress = (_url, loaded, total) => emit(loaded, total);
  manager.onLoad = () => resolveReady();
  setTimeout(() => resolveReady(), READY_TIMEOUT_MS);
  const loader = new THREE.TextureLoader(manager);
  let requested = 0;
  const load = (url, srgb = true) => {
    requested++;
    const t = loader.load(url, (tx) => renderer.initTexture(tx));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  };

  // ---------- lights ----------
  const sunLight = new THREE.DirectionalLight(0xfff2e0, 3);
  sunLight.position.copy(LIGHT_DIR).multiplyScalar(12);
  scene.add(sunLight, new THREE.AmbientLight(0xffffff, 0.04));

  // ---------- background ----------
  const skyBase = new THREE.Color(0x5a5a66);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 64, 32),
    new THREE.MeshBasicMaterial({ map: load('textures/stars_4k.jpg'), side: THREE.BackSide, color: skyBase.clone(), depthWrite: false, toneMapped: false }),
  );
  sky.rotation.set(0.35, 0.6, 0.85);
  sky.renderOrder = -10;
  scene.add(sky);

  const stars = makeStars(2500);
  scene.add(stars);

  const warp = makeWarp(600);
  scene.add(warp);

  // ---------- hero Sun ----------
  const sunGroup = new THREE.Group();
  const sunTex = load('textures/sun.jpg', false); // sampled as display colour, written straight out
  sunTex.wrapS = THREE.RepeatWrapping;
  const sunUniforms = { uMap: { value: sunTex }, uTime: { value: 0 }, uOpacity: { value: 1 } };
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.ShaderMaterial({ vertexShader: VERT_SHELL, fragmentShader: FRAG_SUN, uniforms: sunUniforms, transparent: true, premultipliedAlpha: true }),
  );
  sunMesh.rotation.z = 0.12;
  const corona = makeSprite(glowTexture(1 / 2.2, 3.2), 0xffa040, 0.95);
  const halo = makeSprite(glowTexture(1 / 4, 2.4), 0xff6a1c, 0.55);
  corona.renderOrder = 2;
  halo.renderOrder = 1;
  sunGroup.add(halo, corona, sunMesh);
  scene.add(sunGroup);

  // ---------- planets ----------
  const planets = [];
  Array.from(stages || []).forEach((stage, index) => {
    const def = PLANETS.find((p) => p.id === stage.dataset.planet);
    const slot = stage.querySelector('.planet-slot');
    if (!def || !slot) return;
    const planet = makePlanet(def, load, LIGHT_DIR);
    planet.stage = stage;
    planet.slot = slot;
    planet.index = index;
    scene.add(planet.root);
    planets.push(planet);
  });

  // ---------- sizing ----------
  let W = 0, H = 0, upp = 1, visH = 1, visW = 1;
  const pr = () => Math.min(window.devicePixelRatio || 1, 1.75);
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setPixelRatio(pr());
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
    visW = visH * camera.aspect;
    upp = visH / H;
    stars.material.uniforms.uPR.value = renderer.getPixelRatio();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- input ----------
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = mqReduce.matches;
  mqReduce.addEventListener?.('change', (e) => { reduce = e.matches; });
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const mouseTarget = new THREE.Vector2();
  const mouse = new THREE.Vector2();
  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mouseTarget.set((e.clientX / W) * 2 - 1, -((e.clientY / H) * 2 - 1));
    }, { passive: true });
  }

  // Compile every program once up front so the first planet doesn't hitch.
  planets.forEach((p) => { p.root.visible = true; p.root.position.set(0, 0, -50); });
  try { renderer.compile(scene, camera); } catch { /* compile lazily instead */ }
  planets.forEach((p) => { p.root.visible = false; });
  emit(0, requested);

  // ---------- frame loop ----------
  let last = performance.now();
  let time = 0;
  let lastScroll = window.scrollY;
  let vel = 0;
  let travel = 0;
  let starDim = 1;

  const stageP = (el) => {
    const r = el.getBoundingClientRect();
    return clamp((window.innerHeight - r.top) / (r.height + window.innerHeight), 0, 1);
  };

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const realDt = Math.min(0.5, Math.max(0, (now - last) / 1000));
    const dt = Math.min(0.05, realDt);
    last = now;
    time += dt;
    resize();

    const motion = reduce ? 0.25 : 1;

    // scroll velocity, normalised to px per 60 fps frame
    const sy = window.scrollY;
    const dy = sy - lastScroll;
    lastScroll = sy;
    const pxPerFrame = realDt > 0 ? clamp(dy / (realDt * 60), -140, 140) : 0;
    vel = damp(vel, pxPerFrame, 5, realDt);

    // camera parallax: slide the camera, then shear the frustum back so the
    // z = 0 plane (the DOM slots) stays pinned; only depth moves.
    const on = finePointer && !reduce;
    mouse.set(damp(mouse.x, on ? mouseTarget.x * 0.2 : 0, 2.5, dt), damp(mouse.y, on ? mouseTarget.y * 0.2 : 0, 2.5, dt));
    camera.position.set(mouse.x, mouse.y, CAM_Z);
    camera.setViewOffset(W, H, -mouse.x / upp, mouse.y / upp, W, H);

    // stars
    const lastP = planets.length ? stageP(planets[planets.length - 1].stage) : 0;
    starDim = damp(starDim, lastP > 0.95 ? 0.55 : 1, 2, dt);
    stars.material.uniforms.uTime.value = time;
    stars.material.uniforms.uOpacity.value = starDim;
    stars.rotation.z += dt * 0.004 * motion;
    stars.rotation.x = Math.sin(time * 0.03) * 0.02;
    sky.material.color.copy(skyBase).multiplyScalar(starDim);
    sky.rotation.z += dt * 0.0015 * motion;

    // warp streaks
    const speed = Math.abs(vel);
    warp.visible = !reduce && speed > 0.4 && lastP < 0.95; // warp only while travelling (hero + tour)
    if (warp.visible) {
      const u = warp.material.uniforms;
      travel = (travel + vel * 0.45 * dt * 60) % 208;
      if (travel < 0) travel += 208;
      u.uTravel.value = travel;
      u.uDir.value = vel >= 0 ? 1 : -1;
      u.uLen.value = Math.min(28, 1.5 + speed * 0.4);
      u.uOpacity.value = smooth(0.6, 28, speed) * 0.85;
    }

    // hero Sun
    const heroH = (hero && hero.offsetHeight) || H;
    const h = clamp(sy / heroH, 0, 1);
    sunGroup.visible = h < 0.995;
    if (sunGroup.visible) {
      const portrait = camera.aspect < 0.9;
      // phones: a smaller Sun tucked into the top-left so the title below stays readable
      const R = portrait ? Math.min(0.26 * visH, 0.5 * visW) : 0.38 * visH;
      const x0 = portrait ? -0.3 * visW : -0.42 * visW;
      const y0 = portrait ? 0.42 * visH : 0.02 * visH;
      const e = h * h * (3 - 2 * h);
      sunGroup.position.set(x0 - e * 0.22 * visW, y0 + e * 0.04 * visH, -e * 9);
      sunGroup.scale.setScalar(R);
      sunMesh.rotation.y += dt * 0.025 * motion;
      sunUniforms.uTime.value = time * motion;
      const fade = 1 - smooth(0.08, 0.9, h);
      const pulse = 1 + 0.025 * Math.sin(time * 0.9) * motion;
      sunUniforms.uOpacity.value = fade;
      corona.scale.setScalar(2.2 * 2 * pulse);
      halo.scale.setScalar(4 * 2 * (1 + 0.035 * Math.sin(time * 0.55 + 1) * motion));
      corona.material.opacity = 0.95 * fade * (0.94 + 0.06 * Math.sin(time * 1.3));
      halo.material.opacity = 0.55 * fade;
    }

    // planets
    for (const P of planets) {
      P.spinAngle += P.omega * dt * motion;
      const p = stageP(P.stage);
      if (p <= 0.05 || p >= 0.95) { P.root.visible = false; continue; }
      P.root.visible = true;

      const r = P.slot.getBoundingClientRect();
      const sx = (r.left + r.width / 2 - W / 2) * upp;
      const syW = -(r.top + r.height / 2 - H / 2) * upp;
      const size = r.width * upp;
      const radius = P.def.ring ? size / 2 / 2.3 : (size / 2) * 0.84;

      let x = sx, y = syW, z = 0, sc = 1, op = 1, extra = 0;
      if (p < 0.33) {
        const t = (p - 0.05) / 0.28;
        const e = easeOutCubic(t);
        x = lerp(sx + 0.35 * visW, sx, e);
        y = lerp(syW - 0.1 * visH, syW, e);
        z = lerp(-70, 0, e);
        sc = lerp(0.2, 1, e);
        op = smooth(0, 0.14, t);
        extra = (1 - e) * 2.6;
      } else if (p > 0.67) {
        const t = (p - 0.67) / 0.28;
        const e = easeInCubic(t);
        x = lerp(sx, sx - 0.25 * visW, e);
        z = lerp(0, 6.5, e);
        op = 1 - smooth(0.3, 0.82, t);
      } else {
        const amp = smooth(0.33, 0.42, p) * (1 - smooth(0.58, 0.67, p));
        y += Math.sin(time * 0.9 + P.index * 1.7) * 0.006 * visH * amp * motion;
      }

      P.root.position.set(x, y, z);
      P.root.scale.setScalar(radius * sc);
      // A pitched orbit frame is also yawed toward the camera so its vertical
      // still projects as a vertical line off-centre (perspective would slant it).
      if (P.elevation) P.orbit.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
      P.spin.rotation.y = P.spinAngle + extra * P.dir;
      if (P.clouds) P.clouds.rotation.y = P.spinAngle * 0.08;
      P.setOpacity(op);
      if (P.update) P.update(radius * sc);
    }

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return { ready };

  // ---------- builders (hoisted) ----------

  function makeStars(count) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const cosMax = Math.cos(THREE.MathUtils.degToRad(56));
    for (let i = 0; i < count; i++) {
      // uniform over a cap in front of the camera (the only part ever seen)
      const cz = lerp(cosMax, 1, Math.random());
      const sz = Math.sqrt(1 - cz * cz);
      const a = Math.random() * Math.PI * 2;
      const r = lerp(60, 300, Math.random());
      pos[i * 3] = Math.cos(a) * sz * r;
      pos[i * 3 + 1] = Math.sin(a) * sz * r;
      pos[i * 3 + 2] = CAM_Z - cz * r;
      const k = Math.random();
      const c = k < 0.12 ? [1.0, 0.82, 0.62] : k < 0.3 ? [0.7, 0.8, 1.0] : [0.92, 0.95, 1.0];
      const b = 0.55 + Math.random() * 0.45;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      size[i] = 1.1 + Math.pow(Math.random(), 6) * 4.2;
      phase[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT_STARS,
      fragmentShader: FRAG_STARS,
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = -9;
    return pts;
  }

  function makeWarp(count) {
    const pos = new Float32Array(count * 6);
    const tail = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.pow(Math.random(), 0.8) * 27;
      const z0 = Math.random() * 208;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      pos.set([x, y, z0, x, y, z0], i * 6);
      tail[i * 2] = 0;
      tail[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT_WARP,
      fragmentShader: FRAG_WARP,
      uniforms: {
        uTravel: { value: 0 }, uLen: { value: 0 }, uDir: { value: 1 }, uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0.78, 0.86, 1.0) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(g, m);
    lines.frustumCulled = false;
    lines.visible = false;
    lines.renderOrder = -8;
    return lines;
  }

  function makeSprite(map, color, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    return s;
  }

  // Radial glow: solid inside the disc fraction `inner`, smooth falloff to the edge.
  function glowTexture(inner, k) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const dx = ((i + 0.5) / S) * 2 - 1;
        const dy = ((j + 0.5) / S) * 2 - 1;
        const r = Math.hypot(dx, dy);
        let v = 0;
        if (r < inner) v = 1;
        else if (r < 1) {
          const d = (r - inner) / (1 - inner);
          v = Math.pow(1 - d, 2) * Math.exp(-d * k);
        }
        const o = (j * S + i) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(v * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  function shell(frag, uniforms, side) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT_SHELL,
      fragmentShader: frag,
      uniforms,
      side,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  function line(points, { color, width, opacity, dashed = false }) {
    const g = new LineGeometry();
    g.setPositions(points);
    const m = new LineMaterial({
      color, linewidth: width, transparent: true, opacity, depthWrite: false,
      dashed, dashSize: 0.07, gapSize: 0.06, dashScale: 1,
    });
    const l = new Line2(g, m);
    if (dashed) l.computeLineDistances();
    l.renderOrder = 6;
    return l;
  }

  function makePlanet(def, loadTex, L) {
    const isEarth = def.id === 'earth';
    const obl = OBLATE[def.id] || 1;
    const tilt = THREE.MathUtils.degToRad(def.tiltDeg);
    const dir = def.retrograde !== def.tiltDeg > 90 ? -1 : 1;
    const omega = dir * (2 * Math.PI) / ((def.spinHours / EARTH_SPIN_HOURS) * SECONDS_PER_EARTH_SPIN);
    const fades = [];
    const fade = (m, base, uniform = false) => { fades.push({ m, base, uniform }); return m; };

    const root = new THREE.Group();
    const orbit = new THREE.Group();
    const elevation = VIEW_ELEVATION[def.id] || 0;
    orbit.rotation.order = 'YXZ'; // yaw to face the camera, then pitch: keeps the vertical vertical on screen
    orbit.rotation.x = elevation;
    const tiltG = new THREE.Group();
    tiltG.rotation.z = tilt; // north pole leans left, toward the Sun
    const spin = new THREE.Group();
    root.add(orbit);
    orbit.add(tiltG);
    tiltG.add(spin);

    const sphere = new THREE.SphereGeometry(1, 96, 64);
    const bodyMat = fade(new THREE.MeshStandardMaterial({
      map: loadTex(def.texture), roughness: 1, metalness: 0, transparent: true,
      color: new THREE.Color().setScalar(ALBEDO[def.id] || 1),
    }), 1);
    const body = new THREE.Mesh(sphere, bodyMat);
    body.scale.set(1, obl, 1);
    body.renderOrder = 0;
    spin.add(body);

    let clouds = null;
    if (isEarth) {
      bodyMat.normalMap = loadTex('textures/earth_normal_2048.jpg', false);
      bodyMat.normalScale.set(0.6, 0.6);
      bodyMat.roughnessMap = loadTex('textures/earth_specular_2048.jpg', false);
      bodyMat.onBeforeCompile = (shader) => {
        // specular map is white over water: oceans get a soft sun glint, land stays matte
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            roughnessFactor = mix(1.0, 0.56, texture2D(roughnessMap, vRoughnessMapUv).g);
          #endif
        `);
      };

      const city = new THREE.Mesh(sphere, fade(shell(FRAG_CITY, {
        uMap: { value: loadTex('textures/earth_lights_2048.png') },
        uLight: { value: L }, uTint: { value: new THREE.Color('#ffcc88') }, uOpacity: { value: 1 },
      }, THREE.FrontSide), 1, true));
      city.scale.setScalar(1.002);
      city.renderOrder = 1;
      spin.add(city);

      const cloudMat = fade(new THREE.MeshStandardMaterial({
        map: loadTex('textures/earth_clouds_1024.png'), transparent: true, depthWrite: false, roughness: 1, metalness: 0,
      }), 1);
      cloudMat.onBeforeCompile = (shader) => {
        // the cloud PNG stores coverage in its alpha channel; keep the colour pure white
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
          #ifdef USE_MAP
            diffuseColor.a *= clamp(texture2D(map, vMapUv).a * 1.6, 0.0, 1.0);
          #endif
        `);
      };
      clouds = new THREE.Mesh(sphere, cloudMat);
      clouds.scale.setScalar(1.012);
      clouds.renderOrder = 2;
      spin.add(clouds);
    }

    // atmosphere: back-side halo + thin front rim
    const glow = new THREE.Color(def.glow);
    const [haloK, rimK] = ATMO[def.id] || [0.4, 0.3];
    const halo = new THREE.Mesh(sphere, fade(shell(FRAG_HALO, {
      uColor: { value: glow }, uLight: { value: L }, uStrength: { value: haloK }, uOpacity: { value: 1 },
    }, THREE.BackSide), 1, true));
    halo.scale.set(1.1, 1.1 * obl, 1.1);
    halo.renderOrder = 4;
    const rim = new THREE.Mesh(sphere, fade(shell(FRAG_RIM, {
      uColor: { value: glow.clone().lerp(new THREE.Color(1, 1, 1), 0.25) }, uLight: { value: L },
      uStrength: { value: rimK }, uOpacity: { value: 1 },
    }, THREE.FrontSide), 1, true));
    rim.scale.set(1.004, 1.004 * obl, 1.004);
    rim.renderOrder = 5;
    tiltG.add(halo, rim);

    // ring
    let update = null;
    if (def.ring) {
      const ringTex = loadTex(def.ring);
      ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;
      const ringU = {
        uMap: { value: ringTex }, uTint: { value: new THREE.Color('#e8d6ae') }, uLight: { value: L },
        uCenter: { value: new THREE.Vector3() }, uR: { value: 1 }, uInner: { value: 1.24 }, uOuter: { value: 2.27 }, uOpacity: { value: 1 },
      };
      const ringMat = fade(new THREE.ShaderMaterial({
        vertexShader: VERT_RING, fragmentShader: FRAG_RING, uniforms: ringU,
        side: THREE.DoubleSide, transparent: true, depthWrite: false,
      }), 1, true);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.27, 192, 1), ringMat);
      ring.rotation.x = -Math.PI / 2; // equatorial plane of the tilted planet
      ring.renderOrder = 3;
      tiltG.add(ring);

      // the ring's shadow on the planet: march from each surface point toward the Sun
      const shadowU = {
        uRingCenter: { value: new THREE.Vector3() }, uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
        uLightW: { value: L }, uRingIn: { value: 1.24 }, uRingOut: { value: 2.27 }, uRingMap: { value: ringTex },
      };
      bodyMat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, shadowU);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec3 vWPos;
            uniform vec3 uRingCenter; uniform vec3 uRingNormal; uniform vec3 uLightW;
            uniform float uRingIn; uniform float uRingOut; uniform sampler2D uRingMap;`)
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
            {
              float dn = dot(uLightW, uRingNormal);
              if (abs(dn) > 1e-4) {
                float s = dot(uRingCenter - vWPos, uRingNormal) / dn;
                if (s > 0.0) {
                  float rr = length(vWPos + uLightW * s - uRingCenter);
                  float uu = (rr - uRingIn) / (uRingOut - uRingIn);
                  if (uu > 0.0 && uu < 1.0) {
                    float k = 1.0 - texture2D(uRingMap, vec2(uu, 0.5)).a * 0.82;
                    reflectedLight.directDiffuse *= k;
                    reflectedLight.directSpecular *= k;
                  }
                }
              }
            }`);
      };
      const n = new THREE.Vector3();
      update = (worldRadius) => {
        root.updateMatrixWorld(true);
        root.getWorldPosition(ringU.uCenter.value);
        ringU.uR.value = worldRadius * 0.97;
        shadowU.uRingCenter.value.copy(ringU.uCenter.value);
        shadowU.uRingNormal.value.copy(n.set(0, 1, 0).transformDirection(tiltG.matrixWorld));
        shadowU.uRingIn.value = 1.24 * worldRadius;
        shadowU.uRingOut.value = 2.27 * worldRadius;
      };
    }

    // geometry overlay: spin axis (accent), true vertical (dashed), tilt arc
    const accent = new THREE.Color(def.accent);
    const axis = line([0, -1.55, 0, 0, 1.55, 0], { color: accent, width: 1.6, opacity: 0.85 });
    fade(axis.material, 0.85);
    const pole = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 16, 12),
      fade(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, depthWrite: false }), 0.9),
    );
    pole.position.set(0, 1.55, 0);
    pole.renderOrder = 6;
    tiltG.add(axis, pole);

    const vertical = line([0, -1.75, 0, 0, 1.75, 0], { color: new THREE.Color(1, 1, 1), width: 1.1, opacity: 0.3, dashed: true });
    fade(vertical.material, 0.3);
    orbit.add(vertical);

    if (def.tiltDeg > 0.5) {
      const pts = [];
      const N = Math.max(8, Math.ceil(def.tiltDeg / 2));
      for (let i = 0; i <= N; i++) {
        const a = (tilt * i) / N;
        pts.push(-Math.sin(a) * 1.4, Math.cos(a) * 1.4, 0);
      }
      const arc = line(pts, { color: accent.clone().lerp(new THREE.Color(1, 1, 1), 0.35), width: 1.3, opacity: 0.75 });
      fade(arc.material, 0.75);
      orbit.add(arc);
    }

    root.visible = false;
    let lastOp = -1;
    return {
      def, root, orbit, elevation, spin, clouds, dir, omega, update,
      spinAngle: Math.random() * Math.PI * 2,
      setOpacity(o) {
        if (Math.abs(o - lastOp) < 1e-3) return;
        lastOp = o;
        for (const f of fades) {
          if (f.uniform) f.m.uniforms.uOpacity.value = f.base * o;
          else f.m.opacity = f.base * o;
        }
      },
    };
  }
}
