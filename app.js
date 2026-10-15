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
  let sheetMonth = today().slice(0, 7); // the month on the Week tab when timesheets are monthly
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
    applyPeriodLabels();
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

  // ---------- Week or month (Settings → Timesheets by) ----------
  // The Week tab shows a week or a whole month, depending on the setting.
  function period() {
    if (settings.period === 'month') {
      const label = TS.monthLabel(sheetMonth);
      return { noun: 'month', days: TS.monthDays(sheetMonth), kicker: 'Hours for', title: label, name: label, file: label,
        list: all => TS.entriesForMonth(all, sheetMonth), pdf: { month: sheetMonth } };
    }
    const ending = TS.formatDate(weekEnd);
    return { noun: 'week', days: TS.weekDays(weekEnd), kicker: 'Week ending', title: TS.formatDate(weekEnd, 'long'), name: 'the week ending ' + ending,
      file: 'w-e ' + ending.replace(/\//g, '-'), list: all => TS.entriesForWeek(all, weekEnd), pdf: { ending: weekEnd } };
  }
  function applyPeriodLabels() {
    const noun = settings.period === 'month' ? 'month' : 'week', Noun = noun[0].toUpperCase() + noun.slice(1);
    $('tab-week-label').textContent = Noun;
    $('week-prev').setAttribute('aria-label', 'Previous ' + noun);
    $('week-next').setAttribute('aria-label', 'Next ' + noun);
    $('week-clear').textContent = `Clear this ${noun} and start fresh`;
  }
  function renderWeek() {
    const p = period(), list = p.list(Store.entries.all());
    $('week-kicker').textContent = p.kicker;
    $('week-title').textContent = p.title;
    $('week-total').textContent = TS.formatMinutes(TS.totalMinutes(list));
    $('week-days').textContent = String(new Set(list.map(e => e.date)).size);
    const pay = TS.hasRates(settings), sums = TS.payTotals(list, settings);
    $('week-pay-box').hidden = !pay;
    if (pay) {
      $('week-pay').textContent = TS.money(sums.pay, settings);
      $('week-pay-detail').textContent = `On site ${TS.formatMinutes(sums.work)} · travel ${TS.formatMinutes(sums.travel)}`;
    }
    const box = $('week-list'); box.replaceChildren();
    // A month shows only the days worked (and today), so the buttons aren't 31 cards down.
    const days = p.noun === 'month' ? p.days.filter(day => day === today() || list.some(e => e.date === day)) : p.days;
    if (!days.length) { const card = el('div', 'card'); card.append(el('p', 'empty', 'No entries this month yet.')); box.append(card); }
    days.forEach(day => {
      const dayEntries = list.filter(e => e.date === day);
      const card = el('div', 'card day' + (day === today() ? ' is-today' : ''));
      const head = el('div', 'day-head');
      head.append(el('h3', null, TS.formatDate(day, 'day')), el('p', 'small', dayEntries.length ? TS.formatMinutes(TS.totalMinutes(dayEntries)) : ''));
      card.append(head);
      if (dayEntries.length) { const ul = el('ul', 'entries'); renderList(ul, dayEntries, ''); card.append(ul); }
      box.append(card);
    });
  }
  function movePeriod(by) {
    if (settings.period === 'month') sheetMonth = TS.shiftMonth(sheetMonth, by); else weekEnd = TS.addDays(weekEnd, 7 * by);
    renderWeek();
  }
  $('week-prev').addEventListener('click', () => movePeriod(-1));
  $('week-next').addEventListener('click', () => movePeriod(1));
  $('week-add').addEventListener('click', () => {
    const days = period().days, last = days[days.length - 1];
    openEntry({ date: days.includes(today()) ? today() : last > today() ? days[0] : last });
  });
  function weekFileName(ext) { return safeName(`Timesheet ${settings.employee.name || ''} ${period().file}`).replace(/\s+/g, ' ') + '.' + ext; }
  async function weekPdf() {
    const PDFLib = await loadPdfLib();
    const bytes = await TSPdf.timesheetPdf(PDFLib, { entries: Store.entries.all(), settings: pdfSettings(), ...period().pdf, signedDate: $('week-sign-date').value });
    return new Blob([bytes], { type: 'application/pdf' });
  }
  $('week-pdf').addEventListener('click', () => withBusy($('week-pdf'), async () => previewPdf(await weekPdf(), weekFileName('pdf'), 'Timesheet')));
  $('week-share').addEventListener('click', () => withBusy($('week-share'), async () => share(await weekPdf(), weekFileName('pdf'), 'Timesheet')));
  $('week-csv').addEventListener('click', () => {
    const csv = TS.toCSV(period().list(Store.entries.all()), settings);
    // No byte-order mark: phone viewers and Google Sheets show it as junk in the top-left cell.
    download(new Blob([csv], { type: 'text/csv' }), weekFileName('csv'));
  });
  $('week-clear').addEventListener('click', () => {
    const p = period(), list = p.list(Store.entries.all());
    const d = Store.draft.get(), draftIn = p.days.includes(d.date) && TS.STAGES.some(st => d[st.key]);
    if (!list.length && !draftIn) { toast(`There’s nothing to clear this ${p.noun}.`); return; }
    if (!confirm(`Delete all ${list.length} ${list.length === 1 ? 'entry' : 'entries'} for ${p.name}${draftIn ? ', and today’s unsaved log' : ''}?\n\nThis can’t be undone. Make the PDF first if you need a copy.`)) return;
    Store.entries.removeMany(list.map(e => e.id));
    if (draftIn) Store.draft.clear();
    refreshAll(); toast(p.noun === 'month' ? 'Month cleared' : 'Week cleared');
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
    $('pdf-name').textContent = name;
    $('pdf-ready').hidden = true; $('pdf-pages').hidden = false;
    $('pdf-download').href = previewUrl; $('pdf-download').download = name;
    $('pdf-share').onclick = () => share(blob, name, title);
    d.showModal();
    renderPages(blob);
  }
  closeOnButtons($('pdf-dialog'));

  // Phones (Chrome on Android) can't show a PDF in the page, so draw each page as a picture with pdf.js.
  let pdfJsLoading, previewRun = 0;
  function loadPdfJs() {
    pdfJsLoading = pdfJsLoading || new Promise((resolve, reject) => {
      const s = el('script'); s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; resolve(window.pdfjsLib); };
      s.onerror = () => { pdfJsLoading = null; reject(new Error('The preview couldn’t load.')); };
      document.head.append(s);
    });
    return pdfJsLoading;
  }
  async function renderPages(blob) {
    const run = ++previewRun, box = $('pdf-pages');
    box.replaceChildren(el('p', 'empty', 'Loading preview…'));
    try {
      const pdfjsLib = await loadPdfJs();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
      if (run !== previewRun) return;
      box.replaceChildren();
      const cssWidth = box.clientWidth - 20 || 320;
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        if (run !== previewRun) return;
        const base = page.getViewport({ scale: 1 });
        // Extra resolution so it stays sharp when you pinch to zoom.
        const scale = Math.min(cssWidth * Math.min((window.devicePixelRatio || 1) * 1.5, 4), 3000) / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = el('canvas'); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
        canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`);
        box.append(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
      doc.destroy();
    } catch (e) {
      console.error(e);
      if (run === previewRun) { $('pdf-pages').hidden = true; $('pdf-ready').hidden = false; }
    }
  }
  $('pdf-dialog').addEventListener('close', () => { previewRun++; $('pdf-pages').replaceChildren(); });

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
  const monthLabel = TS.monthLabel, shiftMonth = TS.shiftMonth;
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
    const bytes = await TSPdf.expensesPdf(PDFLib, { items, settings: pdfSettings(), title: monthLabel(month), signedDate: $('expense-sign-date').value });
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
    form.elements.period.value = settings.period;
    form.elements.weekEnds.closest('.field').hidden = settings.period === 'month';
    form.elements.currency.value = settings.currency;
    form.elements.mileageRate.value = settings.mileageRate;
    form.elements.hourlyRate.value = settings.hourlyRate;
    form.elements.travelRate.value = settings.travelRate;
    drawSavedSignature();
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
      period: f.period.value === 'month' ? 'month' : 'week',
      currency: f.currency.value.trim() || '£',
      mileageRate: Math.max(0, Number(f.mileageRate.value) || 0),
      hourlyRate: Math.max(0, Number(f.hourlyRate.value) || 0),
      travelRate: Math.max(0, Number(f.travelRate.value) || 0),
      theme: f.theme.value,
      weather: f.weather.checked,
    });
    Store.settings.set(settings);
    if (weekChanged) weekEnd = TS.weekEnding(today(), settings.weekEnds);
    applySettings();
    f.weekEnds.closest('.field').hidden = settings.period === 'month';
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

  // Signature pad: drawn with a finger, saved as a PNG in settings.
  const pad = $('sign-pad'), pen = pad.getContext('2d');
  let drawing = false, signed = false;
  function drawSavedSignature() {
    pen.clearRect(0, 0, pad.width, pad.height);
    if (!settings.signature) return;
    const img = new Image(); img.onload = () => pen.drawImage(img, 0, 0, pad.width, pad.height); img.src = settings.signature;
  }
  function padPoint(e) { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; }
  pad.addEventListener('pointerdown', e => {
    drawing = true; signed = false; pad.setPointerCapture(e.pointerId);
    pen.lineWidth = 3.5; pen.lineCap = pen.lineJoin = 'round'; pen.strokeStyle = '#0b1f4d';
    pen.beginPath(); pen.moveTo(...padPoint(e));
  });
  pad.addEventListener('pointermove', e => { if (!drawing) return; pen.lineTo(...padPoint(e)); pen.stroke(); signed = true; });
  function endStroke() {
    if (!drawing) return; drawing = false;
    if (!signed) return;
    settings = TS.mergeSettings({ ...settings, signature: pad.toDataURL('image/png') });
    Store.settings.set(settings); renderSignNotes();
  }
  pad.addEventListener('pointerup', endStroke); pad.addEventListener('pointercancel', endStroke);
  $('sign-clear').addEventListener('click', () => {
    settings = TS.mergeSettings({ ...settings, signature: '' });
    Store.settings.set(settings); drawSavedSignature(); renderSignNotes(); toast('Signature cleared');
  });
  function renderSignNotes() {
    document.querySelectorAll('.sign-note').forEach(n => {
      n.textContent = settings.signature ? 'Your signature will be added at the bottom.' : 'No signature yet. Draw one in Settings to sign your PDFs.';
    });
  }

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
  $('week-sign-date').value = $('expense-sign-date').value = today();
  fillSettings(); applySettings(); renderSignNotes(); renderToday();
  let first = 'today';
  try { first = localStorage.getItem(Store.KEYS.view) || 'today'; } catch (_) {}
  if (!settings.company.name && !settings.employee.name) first = 'settings';
  showView(first);
  acceptSetupLink();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderToday(); Weather.refresh(); } });
  setTimeout(() => loadPdfLib().catch(() => {}), 1500); // ready before the first tap, so Share still counts as a tap
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
