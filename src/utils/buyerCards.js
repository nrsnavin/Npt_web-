/**
 * The rule for saving a draft, said before it is sent — the server holds the same one
 * (buyerCard.service `confirmProblem` and the phone check in `confirmCard`). What was recognised in
 * the picture is only a start: the next step, when to follow up and how we met them are always
 * the salesperson's to give.
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

/** The next step as the save sends it: the step, the model, and the task when there is one. */
export function nextStepOf(fields) {
  const step = NEXT_STEPS.find((entry) => entry.value === fields.nextStep);
  if (!step) return {};
  const model = trimmed(fields.stepModel);
  const note = trimmed(fields.stepNote) || undefined;
  const out = {
    nextAction: step.value === 'other' ? trimmed(fields.nextAction) : `${step.action}${model ? ` — ${model}` : ''}`,
    nextActionType: step.type,
    ...(model ? { modelNumber: model } : {}),
  };
  if (step.task === 'sample_request') {
    out.task = {
      kind: step.task,
      note,
      brief: {
        items: [{
          model,
          colour: trimmed(fields.stepColour) || undefined,
          colourType: fields.stepColourType || undefined,
          quantity: trimmed(fields.stepPieces) || undefined,
        }],
      },
    };
  }
  if (step.task === 'create_quotation') {
    out.task = {
      kind: step.task,
      note,
      brief: {
        models: model || undefined,
        material: trimmed(fields.stepColour) || undefined,
        quantity: trimmed(fields.stepQuantity).replace(/,/g, '') || undefined,
        targetPrice: trimmed(fields.stepTargetPrice) || undefined,
      },
    };
  }
  return out;
}

const STEP_FIELDS = ['nextStep', 'stepModel', 'stepColour', 'stepColourType', 'stepPieces', 'stepQuantity', 'stepTargetPrice', 'stepNote'];
/** The draft's own fields, without the next-step form's — those go as `nextStepOf` says. */
export const withoutStepFields = (fields) =>
  Object.fromEntries(Object.entries(fields).filter(([key]) => !STEP_FIELDS.includes(key)));

/** What the next step still needs, or null. */
export function nextStepProblem(fields) {
  if (!fields.nextStep) return 'Pick the next step.';
  if (fields.nextStep === 'other' && !trimmed(fields.nextAction)) return 'Say what the next step is.';
  if (fields.nextStep === 'sample') {
    if (!trimmed(fields.stepModel)) return 'Name the model for the sample.';
    const pieces = trimmed(fields.stepPieces);
    if (pieces && !/^\d+$/.test(pieces)) return 'Sample pieces is a whole number.';
    if (Number(pieces) > SAMPLE_PIECES_WITHOUT_REASON && trimmed(fields.stepNote).length < 3) return 'Say why more than 3 pcs are needed.';
  }
  if (fields.nextStep === 'quote') {
    if (trimmed(fields.stepQuantity) && !/^\d+$/.test(trimmed(fields.stepQuantity).replace(/,/g, ''))) return 'The quantity is a whole number of pieces.';
    if (trimmed(fields.stepTargetPrice) && !(Number(fields.stepTargetPrice) >= 0)) return 'The target price is a number.';
  }
  return null;
}

const digits = (value) => String(value || '').replace(/\D/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why these fields cannot be saved yet, or null. */
export function cardProblem(fields) {
  if (String(fields.company || '').trim().length < 2) return 'A customer needs a company name.';
  const phones = ['mobile', 'whatsapp'].map((key) => fields[key]).filter((value) => String(value || '').trim());
  if (!phones.length && !String(fields.email || '').trim()) return 'A customer needs a phone number or an email to reach them on.';
  const bad = phones.find((value) => digits(value).length < 8 || digits(value).length > 15);
  if (bad) return `${bad} is not a phone number.`;
  if (String(fields.email || '').trim() && !EMAIL.test(String(fields.email).trim())) return 'That email address is not valid.';
  if (Number.isNaN(quantityOf(fields.estimatedQuantity))) return 'A quantity is a whole number of pieces.';
  const step = 'nextStep' in fields ? nextStepProblem(fields) : (!String(fields.nextAction || '').trim() ? 'Say what the next step is.' : null);
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
