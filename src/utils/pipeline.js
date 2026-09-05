/**
 * Enum labels and stage order for Phase 1, mirroring the server's models. Kept here rather
 * than fetched, because these are part of the process and change with the code, not with
 * the data — and a dropdown that waits on a round trip feels broken.
 */

/** The enquiry statuses, in the order work moves through them. */
export const ENQUIRY_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'requirement_clarification', label: 'Clarifying requirement' },
  { value: 'sample_required', label: 'Sample required' },
  { value: 'sample_feedback_pending', label: 'Sample feedback' },
  { value: 'pricing_required', label: 'Pricing required' },
  { value: 'quote_submitted', label: 'Quote submitted' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'customer_decision_pending', label: 'Awaiting decision' },
  { value: 'po_expected', label: 'PO expected' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'hold', label: 'On hold' },
];

export const CLOSED_STAGES = ['won', 'lost'];

/**
 * How many stages form the run an enquiry actually walks. Won, lost and hold sit outside it
 * — they are outcomes, not positions — so a progress bar draws only these.
 */
export const WORKING_STAGE_COUNT = ENQUIRY_STAGES.findIndex((stage) => stage.value === 'won');

/** The funnel, without the two terminal states and the parked one. */
export const OPEN_STAGES = ENQUIRY_STAGES.filter(
  (stage) => !CLOSED_STAGES.includes(stage.value) && stage.value !== 'hold'
);

