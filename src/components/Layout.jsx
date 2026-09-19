import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WorkspaceRail from './dock/WorkspaceRail.jsx';
import SidebarNav from './SidebarNav.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Modal } from './ui.jsx';
import { humanise } from '../utils/format.js';

/**
 * Modules across the top, and the screens inside one module down the side.
 *
 * Two levels, each answering a different question. The strip answers "which part of the business
 * am I in", and it is always the same strip — every module you may open is on it, in one place,
 * so nothing is ever more than one hop away and nothing is hidden behind guessing which area
 * holds it. The sidebar answers "what is in this part", and it only ever shows that: a column
 * listing every screen in the application made the reader scan twenty labels to find two.
 *
 * The alternative arrangements both failed in the same direction. A rail of *areas* on the left
 * meant the sidebar rearranged itself as you moved, and you could not see where a module lived
 * without first knowing its area. One flat list of everything was legible only while short.
 *
 * A module with one screen still gets a sidebar of one row. That is honest — it says this module
 * has one screen — and it keeps the shape of the app the same wherever you are, which is worth
 * more than the row it saves.
 *
 * Each feature carries the grant that governs it, falling back to the module's own. `admin` sits
 * beside `module` rather than pretending to be one: the integrations page carries a third
 * party's key state and spends API calls the whole plant shares, and inventing a grant for it
 * would mean an access list with an entry nobody knows how to reason about.
 */
/**
 * What the Home link is called, per department.
 *
 * Home is a different screen for each of them [pages/Home.jsx], so one label cannot be honest
 * for all: "My day" over management's plant figures describes somebody else's morning, and a
 * nav that mislabels the page you are on is the first thing a new user stops trusting.
 */
const HOME_LABELS = {
  management: 'The plant today',
  sampling: 'The bench today',
  production: 'The plant floor',
  despatch: 'The yard today',
  quality: 'On hold',
  accounts: 'The chase',
};

