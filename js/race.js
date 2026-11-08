// Race session: rules and state (no drawing, no DOM).
import { generateCourse } from './course.js';
import { generateCircuit } from './circuit.js';
import { makeRng } from './rng.js';
import {
  SEGMENT_LENGTH, SPEED_PRESETS, makePlayer, stepPlayer, overlap, bounce, startBoost, progress, PLAYER_W, AIR_TIME,
} from './physics.js';
import { AI_LEVELS, makeRival, stepRival, separateRivals, rankOf, finishOrder, playerGridPos, RIVAL_W } from './ai.js';
import { vehiclePreset } from './vehicle-stats.js';

export const COUNTDOWN = 3;
/** Stars needed to charge the boost button, and how long a charged boost waits before firing itself. */
export const BOOST_STARS = 5;
export const BOOST_AUTO_SECS = 6;
export const BOOST_SECS = 2.4;
/** A rival must get this far past the player (or fall this far behind) before the rank changes. */
export const RANK_MARGIN = 60;
/** Ghost recording interval (race seconds) and the margin before "passed the ghost" counts. */
export const TRACE_STEP = 0.1;
export const GHOST_MARGIN = 80;
/** Photo finish: slow motion when the player and another kart arrive together. */
export const PHOTO_DIST = 900;
export const PHOTO_GAP = 220;
export const PHOTO_SCALE = 0.35;
export const PHOTO_SECS = 1.4;
/** Seconds a new leader must hold the lead before it is announced. */
export const LEADER_SETTLE = 0.8;
/** Circuit replay: one frame every REPLAY_DT race seconds, at most REPLAY_MAX_SECS. */
export const REPLAY_DT = 1 / 30;
export const REPLAY_MAX_SECS = 240;
/** Keep recording the replay this long after the player crosses the line. */
export const REPLAY_TAIL = 3;
/** Gear change points (speed ratio) for the cosmetic 6-speed gearbox. */
export const GEAR_EDGES = [0, 0.16, 0.32, 0.48, 0.64, 0.8];
export const GEAR_TOP = 1.08;

/** Cosmetic gearbox: speed ratio -> { gear 1..6, rpm 0..1 within the gear }. */
export function gearFor(pct) {
  const v = Math.max(0, Number.isFinite(pct) ? pct : 0);
  let g = 1;
  for (let i = GEAR_EDGES.length - 1; i >= 0; i--) {
    if (v >= GEAR_EDGES[i]) {
      g = i + 1;
      break;
    }
  }
  const lo = GEAR_EDGES[g - 1];
  const hi = g < GEAR_EDGES.length ? GEAR_EDGES[g] : GEAR_TOP;
  const rpm = Math.max(0, Math.min(1, 0.25 + 0.75 * ((v - lo) / (hi - lo))));
  return { gear: g, rpm };
}

/** Keep only well-formed [t, x, z] samples in time order; null when nothing usable. */
export function cleanTrace(trace) {
  if (!Array.isArray(trace)) return null;
  const out = [];
  for (const s of trace) {
    if (!Array.isArray(s) || s.length < 3) continue;
    const [t, x, z] = s;
    if (![t, x, z].every(Number.isFinite)) continue;
    if (out.length && t <= out[out.length - 1][0]) continue;
    out.push([t, x, z]);
  }
  return out.length >= 2 ? out : null;
}

/** Position on a trace at race time t (linear interpolation), or null after its end. */
export function tracePos(trace, t) {
  if (!trace || !trace.length) return null;
  if (t <= trace[0][0]) return { x: trace[0][1], z: trace[0][2] };
  const last = trace[trace.length - 1];
  if (t > last[0]) return null;
  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  return { x: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k };
}

