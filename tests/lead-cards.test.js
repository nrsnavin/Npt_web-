/**
 * The card form says what the server will say, before a card is confirmed.
 *
 *   node --test tests/lead-cards.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardProblem } from '../src/utils/leadCards.js';
import { actionLabel } from '../src/api/feedback.js';

test('a card needs a company and a way to reach them', () => {
  assert.equal(cardProblem({ company: 'Sri Murugan Garments', mobile: '98400 11223' }), null);
  assert.equal(cardProblem({ company: 'Sri Murugan Garments', email: 'senthil@smg.in' }), null);
  assert.match(cardProblem({ mobile: '9840011223' }), /company name/);
  assert.match(cardProblem({ company: 'X', mobile: '9840011223' }), /company name/);
  assert.match(cardProblem({ company: 'Sri Murugan Garments' }), /phone number or an email/);
});

test('a phone or email that is not one is caught before sending', () => {
  assert.match(cardProblem({ company: 'Sri Murugan Garments', mobile: '12' }), /12 is not a phone number/);
  assert.match(cardProblem({ company: 'Sri Murugan Garments', email: 'senthil at smg' }), /email address is not valid/);
});

test('what the card actions say when they are done', () => {
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards/abc/confirm' }), 'Lead created from the card');
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards/abc/discard' }), 'Card dropped');
  assert.equal(actionLabel({ method: 'post', url: '/lead-cards' }), 'Card read');
});
