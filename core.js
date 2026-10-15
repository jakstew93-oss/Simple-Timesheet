// Timesheet rules with no screen code, so they can be tested on their own (see tests/).
(function (root) {
  'use strict';

  const STAGES = [
    { key: 'start', label: 'Start' },
    { key: 'onSite', label: 'On site' },
    { key: 'offSite', label: 'Off site' },
    { key: 'finish', label: 'Finish' },
  ];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const DEFAULT_SETTINGS = {
    company: { name: '', address: '', phone: '', email: '', logo: '' },
    employee: { name: '' },
    jobLabel: 'Job / reference',
    weekEnds: 0, // 0 = Sunday ... 6 = Saturday
    currency: '£',
    mileageRate: 0.45,
    theme: 'forest',
    weather: true,
  };

  // ---------- Times and dates ----------
  const pad = n => String(n).padStart(2, '0');
  function isTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ''); }
  function toMinutes(hm) { return isTime(hm) ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) : null; }
  function nowHM(date = new Date()) { return pad(date.getHours()) + ':' + pad(date.getMinutes()); }
  function isoDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function parseDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(iso, days) { const d = parseDate(iso); d.setDate(d.getDate() + days); return isoDate(d); }

  /** Minutes between two times, carrying on past midnight when the second is earlier. */
  function span(from, to) {
    const a = toMinutes(from), b = toMinutes(to);
    if (a == null || b == null) return 0;
    return b >= a ? b - a : b + 24 * 60 - a;
  }
  /** Paid time for an entry: Start to Finish. No breaks are taken off. */
  function entryMinutes(entry) { return span(entry.start, entry.finish); }
  /** Time actually on site, when both on-site times are filled in. */
  function siteMinutes(entry) { return span(entry.onSite, entry.offSite); }

  function formatMinutes(mins) {
    if (!mins) return '0h';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  }
  function decimalHours(mins) { return (Math.round(mins / 60 * 100) / 100).toFixed(2); }

  /** The last day of the week containing [iso], for a week ending on [weekEnds] (0 = Sunday). */
  function weekEnding(iso, weekEnds = 0) {
    const day = parseDate(iso).getDay();
    return addDays(iso, (weekEnds - day + 7) % 7);
  }
  function weekDays(ending) { return Array.from({ length: 7 }, (_, i) => addDays(ending, i - 6)); }
  function formatDate(iso, style = 'short') {
    const d = parseDate(iso);
    if (style === 'long') return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    if (style === 'day') return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  // ---------- Entries ----------
  function entriesForWeek(entries, ending) {
    const days = new Set(weekDays(ending));
    return entries.filter(e => days.has(e.date)).sort(byDateAndStart);
  }
  function byDateAndStart(a, b) { return a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''); }
  function totalMinutes(entries) { return entries.reduce((sum, e) => sum + entryMinutes(e), 0); }
  /** Which stage the next tap of the Quick Start button fills in. */
  function nextStage(draft) { const i = STAGES.findIndex(s => !isTime(draft[s.key])); return i === -1 ? null : i; }

  /** Problems that stop an entry being saved, in plain English. */
  function validate(entry) {
    const problems = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || '')) problems.push('Choose a date.');
    if (!isTime(entry.start)) problems.push('Add a start time.');
    if (!isTime(entry.finish)) problems.push('Add a finish time.');
    if (isTime(entry.start) && isTime(entry.finish) && entryMinutes(entry) === 0) problems.push('Start and finish can’t be the same time.');
    if (isTime(entry.onSite) !== isTime(entry.offSite) && (entry.onSite || entry.offSite)) problems.push('Fill in both on-site times, or neither.');
    return problems;
  }

  // ---------- CSV ----------
  function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(entries, settings) {
    const rows = [['Date', settings.jobLabel || 'Job', 'Start', 'On site', 'Off site', 'Finish', 'Hours', 'Hours (decimal)', 'Notes']];
    entries.slice().sort(byDateAndStart).forEach(e => {
      const mins = entryMinutes(e);
      rows.push([formatDate(e.date), e.job, e.start, e.onSite, e.offSite, e.finish, formatMinutes(mins), decimalHours(mins), e.notes]);
    });
    const total = totalMinutes(entries);
    rows.push(['Total', '', '', '', '', '', formatMinutes(total), decimalHours(total), '']);
    return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  }

  // ---------- Settings ----------
  function mergeSettings(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    return {
      ...DEFAULT_SETTINGS, ...s,
      company: { ...DEFAULT_SETTINGS.company, ...(s.company || {}) },
      employee: { ...DEFAULT_SETTINGS.employee, ...(s.employee || {}) },
    };
  }
  // A setup link carries the company details (not the logo, which is too big for a link) for a team to share.
  const SETUP_FIELDS = ['name', 'address', 'phone', 'email'];
  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(code) {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function setupCode(settings) {
    const company = {};
    SETUP_FIELDS.forEach(k => { if (settings.company[k]) company[k] = settings.company[k]; });
    return toBase64Url(JSON.stringify({ v: 1, company, jobLabel: settings.jobLabel, weekEnds: settings.weekEnds, currency: settings.currency, mileageRate: settings.mileageRate }));
  }
  /** Reads a setup link's code. Throws with a plain reason if it isn't one. */
  function readSetupCode(code) {
    let data;
    try { data = JSON.parse(fromBase64Url(code)); } catch (_) { throw new Error('This setup link is incomplete or damaged.'); }
    if (!data || data.v !== 1 || typeof data.company !== 'object') throw new Error('This isn’t a timesheet setup link.');
    const company = {};
    SETUP_FIELDS.forEach(k => { if (typeof data.company[k] === 'string') company[k] = data.company[k].slice(0, 300); });
    const out = { company };
    if (typeof data.jobLabel === 'string' && data.jobLabel.trim()) out.jobLabel = data.jobLabel.slice(0, 40);
    if (Number.isInteger(data.weekEnds) && data.weekEnds >= 0 && data.weekEnds <= 6) out.weekEnds = data.weekEnds;
    if (typeof data.currency === 'string' && data.currency.length <= 3) out.currency = data.currency;
    if (typeof data.mileageRate === 'number' && data.mileageRate >= 0 && data.mileageRate < 10) out.mileageRate = data.mileageRate;
    return out;
  }
  function applySetup(settings, setup) {
    return mergeSettings({ ...settings, ...setup, company: { ...settings.company, ...setup.company } });
  }

  // ---------- Expenses ----------
  const EXPENSE_TYPES = [
    { key: 'mileage', label: 'Mileage' },
    { key: 'parking', label: 'Parking' },
    { key: 'fuel', label: 'Fuel' },
    { key: 'materials', label: 'Materials' },
    { key: 'tools', label: 'Tools' },
    { key: 'food', label: 'Food' },
    { key: 'travel', label: 'Travel' },
    { key: 'other', label: 'Other' },
  ];
  function expenseAmount(item, settings) {
    if (item.type === 'mileage') return Math.round((Number(item.miles) || 0) * (Number(settings.mileageRate) || 0) * 100) / 100;
    return Math.round((Number(item.amount) || 0) * 100) / 100;
  }
  function money(amount, settings) { return (settings.currency || '£') + (Number(amount) || 0).toFixed(2); }

  const api = {
    STAGES, WEEKDAYS, DEFAULT_SETTINGS, EXPENSE_TYPES,
    isTime, toMinutes, nowHM, isoDate, parseDate, addDays, span, entryMinutes, siteMinutes, formatMinutes, decimalHours,
    weekEnding, weekDays, formatDate, entriesForWeek, byDateAndStart, totalMinutes, nextStage, validate,
    toCSV, mergeSettings, setupCode, readSetupCode, applySetup, expenseAmount, money,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TS = api;
})(typeof window === 'undefined' ? globalThis : window);
