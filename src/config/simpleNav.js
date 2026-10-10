/**
 * The simple menu: what each department sees on the top strip [components/Layout.jsx].
 *
 * The plant works one enquiry through its departments, so each person needs their desk, the
 * enquiries, the one screen their department works in, and the questions between departments.
 * Everything else they may open is still there, under "More". Admin and Audit see the full menu.
 *
 * THE LIST TO EDIT. Keys are the strip's own module keys: desk, enquiries, samples, pricing,
 * orders, production, quality, dispatch, payments, customers, catalogue, queries, admin.
 */
export const SIMPLE_NAV = {
  marketing: ['enquiries', 'desk', 'pricing', 'customers', 'queries'],
  sampling: ['desk', 'samples', 'enquiries', 'queries'],
  quotation: ['desk', 'pricing', 'enquiries', 'catalogue', 'queries'],
  order_confirmation: ['desk', 'orders', 'enquiries', 'queries'],
  production: ['desk', 'production', 'orders', 'queries'],
  mould: ['desk', 'catalogue', 'production', 'queries'],
  quality: ['desk', 'quality', 'queries'],
  assembling: ['desk', 'production', 'queries'],
  despatch: ['desk', 'dispatch', 'queries'],
  accounts: ['desk', 'payments', 'queries'],
  payment_collection: ['desk', 'payments', 'queries'],
};

/** Departments that keep the whole menu. */
const FULL_MENU = ['management', 'audit'];

/**
 * The strip keys for someone in these departments, in order — or null for the full menu.
 * Several departments on one login get every one of their departments' tabs.
 */
export function simpleNavFor(departments = [], { isAdmin = false } = {}) {
  if (isAdmin || departments.some((key) => FULL_MENU.includes(key))) return null;
  const keys = departments.flatMap((key) => SIMPLE_NAV[key] || ['desk', 'enquiries', 'queries']);
  return keys.length ? [...new Set(keys)] : null;
}

/** Where the app opens: the enquiries for Admin and Marketing, the department's desk for the rest. */
export function homeFor(departments = [], { isAdmin = false } = {}) {
  if (isAdmin || departments.includes('management') || departments[0] === 'marketing') return '/enquiries';
  return '/departments/mine';
}
