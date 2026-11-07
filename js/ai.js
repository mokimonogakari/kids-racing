// Rival racers: pure, testable driving logic (no drawing, no DOM).
// A rival is an object moved by stepRival(); the Race owns the list.
import { SEGMENT_LENGTH, clamp, overlap, AIR_TIME } from './physics.js';

/**
 * Each animal drives a little differently (small, friendly differences):
 * top: straight-line pace, corner: pace in bends, start: acceleration multiplier for the first
 * seconds (rabbit's rocket start), jump: pace multiplier for 1 s after landing a jump,
 * steady: catch-up / hold-back effects halved (a steady, predictable driver).
 */
export const ANIMAL_TRAITS = {
  bear: { top: 1.03, corner: 0.96 },
  rabbit: { start: 1.6 },
  cat: { corner: 1.07 },
  frog: { jump: 1.25 },
  pig: { steady: true },
};
export const ROCKET_SECS = 4;

/**
 * Competition levels (parent setting "きょうそう").
 * skill: fraction of the player's top speed a rival can reach on its own.
 * band:  catch-up strength – a rival that has fallen behind may run this much faster than
 *        the player (scaled by how far behind it is), so the pack never disappears.
 * dist:  distance (world units) over which catch-up / hold-back reach full strength.
 * hover: a rival that caught up trails the player by about this distance (the player never
 *        sees "waiting" karts, but any mistake lets them pounce).
 * lead:  a rival just ahead may pull away up to this much faster than the player.
 * hold:  a rival far ahead is held back to (1 - hold) of the player's pace …
 * floor: … but never below floor * its own skill, so leaders never crawl.
 * late:  multiplier for both effects in the final stretch, so the ending is "earned".
 * pads:  whether rivals also use the rainbow boost pads.
 * react: reaction time at the start (seconds).
 */
export const AI_LEVELS = {
  easy: { skill: [0.70, 0.82], band: 0.2, dist: 2200, hover: 600, lead: 0.02, hold: 0.16, floor: 0.66, late: 0.4, pads: false, react: [0.25, 0.7] },
  normal: { skill: [0.82, 0.92], band: 0.14, dist: 2200, hover: 520, lead: 0.04, hold: 0.13, floor: 0.74, late: 0.5, pads: true, react: [0.15, 0.5] },
  hard: { skill: [0.96, 1.06], band: 0.1, dist: 2600, hover: 520, lead: 0.07, hold: 0.07, floor: 0.86, late: 0.6, pads: true, react: [0.05, 0.35] },
};
export const AI_LEVEL_IDS = Object.keys(AI_LEVELS);

export const LANES = [-0.62, -0.21, 0.21, 0.62];
export const RIVAL_W = 0.6; // full width in road units (player is PLAYER_W = 0.62)

/** Starting grid: 3 rows x 2 columns, player in the middle row (right side). */
export const GRID = {
  rows: [1400, 1100, 800], // z of each row (start line is at segment 9 = z 1800)
  cols: [-0.5, 0.5],
  player: { row: 1, col: 1 },
};

export function gridSlots() {
  const slots = [];
  GRID.rows.forEach((z, row) => {
    GRID.cols.forEach((x, col) => {
      if (row === GRID.player.row && col === GRID.player.col) return;
      slots.push({ z, x });
    });
  });
  return slots;
}

export function playerGridPos() {
  return { z: GRID.rows[GRID.player.row], x: GRID.cols[GRID.player.col] };
}

/**
 * Create a rival on a grid slot.
 * @param {string} animal
 * @param {{z:number,x:number}} slot
 * @param {object} level one of AI_LEVELS
 * @param {{range:(a:number,b:number)=>number}} rng
 */
