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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SEG = 200; // physics SEGMENT_LENGTH (world units of the Race)
const M_PER_SEG = 5; // metres per segment (contract)
const HALF_W = 7; // half road width in metres (x = ±1 → ±7 m)
export const CAMERAS = ['chase', 'far', 'bumper'];
export const REPLAY_CAMERAS = ['tv', 'heli', 'chase'];

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

  function clearRace() {
    for (const c of st.cars) { scene.remove(c.obj); disposeObj(c.obj); }
    st.cars = [];
    st.playerBox = null;
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
    st.camInit = false;
    st.tvPoint = null;
    if (!st.composer) buildComposer();
  }

  const _v = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _qy = new THREE.Quaternion();

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
        pf = placeCar(c, p.z, p.x, steer, p.speed || 0, race.braking || p.braking, dt);
        c.obj.visible = true;
      } else {
        const r = race.rivals[c.src];
        if (!r) { c.obj.visible = false; continue; }
        const st2 = clamp((r.x - c.lastX) * 30, -1, 1);
        placeCar(c, r.z, r.x, st2, r.speed || 0, r.braking, dt);
        c.obj.visible = true;
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
    const mode = st.camMode;
    if (mode === 'far') {
      desired = pos.clone().addScaledVector(fwd, -9.5).addScaledVector(up, 3.2);
      look = pos.clone().addScaledVector(fwd, 6).addScaledVector(up, 0.8);
      fov = 55 + 8 * pct;
    } else if (mode === 'bumper') {
      // Just above the bonnet: the bonnet stays in the bottom of the frame.
      const bb = st.playerBox || (st.playerBox = localBox(pc));
      const front = bb.max.z;
      const hood = bb.min.y + (bb.max.y - bb.min.y) * 0.62;
      desired = pos.clone().addScaledVector(fwd, front - 1.35).addScaledVector(up, hood + 0.6);
      look = pos.clone().addScaledVector(fwd, front + 28).addScaledVector(up, 0.2);
      fov = 68 + 10 * pct;
      k = 40;
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
      desired = pos.clone().addScaledVector(fwd, -5.6).addScaledVector(up, 1.65);
      look = pos.clone().addScaledVector(fwd, 4).addScaledVector(up, 0.75);
      fov = 60 + 12 * Math.min(1, pct) + (p.boost > 0 ? 6 : 0);
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

  function autoQuality(dt) {
    if (st.qualityLock) return;
    st.frameTimes.push(dt);
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
    try { st.world?.update?.(st.cars[0]?.obj?.position || camera.position, t, { race, camera, quality: st.quality }); } catch (e) { /* ignore */ }
    if (st.composer) st.composer.render(dt);
    else renderer.render(scene, camera);
    autoQuality(dt);
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
    dispose,
    get quality() { return st.quality; },
    get camMode() { return st.camMode; },
    get renderer() { return renderer; },
    get scene() { return scene; },
    get camera() { return camera; },
  };
}