/** The sample statuses, in the order work moves through them. */
export const SAMPLE_STAGES = [
  { value: 'request_received', label: 'Request received' },
  { value: 'checking_stock', label: 'Checking stock' },
  { value: 'sample_available', label: 'Sample available' },
  { value: 'production_required', label: 'Production required' },
  { value: 'printing_required', label: 'Printing required' },
  { value: 'sample_ready', label: 'Sample ready' },
  { value: 'dispatched', label: 'Dispatched' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'customer_feedback_pending', label: 'Awaiting feedback' },
  { value: 'approved', label: 'Approved' },
  { value: 'modification_required', label: 'Modification required' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Set through the feedback action by whoever spoke to the customer, never by the maker. */
export const FEEDBACK_OUTCOMES = ['approved', 'modification_required', 'rejected'];

export const CLOSED_SAMPLE_STAGES = ['approved', 'rejected', 'cancelled'];

/** Stages where the sample is with the customer, so the plant is no longer the holdup. */
export const WITH_CUSTOMER_STAGES = ['dispatched', 'delivered', 'customer_feedback_pending'];

/** The sample stages that have something to tell the customer [§42.5]. */
export const NOTIFIABLE_STAGES = {
  sample_ready: 'sample_ready',
  dispatched: 'sample_dispatched',
};

/** Channel names are brand names, so `capitalize` gets WhatsApp wrong. */
export const MESSAGE_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

export const MESSAGE_EVENTS = [
  { value: 'sample_ready', label: 'Sample ready' },
  { value: 'sample_dispatched', label: 'Sample dispatched' },
];

/** Why a channel produced no message. Silence always has a reason on the record. */
export const SKIP_REASONS = [
  { value: 'no_address', label: 'No address on file' },
  { value: 'opted_out', label: 'Customer opted out' },
  { value: 'already_sent', label: 'Already sent' },
  { value: 'no_provider', label: 'No provider configured' },
];

export const SAMPLE_PURPOSES = [
  { value: 'existing_model', label: 'Existing model' },
  { value: 'colour_approval', label: 'Colour approval' },
  { value: 'print_approval', label: 'Print approval' },
  { value: 'new_development', label: 'New development' },
  { value: 'fit_test', label: 'Fit test' },
  { value: 'buyer_approval', label: 'Buyer approval' },
];

/**
 * The sales-order ladder [§12], in the order work moves through it.
 *
 * `cancelled` is not in §12's matrix and is needed for the same reason a sample needed one:
 * §12 describes an order that runs to completion, and an order can also stop being wanted.
 */
export const ORDER_STAGES = [
  { value: 'po_received', label: 'PO received' },
  { value: 'order_verification', label: 'Verifying' },
  { value: 'clarification_pending', label: 'Clarification pending' },
  { value: 'approved_for_production', label: 'Released' },
  { value: 'production_planning', label: 'Planning' },
  { value: 'production_running', label: 'Running' },
  { value: 'part_quantity_ready', label: 'Part ready' },
  { value: 'production_completed', label: 'Made' },
  { value: 'dispatch_planning', label: 'Dispatch planning' },
  { value: 'part_dispatched', label: 'Part dispatched' },
  { value: 'fully_dispatched', label: 'Dispatched' },
  { value: 'payment_pending', label: 'Payment pending' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const CLOSED_ORDER_STAGES = ['closed', 'cancelled'];

/** Before the §13 gate: the only place the checklist is editable, and the queue it makes. */
export const PRE_RELEASE_STAGES = ['po_received', 'order_verification', 'clarification_pending'];

export const orderStageLabel = (value) => label(ORDER_STAGES, value);

/**
 * What the plant is doing to one order line [§15].
 *
 * The five in the middle are all "nothing is moving": material, mould, printing stock, a
 * production hold, a quality hold. They are separate because the answer to each is a different
 * person's — and `held` marks them so a screen can colour the lot without listing them again.
 */
export const PRODUCTION_STAGES = [
  { value: 'awaiting_planning', label: 'Awaiting planning' },
  { value: 'planning', label: 'Planning' },
  { value: 'material_pending', label: 'Material pending', held: true },
  { value: 'mould_pending', label: 'Mould pending', held: true },
  { value: 'printing_material_pending', label: 'Printing stock pending', held: true },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'running', label: 'Running' },
  { value: 'part_quantity_ready', label: 'Part ready' },
  { value: 'production_hold', label: 'On hold', held: true },
  { value: 'quality_hold', label: 'Quality hold', held: true },
  { value: 'completed', label: 'Made' },
];

export const HELD_PRODUCTION_STAGES = PRODUCTION_STAGES.filter((s) => s.held).map((s) => s.value);

export const productionStageLabel = (value) => label(PRODUCTION_STAGES, value);

/**
 * Where a consignment is [§18].
 *
 * `gone` marks the point of no return — the goods have physically left, and everything after
 * it is about paperwork catching up. Named here so a screen can colour and count them without
 * repeating the list, the same way `held` works above.
 */
export const DISPATCH_STAGES = [
  { value: 'dispatch_request_received', label: 'Requested' },
  { value: 'invoice_preparation', label: 'Invoicing' },
  { value: 'packing', label: 'Packing' },
  { value: 'vehicle_pending', label: 'Waiting for a vehicle' },
  { value: 'ready_to_load', label: 'Ready to load' },
  { value: 'loaded', label: 'Loaded' },
  { value: 'dispatched', label: 'On the road', gone: true },
  { value: 'delivered', label: 'Delivered', gone: true },
  { value: 'pod_pending', label: 'POD pending', gone: true },
  { value: 'closed', label: 'Closed', gone: true },
  { value: 'cancelled', label: 'Cancelled' },
];

export const GONE_DISPATCH_STAGES = DISPATCH_STAGES.filter((s) => s.gone).map((s) => s.value);
export const CLOSED_DISPATCH_STAGES = ['closed', 'cancelled'];

/** While the load can still be changed. After it, a correction is a cancel and a re-raise. */
export const PRE_LOAD_DISPATCH_STAGES = [
  'dispatch_request_received', 'invoice_preparation', 'packing', 'vehicle_pending', 'ready_to_load',
];

export const dispatchStageLabel = (value) => label(DISPATCH_STAGES, value);

export const LEAD_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'disqualified', label: 'Disqualified' },
];

export const LOST_REASONS = [
  { value: 'price', label: 'Price' },
  { value: 'lead_time', label: 'Lead time' },
  { value: 'quality_concern', label: 'Quality concern' },
  { value: 'sample_rejected', label: 'Sample rejected' },
  { value: 'competitor', label: 'Lost to a competitor' },
  { value: 'requirement_dropped', label: 'Requirement dropped' },
  { value: 'no_response', label: 'No response' },
  { value: 'other', label: 'Other' },
];

export const DISQUALIFY_REASONS = [
  { value: 'not_our_product', label: 'Not our product' },
  { value: 'price_shopper', label: 'Price shopper' },
  { value: 'volume_too_low', label: 'Volume too low' },
  { value: 'credit_risk', label: 'Credit risk' },
  { value: 'no_response', label: 'No response' },
  { value: 'competitor', label: 'Committed to a competitor' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'other', label: 'Other' },
];

export const ACTIVITY_TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'visit', label: 'Visit' },
  { value: 'note', label: 'Note' },
];

