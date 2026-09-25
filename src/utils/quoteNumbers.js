/**
 * Quote numbers as the plant writes them — NP/26-27/043 — and the rule for moving the sequence.
 *
 * The server holds the rule (routes/pricing: PUT /quotations/numbering); this is the same rule
 * said early, so the form can explain itself before anything is sent.
 */
export const formatQuoteNumber = (financialYear, seq) => `NP/${financialYear}/${String(seq).padStart(3, '0')}`;

/** Why `raw` cannot be the next number, or null if it can. */
export function numberingProblem(raw, { lowestAllowed, lastIssued }) {
  const text = String(raw ?? '').trim();
  if (!text) return 'Give the number the next quote should have';
  if (!/^\d+$/.test(text)) return 'A quote number is a whole number';
  const next = Number(text);
  if (next < 1) return 'Quote numbers start at 1';
  if (next > 99999) return 'That is more quotes than a year holds';
  if (next < lowestAllowed) {
    return `${lastIssued} is already on a quote — the next can be ${lowestAllowed} or higher`;
  }
  return null;
}
