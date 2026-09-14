// Persistence layer standing in for Postgres. The whole database is one JSON
// document kept in a pluggable key/value store. Writes go through tx(), which
// works on a copy and only commits if the callback finishes — so a half-failed
// Edge Function never leaves a partial write behind.
//
// This file must stay safe to bundle for the browser (Vite) as well as run
// under Node (the Express backend), so it never touches `fs` itself. In the
// browser it defaults to localStorage. Under Node, the server entrypoint calls
// setStorageAdapter() with a file-backed adapter from nodeStorage.js before
// anything reads or writes state.

const DB_KEY = 'hsc-fund:db:v1';
const SESSION_KEY = 'hsc-fund:session';

let storage = (() => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
})();

/** Swap in a different getItem/setItem/removeItem backend (see nodeStorage.js). */
export function setStorageAdapter(adapter) {
  storage = adapter;
}

let state = null;
let version = 0;
let batchDepth = 0;
let dirty = false;
let quiet = 0;
const listeners = new Set();

export const getState = () => state;
export const getVersion = () => version;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  if (quiet) return;
  version++;
  listeners.forEach((fn) => fn());
}

function persist() {
  if (quiet) return;
  if (batchDepth) {
    dirty = true;
    return;
  }
  if (!storage) return;
  try {
    storage.setItem(DB_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not persist database', e);
  }
}

export function replaceState(next) {
  state = next;
  persist();
  notify();
}

export function loadPersisted() {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPersisted() {
  storage?.removeItem(DB_KEY);
}

/** Run fn against a draft copy; commit only if it returns without throwing. */
export function tx(fn) {
  const draft = structuredClone(state);
  const result = fn(draft);
  state = draft;
  persist();
  notify();
  return result;
}

/** Defer persistence until the outermost batch finishes (used by catch-up jobs). */
export function batch(fn) {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (!batchDepth && dirty) {
      dirty = false;
      persist();
    }
  }
}

/** Run fn and throw away every write it made. Used by the security test harness. */
export function withRollback(fn) {
  const snapshot = state;
  quiet++;
  try {
    return fn();
  } finally {
    state = snapshot;
    quiet--;
  }
}

export function getSessionUid() {
  return storage?.getItem(SESSION_KEY) || null;
}

export function setSessionUid(uid) {
  if (!storage) return;
  if (uid) storage.setItem(SESSION_KEY, uid);
  else storage.removeItem(SESSION_KEY);
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
