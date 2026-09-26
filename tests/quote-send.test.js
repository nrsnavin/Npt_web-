/**
 * The send dialog says what the server will say, before anything leaves.
 *
 *   node --test tests/quote-send.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sendLabel, sendProblem } from '../src/utils/quoteSend.js';

const email = { send: true, to: 'senthil@smg.in', subject: 'Quotation NP/26-27/043', body: 'Dear Senthil,' };
const whatsapp = { send: true, to: '+91 98400 11223', body: 'Quote attached.' };

test('either channel, or both, with an address and words', () => {
  assert.equal(sendProblem({ email, whatsapp }), null);
  assert.equal(sendProblem({ email }), null);
  assert.equal(sendProblem({ whatsapp }), null);
  assert.match(sendProblem({ email: { ...email, send: false }, whatsapp: { ...whatsapp, send: false } }), /Choose email, WhatsApp/);
});

test('an address that is not one is caught before sending', () => {
  assert.match(sendProblem({ email: { ...email, to: 'senthil at smg' } }), /email address/);
  assert.match(sendProblem({ email: { ...email, subject: ' ' } }), /subject/);
  assert.match(sendProblem({ email: { ...email, body: '' } }), /message/);
  assert.match(sendProblem({ whatsapp: { ...whatsapp, to: '12' } }), /WhatsApp number/);
  assert.match(sendProblem({ whatsapp: { ...whatsapp, body: '  ' } }), /WhatsApp message is empty/);
});

test('the button says what it will do', () => {
  assert.equal(sendLabel({ email, whatsapp }), 'Send by email and WhatsApp');
  assert.equal(sendLabel({ email, whatsapp: { ...whatsapp, send: false } }), 'Send by email');
  assert.equal(sendLabel({ whatsapp }), 'Send by WhatsApp');
});

test('each channel reports what happened to it', async () => {
  const { deliveryLines } = await import('../src/utils/quoteSend.js');
  assert.deepEqual(
    deliveryLines([
      { channel: 'email', recipient: 'senthil@smg.in', status: 'sent' },
      { channel: 'whatsapp', recipient: '+919840011223', status: 'failed', error: 'Twilio refused the number' },
      { channel: 'whatsapp', recipient: '+919840011223', status: 'skipped', skipReason: 'opted_out' },
    ]),
    [
      { ok: true, text: 'Email sent to senthil@smg.in' },
      { ok: false, text: 'WhatsApp to +919840011223 failed: Twilio refused the number' },
      { ok: false, text: 'WhatsApp to +919840011223 not sent — the customer has asked not to be messaged this way' },
    ],
  );
  assert.deepEqual(deliveryLines([{ channel: 'whatsapp', recipient: '+919840011223', status: 'sent', providerStatus: 'logged' }]), [
    { ok: false, text: 'WhatsApp to +919840011223 only written to the server log — no provider is set up' },
  ]);
  assert.deepEqual(deliveryLines(undefined), []);
});
