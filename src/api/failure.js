/**
 * What a refused request says, and what the screens get to read off it.
 *
 * Its own module rather than a block inside the axios interceptor because every failure in the
 * app comes through here, and the thing that goes wrong with it cannot be seen by reading it —
 * the reply's `details` is two different shapes depending on which kind of refusal it is, and
 * one of them made this throw. `node --test` can import this; it cannot import the interceptor,
 * which needs axios, `localStorage` and a `window`.
 */

/**
 * The two shapes `details` arrives in, and why it matters which.
 *
 * A validation failure sends an **array** of `{field, message}` — the field-by-field account a
 * form needs. A soft gate sends an **object**: `ApiError.conflict(message, { needs: 'noPodReason' })`,
 * naming the one field a screen must collect to answer the refusal [§15, §19].
 *
 * The first version read `payload.details || []` and called `.filter` on it, which is correct
 * for the array and a TypeError for the object. The throw happened *inside* the interceptor, so
 * the caller was rejected with "payload.details.filter is not a function" in place of the
 * server's sentence — and with no `status` and no `details` on the error at all.
 *
 * That is how both answerable refusals stopped being answerable. The dispatch screens decide
 * between a dialog and a red notice by reading `status === 409` and `details.needs`; both were
 * gone by the time they saw the failure, so the one refusal written to be answered came out as
 * an internal error message nobody could act on. It read like a bug in the dialog and was never
 * in the dialog.
 */
export const fieldErrors = (details) => (Array.isArray(details) ? details : []);

/**
 * The field, said out loud.
 *
 * A refused save reported the server's headline and nothing else, and for a validation failure
 * that headline is the words "Validation failed" — true, and useless. The reply already carries
 * which field and why, so a person staring at a form with twenty boxes was being told to find
 * the wrong one themselves. Folded in here rather than into each form, because every form makes
 * the same mistake and none of them can fix it alone.
 */
const nameFields = (details) =>
  fieldErrors(details)
    .filter((detail) => detail?.message)
    .slice(0, 3)
    .map((detail) => {
      /* `lines.0.quantity` is a path through the payload, not a name anybody typed. The last
         segment is the field; the digits in between are a row, which is worth saying. */
      const parts = String(detail.field || '').split('.');
      const field = parts.filter((part) => !/^\d+$/.test(part)).pop();
      const row = parts.find((part) => /^\d+$/.test(part));
      const label = (field || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase());
      const where = row !== undefined ? `${label} on line ${Number(row) + 1}` : label;
      return where ? `${where}: ${detail.message}` : detail.message;
    });

/** The sentence a screen shows: the server's own, with the offending fields appended. */
export function failureMessage(payload, fallback) {
  const base = payload?.message || fallback || 'Something went wrong. Please try again.';
  const named = nameFields(payload?.details);
  return named.length ? `${base} — ${named.join('; ')}` : base;
}

/**
 * The error every caller is rejected with.
 *
 * `details` is passed through **as it came**, whichever shape it was: a form wants the array, and
 * `answerableField` wants `details.needs` off the object. Normalising it to one of the two here
 * would quietly disable the other.
 */
export function failureFrom(payload, status, fallback) {
  return Object.assign(new Error(failureMessage(payload, fallback)), {
    details: payload?.details,
    status,
  });
}
