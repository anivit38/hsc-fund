// Node-only file-backed storage adapter for store.js. Kept out of store.js
// itself so that file stays safe to bundle into the browser build. Import this
// only from the Express server entrypoint (src/server/index.js).

import fs from 'node:fs';
import path from 'node:path';

export function createFileStorage(file = process.env.DB_FILE || path.join(process.cwd(), 'data', 'db.json')) {
  const dir = path.dirname(file);
  const cache = new Map();
  return {
    file,
    getItem(key) {
      if (cache.has(key)) return cache.get(key);
      try {
        const raw = fs.readFileSync(file, 'utf8');
        cache.set(key, raw);
        return raw;
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      cache.set(key, value);
      try {
        fs.mkdirSync(dir, { recursive: true });
        // Write to a temp file then rename, so a crash mid-write never corrupts db.json.
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, value);
        fs.renameSync(tmp, file);
      } catch (e) {
        console.warn(`Could not persist ${file}:`, e.message);
      }
    },
    removeItem(key) {
      cache.delete(key);
      try {
        fs.unlinkSync(file);
      } catch {
        /* nothing to remove */
      }
    },
  };
}
