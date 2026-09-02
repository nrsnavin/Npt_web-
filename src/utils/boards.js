/**
 * What a kanban column *means*, for each of the three boards.
 *
 * The server hands back a column per status and no opinion about any of them, which is right:
 * whether `lost` is a lane you work in or a tray you file into is a question about the screen,
 * not about the data. This is where that question is answered, once, for all three boards.
 *
 * Three ideas do the work.
 *
 * **A rung is not a tray.** The ladder is what the job climbs, left to right, and the shape of
 * that row is the thing a manager reads at a glance — where the work is bunched, where it
 * thins. `hold` and `lost` are not rungs: an enquiry can be parked or lost from anywhere and
 * comes off a park wherever it left. Mixed into the ladder they would flatten the funnel into a
 * row of twelve equal boxes and destroy the only picture the board draws. So they sit in a tray
 * at the end, narrower and quieter, still droppable and still counted.
 *
 * **A column that cannot be dropped on says so.** Four of the sample columns and one of the
 * lead columns refuse a card, and each refuses for a reason the server already enforces —
 * the customer's verdict is not the bench's to record, a lead is converted through the action
 * that also creates the customer. A board that lets you drop and then shows an error has taught
 * the reader that the screen guesses. One that dims the column and explains itself has taught
 * them the process.
 *
 * **What a move needs is asked for before it is made.** Losing an enquiry needs a reason,
 * parking one needs to say what it is waiting on, winning needs the figure, dispatching a
 * sample needs a courier and an AWB. These are the server's rules; stating them here lets the
 * drop open a dialog that asks, instead of firing a request that can only come back 400.
 */
import {
  CLOSED_STAGES, DISQUALIFY_REASONS, ENQUIRY_STAGES, FEEDBACK_OUTCOMES, LEAD_STAGES,
  LOST_REASONS, SAMPLE_STAGES,
} from './pipeline.js';

/**
 * Tone by what a column *means*, shared across the three vocabularies.
 *
 * A lead is converted or disqualified; an enquiry is won or lost; a sample is approved or
 * rejected. Those are the same two ideas in three sets of words, and keying the colour on the
 * meaning stops the boards drifting into disagreeing about what green is — the same argument
 * the stage strip already makes.
 */
const GOOD = ['converted', 'won', 'approved'];
const BAD = ['disqualified', 'lost', 'rejected', 'cancelled'];
const PARKED = ['hold', 'modification_required'];

export const columnTone = (status) => {
  if (GOOD.includes(status)) return 'good';
  if (BAD.includes(status)) return 'bad';
  if (PARKED.includes(status)) return 'parked';
  return 'working';
};

/** A column nobody may drop on, and the sentence explaining why. */
const closedTo = (why) => ({ droppable: false, why });

/* --------------------------------------- Leads --------------------------------------- */

export const LEAD_BOARD = {
  key: 'leads',
  /** The ladder: what a lead climbs. */
  ladder: ['new', 'contacted', 'qualified'],
  /** The outcomes, filed at the end. */
  tray: ['converted', 'disqualified'],
  labels: Object.fromEntries(LEAD_STAGES.map((stage) => [stage.value, stage.label])),
  /*
   * A lead move carries no general note, because there is no field on a lead for one to land
   * in — `PATCH /leads/:id` would accept the key and zod would strip it, and a note somebody
   * typed that silently disappears is worse than a box that was never offered. Disqualifying
   * has `disqualifyNote`, so that move alone asks.
   */
  noteField: null,
  rules: {
    /*
     * Converting writes a customer, a contact and the first enquiry in one action, and asks
     * which of those to create. None of that fits on the end of a drag, and the server refuses
     * a bare status change to `converted` for the same reason.
     */
    converted: closedTo('Converting also creates the customer and the first enquiry — open the lead and use Convert.'),
    disqualified: { needs: ['disqualifyReason'], note: 'disqualifyNote' },
  },
};

/* ------------------------------------- Enquiries ------------------------------------- */

export const ENQUIRY_BOARD = {
  key: 'enquiries',
  ladder: [
    'new', 'requirement_clarification', 'sample_required', 'sample_feedback_pending',
    'pricing_required', 'quote_submitted', 'negotiation', 'customer_decision_pending',
    'po_expected', 'won',
  ],
  /* Off the ladder by design — see `ENQUIRY_STAGE_ORDER` on both sides of the wire. */
  tray: ['hold', 'lost'],
  labels: Object.fromEntries(ENQUIRY_STAGES.map((stage) => [stage.value, stage.label])),
  noteField: 'note',
  rules: {
    won: { needs: ['estimatedValue'] },
    lost: { needs: ['lostReason'] },
    hold: { needs: ['holdReason'] },
  },
  /**
   * Dragging a card *out of* won or lost is a reopen, and the server will not do one without a
   * note saying why — the note lands in the history beside the close it undoes, so the record
   * explains itself later. Stated here so the dialog asks rather than the request bouncing.
   */
  needsFrom: (card) => (CLOSED_STAGES.includes(card?.status) ? ['note'] : []),
};

/* -------------------------------------- Samples -------------------------------------- */

const FEEDBACK_WHY =
  'What the customer said is recorded by whoever spoke to them — open the sample and use Record feedback.';