export class Race {
  /**
   * @param {{course:string, vehicle:string, speed?:'slow'|'normal', rivals?:'easy'|'normal'|'hard', length?:number, seed?:number, hooks?:object}} o
   */
  constructor(o) {
    this.courseId = o.course;
    this.vehicle = o.vehicle;
    this.preset = SPEED_PRESETS[o.speed] || SPEED_PRESETS.slow; // base pace (rivals measure against this)
    this.playerPreset = vehiclePreset(this.preset, o.vehicle); // the chosen vehicle's own feel
    this.level = AI_LEVELS[o.rivals] || AI_LEVELS.normal;
    this.levelId = AI_LEVELS[o.rivals] ? o.rivals : 'normal';
    this.circuitId = o.circuit || null;
    if (this.circuitId) {
      this.courseId = this.circuitId;
      this.course = generateCircuit(this.circuitId, { laps: o.laps || 3, seed: o.seed });
    } else {
      this.course = generateCourse(o.course, { length: o.length || 1000, seed: o.seed });
    }
    this.hooks = o.hooks || {};
    this.rng = makeRng((o.seed ?? 7) * 31 + 11);
    this.player = makePlayer();
    const grid = playerGridPos();
    this.player.z = grid.z;
    this.player.x = grid.x;
    this.rivals = this.course.rivals.map((r, i) => {
      const id = r.animal || r.id || `car${i + 1}`;
      const rv = makeRival(id, r, this.level, this.rng);
      if (r.car) rv.car = r.car;
      return rv;
    });
    this.events = this.course.events.map((e) => ({ ...e, t: 0 }));
    this.state = 'countdown';
    this.time = 0;
    this.stateTime = 0;
    this.stars = 0;
    this.boostCharge = 0; // stars collected toward the next boost (0..BOOST_STARS)
    this.boostReady = false;
    this.boostReadyAt = 0;
    this.fruits = {};
    this.eventSeen = null;
    this.jump = 0;
    this.lastCount = COUNTDOWN + 1;
    this.milestones = { 0.3: false, 0.5: false, 0.62: false, 0.88: false };
    this.cowX = -2.6;
    this.cowBumpAt = -9;
    this.finishTime = 0;
    this.finishExact = 0;
    for (const r of this.rivals) r.ahead = r.z > this.player.z;
    this.rank = this.rankFromFlags();
    this.bestRank = this.rank;
    this.finalRank = 0;
    this.overtakes = 0;
    this.lastStretch = false;
    this.curbAt = -9;
    this.driftAt = -9;
    this.rivalBumpAt = -9;
    this.slipAt = -9;
    this.stableRank = 0; // last rank announced as "stable"
    this.rankSince = 0; // time at which the current rank was reached
    // Ghost (the child's own best run on this course) and our own recording.
    this.ghost = cleanTrace(o.ghost);
    this.trace = [];
    this.traceAt = -Infinity;
    this.ghostAhead = null; // is the ghost ahead of the player? (null until the race starts)
    // Photo finish slow motion.
    this.timeScale = 1;
    this.photoDone = false;
    this.photoLeft = 0;
    // Leader announcements.
    this.leaderId = null;
    this.leaderCand = null;
    this.leaderSince = 0;
    this.rampSeg = -1;
    // Circuit: laps, cosmetic gearbox, auto-brake state, replay recording.
    this.isCircuit = !!this.circuitId;
    this.laps = this.isCircuit ? Math.max(1, this.course.laps || 1) : 1;
    this.lapZ = this.isCircuit ? (this.course.lapZ || this.course.goalZ / this.laps) : this.course.goalZ;
    this.lapsStartZ = this.course.goalZ - this.laps * this.lapZ; // where lap 1 begins
    this.lap = 1;
    this.lapTimes = [];
    this.bestLap = 0;
    this.lapStart = 0; // race clock at the start of the current lap
    this.braking = false;
    this.player.gear = 1;
    this.player.rpm = 0;
    this.replay = this.isCircuit ? { dt: REPLAY_DT, frames: [] } : null;
    this.replayAt = -Infinity;
    this.replayEnd = Infinity;
  }

  /** Total race distance in world units (for lap-aware displays). */
  get lapProgress() {
    if (!this.isCircuit) return this.progress;
    const d = (this.player.z - this.lapsStartZ) - (this.lap - 1) * this.lapZ;
    return Math.max(0, Math.min(1, d / this.lapZ));
  }

  /** Record one replay frame every REPLAY_DT race seconds (circuit only). */
  recordReplay() {
    if (!this.replay) return;
    const t = this.raceClock;
    if (t < 0 || t > REPLAY_MAX_SECS || t > this.replayEnd) return;
    // Fill every missed slot so frames[i] is always the state at i * dt.
    while (this.replay.frames.length * REPLAY_DT <= t + 1e-9) {
      const r3 = (v) => Math.round(v * 1000) / 1000;
      const p = this.player;
      this.replay.frames.push({
        p: [r3(p.x), Math.round(p.z * 10) / 10, r3(p.steer || 0)],
        r: this.rivals.map((r) => [r3(r.x), Math.round(r.z * 10) / 10]),
      });
    }
  }

