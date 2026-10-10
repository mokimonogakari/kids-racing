// Pseudo-3D road renderer (classic arcade style) + HUD + particles.
import { SEGMENT_LENGTH, clamp } from './physics.js';
import { SPRITES, spriteImage, rrect } from './art.js';
import { START_LINE } from './course.js';

const ROAD_W = 1000;
const CAM_H = 900;
const DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180);
const PLAYER_DZ = CAM_H * DEPTH;
const DRAW = 130;
const CURVE_K = 0.55;
const FOLLOW = 0.65;

const PALETTES = {
  meadow: {
    sky: ['#6fcbff', '#c9f0ff', '#f2fbff'],
    grass: ['#8ee06a', '#81d65e'],
    rumble: ['#ff6b7f', '#ffffff'],
    road: ['#a3a7b8', '#9ba0b2'],
    lane: '#ffffff',
    hills: ['#a6e88c', '#7fd36a'],
  },
  sea: {
    sky: ['#4fc3ff', '#bdeeff', '#f0fbff'],
    grass: ['#ffe6a6', '#fbdc93'],
    rumble: ['#ff8fb1', '#ffffff'],
    road: ['#aaa6b9', '#a29eb2'],
    lane: '#ffffff',
    water: ['#4cc4f0', '#43b9e8'],
    hills: ['#6fd2c0', '#58c2ae'],
  },
  snow: {
    sky: ['#8fc0ff', '#dbe9ff', '#f6f9ff'],
    grass: ['#f6faff', '#e7f0fb'],
    rumble: ['#4aa3ff', '#ffffff'],
    road: ['#a5b4cc', '#9dadc6'],
    lane: '#ffffff',
    hills: ['#dbe8f7', '#c3d6ee'],
  },
};
const BOOST_COLS = ['#ff7eb6', '#ffd23f', '#5ce1e6'];

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.W = 1;
    this.H = 1;
    this.safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this.particles = [];
    this.flyers = [];
    this.bgOffset = 0;
    this.bgCourse = null;
    this.flakes = [];
  }

  resize(safe) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, window.innerWidth);
    const H = Math.max(1, window.innerHeight);
    this.dpr = dpr;
    this.W = W;
    this.H = H;
    if (safe) this.safe = safe;
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    const portrait = H >= W;
    this.portrait = portrait;
    this.SX = portrait ? W * 0.47 : Math.min(W * 0.36, H * 0.78);
    this.HZ = portrait ? H * 0.4 : H * 0.34;
    this.SY = (H - this.HZ) * (portrait ? 0.6 : 0.56);
    this.carW = portrait ? Math.min(this.SX * 0.8, H * 0.2) : Math.min(this.SX * 0.8, H * 0.34);
    this.bgCourse = null; // rebuild background at new size
  }

  // ---------- background ----------
  buildBackground(courseId) {
    const pal = PALETTES[courseId];
    const W = this.W;
    const dpr = this.dpr;
    const lw = Math.ceil(W * 1.5);
    const lh = Math.ceil(this.H * 0.3);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(lw * dpr);
    cv.height = Math.ceil(lh * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    // clouds
    const cloud = (x, y, s) => {
      c.fillStyle = 'rgba(255,255,255,0.95)';
      for (const [dx, dy, r] of [[0, 0, 1], [1.1, -0.4, 1.25], [2.2, 0, 0.95], [1.1, 0.35, 1]]) {
        c.beginPath();
        c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        c.fill();
      }
    };
    for (let i = 0; i < 5; i++) {
      const x = ((i + 0.3) / 5) * lw;
      cloud(x, lh * (0.15 + (i % 2) * 0.12), Math.max(10, lh * 0.08));
    }
    // hills / mountains (tileable: use sine sums with integer periods)
    const layer = (amp, base, col, periods, phase, peaky) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, lh);
      for (let x = 0; x <= lw; x += 4) {
        const u = (x / lw) * Math.PI * 2;
        let y = 0;
        periods.forEach((p, k) => {
          y += Math.sin(u * p + phase * (k + 1)) / (k + 1);
        });
        if (peaky) y = Math.abs(y) * 1.2;
        c.lineTo(x, lh - base - y * amp);
      }
      c.lineTo(lw, lh);
      c.closePath();
      c.fill();
    };
    if (courseId === 'snow') {
      layer(lh * 0.32, lh * 0.25, '#c9dcf4', [3, 5], 0.5, true);
      // snow caps highlight
      layer(lh * 0.22, lh * 0.12, pal.hills[0], [4, 7], 1.7, false);
    } else if (courseId === 'sea') {
      layer(lh * 0.15, lh * 0.12, pal.hills[0], [2, 3], 1, false);
      c.fillStyle = '#3fb4ea';
      c.fillRect(0, lh - lh * 0.12, lw, lh * 0.12);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let x = 0; x < lw; x += 46) c.fillRect(x, lh - lh * 0.08, 18, 2);
    } else {
      layer(lh * 0.18, lh * 0.3, pal.hills[0], [2, 3], 0.4, false);
      layer(lh * 0.14, lh * 0.12, pal.hills[1], [3, 5], 2.1, false);
    }
    this.bgLayer = cv;
    this.bgLW = lw;
    this.bgLH = lh;
    // sky gradient
    const sky = this.c.createLinearGradient(0, 0, 0, this.HZ);
    sky.addColorStop(0, pal.sky[0]);
    sky.addColorStop(0.7, pal.sky[1]);
    sky.addColorStop(1, pal.sky[2]);
    this.skyGrad = sky;
    this.bgCourse = courseId;
    this.flakes = [];
    if (courseId === 'snow') {
      for (let i = 0; i < 40; i++) this.flakes.push({ x: Math.random() * this.W, y: Math.random() * this.H, r: 1.5 + Math.random() * 2.5, s: 20 + Math.random() * 30 });
    }
  }

  // ---------- helpers ----------
  project(p, camX, camY, camZ, wx, wy, wz) {
    const cz = wz - camZ;
    const r = (DEPTH / cz) * CAM_H;
    p.r = r;
    p.x = this.W / 2 + r * ((wx - camX) / ROAD_W) * this.SX;
    p.y = this.HZ - r * ((wy - camY) / CAM_H) * this.SY;
    p.w = r * this.SX;
    p.cz = cz;
  }

  sprite(id, frame, x, y, r, worldW, lift = 0, clipY = 0, rot = 0, sizeOverride = 0) {
    const def = SPRITES[id];
    if (!def) return;
    const dw = sizeOverride || (worldW || def.world) * r * this.SX;
    if (dw < 2) return;
    const dh = dw * (def.box[1] / def.box[0]);
    const dx = x - dw / 2;
    const dy = y - dh - lift;
    if (dx > this.W || dx + dw < 0 || dy > this.H) return;
    const devW = dw * this.dpr;
    const bucket = devW < 56 ? 64 : devW < 120 ? 128 : devW < 240 ? 256 : devW < 600 ? 512 : 1024;
    const img = spriteImage(id, Math.round((bucket * Math.max(def.box[0], def.box[1])) / def.box[0]), frame);
    if (!img) return;
    const c = this.c;
    if (clipY && dy + dh > clipY) {
      const cut = (dy + dh - clipY) / dh;
      if (cut >= 1) return;
      const sh = img.height * (1 - cut);
      if (rot) {
        c.save();
        c.translate(x, y - lift);
        c.rotate(rot);
        c.drawImage(img, 0, 0, img.width, sh, -dw / 2, -dh, dw, dh * (1 - cut));
        c.restore();
      } else c.drawImage(img, 0, 0, img.width, sh, dx, dy, dw, dh * (1 - cut));
      return;
    }
    if (rot) {
      c.save();
      c.translate(x, y - lift);
      c.rotate(rot);
      c.drawImage(img, -dw / 2, -dh, dw, dh);
      c.restore();
    } else c.drawImage(img, dx, dy, dw, dh);
  }

  poly(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    const c = this.c;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineTo(x3, y3);
    c.lineTo(x4, y4);
    c.closePath();
    c.fill();
  }

  // ---------- main draw ----------
  draw(race, t) {
    const c = this.c;
    const { W, H } = this;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.bgCourse !== race.courseId) this.buildBackground(race.courseId);
    const pal = PALETTES[race.courseId];
    const course = race.course;
    this.goalIndex = course.goalIndex;
    const segs = course.segments;
    const p = race.player;
    const camZ = p.z - PLAYER_DZ;
    const baseI = Math.max(0, Math.floor(camZ / SEGMENT_LENGTH));
    const base = segs[baseI];
    const basePct = (camZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const pSeg = segs[Math.min(segs.length - 1, Math.floor(p.z / SEGMENT_LENGTH))];
    const pPct = (p.z % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerY = pSeg.y1 + (pSeg.y2 - pSeg.y1) * pPct;
    const camY = playerY + CAM_H;
    const camXRoad = p.x * FOLLOW;
    const camX = camXRoad * ROAD_W;

    // sky + parallax
    this.bgOffset += pSeg.curve * race.speedPct * 0.0025 * (race.state === 'race' ? 1 : 0);
    c.fillStyle = this.skyGrad;
    c.fillRect(0, 0, W, this.HZ + 2);
    this.drawSun(race.courseId, t);
    const lw = this.bgLW;
    let off = ((this.bgOffset * lw) % lw + lw) % lw;
    const by = this.HZ - this.bgLH + 2 + clamp(-playerY * 0.02, -10, 10);
    c.drawImage(this.bgLayer, -off, by, lw, this.bgLH);
    if (lw - off < W) c.drawImage(this.bgLayer, lw - off, by, lw, this.bgLH);
    c.fillStyle = pal.grass[0];
    c.fillRect(0, this.HZ, W, H - this.HZ);

    // project & draw road from near to far
    let maxy = H;
    let x = 0;
    let dx = -(base.curve * CURVE_K * basePct);
    const drawn = this._drawn || (this._drawn = []);
    drawn.length = 0;
    for (let n = 0; n < DRAW; n++) {
      const i = baseI + n;
      if (i >= segs.length) break;
      const s = segs[i];
      if (!s.p1) {
        s.p1 = {};
        s.p2 = {};
      }
      const z1 = i * SEGMENT_LENGTH;
      this.project(s.p1, camX - x, camY, camZ, 0, s.y1, z1);
      this.project(s.p2, camX - x - dx, camY, camZ, 0, s.y2, z1 + SEGMENT_LENGTH);
      x += dx;
      dx += s.curve * CURVE_K;
      s.clip = maxy;
      if (s.p1.cz <= DEPTH || s.p2.y >= s.p1.y || s.p2.y >= maxy) continue;
      this.drawSegment(s, pal, race.courseId);
      maxy = s.p2.y;
      drawn.push(s);
    }

    // sprites from far to near
    const jump = race.jump > 0 ? Math.abs(Math.sin(race.jump * Math.PI * 3)) * 0.35 * (race.jump / 0.9) : 0;
    const rivalsBySeg = new Map();
    for (const r of race.rivals) {
      if (r.z < p.z + 700) continue; // next to / just ahead of / behind the player: would fill the screen near the camera
      const ri = Math.floor(r.z / SEGMENT_LENGTH);
      if (ri >= baseI && ri < baseI + DRAW) rivalsBySeg.set(ri, (rivalsBySeg.get(ri) || []).concat(r));
    }
    for (let k = drawn.length - 1; k >= 0; k--) {
      const s = drawn[k];
      const r = s.p1.r;
      const sx = s.p1.x;
      const sy = s.p1.y;
      const clip = s.clip;
      for (const d of s.deco) {
        let id = d.id;
        let frame = 0;
        let xx = d.x;
        let lift = 0;
        const def = SPRITES[id];
        if (!def) continue;
        if (d.event) {
          const ev = race.events[0];
          if (id === 'cow') {
            xx = ev && ev.fired ? race.cowX : -2.6;
            frame = ev && ev.fired && ev.t < 6 ? Math.floor(t * 4) % 2 : 0;
          } else if (id === 'whale') {
            frame = ev && ev.fired && ev.t < 5 ? (Math.floor(ev.t * 1.4) % 2 === 0 ? 1 : 0) : 0;
            lift = ev && ev.fired && ev.t < 5 ? Math.abs(Math.sin(ev.t * 1.2)) * r * this.SX * 0.25 : 0;
          } else if (id === 'snowmanBig') {
            frame = ev && ev.fired && ev.t < 6 ? Math.floor(ev.t * 2) % 2 : 0;
          }
        } else if (def.animal) {
          lift = jump * r * this.SX + (id === 'rabbit' ? Math.max(0, Math.sin(t * 3 + d.t)) * 0.12 * r * this.SX : 0);
        } else if (id === 'balloons') {
          lift = Math.sin(t * 2 + d.t) * 0.05 * r * this.SX;
        }
        this.sprite(id, frame, sx + r * xx * this.SX, sy, r, def.world, lift, clip);
      }
      for (const ob of s.obstacles) {
        const hop = (ob.hop > 0 ? Math.sin((1 - ob.hop / 0.6) * Math.PI) * 0.35 : 0) + jump * 0.6;
        this.sprite(ob.id, 0, sx + r * ob.x * this.SX, sy, r, SPRITES[ob.id].world, hop * r * this.SX, clip);
      }
      for (const it of s.items) {
        if (it.taken) continue;
        const bob = (0.28 + Math.sin(t * 4 + s.index) * 0.06) * r * this.SX;
        const pulse = 1 + Math.sin(t * 6 + s.index) * 0.07;
        this.sprite(it.id, 0, sx + r * it.x * this.SX, sy, r, SPRITES[it.id].world * pulse, bob, clip);
      }
      const rv = rivalsBySeg.get(s.index);
      if (rv) {
        for (const ri of rv) {
          const cheer = ri.cheer > 0 || race.jump > 0;
          const hop = (ri.hop > 0 ? Math.sin((1 - ri.hop / 0.5) * Math.PI) * 0.4 : 0) + (cheer ? Math.abs(Math.sin(t * 8)) * 0.12 : 0);
          // interpolate within the segment for smoothness
          const f = (ri.z % SEGMENT_LENGTH) / SEGMENT_LENGTH;
          const rx = s.p1.x + (s.p2.x - s.p1.x) * f;
          const ry = s.p1.y + (s.p2.y - s.p1.y) * f;
          const rr = s.p1.r + (s.p2.r - s.p1.r) * f;
          this.sprite('kart-' + ri.animal + (cheer ? '-cheer' : ''), 0, rx + rr * ri.x * this.SX, ry, rr, 0.75, hop * rr * this.SX, clip);
        }
      }
    }

    this.drawPlayer(race, t, camXRoad);
    this.drawParticles(race, t);
    this.drawHud(race, t);
  }

  drawSun(courseId, t) {
    const c = this.c;
    const r = Math.min(this.W, this.H) * 0.07;
    const L = this.hudLayout();
    const x = this.W - r * 2.2 - this.safe.right;
    const y = Math.min(this.HZ - r * 2, L.countY + L.icon * 0.7 + r * 1.8);
    c.save();
    c.translate(x, y);
    c.rotate(t * 0.15);
    c.fillStyle = 'rgba(255,224,102,0.45)';
    for (let i = 0; i < 10; i++) {
      c.rotate(Math.PI / 5);
      c.beginPath();
      c.moveTo(r * 1.15, -r * 0.2);
      c.lineTo(r * 1.6, 0);
      c.lineTo(r * 1.15, r * 0.2);
      c.fill();
    }
    c.restore();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = '#ffe066';
    c.fill();
    c.fillStyle = '#5a3d2b';
    c.beginPath();
    c.arc(x - r * 0.35, y - r * 0.1, r * 0.11, 0, Math.PI * 2);
    c.arc(x + r * 0.35, y - r * 0.1, r * 0.11, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x, y + r * 0.12, r * 0.4, 0.2, Math.PI - 0.2);
    c.lineWidth = Math.max(1.5, r * 0.09);
    c.strokeStyle = '#5a3d2b';
    c.lineCap = 'round';
    c.stroke();
    c.fillStyle = 'rgba(255,120,120,0.45)';
    c.beginPath();
    c.ellipse(x - r * 0.6, y + r * 0.25, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
    c.ellipse(x + r * 0.6, y + r * 0.25, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
    c.fill();
  }

  drawSegment(s, pal, courseId) {
    const c = this.c;
    const { W } = this;
    const p1 = s.p1;
    const p2 = s.p2;
    const alt = Math.floor(s.index / 3) % 2;
    c.fillStyle = pal.grass[alt];
    c.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    if (courseId === 'sea') {
      const e1 = p1.x + p1.w * 1.7;
      const e2 = p2.x + p2.w * 1.7;
      this.poly(e1, p1.y + 1, W + 2, p1.y + 1, W + 2, p2.y, e2, p2.y, pal.water[alt]);
      if (alt) this.poly(e1, p1.y + 1, e1 + p1.w * 0.12, p1.y + 1, e2 + p2.w * 0.12, p2.y, e2, p2.y, '#ffffff');
    }
    const rw1 = p1.w * 1.14;
    const rw2 = p2.w * 1.14;
    const rc = pal.rumble[alt];
    this.poly(p1.x - rw1, p1.y + 1, p1.x - p1.w, p1.y + 1, p2.x - p2.w, p2.y, p2.x - rw2, p2.y, rc);
    this.poly(p1.x + rw1, p1.y + 1, p1.x + p1.w, p1.y + 1, p2.x + p2.w, p2.y, p2.x + rw2, p2.y, rc);
    this.poly(p1.x - p1.w, p1.y + 1, p1.x + p1.w, p1.y + 1, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, pal.road[alt]);
    if (s.boost) {
      const b = s.boost;
      const col = BOOST_COLS[b.part % 3];
      const l1 = p1.x + (b.x - b.w / 2) * p1.w;
      const r1 = p1.x + (b.x + b.w / 2) * p1.w;
      const l2 = p2.x + (b.x - b.w / 2) * p2.w;
      const r2 = p2.x + (b.x + b.w / 2) * p2.w;
      this.poly(l1, p1.y + 1, r1, p1.y + 1, r2, p2.y, l2, p2.y, col);
      // chevron arrow
      const m1 = p1.x + b.x * p1.w;
      const m2 = p2.x + b.x * p2.w;
      const aw1 = Math.min(b.w, 0.7) * 0.35 * p1.w;
      const aw2 = Math.min(b.w, 0.7) * 0.35 * p2.w;
      const ym = (p1.y + p2.y) / 2;
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath();
      c.moveTo(m1 - aw1, p1.y);
      c.lineTo((m1 + m2) / 2, ym);
      c.lineTo(m1 + aw1, p1.y);
      c.lineTo(m1 + aw1 * 0.5, p1.y);
      c.lineTo(m2, p2.y + (p1.y - p2.y) * 0.1);
      c.lineTo(m1 - aw1 * 0.5, p1.y);
      c.closePath();
      c.fill();
      void aw2;
    } else if (s.index === START_LINE || s.index === this.goalIndex) {
      this.checker(p1, p2);
    } else if (alt) {
      const lw1 = p1.w * 0.035;
      const lw2 = p2.w * 0.035;
      for (const f of [-0.33, 0.33]) {
        const a1 = p1.x + f * p1.w;
        const a2 = p2.x + f * p2.w;
        this.poly(a1 - lw1, p1.y + 1, a1 + lw1, p1.y + 1, a2 + lw2, p2.y, a2 - lw2, p2.y, pal.lane);
      }
    }
  }

  checker(p1, p2) {
    const n = 10;
    for (let row = 0; row < 2; row++) {
      const ya = p1.y + (p2.y - p1.y) * (row / 2);
      const yb = p1.y + (p2.y - p1.y) * ((row + 1) / 2);
      const xa = p1.x + (p2.x - p1.x) * (row / 2);
      const xb = p1.x + (p2.x - p1.x) * ((row + 1) / 2);
      const wa = p1.w + (p2.w - p1.w) * (row / 2);
      const wb = p1.w + (p2.w - p1.w) * ((row + 1) / 2);
      for (let k = 0; k < n; k++) {
        const col = (k + row) % 2 ? '#ffffff' : '#3d2c3e';
        const f0 = -1 + (2 * k) / n;
        const f1 = -1 + (2 * (k + 1)) / n;
        this.poly(xa + f0 * wa, ya + 1, xa + f1 * wa, ya + 1, xb + f1 * wb, yb, xb + f0 * wb, yb, col);
      }
    }
  }

  drawPlayer(race, t, camXRoad) {
    const p = race.player;
    const c = this.c;
    const x = this.W / 2 + (p.x - camXRoad) * this.SX;
    const y = this.HZ + this.SY;
    const w = this.carW;
    let lift = 0;
    let rot = 0;
    if (p.bump > 0) {
      const k = p.bump / 0.6;
      lift = Math.abs(Math.sin(k * Math.PI * 2)) * w * 0.18 * k;
      rot = Math.sin(k * Math.PI * 4) * 0.12 * k;
    } else if (race.state !== 'countdown') {
      lift = Math.abs(Math.sin(t * 9)) * w * 0.012 * Math.min(1, race.speedPct) + (p.offroad ? Math.abs(Math.sin(t * 22)) * w * 0.02 : 0);
    }
    rot += (this.steer || 0) * 0.06;
    if (race.state === 'goal') lift = Math.abs(Math.sin(race.stateTime * 5)) * w * 0.12;
    // boost rainbow trail
    if (p.boost > 0) {
      const cols = ['#ff5a6e', '#ffd23f', '#5cc75c', '#4aa8ff', '#a77bff'];
      const tw = w * 0.85;
      for (let i = 0; i < cols.length; i++) {
        c.fillStyle = cols[i];
        c.globalAlpha = 0.75;
        const bx = x - tw / 2 + (i * tw) / cols.length;
        c.fillRect(bx, y - w * 0.05, tw / cols.length + 1, this.H - y + w * 0.05);
      }
      c.globalAlpha = 1;
    }
    const frame = race.vehicle === 'dino' ? Math.floor(t * 6) % 4 : 0;
    const id = 'rear-' + race.vehicle + (frame ? '-' + frame : '');
    this.sprite(id, 0, x, y, 1, 0, lift, 0, rot, w);
    this.carX = x;
    this.carY = y - w * 0.5;
    if (p.boost > 0) this.bubble(x, y - w * 1.15 - lift, 'びゅーん!', t);
    // dust when off road
    if (p.offroad && race.state === 'race' && Math.random() < 0.4) {
      const dust = race.courseId === 'snow' ? '#ffffff' : race.courseId === 'sea' ? '#ffe9b0' : '#c9f0a8';
      this.addParticle(x + (Math.random() - 0.5) * w * 0.8, y - 4, (Math.random() - 0.5) * 40, -40 - Math.random() * 40, dust, 6 + Math.random() * 5, 0.6, 'dot');
    }
  }

  bubble(x, y, text, t) {
    const c = this.c;
    const size = Math.max(22, Math.min(this.W, this.H) * 0.08);
    c.save();
    c.translate(x, y);
    c.rotate(Math.sin(t * 6) * 0.05);
    c.font = `900 ${size}px "Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Kosugi Maru", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = size * 0.3;
    c.strokeStyle = '#ffffff';
    c.strokeText(text, 0, 0);
    c.lineWidth = size * 0.12;
    c.strokeStyle = '#ff5a8a';
    c.strokeText(text, 0, 0);
    c.fillStyle = '#ffd23f';
    c.fillText(text, 0, 0);
    c.restore();
  }

  // ---------- particles ----------
  addParticle(x, y, vx, vy, color, size, life, kind = 'dot', g = 120) {
    if (this.particles.length > 320) return;
    this.particles.push({ x, y, vx, vy, color, size, life, max: life, kind, g, rot: Math.random() * 6 });
  }

  burst(x, y, n, colors, speed = 220, kind = 'star') {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - 60, colors[i % colors.length], 5 + Math.random() * 6, 0.7 + Math.random() * 0.4, kind);
    }
  }

  flyTo(id, fromX, fromY, slot) {
    this.flyers.push({ id, x0: fromX, y0: fromY, slot, t: 0 });
  }

  confetti(n = 80) {
    const cols = ['#ff5a6e', '#ffd23f', '#5cc75c', '#4aa8ff', '#a77bff', '#ff9f1c'];
    for (let i = 0; i < n; i++) {
      this.addParticle(Math.random() * this.W, -20 - Math.random() * this.H * 0.4, (Math.random() - 0.5) * 60, 60 + Math.random() * 80, cols[i % cols.length], 7 + Math.random() * 6, 4 + Math.random() * 2, 'paper', 30);
    }
  }

  firework() {
    const cols = [['#ff5a6e', '#ffd23f'], ['#4aa8ff', '#ffffff'], ['#a77bff', '#ff9fd1'], ['#5cc75c', '#ffd23f']][Math.floor(Math.random() * 4)];
    const x = this.W * (0.15 + Math.random() * 0.7);
    const y = this.H * (0.12 + Math.random() * 0.25);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const s = 120 + Math.random() * 30;
      this.addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, cols[i % 2], 5, 1.4, 'star', 50);
    }
  }

  drawParticles(race, t) {
    const c = this.c;
    const dt = this.dt || 1 / 60;
    // snow flakes
    if (this.flakes.length) {
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of this.flakes) {
        f.y += f.s * dt;
        f.x += Math.sin(t + f.r * 3) * 12 * dt;
        if (f.y > this.H) {
          f.y = -5;
          f.x = Math.random() * this.W;
        }
        c.beginPath();
        c.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.life -= dt;
      if (q.life <= 0 || q.y > this.H + 40) {
        ps.splice(i, 1);
        continue;
      }
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += dt * 4;
      c.globalAlpha = Math.min(1, (q.life / q.max) * 2);
      c.fillStyle = q.color;
      if (q.kind === 'paper') {
        c.save();
        c.translate(q.x + Math.sin(q.rot) * 8, q.y);
        c.rotate(q.rot);
        c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        c.restore();
      } else if (q.kind === 'star') {
        this.starPath(q.x, q.y, q.size, q.rot);
        c.fill();
      } else {
        c.beginPath();
        c.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  starPath(x, y, r, rot) {
    const c = this.c;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = rot + (i * Math.PI) / 5;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  // ---------- HUD ----------
  hudLayout() {
    const top = this.safe.top + 10;
    const left = this.safe.left + 14;
    const right = this.W - this.safe.right - 96;
    const icon = Math.max(30, Math.min(48, Math.min(this.W, this.H) * 0.1));
    return { top, left, right, icon, barY: top + 18, countY: top + 44 + icon / 2 };
  }

  slotPos(slot) {
    const L = this.hudLayout();
    return { x: L.left + L.icon / 2 + slot * (L.icon * 2.6), y: L.countY };
  }

  drawHud(race, t) {
    const c = this.c;
    const L = this.hudLayout();
    // progress track
    const x0 = L.left + 8;
    const x1 = Math.max(x0 + 100, L.right - 30);
    const y = L.barY;
    rrect(c, x0 - 6, y - 12, x1 - x0 + 12, 24, 12);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#3d2c3e';
    c.stroke();
    const pr = race.progress;
    if (pr > 0.01) {
      const g = c.createLinearGradient(x0, 0, x1, 0);
      ['#ff5a6e', '#ff9f1c', '#ffd23f', '#5cc75c', '#4aa8ff', '#a77bff'].forEach((col, i) => g.addColorStop(i / 5, col));
      rrect(c, x0, y - 6, (x1 - x0) * pr, 12, 6);
      c.fillStyle = g;
      c.fill();
    }
    // flag at the end
    this.flag(x1 + 12, y + 4, 26, t);
    // the player's vehicle on the track
    const iw = 46;
    this.sprite('front-' + race.vehicle, 0, x0 + (x1 - x0) * pr, y + iw * 0.45, 1, 0, Math.abs(Math.sin(t * 6)) * 3, 0, 0, iw);

    // counters: star + fruit icons with numbers
    const fruitsDef = race.course.def.fruits;
    const items = [['star', race.stars]];
    for (const f of fruitsDef) items.push([f, race.fruits[f] || 0]);
    items.forEach(([id, n], slot) => {
      const pos = this.slotPos(slot);
      const flash = this.hudPulse && this.hudPulse[id] > 0 ? 1 + this.hudPulse[id] * 0.5 : 1;
      rrect(c, pos.x - L.icon * 0.65, pos.y - L.icon * 0.62, L.icon * 2.3, L.icon * 1.24, L.icon * 0.62);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fill();
      this.sprite(id, 0, pos.x, pos.y + L.icon * 0.5 * flash, 1, 0, 0, 0, 0, L.icon * flash);
      c.font = `900 ${Math.round(L.icon * 0.72)}px "Hiragino Maru Gothic ProN", system-ui, sans-serif`;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 5;
      c.strokeStyle = '#ffffff';
      c.strokeText(String(n), pos.x + L.icon * 0.6, pos.y + 2);
      c.fillStyle = '#3d2c3e';
      c.fillText(String(n), pos.x + L.icon * 0.6, pos.y + 2);
    });
    if (this.hudPulse) for (const k in this.hudPulse) this.hudPulse[k] = Math.max(0, this.hudPulse[k] - (this.dt || 0.016) * 3);

    // flying collected items
    const dt = this.dt || 1 / 60;
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt / 0.6;
      if (f.t >= 1) {
        this.flyers.splice(i, 1);
        this.hudPulse = this.hudPulse || {};
        this.hudPulse[f.id] = 1;
        continue;
      }
      const to = this.slotPos(f.slot);
      const e = 1 - Math.pow(1 - f.t, 3);
      const fx = f.x0 + (to.x - f.x0) * e;
      const fy = f.y0 + (to.y - f.y0) * e - Math.sin(f.t * Math.PI) * 60;
      const size = L.icon * (1.6 - 0.6 * e);
      this.sprite(f.id, 0, fx, fy + size / 2, 1, 0, 0, 0, 0, size);
    }

    // countdown traffic light
    if (race.state === 'countdown') this.trafficLight(race.stateTime, t);
    else if (race.state === 'race' && race.stateTime < 0.8) this.trafficLight(3 + race.stateTime, t);

    // steering hint hands for the first seconds
    if (race.state === 'countdown' || (race.state === 'race' && race.stateTime < 5)) {
      const a = race.state === 'countdown' ? 0.85 : 0.85 * (1 - race.stateTime / 5);
      const wob = Math.sin(t * 5) * 8;
      c.globalAlpha = a;
      // Point at the actual bottom controls instead of obscuring the road.
      this.arrow(this.safe.left + 56 + wob * -1, this.H - this.safe.bottom - 135, -1);
      this.arrow(this.W - this.safe.right - 56 + wob, this.H - this.safe.bottom - 135, 1);
      c.globalAlpha = 1;
    }
  }

  arrow(x, y, dir) {
    const c = this.c;
    const s = Math.min(46, this.W * 0.11);
    c.save();
    c.translate(x, y);
    c.scale(dir, 1);
    c.beginPath();
    c.arc(0, 0, s, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#ff5a8a';
    c.stroke();
    c.beginPath();
    c.moveTo(s * 0.5, 0);
    c.lineTo(-s * 0.1, -s * 0.5);
    c.lineTo(-s * 0.1, -s * 0.2);
    c.lineTo(-s * 0.55, -s * 0.2);
    c.lineTo(-s * 0.55, s * 0.2);
    c.lineTo(-s * 0.1, s * 0.2);
    c.lineTo(-s * 0.1, s * 0.5);
    c.closePath();
    c.fillStyle = '#ff5a8a';
    c.fill();
    c.restore();
  }

  flag(x, y, s, t) {
    const c = this.c;
    c.strokeStyle = '#3d2c3e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - s * 0.5, y + s * 0.6);
    c.lineTo(x - s * 0.5, y - s);
    c.stroke();
    const wave = Math.sin(t * 4) * 2;
    const cell = s / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        c.fillStyle = (i + j) % 2 ? '#ffffff' : '#3d2c3e';
        c.fillRect(x - s * 0.5 + i * cell, y - s + j * cell + (i % 2 ? wave : 0), cell + 0.5, cell + 0.5);
      }
    }
    c.strokeRect(x - s * 0.5, y - s, s, cell * 3);
  }

  trafficLight(st, t) {
    const c = this.c;
    const r = Math.min(this.W, this.H) * 0.075;
    const w = r * 7.4;
    const h = r * 2.8;
    const x = this.W / 2 - w / 2;
    const y = this.HZ - h * 1.4;
    const fade = st > 3 ? Math.max(0, 1 - (st - 3) / 0.8) : 1;
    c.globalAlpha = fade;
    rrect(c, x, y, w, h, h / 2);
    c.fillStyle = '#4a4458';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#ffffff';
    c.stroke();
    const on = Math.floor(st); // lamps light up one per second, then all turn green
    for (let i = 0; i < 3; i++) {
      const lit = st >= 3 || i <= on;
      c.beginPath();
      c.arc(x + h / 2 + i * (w - h) / 2, y + h / 2, r, 0, Math.PI * 2);
      c.fillStyle = lit ? (st >= 3 ? '#5cdb6a' : '#ff5a5a') : '#2d2836';
      c.fill();
      if (lit) {
        c.beginPath();
        c.arc(x + h / 2 + i * (w - h) / 2 - r * 0.3, y + h / 2 - r * 0.3, r * 0.25, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }
}
