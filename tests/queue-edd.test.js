/**
 * The Add to production queue form shows the EDD marketing or Admin set, and its date starts from
 * it [components/AddToProductionQueue.jsx; server: handoff.service `routingFor` `edd`].
 *
 *   node --test tests/queue-edd.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dialog = readFileSync(new URL('../src/components/AddToProductionQueue.jsx', import.meta.url), 'utf8');

test('marketing’s EDD is shown, model days too, and the date follows it unless changed', () => {
  assert.match(dialog, /setEdd\(answer\.edd \|\| null\);/);
  assert.match(dialog, /if \(answer\.edd\?\.date && answer\.edd\.date >= todayInIndia\(\)\) setDate\(\(current\) => current \|\| answer\.edd\.date\);/);
  assert.match(dialog, /EDD set by marketing\{edd\.by \? ` \(\$\{edd\.by\}\)` : ''\}:/);
  assert.match(dialog, /edd\.models\.map\(\(row\) => `\$\{row\.model\}: \$\{formatDate\(row\.date\)\}`\)/);
  assert.match(dialog, /Marketing has not set the EDD yet\./);
});