export function makeRival(animal, slot, level, rng) {
  return {
    animal,
    z: slot.z,
    x: slot.x,
    speed: 0,
    vx: 0,
    skill: rng.range(level.skill[0], level.skill[1]),
    reaction: rng.range(level.react[0], level.react[1]),
    laneTarget: slot.x,
    laneTimer: rng.range(1.5, 3.5),
    laneHold: 0, // seconds during which traffic logic may not change the lane again
    slowT: 0, // how long we have been stuck behind someone
    boost: 0,
    bump: 0,
    hop: 0,
    cheer: 0,
    finished: false,
    finishTime: 0,
    ahead: false, // ahead of the player? (tracked by the race for overtake events)
    offroad: false,
    traits: ANIMAL_TRAITS[animal] || {},
    driveT: 0, // seconds since this rival got going
    rocket: false, // set once when a rocket start begins (the race announces it)
    air: 0,
    rampSeg: -1,
    jumped: false, // set when a jump starts (consumed by the race)
    landed: false, // set when a jump ends (consumed by the race)
    jumpBoost: 0,
  };
}

/** Index of the LANES entry closest to x. */
export function nearestLane(x) {
  let best = 0;
  for (let i = 1; i < LANES.length; i++) if (Math.abs(LANES[i] - x) < Math.abs(LANES[best] - x)) best = i;
  return best;
}

/** The lane with the most room around `r`, preferring lanes next to the current one. */
function freestLane(r, others) {
  const cur = nearestLane(r.laneTarget);
  let best = r.laneTarget;
  let bestScore = -Infinity;
  LANES.forEach((lx, i) => {
    let gap = 9;
    for (const q of others) {
      if (q === r) continue;
      const qdz = q.z - r.z;
      if (qdz > -200 && qdz < 600) gap = Math.min(gap, Math.abs(q.x - lx));
    }
    const score = gap - 0.12 * Math.abs(i - cur);
    if (score > bestScore) {
      bestScore = score;
      best = lx;
    }
  });
  return best;
}

/**
 * Advance one rival. ctx = { segments, goalZ, player, rivals, preset, level, time, rng, racing }.
 * Returns the same object (mutated).
 */
