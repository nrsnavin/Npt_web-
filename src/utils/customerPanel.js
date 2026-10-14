/**
 * What the customer side panel offers, as plain functions [components/CustomerPanel.jsx].
 *
 * The panel raises the same department tasks the enquiry screen does, for a buyer straight off
 * the party master. A task goes either on one of the buyer's open enquiries or — the default —
 * to the department with no enquiry behind it, named for the buyer (a team task).
 */

/**
 * Steps that only mean something on an enquiry: a quotation, a negotiation and a sales order are
 * raised on one [server: no quotation or order without an enquiry], and Photos Sent records on
 * one. From "no enquiry" they first use or open one.
 */
export const NEEDS_ENQUIRY = ['create_quotation', 'price_negotiation', 'po_so', 'photos_sent'];

/** Closing is an enquiry's own end: offered only while a task goes on an enquiry. */
export const ENQUIRY_ONLY_SHOWN = ['task_closed'];

export const TEAM = 'team';

/** The buttons the panel shows, in the plant's order, each saying what a click does. */
export function panelButtons(catalogue, target) {
  const onEnquiry = target && target !== TEAM;
  return (catalogue?.buttons || [])
    .filter((button) => !button.hidden)
    .filter((button) => onEnquiry || !ENQUIRY_ONLY_SHOWN.includes(button.key))
    /* "My Payment Follow-up" is the raiser's own to-do: it works on an enquiry or for a team. */
    .map((button) => ({
      ...button,
      needsEnquiry: !onEnquiry && NEEDS_ENQUIRY.includes(button.key),
      record: !button.department,
    }));
}

/** The twelve stage tiles, each with the button it raises (none for marketing's own first). */
export function panelTiles(catalogue, target, stage) {
  const onEnquiry = target && target !== TEAM;
  return (catalogue?.stages || [])
    .filter((item) => item.number)
    .map((item) => {
      const button = item.kind && (catalogue.buttons || []).find((entry) => entry.key === item.kind);
      return {
        ...item,
        here: Boolean(onEnquiry && stage === item.key),
        button: button || null,
        needsEnquiry: Boolean(button && !onEnquiry && NEEDS_ENQUIRY.includes(button.key)),
      };
    });
}

/** Digits for a wa.me link: Indian numbers as 91XXXXXXXXXX. */
export function whatsappLink(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** A due date read against now: late, today or ahead. */
export function dueState(date, now = new Date()) {
  if (!date) return null;
  const due = new Date(date);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  if (due < startOfToday) return 'late';
  if (due < endOfToday) return 'today';
  return 'ahead';
}
