/**
 * Payment terms on an order, and the order's "Payment before work" panel
 * [utils/paymentTerms.js, components/PaymentTermsPicker.jsx, components/OrderPayment.jsx].
 *
 *   node --test tests/payment-terms.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAYMENT_PRESETS, describePlan, presetFor } from '../src/utils/paymentTerms.js';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('the presets are the plant’s terms, as two numbers each', () => {
  const by = (key) => PAYMENT_PRESETS.find((preset) => preset.key === key);
  assert.deepEqual([by('advance_50_delivery_50').advancePercent, by('advance_50_delivery_50').beforeDispatchPercent], [50, 50]);
  assert.deepEqual([by('dispatch_100').advancePercent, by('dispatch_100').beforeDispatchPercent], [0, 100]);
  assert.equal(presetFor({ advancePercent: 0, beforeDispatchPercent: 100 }).label, '100% against dispatch');
  assert.equal(presetFor({ advancePercent: 40, beforeDispatchPercent: 90 }), null);
  assert.equal(describePlan({ advancePercent: 40, beforeDispatchPercent: 90 }), '40% before production, 90% before dispatch');
});

test('both ways of booking an order ask for the terms and send them', () => {
  for (const path of ['components/OrderForm.jsx', 'components/OrderFromQuotation.jsx']) {
    const form = read(path);
    assert.match(form, /<PaymentTermsPicker/, path);
    assert.match(form, /paymentPlan: \{ advancePercent: Number\(plan\.advancePercent\) \|\| 0, beforeDispatchPercent: Number\(plan\.beforeDispatchPercent\) \|\| 0 \}/, path);
  }
});

test('the order shows what is in before production and dispatch, and only Admin can let it go on without', () => {
  const panel = read('components/OrderPayment.jsx');
  assert.match(panel, /ordersApi\.payment\(order\._id\)/);
  assert.match(panel, /\{!row\.met && !row\.waived && isAdmin && \(/);
  assert.match(panel, /ordersApi\.waivePayment\(\{ id: order\._id, stage: waiving, reason: reason\.trim\(\) \}\)/);
  assert.match(read('pages/OrderDetail.jsx'), /<OrderPayment order=\{order\} \/>/);
});
