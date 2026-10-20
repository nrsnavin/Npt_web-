/**
 * The rule for saving a draft, said before it is sent — the server holds the same one
 * (buyerCard.service `confirmProblem` and the phone check in `confirmCard`). What was recognised in
 * the picture is only a start: when to follow up and how we met them are always the
 * salesperson's to give; the next step is theirs too, but may wait.
 */
export const CARD_FIELDS = [
  ['company', 'Company'],
  ['contactName', 'Contact name'],
  ['designation', 'Designation'],
  ['mobile', 'Mobile'],
  ['whatsapp', 'WhatsApp'],
  ['email', 'Email'],
  ['city', 'City'],
  ['state', 'State'],
  ['productInterest', 'Interested in'],
  ['notes', 'Notes'],
];

/** What the picture was, in the list and above the photo. */
export const KIND_LABEL = { card: 'Card', chat: 'Chat screenshot', email: 'Email', screenshot: 'Screenshot', other: 'Not about a buyer' };

/** "5000" → 5000; "" → null. Anything else is not a quantity. */
export const quantityOf = (text) => {
  const value = String(text ?? '').replace(/,/g, '').trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : NaN;
};

/** Today as the date input writes it, in the reader's own time zone. */
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/**
 * What happens next, picked from a list. A sample or a quotation is that department's task,
 * raised on the new enquiry in the same save [server: buyerCard.controller `confirmBuyerCard`];
 * photos and anything else are the salesperson's own next step.
 */
export const NEXT_STEPS = [
  { value: 'sample', label: 'Sample request', action: 'Send sample', type: 'send_sample', task: 'sample_request', hint: 'Raises the Sampling task' },
  { value: 'quote', label: 'Quotation', action: 'Send quotation', type: 'send_quote', task: 'create_quotation', hint: 'Raises the Quotation task' },
  { value: 'photos', label: 'Send photos', action: 'Send photos', type: 'whatsapp', hint: 'Your next step — no department task' },
  { value: 'other', label: 'Something else', type: 'other', hint: 'Say what in your own words' },
];
export const COLOUR_TYPES = ['Preferred colour', 'Compulsory colour'];
/** More than three pieces of a sample is a cost somebody should explain [server: departmentTaskForms]. */
export const SAMPLE_PIECES_WITHOUT_REASON = 3;

const trimmed = (value) => String(value ?? '').trim();

let rowKeys = 0;
/**
 * A blank model row; `key` keeps React's rows stable when one in the middle is removed. A row is
 * a model on the master — `ref` is `m<id>` (a mould) or `t<id>` (a trading item), `code` its code —
 * or, ticked as a new development, a model not made yet, described in `description`.
 */
export const blankModel = () => ({
  key: `model-${(rowKeys += 1)}`, ref: '', code: '', isNewDevelopment: false, description: '',
  quantity: '', colour: '', asked: '', matchedBy: '',
});

/**
 * The models the picture named, as rows to correct: the master's model where one matched, else
 * the buyer's own words, kept ready as the description should it be a new development.
 */
export function modelsFrom(reading) {
  return (reading?.models || []).map((model) => {
    const ref = model.mould ? `m${model.mould}` : model.tradedItem ? `t${model.tradedItem}` : '';
    return {
      ...blankModel(),
      ref,
      code: ref ? model.code || '' : '',
      description: ref ? '' : model.asked || model.code || '',
      quantity: model.quantity ? String(model.quantity) : '',
      colour: model.colour || '',
      asked: model.asked || '',
      matchedBy: ref ? model.matchedBy || '' : '',
    };
  });
}

/** Tomorrow, as the date input writes it — the follow-up a draft starts with. */
export const tomorrowIso = () => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
};

/** A row names a model: one picked from the master, or a new development described. */
export const namesModel = (row) => Boolean(row.ref || (row.isNewDevelopment && trimmed(row.description)));
/** What a row is called: its code, or the new development's description. */
export const modelName = (row) => (row.ref ? trimmed(row.code) || 'the chosen model' : trimmed(row.description) || 'the new model');

/** The rows as the enquiry's models [server: buyerCard.service `enquiryItemsFrom`]. */
export function itemsOf(rows = []) {
  return rows.filter(namesModel).map((row) => {
    const pieces = trimmed(row.quantity).replace(/,/g, '');
    let model;
    if (row.ref.startsWith('m')) model = { mould: row.ref.slice(1) };
    /* A trading item goes by its model number — what the quotation and the trading master know it by. */
    else if (row.ref.startsWith('t')) model = { modelNumber: trimmed(row.code) };
    else model = { isNewDevelopment: true, modelNumber: trimmed(row.description) };
    return {
      ...model,
      ...(/^\d+$/.test(pieces) && Number(pieces) > 0 ? { quantity: Number(pieces) } : {}),
      ...(trimmed(row.colour) ? { colour: trimmed(row.colour) } : {}),
    };
  });
}

/**
 * The words to suggest master models from, for one row: what the buyer wrote, or — ticked as a
 * new development — its description, so a model the plant already has is not developed twice.
 * A row picked by its code, or by hand, needs none.
 */
export function suggestWordsOf(row) {
  if (row.isNewDevelopment) return trimmed(row.description);
  if (row.ref && row.matchedBy !== 'model') return '';
  return trimmed(row.asked);
}