  /** Lap bookkeeping: emits lap(n, time, best) for the lap just completed, finalLap() once. */
  checkLaps() {
    const p = this.player;
    while (this.lap <= this.laps && p.z >= this.lapsStartZ + this.lap * this.lapZ) {
      const crossT = this.raceClock - Math.max(0, p.z - (this.lapsStartZ + this.lap * this.lapZ)) / Math.max(1, p.speed);
      const time = Math.max(0, crossT - this.lapStart);
      this.lapTimes.push(time);
      const best = !this.bestLap || time < this.bestLap;
      if (best) this.bestLap = time;
      this.lapStart = crossT;
      const n = this.lap;
      this.lap++;
      this.emit('lap', n, time, best);
      if (this.lap === this.laps && this.laps > 1) this.emit('finalLap');
    }
    if (this.lap > this.laps) this.lap = this.laps;
  }

  /** Seconds since the green light (negative during the countdown). */
  get raceClock() {
    return this.time - COUNTDOWN;
  }

  /** Where the ghost car is right now ({x, z}), or null without a ghost / after it finished. */
  ghostPos() {
    if (!this.ghost) return null;
    return tracePos(this.ghost, this.raceClock);
  }

  recordTrace(force = false) {
    const t = this.raceClock;
    if (t < 0) return;
    if (!force && t - this.traceAt < TRACE_STEP - 1e-9) return;
    this.traceAt = t;
    const r2 = (v) => Math.round(v * 100) / 100;
    this.trace.push([r2(t), r2(this.player.x), r2(this.player.z)]);
  }

  emit(name, ...args) {
    const f = this.hooks[name];
    if (typeof f === 'function') {
      try {
        f(...args);
      } catch (e) {
        /* hooks must never break the race */
      }
    }
  }

  get progress() {
    return progress(this.player.z, this.course.goalZ);
  }

  get speedPct() {
    return this.player.speed / this.playerPreset.maxSpeed;
  }

  /** Rank from the hysteresis flags: 1 + rivals currently counted as ahead. */
  rankFromFlags() {
    let n = 1;
    for (const r of this.rivals) if (r.ahead) n++;
    return n;
  }

  /** The closest rival (by distance along the track), or null. */
  nearestRival() {
    let best = null;
    let dist = Infinity;
    for (const r of this.rivals) {
      const d = Math.abs(r.z - this.player.z);
      if (d < dist) {
        dist = d;
        best = r;
      }
    }
    return best ? { rival: best, dist } : null;
  }

  /**
   * Fire the charged boost (the big yellow button). Returns true when a boost was used.
   * @param {boolean} auto true when the race fires it by itself after BOOST_AUTO_SECS.
   */
  useBoost(auto = false) {
    if (!this.boostReady || this.state !== 'race') return false;
    this.boostReady = false;
    this.boostCharge = 0;
    this.boostReadyAt = 0;
    startBoost(this.player, BOOST_SECS);
    this.emit('boostUsed', auto);
    return true;
  }

  /** Speed in "km/h" for the gauge (purely cosmetic). */
  get kmh() {
    return Math.round(this.speedPct * (this.isCircuit ? 240 : 120));
  }

  honk() {
    this.jump = 0.9;
    for (const r of this.rivals) r.cheer = Math.max(r.cheer, 1.2);
    this.emit('honk');
  }

  segIndex(z) {
    return Math.max(0, Math.min(this.course.segments.length - 1, Math.floor(z / SEGMENT_LENGTH)));
  }

