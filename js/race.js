// Race session: rules and state (no drawing, no DOM).
import { generateCourse } from './course.js';
import { makeRng } from './rng.js';
import {
  SEGMENT_LENGTH, SPEED_PRESETS, makePlayer, stepPlayer, overlap, bounce, startBoost, progress, PLAYER_W,
} from './physics.js';
import { AI_LEVELS, makeRival, stepRival, separateRivals, rankOf, finishOrder, playerGridPos, RIVAL_W } from './ai.js';

export const COUNTDOWN = 3;

export class Race {
  /**
   * @param {{course:string, vehicle:string, speed?:'slow'|'normal', rivals?:'easy'|'normal'|'hard', length?:number, seed?:number, hooks?:object}} o
   */
  constructor(o) {
    this.courseId = o.course;
    this.vehicle = o.vehicle;
    this.preset = SPEED_PRESETS[o.speed] || SPEED_PRESETS.slow;
    this.level = AI_LEVELS[o.rivals] || AI_LEVELS.normal;
    this.levelId = AI_LEVELS[o.rivals] ? o.rivals : 'normal';
    this.course = generateCourse(o.course, { length: o.length || 1000, seed: o.seed });
    this.hooks = o.hooks || {};
    this.rng = makeRng((o.seed ?? 7) * 31 + 11);
    this.player = makePlayer();
    const grid = playerGridPos();
    this.player.z = grid.z;
    this.player.x = grid.x;
    this.rivals = this.course.rivals.map((r) => makeRival(r.animal, r, this.level, this.rng));
    this.events = this.course.events.map((e) => ({ ...e, t: 0 }));
    this.state = 'countdown';
    this.time = 0;
    this.stateTime = 0;
    this.stars = 0;
    this.fruits = {};
    this.eventSeen = null;
    this.jump = 0;
    this.lastCount = COUNTDOWN + 1;
    this.milestones = { 0.3: false, 0.5: false, 0.62: false, 0.88: false };
    this.cowX = -2.6;
    this.cowBumpAt = -9;
    this.finishTime = 0;
    this.finishExact = 0;
    this.rank = rankOf(this.player.z, this.rivals);
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
    for (const r of this.rivals) r.ahead = r.z > this.player.z;
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
    return this.player.speed / this.preset.maxSpeed;
  }

  /** Speed in "km/h" for the gauge (purely cosmetic). */
  get kmh() {
    return Math.round(this.speedPct * 120);
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
        this.emit('go');
      }
      return;
    }

    const p = this.player;
    const finished = this.state === 'goal';
    const seg = this.course.segments[this.segIndex(p.z)];
    const z0 = p.z;
    const fenced = stepPlayer(p, finished ? { steer: 0 } : input, dt, { preset: this.preset, curve: seg.curve, finished });
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
    };
    for (const r of this.rivals) {
      const wasFinished = r.finished;
      stepRival(r, ctx, dt);
      if (!wasFinished && r.finished) {
        // Sub-frame crossing time, so two karts finishing in the same frame keep their real order.
        r.finishTime = this.time - Math.max(0, r.z - this.course.goalZ) / Math.max(1, r.speed);
        this.emit('rivalFinish', r.animal, this.order.findIndex((e) => e.id === r.animal) + 1);
      }
      // Bumping into each other: soft, playful, never a stop.
      if (!finished && Math.abs(r.z - p.z) < 170 && overlap(p.x, PLAYER_W, r.x, RIVAL_W, 0.92) && this.time - this.rivalBumpAt > 0.9) {
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

    // Positions: who is ahead of whom.
    if (!finished) {
      const prev = this.rank;
      this.rank = rankOf(p.z, this.rivals);
      for (const r of this.rivals) {
        const ahead = r.z > p.z;
        if (ahead !== r.ahead) {
          r.ahead = ahead;
          if (ahead) this.emit('overtaken', r.animal);
          else {
            this.overtakes++;
            r.cheer = Math.max(r.cheer, 1.0);
            this.emit('overtake', r.animal);
          }
        }
      }
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
        // Final place comes from the finish order, so it always matches result().positions.
        this.finalRank = this.order.findIndex((e) => e.id === 'player') + 1 || rankOf(p.z, this.rivals);
        this.rank = this.finalRank;
        this.emit('goal', this.result());
      }
    }
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
            if (this.stars % 5 === 0) {
              startBoost(p, 2.2);
              this.emit('starReward', this.stars);
            }
          }
          else this.fruits[it.id] = (this.fruits[it.id] || 0) + 1;
          this.emit('collect', it.kind, it.id);
        }
      }
      for (const ob of s.obstacles) {
        if (overlap(p.x, PLAYER_W, ob.x, ob.w, 0.9) && this.time - (ob.hitAt || -9) > 1) {
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
        if (Math.abs(cz - p.z) < 260 && Math.abs(this.cowX - p.x) < 0.9 && this.time - this.cowBumpAt > 1.5) {
          this.cowBumpAt = this.time;
          bounce(p, this.cowX, 0.75);
          this.emit('bump', 'cow');
        }
      }
    }
  }

  /** Everyone's order right now (finished first, then by distance). */
  get order() {
    return finishOrder(this.player, this.rivals, this.course.goalZ, this.finishExact ?? this.finishTime);
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
    };
  }
}
