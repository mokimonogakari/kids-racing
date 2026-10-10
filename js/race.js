// Race session: rules and state (no drawing, no DOM).
import { generateCourse } from './course.js';
import {
  SEGMENT_LENGTH, SPEED_PRESETS, makePlayer, stepPlayer, overlap, bounce, startBoost, progress, PLAYER_W,
} from './physics.js';

export const COUNTDOWN = 3;

export class Race {
  /**
   * @param {{course:string, vehicle:string, speed?:'slow'|'normal', length?:number, seed?:number, hooks?:object}} o
   */
  constructor(o) {
    this.courseId = o.course;
    this.vehicle = o.vehicle;
    this.preset = SPEED_PRESETS[o.speed] || SPEED_PRESETS.slow;
    this.course = generateCourse(o.course, { length: o.length || 1000, seed: o.seed });
    this.hooks = o.hooks || {};
    this.player = makePlayer();
    this.player.z = 2 * SEGMENT_LENGTH;
    this.rivals = this.course.rivals.map((r) => ({ ...r }));
    this.events = this.course.events.map((e) => ({ ...e, t: 0 }));
    this.state = 'countdown';
    this.time = 0;
    this.stateTime = 0;
    this.stars = 0;
    this.fruits = {};
    this.eventSeen = null;
    this.jump = 0;
    this.lastCount = COUNTDOWN + 1;
    this.milestones = { 0.3: false, 0.62: false, 0.88: false };
    this.cowX = -2.6;
    this.cowBumpAt = -9;
    this.finishTime = 0;
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

    // Rivals drive along happily.
    for (const r of this.rivals) {
      // Friends wait at their spot and start driving when the player comes close,
      // so the player always gets to see (and pass) every one of them.
      if (r.z - p.z < 7000 || r.passed) r.z += this.preset.maxSpeed * r.speedFactor * dt;
      if (!finished && !r.passed && p.z > r.z + 120) {
        r.passed = true;
        r.cheer = 2.2;
        this.emit('pass', r.animal);
      }
      if (!finished && Math.abs(r.z - (p.z + 60)) < 180 && overlap(p.x, PLAYER_W, r.x, 0.6, 0.95)) {
        r.hop = 0.5;
        r.z += 200;
        bounce(p, r.x, 0.75);
        this.emit('bump', 'rival');
      }
    }

    if (!finished) this.checkTrack(z0, p.z);
    this.updateEvents(dt);

    if (!finished) {
      const pr = this.progress;
      for (const k of Object.keys(this.milestones)) {
        if (!this.milestones[k] && pr >= Number(k)) {
          this.milestones[k] = true;
          this.emit('milestone', Number(k));
        }
      }
      if (p.z >= this.course.goalZ) {
        this.state = 'goal';
        this.stateTime = 0;
        this.finishTime = this.time;
        this.emit('goal', this.result());
      }
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

  result() {
    return {
      vehicle: this.vehicle,
      course: this.courseId,
      stars: this.stars,
      fruits: { ...this.fruits },
      event: this.eventSeen || this.course.def.event,
      time: this.time,
    };
  }
}