/** Suggestions worth showing: not the one already chosen. */
export const otherSuggestions = (options = [], chosen = '') => options.filter((option) => (option.ref || option._id) !== chosen);

/** Why a row does not name a model yet, or null. */
export function modelRowProblem(row, index) {
  if (namesModel(row)) return null;
  if (row.isNewDevelopment) return `Describe the new development for model ${index + 1}.`;
  return `Model ${index + 1}: pick it from the master, tick New development, or remove the row.`;
}

/**
 * The next step as the save sends it: the step, and the task when there is one — built from the
 * draft's models, every one of them.
 */
export function nextStepOf(fields, models = []) {
  const step = NEXT_STEPS.find((entry) => entry.value === fields.nextStep);
  if (!step) return {};
  const named = models.filter(namesModel);
  const codes = named.map(modelName);
  const note = trimmed(fields.stepNote) || undefined;
  const out = {
    nextAction: step.value === 'other' ? trimmed(fields.nextAction) : `${step.action}${codes.length ? ` — ${codes.join(', ')}` : ''}`,
    nextActionType: step.type,
  };
  if (step.task === 'sample_request') {
    out.task = {
      kind: step.task,
      note,
      brief: {
        items: named.map((row) => ({
          model: modelName(row),
          colour: trimmed(row.colour) || undefined,
          colourType: fields.stepColourType || undefined,
          quantity: trimmed(fields.stepPieces) || undefined,
        })),
      },
    };
  }
  /* One row per model, each with its own colour and pieces, and the buyer's target price on each. */
  if (step.task === 'create_quotation') {
    const pieces = (row) => Number(trimmed(row.quantity).replace(/,/g, '')) || 0;
    out.task = {
      kind: step.task,
      note,
      brief: {
        items: named.map((row) => ({
          model: modelName(row),
          material: trimmed(row.colour) || undefined,
          quantity: pieces(row) ? String(pieces(row)) : undefined,
          targetPrice: trimmed(fields.stepTargetPrice) || undefined,
        })),
      },
    };
  }
  return out;
}

const STEP_FIELDS = ['nextStep', 'stepColourType', 'stepPieces', 'stepTargetPrice', 'stepNote'];
/** The draft's own fields, without the next-step form's — those go as `nextStepOf` says. */
export const withoutStepFields = (fields) =>
  Object.fromEntries(Object.entries(fields).filter(([key]) => !STEP_FIELDS.includes(key)));

/** What the models and the next step still need, or null. Not picking a step is fine. */
export function nextStepProblem(fields, models = []) {
  const unnamed = models.map(modelRowProblem).find(Boolean);
  if (unnamed) return unnamed;
  const bad = models.find((row) => trimmed(row.quantity) && !/^\d+$/.test(trimmed(row.quantity).replace(/,/g, '')));
  if (bad) return `The quantity for ${modelName(bad)} is a whole number of pieces.`;
  if (!fields.nextStep) return null;
  if (fields.nextStep === 'other' && !trimmed(fields.nextAction)) return 'Say what the next step is.';
  if (fields.nextStep === 'sample') {
    if (!models.some(namesModel)) return 'Add the model for the sample.';
    const pieces = trimmed(fields.stepPieces);
    if (pieces && !/^\d+$/.test(pieces)) return 'Sample pieces is a whole number.';
    if (Number(pieces) > SAMPLE_PIECES_WITHOUT_REASON && trimmed(fields.stepNote).length < 3) return 'Say why more than 3 pcs are needed.';
  }
  if (fields.nextStep === 'quote' && trimmed(fields.stepTargetPrice) && !(Number(fields.stepTargetPrice) >= 0)) {
    return 'The target price is a number.';
  }
  return null;
}

const digits = (value) => String(value || '').replace(/\D/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Why these fields cannot be saved yet, or null. On a customer picked from the master the
 * company and how to reach them are that customer's already, so they are not asked again.
 */
export function cardProblem(fields, models = []) {
  if (!fields.customer) {
    if (String(fields.company || '').trim().length < 2) return 'A customer needs a company name.';
    const phones = ['mobile', 'whatsapp'].map((key) => fields[key]).filter((value) => String(value || '').trim());
    if (!phones.length && !String(fields.email || '').trim()) return 'A customer needs a phone number or an email to reach them on.';
    const bad = phones.find((value) => digits(value).length < 8 || digits(value).length > 15);
    if (bad) return `${bad} is not a phone number.`;
    if (String(fields.email || '').trim() && !EMAIL.test(String(fields.email).trim())) return 'That email address is not valid.';
  }
  if (Number.isNaN(quantityOf(fields.estimatedQuantity))) return 'A quantity is a whole number of pieces.';
  const step = nextStepProblem(fields, models);
  if (step) return step;
  if (!fields.nextFollowUpDate) return 'Say when to follow up.';
  if (String(fields.nextFollowUpDate) < todayIso()) return 'The follow-up date cannot be in the past.';
  if (!fields.source) return 'Say how we met them.';
  return null;
}

/** What the card's status means, for a badge. */
export const CARD_STATUS = {
  reading: { label: 'Reading…', tone: 'info' },
  ready: { label: 'Draft', tone: 'info' },
  unreadable: { label: 'Draft — fill in', tone: 'warn' },
  confirmed: { label: 'Saved as enquiry', tone: 'neutral' },
  discarded: { label: 'Dropped', tone: 'neutral' },
};