export const HANGER_CATEGORIES = [
  { value: 'shirt', label: 'Shirt' },
  { value: 'trouser', label: 'Trouser' },
  { value: 'suit', label: 'Suit' },
  { value: 'skirt', label: 'Skirt' },
  { value: 'kids', label: 'Kids' },
  { value: 'lingerie', label: 'Lingerie' },
  { value: 'coat', label: 'Coat' },
  { value: 'multi', label: 'Multi-tier' },
  { value: 'accessory', label: 'Accessory' },
];

/**
 * The resins first, then the rest.
 *
 * `pp` and `hips` were added to the server's list when the costing sheet started naming them
 * and never reached this one, so no screen could select either — a model made of polypropylene
 * had to be filed as "Plastic", which is not a thing anybody buys by the kilo and cannot be
 * checked against a resin rate. They lead the list because they are what nearly everything
 * here is actually moulded from.
 */
export const MATERIALS = [
  { value: 'pp', label: 'PP (polypropylene)' },
  { value: 'hips', label: 'HIPS' },
  { value: 'recycled_pp', label: 'Recycled PP' },
  { value: 'plastic', label: 'Plastic — unspecified' },
  { value: 'wood', label: 'Wood' },
  { value: 'metal', label: 'Metal' },
  { value: 'velvet', label: 'Velvet' },
  { value: 'acrylic', label: 'Acrylic' },
];

/**
 * The polymer families the plant buys.
 *
 * Separate from `MATERIALS` above, which describes a finished hanger — that list carries wood,
 * metal and velvet, none of which anybody buys by the kilo and runs through a barrel.
 */
export const MATERIAL_TYPES = [
  { value: 'pp', label: 'PP' },
  { value: 'hips', label: 'HIPS' },
  { value: 'ld', label: 'LD' },
  { value: 'abs', label: 'ABS' },
  { value: 'ps', label: 'PS' },
  { value: 'recycled_pp', label: 'Recycled PP' },
  { value: 'other', label: 'Other' },
];

/** Where a tool is in its life. A retired mould stays on the register; it stops running. */
export const MOULD_STATUSES = [
  { value: 'development', label: 'In development' },
  { value: 'active', label: 'Running' },
  { value: 'maintenance', label: 'In maintenance' },
  { value: 'retired', label: 'Retired' },
];

/** Buyer-funded tools are ordinary here, and the model on one is not ours to offer around. */
export const MOULD_OWNERSHIP = [
  { value: 'company', label: 'Ours' },
  { value: 'customer', label: "Customer's" },
];

export const HOOK_TYPES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'swivel', label: 'Swivel' },
  { value: 'metal_swivel', label: 'Metal swivel' },
  { value: 'plastic', label: 'Plastic' },
  { value: 'clip', label: 'Clip' },
];

export const CUSTOMER_TYPES = [
  { value: 'garment_factory', label: 'Garment factory' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'buying_house', label: 'Buying house' },
  { value: 'retailer', label: 'Retailer' },
  { value: 'domestic_distributor', label: 'Domestic distributor' },
  { value: 'overseas_buyer', label: 'Overseas buyer' },
];

