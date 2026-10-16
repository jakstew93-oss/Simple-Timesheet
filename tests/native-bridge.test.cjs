// The same rules as the MDS Timesheet app's watch and widget logging (its tools/test-native-bridge.cjs).
process.env.TZ = 'Europe/London';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { normalise, pickRun, mergeDraft, draftTimes, dayMessage } = require('../native-bridge.js');
const t = iso => ({ epochMillis: Date.parse(iso), offsetSeconds: 3600 });
const run = (id, ...times) => ({ id, source: 'watch', times: times.map(t) });
const rec = r => normalise({ id: r.id, times: r.times });

test('the newest set that isn’t already saved is picked', () => {
  const a = run('a', '2026-10-15T05:00:00Z'), b = run('b', '2026-10-15T05:30:00Z', '2026-10-15T07:00:00Z'), c = run('c', '2026-10-15T06:00:00Z');
  assert.equal(pickRun([a, b, c], new Set()).id, 'b');
  assert.equal(pickRun([a, b, c], new Set(['b'])).id, 'c');
  assert.equal(pickRun([], new Set()), null);
  assert.equal(pickRun([a, b, c], new Set(), 'a').id, 'a', 'the set already in Today’s log comes first');
});
test('watch times fill an empty draft and keep the job details already typed', () => {
  const r = mergeDraft({ job: 'Kitchen rewire', notes: 'Bring ladder' }, rec(run('w', '2026-10-15T05:15:00Z')));
  assert.equal(r.changed, true); assert.equal(r.draft.start, '06:15'); assert.equal(r.draft.date, '2026-10-15');
  assert.equal(r.draft.job, 'Kitchen rewire'); assert.equal(r.draft.notes, 'Bring ladder'); assert.equal(r.draft._capture.id, 'w');
});
test('later taps add only the new times, so hand corrections stay', () => {
  const first = mergeDraft({}, rec(run('w', '2026-10-15T05:15:00Z'))).draft;
  first.start = '06:00';
  const second = mergeDraft(first, rec(run('w', '2026-10-15T05:15:00Z', '2026-10-15T08:06:00Z')));
  assert.equal(second.added, 1); assert.equal(second.draft.start, '06:00'); assert.equal(second.draft.onSite, '09:06');
  assert.deepEqual(mergeDraft(second.draft, rec(run('w', '2026-10-15T05:15:00Z', '2026-10-15T08:06:00Z'))), { draft: second.draft, changed: false, added: 0 });
});
test('a draft with other times is never overwritten', () => {
  assert.equal(mergeDraft({ start: '07:00' }, rec(run('w', '2026-10-15T05:15:00Z'))), null);
  assert.equal(mergeDraft({ start: '07:00', _capture: { id: 'other', times: [] } }, rec(run('w', '2026-10-15T05:15:00Z'))), null);
});
test('after Reset, stages already brought in stay gone and only newer taps come back', () => {
  const two = rec(run('w', '2026-10-15T05:15:00Z', '2026-10-15T08:06:00Z'));
  const seen = two.draft._capture.times.map(x => x.epochMillis);
  assert.deepEqual(mergeDraft({}, two, seen), { draft: {}, changed: false, added: 0 });
  const three = rec(run('w', '2026-10-15T05:15:00Z', '2026-10-15T08:06:00Z', '2026-10-15T10:30:00Z'));
  const back = mergeDraft({ job: '7' }, three, seen);
  assert.equal(back.added, 1); assert.equal(back.draft.offSite, '11:30'); assert.equal(back.last, 2);
  assert.equal(back.draft.start, undefined); assert.equal(back.draft.onSite, undefined); assert.equal(back.draft.job, '7');
});
test('a time cleared by hand on the phone stays cleared when the watch sends its next tap', () => {
  const draft = { date: '2026-10-15', start: '06:15', _capture: { id: 'w', times: [t('2026-10-15T05:15:00Z')] } };
  const r = mergeDraft(draft, rec(run('w', '2026-10-15T05:15:00Z', '2026-10-15T08:06:00Z', '2026-10-15T10:30:00Z')), [Date.parse('2026-10-15T08:06:00Z')]);
  assert.equal(r.draft.onSite, undefined); assert.equal(r.draft.offSite, '11:30');
});
test('on a day the watch took over from the phone, only the watch’s own taps come in', () => {
  const draft = { date: '2026-10-15', start: '06:00', onSite: '09:00', _capture: { id: 'p', times: [t('2026-10-15T05:00:00Z')] } };
  // The watch holds the phone's two times, then Off site was tapped on the watch.
  const watch = rec(run('p', '2026-10-15T05:00:00Z', '2026-10-15T08:00:00Z', '2026-10-15T10:30:00Z'));
  const r = mergeDraft(draft, watch, [], 2);
  assert.equal(r.added, 1); assert.equal(r.draft.start, '06:00'); assert.equal(r.draft.onSite, '09:00'); assert.equal(r.draft.offSite, '11:30');
});
test('a shift past midnight keeps the start day', () => {
  const r = mergeDraft({}, rec(run('n', '2026-10-15T09:00:00Z', '2026-10-15T23:15:00Z', '2026-10-15T23:45:00Z', '2026-10-16T00:00:00Z')));
  assert.equal(r.draft.date, '2026-10-15'); assert.equal(r.draft.start, '10:00'); assert.equal(r.draft.finish, '01:00');
});
test('times typed on the phone become tap times for the watch, in order and past midnight', () => {
  const times = draftTimes({ date: '2026-10-15', start: '16:00', onSite: '17:30', offSite: '00:15' }, '2026-10-15');
  assert.deepEqual(times.map(x => new Date(x.epochMillis).toISOString()), ['2026-10-15T15:00:00.000Z', '2026-10-15T16:30:00.000Z', '2026-10-15T23:15:00.000Z']);
  assert.equal(times[0].offsetSeconds, 3600);
  assert.equal(draftTimes({ date: '2026-10-15', onSite: '09:00' }, '2026-10-15').length, 0, 'nothing is sent without a start time');
  assert.equal(draftTimes({ start: '07:00', offSite: '12:00' }, '2026-10-15').length, 1, 'stops at the first empty stage');
  const watchTime = t('2026-10-15T05:15:42.123Z');
  assert.deepEqual(draftTimes({ date: '2026-10-15', start: '06:15', _capture: { id: 'w', times: [watchTime] } }, '2026-10-15'), [watchTime], 'the watch’s exact time is kept');
});
test('the watch is told when a day is started, cleared by Reset or saved', () => {
  const active = dayMessage({ date: '2026-10-15', start: '07:00', _capture: { id: 'p', times: [] } }, [1], null, false, '2026-10-15');
  assert.equal(active.state, 'active'); assert.equal(active.id, 'p'); assert.equal(active.times.length, 1); assert.deepEqual(active.seen, [1]);
  assert.equal(dayMessage({ start: '07:00' }, [], null, false, '2026-10-15').id, null, 'a day started on the phone needs an id');
  assert.deepEqual(dayMessage({}, [], { id: 'p', state: 'active' }, false, '2026-10-15'), { state: 'cleared', id: 'p', times: [], seen: [] });
  assert.equal(dayMessage({}, [], { id: 'p', state: 'active' }, true, '2026-10-15').state, 'saved');
  assert.equal(dayMessage({}, [], { id: 'p', state: 'cleared' }, false, '2026-10-15'), null);
  assert.equal(dayMessage({ job: '7' }, [], null, false, '2026-10-15'), null);
});
test('broken or out-of-order times from the app are refused', () => {
  assert.throws(() => normalise({ id: 'x', times: [] }));
  assert.throws(() => normalise({ id: 'bad id!', times: [t('2026-10-15T05:00:00Z')] }));
  assert.throws(() => normalise({ id: 'x', times: [t('2026-10-15T06:00:00Z'), t('2026-10-15T05:00:00Z')] }));
});
test('the bridge is loaded by the page and cached offline', () => {
  const html = fs.readFileSync('index.html', 'utf8'), sw = fs.readFileSync('sw.js', 'utf8');
  const v = html.match(/native-bridge\.js\?v=\d+/)[0];
  assert.ok(sw.includes(v)); assert.ok(html.indexOf('app.js?') < html.indexOf('native-bridge.js?'));
});
