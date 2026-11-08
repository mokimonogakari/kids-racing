// 3D showroom for the garage screen (circuit mode).
// Dark studio, glossy reflective floor, three spot lights, a slowly turning turntable.
// Cars come from car3d.js (createCar). If it is missing, a simple placeholder box is shown.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let carModule = null;
async function loadCarModule() {
  if (carModule) return carModule;
  try {
    carModule = await import('./car3d.js');
  } catch (e) {
    carModule = {};
  }
  return carModule;
}

function placeholderCar(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.4), mat);
  body.position.set(0, 0.6, 1.3);
  body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2), new THREE.MeshPhysicalMaterial({ color: 0x111418, roughness: 0.05, metalness: 0.2 }));
  cab.position.set(0, 1.15, 1.1);
  g.add(cab);
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const [x, z] of [[-0.9, 0], [0.9, 0], [-0.9, 2.6], [0.9, 2.6]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24), tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    w.castShadow = true;
    g.add(w);
  }
  g.userData.setColor = (hex) => mat.color.set(hex);
  g.userData.placeholder = true;
  return g;
}

/** Soft radial texture for the floor glow / spot pools. */
function radialTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Turntable top: concentric grooves + dashed ring, generated on a canvas. */
function turntableTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2d33';
  c.fillRect(0, 0, 512, 512);
  for (let r = 40; r < 256; r += 6) {
    c.strokeStyle = r % 12 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.25)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(256, 256, r, 0, Math.PI * 2);
    c.stroke();
  }
  c.setLineDash([18, 14]);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(256, 256, 200, 0, Math.PI * 2);
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createGarage3D(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    return { supported: false, ready: Promise.resolve(false), show() {}, setColor() {}, setModel() {}, resize() {}, render() {}, dispose() {} };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f14);
  scene.fog = new THREE.Fog(0x0d0f14, 14, 30);

  // Studio reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // Floor: dark glossy, slightly reflective via the environment.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x0e1014, roughness: 0.45, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Light pool on the floor.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(150,170,210,0.22)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.005;
  scene.add(pool);

  // Turntable.
  const table = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.5, 0.14, 96),
    [
      new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.8, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: turntableTexture(), metalness: 0.6, roughness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.5, roughness: 0.6 }),
    ],
  );
  disc.position.y = 0.07;
  disc.receiveShadow = true;
  table.add(disc);
  // Thin glowing rim.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(3.48, 0.025, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0x8fb6ff }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.13;
  table.add(rim);
  scene.add(table);

  const carHolder = new THREE.Group();
  carHolder.position.y = 0.14;
  table.add(carHolder);

  // Lights: key, rim (back), fill + spot lights from above.
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x0b0c10, 0.35));
  const key = new THREE.SpotLight(0xffffff, 200, 30, Math.PI / 7, 0.55, 1.6);
  key.position.set(4, 9, 6);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const back = new THREE.SpotLight(0xbfd4ff, 200, 30, Math.PI / 6, 0.6, 1.6);
  back.position.set(-5, 7, -7);
  back.target.position.set(0, 0.5, 0);
  scene.add(back, back.target);
  const fill = new THREE.SpotLight(0xffe6cc, 120, 30, Math.PI / 6, 0.7, 1.6);
  fill.position.set(-7, 5, 5);
  fill.target.position.set(0, 0.5, 0);
  scene.add(fill, fill.target);

  // Overhead light strips (emissive bars) for long reflections in the paint.
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-1.6, 0, 1.6]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 7), stripMat);
    s.position.set(x, 7.5, 0);
    scene.add(s);
  }
  // Back wall panels with faint vertical light lines.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x12141a, roughness: 0.9 });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 12, 64, 1, true, Math.PI * 0.6, Math.PI * 0.8), wallMat);
  wall.material.side = THREE.BackSide;
  wall.position.y = 6;
  scene.add(wall);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x2c3e66 });
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * 0.62 + i * (Math.PI * 0.76 / 8);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 9, 0.06), lineMat);
    l.position.set(Math.sin(a) * 15.8, 4.5, Math.cos(a) * 15.8);
    scene.add(l);
  }

  let car = null;
  let state = { model: 'gt', color: '#d01c2a', number: 7 };
  let w = 1;
  let h = 1;
  let time = 0;
  let disposed = false;
  let loadToken = 0;

  function frameCar(obj) {
    // Centre the car on the turntable using its bounding box.
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.x -= c.x;
    obj.position.z -= c.z;
    obj.position.y -= box.min.y;
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    obj.userData.size = box.getSize(new THREE.Vector3());
  }

  async function build() {
    const token = ++loadToken;
    const mod = await loadCarModule();
    if (disposed || token !== loadToken) return;
    let next;
    try {
      next = mod.createCar ? mod.createCar(state.model, state.color, state.number, { garage: true }) : placeholderCar(state.color);
    } catch (e) {
      next = placeholderCar(state.color);
    }
    if (car) {
      carHolder.remove(car);
      car.traverse((o) => {
        if (o.isMesh) o.geometry?.dispose?.();
      });
    }
    car = next;
    frameCar(car);
    carHolder.add(car);
  }

  const ready = build().then(() => true);

  let zoom = 1;
  let holdSpin = 0;
  function updateCamera() {
    const aspect = w / h;
    camera.aspect = aspect;
    // Pull back further in portrait so the whole car fits the width.
    const len = car?.userData.size ? Math.max(car.userData.size.z, car.userData.size.x) : 4.6;
    const fitDist = (len * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, aspect * 1.05);
    const breathe = 1 + Math.sin(time * 0.35) * 0.06;
    const dist = Math.max(6, fitDist) * breathe * zoom;
    const yaw = 0.6 + Math.sin(time * 0.2) * 0.15;
    camera.position.set(Math.sin(yaw) * dist, 1.6 + dist * 0.16, Math.cos(yaw) * dist);
    camera.lookAt(0, 0.65, 0);
    camera.updateProjectionMatrix();
  }

  return {
    supported: true,
    ready,
    show(model, color, number) {
      state = { model: model || state.model, color: color || state.color, number: number ?? state.number };
      build();
    },
    setColor(hex) {
      state.color = hex;
      if (car?.userData.setColor) car.userData.setColor(hex);
      else build();
    },
    /** Turn the turntable by hand (dx in screen pixels). */
    rotateBy(dx) {
      if (!Number.isFinite(dx)) return;
      table.rotation.y += dx * 0.01;
      holdSpin = 2.5;
    },
    /** Zoom: k > 1 moves closer, k < 1 moves away. */
    zoomBy(k) {
      if (!Number.isFinite(k) || k <= 0) return;
      zoom = Math.min(1.5, Math.max(0.6, zoom / k));
    },
    setModel(id) {
      if (id === state.model) return;
      state.model = id;
      build();
    },
    resize(width, height, dpr = 1) {
      w = Math.max(1, width);
      h = Math.max(1, height);
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(w, h, false);
    },
    render(dt = 1 / 60) {
      if (disposed) return;
      time += dt;
      // Auto-spin, paused for a moment after the child turns the car by hand.
      holdSpin = Math.max(0, holdSpin - dt);
      if (holdSpin <= 0) table.rotation.y += dt * 0.35;
      car?.userData.spin?.(0);
      updateCamera();
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
