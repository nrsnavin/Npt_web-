/**
 * The "Edit and verify" box on the dashboard's enquiry panel [components/EnquiryCheckCard.jsx],
 * as plain functions: what the form opens with, and what saving it sends.
 *
 * The company, contact and number are the buyer's — the server puts them on the customer's own
 * record, or on the prospect before there is one [server: pipeline.controller `checkEnquiry`].
 */

const text = (value) => (value === undefined || value === null ? '' : String(value));

/** "PP black" — the resin, as people write it, then the colour. */
export function materialColourOf(requirement = {}) {
  const material = requirement.material && requirement.material !== 'plastic'
    ? requirement.material.replace(/_/g, ' ').toUpperCase()
    : '';
  return [material, requirement.colour].filter(Boolean).join(' ');
}

const idOf = (value) => text(value && typeof value === 'object' ? value._id : value);

/**
 * Whose the draft should be. An enquiry read off a photo lands on whoever captured it; when the
 * buyer is an existing customer, the customer's own marketing person is the one to hold it, so
 * the Assigned-to box opens on them [server: pipeline.controller `checkEnquiry`]. Otherwise it
 * opens on the current owner.
 */
export function suggestedOwnerOf(enquiry = {}) {
  const current = enquiry.assignedTo && typeof enquiry.assignedTo === 'object' ? enquiry.assignedTo : null;
  const customer = enquiry.customer && typeof enquiry.customer === 'object' ? enquiry.customer : null;
  const buyerOwner = customer?.assignedTo && typeof customer.assignedTo === 'object' ? customer.assignedTo : null;
  if (enquiry.checkPending && buyerOwner?._id && idOf(buyerOwner) !== idOf(enquiry.assignedTo)) {
    return { id: idOf(buyerOwner), name: buyerOwner.name || '', reason: `${customer.name || 'The buyer'} is ${buyerOwner.name || 'their'}’s customer` };
  }
  return { id: idOf(enquiry.assignedTo), name: current?.name || '', reason: null };
}

/** The form's opening values, from the enquiry as the server sends it. */
export function checkFieldsOf(enquiry = {}) {
  const customer = enquiry.customer && typeof enquiry.customer === 'object' ? enquiry.customer : null;
  const prospect = enquiry.prospect || {};
  const contacts = customer?.contacts || [];
  const primary = contacts.find((contact) => contact.isPrimary) || contacts[0];
  const requirement = enquiry.requirement || {};
  return {
    company: text(customer?.name || prospect.name),
    contactPerson: text(primary?.name || prospect.contactPerson),
    whatsapp: text(customer ? customer.whatsapp || customer.mobile : prospect.whatsapp || prospect.mobile),
    modelNumber: text(requirement.modelNumber || enquiry.mould?.mouldCode),
    quantity: text(requirement.quantity),
    materialColour: materialColourOf(requirement),
    remarks: text(enquiry.remarks),
    /* The owner as the record stands; the form opens on `suggestedOwnerOf`, and a difference is sent. */
    assignedTo: idOf(enquiry.assignedTo),
  };
}

/** What the form opens with: the record's values, and the owner it should probably have. */
export const checkFormOf = (enquiry = {}) => ({ ...checkFieldsOf(enquiry), assignedTo: suggestedOwnerOf(enquiry).id });

/** What a save sends: only what was changed, and the version it was read at. */
export function checkPayloadOf(form, opened, enquiry = {}) {
  const payload = {};
  for (const key of Object.keys(opened)) {
    const now = text(form[key]).trim();
    if (now === text(opened[key]).trim()) continue;
    if (key === 'quantity') payload.quantity = now === '' ? null : Number(now);
    else payload[key] = now;
  }
  return { id: enquiry._id, ...(enquiry.updatedAt ? { expectedUpdatedAt: enquiry.updatedAt } : {}), ...payload };
}

/** What is wrong with the form, in the words to show, or null. */
export function checkProblem(form) {
  if (!text(form.company).trim()) return 'Name the company.';
  if (form.assignedTo !== undefined && !text(form.assignedTo).trim()) return 'Say whose enquiry this is.';
  const quantity = text(form.quantity).trim();
  if (quantity && !(Number(quantity) >= 0)) return 'The quantity must be a number.';
  return null;
}
