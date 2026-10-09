/**
 * Each department's workspace: the pages it works from, what it is there to do, and what is
 * still to be decided. Drawn at the top of that department's dashboard (`/departments/:key`).
 *
 * THIS IS THE FILE TO EDIT. Change a label, add or remove a page, reword a job — nothing else
 * has to change. Taken from the role requirements of 7 October 2026.
 *
 *   pages     — { label, to, module?, hint? }. `to` is any screen in the app; a `?stage=` on
 *               /enquiries lists the enquiries at those plant stages. With `module`, the page
 *               shows only to someone who may open that module — the server enforces it anyway.
 *   jobs      — what the department does, in its own words. Shown as the department's brief.
 *   toConfirm — open questions, shown so nobody mistakes them for decided.
 *
 * The tasks a department receives, and the stages it owns, come from the server
 * (config/handoffs.js and config/enquiryStages.js) and are not repeated here.
 */
export const DEPARTMENT_WORKSPACES = {
  management: {
    purpose: 'Sees every department, assigns the work and owns the masters.',
    pages: [
      { label: 'All-department dashboard', to: '/departments', hint: 'Late and pending work, by department' },
      { label: 'Users & roles', to: '/users', module: 'users' },
      { label: 'Customers', to: '/customers', module: 'customers' },
      { label: 'Enquiries', to: '/enquiries', module: 'enquiries' },
      { label: 'Sampling', to: '/samples/dashboard', module: 'samples' },
      { label: 'Quotations', to: '/quotations', module: 'pricing' },
      { label: 'Sales orders', to: '/orders', module: 'orders' },
      { label: 'Production', to: '/production', module: 'production' },
      { label: 'Quality', to: '/quality', module: 'quality' },
      { label: 'Dispatch', to: '/dispatches', module: 'dispatch' },
      { label: 'Accounts', to: '/payments', module: 'payments' },
      { label: 'Masters', to: '/moulds', module: 'moulds', hint: 'Models, moulds and materials' },
    ],
    jobs: [
      'Create users and give them their roles and pages.',
      'Assign and reassign customers, enquiries and tasks.',
      'Watch every department’s pending work and delays.',
      'Keep the master data and who may quote.',
      'Only Admin deletes records.',
    ],
    toConfirm: ['Device limits, force logout and inactivity timeout for this version.'],
  },

  marketing: {
    purpose: 'Owns the customer: finds the enquiry, follows it up and keeps the buyer told.',
    pages: [
      { label: 'Due today', to: '/today', hint: 'Follow-ups and tasks due by tonight' },
      { label: 'My customers', to: '/customers', module: 'customers' },
      { label: 'Active enquiries', to: '/enquiries', module: 'enquiries' },
      { label: 'New enquiries', to: '/enquiries/drafts', module: 'customers', hint: 'Drafts read from chat screenshots and cards' },
      { label: 'Quotations', to: '/quotations', module: 'pricing' },
      { label: 'Activities', to: '/activities', module: 'enquiries', hint: 'Recent calls, WhatsApps, emails and visits' },
      { label: 'Department updates', to: '/dashboard/marketing', module: 'enquiries', hint: 'Sampling, production and dispatch news' },
    ],
    jobs: [
      'Register new customers and enquiries; see your assigned customers.',
      'Update contacts and record calls and messages.',
      'Set the next follow-up date on every open enquiry.',
      'Request samples and record photos sent.',
      'Move the enquiry on with the stage buttons.',
      'Close an enquiry with a reason — marketing does not delete.',
    ],
    toConfirm: [],
  },

  order_confirmation: {
    purpose: 'Turns an approved quotation and the customer’s PO into a sales order production can run.',
    pages: [
      { label: 'Approved enquiries', to: '/enquiries?stage=po_so', module: 'enquiries', hint: 'Enquiries at PO & SO' },
      { label: 'Quotations sent', to: '/quotations/sent', module: 'pricing' },
      { label: 'Customer PO / sales orders', to: '/orders', module: 'orders' },
      { label: 'Production status', to: '/production', module: 'production' },
      { label: 'Dispatch status', to: '/dispatches', module: 'dispatch' },
    ],
    jobs: [
      'Link the approved enquiry, the quotation and the customer PO.',
      'Record customer, model, quantity, colour, printing and agreed price.',
      'Send the sales order and give production its details.',
      'Follow the order through production and dispatch.',
      'Price changes need separate permission.',
    ],
    toConfirm: ['Whether Sales stays a separate role or sits with marketing.'],
  },

  quotation: {
    purpose: 'Costs the model and sends the price — the buyer sees the price, never the costing.',
    pages: [
      { label: 'Waiting for a price', to: '/enquiries?stage=pricing_quote', module: 'enquiries', hint: 'Enquiries at Pricing / Quote' },
      { label: 'To cost', to: '/quotations?status=costing', module: 'pricing', hint: 'Quotations waiting for a price' },
      { label: 'Trading master', to: '/trading', module: 'materials', hint: 'Bought-in items at their inward price' },
      { label: 'All quotations / PDF', to: '/quotations', module: 'pricing' },
      { label: 'Model / item selection', to: '/moulds', module: 'moulds' },
      { label: 'Materials', to: '/materials', module: 'materials' },
    ],
    jobs: [
      'Pick the model, grammage and material (PP / HIPS / ABS).',
      'Cost material, making, packing, accessories and printing.',
      'Choose 10 / 20 / 30 % margin; edit and round the price by hand if needed.',
      'Printing ₹0.50 / ₹1.00 / ₹1.50 per colour; hooks 80 / 90 / 100 mm or double.',
      'Quote trading items at the inward price.',
      'Save the PDF against the enquiry.',
    ],
    toConfirm: [],
  },

  sampling: {
    purpose: 'Makes and sends the samples marketing asks for.',
    pages: [
      { label: 'Assigned requests', to: '/samples', module: 'samples' },
      { label: 'Sampling dashboard', to: '/samples/dashboard', module: 'samples' },
      { label: 'Sample analytics', to: '/samples/analytics', module: 'samples' },
      { label: 'Model master', to: '/moulds', module: 'moulds' },
    ],
    jobs: [
      'See each request’s customer, model, material, colour and quantity.',
      'Three pieces unless the request says more.',
      'Follow colour preferences and restricted colours.',
      'Update preparation status and upload sample photos.',
      'Record the courier and AWB number when it goes (AWB photo optional).',
    ],
    toConfirm: [],
  },

  production: {
    purpose: 'Makes the order and keeps everyone told of what is done and what is pending.',
    pages: [
      { label: 'Production status', to: '/production', module: 'production', hint: 'By customer and model' },
      { label: 'Assigned orders', to: '/orders', module: 'orders' },
      { label: 'Moulds', to: '/moulds', module: 'moulds' },
      { label: 'Materials', to: '/materials', module: 'materials' },
    ],
    jobs: [
      'Work from the sales order: model, quantity, material, colour, printing, required date.',
      'Update progress and pending quantity.',
      'Record why anything is late or stuck.',
      'Tell the next department when it is done.',
    ],
    toConfirm: [],
  },

  quality: {
    purpose: 'Checks what was made before it can be dispatched.',
    pages: [
      { label: 'Waiting for a check', to: '/enquiries?stage=quality', module: 'enquiries', hint: 'Enquiries sent for Quality Check' },
      { label: 'Quality check queue', to: '/quality', module: 'quality' },
      { label: 'Quality report', to: '/quality/report', module: 'quality' },
      { label: 'Production status', to: '/production', module: 'production' },
    ],
    jobs: [
      'Check what was produced and mark it Passed or Failed.',
      'Record any issue and the correction needed.',
      'Nothing goes to Dispatch until Quality has passed it — and again after any rework.',
    ],
    toConfirm: ['The detailed check fields, and who may approve.'],
  },

  assembling: {
    purpose: 'Assembles to instruction and reports what is done and what is pending.',
    pages: [
      { label: 'Enquiries at Assembling', to: '/enquiries?stage=assembling', module: 'enquiries' },
      { label: 'Order / model details', to: '/orders', module: 'orders' },
      { label: 'Production status', to: '/production', module: 'production' },
      { label: 'Models', to: '/moulds', module: 'moulds' },
    ],
    jobs: [
      'Work from the assembling instructions on each task.',
      'Update completed and pending work.',
      'Tell the next department and marketing when it is done.',
    ],
    toConfirm: ['The assembling fields to record.'],
  },

  despatch: {
    purpose: 'Sends the goods and proves they went.',
    pages: [
      { label: 'Ready / pending dispatch', to: '/dispatches', module: 'dispatch' },
      { label: 'Enquiries to invoice', to: '/enquiries?stage=invoice_dispatch,lr_copy', module: 'enquiries' },
      { label: 'Orders', to: '/orders', module: 'orders' },
      { label: 'Quality status', to: '/quality', module: 'quality' },
    ],
    jobs: [
      'See the customer, order, model and quantity to send.',
      'Record the dispatch date and quantity sent.',
      'Record the courier or transporter and the AWB / docket number.',
      'Attach the proof that is available.',
      'Keep the enquiry until the whole order has gone — post each lot as an update.',
    ],
    toConfirm: [],
  },

  accounts: {
    purpose: 'Follows up payment until it is in.',
    pages: [
      { label: 'Follow-up list', to: '/payments?open=true', module: 'payments' },
      { label: 'Overdue', to: '/payments?overdue=true', module: 'payments' },
      { label: 'Broken promises', to: '/payments?broken=true', module: 'payments', hint: 'Committed dates that passed' },
      { label: 'Customers', to: '/customers', module: 'customers' },
    ],
    jobs: [
      'Record who to speak to about payment.',
      'Record each payment call and message.',
      'Record payment status, including TPCF.',
      'Chase payment when asked (Team Payment Follow-up) — the job stays with whoever has it.',
      'Keep the commitment, callback, promised-payment and next follow-up dates.',
    ],
    toConfirm: ['A full accounting / Tally module is not defined yet.'],
  },
};

export const workspaceFor = (key) => DEPARTMENT_WORKSPACES[key] || null;