  update(dt, input = {}) {
    // Photo finish: the world runs in slow motion for a short real-time moment.
    if (this.photoLeft > 0) {
      this.photoLeft = Math.max(0, this.photoLeft - dt);
      if (this.photoLeft === 0) this.timeScale = 1;
    }
    dt *= this.timeScale;
    this.time += dt;
    this.stateTime += dt;
    if (this.jump > 0) this.jump = Math.max(0, this.jump - dt);
    for (const r of this.rivals) {
      if (r.cheer > 0) r.cheer = Math.max(0, r.cheer - dt);
      if (r.hop > 0) r.hop = Math.max(0, r.hop - dt);
    }

    if (this.state === 'countdown') {
      const left = Math.ceil(COUNTDOWN - this.stateTime);
      if (left < this.lastCount && left > 0) {
        this.lastCount = left;
        this.emit('count', left);
      }
      if (this.stateTime >= COUNTDOWN) {
        this.state = 'race';
        this.stateTime = 0;
        this.rankSince = this.time;
        this.leaderId = this.order[0].id;
        this.leaderCand = this.leaderId;
        this.leaderSince = this.time;
        this.recordTrace(true);
        this.emit('go');
      }
      return;
    }

    const p = this.player;
    const finished = this.state === 'goal';
    const seg = this.course.segments[this.segIndex(p.z)];
    const z0 = p.z;
    if (p.air > 0) {
      p.air = Math.max(0, p.air - dt);
      if (p.air === 0) this.emit('land', 'player');
    }
    const brakeCap = this.course.brake ? this.course.brake[this.segIndex(p.z)] : undefined;
    const fenced = stepPlayer(p, finished ? { steer: 0 } : input, dt, { preset: this.playerPreset, curve: seg.curve, finished, cap: brakeCap });
    this.braking = !!p.braking;
    const gb = gearFor(this.speedPct);
    p.gear = gb.gear;
    p.rpm = gb.rpm;
    if (fenced && !finished && this.time - (this.fenceAt || -9) > 1.2) {
      this.fenceAt = this.time;
      this.emit('fence');
    }
    if (p.curb && this.time - this.curbAt > 0.22) {
      this.curbAt = this.time;
      this.emit('curb');
    }
    if (p.drift && this.time - this.driftAt > 1.6) {
      this.driftAt = this.time;
      this.emit('drift');
    }

    // Rivals race for real.
    const ctx = {
      segments: this.course.segments,
      goalZ: this.course.goalZ,
      player: p,
      rivals: this.rivals,
      preset: this.preset,
      level: this.level,
      time: this.time,
      rng: this.rng,
      racing: true,
      brake: this.course.brake || null,
    };
    for (const r of this.rivals) {
      const wasFinished = r.finished;
      stepRival(r, ctx, dt);
      if (r.rocket && !r.rocketSaid) {
        r.rocketSaid = true;
        this.emit('rivalRocket', r.animal);
      }
      if (r.jumped) {
        r.jumped = false;
        this.emit('jump', r.animal);
      }
      if (r.landed) {
        r.landed = false;
        this.emit('land', r.animal);
      }
      if (!wasFinished && r.finished) {
        // Sub-frame crossing time, so two karts finishing in the same frame keep their real order.
        r.finishTime = this.time - Math.max(0, r.z - this.course.goalZ) / Math.max(1, r.speed);
        this.emit('rivalFinish', r.animal, this.order.findIndex((e) => e.id === r.animal) + 1);
      }
      // Bumping into each other: soft, playful, never a stop.
      if (!finished && !(p.air > 0) && !(r.air > 0) && Math.abs(r.z - p.z) < 170 && overlap(p.x, PLAYER_W, r.x, RIVAL_W, 0.92) && this.time - this.rivalBumpAt > 0.9) {
        this.rivalBumpAt = this.time;
        const dir = bounce(p, r.x, 0.86);
        r.vx = -dir * 1.9;
        r.speed *= 0.9;
        r.hop = 0.4;
        r.bump = 0.5;
        this.emit('bump', 'rival', r.animal);
      }
    }
    separateRivals(this.rivals);

    // Slipstream: tuck in right behind a rival for a moment and get a little pull.
    if (!finished) this.checkSlipstream(dt);
    // A charged boost that nobody pressed fires by itself after a while (small hands, no reading needed).
    if (!finished && this.boostReady && this.time - this.boostReadyAt >= BOOST_AUTO_SECS) this.useBoost(true);

    // Positions: who is ahead of whom.
    if (!finished) {
      const prev = this.rank;
      // Hysteresis: a kart has to be clearly past (RANK_MARGIN) before places swap,
      // so side-by-side duels do not flicker the badge or the voice.
      for (const r of this.rivals) {
        if (!r.ahead && r.z > p.z + RANK_MARGIN) {
          r.ahead = true;
          this.emit('overtaken', r.animal);
        } else if (r.ahead && r.z < p.z - RANK_MARGIN) {
          r.ahead = false;
          this.overtakes++;
          r.cheer = Math.max(r.cheer, 1.0);
          this.emit('overtake', r.animal);
        }
      }
      this.rank = this.rankFromFlags();
      if (this.rank !== prev) {
        this.bestRank = Math.min(this.bestRank, this.rank);
        this.rankSince = this.time;
        this.emit('rank', this.rank, prev);
      }
      // A rank that held for a while is worth announcing (brief swaps are not).
      if (this.rank !== this.stableRank && this.time - this.rankSince >= 0.6) {
        this.stableRank = this.rank;
        this.emit('rankStable', this.rank);
      }
    }

    if (!finished) this.checkTrack(z0, p.z);
    this.updateEvents(dt);
    this.recordReplay();
    if (!finished && this.isCircuit) this.checkLaps();
    if (!finished) {
      this.recordTrace();
      this.checkGhost();
      this.checkLeader();
      this.checkPhotoFinish();
    }

    if (!finished) {
      const pr = this.progress;
      for (const k of Object.keys(this.milestones)) {
        if (!this.milestones[k] && pr >= Number(k)) {
          this.milestones[k] = true;
          this.emit('milestone', Number(k), this.rank);
        }
      }
      if (!this.lastStretch && pr >= 0.86) {
        this.lastStretch = true;
        this.emit('lastStretch', this.rank);
      }
      if (p.z >= this.course.goalZ) {
        this.state = 'goal';
        this.stateTime = 0;
        this.finishTime = this.time;
        this.finishExact = this.time - Math.max(0, p.z - this.course.goalZ) / Math.max(1, p.speed);
        this.recordTrace(true);
        this.replayEnd = this.raceClock + REPLAY_TAIL;
        // Final place comes from the finish order, so it always matches result().positions.
        this.finalRank = this.order.findIndex((e) => e.id === 'player') + 1 || rankOf(p.z, this.rivals);
        this.rank = this.finalRank;
        this.emit('goal', this.result());
      }
    }
  }

