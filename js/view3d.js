// Real-3D renderer for the circuit mode (Three.js / WebGL).
// It only DRAWS the state of a Race (z = distance along the track, x = lateral -1..1).
// Track, car and world builders come from track3d.js / car3d.js / world3d.js; each has a
// small built-in fallback so this module keeps working while those are missing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SEG = 200; // physics SEGMENT_LENGTH (world units of the Race)
const M_PER_SEG = 5; // metres per segment (contract)
const HALF_W = 7; // half road width in metres (x = ±1 → ±7 m)
export const CAMERAS = ['chase', 'far', 'bumper'];
export const REPLAY_CAMERAS = ['tv', 'heli', 'chase'];
export const INTRO_SECS = 1.8; // fly-by over the grid during the first part of the countdown
export const FINISH_SECS = 2; // side-on finish camera after crossing the line
const MAX_PARTICLES = 150;

/* Light radial (zoom) blur used at speed, quality 2 only. */
const RadialBlurShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.52) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; uniform vec2 center; varying vec2 vUv;
    void main(){
      vec2 d = vUv - center;
      float r = length(d);
      float k = strength * smoothstep(0.12, 0.75, r); // keep the middle (car, road ahead) sharp
      vec4 c = vec4(0.0);
      for (int i = 0; i < 8; i++) { c += texture2D(tDiffuse, vUv - d * k * (float(i) / 7.0)); }
      gl_FragColor = c / 8.0;
    }`,
};

let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(cv);
  softTex.colorSpace = THREE.SRGBColorSpace;
  return softTex;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

/* ------------------------------------------------------------------ */
/* fallbacks                                                           */
/* ------------------------------------------------------------------ */
function fallbackTrack(course) {
  // Integrate one lap of segment curvature into a flat-ish closed-ish loop (preview only).
  const segs = course?.segments || [];
  const lapLen = course?.lapLength || Math.max(1, segs.length);
  const start = course?.startLines?.[0] ?? 0;
  const samples = [];
  let x = 0, z = 0, h = 0;
  const n = lapLen * M_PER_SEG;
  for (let s = 0; s <= n; s++) {
    const seg = segs[start + Math.floor(s / M_PER_SEG)] || { curve: 0, y1: 0 };
    const tan = [Math.sin(h), 0, Math.cos(h)];
    const nor = [Math.cos(h), 0, -Math.sin(h)];
    samples.push({ s, pos: [x, (seg.y1 || 0) / SEG * M_PER_SEG * 0.5, z], tan, nor, up: [0, 1, 0], curv: (seg.curve || 0) * 0.004, bank: 0 });
    h -= (seg.curve || 0) * 0.004;
    x += tan[0];
    z += tan[2];
  }
  return { length: n, samples, width: HALF_W * 2 };
}

function fallbackFrameAt(track, s, x) {
  const L = track.length;
  s = ((s % L) + L) % L;
  const i = Math.floor(s);
  const f = s - i;
  const a = track.samples[i];
  const b = track.samples[Math.min(track.samples.length - 1, i + 1)];
  const lerp3 = (p, q) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
  const pos = lerp3(a.pos, b.pos);
  const nor = lerp3(a.nor, b.nor);
  const w = (track.width || 14) / 2;
  return { pos: [pos[0] + nor[0] * x * w, pos[1] + nor[1] * x * w, pos[2] + nor[2] * x * w], tan: lerp3(a.tan, b.tan), nor, up: lerp3(a.up, b.up) };
}

function fallbackCar(color = '#d62828') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.4), new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1 }));
  body.position.set(0, 0.55, 1.2);
  body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 1.9), new THREE.MeshPhysicalMaterial({ color: 0x111418, metalness: 0.2, roughness: 0.05 }));
  cabin.position.set(0, 1.0, 0.9);
  cabin.castShadow = true;
  g.add(body, cabin);
  const wheels = [];
  const front = [];
  const tg = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 18);
  tg.rotateZ(Math.PI / 2);
  const tm = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  for (const [wx, wz] of [[-0.9, 0], [0.9, 0], [-0.9, 2.6], [0.9, 2.6]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.34, wz);
    const w = new THREE.Mesh(tg, tm);
    w.castShadow = true;
    pivot.add(w);
    g.add(pivot);
    wheels.push(w);
    if (wz > 1) front.push(pivot);
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  for (const lx of [-0.65, 0.65]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), lightMat);
    l.position.set(lx, 0.68, -1.02);
    g.add(l);
  }
  g.userData = {
    wheels,
    frontWheels: front,
    setBrake(on) { lightMat.emissiveIntensity = on ? 3 : 0.4; },
    setSteer(a) { for (const p of front) p.rotation.y = a; },
    spin(d) { for (const w of wheels) w.rotation.x += d / 0.34; },
    setColor(hex) { body.material.color.set(hex); },
  };
  return g;
}

function fallbackWorld(track) {
  const group = new THREE.Group();
  const n = track.samples.length;
  const pos = [];
  const idx = [];
  const w = (track.width || 14) / 2;
  for (let i = 0; i < n; i++) {
    const s = track.samples[i];
    for (const side of [-1, 1]) pos.push(s.pos[0] + s.nor[0] * w * side, s.pos[1] + 0.02, s.pos[2] + s.nor[2] * w * side);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.85, side: THREE.DoubleSide }));
  road.receiveShadow = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.3;
  ground.receiveShadow = true;
  group.add(ground, road);
  return { group, update() {}, dispose() { geo.dispose(); } };
}

/* ------------------------------------------------------------------ */
/* view                                                                */
/* ------------------------------------------------------------------ */
export function createView3D(canvas) {
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (e) {
    return { supported: false, ready: Promise.resolve(false), start() {}, render() {}, setCamera() {}, nextCamera() { return 'chase'; }, setQuality() {}, resize() {}, setReplay() {}, dispose() {} };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8ee);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.15, 12000);

  const hemi = new THREE.HemisphereLight(0xdcecff, 0x4a5a3a, 0.7);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  const sunDir = new THREE.Vector3(-0.45, 0.75, -0.5).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envFallback = null;

  const mods = { track3d: null, car3d: null, world3d: null };
  const ready = Promise.all([
    import('./track3d.js').then((m) => (mods.track3d = m)).catch(() => {}),
    import('./car3d.js').then((m) => (mods.car3d = m)).catch(() => {}),
    import('./world3d.js').then((m) => (mods.world3d = m)).catch(() => {}),
  ]).then(() => true);

  const st = {
    quality: (window.devicePixelRatio || 1) > 2 ? 1 : 2,
    qualityLock: false,
    w: 1, h: 1, dpr: 1,
    composer: null,
    bloom: null,
    world: null,
    track: null,
    cars: [], // [{ obj, src:'player'|index, lastX, steer, s }]
    race: null,
    camMode: 'chase',
    replay: false,
    camPos: new THREE.Vector3(),
    camLook: new THREE.Vector3(),
    camInit: false,
    fov: 60,
    tvPoint: null,
    frameTimes: [],
    lastQChange: 0,
    shake: 0,
    showLine: true,
    line: null,
    radial: null,
    fx: null, // tyre smoke / dust particles
    introT: null, // manual intro override (0..1) for previews
    curbT: 0,
  };
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q !== null && /^[012]$/.test(q)) { st.quality = Number(q); st.qualityLock = true; }
  } catch (e) { /* ignore */ }

  function buildComposer() {
    if (st.composer) st.composer.dispose?.();
    const q = st.quality;
    renderer.setPixelRatio(Math.min(st.dpr, q >= 2 ? 2 : q >= 1 ? 1.5 : 1));
    renderer.setSize(st.w, st.h, false);
    renderer.shadowMap.enabled = q >= 1;
    for (const L of [sun, st.world?.sun]) {
      if (!L) continue;
      L.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024);
      if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
    }
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(st.w, st.h);
    composer.addPass(new RenderPass(scene, camera));
    // Tone-map first, then bloom on display values: only things that end up near white
    // (sun glints, lamps, brake lights) glow; the bright HDR sky does not wash the frame.
    composer.addPass(new OutputPass());
    st.bloom = null;
    if (q >= 1) {
      const bw = Math.max(1, Math.floor(st.w / (q >= 2 ? 2 : 3)));
      const bh = Math.max(1, Math.floor(st.h / (q >= 2 ? 2 : 3)));
      st.bloom = new UnrealBloomPass(new THREE.Vector2(bw, bh), 0.25, 0.35, 0.97);
      composer.addPass(st.bloom);
    }
    st.radial = null;
    if (q >= 2) {
      st.radial = new ShaderPass(RadialBlurShader);
      st.radial.enabled = false;
      composer.addPass(st.radial);
    }
    if (q >= 2) composer.addPass(new SMAAPass());
    else composer.addPass(new FXAAPass());
    st.composer = composer;
  }

  function resize(w, h, dpr = window.devicePixelRatio || 1) {
    st.w = Math.max(1, Math.floor(w));
    st.h = Math.max(1, Math.floor(h));
    st.dpr = dpr;
    camera.aspect = st.w / st.h;
    camera.updateProjectionMatrix();
    buildComposer();
  }

  function setQuality(q) {
    q = clamp(Math.round(q), 0, 2);
    if (q === st.quality) return;
    st.quality = q;
    buildComposer();
  }

  function frameAt(s, x) {
    const f = mods.track3d?.frameAt && st.track && !st.track._fallback ? mods.track3d.frameAt(st.track, s, x) : fallbackFrameAt(st.track, s, x);
    return f;
  }

  function toTrack(z, x) {
    const c = st.race.course;
    if (typeof c.toTrack === 'function') {
      try {
        const r = c.toTrack(z, x);
        if (r && Number.isFinite(r.s)) return r;
      } catch (e) { /* fall through */ }
    }
    const mps = c.metersPerSegment || M_PER_SEG;
    const startZ = (c.startLines?.[0] ?? 0) * SEG;
    const L = st.track.length;
    let s = ((z - startZ) / SEG) * mps;
    s = ((s % L) + L) % L;
    return { s, x };
  }

  function makeCar(spec, i) {
    spec = spec || {};
    const model = spec.model || 'gt';
    const color = spec.color || '#d62828';
    const number = spec.number ?? i + 1;
    let obj = null;
    if (mods.car3d?.createCar) {
      try { obj = mods.car3d.createCar(model, colorHex(color), number, { quality: st.quality }); } catch (e) { obj = null; }
    }
    if (!obj) obj = fallbackCar(colorHex(color));
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return obj;
  }

  function colorHex(c) {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') return c.hex || c.color || '#d62828';
    return '#d62828';
  }

  /* ---------------- racing line (driving aid) ----------------
   * A translucent band on the road showing where to drive and how fast: blue = flat out,
   * yellow = lifting, red = the auto-brake zone (from course.brake). It hugs the inside of
   * corners. Built once per race for 1 lap + the look-ahead window, then only a window
   * ahead of the player is drawn (geometry.drawRange), so it costs nothing per frame. */
  const LINE_STEP = 2; // m per row
  const LINE_AHEAD = 300; // m shown ahead of the player
  let arrowTex = null;
  function arrowTexture() {
    if (arrowTex) return arrowTex;
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 64, 128);
    // one chevron per tile, pointing "up" the texture (= forward along the track)
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 18);
    g.lineTo(60, 62);
    g.lineTo(46, 62);
    g.lineTo(32, 40);
    g.lineTo(18, 62);
    g.lineTo(4, 62);
    g.closePath();
    g.fill();
    arrowTex = new THREE.CanvasTexture(cv);
    arrowTex.wrapS = arrowTex.wrapT = THREE.RepeatWrapping;
    arrowTex.anisotropy = 8;
    return arrowTex;
  }

  function lineColor(b) {
    if (b >= 0.93) return [0.16, 0.55, 1.0];
    if (b >= 0.8) return [1.0, 0.82, 0.12];
    return [1.0, 0.18, 0.14];
  }

  function brakeAt(course, s) {
    const br = course.brake;
    if (!br || !br.length) return 1;
    const mps = course.metersPerSegment || M_PER_SEG;
    const L = course.lapLength || Math.round(st.track.length / mps);
    const start = course.startLines?.[0] ?? 0;
    const lapOff = (course.laps || 1) > 1 ? L : 0; // use lap 2 (no grid effects)
    const i = start + lapOff + Math.floor((((s % st.track.length) + st.track.length) % st.track.length) / mps);
    const v = br[Math.min(br.length - 1, Math.max(0, i))];
    return Number.isFinite(v) ? v : 1;
  }

  function buildRacingLine(race) {
    const track = st.track;
    const course = race.course;
    const L = track.length;
    const S = track.samples || [];
    // smoothed curvature (±35 m window) → inside offset
    const n = S.length || 1;
    const curvAvg = (s) => {
      const i = Math.floor(((s % L) + L) % L) % n;
      const w = 35;
      let sum = 0;
      let cnt = 0;
      for (let k = -w; k <= w; k += 5) { sum += S[(i + k + n * 4) % n]?.curv || 0; cnt++; }
      return sum / cnt;
    };
    const total = L + LINE_AHEAD + 20;
    const rows = Math.ceil(total / LINE_STEP) + 1;
    const mk = (half) => {
      const pos = new Float32Array(rows * 2 * 3);
      const col = new Float32Array(rows * 2 * 3);
      const uv = new Float32Array(rows * 2 * 2);
      const idx = [];
      for (let r = 0; r < rows; r++) {
        const sr = r * LINE_STEP;
        const off = clamp(curvAvg(sr) * 22, -0.5, 0.5);
        const c = lineColor(brakeAt(course, sr));
        for (let side = 0; side < 2; side++) {
          const xm = off * HALF_W + (side ? half : -half);
          const f = frameAt(sr, xm / HALF_W);
          const o = (r * 2 + side) * 3;
          pos[o] = f.pos[0] + f.up[0] * 0.035;
          pos[o + 1] = f.pos[1] + f.up[1] * 0.035;
          pos[o + 2] = f.pos[2] + f.up[2] * 0.035;
          col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2];
          uv[(r * 2 + side) * 2] = side;
          uv[(r * 2 + side) * 2 + 1] = sr / 7; // one arrow every 7 m
        }
        if (r < rows - 1) {
          const a = r * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    };
    const bandMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true, toneMapped: false,
    });
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, alphaMap: arrowTexture(), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true, toneMapped: false,
    });
    const band = new THREE.Mesh(mk(0.8), bandMat);
    const arrows = new THREE.Mesh(mk(0.45), arrowMat);
    band.renderOrder = 2;
    arrows.renderOrder = 3;
    band.frustumCulled = false;
    arrows.frustumCulled = false;
    const grp = new THREE.Group();
    grp.name = 'racingLine';
    grp.add(band, arrows);
    grp.userData = { band, arrows, rows, L };
    return grp;
  }

  function updateRacingLine(race) {
    const ln = st.line;
    if (!ln) return;
    const show = st.showLine && !st.replay && race.state !== 'goal';
    ln.visible = show;
    if (!show) return;
    const tt = toTrack(race.player.z, 0);
    const s0 = Math.max(0, tt.s - 6);
    const r0 = Math.floor(s0 / LINE_STEP);
    const count = Math.ceil((LINE_AHEAD + 6) / LINE_STEP);
    const r1 = Math.min(ln.userData.rows - 1, r0 + count);
    for (const m of [ln.userData.band, ln.userData.arrows]) m.geometry.setDrawRange(r0 * 6, Math.max(0, r1 - r0) * 6);
  }

  function clearRace() {
    for (const c of st.cars) { scene.remove(c.obj); disposeObj(c.obj); }
    st.cars = [];
    st.playerBox = null;
    if (st.line) { scene.remove(st.line); disposeObj(st.line); st.line = null; }
    if (st.fx) { scene.remove(st.fx.mesh); st.fx.mesh.geometry.dispose(); st.fx.mesh.material.dispose(); st.fx = null; }
    if (st.world) { scene.remove(st.world.group); try { st.world.dispose(); } catch (e) { /* ignore */ } st.world = null; }
  }

  function disposeObj(o) {
    o.traverse((m) => {
      if (m.isMesh) {
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mt of mats) mt?.dispose?.();
      }
    });
  }

  function start(race, opts = {}) {
    clearRace();
    st.race = race;
    const course = race.course;
    const id = course?.def?.id || course?.id || 'coast';
    let track = course.track || null;
    if (!track && mods.track3d?.buildTrack) {
      try { track = mods.track3d.buildTrack(id); } catch (e) { track = null; }
    }
    if (!track || !track.samples?.length) {
      track = fallbackTrack(course);
      track._fallback = true;
    }
    st.track = track;
    // world
    let world = null;
    if (mods.world3d?.buildWorld) {
      try { world = mods.world3d.buildWorld(THREE, track, { id, quality: st.quality, renderer, scene, sunDir: sunDir.clone(), course }); } catch (e) { console.warn('world3d failed', e); world = null; }
    }
    if (!world) world = fallbackWorld(track);
    st.world = world;
    scene.add(world.group);
    try { st.line = buildRacingLine(race); scene.add(st.line); } catch (e) { console.warn('racing line failed', e); st.line = null; }
    // The real world brings its own sun, sky light, fog, environment and exposure.
    const own = !!world.sun;
    sun.visible = !own;
    hemi.visible = !own;
    sun.castShadow = !own;
    if (own) {
      scene.background = null;
      st.sun = world.sun;
      renderer.toneMappingExposure = world.exposure ?? 1;
    } else {
      st.sun = sun;
      scene.fog = scene.fog || new THREE.Fog(0xb9d6f0, 250, 1600);
      scene.background = new THREE.Color(0x9fc8ee);
      renderer.toneMappingExposure = 1;
    }
    if (!scene.environment) {
      if (!envFallback) envFallback = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envFallback;
    }
    // cars
    const playerSpec = opts.car || race.car || race.playerCar || { model: 'gt', color: '#d62828', number: 7 };
    const p = makeCar(playerSpec, 6);
    scene.add(p);
    st.cars.push({ obj: p, src: 'player', lastX: race.player.x, steer: 0, yawV: 0 });
    race.rivals.forEach((r, i) => {
      const spec = opts.rivals?.[i] || r.car || race.course.rivals?.[i]?.car;
      const o = makeCar(spec, i);
      scene.add(o);
      st.cars.push({ obj: o, src: i, lastX: r.x, steer: 0, yawV: 0 });
    });
    for (const c of st.cars) addBrakeGlow(c);
    st.fx = makeParticles();
    scene.add(st.fx.mesh);
    st.camInit = false;
    st.tvPoint = null;
    st.lastFrameAt = null;
    st.frameTimes.length = 0;
    if (!st.composer) buildComposer();
  }

  const _v = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _qy = new THREE.Quaternion();

  /* ---------------- brake-light glow ----------------
   * Two additive soft sprites behind the tail lights, shown while braking. They make the
   * lights bloom clearly (the bloom pass only catches near-white pixels after tone mapping). */
  function addBrakeGlow(c) {
    try {
      const b = localBox(c.obj);
      const w = b.max.x - b.min.x;
      const h = b.max.y - b.min.y;
      const mat = new THREE.SpriteMaterial({ map: softTexture(), color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      const group = new THREE.Group();
      for (const sx of [-1, 1]) {
        const sp = new THREE.Sprite(mat);
        sp.position.set(sx * w * 0.36, b.min.y + h * 0.5, b.min.z - 0.05);
        sp.scale.set(0.9, 0.55, 1);
        sp.renderOrder = 5;
        group.add(sp);
      }
      group.visible = false;
      c.obj.add(group);
      c.glow = { group, mat, k: 0 };
    } catch (e) { c.glow = null; }
  }

  function updateGlow(c, braking, dt, near) {
    const g = c.glow;
    if (!g) return;
    g.k += ((braking ? 1 : 0) - g.k) * damp(braking ? 18 : 8, dt);
    g.group.visible = g.k > 0.02 && near;
    g.mat.opacity = 0.95 * g.k;
    const s = 0.8 + 0.25 * g.k;
    for (const sp of g.group.children) sp.scale.set(0.9 * s, 0.55 * s, 1);
  }

  /* ---------------- tyre smoke / dust ----------------
   * One InstancedMesh of camera-facing quads (max 150). Off the track the wheels kick up
   * brown dust; hard steering at speed leaves white tyre smoke. */
  function makeParticles() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: softTexture(), transparent: true, depthWrite: false, opacity: 0.55, fog: true });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.name = 'tyreFx';
    const P = [];
    for (let i = 0; i < MAX_PARTICLES; i++) P.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, grow: 1, col: new THREE.Color() });
    return { mesh, P, next: 0, acc: new Map() };
  }

  const _zero = new THREE.Vector3();
  const DUST = new THREE.Color(0xe0cda6);
  const SMOKE = new THREE.Color(0xf2f2f2);
  function emit(pos, vel, col, size, life) {
    const fx = st.fx;
    if (!fx) return;
    let p = null;
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const c = fx.P[(fx.next + n) % MAX_PARTICLES];
      if (c.life <= 0) { p = c; fx.next = (fx.next + n + 1) % MAX_PARTICLES; break; }
    }
    if (!p) { p = fx.P[fx.next]; fx.next = (fx.next + 1) % MAX_PARTICLES; }
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.col.copy(col);
    p.size = size;
    p.grow = size * 2.2;
    p.max = p.life = life;
  }

  const _e = new THREE.Vector3();
  const _ev = new THREE.Vector3();
  function emitFromCar(c, kind, rate, dt) {
    const fx = st.fx;
    const key = c.obj.id;
    let a = (fx.acc.get(key) || 0) + rate * dt;
    const o = c.obj;
    const carVel = c.vel || _zero;
    const right = _v.set(1, 0, 0).applyQuaternion(o.quaternion);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion);
    while (a >= 1) {
      a -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      _e.copy(o.position).addScaledVector(right, side * 0.82).addScaledVector(fwd, -0.15 + Math.random() * 0.3);
      _e.y += 0.25;
      // Smoke is dragged along by the car's wake, so it hangs behind the car where the chase
      // camera can see it instead of being left 50 m back within a second.
      _ev.copy(carVel).multiplyScalar(0.78 + Math.random() * 0.1).addScaledVector(fwd, -1.5 - Math.random() * 2).addScaledVector(right, side * (0.4 + Math.random() * 0.8));
      _ev.y += 0.6 + Math.random() * 0.9;
      if (kind === 'dust') emit(_e, _ev, DUST, 1.0 + Math.random() * 0.7, 1.0 + Math.random() * 0.6);
      else emit(_e, _ev, SMOKE, 0.5 + Math.random() * 0.4, 0.7 + Math.random() * 0.4);
    }
    fx.acc.set(key, a);
  }

  function updateParticles(race, dt) {
    const fx = st.fx;
    if (!fx) return;
    // emitters
    if (race.state !== 'countdown') {
      const p = race.player;
      const pctP = clamp(race.speedPct ?? 0, 0, 1.6);
      for (const c of st.cars) {
        const src = c.src === 'player' ? p : race.rivals[c.src];
        if (!src || !c.obj.visible) continue;
        if (c.obj.position.distanceToSquared(camera.position) > 90 * 90) continue;
        const pct = c.src === 'player' ? pctP : clamp((src.speed || 0) / (race.preset?.maxSpeed || 3000), 0, 1.6);
        if (pct < 0.15 || (src.air || 0) > 0) continue;
        const off = Math.abs(src.x) > 1.05;
        const steer = c.src === 'player' ? Math.abs(p.steer || 0) : Math.abs(c.steer || 0);
        const hard = (c.src === 'player' && p.drift) || (steer > 0.65 && pct > 0.6);
        const budget = st.quality >= 2 ? 1 : st.quality >= 1 ? 0.6 : 0.3;
        if (off) emitFromCar(c, 'dust', 38 * pct * budget, dt);
        else if (hard) emitFromCar(c, 'smoke', 26 * pct * budget, dt);
      }
    }
    // integrate + write instances
    const mesh = fx.mesh;
    let n = 0;
    for (const q of fx.P) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) continue;
      q.pos.addScaledVector(q.vel, dt);
      q.vel.multiplyScalar(Math.exp(-0.9 * dt));
      q.vel.y += 0.25 * dt;
      const u = 1 - q.life / q.max;
      const sz = q.size + (q.grow - q.size) * u;
      // fade by shrinking towards the end and by darkening the tint (additive-free alpha blend)
      const fade = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      _m.compose(q.pos, camera.quaternion, _ev.set(sz, sz, sz));
      mesh.setMatrixAt(n, _m);
      _c.copy(q.col).multiplyScalar(0.35 + 0.65 * fade);
      mesh.setColorAt(n, _c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.opacity = 0.62;
  }
  const _c = new THREE.Color();

  function placeCar(c, z, x, steerIn, speed, braking, dt) {
    const tt = toTrack(z, x);
    const f = frameAt(tt.s, tt.x);
    _t.set(f.tan[0], f.tan[1], f.tan[2]).normalize();
    _u.set(f.up[0], f.up[1], f.up[2]).normalize();
    _n.crossVectors(_t, _u).normalize(); // right
    // basis: X = -right? Car model: +Z forward, +Y up, +X left (three default right-handed: X right when looking -Z).
    // We want local +Z → tangent, local +Y → up, local +X → up × tan.
    const xAxis = new THREE.Vector3().crossVectors(_u, _t).normalize();
    _m.makeBasis(xAxis, _u, _t);
    _q.setFromRotationMatrix(_m);
    // lateral velocity → yaw (car points where it is going) + steering.
    const lat = dt > 0 ? (x - c.lastX) / dt : 0;
    c.lastX = x;
    const mps = Math.max(1, (speed / SEG) * M_PER_SEG);
    const latM = lat * HALF_W; // m/s sideways
    const yawTarget = clamp(-Math.atan2(latM, mps), -0.5, 0.5);
    c.yawV += (yawTarget - c.yawV) * damp(10, dt);
    _qy.setFromAxisAngle(_u, c.yawV);
    c.obj.quaternion.copy(_qy.multiply(_q));
    // slight body roll by steering
    c.steer += (steerIn - c.steer) * damp(8, dt);
    if (dt > 0 && c.prevPos) {
      c.vel = c.vel || new THREE.Vector3();
      const vx = (f.pos[0] - c.prevPos.x) / dt, vy = (f.pos[1] - c.prevPos.y) / dt, vz = (f.pos[2] - c.prevPos.z) / dt;
      if (vx * vx + vy * vy + vz * vz < 160 * 160) c.vel.set(vx, vy, vz);
    }
    c.prevPos = (c.prevPos || new THREE.Vector3()).set(f.pos[0], f.pos[1], f.pos[2]);
    c.obj.position.set(f.pos[0], f.pos[1], f.pos[2]);
    const ud = c.obj.userData || {};
    try {
      ud.setSteer?.(-c.steer * 0.42);
      ud.spin?.(mps * dt);
      ud.setBrake?.(!!braking);
    } catch (e) { /* ignore */ }
    return f;
  }

  function updateCars(race, dt) {
    const p = race.player;
    let pf = null;
    for (const c of st.cars) {
      if (c.src === 'player') {
        const steer = p.steer ?? 0;
        const br = !!(race.braking || p.braking) && race.state !== 'countdown';
        pf = placeCar(c, p.z, p.x, steer, p.speed || 0, br, dt);
        c.obj.visible = true;
        updateGlow(c, br, dt, true);
      } else {
        const r = race.rivals[c.src];
        if (!r) { c.obj.visible = false; continue; }
        const st2 = clamp((r.x - c.lastX) * 30, -1, 1);
        placeCar(c, r.z, r.x, st2, r.speed || 0, r.braking, dt);
        c.obj.visible = true;
        updateGlow(c, !!r.braking, dt, c.obj.position.distanceToSquared(camera.position) < 160 * 160);
      }
    }
    return pf;
  }

  function trackPoint(s, x, up) {
    const f = frameAt(s, x);
    return new THREE.Vector3(f.pos[0] + f.up[0] * up, f.pos[1] + f.up[1] * up, f.pos[2] + f.up[2] * up);
  }

  function updateCamera(race, dt) {
    const p = race.player;
    const pc = st.cars[0]?.obj;
    if (!pc) return;
    const pos = pc.position;
    const fwd = _v.set(0, 0, 1).applyQuaternion(pc.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pc.quaternion);
    const pct = clamp(race.speedPct ?? (p.speed / 3000), 0, 1.6);
    let desired, look, fov = 60, k = 7;
    // Pre-race fly-by over the grid (first part of the countdown), or a manual preview.
    const introU = st.introT != null ? st.introT
      : (!st.replay && race.state === 'countdown' && (race.stateTime ?? 0) < INTRO_SECS ? (race.stateTime ?? 0) / INTRO_SECS : null);
    if (introU != null) { applyIntro(race, clamp(introU, 0, 1), pos, fwd, up); return; }
    let mode = st.camMode;
    // Side-on finish camera for the first seconds after the player crosses the line.
    const finishing = !st.replay && race.state === 'goal' && (race.stateTime ?? 99) < FINISH_SECS;
    if (finishing) mode = 'finish';
    if (mode === 'far') {
      desired = pos.clone().addScaledVector(fwd, -9.5).addScaledVector(up, 3.2);
      look = pos.clone().addScaledVector(fwd, 6).addScaledVector(up, 0.8);
      fov = 55 + 8 * pct;
    } else if (mode === 'bumper') {
      // Just above the bonnet: the bonnet stays in the bottom of the frame.
      const bb = st.playerBox || (st.playerBox = localBox(pc));
      const front = bb.max.z;
      const hood = bb.min.y + (bb.max.y - bb.min.y) * 0.62;
      // Eye just above the bonnet, looking straight down the road: the horizon sits a
      // little above the middle of the frame (~45%) and only the tip of the bonnet shows.
      const portrait = camera.aspect < 1;
      const eye = hood + (portrait ? 0.42 : 0.3);
      desired = pos.clone().addScaledVector(fwd, front - 1.1).addScaledVector(up, eye);
      const pitch = (portrait ? 3.2 : 3.4) * Math.PI / 180; // look slightly down
      look = desired.clone().addScaledVector(fwd, 40).addScaledVector(up, -40 * Math.tan(pitch));
      fov = (portrait ? 64 : 50) + 8 * Math.min(1, pct);
      k = 40;
    } else if (mode === 'finish') {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(pc.quaternion);
      const u = clamp((race.stateTime ?? 0) / FINISH_SECS, 0, 1);
      const portrait = camera.aspect < 1;
      const side = portrait ? 13 : 10;
      desired = pos.clone().addScaledVector(right, -side).addScaledVector(up, 1.4).addScaledVector(fwd, 4.5 - 3.5 * u);
      look = pos.clone().addScaledVector(up, 0.6).addScaledVector(fwd, 1.2);
      fov = portrait ? 44 : 34;
      k = 5;
    } else if (mode === 'heli') {
      const tt = toTrack(p.z, 0);
      desired = trackPoint(tt.s - 30, 1.6, 42);
      look = pos.clone();
      fov = 45;
      k = 2.5;
    } else if (mode === 'tv') {
      const tt = toTrack(p.z, 0);
      const L = st.track.length;
      let rel = st.tvPoint ? ((st.tvPoint.s - tt.s) % L + L) % L : -1;
      if (!st.tvPoint || (rel > L / 2 && L - rel > 70) || rel > 260) {
        const side = st.tvPoint ? -st.tvPoint.side : 1;
        const s = (tt.s + 140) % L;
        st.tvPoint = { s, side, pos: trackPoint(s, side * 2.6, 3.5) };
        st.camInit = false;
      }
      desired = st.tvPoint.pos.clone();
      look = pos.clone().addScaledVector(up, 0.6);
      const d = desired.distanceTo(pos);
      fov = clamp(1400 / Math.max(10, d), 8, 50);
      k = 1000;
    } else {
      // Racing-game chase camera: low and close, pitched just below level, so the car sits in
      // the lower part of the frame (roof a little below the middle) with the road ahead above it.
      // Portrait screens have a tall vertical field of view, so they get their own numbers.
      const portrait = camera.aspect < 1;
      const dist = portrait ? 6.0 : 6.4;
      const height = portrait ? 2.1 : 2.15;
      const pitch = (portrait ? 3.0 : 4.5) * Math.PI / 180;
      desired = pos.clone().addScaledVector(fwd, -dist).addScaledVector(up, height);
      look = desired.clone().addScaledVector(fwd, 30).addScaledVector(up, -30 * Math.tan(pitch));
      fov = (portrait ? 58 : 46) + (portrait ? 8 : 10) * Math.min(1, pct) + (p.boost > 0 ? 5 : 0);
      k = 9;
    }
    // Move the smoothed camera with the car first so the spring only smooths the offset
    // (otherwise it lags metres behind at racing speed).
    if (st.camInit && st.prevCarPos && mode !== 'tv') {
      const dx = pos.x - st.prevCarPos.x, dy = pos.y - st.prevCarPos.y, dz = pos.z - st.prevCarPos.z;
      if (dx * dx + dy * dy + dz * dz < 400) {
        st.camPos.x += dx; st.camPos.y += dy; st.camPos.z += dz;
        st.camLook.x += dx; st.camLook.y += dy; st.camLook.z += dz;
      }
    }
    st.prevCarPos = (st.prevCarPos || new THREE.Vector3()).copy(pos);
    if (!st.camInit) {
      st.camPos.copy(desired);
      st.camLook.copy(look);
      st.fov = fov;
      st.camInit = true;
    } else {
      st.camPos.lerp(desired, damp(k, dt));
      st.camLook.lerp(look, damp(Math.min(k * 1.6, 1000), dt));
      st.fov += (fov - st.fov) * damp(4, dt);
    }
    camera.position.copy(st.camPos);
    // Riding the kerb: a fine, fast buzz (only from the on-board style cameras).
    if (!st.replay && race.state === 'race' && p.curb && (mode === 'chase' || mode === 'far' || mode === 'bumper')) {
      const a = (mode === 'bumper' ? 0.018 : 0.026) * (0.5 + 0.5 * Math.min(1, pct));
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a * 1.6;
      st.curbT = 0.12;
    }
    if (st.shake > 0) {
      st.shake = Math.max(0, st.shake - dt);
      camera.position.x += (Math.random() - 0.5) * 0.06 * st.shake;
      camera.position.y += (Math.random() - 0.5) * 0.05 * st.shake;
    }
    // keep the camera above the road surface
    camera.up.set(0, 1, 0);
    camera.lookAt(st.camLook);
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }
    // shadow follows the player (fallback sun only; world3d moves its own in update)
    if (sun.visible) {
      sun.position.copy(pos).addScaledVector(sunDir, 120);
      sun.target.position.copy(pos);
      sun.target.updateMatrixWorld();
    }
  }

  // Fly from high above the track ahead of the grid down to just behind the player's car.
  function applyIntro(race, u, pos, fwd, up) {
    const e = u * u * (3 - 2 * u);
    const tt = toTrack(race.player.z, 0);
    const a = trackPoint(tt.s + 120, -3.2, 52);
    const b = pos.clone().addScaledVector(fwd, -8.5).addScaledVector(up, 3.1);
    const camPos = a.clone().lerp(b, e);
    camPos.y += Math.sin(Math.PI * e) * 8;
    const grid = trackPoint(tt.s + 6, 0, 1.2);
    const lookB = pos.clone().addScaledVector(fwd, 20).addScaledVector(up, 0.6);
    const look = grid.lerp(lookB, e * e);
    const fov = 48 + 10 * e;
    st.camPos.copy(camPos);
    st.camLook.copy(look);
    st.fov = fov;
    st.camInit = true;
    st.prevCarPos = (st.prevCarPos || new THREE.Vector3()).copy(pos);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  function updatePost(race) {
    const p = race.player;
    const pct = clamp(race.speedPct ?? 0, 0, 1.6);
    if (st.radial) {
      const onboard = st.camMode === 'chase' || st.camMode === 'far' || st.camMode === 'bumper';
      let k = 0;
      if (!st.replay && onboard && race.state === 'race') k = clamp((pct - 0.55) / 0.6, 0, 1) * 0.035 + (p.boost > 0 ? 0.02 : 0);
      st.radial.uniforms.strength.value = k;
      st.radial.enabled = k > 0.002;
    }
    if (st.bloom) {
      const g = st.cars[0]?.glow?.k || 0;
      st.bloom.strength = 0.25 + 0.2 * g;
    }
  }

  function localBox(obj) {
    const q = obj.quaternion.clone();
    const p = obj.position.clone();
    obj.quaternion.identity();
    obj.position.set(0, 0, 0);
    obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(obj);
    obj.quaternion.copy(q);
    obj.position.copy(p);
    obj.updateMatrixWorld(true);
    return b;
  }

  // Measure the real time between frames (the dt passed in is clamped by the caller,
  // so it cannot show that the device is struggling).
  function autoQuality() {
    const now0 = performance.now();
    const last = st.lastFrameAt;
    st.lastFrameAt = now0;
    if (st.qualityLock || last == null) return;
    const real = (now0 - last) / 1000;
    if (real > 0.5) return; // tab was hidden / paused: not a performance signal
    st.frameTimes.push(real);
    if (st.frameTimes.length < 60) return;
    const avg = st.frameTimes.reduce((a, b) => a + b, 0) / st.frameTimes.length;
    st.frameTimes.length = 0;
    const now = performance.now();
    if (now - st.lastQChange < 3000) return;
    if (avg > 0.02 && st.quality > 0) {
      st.lastQChange = now;
      setQuality(st.quality - 1);
    }
  }

  function render(race, dt = 1 / 60, t = 0) {
    if (!race || !st.track) return;
    if (race !== st.race) start(race);
    dt = clamp(dt, 0, 0.1);
    updateCars(race, dt);
    updateCamera(race, dt);
    updateParticles(race, dt);
    updatePost(race);
    updateRacingLine(race);
    try { st.world?.update?.(st.cars[0]?.obj?.position || camera.position, t, { race, camera, quality: st.quality }); } catch (e) { /* ignore */ }
    if (st.composer) st.composer.render(dt);
    else renderer.render(scene, camera);
    autoQuality();
  }

  function setCamera(mode) {
    if (mode && mode !== st.camMode) {
      st.camMode = mode;
      st.camInit = false;
      st.tvPoint = null;
    }
    return st.camMode;
  }

  function nextCamera() {
    const list = st.replay ? REPLAY_CAMERAS : CAMERAS;
    const i = list.indexOf(st.camMode);
    return setCamera(list[(i + 1) % list.length]);
  }

  function setReplay(on) {
    st.replay = !!on;
    setCamera(on ? 'tv' : 'chase');
  }

  function dispose() {
    clearRace();
    st.composer?.dispose?.();
    pmrem.dispose();
    envFallback?.dispose?.();
    renderer.dispose();
  }

  return {
    supported: true,
    ready,
    start,
    render,
    setCamera,
    nextCamera,
    setQuality,
    resize,
    setReplay,
    shake(k = 1) { st.shake = Math.max(st.shake, 0.4 * k); },
    // Preview / force the pre-race fly-by: t in 0..1, or null to return to automatic.
    intro(t) { st.introT = t == null ? null : clamp(Number(t) || 0, 0, 1); return st.introT; },
    get particles() { return st.fx ? st.fx.mesh.count : 0; },
    dispose,
    get quality() { return st.quality; },
    get showLine() { return st.showLine; },
    set showLine(v) { st.showLine = !!v; },
    get camMode() { return st.camMode; },
    get renderer() { return renderer; },
    get scene() { return scene; },
    get camera() { return camera; },
  };
}