const MODULES = [
  {
    key: 'home',
    label: 'Home',
    features: [
      /* Labelled by what the screen actually is for this reader — see HOME_LABELS. Home is
         chosen by department [pages/Home.jsx], and a link reading "My day" over a screen of
         plant figures is the nav describing somebody else's morning. */
      { to: '/', label: 'My day', end: true, home: true },
      /* "How am I doing", where My day answers "what needs me now" — the same question at two
         ranges, and both are why somebody opens the app rather than navigates to it mid-task. */
      { to: '/dashboard/marketing', label: 'My dashboard', module: 'enquiries' },
      { to: '/profile', label: 'Profile and access' },
    ],
  },
  /*
   * The front door sits above the pipeline it feeds, because that is the order the work arrives
   * in: a message becomes an enquiry becomes a quotation. A nav that put the inbox after the
   * registers would describe the data model rather than the morning.
   */
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    module: 'whatsapp',
    features: [{ to: '/whatsapp', label: 'Inbox' }],
  },
  /*
   * Queries sit beside the inbox rather than under any one department, because they belong to
   * none: a thread about a disputed invoice needs accounts, despatch and marketing at once, and
   * filing it under the department that happened to raise it would hide it from the two that
   * have to answer. Every department holds the grant for the same reason.
   */
  {
    key: 'queries',
    label: 'Queries',
    module: 'queries',
    features: [{ to: '/queries', label: 'Questions & answers' }],
  },
  {
    key: 'enquiries',
    label: 'Leads & enquiries',
    module: 'enquiries',
    /* Analytics nests under the register it is about. A parent with children is `end`, or it
       stays lit while a child is open and two rows claim to be the current page at once. */
    features: [
      {
        to: '/leads', label: 'Leads', end: true,
        children: [{ to: '/leads/analytics', label: 'Lead analytics' }],
      },
      { to: '/enquiries', label: 'Enquiries' },
    ],
  },
  {
    key: 'samples',
    label: 'Sampling',
    module: 'samples',
    features: [
      {
        to: '/samples', label: 'Sample queue', end: true,
        children: [
          { to: '/samples/dashboard', label: 'Sampling dashboard' },
          { to: '/samples/analytics', label: 'Sample analytics' },
        ],
      },
    ],
  },
  /*
   * One module, two screens. A costing exists to become a quotation and a quotation carries a
   * costing's price to a buyer — they were two tabs for one question, and the answer lived half
   * in each.
   */
  {
    key: 'pricing',
    label: 'Pricing',
    module: 'pricing',
    features: [
      { to: '/pricings', label: 'Costing sheets' },
      /* Exact, now that a screen lives under it: without this both entries light on the sent
         board, and two lit links in one section is the nav saying it has lost its place. */
      { to: '/quotations', label: 'Quotations', end: true },
      /* What is out there with buyers right now, kept apart from the drafts it would otherwise
         be buried among — and carrying the costing each price was worked out from. */
      { to: '/quotations/sent', label: 'Sent quotations' },
    ],
  },
  {
    key: 'orders',
    label: 'Sales orders',
    module: 'orders',
    features: [{ to: '/orders', label: 'All sales orders' }],
  },
  {
    key: 'production',
    label: 'Production',
    module: 'production',
    features: [{ to: '/production', label: 'Production status' }],
  },
  {
    key: 'quality',
    label: 'Quality',
    module: 'quality',
    features: [
      {
        to: '/quality', label: 'Inspections', end: true,
        children: [{ to: '/quality/report', label: 'Quality report' }],
      },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    module: 'dispatch',
    features: [{ to: '/dispatches', label: 'Consignments' }],
  },
  {
    key: 'payments',
    label: 'Payments',
    module: 'payments',
    features: [{ to: '/payments', label: 'What is owed' }],
  },
  {
    key: 'customers',
    label: 'Customers',
    module: 'customers',
    features: [{ to: '/customers', label: 'All customers' }],
  },
  {
    /*
     * The registers, together. Each is thin on its own — one screen apiece — and they are the
     * same kind of thing to the plant: what a model is made of. Splitting them into five tabs
     * would put five near-identical entries on the strip and leave each sidebar holding one row.
     */
    key: 'catalogue',
    label: 'Catalogue',
    features: [
      { to: '/moulds', label: 'Models & moulds', module: 'moulds' },
      { to: '/materials', label: 'Material register', module: 'materials' },
      { to: '/hooks', label: 'Hook register', module: 'materials' },
      { to: '/clips', label: 'Clip register', module: 'materials' },
      { to: '/prints', label: 'Print register', module: 'materials' },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    features: [
      { to: '/users', label: 'Users and access', module: 'users' },
      { to: '/integrations', label: 'Integrations', admin: true },
    ],
  },
];

/** Every screen in a module, parents and the children under them. */
const screensOf = (entry) =>
  entry.features.flatMap((feature) => [feature, ...(feature.children || [])]);

/**
 * Whether a route is the one being looked at. `/` is exact or it would claim every screen.
 */
const covers = (pathname, to) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

/**
 * Which module the current screen belongs to.
 *
 * Longest match wins, so `/samples/analytics` resolves through its own entry rather than
 * stopping at `/samples` — and a detail route like `/orders/6aa2…` still lands on Sales orders,
 * which is what keeps the strip lit while somebody reads one record.
 */
const moduleFor = (pathname) => {
  let best = MODULES[0];
  let longest = -1;

  for (const entry of MODULES) {
    for (const screen of screensOf(entry)) {
      if (covers(pathname, screen.to) && screen.to.length > longest) {
        best = entry;
        longest = screen.to.length;
      }
    }
  }
  return best;
};

/** Brand lockup, used on the login screen and in the sidebar header. */
export function Wordmark({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-flame-500 shadow-glow">
        <svg viewBox="0 0 24 24" className="h-[1.1rem] w-[1.1rem] text-white" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4a2.2 2.2 0 0 1 2.2 2.2c0 1.2-1 2.2-2.2 2.2v2.2" />
          <path d="m12 10.6-8.2 6.2a1 1 0 0 0 .6 1.8h15.2a1 1 0 0 0 .6-1.8L12 10.6Z" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[0.95rem] font-extrabold tracking-tight text-steel-50">
            Navin Hangers
          </span>
          <span className="mt-0.5 block text-xs font-semibold tracking-[0.12em] text-steel-500">
            CRM · ERP
          </span>
        </span>
      )}
    </div>
  );
}

