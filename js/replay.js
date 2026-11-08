// Replay player for circuit races (pure; no DOM, no imports).
// Recording format (written by race.js):
//   race.replay = { dt: 1/30, frames: [ { p: [x, z, steer], r: [[x, z], ...] }, ... ] }
// frames[i] is the state at time i * dt (race time since recording started).

export const REPLAY_CAMERAS = ['tv', 'heli', 'chase'];
export const CAMERA_SECS = 8;

const lerp = (a, b, k) => a + (b - a) * k;

/** Interpolated state at time t (clamped to the recording). Returns null if empty. */
export function sampleReplay(rec, t) {
  if (!rec || !Array.isArray(rec.frames) || rec.frames.length === 0) return null;
  const dt = rec.dt > 0 ? rec.dt : 1 / 30;
  const n = rec.frames.length;
  const pos = Math.max(0, Math.min(n - 1, (Number(t) || 0) / dt));
  const i = Math.floor(pos);
  const j = Math.min(n - 1, i + 1);
  const k = pos - i;
  const a = rec.frames[i];
  const b = rec.frames[j];
  const p = [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2] || 0, b.p[2] || 0, k)];
  const r = (a.r || []).map((ra, idx) => {
    const rb = (b.r && b.r[idx]) || ra;
    return [lerp(ra[0], rb[0], k), lerp(ra[1], rb[1], k)];
  });
  return { p, r };
}

export function createReplayPlayer(race) {
  const rec = race && race.replay;
  const frames = rec && Array.isArray(rec.frames) ? rec.frames.length : 0;
  const dt = rec && rec.dt > 0 ? rec.dt : 1 / 30;
  const duration = Math.max(0, (frames - 1) * dt);
  const player = {
    duration,
    t: 0,
    camera: REPLAY_CAMERAS[0],
    camIndex: 0,
    camTime: 0,
    done: frames <= 1,
    step(d) {
      const s = Math.max(0, Number(d) || 0);
      player.t = Math.min(duration, player.t + s);
      player.camTime += s;
      if (player.camTime >= CAMERA_SECS) {
        player.camTime -= CAMERA_SECS;
        player.nextCamera(true);
      }
      if (player.t >= duration) player.done = true;
      return player;
    },
    apply(target = race) {
      const st = sampleReplay(rec, player.t);
      if (!st || !target) return false;
      if (target.player) {
        target.player.x = st.p[0];
        target.player.z = st.p[1];
        target.player.steer = st.p[2];
      }
      if (Array.isArray(target.rivals)) {
        st.r.forEach((rv, i) => {
          const o = target.rivals[i];
          if (o) {
            o.x = rv[0];
            o.z = rv[1];
          }
        });
      }
      return true;
    },
    nextCamera(auto = false) {
      player.camIndex = (player.camIndex + 1) % REPLAY_CAMERAS.length;
      player.camera = REPLAY_CAMERAS[player.camIndex];
      if (!auto) player.camTime = 0;
      return player.camera;
    },
    restart() {
      player.t = 0;
      player.camTime = 0;
      player.camIndex = 0;
      player.camera = REPLAY_CAMERAS[0];
      player.done = frames <= 1;
    },
  };
  return player;
}
