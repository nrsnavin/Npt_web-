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

export const SAMPLE_PURPOSES = [
  { value: 'existing_model', label: 'Existing model' },
  { value: 'colour_approval', label: 'Colour approval' },
  { value: 'print_approval', label: 'Print approval' },
  { value: 'new_development', label: 'New development' },
  { value: 'fit_test', label: 'Fit test' },
  { value: 'buyer_approval', label: 'Buyer approval' },
];

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

export const MATERIALS = [
  { value: 'plastic', label: 'Plastic' },
  { value: 'wood', label: 'Wood' },
  { value: 'metal', label: 'Metal' },
  { value: 'velvet', label: 'Velvet' },
  { value: 'acrylic', label: 'Acrylic' },
  { value: 'recycled_pp', label: 'Recycled PP' },
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
export const nextStagesFrom = (current) => {
  if (CLOSED_STAGES.includes(current)) return [];
  return ENQUIRY_STAGES.filter((stage) => stage.value !== current);
};

/** Empty inputs arrive as '', which the server's schema rejects — drop them instead. */
export const numeric = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));
export const text = (value) => (value === '' || value === null ? undefined : value);

/**
 * Turns enquiry form values into the payload the API expects: numbers as numbers, blanks
 * omitted entirely, and the requirement nested. Shared by the enquiry form and by lead
 * conversion, which posts the same shape one level down.
 */
export function buildEnquiryPayload(values, { product, isNewDevelopment }) {
  const requirement = values.requirement || {};

  return {
    product: isNewDevelopment ? undefined : product,
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
