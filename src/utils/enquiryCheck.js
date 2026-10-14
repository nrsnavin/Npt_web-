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
  };
}

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
  const quantity = text(form.quantity).trim();
  if (quantity && !(Number(quantity) >= 0)) return 'The quantity must be a number.';
  return null;
}
