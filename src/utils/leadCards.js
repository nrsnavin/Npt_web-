/**
 * The rule for making a draft a lead, said before it is sent — the server holds the same one
 * (leadCard.service `confirmProblem` and the phone check in `confirmCard`). What was recognised in
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

const digits = (value) => String(value || '').replace(/\D/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why these fields cannot become a lead yet, or null. */
export function cardProblem(fields) {
  if (String(fields.company || '').trim().length < 2) return 'A lead needs a company name.';
  const phones = ['mobile', 'whatsapp'].map((key) => fields[key]).filter((value) => String(value || '').trim());
  if (!phones.length && !String(fields.email || '').trim()) return 'A lead needs a phone number or an email to reach them on.';
  const bad = phones.find((value) => digits(value).length < 8 || digits(value).length > 15);
  if (bad) return `${bad} is not a phone number.`;
  if (String(fields.email || '').trim() && !EMAIL.test(String(fields.email).trim())) return 'That email address is not valid.';
  if (Number.isNaN(quantityOf(fields.estimatedQuantity))) return 'A quantity is a whole number of pieces.';
  if (!String(fields.nextAction || '').trim()) return 'Say what the next step is.';
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
  confirmed: { label: 'Made a lead', tone: 'neutral' },
  discarded: { label: 'Dropped', tone: 'neutral' },
};
