/**
 * The look-ahead screen's rules [utils/insights.js].
 *
 *   node --test tests/insights.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RISK_TONE, buyOrder, dayText, suggestionHeadline } from '../src/utils/insights.js';

test('items to order now come first, then by the order-by day', () => {
  const rows = buyOrder([
    { name: 'B', orderBy: '2026-11-02' },
    { name: 'A', orderBy: null },
    { name: 'C', orderBy: '2026-10-20', orderNow: true },
    { name: 'D', orderBy: '2026-10-25' },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['C', 'D', 'B', 'A']);
});

test('the suggestion says what it buys', () => {
  assert.equal(
    suggestionHeadline({ lateBefore: 3, lateAfter: 1, changeoversBefore: 4, changeoversAfter: 2, moved: 2, newlyPlaced: 0, reordered: 5 }),
    'late jobs 3 → 1 · colour changes 4 → 2 · 2 moved to another press, 5 changes in all',
  );
  assert.equal(suggestionHeadline({ lateBefore: 0, lateAfter: 0, changeoversBefore: 1, changeoversAfter: 1, moved: 0, reordered: 0 }), '0 late either way · nothing to change');
  assert.equal(
    suggestionHeadline({ lateBefore: 0, unplannedBefore: 7, lateAfter: 3, changeoversBefore: 0, changeoversAfter: 0, moved: 0, newlyPlaced: 5, reordered: 5 }),
    '7 not on a press now · 3 would still end late · 5 put on a press, 5 changes in all',
  );
});

test('days read without a time-zone shift; risk levels have tones', () => {
  assert.equal(dayText('2026-10-24'), '24 Oct');
  assert.equal(dayText(null), '—');
  assert.deepEqual(RISK_TONE, { high: 'danger', watch: 'warn', ok: 'success' });
});
