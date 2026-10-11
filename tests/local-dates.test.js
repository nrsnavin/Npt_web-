/**
 * Dates a person picks are on their own calendar [utils/format.js `isoDay`].
 *
 * `toISOString().slice(0, 10)` is the day in Greenwich, which in India is yesterday until 05:30:
 * a department task's "done by" defaulted to yesterday and the server refused it as past; every
 * "in three days" default landed two days out; an enquiry's slipped follow-up was offered back
 * as if it were still today.
 *
 *   node --test tests/local-dates.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Asia/Kolkata';
const { isoDay } = await import('../src/utils/format.js');

test('half past one in the morning in India is already the new day', () => {
  const early = new Date('2026-10-11T20:00:00Z');
  assert.equal(early.toISOString().slice(0, 10), '2026-10-11', 'Greenwich still says the 11th');
  assert.equal(isoDay(early), '2026-10-12');
  assert.equal(isoDay('2026-03-05T10:00:00Z'), '2026-03-05', 'padded');
});

test('no screen takes a Greenwich day for a local one', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const files = (dir) => readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : /\.jsx?$/.test(entry) ? [full] : [];
  });
  const offenders = files(SRC)
    .filter((file) => !file.endsWith(path.join('utils', 'taskForm.js'))) /* shifts to India first */
    .filter((file) => /toISOString\(\)\.(slice\(0, 10\)|split\('T'\)\[0\]|substring\(0, 10\))/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));
  assert.deepEqual(offenders, []);
});
