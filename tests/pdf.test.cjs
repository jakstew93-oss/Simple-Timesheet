const { test } = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('../vendor/pdf-lib.min.js');
const TS = require('../core.js');
const TSPdf = require('../pdf.js');

// A 1x1 green PNG standing in for a company logo.
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const settings = TS.mergeSettings({ company: { name: 'Dale Studio', address: '1 High St', email: 'hi@dale.studio', logo: LOGO }, employee: { name: 'Sam Dale' } });

test('a timesheet PDF has the company details and the week’s hours', async () => {
  const entries = [
    { id: '1', date: '2026-10-13', job: 'Kitchen – rewire', start: '07:30', onSite: '08:00', offSite: '15:30', finish: '16:00', notes: 'Fitted “new” board' },
    { id: '2', date: '2026-10-14', job: 'Shop', start: '08:00', finish: '12:00', notes: '' },
  ];
  const bytes = await TSPdf.timesheetPdf(PDFLib, { entries, settings, ending: '2026-10-18' });
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle(), /week ending 18\/10\/2026/);
  const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
  assert.ok(w > h, 'landscape');
});

test('a long week runs onto more pages', async () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ id: String(i), date: '2026-10-1' + (2 + (i % 7)), job: 'Job ' + i, start: '07:00', finish: '08:00' }));
  const doc = await PDFLib.PDFDocument.load(await TSPdf.timesheetPdf(PDFLib, { entries, settings, ending: '2026-10-18' }));
  assert.equal(doc.getPageCount(), 2);
});

test('an empty week and a missing logo still make a PDF', async () => {
  const plain = TS.mergeSettings({});
  const doc = await PDFLib.PDFDocument.load(await TSPdf.timesheetPdf(PDFLib, { entries: [], settings: plain, ending: '2026-10-18' }));
  assert.equal(doc.getPageCount(), 1);
});

test('an expense claim adds a page for each receipt photo', async () => {
  const items = [
    { id: 'a', date: '2026-10-02', type: 'parking', amount: 4.5, description: 'Hospital car park', receipt: LOGO },
    { id: 'b', date: '2026-10-03', type: 'mileage', miles: 40, description: 'Leeds and back' },
  ];
  const doc = await PDFLib.PDFDocument.load(await TSPdf.expensesPdf(PDFLib, { items, settings, title: 'October 2026' }));
  assert.equal(doc.getPageCount(), 2);
});

test('text the PDF fonts can’t show is swapped rather than breaking the PDF', () => {
  assert.equal(TSPdf.clean('Fitted “new” board – done… 👍'), 'Fitted "new" board - done... ?');
});
