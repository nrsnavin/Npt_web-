/**
 * GST on the sales order [components/OrderForm.jsx, pages/OrderDetail.jsx, utils/gst.js; server:
 * utils/gst.js]: each line's HSN and GST %, the tax split by the place of supply, the round-off
 * and the total to the rupee — and none of it on the quotation, which stays a rate "GST extra".
 *
 *   node --test tests/order-gst.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { taxOn, ratesWords } from '../src/utils/gst.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the form’s arithmetic matches the server’s: each line at its rate, rounded to the rupee at the end', () => {
  const tax = taxOn({ lines: [{ quantity: 1000, unitPrice: 7.5 }, { quantity: 333, unitPrice: 1.01, gstPercent: 12 }], gstPercent: 18 });
  assert.deepEqual([tax.taxable, tax.tax, tax.gross, tax.roundOff, tax.total], [7836.33, 1390.36, 9226.69, 0.31, 9227]);
  assert.equal(ratesWords(tax.rates), 'GST 12% / 18%');
  assert.equal(taxOn({ lines: [{ quantity: 10, unitPrice: 1 }], gstPercent: '' }).tax, 0, 'no rate: no tax');
  assert.equal(taxOn({ lines: [{ quantity: 10, unitPrice: 1 }], gstPercent: 18, isExport: true }).tax, 0, 'export: zero-rated');
});

test('the order form asks GST % and HSN on each line, the order’s rate as the default, and says the total', () => {
  const form = read('components/OrderForm.jsx');
  assert.match(form, /hsnCode: '', gstPercent: '',/);
  assert.match(form, /aria-label=\{`GST % on line \$\{index \+ 1\}`\}/);
  assert.match(form, /aria-label=\{`HSN on line \$\{index \+ 1\}`\}/);
  assert.match(form, /hsnCode: text\(line\.hsnCode\),/);
  assert.match(form, /const tax = taxOn\(\{ lines, gstPercent: terms\.gstPercent \}\);/);
  assert.match(form, /\{rupees\(tax\.total\)\} total/);
  assert.match(form, /<Field label="GST % on the order"/);
});

test('the order page shows HSN and GST on every line, then taxable, CGST + SGST or IGST, round off and the total — with the place of supply', () => {
  const page = read('pages/OrderDetail.jsx');
  assert.match(page, /<th className="px-3 py-2\.5">HSN<\/th>/);
  assert.match(page, /\{!order\.valueHidden && <th className="px-3 py-2\.5 text-right">GST<\/th>\}/, 'the tax is money: hidden with the rate');
  assert.match(page, /const taxLine = \(line\) => \(order\.tax\?\.lines \|\| \[\]\)\[\(order\.lines \|\| \[\]\)\.indexOf\(line\)\] \|\| null;/);
  assert.match(page, /<dt className="text-steel-400">CGST \{halfWords\(order\.tax\.rates\)\}<\/dt>/);
  assert.match(page, /<dt className="text-steel-400">IGST \{ratesOnly\(order\.tax\.rates\)\}<\/dt>/);
  assert.match(page, /<dt className="text-steel-400">Round off<\/dt>/);
  assert.match(page, /Place of supply: \{order\.placeOfSupply\.state\}/);
  assert.match(page, /assumed: the customer has no state or GSTIN on record/);
});

test('the mould register carries a model’s own HSN and GST %; the quotation stays a rate with no tax column', () => {
  const mould = read('components/MouldForm.jsx');
  assert.match(mould, /\{\.\.\.register\('hsnCode'\)\}/);
  assert.match(mould, /\{\.\.\.register\('gstPercent'\)\}/);
  const quote = read('components/QuoteBuilder.jsx');
  assert.doesNotMatch(quote, /hsnCode|taxOn|CGST|IGST/, 'no tax on the quotation');
  assert.doesNotMatch(read('pages/QuotationDetail.jsx'), /taxOn|CGST|IGST|Round off/);
});
