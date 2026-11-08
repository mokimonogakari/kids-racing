// Sky, celestial bodies, clouds and parallax background layers.
// Everything heavy is pre-rendered once per course/size into offscreen canvases.
//
//   const cache = buildSky(r, courseId, night);
//   drawSky(r, cache, race, t, camXOffset);   // camXOffset: the renderer's bgOffset (fraction of a layer width)
//
// r: Renderer (c, W, H, dpr, HZ, safe, quality?, hudLayout?).

const SKIES = {
  meadow: { sky: ['#5fc2ff', '#b8ebff', '#eefaff'], haze: '#e4f6ff' },
  sea: { sky: ['#43b8ff', '#aee8ff', '#effbff'], haze: '#e6f8ff' },
  snow: { sky: ['#86b8f6', '#d3e5ff', '#f6f9ff'], haze: '#eef4ff' },
  city: { sky: ['#070f2b', '#1a2457', '#3b3f80'], haze: '#4a4c8f' },
};

// Parallax factors for far / mid / near layers.
const PARALLAX = [0.18, 0.45, 0.8];
const OVER = 90; // extra width painted on each side (the world view may be tilted)

function mkCanvas(w, h, dpr) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * dpr));
  cv.height = Math.max(1, Math.ceil(h * dpr));
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  return { cv, c };
}

function makeRnd(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Tileable ridge height (0..1) built from integer-period sines. */
function ridge(u, periods, phase, peaky) {
  let y = 0;
  let n = 0;
  periods.forEach((p, k) => {
    y += Math.sin(u * p + phase * (k + 1)) / (k + 1);
    n += 1 / (k + 1);
  });
  y /= n;
  if (peaky) return Math.pow((y + 1) / 2, 1.7);
  return (y + 1) / 2;
}

function ridgePath(c, lw, lh, base, amp, periods, phase, peaky, step = 3) {
  c.beginPath();
  c.moveTo(0, lh);
  for (let x = 0; x <= lw; x += step) {
    const u = (x / lw) * Math.PI * 2;
    c.lineTo(x, lh - base - ridge(u, periods, phase, peaky) * amp);
  }
  c.lineTo(lw, lh);
  c.closePath();
}

function vgrad(c, y0, y1, stops) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  return g;
}

function puff(c, x, y, s, light, shade) {
  // soft, shaded cumulus: shadow lobes then lit lobes
  const lobes = [[0, 0, 1], [1.05, -0.45, 1.25], [2.15, -0.05, 1], [3.0, 0.2, 0.7], [-0.85, 0.2, 0.7]];
  c.fillStyle = shade;
  c.beginPath();
  for (const [dx, dy, r] of lobes) {
    c.moveTo(x + dx * s + r * s, y + dy * s + s * 0.18);
    c.arc(x + dx * s, y + dy * s + s * 0.18, r * s, 0, Math.PI * 2);
  }
  c.fill();
  c.fillStyle = light;
  c.beginPath();
  for (const [dx, dy, r] of lobes) {
    c.moveTo(x + dx * s - s * 0.08 + r * s * 0.92, y + dy * s - s * 0.06);
    c.arc(x + dx * s - s * 0.08, y + dy * s - s * 0.06, r * s * 0.92, 0, Math.PI * 2);
  }
  c.fill();
  // flat-ish base
  c.fillStyle = shade;
  c.fillRect(x - s * 1.2, y + s * 0.55, s * 4.6, s * 0.35);
}

function buildClouds(lw, lh, dpr, night, seed) {
  const { cv, c } = mkCanvas(lw, lh, dpr);
  if (night) return cv;
  const rnd = makeRnd(seed);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const s = lh * (0.035 + rnd() * 0.025);
    const x = ((i + 0.2 + rnd() * 0.5) / n) * lw;
    const y = lh * (0.2 + rnd() * 0.55);
    const draw = (xx) => puff(c, xx, y, s, 'rgba(255,255,255,0.96)', 'rgba(200,222,240,0.9)');
    draw(x);
    if (x + s * 4 > lw) draw(x - lw); // wrap
    if (x - s * 1.5 < 0) draw(x + lw);
  }
  return cv;
}

