/**
 * Customers from Excel on the Customers page [components/CustomerUpload.jsx; server:
 * services/customerImport.service.js]: the template, the owner for rows naming none, a preview, Import.
 *
 *   node --test tests/customer-import.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the endpoints: the template as .xlsx, the upload with its owner and commit', () => {
  const endpoints = read('api/endpoints.js');
  assert.match(endpoints, /customerTemplate: \(\) => save\('\/customers\/import\/template', \{\}, 'customer-import-template\.xlsx'\)/);
  assert.match(endpoints, /if \(defaultOwner\) form\.append\('defaultOwner', defaultOwner\);/);
  assert.match(endpoints, /api\.post\('\/customers\/import', form, \{ feedback: commit \}\)/);
});

test('the Customers page has Import from Excel for whoever may add customers', () => {
  const page = read('pages/Customers.jsx');
  assert.match(page, /\{mayWrite && \(\s*<button type="button" className="btn-secondary" onClick=\{\(\) => setImporting\(true\)\}>\s*Import from Excel/);
  assert.match(page, /title="Import customers from Excel"/);
  assert.match(page, /<CustomerUpload/);
});

test('the dialog: download the template, pick the owner, choose the file, see the preview, then Import', () => {
  const upload = read('components/CustomerUpload.jsx');
  assert.match(upload, /downloads\.customerTemplate\(\)/);
  assert.match(upload, /aria-label="Marketing owner for rows that name none"/);
  assert.match(upload, /customersApi\.importSheet\(\{ file: chosen, defaultOwner: ownerId \|\| undefined, commit: false \}\)/);
  assert.match(upload, /customersApi\.importSheet\(\{ file, defaultOwner: owner \|\| undefined, commit: true \}\)/);
  assert.match(upload, /Already a customer — \$\{entry\.existing\.name\}/);
  assert.match(upload, /Import \$\{summary\.create\} customer/);
});
