/**
 * The card form says what the server will say, before a card is confirmed.
 *
 *   node --test tests/lead-cards.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardProblem, todayIso } from '../src/utils/leadCards.js';

const rest = { nextAction: 'Send the rate card', nextFollowUpDate: todayIso(), source: 'trade_show' };
import { actionLabel } from '../src/api/feedback.js';

test('a card needs a company and a way to reach them', () => {
  assert.equal(cardProblem({ ...rest, company: 'Sri Murugan Garments', mobile: '98400 11223' }), null);
  assert.equal(cardProblem({ ...rest, company: 'Sri Murugan Garments', email: 'senthil@smg.in' }), null);
  assert.match(cardProblem({ ...rest, mobile: '9840011223' }), /company name/);
  assert.match(cardProblem({ ...rest, company: 'X', mobile: '9840011223' }), /company name/);
  assert.match(cardProblem({ ...rest, company: 'Sri Murugan Garments' }), /phone number or an email/);
});

test('a phone or email that is not one is caught before sending', () => {
  assert.match(cardProblem({ ...rest, company: 'Sri Murugan Garments', mobile: '12' }), /12 is not a phone number/);
  assert.match(cardProblem({ ...rest, company: 'Sri Murugan Garments', email: 'senthil at smg' }), /email address is not valid/);
});

test('what the card actions say when they are done', () => {
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards/abc/confirm' }), 'Lead saved from the draft');
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards/abc/discard' }), 'Draft dropped');
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards' }), 'Draft saved');
});

test('a quantity is a whole number of pieces, or left empty', async () => {
  const { quantityOf } = await import('../src/utils/leadCards.js');
  assert.equal(quantityOf('5,000'), 5000);
  assert.equal(quantityOf(''), null);
  assert.ok(Number.isNaN(quantityOf('5k')));
  assert.match(cardProblem({ ...rest, company: 'Velan Textiles', mobile: '9789012345', estimatedQuantity: 'lots' }), /whole number of pieces/);
  assert.equal(cardProblem({ ...rest, company: 'Velan Textiles', mobile: '9789012345', estimatedQuantity: 5000 }), null);
});

test('the next step, when, and how we met them are always the salesperson\'s to give', () => {
  const read = { company: 'Velan Textiles', mobile: '9789012345' };
  assert.match(cardProblem(read), /next step/);
  assert.match(cardProblem({ ...read, nextAction: 'Call' }), /when to follow up/);
  assert.match(cardProblem({ ...read, nextAction: 'Call', nextFollowUpDate: '2020-01-01' }), /cannot be in the past/);
  assert.match(cardProblem({ ...read, nextAction: 'Call', nextFollowUpDate: todayIso() }), /how we met them/);
  assert.equal(cardProblem({ ...read, ...rest }), null);
});
