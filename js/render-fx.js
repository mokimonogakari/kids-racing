// Screen effects: weather, vignette, speed blur, bloom, exhaust, soft shadows.
// All functions take the Renderer `r` (r.c, r.W, r.H, r.dpr, r.HZ, r.quality, r.dt).
// Heavy pieces are pre-rendered once into small offscreen canvases and reused.

const TAU = Math.PI * 2;

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w));
  cv.height = Math.max(1, Math.round(h));
  return cv;
}

function fx(r) {
  if (!r._fx) r._fx = { parts: [], blooms: {}, vignette: null, vigKey: '', shadow: null, puff: null, flame: null, lastT: 0 };
  return r._fx;
}

function q(r) {
  const v = r.quality;
  return v === 0 || v === 1 || v === 2 ? v : 2;
}

// ---------- cached sprites ----------
function radialSprite(size, stops) {
  const cv = makeCanvas(size, size);
  if (!cv) return null;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

function bloomSprite(store, color) {
  if (!store[color]) {
    store[color] = radialSprite(128, [
      [0, color],
      [0.25, color],
      [1, 'rgba(0,0,0,0)'],
    ]);
  }
  return store[color];
}

function shadowSprite(f) {
  if (!f.shadow) f.shadow = radialSprite(128, [[0, 'rgba(30,20,40,0.55)'], [0.55, 'rgba(30,20,40,0.32)'], [1, 'rgba(30,20,40,0)']]);
  return f.shadow;
}

function puffSprite(f) {
  if (!f.puff) f.puff = radialSprite(64, [[0, 'rgba(255,255,255,0.75)'], [0.5, 'rgba(235,235,245,0.35)'], [1, 'rgba(230,230,240,0)']]);
  return f.puff;
}

function flameSprite(f) {
  if (!f.flame) {
    const cv = makeCanvas(48, 96);
    if (!cv) return null;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(150,220,255,0.9)');
    g.addColorStop(0.6, 'rgba(80,140,255,0.55)');
    g.addColorStop(1, 'rgba(80,120,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(24, 0);
    c.quadraticCurveTo(46, 30, 30, 96);
    c.lineTo(18, 96);
    c.quadraticCurveTo(2, 30, 24, 0);
    c.fill();
    f.flame = cv;
  }
  return f.flame;
}

// ---------- public API ----------

/** Additive glow dot (lamps, tail lights, headlights). */
export function drawBloom(r, x, y, radius, color = 'rgba(255,230,160,1)', alpha = 1) {
  if (radius <= 0 || alpha <= 0) return;
  const f = fx(r);
  const s = bloomSprite(f.blooms, color);
  if (!s) return;
  const c = r.c;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  c.restore();
}

/** Soft elliptical contact shadow. */
export function drawSoftShadow(r, x, y, w, h, alpha = 1) {
  if (w <= 0 || h <= 0 || alpha <= 0) return;
  const s = shadowSprite(fx(r));
  if (!s) return;
  const c = r.c;
  c.save();
  c.globalAlpha = Math.min(1, alpha);
  c.drawImage(s, x - w / 2, y - h / 2, w, h);
  c.restore();
}

/** Darkened screen corners (cached per size). */
export function drawVignette(r, strength = 1) {
  const f = fx(r);
  const key = `${Math.round(r.W)}x${Math.round(r.H)}`;
  if (f.vigKey !== key) {
    f.vigKey = key;
    const w = Math.round(r.W / 2) || 1;
    const h = Math.round(r.H / 2) || 1;
    const cv = makeCanvas(w, h);
    if (cv) {
      const c = cv.getContext('2d');
      const rad = Math.hypot(w, h) / 2;
      const g = c.createRadialGradient(w / 2, h * 0.55, rad * 0.45, w / 2, h * 0.55, rad * 1.05);
      g.addColorStop(0, 'rgba(20,10,40,0)');
      g.addColorStop(0.7, 'rgba(20,10,40,0.12)');
      g.addColorStop(1, 'rgba(20,10,40,0.38)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    f.vignette = cv;
  }
  if (!f.vignette) return;
  const c = r.c;
  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, strength));
  c.drawImage(f.vignette, 0, 0, r.W, r.H);
  c.restore();
}

/** Radial streaks around the edges at high speed. pct: speed ratio (1 = top speed). */
export function drawSpeedBlur(r, pct, boost = false, t = 0) {
  const k = Math.max(0, Math.min(1, (pct - 0.75) / 0.6)) + (boost ? 0.45 : 0);
  if (k <= 0.02 || q(r) === 0) return;
  const c = r.c;
  const cx = r.W / 2;
  const cy = (r.HZ || r.H * 0.4) + 10;
  const n = q(r) === 2 ? 26 : 14;
  const maxR = Math.hypot(r.W, r.H) * 0.62;
  const time = t || performance.now() / 1000;
  c.save();
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    // deterministic pseudo-random per streak, re-rolled ~8 times a second
    const seed = Math.sin((i + 1) * 91.7 + Math.floor(time * 8) * 13.1) * 43758.5;
    const rnd = seed - Math.floor(seed);
    const a = (i / n) * TAU + rnd * 0.4;
    const r0 = maxR * (0.62 + rnd * 0.2);
    const len = maxR * (0.12 + 0.22 * k) * (0.6 + rnd * 0.6);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    c.strokeStyle = boost ? `rgba(255,240,200,${0.22 * k})` : `rgba(255,255,255,${0.2 * k})`;
    c.lineWidth = 1.5 + rnd * 2.5;
    c.beginPath();
    c.moveTo(cx + ca * r0, cy + sa * r0);
    c.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len));
    c.stroke();
  }
  c.restore();
}