export function stepRival(r, ctx, dt) {
  const { preset, level } = ctx;
  const max = preset.maxSpeed;
  const p = ctx.player;
  if (r.boost > 0) r.boost = Math.max(0, r.boost - dt);
  if (r.bump > 0) r.bump = Math.max(0, r.bump - dt);
  if (!ctx.racing) return r; // countdown: everyone waits on the grid
  if (r.reaction > 0) {
    r.reaction -= dt;
    return r;
  }
  const tr = r.traits || {};
  r.driveT = (r.driveT || 0) + dt;
  if (tr.start && !r.rocket && r.driveT <= dt * 1.5) r.rocket = true;
  if (r.jumpBoost > 0) r.jumpBoost = Math.max(0, r.jumpBoost - dt);
  if (r.air > 0) {
    r.air = Math.max(0, r.air - dt);
    if (r.air === 0) {
      r.landed = true;
      if (tr.jump) r.jumpBoost = 1;
    }
  }
  const segs = ctx.segments;
  const si = clamp(Math.floor(r.z / SEGMENT_LENGTH), 0, segs.length - 1);
  const seg = segs[si];
  const pct = clamp(r.speed / max, 0, 1.6);
  r.laneHold = Math.max(0, (r.laneHold || 0) - dt);

  // ---- lane choice: a lazy racing line ----
  r.laneTimer -= dt;
  if (r.laneTimer <= 0) {
    r.laneTimer = ctx.rng.range(3, 6);
    const ahead = segs[Math.min(segs.length - 1, si + 18)];
    const inside = ahead.curve > 0.6 ? 1 : ahead.curve < -0.6 ? -1 : 0;
    if (inside) {
      // Hug the inside of the coming bend (both inside lanes are fine).
      r.laneTarget = ctx.rng.pick(LANES.filter((x) => Math.sign(x) === inside));
    } else if (ctx.rng.chance(0.45)) {
      r.laneTarget = ctx.rng.pick(LANES);
    } else {
      r.laneTarget = LANES[nearestLane(r.laneTarget)];
    }
  }
  // ---- obstacle avoidance (look ahead ~9 segments) ----
  for (let i = si; i < Math.min(segs.length, si + 9); i++) {
    for (const ob of segs[i].obstacles) {
      if (Math.abs(ob.x - r.laneTarget) < 0.62) {
        r.laneTarget = clamp(ob.x > 0 ? ob.x - 0.95 : ob.x + 0.95, -0.7, 0.7);
        r.laneHold = Math.max(r.laneHold, 1.0);
      }
    }
  }
  // ---- traffic: the nearest kart ahead in my lane ----
  let slow = 1;
  const others = [p, ...ctx.rivals];
  let blocker = null;
  let bdz = Infinity;
  for (const o of others) {
    if (o === r) continue;
    const dz = o.z - r.z;
    if (dz <= 0 || dz > 520 || dz >= bdz) continue;
    if (!overlap(r.laneTarget, RIVAL_W, o.x, RIVAL_W, 1.1)) continue;
    blocker = o;
    bdz = dz;
  }
  if (blocker) {
    const faster = r.speed * 1.02 > (blocker.speed || 0);
    if (r.laneHold <= 0 && ((faster && bdz < 420) || r.slowT > 1.5)) {
      // pull out to the freest lane and commit to it for a while
      const best = freestLane(r, others);
      if (best !== r.laneTarget) {
        r.laneTarget = best;
        r.laneHold = 1.5;
      }
      r.slowT = 0;
    } else if (bdz < 260) {
      slow = 0.95; // hold back a little instead of ramming
      r.slowT += dt;
    }
  } else {
    r.slowT = 0;
  }

  // ---- speed: own skill, shaped by where the player is ----
  // ref = the player's pace on the road (boosts are not mirrored); at the start assume full pace.
  const ref = ctx.time < 6 ? max : clamp(p.speed || 0, 0, max);
  const gap = p.z - r.z; // > 0: I am behind the player
  const prog = clamp(r.z / ctx.goalZ, 0, 1);
  const lateK = prog > 0.86 ? level.late : 1;
  const bend = Math.abs(seg.curve || 0) > 1.5;
  const skillT = max * r.skill * (bend ? tr.corner || 1 : tr.top || 1);
  const steadyK = tr.steady ? 0.5 : 1;
  let target;
  if (gap > 0) {
    // Behind: close in when far back, then trail at about `hover` without passing on pace alone.
    const g = clamp((gap - level.hover) / level.dist, 0, 1) * lateK * steadyK;
    target = Math.max(skillT, ref * (1 + level.band * g));
  } else {
    // Ahead: may pull away a little when close, is reeled in when far ahead, never crawls.
    const g = clamp(-gap / level.dist, 0, 1) * lateK * steadyK;
    const cap = ref * (1 + level.lead - (level.lead + level.hold) * g);
    target = Math.min(skillT, Math.max(skillT * level.floor, cap));
  }
  target *= slow;
  if (r.jumpBoost > 0) target *= tr.jump || 1;
  if (r.boost > 0) target = Math.max(target, max * 1.4);
  r.offroad = Math.abs(r.x) > 1.05;
  if (r.offroad) target *= 0.7;
  if (r.finished) target = max * 0.55;
  const accel = preset.accel * 0.95 * (tr.start && r.driveT < ROCKET_SECS ? tr.start : 1);
  if (r.speed < target) r.speed = Math.min(target, r.speed + accel * dt);
  else r.speed = Math.max(target, r.speed - accel * 1.3 * dt);

  // ---- lateral: smooth approach to the lane, with a small dead band (no twitching) ----
  const err = r.laneTarget - r.x;
  const steer = Math.abs(err) < 0.02 ? 0 : clamp(err * 3.2, -1, 1);
  const steerPower = preset.steer * 0.8 * (0.55 + 0.45 * Math.min(1, pct)) * (r.air > 0 ? 0.5 : 1);
  r.x += steer * steerPower * dt;
  r.x -= (seg.curve || 0) * 0.02 * Math.min(1, pct) * dt; // curves push a little
  r.x += r.vx * dt;
  r.vx *= Math.pow(0.04, dt);
  if (Math.abs(r.vx) < 0.01) r.vx = 0;
  r.x = clamp(r.x, -1.6, 1.6);

  // ---- boost pads ----
  if (level.pads && seg.boost && overlap(r.x, RIVAL_W * 0.6, seg.boost.x, seg.boost.w)) {
    r.boost = Math.max(r.boost, 1.4);
  }

  // ---- jump ramps ----
  if (seg.ramp && r.air <= 0 && r.rampSeg !== si && pct > 0.45 && overlap(r.x, RIVAL_W, seg.ramp.x, seg.ramp.w)) {
    r.rampSeg = si;
    r.air = AIR_TIME;
    r.jumped = true;
  }

  r.z += r.speed * dt;
  if (!r.finished && r.z >= ctx.goalZ) {
    r.finished = true;
    r.finishTime = ctx.time;
  }
  return r;
}

