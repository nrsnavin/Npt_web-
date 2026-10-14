/**
 * What the customer side panel offers [src/utils/customerPanel.js].
 *
 *   node --test tests/customer-panel.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NEEDS_ENQUIRY, TEAM, dueState, panelButtons, panelTiles, whatsappLink } from '../src/utils/customerPanel.js';

const catalogue = {
  buttons: [
    { key: 'photos_sent', label: 'Photos Sent', department: null },
    { key: 'create_quotation', label: 'Create Quotation', department: 'quotation' },
    { key: 'sample_request', label: 'Sample Request', department: 'sampling' },
    { key: 'po_so', label: 'PO & SO', department: 'order_confirmation' },
    { key: 'ask_edd', label: 'Ask EDD', department: 'production' },
    { key: 'so_clarification', label: 'SO Clarification', department: 'owner', hidden: true },
    { key: 'task_closed', label: 'Task Closed', department: null },
  ],
  stages: [
    { key: 'enquiry', number: 1, label: 'Enquiry', kind: null },
    { key: 'sample', number: 2, label: 'Sample', kind: 'sample_request', department: 'sampling' },
    { key: 'pricing_quote', number: 3, label: 'Pricing / Quote', kind: 'create_quotation', department: 'quotation' },
    { key: 'closed', label: 'Closed' },
  ],
};

test('for no enquiry: every step but closing, the enquiry-bound ones marked', () => {
  const buttons = panelButtons(catalogue, TEAM);
  const keys = buttons.map((button) => button.key);
  assert.ok(!keys.includes('task_closed'), 'closing is an enquiry’s own');
  assert.ok(!keys.includes('so_clarification'), 'hidden buttons stay hidden');
  assert.equal(buttons.find((button) => button.key === 'sample_request').needsEnquiry, false, 'a team task');
  for (const key of ['create_quotation', 'po_so', 'photos_sent']) {
    assert.equal(buttons.find((button) => button.key === key).needsEnquiry, true, `${key} needs an enquiry`);
  }
  assert.ok(buttons.find((button) => button.key === 'photos_sent').record, 'a record, not a department task');
});

test('on an enquiry: everything goes on it, closing included', () => {
  const buttons = panelButtons(catalogue, 'e1');
  assert.ok(buttons.some((button) => button.key === 'task_closed'));
  assert.ok(buttons.every((button) => !button.needsEnquiry));
});

test('the tiles carry their department’s button and light the enquiry’s stage', () => {
  const tiles = panelTiles(catalogue, 'e1', 'sample');
  assert.equal(tiles.length, 3, 'numbered stages only');
  assert.equal(tiles[0].button, null, 'the first is marketing’s own');
  assert.equal(tiles[1].button.key, 'sample_request');
  assert.ok(tiles[1].here);
  const team = panelTiles(catalogue, TEAM, 'sample');
  assert.ok(team.every((tile) => !tile.here), 'no stage without an enquiry');
  assert.ok(team[2].needsEnquiry, 'Pricing needs an enquiry');
  assert.deepEqual(NEEDS_ENQUIRY.includes('create_quotation'), true);
});

test('WhatsApp links and due dates', () => {
  assert.equal(whatsappLink('98400 11223'), 'https://wa.me/919840011223');
  assert.equal(whatsappLink('+91 98400 11223'), 'https://wa.me/919840011223');
  assert.equal(whatsappLink(''), null);
  const now = new Date('2026-10-14T10:00:00');
  assert.equal(dueState('2026-10-13T18:00:00', now), 'late');
  assert.equal(dueState('2026-10-14T18:00:00', now), 'today');
  assert.equal(dueState('2026-10-16T09:00:00', now), 'ahead');
  assert.equal(dueState(null, now), null);
});