/** Exhaust haze; blue flame while boosting. (x, y) = pipe position, scale ≈ car width / 100. */
export function drawExhaust(r, x, y, scale = 1, boost = false, t = 0) {
  const f = fx(r);
  const c = r.c;
  const puff = puffSprite(f);
  const time = t || performance.now() / 1000;
  if (puff && q(r) > 0) {
    const n = q(r) === 2 ? 4 : 2;
    c.save();
    for (let i = 0; i < n; i++) {
      const ph = (time * 2.2 + i / n) % 1;
      const s = (10 + ph * 26) * scale;
      c.globalAlpha = (1 - ph) * (boost ? 0.25 : 0.4);
      c.drawImage(puff, x - s / 2 + Math.sin(time * 5 + i) * 3 * scale, y + ph * 14 * scale - s / 2, s, s);
    }
    c.restore();
  }
  if (boost) {
    const fl = flameSprite(f);
    if (!fl) return;
    const flick = 0.8 + 0.2 * Math.sin(time * 40) + 0.1 * Math.sin(time * 23);
    const w = 16 * scale;
    const h = 34 * scale * flick;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.drawImage(fl, x - w / 2, y - 2 * scale, w, h);
    c.restore();
    drawBloom(r, x, y + 6 * scale, 22 * scale, 'rgba(120,180,255,1)', 0.6);
  }
}

// ---------- weather ----------
const WEATHER = {
  meadow: { kind: 'petal', n: [0, 14, 26], colors: ['#ffd1e8', '#ffffff', '#ffe9a8', '#ffc2d6'] },
  sea: { kind: 'spray', n: [0, 10, 18], colors: ['#ffffff', '#dff4ff'] },
  snow: { kind: 'snow', n: [10, 34, 60], colors: ['#ffffff'] },
  city: { kind: 'firefly', n: [4, 12, 20], colors: ['#fff6a8', '#c8ffb0', '#ffe08a'] },
};

