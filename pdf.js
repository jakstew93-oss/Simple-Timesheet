// Builds the timesheet and expense PDFs from the company details in Settings. Needs PDFLib (vendor/pdf-lib.min.js).
(function (root) {
  'use strict';
  const TS = root.TS || (typeof require === 'function' ? require('./core.js') : null);

  const A4 = [595.28, 841.89];
  const INK = [0.13, 0.15, 0.17], MUTED = [0.42, 0.45, 0.48], LINE = [0.8, 0.82, 0.84], SHADE = [0.94, 0.95, 0.96];

  // The standard PDF fonts only cover Western characters; swap anything else so the PDF never fails to build.
  function clean(text) {
    return String(text ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
      .replace(/…/g, '...').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF€]/gu, '?');
  }
  function fit(text, font, size, width) {
    let s = clean(text);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length && font.widthOfTextAtSize(s + '...', size) > width) s = s.slice(0, -1);
    return s + '...';
  }
  function wrap(text, font, size, width) {
    const words = clean(text).split(' '), lines = [];
    let line = '';
    words.forEach(w => {
      const next = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else { if (line) lines.push(line); line = fit(w, font, size, width); }
    });
    if (line) lines.push(line);
    return lines;
  }
  function dataUrlBytes(url) {
    const [head, b64] = String(url).split(',');
    const bin = atob(b64 || '');
    return { bytes: Uint8Array.from(bin, c => c.charCodeAt(0)), png: /image\/png/.test(head) };
  }
  async function embedImage(doc, url) {
    if (!url) return null;
    try { const { bytes, png } = dataUrlBytes(url); return png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); }
    catch (_) { return null; }
  }

  /** Company logo, name and contact details across the top; returns the y position below it. */
  function drawHeader(page, ctx, title, subtitle) {
    const { rgb } = ctx.PDFLib, { width, height } = page.getSize(), c = ctx.settings.company;
    let x = 36;
    const top = height - 36;
    if (ctx.logo) {
      const scale = Math.min(110 / ctx.logo.width, 52 / ctx.logo.height);
      const w = ctx.logo.width * scale, h = ctx.logo.height * scale;
      page.drawImage(ctx.logo, { x, y: top - h, width: w, height: h });
      x += w + 14;
    }
    page.drawText(fit(c.name || 'Timesheet', ctx.bold, 16, width / 2 - x), { x, y: top - 16, size: 16, font: ctx.bold, color: rgb(...INK) });
    const contact = [c.address, [c.phone, c.email].filter(Boolean).join('   ')].filter(Boolean);
    contact.forEach((line, i) => page.drawText(fit(line, ctx.font, 8.5, width / 2 - x), { x, y: top - 30 - i * 11, size: 8.5, font: ctx.font, color: rgb(...MUTED) }));
    const tw = ctx.bold.widthOfTextAtSize(title, 18);
    page.drawText(title, { x: width - 36 - tw, y: top - 18, size: 18, font: ctx.bold, color: rgb(...ctx.accent) });
    subtitle.forEach((line, i) => {
      const s = clean(line), sw = ctx.font.widthOfTextAtSize(s, 10);
      page.drawText(s, { x: width - 36 - sw, y: top - 34 - i * 13, size: 10, font: ctx.font, color: rgb(...INK) });
    });
    const y = top - 66;
    page.drawLine({ start: { x: 36, y }, end: { x: width - 36, y }, thickness: 1.5, color: rgb(...ctx.accent) });
    return y - 18;
  }

  function drawTable(page, ctx, y, columns, rows, opts = {}) {
    const { rgb } = ctx.PDFLib, size = opts.size || 9, rowH = opts.rowHeight || 20;
    let x = 36;
    const xs = columns.map(c => { const at = x; x += c.width; return at; }), right = x;
    page.drawRectangle({ x: 36, y: y - rowH + 6, width: right - 36, height: rowH, color: rgb(...ctx.accent) });
    columns.forEach((c, i) => {
      const t = fit(c.label, ctx.bold, size, c.width - 8);
      const tx = c.align === 'right' ? xs[i] + c.width - 4 - ctx.bold.widthOfTextAtSize(t, size) : xs[i] + 4;
      page.drawText(t, { x: tx, y: y - rowH / 2 + 3, size, font: ctx.bold, color: rgb(1, 1, 1) });
    });
    y -= rowH;
    rows.forEach((row, r) => {
      if (r % 2 === 1) page.drawRectangle({ x: 36, y: y - rowH + 6, width: right - 36, height: rowH, color: rgb(...SHADE) });
      const f = row.bold ? ctx.bold : ctx.font;
      columns.forEach((c, i) => {
        const t = fit(row.cells[i], f, size, c.width - 8);
        const tx = c.align === 'right' ? xs[i] + c.width - 4 - f.widthOfTextAtSize(t, size) : xs[i] + 4;
        page.drawText(t, { x: tx, y: y - rowH / 2 + 3, size, font: f, color: rgb(...INK) });
      });
      page.drawLine({ start: { x: 36, y: y - rowH + 6 }, end: { x: right, y: y - rowH + 6 }, thickness: 0.5, color: rgb(...LINE) });
      y -= rowH;
    });
    return y;
  }

  function drawFooter(page, ctx, n, of) {
    const { rgb } = ctx.PDFLib, { width } = page.getSize();
    const s = `Page ${n} of ${of}`;
    page.drawText(s, { x: width - 36 - ctx.font.widthOfTextAtSize(s, 8), y: 20, size: 8, font: ctx.font, color: rgb(...MUTED) });
    page.drawText('Made with Simple Timesheet', { x: 36, y: 20, size: 8, font: ctx.font, color: rgb(...MUTED) });
  }

  function drawSignatures(page, ctx, y, left) {
    const { rgb } = ctx.PDFLib, { width } = page.getSize();
    const boxes = [[left, 36], ['Signed', 36 + (width - 72) / 3], ['Date', 36 + (width - 72) * 2 / 3]];
    boxes.forEach(([label, x]) => {
      page.drawText(clean(label), { x, y, size: 9, font: ctx.font, color: rgb(...MUTED) });
      page.drawLine({ start: { x, y: y - 24 }, end: { x: x + (width - 72) / 3 - 18, y: y - 24 }, thickness: 0.75, color: rgb(...INK) });
    });
  }

  async function context(PDFLib, settings, doc) {
    const accent = (settings.accentRgb || [0.12, 0.47, 0.33]);
    return {
      PDFLib, settings, accent,
      font: await doc.embedFont(PDFLib.StandardFonts.Helvetica),
      bold: await doc.embedFont(PDFLib.StandardFonts.HelveticaBold),
      logo: await embedImage(doc, settings.company.logo),
    };
  }

  /** One week's timesheet, landscape, as many pages as it needs. */
  async function timesheetPdf(PDFLib, { entries, settings, ending }) {
    const doc = await PDFLib.PDFDocument.create();
    doc.setTitle(`Timesheet - week ending ${TS.formatDate(ending)}`);
    doc.setAuthor(clean(settings.employee.name || settings.company.name || ''));
    const ctx = await context(PDFLib, settings, doc);
    const list = TS.entriesForWeek(entries, ending);
    const columns = [
      { label: 'Date', width: 92 }, { label: settings.jobLabel || 'Job', width: 150 },
      { label: 'Start', width: 52 }, { label: 'On site', width: 52 }, { label: 'Off site', width: 52 }, { label: 'Finish', width: 52 },
      { label: 'Hours', width: 58, align: 'right' }, { label: 'Notes', width: 261.89 },
    ];
    const rows = list.map(e => ({ cells: [TS.formatDate(e.date, 'day'), e.job, e.start, e.onSite, e.offSite, e.finish, TS.formatMinutes(TS.entryMinutes(e)), e.notes] }));
    if (!rows.length) rows.push({ cells: ['No entries this week', '', '', '', '', '', '', ''] });
    const total = TS.totalMinutes(list);
    rows.push({ bold: true, cells: ['Total', '', '', '', '', '', TS.formatMinutes(total), TS.decimalHours(total) + ' hours'] });
    const perPage = 18, pages = [];
    for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
    pages.forEach((chunk, i) => {
      const page = doc.addPage([A4[1], A4[0]]);
      let y = drawHeader(page, ctx, 'TIMESHEET', [
        settings.employee.name ? 'Name: ' + settings.employee.name : '',
        'Week ending: ' + TS.formatDate(ending, 'long'),
      ].filter(Boolean));
      y = drawTable(page, ctx, y, columns, chunk);
      if (i === pages.length - 1) drawSignatures(page, ctx, Math.min(y - 24, 110), 'Employee: ' + (settings.employee.name || ''));
      drawFooter(page, ctx, i + 1, pages.length);
    });
    return doc.save();
  }

  /** An expense claim: a summary table, then one page per receipt photo. */
  async function expensesPdf(PDFLib, { items, settings, title }) {
    const doc = await PDFLib.PDFDocument.create();
    doc.setTitle('Expense claim - ' + clean(title));
    const ctx = await context(PDFLib, settings, doc);
    const type = k => (TS.EXPENSE_TYPES.find(t => t.key === k) || { label: k }).label;
    const sorted = items.slice().sort((a, b) => a.date.localeCompare(b.date));
    const columns = [
      { label: 'Date', width: 70 }, { label: 'Type', width: 72 }, { label: 'Details', width: 233.28 },
      { label: 'Receipt', width: 50 }, { label: 'Amount', width: 98, align: 'right' },
    ];
    const rows = sorted.map(it => ({ cells: [
      TS.formatDate(it.date), type(it.type),
      it.type === 'mileage' ? `${it.description || 'Mileage'} (${Number(it.miles) || 0} miles at ${TS.money(settings.mileageRate, settings)})` : it.description,
      it.receipt ? 'Yes' : '', TS.money(TS.expenseAmount(it, settings), settings),
    ] }));
    const total = sorted.reduce((s, it) => s + TS.expenseAmount(it, settings), 0);
    rows.push({ bold: true, cells: ['Total', '', '', '', TS.money(total, settings)] });
    const perPage = 28, chunks = [];
    for (let i = 0; i < rows.length; i += perPage) chunks.push(rows.slice(i, i + perPage));
    const receipts = sorted.filter(it => it.receipt);
    const totalPages = chunks.length + receipts.length;
    chunks.forEach((chunk, i) => {
      const page = doc.addPage(A4);
      let y = drawHeader(page, ctx, 'EXPENSES', [settings.employee.name ? 'Name: ' + settings.employee.name : '', clean(title)].filter(Boolean));
      y = drawTable(page, ctx, y, columns, chunk);
      if (i === chunks.length - 1) drawSignatures(page, ctx, Math.min(y - 24, 110), 'Claimed by: ' + (settings.employee.name || ''));
      drawFooter(page, ctx, i + 1, totalPages);
    });
    for (let i = 0; i < receipts.length; i++) {
      const it = receipts[i], page = doc.addPage(A4), { rgb } = PDFLib;
      page.drawText(fit(`Receipt: ${TS.formatDate(it.date)}  ${type(it.type)}  ${it.description || ''}  ${TS.money(TS.expenseAmount(it, settings), settings)}`, ctx.bold, 11, A4[0] - 72),
        { x: 36, y: A4[1] - 48, size: 11, font: ctx.bold, color: rgb(...INK) });
      const img = await embedImage(doc, it.receipt);
      if (img) {
        const scale = Math.min((A4[0] - 72) / img.width, (A4[1] - 110) / img.height, 1.5);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, { x: (A4[0] - w) / 2, y: A4[1] - 64 - h, width: w, height: h });
      }
      drawFooter(page, ctx, chunks.length + i + 1, totalPages);
    }
    return doc.save();
  }

  const api = { timesheetPdf, expensesPdf, clean, wrap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TSPdf = api;
})(typeof window === 'undefined' ? globalThis : window);
