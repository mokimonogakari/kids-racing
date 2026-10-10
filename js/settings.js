// Parent settings with safe persistence.
import { readJSON, writeJSON } from './storage.js';

export const SETTINGS_KEY = 'buubuu-race.settings.v1';
export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  music: true,
  voice: true,
  tilt: false,
  speed: 'slow', // 'slow' (のんびり) | 'normal' (ふつう)
});

export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const k of ['sound', 'music', 'voice', 'tilt']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
    if (raw.speed === 'slow' || raw.speed === 'normal') s.speed = raw.speed;
  }
  return s;
}

export function loadSettings(storage) {
  return sanitizeSettings(readJSON(storage, SETTINGS_KEY, null));
}

export function saveSettings(storage, s) {
  return writeJSON(storage, SETTINGS_KEY, sanitizeSettings(s));
}
