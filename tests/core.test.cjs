const { test } = require('node:test');
const assert = require('node:assert/strict');
const TS = require('../core.js');

test('hours run from start to finish with no breaks taken off', () => {
  assert.equal(TS.entryMinutes({ start: '07:30', finish: '16:00' }), 510);
  assert.equal(TS.formatMinutes(510), '8h 30m');
  assert.equal(TS.decimalHours(510), '8.50');
  assert.equal(TS.siteMinutes({ onSite: '08:15', offSite: '15:45' }), 450);
});

test('a shift past midnight still counts the right hours', () => {
  assert.equal(TS.entryMinutes({ start: '22:00', finish: '06:00' }), 480);
});

test('missing or broken times count as nothing', () => {
  assert.equal(TS.entryMinutes({ start: '07:00' }), 0);
  assert.equal(TS.entryMinutes({ start: '7am', finish: '16:00' }), 0);
  assert.equal(TS.formatMinutes(0), '0h');
});

test('weeks end on the chosen day', () => {
  assert.equal(TS.weekEnding('2026-10-15', 0), '2026-10-18'); // Thursday → Sunday
  assert.equal(TS.weekEnding('2026-10-18', 0), '2026-10-18'); // Sunday stays
  assert.equal(TS.weekEnding('2026-10-15', 5), '2026-10-16'); // weeks ending Friday
  assert.equal(TS.weekEnding('2026-10-17', 5), '2026-10-23'); // Saturday → next Friday
  assert.deepEqual(TS.weekDays('2026-10-18'), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(TS.weekEnding('2026-12-30', 0), '2027-01-03', 'across the new year');
});

test('the week shows only its own entries, in order', () => {
  const entries = [
    { id: 'c', date: '2026-10-19', start: '07:00', finish: '15:00' },
    { id: 'b', date: '2026-10-14', start: '12:00', finish: '15:00' },
    { id: 'a', date: '2026-10-14', start: '07:00', finish: '11:00' },
    { id: 'z', date: '2026-10-11', start: '07:00', finish: '15:00' },
  ];
  const week = TS.entriesForWeek(entries, '2026-10-18');
  assert.deepEqual(week.map(e => e.id), ['a', 'b']);
  assert.equal(TS.totalMinutes(week), 420);
});

test('the Quick Start button moves through the four stages', () => {
  assert.equal(TS.nextStage({}), 0);
  assert.equal(TS.nextStage({ start: '07:00' }), 1);
  assert.equal(TS.nextStage({ start: '07:00', onSite: '08:00', offSite: '15:00' }), 3);
  assert.equal(TS.nextStage({ start: '07:00', onSite: '08:00', offSite: '15:00', finish: '16:00' }), null);
});

test('an entry needs a date, start and finish', () => {
  assert.deepEqual(TS.validate({ date: '2026-10-15', start: '07:00', finish: '16:00' }), []);
  assert.equal(TS.validate({ date: '2026-10-15', start: '07:00' }).length, 1);
  assert.equal(TS.validate({ date: '2026-10-15', start: '07:00', finish: '07:00' })[0], 'Start and finish can’t be the same time.');
  assert.equal(TS.validate({ date: '2026-10-15', start: '07:00', finish: '16:00', onSite: '08:00' })[0], 'Fill in both on-site times, or neither.');
});

test('the spreadsheet export is safe to open in Excel', () => {
  const csv = TS.toCSV([{ date: '2026-10-15', job: '=SUM(A1)', start: '07:00', finish: '16:00', notes: 'Fitted "new" board, kitchen' }], TS.mergeSettings({ jobLabel: 'Job no.' }));
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Date,Job no.,Start,On site,Off site,Finish,Hours,Hours (decimal),Notes');
  assert.equal(lines[1], `15/10/2026,"'=SUM(A1)",07:00,,,16:00,9h,9.00,"Fitted ""new"" board, kitchen"`);
  assert.equal(lines[2], 'Total,,,,,,9h,9.00,');
});

test('a setup link carries the company details, but never the logo', () => {
  const settings = TS.mergeSettings({ company: { name: 'Dale Studio', address: '1 High St, Leeds', email: 'hello@dale.studio', logo: 'data:image/png;base64,AAAA' }, employee: { name: 'Sam' }, weekEnds: 5, jobLabel: 'Client' });
  const setup = TS.readSetupCode(TS.setupCode(settings));
  assert.deepEqual(setup.company, { name: 'Dale Studio', address: '1 High St, Leeds', email: 'hello@dale.studio' });
  assert.equal(setup.weekEnds, 5); assert.equal(setup.jobLabel, 'Client');
  const mine = TS.applySetup(TS.mergeSettings({ employee: { name: 'Alex' } }), setup);
  assert.equal(mine.employee.name, 'Alex', 'your own name is kept');
  assert.equal(mine.company.name, 'Dale Studio');
  assert.throws(() => TS.readSetupCode('not-a-code'), /setup link/);
  assert.throws(() => TS.readSetupCode(Buffer.from('{"v":2}').toString('base64url')), /isn’t a timesheet setup link/);
});

test('setup links work with accented names', () => {
  const s = TS.mergeSettings({ company: { name: 'Café Ñandú Ltd' } });
  assert.equal(TS.readSetupCode(TS.setupCode(s)).company.name, 'Café Ñandú Ltd');
});

test('expenses: mileage uses the rate, everything else the amount', () => {
  const s = TS.mergeSettings({ mileageRate: 0.45, currency: '£' });
  assert.equal(TS.expenseAmount({ type: 'mileage', miles: 23 }, s), 10.35);
  assert.equal(TS.expenseAmount({ type: 'parking', amount: '4.5' }, s), 4.5);
  assert.equal(TS.money(10.35, s), '£10.35');
});

test('pay: hourly rate for time on site, travel rate for the drive there and back', () => {
  const s = TS.mergeSettings({ hourlyRate: 25, travelRate: 15 });
  const day = { start: '07:00', onSite: '08:00', offSite: '15:30', finish: '16:30' };
  assert.equal(TS.workMinutes(day), 450);
  assert.equal(TS.travelMinutes(day), 120);
  assert.equal(TS.entryPay(day, s), 217.5);
  const noSite = { start: '07:00', finish: '15:00' };
  assert.equal(TS.travelMinutes(noSite), 0, 'no on-site times: no travel');
  assert.equal(TS.entryPay(noSite, s), 200, 'the whole day at the hourly rate');
  assert.deepEqual(TS.payTotals([day, noSite], s), { work: 930, travel: 120, pay: 417.5 });
  assert.equal(TS.hasRates(TS.mergeSettings({})), false);
});

test('the spreadsheet adds pay columns only when rates are set', () => {
  const csv = TS.toCSV([{ date: '2026-10-15', start: '07:00', onSite: '08:00', offSite: '15:30', finish: '16:30' }], TS.mergeSettings({ hourlyRate: 25, travelRate: 15 }));
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Date,Job / reference,Start,On site,Off site,Finish,Hours,Hours (decimal),On site hours,Travel hours,Pay,Notes');
  assert.equal(lines[2], 'Total,,,,,,9h 30m,9.50,7.50,2.00,217.50,');
});

test('overnight is an expense type', () => {
  assert.ok(TS.EXPENSE_TYPES.some(t => t.key === 'overnight' && t.label === 'Overnight'));
});