export const SAMPLE_BOARD = {
  key: 'samples',
  ladder: [
    'request_received', 'checking_stock', 'sample_available', 'production_required',
    'printing_required', 'sample_ready', 'dispatched', 'delivered', 'customer_feedback_pending',
  ],
  /* The four the bench may not move a card into, drawn because they are what it is all for. */
  tray: ['approved', 'modification_required', 'rejected', 'cancelled'],
  labels: Object.fromEntries(SAMPLE_STAGES.map((stage) => [stage.value, stage.label])),
  noteField: 'note',
  rules: {
    ...Object.fromEntries(FEEDBACK_OUTCOMES.map((status) => [status, closedTo(FEEDBACK_WHY)])),
    /*
     * Cancelling ends a request rather than advancing it, and usually follows the enquiry
     * behind it being lost. Reachable from the sample itself, not from a slip of the mouse.
     */
    cancelled: closedTo('Cancelling a request is done from the sample, so the reason goes on the record.'),
    dispatched: { needs: ['courier', 'awbNumber', 'dispatchedQuantity'] },
  },
};

export const BOARDS = { leads: LEAD_BOARD, enquiries: ENQUIRY_BOARD, samples: SAMPLE_BOARD };

/**
 * The statuses that end a record, per board.
 *
 * Not the same as the tray: `hold` is filed off to the side and still very much open, and a
 * sample sent back for modification is the opposite of finished. This is specifically "has this
 * stopped needing a next step", which is what stops a card in the Lost column being flagged in
 * amber for having no follow-up date — closing one clears the date on purpose, and warning
 * about it turns the one colour that means *act on this* into wallpaper.
 */
const SETTLED = {
  leads: ['converted', 'disqualified'],
  enquiries: ['won', 'lost'],
  samples: ['approved', 'rejected', 'cancelled'],
};

export const isSettled = (board, status) => (SETTLED[board.key] || []).includes(status);

/** Every column of a board, ladder then tray, in the order they are drawn. */
export const columnsOf = (board) => [...board.ladder, ...board.tray];

/** Whether a card may be dropped on a column at all, ignoring where the card is now. */
export const dropAllowed = (board, status) => board.rules[status]?.droppable !== false;

/** Why not, for the one place that needs to say it out loud. */
export const dropRefusal = (board, status) => board.rules[status]?.why;

/**
 * What else a move has to be told before it can be made.
 *
 * Takes the card as well as the destination, because some requirements are about where it is
 * coming *from*: reopening a closed enquiry costs a note, wherever it is being reopened to.
 */
export const requirementsFor = (board, status, card) => {
  const needs = board.rules[status]?.needs || [];
  const fromCard = board.needsFrom?.(card, status) || [];
  return [...new Set([...needs, ...fromCard])];
};

/**
 * Which payload key a free-text note goes into for this move, or `null` where the record has
 * nowhere to put one. Offering a box whose contents are silently dropped is worse than no box.
 */
export const noteFieldFor = (board, status) =>
  board.rules[status]?.note ?? board.noteField ?? null;

/**
 * The fields a move dialog may have to ask for.
 *
 * Keyed by the name the server expects, because the dialog posts these straight through and a
 * label that says one thing while the payload carries another is a bug nobody can see from
 * either side.
 */
export const MOVE_FIELDS = {
  note: {
    label: 'Why?',
    type: 'textarea',
    hint: 'Goes into the history beside the move it explains',
  },
  lostReason: { label: 'Why was it lost?', type: 'select', options: LOST_REASONS },
  disqualifyReason: { label: 'Why is it disqualified?', type: 'select', options: DISQUALIFY_REASONS },
  holdReason: { label: 'What is it waiting on?', type: 'text', placeholder: 'Buyer travelling until the 20th' },
  estimatedValue: { label: 'Confirmed value (₹)', type: 'number', hint: 'The figure the weekly review is built on' },
  courier: { label: 'Courier', type: 'text', placeholder: 'Professional Couriers' },
  awbNumber: { label: 'AWB number', type: 'text' },
  dispatchedQuantity: { label: 'Pieces dispatched', type: 'number' },
};

/**
 * How long this card has sat where it is, in days.
 *
 * Read off the last status change rather than `updatedAt`, which moves when anybody corrects a
 * phone number and would quietly reset the one figure a board exists to show. Falls back to
 * when the record was raised, which for a card that has never moved is the same question.
 */
export function daysInColumn(record) {
  const history = record?.statusHistory;
  const since = history?.length ? history[history.length - 1].at : record?.createdAt;
  if (!since) return null;
  return Math.floor((Date.now() - new Date(since).getTime()) / 86400000);
}

/**
 * How long since anybody logged anything against this lead.
 *
 * Leads keep no status history — there is no `statusHistory` on the model — so the honest
 * ageing question for one is not "how long in this column" but "how long since we last spoke",
 * which is the figure that decides whether a lead is alive. Answering the wrong question with
 * `updatedAt` would have been easy and would have read as a fact.
 */
export function daysQuiet(lead) {
  const last = lead?.activities?.length
    ? lead.activities[lead.activities.length - 1].occurredAt
    : lead?.createdAt;
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}