  /** Passing (or being passed by) the ghost, with a margin so side-by-side does not flicker. */
  checkGhost() {
    const g = this.ghostPos();
    if (!g || this.raceClock < 0) return;
    const p = this.player;
    // null = side by side (as on the grid); whoever gets clearly ahead flips it.
    if (this.ghostAhead !== false && p.z > g.z + GHOST_MARGIN) {
      this.ghostAhead = false;
      this.emit('ghostPass', true);
    } else if (this.ghostAhead !== true && g.z > p.z + GHOST_MARGIN) {
      this.ghostAhead = true;
      this.emit('ghostPass', false);
    }
  }

  /** Announce a new leader once it has held the lead for a moment (not in the first seconds). */
  checkLeader() {
    const id = this.order[0].id;
    if (id !== this.leaderCand) {
      this.leaderCand = id;
      this.leaderSince = this.time;
    }
    if (this.raceClock >= 3 && id !== this.leaderId && this.time - this.leaderSince >= LEADER_SETTLE) {
      this.leaderId = id;
      this.emit('leader', id);
    }
  }

  /** A close finish: slow the world down for a moment, once per race. */
  checkPhotoFinish() {
    if (this.photoDone) return;
    const p = this.player;
    const left = this.course.goalZ - p.z;
    if (left <= 0 || left > PHOTO_DIST) return;
    if (!this.rivals.some((r) => !r.finished && Math.abs(r.z - p.z) < PHOTO_GAP)) return;
    this.photoDone = true;
    this.timeScale = PHOTO_SCALE;
    this.photoLeft = PHOTO_SECS;
    this.emit('photoFinish');
  }

