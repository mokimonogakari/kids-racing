// Per-vehicle performance: small multipliers so choosing a car means something.
// speed = top speed, accel = how fast it gets there, grip = steering response.
// All values stay within 0.9..1.1 so every vehicle can still win.

export const VEHICLE_STATS = {
  car: { speed: 1.0, accel: 1.0, grip: 1.0 },
  fire: { speed: 0.97, accel: 0.95, grip: 1.06 },
  bus: { speed: 0.94, accel: 0.9, grip: 1.1 },
  police: { speed: 1.05, accel: 1.0, grip: 0.96 },
  ambulance: { speed: 0.98, accel: 1.06, grip: 1.0 },
  dino: { speed: 1.0, accel: 1.1, grip: 0.94 },
};

export const STAT_KEYS = ['speed', 'accel', 'grip'];

/** Stats for a vehicle id; unknown ids fall back to the plain red car. */
export function statsOf(id) {
  return VEHICLE_STATS[id] || VEHICLE_STATS.car;
}

/**
 * Derive the player's speed preset from the base preset and the chosen vehicle.
 * The base preset itself is never mutated (rivals keep using it).
 */
export function vehiclePreset(preset, id) {
  const s = statsOf(id);
  return {
    ...preset,
    maxSpeed: preset.maxSpeed * s.speed,
    accel: preset.accel * s.accel,
    steer: preset.steer * s.grip,
  };
}

/** Multiplier (0.9..1.1) -> 1..5 blocks for the picker. */
export function statLevel(mult) {
  const v = Number(mult);
  if (!Number.isFinite(v)) return 3;
  // 0.90 -> 1, 0.95 -> 2, 1.00 -> 3, 1.05 -> 4, 1.10 -> 5
  const level = Math.round((v - 0.9) / 0.05) + 1;
  return Math.max(1, Math.min(5, level));
}

/** Display bars (1..5) for a vehicle id. */
export function statBars(id) {
  const s = statsOf(id);
  return { speed: statLevel(s.speed), accel: statLevel(s.accel), grip: statLevel(s.grip) };
}
