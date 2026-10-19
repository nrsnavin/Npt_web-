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
  const ncp = { ...blankModel(), ref: 'm1', code: 'NCP-25' };
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
  assert.deepEqual(rows.map((row) => [row.ref, row.code, row.description, row.quantity, row.colour, row.asked]), [
    ['mm1', 'NCP-25', '', '5000', 'Black', 'NCP 25'],
    ['tt1', 'MAU-35 WB', '', '', '', 'mau 35 wb'],
    ['', '', 'the round one', '', '', 'the round one'],
  ]);
  assert.ok(new Set(rows.map((row) => row.key)).size === 3, 'every row its own key');
  assert.deepEqual(itemsOf(rows), [
    { mould: 'm1', quantity: 5000, colour: 'Black' },
    { modelNumber: 'MAU-35 WB' },
  ], 'a row not on the master and not ticked new names nothing yet');
  rows[2].isNewDevelopment = true;
  assert.deepEqual(itemsOf(rows)[2], { isNewDevelopment: true, modelNumber: 'the round one' }, 'ticked: a new development');

  const sample = nextStepOf({ nextStep: 'sample', stepColourType: 'Compulsory colour', stepPieces: '2', stepNote: '' }, rows);
  assert.equal(sample.nextAction, 'Send sample — NCP-25, MAU-35 WB, the round one');
  assert.equal(sample.nextActionType, 'send_sample');
  assert.deepEqual(sample.task.brief.items[0], { model: 'NCP-25', colour: 'Black', colourType: 'Compulsory colour', quantity: '2' });
  assert.equal(sample.task.brief.items.length, 3, 'one sample row per model');

  const quote = nextStepOf({ nextStep: 'quote', stepTargetPrice: '4.5', stepNote: 'Pack 200 a carton' }, [{ ...rows[0] }, { ...rows[1], quantity: '2,000', colour: 'Brown' }]);
  assert.deepEqual(quote.task.brief.items, [
    { model: 'NCP-25', material: 'Black', quantity: '5000', targetPrice: '4.5' },
    { model: 'MAU-35 WB', material: 'Brown', quantity: '2000', targetPrice: '4.5' },
  ], 'a row per model, each with its own colour and pieces');
  assert.equal(quote.task.note, 'Pack 200 a carton');
  assert.deepEqual(nextStepOf({ nextStep: 'photos' }, []), { nextAction: 'Send photos', nextActionType: 'whatsapp' });
  assert.deepEqual(nextStepOf({ nextStep: 'other', nextAction: ' Call the owner ' }), { nextAction: 'Call the owner', nextActionType: 'other' });
  assert.deepEqual(withoutStepFields({ company: 'X', nextStep: 'sample', stepPieces: '2', stepNote: 'n' }), { company: 'X' });
});

test('every model row is on the master or ticked as a new development, described', async () => {
  const { blankModel } = await import('../src/utils/buyerCards.js');
  const base = { company: 'Velan Textiles', mobile: '9789012345', nextFollowUpDate: todayIso(), source: 'trade_show' };
  assert.match(cardProblem(base, [{ ...blankModel(), asked: 'the round one' }]), /Model 1: pick it from the master, tick New development/);
  assert.match(cardProblem(base, [{ ...blankModel(), isNewDevelopment: true, description: ' ' }]), /Describe the new development for model 1/);
  assert.equal(cardProblem(base, [{ ...blankModel(), isNewDevelopment: true, description: 'Round velvet, 380mm' }]), null);
  assert.equal(cardProblem(base, [{ ...blankModel(), ref: 'tabc', code: 'MAU-35 WB' }]), null);
});

test('the follow-up starts at tomorrow', async () => {
  const { tomorrowIso } = await import('../src/utils/buyerCards.js');
  const tomorrow = new Date(`${todayIso()}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  assert.equal(tomorrowIso(), `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`);
  assert.ok(tomorrowIso() > todayIso());
});

test('a draft on a customer already on the register is not asked for their company or number', () => {
  const rest2 = { nextFollowUpDate: todayIso(), source: 'trade_show' };
  assert.match(cardProblem({ ...rest2 }), /company name/);
  assert.equal(cardProblem({ ...rest2, customer: 'c1' }), null);
  assert.equal(cardProblem({ ...rest2, customer: 'c1', mobile: '12' }), null, 'the draft’s numbers are not used');
  assert.match(cardProblem({ customer: 'c1', source: 'trade_show' }), /when to follow up/, 'the rest is still asked');
});

test('suggestions come from the buyer’s words, or a new development’s description, and leave out what is chosen', async () => {
  const { blankModel, suggestWordsOf, otherSuggestions } = await import('../src/utils/buyerCards.js');
  assert.equal(suggestWordsOf({ ...blankModel(), asked: ' round velvet one ' }), 'round velvet one', 'not on the master yet');
  assert.equal(suggestWordsOf({ ...blankModel(), ref: 'm1', matchedBy: 'model', asked: '400mm suit' }), '400mm suit', 'a guess by AI: offer others');
  assert.equal(suggestWordsOf({ ...blankModel(), ref: 'm1', matchedBy: 'code', asked: 'M 101' }), '', 'matched by its code: nothing to ask');
  assert.equal(suggestWordsOf({ ...blankModel(), ref: 'm1', asked: 'M 101' }), '', 'picked by hand: nothing to ask');
  assert.equal(suggestWordsOf({ ...blankModel(), isNewDevelopment: true, asked: 'x', description: 'Velvet 380mm' }), 'Velvet 380mm', 'a new development is checked against the master');
  assert.deepEqual(otherSuggestions([{ ref: 'm1' }, { ref: 't2' }], 'm1'), [{ ref: 't2' }]);
  assert.deepEqual(otherSuggestions([{ _id: 'c1' }, { _id: 'c2' }], 'c2'), [{ _id: 'c1' }]);
  assert.deepEqual(otherSuggestions(undefined, ''), []);
});
