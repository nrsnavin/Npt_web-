/**
 * OEE on the web [pages/Oee.jsx, utils/oee.js] and coded stops and rejects on runs
 * [components/RunReasons.jsx, pages/MouldRuns.jsx].
 *
 *   node --test tests/oee.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codedForSave, oeeBand, paretoWidths, pctText, weakestFactor } from '../src/utils/oee.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('OEE reads as world class, typical or losing time', () => {
  assert.equal(oeeBand(87).label, 'World class');
  assert.equal(oeeBand(70).label, 'Typical');
  assert.equal(oeeBand(40).tone, 'danger');
  assert.equal(oeeBand(null), null);
  assert.equal(pctText(83.3), '83.3%');
  assert.equal(pctText(null), '—');
});

test('the weakest factor names what to work on', () => {
  assert.deepEqual(weakestFactor({ availability: 70, performance: 95, quality: 98 }), { key: 'availability', label: 'Availability', cause: 'stops', value: 70 });
  assert.equal(weakestFactor({ availability: 99, performance: 80, quality: 98 }).cause, 'slow cycles');
  assert.equal(weakestFactor({}), null);
});

test('losses are drawn as a share of the biggest', () => {
  assert.deepEqual(paretoWidths([{ minutes: 120 }, { minutes: 30 }], 'minutes').map((row) => row.width), [100, 25]);
});

test('only filled coded rows are sent, numbers as numbers', () => {
  assert.deepEqual(codedForSave([{ reason: 'flash', pieces: '40' }, { reason: '', pieces: '5' }, { reason: 'short_shot', pieces: '0' }], 'pieces'), [{ reason: 'flash', pieces: 40 }]);
});

test('the finish form codes stops and rejects; running jobs take a log; OEE has its page and route', () => {
  const runs = read('pages/MouldRuns.jsx');
  assert.match(runs, /downtime: codedForSave\(stops, 'minutes'\)/);
  assert.match(runs, /rejects: codedForSave\(defects, 'pieces'\)/);
  assert.match(runs, /mouldRunsApi\.log\(/);
  assert.match(read('App.jsx'), /path="production\/oee"/);
  assert.match(read('pages/Oee.jsx'), /productionApi\.oee\(\{ from, to \}\)/);
});