  /** Sitting in a rival's slipstream (60..380 behind, same lane) for 0.8 s gives a short pull. */
  checkSlipstream(dt) {
    const p = this.player;
    let tucked = false;
    for (const r of this.rivals) {
      const dz = r.z - p.z;
      if (dz >= 60 && dz <= 380 && overlap(p.x, PLAYER_W, r.x, RIVAL_W, 1.0)) {
        tucked = true;
        break;
      }
    }
    if (!tucked) {
      p.slipT = 0;
      return;
    }
    p.slipT += dt;
    if (p.slipT >= 0.8 && p.slip <= 0 && this.time - this.slipAt > 3) {
      this.slipAt = this.time;
      p.slip = 1.2;
      this.emit('slipstream');
    }
  }

  checkTrack(z0, z1) {
    const p = this.player;
    const a = this.segIndex(z0);
    const b = this.segIndex(z1);
    const magnet = this.preset.magnet;
    for (let i = a; i <= b; i++) {
      const s = this.course.segments[i];
      for (const it of s.items) {
        if (!it.taken && Math.abs(it.x - p.x) < magnet) {
          it.taken = true;
          if (it.kind === 'star') {
            this.stars++;
            if (!this.boostReady) {
              this.boostCharge = Math.min(BOOST_STARS, this.boostCharge + 1);
              if (this.boostCharge >= BOOST_STARS) {
                this.boostReady = true;
                this.boostReadyAt = this.time;
                this.emit('boostReady');
              }
            }
          }
          else this.fruits[it.id] = (this.fruits[it.id] || 0) + 1;
          this.emit('collect', it.kind, it.id);
        }
      }
      if (s.ramp && !(p.air > 0) && this.rampSeg !== i && this.speedPct > 0.45 && overlap(p.x, PLAYER_W, s.ramp.x, s.ramp.w)) {
        this.rampSeg = i;
        p.air = AIR_TIME;
        this.emit('jump', 'player');
      }
      for (const ob of s.obstacles) {
        if (!(p.air > 0) && overlap(p.x, PLAYER_W, ob.x, ob.w, 0.9) && this.time - (ob.hitAt || -9) > 1) {
          ob.hitAt = this.time;
          ob.hop = 0.6;
          bounce(p, ob.x, 0.7);
          this.emit('bump', ob.id);
        }
      }
      if (s.boost && overlap(p.x, PLAYER_W * 0.6, s.boost.x, s.boost.w)) {
        const fresh = p.boost < 0.3;
        startBoost(p, 1.6);
        if (fresh) this.emit('boost');
      }
    }
  }

  updateEvents(dt) {
    const pi = this.segIndex(this.player.z);
    for (const ev of this.events) {
      if (!ev.fired && pi >= ev.index - 48) {
        ev.fired = true;
        this.eventSeen = ev.type;
        this.emit('event', ev.type);
      }
      if (ev.fired) ev.t += dt;
      if (ev.type === 'cow' && ev.fired) {
        // The cow strolls across the road and back to the grass.
        this.cowX = Math.min(2.6, -2.6 + ev.t * 0.95);
        const cz = ev.index * SEGMENT_LENGTH;
        const p = this.player;
        if (!(p.air > 0) && Math.abs(cz - p.z) < 260 && Math.abs(this.cowX - p.x) < 0.9 && this.time - this.cowBumpAt > 1.5) {
          this.cowBumpAt = this.time;
          bounce(p, this.cowX, 0.75);
          this.emit('bump', 'cow');
        }
      }
    }
  }

  /** Everyone's order right now (finished first, then by distance). */
  get order() {
    return finishOrder(this.player, this.rivals, this.course.goalZ, this.finishExact ?? this.finishTime, {
      time: this.time,
      maxSpeed: this.preset.maxSpeed,
    });
  }

  result() {
    const raceTime = Math.max(0, this.finishTime - COUNTDOWN);
    const order = this.order;
    return {
      positions: order.map((e, i) => ({ id: e.id, rank: i + 1 })),
      vehicle: this.vehicle,
      course: this.courseId,
      stars: this.stars,
      fruits: { ...this.fruits },
      event: this.eventSeen || this.course.def.event,
      time: this.time,
      raceTime,
      rank: this.finalRank || this.rank,
      racers: this.rivals.length + 1,
      overtakes: this.overtakes,
      level: this.levelId,
      order,
      trace: this.trace.slice(),
      lapTimes: this.lapTimes.slice(),
      bestLap: this.bestLap,
      laps: this.laps,
      circuit: this.circuitId,
    };
  }
}
