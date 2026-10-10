// Pure, testable movement / collision helpers for the race.
// Units: x is road-relative (-1 = left road edge, +1 = right road edge).
// z is world distance along the track. speed is world units per second.

export const SEGMENT_LENGTH = 200;
export const ROAD_LIMIT = 1.9; // soft fence: the car can never go further than this
export const PLAYER_W = 0.62; // half-road units

export const SPEED_PRESETS = {
  slow: { maxSpeed: 2700, accel: 1500, steer: 2.1, assist: 0.55, magnet: 0.55 },
  normal: { maxSpeed: 3400, accel: 1900, steer: 2.5, assist: 0.3, magnet: 0.45 },
};

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function easeInOut(a, b, t) {
  return a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
}
export function percentRemaining(n, total) {
  return (n % total) / total;
}

export function makePlayer() {
  return { x: 0, z: 0, speed: 0, vx: 0, bump: 0, boost: 0, offroad: false };
}

/**
 * Advance the player one step.
 * input.steer in [-1, 1]. opt: preset values + curve (current segment curve).
 * Returns the same object (mutated) for convenience.
 */
export function stepPlayer(p, input, dt, opt) {
  const preset = opt.preset || SPEED_PRESETS.slow;
  const max = preset.maxSpeed;
  const steer = clamp(input.steer || 0, -1, 1);
  const pct = clamp(p.speed / max, 0, 1.6);

  // Boost timer
  if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);
  if (p.bump > 0) p.bump = Math.max(0, p.bump - dt);

  // Target speed: always moving forward, never stops.
  p.offroad = Math.abs(p.x) > 1.05;
  let target = max;
  if (p.boost > 0) target = max * 1.45;
  else if (p.offroad) target = max * 0.62;
  if (opt.finished) target = 0;
  const rate = target > p.speed ? preset.accel : preset.accel * 1.2;
  if (p.speed < target) p.speed = Math.min(target, p.speed + rate * dt);
  else p.speed = Math.max(target, p.speed - rate * dt);

  // Steering: direct, responsive, scaled a little by speed so it feels alive.
  const steerPower = preset.steer * (0.55 + 0.45 * Math.min(1, pct));
  p.x += steer * steerPower * dt;

  // Curves push outward very gently; the assist counters most of it.
  const curve = opt.curve || 0;
  p.x -= curve * 0.03 * Math.min(1, pct) * (1 - preset.assist) * dt;

  // Gentle help back onto the road when the child is not steering.
  if (!steer && Math.abs(p.x) > 0.85) {
    p.x -= Math.sign(p.x) * preset.assist * 0.6 * dt;
  }

  // Bounce velocity from bumps decays smoothly.
  p.x += p.vx * dt;
  p.vx *= Math.pow(0.04, dt);
  if (Math.abs(p.vx) < 0.01) p.vx = 0;

  // Soft fence.
  let fenced = false;
  if (p.x > ROAD_LIMIT) {
    p.x = ROAD_LIMIT;
    if (p.vx > 0) p.vx = -p.vx * 0.5;
    fenced = true;
  } else if (p.x < -ROAD_LIMIT) {
    p.x = -ROAD_LIMIT;
    if (p.vx < 0) p.vx = -p.vx * 0.5;
    fenced = true;
  }

  p.z += p.speed * dt;
  return fenced;
}

/** Do two things (centre x, full width w) overlap along x? */
export function overlap(x1, w1, x2, w2, pct = 1) {
  const half = ((w1 + w2) / 2) * pct;
  return Math.abs(x1 - x2) < half;
}

/**
 * Soft bounce off an object at objX. Never stops the car:
 * speed drops to at most `keep` of current, then it auto-accelerates again.
 */
export function bounce(p, objX, keep = 0.6) {
  const dir = p.x >= objX ? 1 : -1;
  p.vx = dir * 2.4;
  p.speed = Math.max(p.speed * keep, 600);
  p.bump = 0.6;
  return dir;
}

export function startBoost(p, seconds = 1.6) {
  p.boost = Math.max(p.boost, seconds);
}

/** 0..1 progress toward the goal line. */
export function progress(z, goalZ) {
  if (!(goalZ > 0)) return 0;
  return clamp(z / goalZ, 0, 1);
}

/** Converts a pointer x position into a steering value. */
export function steerFromPointer(px, width, dead = 0.1) {
  if (!(width > 0)) return 0;
  const d = (px - width / 2) / (width / 2);
  if (Math.abs(d) < dead) return 0;
  return Math.sign(d) * clamp(0.6 + (Math.abs(d) - dead) * 0.8, 0, 1);
}

/** Tilt (degrees) to steer value with a dead zone. */
export function steerFromTilt(deg, dead = 4, full = 22) {
  if (typeof deg !== 'number' || Number.isNaN(deg)) return 0;
  const a = Math.abs(deg);
  if (a < dead) return 0;
  return Math.sign(deg) * clamp((a - dead) / (full - dead), 0, 1);
}

/** Segment indices crossed when moving from z0 to z1 (inclusive). */
export function segmentsBetween(z0, z1, segLen = SEGMENT_LENGTH) {
  const a = Math.floor(z0 / segLen);
  const b = Math.floor(z1 / segLen);
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