export const SOURCES = [
  { value: 'manual', label: 'Entered manually' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'trade_show', label: 'Trade show' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const label = (options, value) =>
  options.find((option) => option.value === value)?.label || value || '—';

export const stageLabel = (value) => label(ENQUIRY_STAGES, value);
export const leadStageLabel = (value) => label(LEAD_STAGES, value);
export const sampleStageLabel = (value) => label(SAMPLE_STAGES, value);
export const optionLabel = label;

/**
 * Which sample stages the maker may move to.
 *
 * The three feedback outcomes are excluded on purpose: only the person who spoke to the
 * customer may set those, and the server refuses them on this route regardless.
 */
export const nextSampleStagesFrom = (current) => {
  if (CLOSED_SAMPLE_STAGES.includes(current)) return [];
  return SAMPLE_STAGES.filter(
    (stage) => stage.value !== current && !FEEDBACK_OUTCOMES.includes(stage.value)
  );
};

/**
 * Which transitions the UI offers from a given stage. The server only forbids moving a
 * closed enquiry and re-selecting the current stage, so this is guidance rather than a
 * rule: every open stage can still reach hold, won and lost.
 */
/**
 * Where an enquiry may go from where it is.
 *
 * A closed one used to offer nothing at all, which made reopening unreachable — the buyer who
 * came back had to be re-keyed as a new enquiry, losing the history that explained why it was
 * lost. It now offers the open stages and only those: a closed enquiry may come back into play,
 * but won must not become lost in one step, which is a rewrite rather than a reopen.
 */
/**
 * The stages an enquiry works *through*, in order — the ladder it climbs.
 *
 * Mirrors the server's own list. `lost` and `hold` are not on it: an enquiry can be lost from
 * anywhere and parked from anywhere, and coming off a park resumes wherever it was.
 */
export const ENQUIRY_STAGE_ORDER = OPEN_STAGES.map((stage) => stage.value).concat('won');

const stageRank = (status) => ENQUIRY_STAGE_ORDER.indexOf(status);

/**
 * The furthest an enquiry has climbed, which is the floor it may not drop below.
 *
 * Read off the history rather than the current status, because `hold` is not a rung: an
 * enquiry parked during negotiation reads as `hold` and still may not go back to pricing.
 * Only what has happened since it was last reopened counts — reopening is a deliberate
 * rewind, so the stages before it stop being a floor.
 *
 * The server enforces all of this; this is the same rule stated again so the dropdown does
 * not offer a move the next screen refuses. A choice that can only produce an error teaches
 * people to distrust the ones beside it.
 */
export function furthestStage(enquiry) {
  const history = enquiry?.statusHistory || [];

  let since = 0;
  history.forEach((entry, index) => {
    if (CLOSED_STAGES.includes(entry.from)) since = index;
  });

  return history
    .slice(since)
    .reduce((furthest, entry) => Math.max(furthest, stageRank(entry.to)), stageRank(enquiry?.status));
}

/**
 * Where this enquiry may go next.
 *
 * Takes the enquiry rather than a bare status: whether a stage is available depends on where
 * it has *been*, not only where it is.
 *
 * Reopening a closed enquiry is the exception, and offers every open stage — it is the one
 * move whose purpose is to rewind, and it costs a note explaining why.
 */
export const nextStagesFrom = (enquiry) => {
  const current = typeof enquiry === 'string' ? enquiry : enquiry?.status;

  if (CLOSED_STAGES.includes(current)) {
    return ENQUIRY_STAGES.filter((stage) => !CLOSED_STAGES.includes(stage.value));
  }

  const floor = typeof enquiry === 'string' ? stageRank(current) : furthestStage(enquiry);

  return ENQUIRY_STAGES.filter((stage) => {
    if (stage.value === current) return false;
    // Off the ladder — lost and hold — is never a fall back, and stays available from anywhere.
    const rank = stageRank(stage.value);
    return rank === -1 || rank >= floor;
  });
};

/**
 * A date input's value, a number of days from today.
 *
 * Shared rather than copied into each form that needs a sensible default follow-up date: the
 * server refuses one already in the past, so every screen that offers a default has to agree
 * with every other about what "soon" means.
 */
export const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Empty inputs arrive as '', which the server's schema rejects — drop them instead. */
export const numeric = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));
export const text = (value) => (value === '' || value === null ? undefined : value);

/**
 * Turns enquiry form values into the payload the API expects: numbers as numbers, blanks
 * omitted entirely, and the requirement nested. Shared by the enquiry form and by lead
 * conversion, which posts the same shape one level down.
 */
export function buildEnquiryPayload(values, { mould, isNewDevelopment }) {
  const requirement = values.requirement || {};

  return {
    mould: isNewDevelopment ? undefined : mould,
    isNewDevelopment,
    requirement: {
      modelNumber: text(requirement.modelNumber),
      category: text(requirement.category),
      material: text(requirement.material),
      sizeMm: numeric(requirement.sizeMm),
      colour: text(requirement.colour),
      quantity: numeric(requirement.quantity),
      printing: text(requirement.printing),
      packing: text(requirement.packing),
    },
    targetPrice: numeric(values.targetPrice),
    estimatedValue: numeric(values.estimatedValue),
    requiredDeliveryDate: text(values.requiredDeliveryDate),
    remarks: text(values.remarks),
    nextAction: text(values.nextAction),
    nextFollowUpDate: text(values.nextFollowUpDate),
    source: text(values.source),
  };
}

/** How overdue a follow-up is, as a label the row can colour by. */
export function followUpState(date) {
  if (!date) return null;

  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);

  if (days < 0) return { text: days === -1 ? 'Overdue by a day' : `Overdue by ${Math.abs(days)} days`, tone: 'danger' };
  if (days === 0) return { text: 'Due today', tone: 'warn' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'info' };
  return { text: `In ${days} days`, tone: 'neutral' };
}
