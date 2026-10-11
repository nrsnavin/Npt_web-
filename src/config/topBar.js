/**
 * The top bar [components/Layout.jsx], kept apart from React so the rules can be tested alone.
 */

/**
 * Whether a route is the one being looked at. `/` is exact or it would claim every screen.
 */
export const covers = (pathname, to) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

/**
 * The bar's five, in the plant's words, with everything else under "More" [the plant's own
 * layout]: Dashboard · Enquiries · Department Tasks · Quotations · Masters & Access. A
 * department keeps its own modules on the bar too (Production's board, Dispatch's
 * consignments), so nobody's daily screen is hidden behind More.
 */
export const TOP = [
  { key: 'dashboard', label: 'Dashboard', icon: '▣', from: [{ module: 'dashboard', to: ['/departments/mine'] }] },
  { key: 'enquiries', label: 'Enquiries', icon: '◎', from: [{ module: 'dashboard', to: ['/enquiries', '/dashboard/marketing'] }] },
  { key: 'tasks', label: 'Department Tasks', icon: '✓', extra: [{ to: '/tasks', label: 'Department tasks' }], from: [{ module: 'dashboard', to: ['/departments'] }] },
  { key: 'quotations', label: 'Quotations', icon: '₹', from: [{ module: 'pricing' }] },
  { key: 'masters', label: 'Masters & Access', icon: '⚙', from: [{ module: 'customers' }, { module: 'catalogue' }, { module: 'admin' }] },
];

/** The bar's items from what this person may open: the five, their department's own, then More. */
export function barItems(readable, ownKeys = []) {
  const used = new Set();
  const pick = (moduleKey, paths) => {
    const entry = readable.find((row) => row.key === moduleKey);
    if (!entry) return [];
    const features = paths ? entry.features.filter((feature) => paths.includes(feature.to)) : entry.features;
    features.forEach((feature) => used.add(feature.to));
    return features;
  };
  const items = TOP.map((top) => ({
    key: top.key,
    label: top.label,
    icon: top.icon,
    features: [...(top.extra || []), ...top.from.flatMap((source) => pick(source.module, source.to))],
  })).filter((top) => top.features.length);
  const rest = readable
    .map((entry) => ({ ...entry, features: entry.features.filter((feature) => !used.has(feature.to)) }))
    .filter((entry) => entry.features.length);
  const own = rest.filter((entry) => ownKeys.includes(entry.key));
  const more = rest.filter((entry) => !ownKeys.includes(entry.key));
  return [
    ...items,
    ...own.map((entry) => ({ key: entry.key, label: entry.label, features: entry.features })),
    ...(more.length ? [{ key: 'more', label: 'More', features: more.flatMap((entry) => entry.features) }] : []),
  ];
}

/**
 * Which bar item the current screen belongs to. Longest match wins, so `/departments/mine` lights
 * Dashboard rather than Department Tasks' `/departments`, and a detail route like
 * `/quotations/6aa2…` keeps Quotations lit. Nothing, for a screen that belongs to no item.
 */
export const litItem = (pathname, items) => {
  let best;
  let longest = -1;
  for (const item of items) {
    for (const feature of item.features) {
      for (const screen of [feature, ...(feature.children || [])]) {
        if (covers(pathname, screen.to) && screen.to.length > longest) {
          best = item.key;
          longest = screen.to.length;
        }
      }
    }
  }
  return best;
};

