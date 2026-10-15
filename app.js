// Screens and buttons. The rules live in core.js, storage in store.js and the PDFs in pdf.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => TS.isoDate(new Date());
  const THEME_COLOURS = { forest: [0.12, 0.47, 0.33], paper: [0.2, 0.33, 0.55], midnight: [0.25, 0.4, 0.75], sand: [0.6, 0.38, 0.16], slate: [0.25, 0.3, 0.36] };
  const THEME_META = { forest: '#14532d', paper: '#f5f3ee', midnight: '#0f172a', sand: '#f3eadb', slate: '#1e293b' };

  let settings = Store.settings.get();
  let weekEnd = TS.weekEnding(today(), settings.weekEnds);
  let month = today().slice(0, 7);

  // ---------- Small helpers ----------
  let toastTimer;
  function toast(message) {
    const t = $('toast'); t.textContent = message; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function closeOnButtons(dialog) { dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close())); }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function share(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title }); } catch (e) { if (e.name !== 'AbortError') toast('Couldn’t share. The file has been downloaded instead.'), download(blob, name); }
    } else { download(blob, name); toast('Sharing isn’t available here, so the file has been downloaded.'); }
  }
  function safeName(text) { return String(text).replace(/[\\/:*?"<>|]+/g, '-').trim(); }
  let pdfLibLoading;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    pdfLibLoading = pdfLibLoading || new Promise((resolve, reject) => {
      const s = el('script'); s.src = 'vendor/pdf-lib.min.js';
      s.onload = () => resolve(window.PDFLib); s.onerror = () => { pdfLibLoading = null; reject(new Error('The PDF maker couldn’t load. Check your signal and try again.')); };
      document.head.append(s);
    });
    return pdfLibLoading;
  }
  function pdfSettings() { return { ...settings, accentRgb: THEME_COLOURS[settings.theme] || THEME_COLOURS.forest }; }

  // Shrinks a photo so it fits comfortably on the phone and in PDFs.
  function loadImage(file, maxSide, type, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const c = el('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        const g = c.getContext('2d');
        if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL(type, quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture couldn’t be opened. Try a JPEG or PNG.')); };
      img.src = url;
    });
  }

  // ---------- Tabs ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
    document.querySelectorAll('.tabs [role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === name)));
    try { localStorage.setItem(Store.KEYS.view, name); } catch (_) {}
    if (name === 'week') renderWeek();
    if (name === 'expenses') renderExpenses();
    if (name === 'today') renderToday();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabs [role=tab]').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));

  // ---------- Header and theme ----------
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name=theme-color]').content = THEME_META[settings.theme] || THEME_META.forest;
    const c = settings.company;
    $('header-company').textContent = c.name || 'Timesheet';
    $('header-name').textContent = settings.employee.name || '';
    document.title = c.name ? c.name + ' Timesheet' : 'Timesheet';
    const logo = $('header-logo'); logo.hidden = !c.logo; if (c.logo) logo.src = c.logo;
    document.querySelectorAll('.job-label').forEach(e => { e.textContent = settings.jobLabel || 'Job / reference'; });
    $('qs-job-label').textContent = settings.jobLabel || 'Job / reference';
    Weather.init($('weather'), settings.weather);
  }

  // ---------- Today: Quick Start ----------
  function draft() { const d = Store.draft.get(); if (!d.date) d.date = today(); return d; }
  function saveDraft(d) { Store.draft.set(d); renderToday(); }
  function renderToday() {
    const d = draft();
    $('qs-date').value = d.date;
    if (document.activeElement !== $('qs-job')) $('qs-job').value = d.job || '';
    if (document.activeElement !== $('qs-notes')) $('qs-notes').value = d.notes || '';
    const next = TS.nextStage(d);
    const stamp = $('qs-stamp');
    stamp.textContent = next == null ? 'Day complete' : TS.STAGES[next].label;
    stamp.disabled = next == null;
    const stages = $('qs-stages'); stages.replaceChildren();
    TS.STAGES.forEach((s, i) => {
      const box = el('label', 'stage' + (d[s.key] ? ' done' : '') + (i === next ? ' next' : ''));
      box.append(el('span', 'stage-label', s.label));
      const input = el('input'); input.type = 'time'; input.value = d[s.key] || ''; input.setAttribute('aria-label', s.label + ' time');
      input.addEventListener('change', () => { const cur = draft(); if (input.value) cur[s.key] = input.value; else delete cur[s.key]; saveDraft(cur); });
      box.append(input); stages.append(box);
    });
    const mins = TS.entryMinutes(d), site = TS.siteMinutes(d);
    $('qs-hours').textContent = mins ? 'Hours: ' + TS.formatMinutes(mins) + (site ? ' · on site ' + TS.formatMinutes(site) : '') : '';
    renderList($('today-list'), Store.entries.all().filter(e => e.date === today()), 'Nothing saved today yet.');
  }
  $('qs-stamp').addEventListener('click', () => {
    const d = draft(), next = TS.nextStage(d);
    if (next == null) return;
    d[TS.STAGES[next].key] = TS.nowHM();
    saveDraft(d);
    toast(TS.STAGES[next].label + ' ' + d[TS.STAGES[next].key]);
    if (navigator.vibrate) navigator.vibrate(30);
  });
  $('qs-date').addEventListener('change', e => { const d = draft(); d.date = e.target.value || today(); saveDraft(d); });
  ['job', 'notes'].forEach(k => $('qs-' + k).addEventListener('input', e => { const d = draft(); d[k] = e.target.value; Store.draft.set(d); }));
  $('qs-reset').addEventListener('click', () => {
    if (!confirm('Clear today’s log? Saved entries aren’t affected.')) return;
    Store.draft.clear(); renderToday();
  });
  $('qs-save').addEventListener('click', () => {
    const d = draft();
    const entry = { id: uid(), date: d.date, job: (d.job || '').trim(), start: d.start || '', onSite: d.onSite || '', offSite: d.offSite || '', finish: d.finish || '', notes: (d.notes || '').trim() };
    const problems = TS.validate(entry);
    if (problems.length) { toast(problems[0]); return; }
    Store.entries.save(entry); Store.draft.clear(); renderToday();
    toast('Saved · ' + TS.formatMinutes(TS.entryMinutes(entry)));
  });
  function tick() { $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  tick(); setInterval(tick, 10000);

  // ---------- Entry list (Today and Week) ----------
  function renderList(list, entries, empty) {
    list.replaceChildren();
    if (!entries.length) { list.append(el('li', 'empty', empty)); return; }
    entries.forEach(e => {
      const li = el('li', 'entry');
      const main = el('div', 'entry-main');
      main.append(el('p', 'entry-title', e.job || 'No ' + (settings.jobLabel || 'job').toLowerCase()));
      const times = [e.start, e.onSite && e.offSite ? 'site ' + e.onSite + '–' + e.offSite : '', e.finish].filter(Boolean).join(' · ');
      main.append(el('p', 'small', times + (e.notes ? ' — ' + e.notes : '')));
      li.append(main, el('p', 'entry-hours', TS.formatMinutes(TS.entryMinutes(e))));
      const edit = el('button', 'icon-btn', '✎'); edit.type = 'button'; edit.setAttribute('aria-label', 'Edit ' + (e.job || 'entry'));
      edit.onclick = () => openEntry(e);
      li.append(edit); list.append(li);
    });
  }

  // ---------- Week ----------
  function renderWeek() {
    const list = TS.entriesForWeek(Store.entries.all(), weekEnd);
    $('week-title').textContent = TS.formatDate(weekEnd, 'long');
    $('week-total').textContent = TS.formatMinutes(TS.totalMinutes(list));
    $('week-days').textContent = String(new Set(list.map(e => e.date)).size);
    const box = $('week-list'); box.replaceChildren();
    TS.weekDays(weekEnd).forEach(day => {
      const dayEntries = list.filter(e => e.date === day);
      const card = el('div', 'card day' + (day === today() ? ' is-today' : ''));
      const head = el('div', 'day-head');
      head.append(el('h3', null, TS.formatDate(day, 'day')), el('p', 'small', dayEntries.length ? TS.formatMinutes(TS.totalMinutes(dayEntries)) : ''));
      card.append(head);
      if (dayEntries.length) { const ul = el('ul', 'entries'); renderList(ul, dayEntries, ''); card.append(ul); }
      box.append(card);
    });
  }
  $('week-prev').addEventListener('click', () => { weekEnd = TS.addDays(weekEnd, -7); renderWeek(); });
  $('week-next').addEventListener('click', () => { weekEnd = TS.addDays(weekEnd, 7); renderWeek(); });
  $('week-add').addEventListener('click', () => openEntry({ date: weekEnd > today() ? today() : weekEnd }));
  function weekFileName(ext) { return safeName(`Timesheet ${settings.employee.name || ''} w-e ${TS.formatDate(weekEnd).replace(/\//g, '-')}`).replace(/\s+/g, ' ') + '.' + ext; }
  async function weekPdf() {
    const PDFLib = await loadPdfLib();
    const bytes = await TSPdf.timesheetPdf(PDFLib, { entries: Store.entries.all(), settings: pdfSettings(), ending: weekEnd });
    return new Blob([bytes], { type: 'application/pdf' });
  }
  $('week-pdf').addEventListener('click', () => withBusy($('week-pdf'), async () => previewPdf(await weekPdf(), weekFileName('pdf'), 'Timesheet')));
  $('week-share').addEventListener('click', () => withBusy($('week-share'), async () => share(await weekPdf(), weekFileName('pdf'), 'Timesheet')));
  $('week-csv').addEventListener('click', () => {
    const csv = TS.toCSV(TS.entriesForWeek(Store.entries.all(), weekEnd), settings);
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), weekFileName('csv'));
  });
  async function withBusy(button, work) {
    const label = button.textContent; button.disabled = true; button.textContent = 'Making PDF…';
    try { await work(); } catch (e) { toast(e.message || 'Something went wrong. Try again.'); console.error(e); }
    finally { button.disabled = false; button.textContent = label; }
  }

  // ---------- PDF preview ----------
  let previewUrl;
  function previewPdf(blob, name, title) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    const d = $('pdf-dialog');
    $('pdf-title').textContent = title;
    $('pdf-frame').src = previewUrl;
    $('pdf-download').href = previewUrl; $('pdf-download').download = name;
    $('pdf-share').onclick = () => share(blob, name, title);
    d.showModal();
  }
  closeOnButtons($('pdf-dialog'));

  // ---------- Entry editor ----------
  const entryDialog = $('entry-dialog'), entryForm = $('entry-form');
  let editing = null;
  function openEntry(entry) {
    editing = entry;
    $('entry-title').textContent = entry.id ? 'Edit entry' : 'Add an entry';
    ['date', 'job', 'start', 'onSite', 'offSite', 'finish', 'notes'].forEach(k => { entryForm.elements[k].value = entry[k] || ''; });
    $('entry-error').textContent = '';
    let del = entryForm.querySelector('.delete');
    if (del) del.remove();
    if (entry.id) {
      del = el('button', 'btn danger delete', 'Delete'); del.type = 'button';
      del.onclick = () => { if (confirm('Delete this entry?')) { Store.entries.remove(entry.id); entryDialog.close(); refreshAll(); toast('Entry deleted'); } };
      entryForm.querySelector('.row').prepend(del);
    }
    entryDialog.showModal();
  }
  entryForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = entryForm.elements;
    const entry = { id: editing.id || uid(), date: f.date.value, job: f.job.value.trim(), start: f.start.value, onSite: f.onSite.value, offSite: f.offSite.value, finish: f.finish.value, notes: f.notes.value.trim() };
    const problems = TS.validate(entry);
    if (problems.length) { $('entry-error').textContent = problems.join(' '); return; }
    Store.entries.save(entry); entryDialog.close(); refreshAll(); toast('Entry saved');
  });
  closeOnButtons(entryDialog);

  // ---------- Expenses ----------
  const expenseDialog = $('expense-dialog'), expenseForm = $('expense-form');
  TS.EXPENSE_TYPES.forEach(t => expenseForm.elements.type.append(new Option(t.label, t.key)));
  let editingExpense = null, receipt = '';
  function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); }
  function shiftMonth(m, by) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + by, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  async function monthItems() { return (await Store.expenses.all()).filter(i => i.date.startsWith(month)); }
  async function renderExpenses() {
    $('month-title').textContent = monthLabel(month);
    let items;
    try { items = await monthItems(); } catch (_) { items = []; toast('Expenses can’t be stored in this browser (private mode?).'); }
    $('month-total').textContent = TS.money(items.reduce((s, i) => s + TS.expenseAmount(i, settings), 0), settings);
    $('month-count').textContent = String(items.length);
    const list = $('expense-list'); list.replaceChildren();
    if (!items.length) list.append(el('li', 'empty', 'No expenses this month.'));
    items.forEach(it => {
      const li = el('li', 'entry'), main = el('div', 'entry-main');
      const type = (TS.EXPENSE_TYPES.find(t => t.key === it.type) || { label: it.type }).label;
      main.append(el('p', 'entry-title', it.description || type));
      main.append(el('p', 'small', TS.formatDate(it.date, 'day') + ' · ' + type + (it.type === 'mileage' ? ' · ' + (it.miles || 0) + ' miles' : '') + (it.receipt ? ' · 📎 receipt' : '')));
      li.append(main, el('p', 'entry-hours', TS.money(TS.expenseAmount(it, settings), settings)));
      const edit = el('button', 'icon-btn', '✎'); edit.type = 'button'; edit.setAttribute('aria-label', 'Edit ' + (it.description || type));
      edit.onclick = () => openExpense(it);
      li.append(edit); list.append(li);
    });
  }
  function showMileage() {
    const mileage = expenseForm.elements.type.value === 'mileage';
    expenseForm.querySelector('.amount-field').hidden = mileage;
    expenseForm.querySelector('.miles-field').hidden = !mileage;
  }
  function showReceipt() {
    const img = $('receipt-preview'); img.hidden = !receipt; if (receipt) img.src = receipt;
    $('receipt-remove').hidden = !receipt;
  }
  function openExpense(item) {
    editingExpense = item; receipt = item.receipt || '';
    $('expense-title').textContent = item.id ? 'Edit expense' : 'Add an expense';
    const f = expenseForm.elements;
    f.date.value = item.date || today(); f.type.value = item.type || 'parking'; f.description.value = item.description || '';
    f.amount.value = item.amount ?? ''; f.miles.value = item.miles ?? '';
    $('expense-error').textContent = '';
    let del = expenseForm.querySelector('.delete'); if (del) del.remove();
    if (item.id) {
      del = el('button', 'btn danger delete', 'Delete'); del.type = 'button';
      del.onclick = async () => { if (confirm('Delete this expense?')) { await Store.expenses.remove(item.id); expenseDialog.close(); renderExpenses(); toast('Expense deleted'); } };
      expenseForm.querySelector('.row').prepend(del);
    }
    showMileage(); showReceipt(); expenseDialog.showModal();
  }
  expenseForm.elements.type.addEventListener('change', showMileage);
  $('receipt-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try { receipt = await loadImage(file, 1600, 'image/jpeg', 0.8); showReceipt(); } catch (err) { $('expense-error').textContent = err.message; }
  });
  $('receipt-remove').addEventListener('click', () => { receipt = ''; showReceipt(); });
  expenseForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = expenseForm.elements, mileage = f.type.value === 'mileage';
    const item = { id: editingExpense.id || uid(), date: f.date.value, type: f.type.value, description: f.description.value.trim(), receipt };
    if (mileage) item.miles = Number(f.miles.value) || 0; else item.amount = Number(f.amount.value) || 0;
    if (!item.date) { $('expense-error').textContent = 'Choose a date.'; return; }
    if (mileage ? !(item.miles > 0) : !(item.amount > 0)) { $('expense-error').textContent = mileage ? 'Add the number of miles.' : 'Add the amount.'; return; }
    try { await Store.expenses.save(item); } catch (_) { $('expense-error').textContent = 'The expense couldn’t be saved. Your phone may be out of space.'; return; }
    month = item.date.slice(0, 7);
    expenseDialog.close(); renderExpenses(); toast('Expense saved');
  });
  closeOnButtons(expenseDialog);
  $('expense-add').addEventListener('click', () => openExpense({ date: today().startsWith(month) ? today() : month + '-01' }));
  $('month-prev').addEventListener('click', () => { month = shiftMonth(month, -1); renderExpenses(); });
  $('month-next').addEventListener('click', () => { month = shiftMonth(month, 1); renderExpenses(); });
  async function expensePdf() {
    const items = await monthItems();
    if (!items.length) throw new Error('There are no expenses this month to put in a claim.');
    const PDFLib = await loadPdfLib();
    const bytes = await TSPdf.expensesPdf(PDFLib, { items, settings: pdfSettings(), title: monthLabel(month) });
    return new Blob([bytes], { type: 'application/pdf' });
  }
  const expenseName = () => safeName(`Expenses ${settings.employee.name || ''} ${monthLabel(month)}`).replace(/\s+/g, ' ') + '.pdf';
  $('expense-pdf').addEventListener('click', () => withBusy($('expense-pdf'), async () => previewPdf(await expensePdf(), expenseName(), 'Expense claim')));
  $('expense-share').addEventListener('click', () => withBusy($('expense-share'), async () => share(await expensePdf(), expenseName(), 'Expense claim')));

  // ---------- Settings ----------
  const form = $('settings-form');
  TS.WEEKDAYS.forEach((d, i) => form.elements.weekEnds.append(new Option(d, String(i))));
  function fillSettings() {
    form.elements['employee.name'].value = settings.employee.name;
    ['name', 'address', 'phone', 'email'].forEach(k => { form.elements['company.' + k].value = settings.company[k]; });
    form.elements.jobLabel.value = settings.jobLabel;
    form.elements.weekEnds.value = String(settings.weekEnds);
    form.elements.currency.value = settings.currency;
    form.elements.mileageRate.value = settings.mileageRate;
    form.elements.theme.value = settings.theme;
    form.elements.weather.checked = settings.weather;
    const logo = $('logo-preview'); logo.hidden = !settings.company.logo; if (settings.company.logo) logo.src = settings.company.logo;
    $('logo-remove').hidden = !settings.company.logo;
    $('welcome').hidden = !!(settings.company.name || settings.employee.name);
  }
  let savedTimer;
  function saveSettings() {
    const f = form.elements;
    const weekChanged = Number(f.weekEnds.value) !== settings.weekEnds;
    settings = TS.mergeSettings({
      ...settings,
      employee: { name: f['employee.name'].value.trim() },
      company: { ...settings.company, name: f['company.name'].value.trim(), address: f['company.address'].value.trim(), phone: f['company.phone'].value.trim(), email: f['company.email'].value.trim() },
      jobLabel: f.jobLabel.value.trim() || 'Job / reference',
      weekEnds: Number(f.weekEnds.value),
      currency: f.currency.value.trim() || '£',
      mileageRate: Math.max(0, Number(f.mileageRate.value) || 0),
      theme: f.theme.value,
      weather: f.weather.checked,
    });
    Store.settings.set(settings);
    if (weekChanged) weekEnd = TS.weekEnding(today(), settings.weekEnds);
    applySettings();
    $('settings-saved').textContent = 'Saved'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { $('settings-saved').textContent = ''; }, 1500);
  }
  form.addEventListener('input', saveSettings);
  form.addEventListener('change', saveSettings);
  form.addEventListener('submit', e => e.preventDefault());
  $('logo-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      let logo = await loadImage(file, 400, 'image/png');
      if (logo.length > 400000) logo = await loadImage(file, 400, 'image/jpeg', 0.85);
      // Read settings only now: the form saves (and replaces them) while the picture loads.
      settings = TS.mergeSettings({ ...settings, company: { ...settings.company, logo } });
      Store.settings.set(settings); fillSettings(); applySettings(); toast('Logo added');
    } catch (err) { toast(err.message); }
  });
  $('logo-remove').addEventListener('click', () => { settings.company.logo = ''; Store.settings.set(settings); fillSettings(); applySettings(); });

  // A team setup link fills in the company details for whoever opens it.
  $('setup-share').addEventListener('click', async () => {
    if (!settings.company.name) { toast('Add the company name first.'); return; }
    const url = location.origin + location.pathname + '#setup=' + TS.setupCode(settings);
    const text = 'Set up your timesheet for ' + settings.company.name + ': ' + url;
    if (navigator.share) { try { await navigator.share({ title: 'Timesheet setup', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Setup link copied. Paste it into a message to your team.'); }
    catch (_) { prompt('Copy this link and send it to your team:', url); }
  });
  function acceptSetupLink() {
    if (!location.hash.startsWith('#setup=')) return;
    const code = location.hash.slice('#setup='.length);
    history.replaceState(null, '', location.pathname + location.search);
    let setup;
    try { setup = TS.readSetupCode(code); } catch (e) { alert(e.message); return; }
    const name = setup.company.name || 'this company';
    if (!confirm('Use the timesheet setup for ' + name + '?\n\nThis fills in the company details. Your entries aren’t changed.')) return;
    settings = TS.applySetup(settings, setup); Store.settings.set(settings);
    weekEnd = TS.weekEnding(today(), settings.weekEnds);
    fillSettings(); applySettings(); showView('settings');
    toast('Company details added. Now add your name.');
    form.elements['employee.name'].focus();
  }
  window.addEventListener('hashchange', acceptSetupLink);

  // Backup and restore
  $('backup-save').addEventListener('click', async () => {
    try {
      const data = await Store.backup();
      download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'timesheet-backup-' + today() + '.json');
      toast('Backup saved. Keep it somewhere safe, like Google Drive.');
    } catch (_) { toast('The backup couldn’t be made. Try again.'); }
  });
  $('backup-load').addEventListener('click', () => {
    const input = el('input'); input.type = 'file'; input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      let data;
      try { data = Store.checkBackup(JSON.parse(await file.text())); } catch (e) { alert(e instanceof SyntaxError ? 'This isn’t a timesheet backup file.' : e.message); return; }
      if (!confirm(`Replace everything on this phone with the backup from ${new Date(data.exportedAt).toLocaleDateString('en-GB')}?\n\n${data.entries.length} entries and ${data.expenses.length} expenses.`)) return;
      try { await Store.restore(data); location.reload(); } catch (_) { alert('The backup couldn’t be restored. Try again.'); }
    };
    input.click();
  });

  // ---------- Start up ----------
  function refreshAll() { renderToday(); if (!$('view-week').hidden) renderWeek(); }
  fillSettings(); applySettings(); renderToday();
  let first = 'today';
  try { first = localStorage.getItem(Store.KEYS.view) || 'today'; } catch (_) {}
  if (!settings.company.name && !settings.employee.name) first = 'settings';
  showView(first);
  acceptSetupLink();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderToday(); Weather.refresh(); } });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
