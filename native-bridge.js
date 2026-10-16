// Links the web app to the Simple Timesheet Android app: watch and widget times, downloads, sharing and copying.
// Does nothing in an ordinary browser, where window.STNative doesn't exist. Same rules as the MDS Timesheet app.
(function (root) {
  'use strict';
  const TIME_FIELDS = ['start', 'onSite', 'offSite', 'finish'];
  const STAGES = ['Start', 'On site', 'Off site', 'Finish'];

  /** Checks a set of tap times from the app and turns it into a Today's log draft. Throws if it isn't valid. */
  function normalise(value) {
    if (!value || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id) || !Array.isArray(value.times) || value.times.length < 1 || value.times.length > 4)
      throw new Error('Invalid recorded times.');
    let previous = 0;
    const times = value.times.map(t => {
      if (!Number.isSafeInteger(t.epochMillis) || t.epochMillis < 946684800000 || t.epochMillis > 4102444800000 ||
          !Number.isInteger(t.offsetSeconds) || Math.abs(t.offsetSeconds) > 64800 || t.epochMillis < previous)
        throw new Error('The recorded times are invalid or out of order.');
      previous = t.epochMillis;
      return { epochMillis: t.epochMillis, offsetSeconds: t.offsetSeconds };
    });
    const local = times.map(t => new Date(t.epochMillis + t.offsetSeconds * 1000).toISOString());
    const draft = { date: local[0].slice(0, 10) };
    local.forEach((iso, i) => { draft[TIME_FIELDS[i]] = iso.slice(11, 16); });
    draft._capture = { id: value.id, times };
    return { draft, local };
  }
  // The set to bring into Today's log: the draft's own set if the watch has sent more of it, otherwise the newest
  // set that hasn't already been saved as an entry.
  function pickRun(runs, savedIds, draftId) {
    const last = r => r.times[r.times.length - 1].epochMillis;
    const open = (runs || []).filter(r => r && r.id && Array.isArray(r.times) && r.times.length && !savedIds.has(r.id));
    return open.find(r => r.id === draftId) || open.sort((a, b) => last(a) - last(b)).pop() || null;
  }
  // Fills the Today's log draft from a recorded set. Each tap is brought in once: [seen] lists the taps already
  // brought in, so a time corrected or cleared by hand (or by Reset) stays that way when the next tap arrives.
  // On a set the watch took over from the phone, the first [baseCount] times came from the phone and are skipped.
  // Times already in the draft from somewhere else are never overwritten.
  function mergeDraft(draft, recorded, seen = [], baseCount = 0) {
    draft = draft || {};
    const incoming = recorded.draft, id = incoming._capture.id, times = incoming._capture.times;
    const same = !!draft._capture && draft._capture.id === id;
    if (!same && TIME_FIELDS.some(k => draft[k])) return null;
    const known = new Set([...seen, ...(same && Array.isArray(draft._capture.times) ? draft._capture.times.map(t => t.epochMillis) : [])]);
    const fresh = times.map((t, i) => i).filter(i => i >= baseCount && !known.has(times[i].epochMillis));
    if (!fresh.length) return { draft, changed: false, added: 0 };
    const next = { ...draft, date: same && draft.date || incoming.date, _capture: incoming._capture };
    fresh.forEach(i => { next[TIME_FIELDS[i]] = incoming[TIME_FIELDS[i]]; });
    return { draft: next, changed: true, added: fresh.length, taps: fresh.map(i => times[i].epochMillis), last: fresh[fresh.length - 1] };
  }
  // The Today's log times as tap times the watch understands, from Start up to the first empty stage. A stage
  // still showing the time the watch recorded keeps the watch's exact timestamp.
  function draftTimes(draft, today) {
    const out = [], date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date || '') ? draft.date : today;
    const recorded = draft._capture && Array.isArray(draft._capture.times) ? draft._capture.times : [];
    for (let i = 0; i < TIME_FIELDS.length; i++) {
      const hm = draft[TIME_FIELDS[i]]; if (!/^\d{2}:\d{2}$/.test(hm || '')) break;
      const prev = out.length ? out[out.length - 1].epochMillis : 0, r = recorded[i];
      if (r && new Date(r.epochMillis + r.offsetSeconds * 1000).toISOString().slice(11, 16) === hm && r.epochMillis >= prev) {
        out.push({ epochMillis: r.epochMillis, offsetSeconds: r.offsetSeconds }); continue;
      }
      let d = new Date(date + 'T' + hm + ':00');
      while (d.getTime() < prev) d = new Date(d.getTime() + 86400000); // carried on past midnight
      out.push({ epochMillis: d.getTime(), offsetSeconds: -d.getTimezoneOffset() * 60 });
    }
    return out;
  }
  // What to tell the watch about the day in Today's log: in progress, or cleared or saved since it was last sent.
  function dayMessage(draft, seen, lastSent, saved, today) {
    draft = draft || {};
    const times = draftTimes(draft, today);
    if (times.length) return { state: 'active', id: draft._capture && draft._capture.id || null, times, seen };
    if (lastSent && lastSent.state === 'active') return { state: saved ? 'saved' : 'cleared', id: lastSent.id, times: [], seen: [] };
    return null;
  }

  const api = { normalise, pickRun, mergeDraft, draftTimes, dayMessage, TIME_FIELDS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.STBridgeLogic = api;

  const native = root.STNative;
  if (!native) return;
  document.documentElement.dataset.stApp = 'android';
  const toast = m => { if (root.STApp) root.STApp.toast(m); };
  const DRAFT_KEY = 'st_draft_v1', ENTRIES_KEY = 'st_entries_v1';

  // ---------- Watch and widget times ----------
  function savedIds() {
    try { return new Set((JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]') || []).map(e => e.captureId).filter(Boolean)); }
    catch (_) { return new Set(); }
  }
  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; } }
  const warned = new Set();
  // The taps from each recorded set already brought into Today's log, so Reset and hand edits stick.
  const HANDLED_KEY = 'st_watch_handled_v1';
  function handled() { try { return JSON.parse(localStorage.getItem(HANDLED_KEY) || '{}') || {}; } catch (_) { return {}; } }
  function seenTaps(id) { const v = handled()[id]; return Array.isArray(v) ? v : []; }
  function markHandled(id, taps) {
    const all = handled(), list = [...new Set([...seenTaps(id), ...taps])]; delete all[id]; all[id] = list;
    const ids = Object.keys(all); ids.slice(0, Math.max(0, ids.length - 50)).forEach(k => delete all[k]);
    localStorage.setItem(HANDLED_KEY, JSON.stringify(all));
  }
  function pull() {
    let runs; try { runs = JSON.parse(native.pendingRuns() || '[]'); } catch (_) { return; }
    const current = readDraft();
    const run = pickRun(runs, savedIds(), current._capture && current._capture.id); if (!run) return;
    let recorded; try { recorded = normalise({ id: run.id, times: run.times }); } catch (_) { return; }
    const result = mergeDraft(current, recorded, seenTaps(run.id), run.baseCount | 0);
    if (!result) { if (!warned.has(run.id)) { warned.add(run.id); toast('⌚ Watch times are waiting. Save or reset today’s log to bring them in.'); } return; }
    if (!result.changed) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(result.draft));
    markHandled(run.id, result.taps);
    // Don't redraw under someone mid-typing; the next check brings the times in.
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.quick') && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    if (!typing && root.STApp) root.STApp.refresh();
    toast('⌚ ' + STAGES[result.last] + ' ' + result.draft[TIME_FIELDS[result.last]] + ' added from your ' + (run.source === 'watch' ? 'watch' : 'widget'));
  }

  // ---------- The day in progress, sent to the watch ----------
  // Times logged on the phone show on the watch, and its next tap carries on from there.
  const SENT_KEY = 'st_watch_sent_v1';
  let savedId = null;
  document.addEventListener('st-entry-saved', () => { try { savedId = (JSON.parse(localStorage.getItem(SENT_KEY) || 'null') || {}).id || null; } catch (_) {} });
  function newId() { return root.crypto && crypto.randomUUID ? crypto.randomUUID() : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sendDay() {
    if (!native.syncDay) return;
    let lastSent; try { lastSent = JSON.parse(localStorage.getItem(SENT_KEY) || 'null'); } catch (_) { lastSent = null; }
    const draft = readDraft(), id = draft._capture && draft._capture.id;
    const message = dayMessage(draft, id ? seenTaps(id) : [], lastSent, !!lastSent && (lastSent.id === savedId || savedIds().has(lastSent.id)), today());
    if (!message) return;
    if (!message.id) {
      // A day started on the phone gets its own id, so the watch's taps come back into this entry.
      message.id = newId();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, _capture: { id: message.id, times: message.times } }));
    }
    const sig = JSON.stringify(message);
    if (lastSent && lastSent.sig === sig) return;
    try { native.syncDay(JSON.stringify({ ...message, rev: Date.now() })); } catch (_) { return; }
    localStorage.setItem(SENT_KEY, JSON.stringify({ id: message.id, state: message.state, sig }));
  }
  function check() { pull(); sendDay(); }
  setInterval(() => { if (!document.hidden) check(); }, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('load', check);
  // Send a time stamped or typed on the phone straight away rather than at the next check.
  ['click', 'change'].forEach(type => document.addEventListener(type, () => setTimeout(sendDay, 400), true));

  // ---------- Downloads ----------
  // Blob links can't be downloaded by the app directly, so hand the file over as base64.
  const realRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = url => setTimeout(() => realRevoke(url), 60000);
  function toBase64(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = () => reject(r.error); r.readAsDataURL(blob); }); }
  async function save(href, name) {
    try { const blob = await (await fetch(href)).blob(); native.saveFile(name || 'download', blob.type || 'application/octet-stream', await toBase64(blob)); }
    catch (_) { toast('Couldn’t save the file. Try again.'); }
  }
  const isFileLink = a => a && a.hasAttribute('download') && /^(blob|data):/.test(a.href || '');
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (isFileLink(this)) { save(this.href, this.getAttribute('download')); return; } return realClick.call(this); };
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[download]'); if (isFileLink(a)) { e.preventDefault(); save(a.href, a.getAttribute('download')); } }, true);

  // ---------- Sharing and copying ----------
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable: true, value: async (data = {}) => {
    const file = data.files && data.files[0];
    if (file) native.shareFile(file.name || 'file', file.type || 'application/octet-stream', await toBase64(file), data.title || '');
    else native.shareText(data.title || '', [data.text, data.url].filter(Boolean).join('\n'));
  } });
  const writeText = text => { native.copyText(String(text)); return Promise.resolve(); };
  if (navigator.clipboard) try { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: writeText }); } catch (_) {}
  else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText: () => Promise.resolve('') } });

  // ---------- App version and updates ----------
  function addAppCard() {
    const page = document.getElementById('view-settings'); if (!page || document.getElementById('st-app-card')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'st-app-card';
    const h = document.createElement('h2'); h.textContent = 'Simple Timesheet app';
    const p = document.createElement('p'); p.className = 'small';
    p.textContent = 'Version ' + ((native.appVersion && native.appVersion()) || '?') + '. Watch and widget taps come into Today’s log by themselves. Updates are checked each time the app opens.';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn wide'; b.textContent = 'Check for updates';
    b.addEventListener('click', () => native.checkForUpdates());
    card.append(h, p, b); page.append(card);
  }
  addAppCard(); addEventListener('load', addAppCard);
  root.STBridge = { pull: check };
})(typeof window === 'undefined' ? globalThis : window);
