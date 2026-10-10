// Safe wrappers around (local)Storage. Every access is wrapped in try/catch
// because storage can throw in private mode or when blocked.
export function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (e) {
    /* blocked */
  }
  return null;
}

export function readJSON(storage, key, fallback) {
  try {
    if (!storage) return fallback;
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

export function writeJSON(storage, key, value) {
  try {
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}
