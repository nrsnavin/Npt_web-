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
  { key: 'enquiries', label: 'Enquiries', icon: '◎', from: [{ module: 'dashboard', to: ['/enquiries'] }] },
  { key: 'tasks', label: 'Department Tasks', icon: '✓', extra: [{ to: '/tasks', label: 'Department tasks' }], from: [{ module: 'dashboard', to: ['/departments'] }] },
  { key: 'quotations', label: 'Quotations', icon: '₹', from: [{ module: 'pricing' }] },
  { key: 'masters', label: 'Masters & Access', icon: '⚙', from: [{ module: 'customers' }, { module: 'catalogue' }, { module: 'admin' }] },
];

/**
 * The departments that work from their own desk alone — Production, Printing, Assembly, Dispatch,
 * the office teams — keep a short bar: My work, Enquiries and Quotations where they may open them,
 * their own screens, and More. Department Tasks and Masters & Access are one tap away under More,
 * not words to read every time. Marketing and Admin keep the full bar: they work across the departments.
 */
const SHORT_BAR = ['dashboard', 'enquiries', 'quotations'];
const WORKS_ACROSS = ['marketing', 'management', 'audit'];
export const usesShortBar = (departments = [], { isAdmin = false } = {}) => !isAdmin && departments.length > 0 && !departments.some((key) => WORKS_ACROSS.includes(key));

/**
 * The Production in charge's floor, on the bar beside My work [components/Layout.jsx]: the
 * planning board (presses by day, work orders dragged on) and the floor tablet (each press, its
 * job). Only for whoever plans Production — the rest of Production reaches them from the desk.
 */
export const PRODUCTION_FLOOR = {
  key: 'floor', label: 'Production floor', icon: '▦',
  features: [
    { to: '/production/plan', label: 'Planning board' },
    { to: '/floor', label: 'Floor — the presses' },
  ],
};

/** The bar's items from what this person may open: the five, their department's own, then More. */
export function barItems(everything, ownKeys = [], { short = false, productionFloor = false } = {}) {
  /* Queries are not a screen on the bar: they live in the panel at the bottom right, with their
     unread count [dock/WorkspaceRail.jsx, QueriesPanel] — the full list is one link from there. */
  const readable = everything.filter((entry) => entry.key !== 'queries');
  const used = new Set();
  const pick = (moduleKey, paths) => {
    const entry = readable.find((row) => row.key === moduleKey);
    if (!entry) return [];
    const features = paths ? entry.features.filter((feature) => paths.includes(feature.to)) : entry.features;
    features.forEach((feature) => used.add(feature.to));
    return features;
  };
  /* A short bar keeps the desk — called My work — and Enquiries and Quotations, where readable. */
  const items = TOP.filter((top) => !short || SHORT_BAR.includes(top.key)).map((top) => ({
    key: top.key,
    label: short && top.key === 'dashboard' ? 'My work' : top.label,
    icon: top.icon,
    features: [...(top.extra || []), ...top.from.flatMap((source) => pick(source.module, source.to))],
  })).filter((top) => top.features.length);
  const rest = readable
    .map((entry) => ({ ...entry, features: entry.features.filter((feature) => !used.has(feature.to)) }))
    .filter((entry) => entry.features.length);
  /* On a short bar what the dropped items held — Department Tasks, Masters & Access — is under More. */
  const own = rest.filter((entry) => ownKeys.includes(entry.key) && !(short && entry.key === 'dashboard'));
  const more = rest.filter((entry) => !own.includes(entry));
  const moreFeatures = [
    ...(short ? TOP.filter((top) => !SHORT_BAR.includes(top.key)).flatMap((top) => top.extra || []) : []),
    ...more.flatMap((entry) => entry.features),
  ];
  /* The Production in charge: the floor one tap away, right after My work [PRODUCTION_FLOOR]. */
  const floor = productionFloor ? [{ ...PRODUCTION_FLOOR, features: PRODUCTION_FLOOR.features.filter((feature) => !used.has(feature.to)) }] : [];
  return [
    ...items.slice(0, 1),
    ...floor,
    ...items.slice(1),
    ...own.map((entry) => ({ key: entry.key, label: entry.label, features: entry.features })),
    ...(moreFeatures.length ? [{ key: 'more', label: 'More', features: moreFeatures }] : []),
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