function windows(c, x, top, w, bottom, rnd, lit) {
  for (let wy = top + 6; wy < bottom - 5; wy += 9) {
    for (let wx = x + 4; wx < x + w - 7; wx += 8) {
      if (rnd() < lit) {
        c.fillStyle = rnd() < 0.82 ? '#ffe28a' : '#9fe0ff';
        c.fillRect(wx, wy, 4, 5);
      }
    }
  }
}

/** Build the 3 parallax layers for a course. Each is lw wide, lh tall, bottom = horizon. */
function buildLayers(courseId, night, lw, lh, dpr) {
  const L = [0, 1, 2].map(() => mkCanvas(lw, lh, dpr));
  const [far, mid, near] = L.map((o) => o.c);
  const rnd = makeRnd(courseId.length * 977 + 13);

  if (night || courseId === 'city') {
    // far: dim skyline silhouettes
    for (const [cc, col, hMul, lit, minW] of [
      [far, '#20285a', 0.42, 0.12, 30],
      [mid, '#1a2047', 0.28, 0.45, 22],
    ]) {
      let x = 0;
      while (x < lw) {
        const bw = Math.min(lw - x, minW + rnd() * 42);
        const bh = lh * (0.2 + rnd() * hMul);
        cc.fillStyle = col;
        cc.fillRect(x, lh - bh, bw - 2, bh);
        // rim light on the left edge
        cc.fillStyle = 'rgba(140,150,230,0.25)';
        cc.fillRect(x, lh - bh, 2, bh);
        if (rnd() < 0.25) {
          // antenna with a red light
          cc.fillStyle = col;
          cc.fillRect(x + bw / 2 - 1, lh - bh - 10, 2, 10);
          cc.fillStyle = '#ff6b7f';
          cc.fillRect(x + bw / 2 - 1.5, lh - bh - 12, 3, 3);
        }
        windows(cc, x, lh - bh, bw, lh, rnd, lit);
        x += bw;
      }
    }
    // near: low rooftops / park trees in deep silhouette
    near.fillStyle = '#141838';
    ridgePath(near, lw, lh, lh * 0.02, lh * 0.08, [6, 11], 0.9, false);
    near.fill();
    for (let x = 10; x < lw; x += 34 + rnd() * 30) {
      const r = lh * (0.035 + rnd() * 0.02);
      near.beginPath();
      near.arc(x, lh - lh * 0.07 - r * 0.6, r, 0, Math.PI * 2);
      near.fill();
    }
    return L.map((o) => o.cv);
  }

  if (courseId === 'snow') {
    // far: tall peaks, light from the left
    ridgePath(far, lw, lh, lh * 0.14, lh * 0.5, [3, 5, 8], 0.5, true, 2);
    far.save();
    far.clip();
    far.fillStyle = vgrad(far, lh * 0.1, lh, [[0, '#cfe0f6'], [1, '#a9c3e6']]);
    far.fillRect(0, 0, lw, lh);
    // shaded right faces: offset ridge, darker
    far.globalAlpha = 0.35;
    far.fillStyle = '#7f9fcf';
    ridgePath(far, lw, lh, lh * 0.14, lh * 0.5, [3, 5, 8], 0.5 + 0.06, true, 2);
    far.fill();
    far.globalAlpha = 1;
    // snow caps above a wobbly line
    far.fillStyle = '#ffffff';
    far.beginPath();
    far.moveTo(0, 0);
    for (let x = 0; x <= lw; x += 6) {
      const u = (x / lw) * Math.PI * 2;
      far.lineTo(x, lh * 0.55 + Math.sin(u * 23) * lh * 0.03 + Math.sin(u * 7) * lh * 0.04);
    }
    far.lineTo(lw, 0);
    far.closePath();
    far.fill();
    far.restore();
    // mid: pine forest band with snow
    mid.fillStyle = '#c3d6ee';
    ridgePath(mid, lw, lh, lh * 0.06, lh * 0.14, [4, 7], 1.7, false);
    mid.fill();
    for (let x = 0; x < lw; x += 9 + rnd() * 9) {
      const h = lh * (0.12 + rnd() * 0.1);
      const w = h * 0.45;
      const y = lh - lh * 0.06;
      for (const xx of [x, x - lw]) {
        mid.fillStyle = '#4f7f98';
        mid.beginPath();
        mid.moveTo(xx, y - h);
        mid.lineTo(xx + w / 2, y);
        mid.lineTo(xx - w / 2, y);
        mid.closePath();
        mid.fill();
        mid.fillStyle = '#ffffff';
        mid.beginPath();
        mid.moveTo(xx, y - h);
        mid.lineTo(xx + w * 0.18, y - h * 0.62);
        mid.lineTo(xx - w * 0.18, y - h * 0.62);
        mid.closePath();
        mid.fill();
      }
    }
    // near: soft snow drifts
    near.fillStyle = vgrad(near, lh * 0.8, lh, [[0, '#ffffff'], [1, '#e2ecf8']]);
    ridgePath(near, lw, lh, 0, lh * 0.1, [5, 9], 0.3, false);
    near.fill();
    return L.map((o) => o.cv);
  }

  if (courseId === 'sea') {
    // far: faint islands sitting on the horizon
    far.fillStyle = vgrad(far, lh * 0.55, lh, [[0, '#9fd2e3'], [1, '#bfe4ef']]);
    for (const [cx, w, h] of [[0.12, 0.16, 0.22], [0.48, 0.24, 0.3], [0.8, 0.12, 0.16]]) {
      const x = cx * lw;
      far.beginPath();
      far.moveTo(x - w * lw * 0.5, lh - lh * 0.16);
      far.quadraticCurveTo(x - w * lw * 0.2, lh - lh * (0.16 + h), x, lh - lh * (0.16 + h * 0.9));
      far.quadraticCurveTo(x + w * lw * 0.25, lh - lh * (0.16 + h * 0.7), x + w * lw * 0.5, lh - lh * 0.16);
      far.closePath();
      far.fill();
    }
    // sea band (in front of the islands)
    far.fillStyle = vgrad(far, lh * 0.84, lh, [[0, '#2fa7e0'], [1, '#56c6f0']]);
    far.fillRect(0, lh - lh * 0.16, lw, lh * 0.16);
    far.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < lw; x += 28 + rnd() * 30) {
      const y = lh - lh * (0.03 + rnd() * 0.11);
      far.fillRect(x, y, 10 + rnd() * 16, 1.5);
    }
    // a little sailboat
    const bx = lw * 0.66;
    const by = lh - lh * 0.12;
    far.fillStyle = '#ffffff';
    far.beginPath();
    far.moveTo(bx, by - 18);
    far.lineTo(bx + 11, by - 3);
    far.lineTo(bx, by - 3);
    far.closePath();
    far.fill();
    far.fillStyle = '#ff6b7f';
    far.fillRect(bx - 8, by - 3, 20, 4);
    // mid: green headlands
    mid.fillStyle = vgrad(mid, lh * 0.75, lh, [[0, '#6fd2c0'], [1, '#4fb8a4']]);
    ridgePath(mid, lw, lh, -lh * 0.02, lh * 0.12, [2, 5], 1.2, false);
    mid.fill();
    // near: dunes with palm silhouettes
    near.fillStyle = vgrad(near, lh * 0.85, lh, [[0, '#ffe7ad'], [1, '#f6d58c']]);
    ridgePath(near, lw, lh, -lh * 0.03, lh * 0.07, [3, 7], 2.2, false);
    near.fill();
    for (let i = 0; i < 4; i++) {
      const x = ((i + 0.35 + rnd() * 0.3) / 4) * lw;
      const h = lh * (0.22 + rnd() * 0.08);
      near.strokeStyle = '#a8794d';
      near.lineWidth = 3;
      near.beginPath();
      near.moveTo(x, lh);
      near.quadraticCurveTo(x + 6, lh - h * 0.5, x + 3, lh - h);
      near.stroke();
      near.fillStyle = '#3fae6b';
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.62;
        near.beginPath();
        near.ellipse(x + 3 + Math.cos(a) * h * 0.18, lh - h + Math.sin(a) * h * 0.08 + h * 0.05, h * 0.2, h * 0.05, a, 0, Math.PI * 2);
        near.fill();
      }
    }
    return L.map((o) => o.cv);
  }

  // meadow (default)
  // far: bluish mountains with atmospheric haze
  ridgePath(far, lw, lh, lh * 0.2, lh * 0.42, [2, 3, 7], 0.4, true, 2);
  far.save();
  far.clip();
  far.fillStyle = vgrad(far, lh * 0.2, lh, [[0, '#9fc6e6'], [1, '#c4e3f2']]);
  far.fillRect(0, 0, lw, lh);
  far.globalAlpha = 0.3;
  far.fillStyle = '#7fa8d4';
  ridgePath(far, lw, lh, lh * 0.2, lh * 0.42, [2, 3, 7], 0.46, true, 2);
  far.fill();
  far.restore();
  // mid: rolling green hills, lit tops
  ridgePath(mid, lw, lh, lh * 0.18, lh * 0.2, [2, 3], 0.4, false);
  mid.fillStyle = vgrad(mid, lh * 0.45, lh, [[0, '#b4ec96'], [1, '#93da7a']]);
  mid.fill();
  // hedges / tiny trees on the mid hills
  for (let x = 0; x < lw; x += 26 + rnd() * 40) {
    const u = (x / lw) * Math.PI * 2;
    const y = lh - lh * 0.18 - ridge(u, [2, 3], 0.4, false) * lh * 0.2;
    const r = lh * 0.022;
    mid.fillStyle = '#6fbf5a';
    mid.beginPath();
    mid.arc(x, y + r * 0.6, r, 0, Math.PI * 2);
    mid.fill();
  }
  // near: tree line with round crowns, light from the left
  near.fillStyle = vgrad(near, lh * 0.75, lh, [[0, '#86d36a'], [1, '#6cc35a']]);
  ridgePath(near, lw, lh, lh * 0.02, lh * 0.1, [3, 5], 2.1, false);
  near.fill();
  for (let x = 0; x < lw; x += 14 + rnd() * 22) {
    const r = lh * (0.03 + rnd() * 0.025);
    const u = (x / lw) * Math.PI * 2;
    const y = lh - lh * 0.03 - ridge(u, [3, 5], 2.1, false) * lh * 0.1;
    for (const xx of [x, x - lw, x + lw]) {
      near.fillStyle = '#4fa548';
      near.beginPath();
      near.arc(xx, y, r, 0, Math.PI * 2);
      near.fill();
      near.fillStyle = '#6cc35a';
      near.beginPath();
      near.arc(xx - r * 0.25, y - r * 0.25, r * 0.7, 0, Math.PI * 2);
      near.fill();
    }
  }
  return L.map((o) => o.cv);
}