/** Switches the palette. Shows the theme you would get, which is the one you don't have. */
export function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn-ghost px-2.5 py-1.5 ${className}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <svg viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isDark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
    </button>
  );
}

/**
 * The module strip.
 *
 * It will outrun its space on most accounts — a dozen modules beside a search box — and the
 * honest answer is to let it scroll and say so. The cut edge is faded on whichever side is
 * actually cut, because a tab sliced through the middle against a hard edge reads as a
 * rendering fault rather than as "there is more this way"; and a wheel over the strip moves it
 * sideways, because shift-scrolling a bar with no visible scrollbar is not something anybody
 * discovers.
 */
function ModuleTabs({ modules, active }) {
  const strip = useRef(null);
  const [cut, setCut] = useState({ start: false, end: false });

  useEffect(() => {
    const node = strip.current;
    if (!node) return undefined;

    const measure = () => {
      const slack = node.scrollWidth - node.clientWidth;
      /* A pixel or two of slack is sub-pixel layout, not a hidden tab. */
      setCut({ start: node.scrollLeft > 4, end: slack > 4 && node.scrollLeft < slack - 4 });
    };

    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [modules.length]);

  /* The active tab scrolled into view, for the case nobody clicked it — arriving from a search
     result or a link with the strip already scrolled elsewhere. */
  useEffect(() => {
    strip.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const mask =
    cut.start && cut.end
      ? '[mask-image:linear-gradient(to_right,transparent,#000_1.25rem,#000_calc(100%-1.25rem),transparent)]'
      : cut.end
        ? '[mask-image:linear-gradient(to_right,#000_calc(100%-1.25rem),transparent)]'
        : cut.start
          ? '[mask-image:linear-gradient(to_right,transparent,#000_1.25rem)]'
          : '';

  return (
    <div
      ref={strip}
      onWheel={(event) => {
        const node = strip.current;
        if (!node || node.scrollWidth <= node.clientWidth) return;
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        node.scrollLeft += event.deltaY;
      }}
      className={`scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto ${mask}`}
    >
      {modules.map((entry) => {
        const lit = entry.key === active;

        return (
          <NavLink
            key={entry.key}
            to={entry.features[0].to}
            end={entry.features[0].end}
            data-active={lit}
            /* Lit by which module owns the screen, not by the tab's own href — otherwise a
               detail route or a second screen in the module leaves no tab marked, and the strip
               reads as having lost its place. */
            className={`relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold tracking-tight transition-colors ${
              lit ? 'bg-line/[0.08] text-flame-500' : 'text-steel-300 hover:bg-line/[0.05] hover:text-steel-50'
            }`}
          >
            {entry.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Layout() {
  const { user, logout, canRead, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /*
   * What this person may open.
   *
   * Decided here rather than inside the nav components, because access is the Layout's business
   * and a nav that ruled on it too would be a second access rule to keep in step with the first.
   * A feature falls back to its module's grant; a child is dropped with its parent, since a
   * report on a module you cannot open is a screen you cannot open either.
   */
  const readable = useMemo(() => {
    const homeLabel = HOME_LABELS[user?.department] || 'My day';

    const mayOpen = (feature, entry) => {
      if (feature.admin && !isAdmin) return false;
      const grant = feature.module ?? entry.module;
      return !grant || canRead(grant);
    };

    return MODULES.map((entry) => ({
      ...entry,
      features: entry.features
        .filter((feature) => mayOpen(feature, entry))
        .map((feature) => ({
          ...feature,
          label: feature.home ? homeLabel : feature.label,
          children: (feature.children || []).filter((child) => mayOpen(child, entry)),
        })),
    })).filter((entry) => entry.features.length);
  }, [canRead, isAdmin, user?.department]);

  /*
   * The module in view — and a fallback, because the one the route belongs to may be one this
   * person cannot read. Landing on a screen with an empty sidebar would read as broken.
   */
  const routed = moduleFor(location.pathname);
  const active = readable.find((entry) => entry.key === routed.key) || readable[0];

  /* One titleless section: the module's name is already lit on the strip above, and repeating
     it as a heading over its own list is a row that says nothing new. */
  const sidebar = active ? [{ items: active.features }] : [];

  const features = <SidebarNav sections={sidebar} scope={active?.key || 'nav'} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* `relative z-30` so the header's own overlays — the search results — paint above the
          main pane. Without a stacking context here, `main` comes later in the DOM and wins,
          and the results render behind the page they are offering to open. */}
      <header className="relative z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-line/10 bg-ink-850 px-3 sm:px-4">
        <button
          type="button"
          className="btn-secondary px-3 lg:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
        >
          <span aria-hidden>☰</span>
        </button>

        <div className="hidden shrink-0 lg:block"><Wordmark /></div>
        <div className="lg:hidden"><Wordmark compact /></div>

        {/* The modules. Hidden on a narrow screen, where the drawer carries them instead —
            a strip that has to be scrolled to find anything is worse than a list. */}
        <div className="hidden min-w-0 flex-1 lg:flex">
          <ModuleTabs modules={readable} active={active?.key} />
        </div>

        <div className="min-w-0 flex-1 lg:max-w-xs lg:flex-none"><GlobalSearch /></div>

        <ThemeToggle />

        <NavLink
          to="/profile"
          className="hidden shrink-0 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-line/[0.04] sm:block"
          title="Profile and access"
        >
          <span className="block font-semibold leading-tight text-steel-100">{user?.name}</span>
          <span className="block text-xs text-steel-400">
            {humanise(user?.department) || humanise(user?.role)}
          </span>
        </NavLink>

        <button
          type="button"
          className="btn-ghost shrink-0 px-2 text-xs sm:text-sm"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* The screens inside the module on the strip above. */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-line/10 bg-ink-850 lg:flex">
          <p className="shrink-0 px-5 pb-1 pt-4 text-xs font-bold tracking-tight text-steel-100">
            {active?.label}
          </p>
          {/* `min-h-0` so the list scrolls inside the column rather than pushing it taller. */}
          <div className="flex min-h-0 flex-1 flex-col pb-4 pt-1">{features}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            key={location.pathname}
            className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
          >
            {/*
              Inside the main column rather than around the whole app, so a screen that throws
              loses the screen and not the navigation: the sidebar, the search and the workspace
              all keep working, and going somewhere else is one press rather than a reload.

              Keyed on the path so the apology clears when the person navigates away — a caught
              boundary stays caught until something resets it.
            */}
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/*
          The workspace, on the right of every screen. A sibling of the main column rather than
          something floating above it: that is what lets the page reflow around it and the to-do
          list stay open while you work, instead of covering the work it refers to.
        */}
        <WorkspaceRail />
      </div>

      {/*
        The drawer, which carries both levels because a phone has room for neither beside the
        content: every module, with its screens under it, as one list.
      */}
      <Modal open={menuOpen} title="Navigate" onClose={() => setMenuOpen(false)} size="sm">
        <SidebarNav
          sections={readable.map((entry) => ({ title: entry.label, items: entry.features }))}
          scope="drawer"
        />
      </Modal>
    </div>
  );
}