function spawn(p, r, kind, colors, top) {
  p.kind = kind;
  p.x = Math.random() * r.W;
  p.y = top ? -10 - Math.random() * 40 : Math.random() * r.H;
  p.z = 0.4 + Math.random() * 0.8; // depth: size & speed
  p.ph = Math.random() * TAU;
  p.col = colors[(Math.random() * colors.length) | 0];
  p.life = 1;
  if (kind === 'spray') {
    p.y = r.H * (0.55 + Math.random() * 0.45);
    p.life = 0.6 + Math.random() * 0.6;
  }
  if (kind === 'firefly') p.y = (r.HZ || r.H * 0.4) + Math.random() * (r.H - (r.HZ || r.H * 0.4));
  return p;
}

/** Ambient particles per course. Call once per frame after the world, before the HUD. */
export function drawWeather(r, race, t, courseId, night = false) {
  const def = WEATHER[courseId] || (night ? WEATHER.city : WEATHER.meadow);
  const f = fx(r);
  const want = def.n[q(r)];
  const parts = f.parts;
  if (f.kind !== def.kind) {
    parts.length = 0;
    f.kind = def.kind;
  }
  while (parts.length < want) parts.push(spawn({}, r, def.kind, def.colors, false));
  if (parts.length > want) parts.length = want;
  const dt = Math.min(0.05, r.dt || 1 / 60);
  const pct = race ? Math.max(0, Math.min(1.5, race.speedPct || 0)) : 0;
  const steer = race && race.player ? race.player.steer || 0 : 0;
  const c = r.c;
  c.save();
  for (const p of parts) {
    p.ph += dt * 3;
    if (p.kind === 'snow') {
      p.y += (40 + 50 * p.z + 160 * pct * p.z) * dt;
      p.x += (Math.sin(p.ph) * 18 - steer * 90 * pct) * p.z * dt;
      // flakes fly outward from the centre when driving fast
      p.x += (p.x - r.W / 2) * 0.6 * pct * dt;
      const s = 1.6 + 2.6 * p.z;
      c.globalAlpha = 0.85;
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(p.x, p.y, s, 0, TAU);
      c.fill();
    } else if (p.kind === 'petal') {
      p.y += (18 + 30 * p.z) * dt;
      p.x += (Math.sin(p.ph * 0.7) * 30 - 60 * pct * p.z - steer * 70 * pct) * dt;
      const s = 3 + 3 * p.z;
      c.globalAlpha = 0.8;
      c.fillStyle = p.col;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.ph);
      c.scale(1, 0.45 + 0.4 * Math.abs(Math.sin(p.ph)));
      c.beginPath();
      c.ellipse(0, 0, s, s * 0.6, 0, 0, TAU);
      c.fill();
      c.restore();
    } else if (p.kind === 'spray') {
      p.life -= dt;
      p.y -= (20 + 30 * p.z) * dt;
      p.x += (p.x < r.W / 2 ? -1 : 1) * 40 * pct * dt;
      c.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.7;
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(p.x, p.y, 1.5 + 2 * p.z, 0, TAU);
      c.fill();
      if (p.life <= 0) spawn(p, r, p.kind, def.colors, false);
      continue;
    } else if (p.kind === 'firefly') {
      p.x += Math.cos(p.ph * 0.5) * 14 * dt - steer * 40 * pct * dt;
      p.y += Math.sin(p.ph * 0.8) * 10 * dt + 30 * pct * p.z * dt;
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(p.ph * 0.9));
      drawBloom(r, p.x, p.y, 7 + 6 * p.z, 'rgba(255,240,150,1)', glow * 0.7);
      c.globalAlpha = glow;
      c.fillStyle = p.col;
      c.beginPath();
      c.arc(p.x, p.y, 1.4 + p.z, 0, TAU);
      c.fill();
    }
    if (p.y > r.H + 12 || p.x < -30 || p.x > r.W + 30 || p.y < -60) spawn(p, r, p.kind, def.colors, p.kind !== 'firefly');
  }
  c.restore();
}

/** Drop cached sprites (e.g. after a resize). */
export function resetFx(r) {
  if (r._fx) {
    r._fx.vigKey = '';
    r._fx.parts.length = 0;
  }
}