function glowSprite(size, inner, outer) {
  const { cv, c } = mkCanvas(size, size, 1);
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

/**
 * Pre-render everything for a course at the current size.
 * Returns a cache object; rebuild when courseId/night/size changes (check cache.key).
 */
export function buildSky(r, courseId, night = false) {
  const id = SKIES[courseId] ? courseId : 'meadow';
  const isNight = !!night || id === 'city';
  const conf = isNight ? SKIES.city : SKIES[id];
  const W = r.W;
  const dpr = r.dpr || 1;
  const lw = Math.ceil(W * 1.6);
  const lh = Math.ceil(r.H * 0.3);
  const ctx = r.c;
  const sky = ctx.createLinearGradient(0, 0, 0, r.HZ);
  sky.addColorStop(0, conf.sky[0]);
  sky.addColorStop(0.7, conf.sky[1]);
  sky.addColorStop(1, conf.sky[2]);
  const haze = ctx.createLinearGradient(0, r.HZ - lh * 0.55, 0, r.HZ + 2);
  haze.addColorStop(0, hexA(conf.haze, 0));
  haze.addColorStop(1, hexA(conf.haze, isNight ? 0.35 : 0.65));
  const nearHaze = ctx.createLinearGradient(0, r.HZ - lh * 0.25, 0, r.HZ + 2);
  nearHaze.addColorStop(0, hexA(conf.haze, 0));
  nearHaze.addColorStop(1, hexA(conf.haze, isNight ? 0.12 : 0.28));
  const stars = [];
  if (isNight) {
    const rnd = makeRnd(4242);
    for (let i = 0; i < 90; i++) stars.push({ x: rnd(), y: rnd() * 0.8, r: 0.5 + rnd() * 1.5, ph: rnd() * 6, big: rnd() < 0.08 });
  }
  return {
    key: `${id}|${isNight}|${W}x${r.H}|${dpr}`,
    courseId: id,
    night: isNight,
    lw,
    lh,
    sky,
    haze,
    nearHaze,
    layers: buildLayers(isNight ? 'city' : id, isNight, lw, lh, dpr),
    clouds: [buildClouds(lw, lh * 1.4, dpr, isNight, 11), buildClouds(lw, lh * 1.4, dpr, isNight, 29)],
    cloudH: lh * 1.4,
    sunGlow: glowSprite(256, 'rgba(255,250,215,0.95)', 'rgba(255,236,150,0.35)'),
    moonGlow: glowSprite(256, 'rgba(255,248,210,0.5)', 'rgba(255,246,200,0.16)'),
    flare: glowSprite(64, 'rgba(255,255,255,0.5)', 'rgba(255,240,200,0.15)'),
    stars,
  };
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function tile(c, img, off, y, lw, h, W) {
  let x = -(((off % lw) + lw) % lw) - OVER;
  while (x < W + OVER) {
    c.drawImage(img, x, y, lw, h);
    x += lw;
  }
}

function celestialPos(r, scale) {
  const rad = Math.min(r.W, r.H) * scale;
  let y = r.HZ * 0.45;
  if (typeof r.hudLayout === 'function') {
    try {
      const L = r.hudLayout();
      y = Math.min(r.HZ - rad * 2, L.countY + L.icon * 0.7 + rad * 1.8);
    } catch (e) {
      /* fall back */
    }
  }
  const x = r.W - rad * 2.3 - ((r.safe && r.safe.right) || 0);
  return { x, y, rad };
}

function drawSunBody(c, x, y, rad, t, cache, q) {
  // glow
  const g = rad * 5;
  c.drawImage(cache.sunGlow, x - g / 2, y - g / 2, g, g);
  // soft rays
  c.save();
  c.translate(x, y);
  c.rotate(t * 0.12);
  c.fillStyle = 'rgba(255,228,110,0.4)';
  for (let i = 0; i < 12; i++) {
    c.rotate(Math.PI / 6);
    c.beginPath();
    c.moveTo(rad * 1.12, -rad * 0.16);
    c.lineTo(rad * 1.55, 0);
    c.lineTo(rad * 1.12, rad * 0.16);
    c.fill();
  }
  c.restore();
  // body with a lit gradient
  const bg = c.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
  bg.addColorStop(0, '#fff6c4');
  bg.addColorStop(0.6, '#ffe066');
  bg.addColorStop(1, '#ffc93d');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(x, y, rad, 0, Math.PI * 2);
  c.fill();
  // friendly face (kept from the original art)
  c.fillStyle = '#5a3d2b';
  c.beginPath();
  c.arc(x - rad * 0.35, y - rad * 0.1, rad * 0.11, 0, Math.PI * 2);
  c.arc(x + rad * 0.35, y - rad * 0.1, rad * 0.11, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(x, y + rad * 0.12, rad * 0.4, 0.2, Math.PI - 0.2);
  c.lineWidth = Math.max(1.5, rad * 0.09);
  c.strokeStyle = '#5a3d2b';
  c.lineCap = 'round';
  c.stroke();
  c.fillStyle = 'rgba(255,120,120,0.45)';
  c.beginPath();
  c.ellipse(x - rad * 0.6, y + rad * 0.25, rad * 0.16, rad * 0.1, 0, 0, Math.PI * 2);
  c.ellipse(x + rad * 0.6, y + rad * 0.25, rad * 0.16, rad * 0.1, 0, 0, Math.PI * 2);
  c.fill();
}

function drawFlare(c, r, x, y, cache) {
  // a few soft discs along the line from the sun through the screen centre
  const cx = r.W / 2;
  const cy = r.H * 0.55;
  const dx = cx - x;
  const dy = cy - y;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const disc = [
    [0.35, 26, 0.35],
    [0.6, 14, 0.4],
    [0.9, 40, 0.18],
    [1.25, 20, 0.25],
  ];
  for (const [k, s, a] of disc) {
    c.globalAlpha = a;
    c.drawImage(cache.flare, x + dx * k - s, y + dy * k - s, s * 2, s * 2);
  }
  c.restore();
}

function drawMoon(c, x, y, rad, cache) {
  const g = rad * 6;
  c.drawImage(cache.moonGlow, x - g / 2, y - g / 2, g, g);
  const bg = c.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
  bg.addColorStop(0, '#fffbe6');
  bg.addColorStop(1, '#f5e6a8');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(x, y, rad, 0, Math.PI * 2);
  c.fill();
  // soft craters
  c.fillStyle = 'rgba(214,190,120,0.35)';
  for (const [dx, dy, s] of [[0.42, -0.42, 0.14], [-0.5, 0.42, 0.1], [0.55, 0.5, 0.08]]) {
    c.beginPath();
    c.arc(x + dx * rad, y + dy * rad, s * rad, 0, Math.PI * 2);
    c.fill();
  }
  // sleepy smile
  c.strokeStyle = '#8a6a3c';
  c.lineWidth = Math.max(1.5, rad * 0.08);
  c.lineCap = 'round';
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.arc(x + sd * rad * 0.35, y - rad * 0.08, rad * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }
  c.beginPath();
  c.arc(x, y + rad * 0.15, rad * 0.3, 0.2, Math.PI - 0.2);
  c.stroke();
}

/**
 * Draw the whole sky + background down to the horizon (r.HZ).
 * @param {object} r Renderer
 * @param {object} cache from buildSky()
 * @param {object} race (optional) used for the vertical bob (player height) only
 * @param {number} t seconds
 * @param {number} camXOffset renderer.bgOffset (fraction of a layer width; grows with curves)
 */
export function drawSky(r, cache, race, t, camXOffset = 0) {
  const c = r.c;
  const W = r.W;
  const HZ = r.HZ;
  const q = r.quality ?? 2;
  c.fillStyle = cache.sky;
  c.fillRect(-OVER, -OVER, W + OVER * 2, HZ + OVER + 4);

  if (cache.night) {
    for (const st of cache.stars) {
      const a = 0.4 + 0.5 * Math.sin(t * 2 + st.ph);
      c.fillStyle = `rgba(255,255,240,${a.toFixed(2)})`;
      const sx = st.x * (W + OVER * 2) - OVER;
      const sy = st.y * HZ;
      if (st.big && q >= 1) {
        c.fillRect(sx - st.r * 2, sy - 0.5, st.r * 4, 1);
        c.fillRect(sx - 0.5, sy - st.r * 2, 1, st.r * 4);
      }
      c.beginPath();
      c.arc(sx, sy, st.r, 0, Math.PI * 2);
      c.fill();
    }
    const m = celestialPos(r, 0.06);
    drawMoon(c, m.x, m.y, m.rad, cache);
  } else {
    const s = celestialPos(r, 0.07);
    drawSunBody(c, s.x, s.y, s.rad, t, cache, q);
    cache._sun = s;
  }

  // vertical bob with the road height (small)
  let vy = 0;
  try {
    const p = race && race.player;
    const segs = race && race.course && race.course.segments;
    if (p && segs && segs.length) {
      const seg = segs[Math.min(segs.length - 1, Math.max(0, Math.floor(p.z / 200)))];
      vy = Math.max(-10, Math.min(10, -(seg.y1 || 0) * 0.02));
    }
  } catch (e) {
    vy = 0;
  }

  const lw = cache.lw;
  const lh = cache.lh;
  // clouds: two layers drifting with time and parallax
  if (!cache.night) {
    const ch = HZ * 0.5;
    const cy = HZ * 0.06;
    tile(c, cache.clouds[0], camXOffset * lw * 0.08 + t * 6, cy, lw, ch, W);
    if (q >= 1) {
      c.globalAlpha = 0.8;
      tile(c, cache.clouds[1], camXOffset * lw * 0.14 + t * 11, cy + ch * 0.22, lw, ch * 0.75, W);
      c.globalAlpha = 1;
    }
  }

  const baseY = HZ - lh + 2 + vy;
  tile(c, cache.layers[0], camXOffset * lw * PARALLAX[0], baseY, lw, lh, W);
  c.fillStyle = cache.haze;
  c.fillRect(-OVER, HZ - lh * 0.55 + vy, W + OVER * 2, lh * 0.55 + 2);
  tile(c, cache.layers[1], camXOffset * lw * PARALLAX[1], baseY, lw, lh, W);
  c.fillStyle = cache.nearHaze;
  c.fillRect(-OVER, HZ - lh * 0.25 + vy, W + OVER * 2, lh * 0.25 + 2);
  tile(c, cache.layers[2], camXOffset * lw * PARALLAX[2], baseY, lw, lh, W);

  if (!cache.night && q >= 1 && cache._sun) drawFlare(c, r, cache._sun.x, cache._sun.y, cache);
}

export { SKIES };
