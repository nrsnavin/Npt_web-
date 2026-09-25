/**
 * Saved views as links. A view is the list's own query string under a name, so opening one is the
 * same address the filters would have made — and the list reads its filters from the address.
 */
export const VIEW_PATHS = {
  queries: '/queries',
  enquiries: '/enquiries',
  samples: '/samples',
  leads: '/leads',
  customers: '/customers',
  pricings: '/pricings',
};

/** Only the filters that are set, as strings, in a stable order — so two equal views are equal. */
export function viewParams(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([key, value]) => [key, String(value)])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

/** The address a view opens. */
export function viewHref(view) {
  const query = new URLSearchParams(viewParams(view.params)).toString();
  return `${VIEW_PATHS[view.page] || '/'}${query ? `?${query}` : ''}`;
}
