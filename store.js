// Where everything is kept on the phone: entries and settings in localStorage, expenses (with receipt photos) in IndexedDB.
(function (root) {
  'use strict';
  const KEYS = { settings: 'st_settings_v1', entries: 'st_entries_v1', draft: 'st_draft_v1', view: 'st_view_v1', weather: 'st_weather_v1' };
  const DB_NAME = 'simple-timesheet', DB_STORE = 'expenses';

  function readJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (_) { return fallback; }
  }
  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

  const settings = {
    get: () => TS.mergeSettings(readJSON(KEYS.settings, {})),
    set: s => writeJSON(KEYS.settings, s),
  };
  const entries = {
    all: () => { const v = readJSON(KEYS.entries, []); return Array.isArray(v) ? v : []; },
    save(entry) {
      const list = entries.all().filter(e => e.id !== entry.id);
      list.push(entry); list.sort(TS.byDateAndStart); writeJSON(KEYS.entries, list);
    },
    remove(id) { writeJSON(KEYS.entries, entries.all().filter(e => e.id !== id)); },
    replaceAll(list) { writeJSON(KEYS.entries, list); },
  };
  const draft = {
    get: () => readJSON(KEYS.draft, {}) || {},
    set: d => writeJSON(KEYS.draft, d),
    clear: () => localStorage.removeItem(KEYS.draft),
  };

  let dbPromise;
  function db() {
    dbPromise = dbPromise || new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(mode, work) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(DB_STORE, mode), store = t.objectStore(DB_STORE);
      const result = work(store);
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  }
  const expenses = {
    all: () => tx('readonly', s => s.getAll()).then(list => (list || []).sort((a, b) => a.date.localeCompare(b.date))),
    save: item => tx('readwrite', s => { s.put(item); }),
    remove: id => tx('readwrite', s => { s.delete(id); }),
    replaceAll: list => tx('readwrite', s => { s.clear(); list.forEach(i => s.put(i)); }),
  };

  // ---------- Backup ----------
  const BACKUP_FORMAT = 'simple-timesheet-backup';
  async function backup() {
    return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), settings: settings.get(), entries: entries.all(), expenses: await expenses.all() };
  }
  /** Checks a backup file and returns it, or throws with a plain reason. */
  function checkBackup(data) {
    if (!data || data.format !== BACKUP_FORMAT) throw new Error('This isn’t a timesheet backup file.');
    if (data.version !== 1) throw new Error('This backup was made by a newer version of the app.');
    if (!Array.isArray(data.entries) || !Array.isArray(data.expenses) || typeof data.settings !== 'object') throw new Error('The backup file is damaged.');
    if (data.entries.some(e => !e || typeof e.id !== 'string' || typeof e.date !== 'string')) throw new Error('The backup file is damaged.');
    if (data.expenses.some(e => !e || typeof e.id !== 'string' || typeof e.date !== 'string')) throw new Error('The backup file is damaged.');
    return data;
  }
  async function restore(data) {
    checkBackup(data);
    await expenses.replaceAll(data.expenses);
    settings.set(TS.mergeSettings(data.settings));
    entries.replaceAll(data.entries);
    draft.clear();
  }

  const api = { KEYS, settings, entries, draft, expenses, backup, checkBackup, restore, readJSON, writeJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Store = api;
})(typeof window === 'undefined' ? globalThis : window);
