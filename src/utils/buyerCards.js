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
export const KIND_LABEL = { card: 'Card', chat: 'Chat screenshot', other: 'Not a card or chat' };

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
/** A blank model row; `key` keeps React's rows stable when one in the middle is removed. */
export const blankModel = () => ({ key: `model-${(rowKeys += 1)}`, mould: '', code: '', quantity: '', colour: '', asked: '', matchedBy: '' });

/**
 * The models the picture named, as rows to correct: the matched tool, or the code (a bought-in
 * item's, or the buyer's own words when nothing matched), with their pieces and colour.
 */
export function modelsFrom(reading) {
  return (reading?.models || []).map((model) => ({
    ...blankModel(),
    mould: model.mould ? String(model.mould) : '',
    code: model.mould ? model.code || '' : model.code || model.asked || '',
    quantity: model.quantity ? String(model.quantity) : '',
    colour: model.colour || '',
    asked: model.asked || '',
    matchedBy: model.matchedBy || '',
  }));
}

/** A row names a model: a tool from the register, or a code typed in. */
export const namesModel = (row) => Boolean(row.mould || trimmed(row.code));
/** What a row is called: its code. */
export const modelName = (row) => trimmed(row.code) || 'the chosen model';

/** The rows as the enquiry's models [server: buyerCard.service `enquiryItemsFrom`]. */
export function itemsOf(rows = []) {
  return rows.filter(namesModel).map((row) => {
    const pieces = trimmed(row.quantity).replace(/,/g, '');
    return {
      ...(row.mould ? { mould: row.mould } : { modelNumber: trimmed(row.code) }),
      ...(/^\d+$/.test(pieces) && Number(pieces) > 0 ? { quantity: Number(pieces) } : {}),
      ...(trimmed(row.colour) ? { colour: trimmed(row.colour) } : {}),
    };
  });
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
  if (step.task === 'create_quotation') {
    const total = named.reduce((sum, row) => sum + (Number(trimmed(row.quantity).replace(/,/g, '')) || 0), 0);
    const colours = [...new Set(named.map((row) => trimmed(row.colour)).filter(Boolean))];
    out.task = {
      kind: step.task,
      note,
      brief: {
        models: codes.join(', ') || undefined,
        material: colours.join(', ') || undefined,
        quantity: total ? String(total) : undefined,
        targetPrice: trimmed(fields.stepTargetPrice) || undefined,
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

/** Why these fields cannot be saved yet, or null. */
export function cardProblem(fields, models = []) {
  if (String(fields.company || '').trim().length < 2) return 'A customer needs a company name.';
  const phones = ['mobile', 'whatsapp'].map((key) => fields[key]).filter((value) => String(value || '').trim());
  if (!phones.length && !String(fields.email || '').trim()) return 'A customer needs a phone number or an email to reach them on.';
  const bad = phones.find((value) => digits(value).length < 8 || digits(value).length > 15);
  if (bad) return `${bad} is not a phone number.`;
  if (String(fields.email || '').trim() && !EMAIL.test(String(fields.email).trim())) return 'That email address is not valid.';
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
