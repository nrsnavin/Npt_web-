/**
 * The simple menu: what each department sees on the top strip [components/Layout.jsx].
 *
 * The plant works one enquiry through its departments, so each person needs their dashboard
 * (their department's enquiries and every enquiry they may see, in one place), the one screen
 * their department works in, and the questions between departments.
 * Everything else they may open is still there, under "More". Admin and Audit see the full menu.
 *
 * THE LIST TO EDIT. Keys are the strip's own module keys: dashboard, samples, pricing,
 * orders, production, quality, dispatch, payments, customers, catalogue, queries, admin.
 */
export const SIMPLE_NAV = {
  marketing: ['dashboard', 'pricing', 'customers', 'queries'],
  sampling: ['dashboard', 'samples', 'queries'],
  quotation: ['dashboard', 'pricing', 'catalogue', 'queries'],
  order_confirmation: ['dashboard', 'orders', 'queries'],
  production: ['dashboard', 'production', 'orders', 'queries'],
  mould: ['dashboard', 'catalogue', 'production', 'queries'],
  quality: ['dashboard', 'quality', 'queries'],
  assembling: ['dashboard', 'production', 'queries'],
  despatch: ['dashboard', 'dispatch', 'queries'],
  accounts: ['dashboard', 'payments', 'queries'],
  payment_collection: ['dashboard', 'payments', 'queries'],
};

/** Departments that keep the whole menu. */
const FULL_MENU = ['management', 'audit'];

/**
 * The strip keys for someone in these departments, in order — or null for the full menu.
 * Several departments on one login get every one of their departments' tabs.
 */
export function simpleNavFor(departments = [], { isAdmin = false } = {}) {
  if (isAdmin || departments.some((key) => FULL_MENU.includes(key))) return null;
  const keys = departments.flatMap((key) => SIMPLE_NAV[key] || ['dashboard', 'queries']);
  return keys.length ? [...new Set(keys)] : null;
}

/** Where the app opens: everyone's dashboard — its first tab differs by role, see the page. */
export function homeFor() {
  return '/departments/mine';
}

/**
 * Which tab the dashboard opens on: every enquiry for Admin and Marketing (all of them, or their
 * own), the work queue for Sampling, and the enquiries with the department for everyone else.
 */
export function firstDashboardTab(department, { isAdmin = false, seesEnquiries = true } = {}) {
  if (department === 'sampling') return 'queue';
  if (seesEnquiries && (isAdmin || department === 'management' || department === 'marketing')) return 'all';
  return 'enquiries';
}
