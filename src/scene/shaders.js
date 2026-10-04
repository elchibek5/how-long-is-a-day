// GLSL for the space scene. The camera never rotates (it only slides for
// parallax), so view-space directions equal world directions and the world
// light direction can be dotted straight against view-space normals.

const TONE_AND_ENCODE = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// Normal + view vector + uv, shared by the sphere shells and the Sun.
export const VERT_SHELL = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

// Back-side halo just outside the limb: brightest at the planet's edge,
// fading to nothing at the shell's silhouette, stronger on the day side.
export const FRAG_HALO = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform float uStrength;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float k = clamp(-dot(n, v), 0.0, 1.0);
    float a = pow(smoothstep(0.0, 0.5, k), 1.7);
    vec2 s = n.xy;
    float sl = length(s);
    s = sl > 1e-4 ? s / sl : vec2(0.0);
    float day = smoothstep(-0.6, 0.8, dot(s, normalize(uLight.xy)));
    vec3 col = uColor * a * mix(0.05, 1.0, day) * uStrength;
    gl_FragColor = vec4(col * uOpacity, 1.0);
    ${TONE_AND_ENCODE}
  }
`;

// Thin front-side rim: the crisp bright limb of a lit atmosphere.
export const FRAG_RIM = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform float uStrength;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float f = 1.0 - clamp(dot(n, v), 0.0, 1.0);
    float rim = pow(f, 4.0);
    float day = smoothstep(-0.15, 0.6, dot(n, uLight));
    vec3 col = uColor * rim * day * uStrength;
    gl_FragColor = vec4(col * uOpacity, 1.0);
    ${TONE_AND_ENCODE}
  }
`;

// Earth's city lights: only where the surface faces away from the Sun.
export const FRAG_CITY = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLight;
  uniform vec3 uTint;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    float d = dot(normalize(vN), uLight);
    float night = 1.0 - smoothstep(-0.2, 0.04, d);
    vec3 c = texture2D(uMap, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    l = smoothstep(0.015, 0.5, l);
    vec3 col = uTint * l * night * 1.8;
    gl_FragColor = vec4(col * uOpacity, 1.0);
    ${TONE_AND_ENCODE}
  }
`;

// The Sun: limb darkening (hot centre, deep orange edge) + slowly drifting granulation.
// Output is written directly in display space (no tone mapping) for full control.
export const FRAG_SUN = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float mu = clamp(dot(n, v), 0.0, 1.0);
    vec3 t1 = texture2D(uMap, vUv).rgb;
    vec3 t2 = texture2D(uMap, vUv + vec2(0.5 + uTime * 0.003, 0.0)).rgb;
    vec3 base = mix(t1, t2, 0.35);
    float limb = pow(mu, 0.45);
    vec3 col = base * (0.62 + 0.7 * limb);
    float core = smoothstep(0.25, 1.0, mu);
    col = mix(col, col * vec3(1.18, 1.12, 0.85) + vec3(0.10, 0.07, 0.0), core);
    col += vec3(1.0, 0.62, 0.22) * pow(core, 2.5) * 0.22;
    col = mix(vec3(0.62, 0.14, 0.02), col, smoothstep(0.0, 0.3, mu));
    // premultiplied: scale before the output clamp so fading keeps the hue
    gl_FragColor = vec4(col * uOpacity, uOpacity);
  }
`;

// Point stars: per-star size, slow twinkle, round soft points (additive).
export const VERT_STARS = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPR;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float speed = 0.4 + fract(aPhase * 13.17) * 1.6;
    float tw = 0.7 + 0.3 * sin(uTime * speed + aPhase * 6.2831);
    vTw = tw;
    vColor = aColor;
    gl_PointSize = aSize * uPR * (0.85 + 0.3 * tw);
  }
`;

export const FRAG_STARS = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    a *= a;
    gl_FragColor = vec4(vColor * vTw * uOpacity, a);
  }
`;

// Warp streaks: each segment is a head + tail vertex. Travel and length are
// driven by scroll velocity; segments wrap along z so the field never runs out.
export const VERT_WARP = /* glsl */ `
  attribute float aTail;
  uniform float uTravel;
  uniform float uLen;
  uniform float uDir;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float span = 208.0;
    float z = mod(position.z + uTravel, span) - 200.0;
    float len = uLen * (0.55 + 0.9 * fract(position.z * 0.731));
    vec3 p = vec3(position.xy, z - aTail * len * uDir);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    float fade = smoothstep(-200.0, -130.0, z) * (1.0 - smoothstep(3.0, 8.0, z));
    vA = uOpacity * fade * (1.0 - aTail);
  }
`;

export const FRAG_WARP = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() {
    gl_FragColor = vec4(uColor * vA, 1.0);
  }
`;

// Saturn's ring: radius -> texture x, lit from either face, with the
// planet's shadow cast across it (ray from the fragment toward the Sun).
export const VERT_RING = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vW;
  varying vec3 vNW;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vNW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const FRAG_RING = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uR;
  uniform float uInner;
  uniform float uOuter;
  uniform float uOpacity;
  varying vec3 vLocal;
  varying vec3 vW;
  varying vec3 vNW;
  void main() {
    float r = length(vLocal.xy);
    float u = (r - uInner) / (uOuter - uInner);
    if (u < 0.0 || u > 1.0) discard;
    vec4 t = texture2D(uMap, vec2(u, 0.5));
    float lum = dot(t.rgb, vec3(0.2126, 0.7152, 0.0722));
    float nl = abs(dot(normalize(vNW), uLight));
    float lit = 0.18 + 1.05 * nl;
    vec3 D = vW - uCenter;
    float b = dot(D, uLight);
    float perp = sqrt(max(dot(D, D) - b * b, 0.0));
    float sh = b < 0.0 ? smoothstep(uR * 0.96, uR * 1.03, perp) : 1.0;
    vec3 col = uTint * (0.35 + 2.2 * lum) * lit * mix(0.05, 1.0, sh);
    gl_FragColor = vec4(col, t.a * uOpacity);
    ${TONE_AND_ENCODE}
  }
`;