/**
 * Keep karts from sitting inside each other: a gentle nudge apart, and when two karts
 * want the same lane the one behind picks the free lane next to it.
 */
export function separateRivals(rivals, dt = 1 / 60) {
  for (let i = 0; i < rivals.length; i++) {
    for (let j = i + 1; j < rivals.length; j++) {
      const a = rivals[i];
      const b = rivals[j];
      if (Math.abs(a.z - b.z) < 150 && Math.abs(a.x - b.x) < RIVAL_W) {
        const d = Math.sign(a.x - b.x) || (i % 2 ? 1 : -1);
        a.x += d * 0.25 * dt;
        b.x -= d * 0.25 * dt;
        if (Math.abs(a.laneTarget - b.laneTarget) < 0.2) {
          const back = a.z < b.z ? a : b;
          const dir = back === a ? d : -d;
          const li = nearestLane(back.laneTarget);
          const alt = clamp(li + (dir > 0 ? 1 : -1), 0, LANES.length - 1);
          back.laneTarget = LANES[alt === li ? clamp(li - (dir > 0 ? 1 : -1), 0, LANES.length - 1) : alt];
          back.laneHold = Math.max(back.laneHold || 0, 1.2);
        }
      }
    }
  }
}

/** 1 + number of rivals ahead of the player. */
export function rankOf(playerZ, rivals) {
  let n = 1;
  for (const r of rivals) if (r.z > playerZ) n++;
  return n;
}

/**
 * Finish order: everyone who finished (by time), then the rest by distance.
 * Each entry carries `time`: the real finish time for finishers, or an estimate
 * (now + remaining distance at the current pace) for karts still on the track.
 * @param {{time?:number, maxSpeed?:number}} [opt] current race time and base pace for the estimate
 * @returns {Array<{id:string, finished:boolean, time:number}>}
 */
export function finishOrder(player, rivals, goalZ, playerFinishTime, opt = {}) {
  const now = opt.time || 0;
  const estimate = (z, speed) => now + Math.max(0, goalZ - z) / Math.max(1, speed || opt.maxSpeed || 1);
  const list = rivals.map((r) => ({
    id: r.animal,
    finished: !!r.finished,
    t: r.finished ? r.finishTime : estimate(r.z, r.speed),
    z: r.z,
  }));
  const pf = player.z >= goalZ;
  list.push({ id: 'player', finished: pf, t: pf ? playerFinishTime : estimate(player.z, player.speed), z: player.z });
  list.sort((a, b) => {
    if (a.finished && b.finished) return a.t - b.t;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.z - a.z;
  });
  return list.map(({ id, finished, t }) => ({ id, finished, time: t }));
}
