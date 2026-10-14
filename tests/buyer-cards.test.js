/**
 * The draft-enquiry form says what the server will say, before a draft is saved.
 *
 *   node --test tests/buyer-cards.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardProblem, todayIso } from '../src/utils/buyerCards.js';

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
  assert.equal(actionLabel({ method: 'post', url: '/buyer-cards/abc/confirm' }), 'Enquiry saved from the draft');
  assert.equal(actionLabel({ method: 'post', url: '/buyer-cards/abc/discard' }), 'Draft dropped');
  assert.equal(actionLabel({ method: 'post', url: '/buyer-cards' }), 'Draft saved');
});

test('a quantity is a whole number of pieces, or left empty', async () => {
  const { quantityOf } = await import('../src/utils/buyerCards.js');
  assert.equal(quantityOf('5,000'), 5000);
  assert.equal(quantityOf(''), null);
  assert.ok(Number.isNaN(quantityOf('5k')));
  assert.match(cardProblem({ ...rest, company: 'Velan Textiles', mobile: '9789012345', estimatedQuantity: 'lots' }), /whole number of pieces/);
  assert.equal(cardProblem({ ...rest, company: 'Velan Textiles', mobile: '9789012345', estimatedQuantity: 5000 }), null);
});

test('when and how we met them are always the salesperson\'s to give; the next step may wait', () => {
  const read = { company: 'Velan Textiles', mobile: '9789012345' };
  assert.match(cardProblem(read), /when to follow up/);
  assert.match(cardProblem({ ...read, nextAction: 'Call' }), /when to follow up/);
  assert.match(cardProblem({ ...read, nextAction: 'Call', nextFollowUpDate: '2020-01-01' }), /cannot be in the past/);
  assert.match(cardProblem({ ...read, nextAction: 'Call', nextFollowUpDate: todayIso() }), /how we met them/);
  assert.equal(cardProblem({ ...read, ...rest }), null);
});

test('the next step is picked; a sample needs its model, and more than 3 pcs needs a reason', async () => {
  const { nextStepProblem } = await import('../src/utils/buyerCards.js');
  const base = { company: 'Velan Textiles', mobile: '9789012345', nextFollowUpDate: todayIso(), source: 'trade_show' };
  assert.equal(cardProblem({ ...base, nextStep: '' }), null, 'the next step may wait');
  assert.equal(cardProblem(base), null);
  assert.match(cardProblem({ ...base, nextStep: 'other', nextAction: ' ' }), /Say what the next step is/);
  assert.equal(cardProblem({ ...base, nextStep: 'other', nextAction: 'Call the owner' }), null);
  assert.match(cardProblem({ ...base, nextStep: 'sample', stepModel: '' }), /model for the sample/);
  assert.equal(cardProblem({ ...base, nextStep: 'sample', stepModel: 'NH-400', stepPieces: '2' }), null);
  assert.match(nextStepProblem({ nextStep: 'sample', stepModel: 'NH-400', stepPieces: '6' }), /more than 3 pcs/);
  assert.equal(nextStepProblem({ nextStep: 'sample', stepModel: 'NH-400', stepPieces: '6', stepNote: 'Buyer shows it to two stores' }), null);
  assert.equal(cardProblem({ ...base, nextStep: 'photos' }), null, 'photos need nothing more');
  assert.match(nextStepProblem({ nextStep: 'quote', stepQuantity: 'lots' }), /whole number/);
});

test('a sample or a quotation goes as that department’s task; photos are only the next step', async () => {
  const { nextStepOf, withoutStepFields } = await import('../src/utils/buyerCards.js');
  assert.deepEqual(nextStepOf({ nextStep: 'sample', stepModel: ' NH-400 ', stepColour: 'Black', stepColourType: 'Compulsory colour', stepPieces: '2', stepNote: '' }), {
    nextAction: 'Send sample — NH-400',
    nextActionType: 'send_sample',
    modelNumber: 'NH-400',
    task: { kind: 'sample_request', note: undefined, brief: { items: [{ model: 'NH-400', colour: 'Black', colourType: 'Compulsory colour', quantity: '2' }] } },
  });
  const quote = nextStepOf({ nextStep: 'quote', stepModel: 'NH-420', stepColour: 'PP black', stepQuantity: '5,000', stepTargetPrice: '4.5', stepNote: 'Pack 200 a carton' });
  assert.equal(quote.task.kind, 'create_quotation');
  assert.deepEqual(quote.task.brief, { models: 'NH-420', material: 'PP black', quantity: '5000', targetPrice: '4.5' });
  assert.equal(quote.task.note, 'Pack 200 a carton');
  assert.deepEqual(nextStepOf({ nextStep: 'photos', stepModel: '' }), { nextAction: 'Send photos', nextActionType: 'whatsapp' });
  assert.deepEqual(nextStepOf({ nextStep: 'other', nextAction: ' Call the owner ' }), { nextAction: 'Call the owner', nextActionType: 'other' });
  assert.deepEqual(withoutStepFields({ company: 'X', nextStep: 'sample', stepModel: 'NH-400', stepNote: 'n' }), { company: 'X' });
});
