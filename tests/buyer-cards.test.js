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

test('the next step may wait; a sample needs a model listed, and more than 3 pcs needs a reason', async () => {
  const { nextStepProblem, blankModel } = await import('../src/utils/buyerCards.js');
  const base = { company: 'Velan Textiles', mobile: '9789012345', nextFollowUpDate: todayIso(), source: 'trade_show' };
  const ncp = { ...blankModel(), code: 'NCP-25' };
  assert.equal(cardProblem({ ...base, nextStep: '' }), null, 'the next step may wait');
  assert.equal(cardProblem(base), null);
  assert.match(cardProblem({ ...base, nextStep: 'other', nextAction: ' ' }), /Say what the next step is/);
  assert.equal(cardProblem({ ...base, nextStep: 'other', nextAction: 'Call the owner' }), null);
  assert.match(cardProblem({ ...base, nextStep: 'sample' }, []), /Add the model for the sample/);
  assert.equal(cardProblem({ ...base, nextStep: 'sample', stepPieces: '2' }, [ncp]), null);
  assert.match(nextStepProblem({ nextStep: 'sample', stepPieces: '6' }, [ncp]), /more than 3 pcs/);
  assert.equal(nextStepProblem({ nextStep: 'sample', stepPieces: '6', stepNote: 'Buyer shows it to two stores' }, [ncp]), null);
  assert.equal(cardProblem({ ...base, nextStep: 'photos' }), null, 'photos need nothing more');
  assert.match(nextStepProblem({}, [{ ...ncp, quantity: 'lots' }]), /quantity for NCP-25 is a whole number/);
});

test('the models read become rows; the rows become the enquiry’s models and the task’s', async () => {
  const { modelsFrom, itemsOf, nextStepOf, withoutStepFields } = await import('../src/utils/buyerCards.js');
  const rows = modelsFrom({
    models: [
      { asked: 'NCP 25', code: 'NCP-25', mould: 'm1', quantity: 5000, colour: 'Black', matchedBy: 'code' },
      { asked: 'mau 35 wb', code: 'MAU-35 WB', tradedItem: 't1', matchedBy: 'model' },
      { asked: 'the round one' },
    ],
  });
  assert.deepEqual(rows.map((row) => [row.mould, row.code, row.quantity, row.colour, row.asked]), [
    ['m1', 'NCP-25', '5000', 'Black', 'NCP 25'],
    ['', 'MAU-35 WB', '', '', 'mau 35 wb'],
    ['', 'the round one', '', '', 'the round one'],
  ]);
  assert.ok(new Set(rows.map((row) => row.key)).size === 3, 'every row its own key');
  rows.push({ ...rows[0], key: 'empty', mould: '', code: ' ' });
  assert.deepEqual(itemsOf(rows), [
    { mould: 'm1', quantity: 5000, colour: 'Black' },
    { modelNumber: 'MAU-35 WB' },
    { modelNumber: 'the round one' },
  ], 'a row naming nothing is left out');

  const sample = nextStepOf({ nextStep: 'sample', stepColourType: 'Compulsory colour', stepPieces: '2', stepNote: '' }, rows);
  assert.equal(sample.nextAction, 'Send sample — NCP-25, MAU-35 WB, the round one');
  assert.equal(sample.nextActionType, 'send_sample');
  assert.deepEqual(sample.task.brief.items[0], { model: 'NCP-25', colour: 'Black', colourType: 'Compulsory colour', quantity: '2' });
  assert.equal(sample.task.brief.items.length, 3, 'one sample row per model');

  const quote = nextStepOf({ nextStep: 'quote', stepTargetPrice: '4.5', stepNote: 'Pack 200 a carton' }, [{ ...rows[0] }, { ...rows[1], quantity: '2,000', colour: 'Brown' }]);
  assert.deepEqual(quote.task.brief, { models: 'NCP-25, MAU-35 WB', material: 'Black, Brown', quantity: '7000', targetPrice: '4.5' });
  assert.equal(quote.task.note, 'Pack 200 a carton');
  assert.deepEqual(nextStepOf({ nextStep: 'photos' }, []), { nextAction: 'Send photos', nextActionType: 'whatsapp' });
  assert.deepEqual(nextStepOf({ nextStep: 'other', nextAction: ' Call the owner ' }), { nextAction: 'Call the owner', nextActionType: 'other' });
  assert.deepEqual(withoutStepFields({ company: 'X', nextStep: 'sample', stepPieces: '2', stepNote: 'n' }), { company: 'X' });
});
