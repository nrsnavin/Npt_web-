import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WorkspaceRail from './dock/WorkspaceRail.jsx';
import SidebarNav from './SidebarNav.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { Modal } from './ui.jsx';
import { humanise } from '../utils/format.js';

const SIDEBARS = {
  '/': {
    title: 'Home',
    sections: [
      {
        title: 'Overview',
        items: [
          { to: '/', label: 'My day', end: true },
          /*
           * Moved here from Pipeline. It answers "how am I doing" where My day answers "what
           * needs me now" — the same question at two ranges, and both are why somebody opens
           * the app rather than something they navigate to mid-task.
           */
          { to: '/dashboard/marketing', label: 'My dashboard', module: 'enquiries' },
          { to: '/profile', label: 'Profile and access' },
        ],
      },
    ],
  },
  '/enquiries': {
    title: 'Pipeline',
    sections: [
      {
        title: 'Before the order',
        /*
         * The boards and reports sit *under* the module they are about rather than beside it.
         *
         * Flat, "Quality" and "Quality report" were siblings — which told the reader they were
         * peers when one is plainly a view of the other, and made a fourteen-row list where
         * every entry carried the same weight. Nested, the parent reads as the thing and the
         * rest as its views, and the list is ten rows with the detail put away.
         *
         * A parent with children is `end`, or it stays lit while a child is open and two rows
         * claim to be the current page at once.
         */
        items: [
          {
            to: '/leads', label: 'Leads', module: 'enquiries', end: true,
            children: [{ to: '/leads/analytics', label: 'Lead analytics', module: 'enquiries' }],
          },
          { to: '/enquiries', label: 'Enquiries', module: 'enquiries' },
          { to: '/pricings', label: 'Costings', module: 'pricing' },
          { to: '/quotations', label: 'Quotations', module: 'quotations' },
          { to: '/orders', label: 'Sales orders', module: 'orders' },
          { to: '/production', label: 'Production', module: 'production' },
          {
            to: '/quality', label: 'Quality', module: 'quality', end: true,
            children: [{ to: '/quality/report', label: 'Quality report', module: 'quality' }],
          },
          { to: '/dispatches', label: 'Dispatch', module: 'dispatch' },
          { to: '/payments', label: 'Payments', module: 'payments' },
          {
            to: '/samples', label: 'Sampling', module: 'samples', end: true,
            children: [
              { to: '/samples/dashboard', label: 'Sampling dashboard', module: 'samples' },
              { to: '/samples/analytics', label: 'Sample analytics', module: 'samples' },
            ],
          },
        ],
      },
      {
        title: 'Masters',
        items: [
          { to: '/customers', label: 'Customers', module: 'customers' },
          { to: '/moulds', label: 'Models & moulds', module: 'moulds' },
          { to: '/materials', label: 'Material register', module: 'materials' },
          { to: '/hooks', label: 'Hook register', module: 'materials' },
          { to: '/clips', label: 'Clip register', module: 'materials' },
          { to: '/prints', label: 'Print register', module: 'materials' },
        ],
      },
    ],
  },
  '/moulds': {
    title: 'Catalogue',
    sections: [
      {
        title: 'Masters',
        items: [
          { to: '/moulds', label: 'Models & moulds', module: 'moulds' },
          { to: '/materials', label: 'Material register', module: 'materials' },
          { to: '/hooks', label: 'Hook register', module: 'materials' },
          { to: '/clips', label: 'Clip register', module: 'materials' },
          { to: '/prints', label: 'Print register', module: 'materials' },
          { to: '/customers', label: 'Customers', module: 'customers' },
        ],
      },
    ],
  },
  '/profile': {
    title: 'My account',
    sections: [
      {
        title: 'General',
        items: [{ to: '/profile', label: 'Profile and access' }],
      },
    ],
  },
  '/users': {
    title: 'Administration',
    sections: [
      {
        title: 'Security control',
        items: [{ to: '/users', label: 'Users and access', module: 'users' }],
      },
      {
        title: 'Outside feeds',
        items: [{ to: '/integrations', label: 'Integrations', admin: true }],
      },
    ],
  },
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

/** Where a built module lives. Anything absent is available but has no screen of its own. */
export default function Layout() {
  const { user, logout, canRead, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const railItems = RAIL.filter(
    (item) =>
      (!item.module || canRead(item.module)) &&
      (!item.modules || item.modules.some((module) => canRead(module)))
  );

  /**
   * Where clicking an area actually lands.
   *
   * The area's own `to` when the caller can read it, and otherwise the first screen inside it
   * that they can — because an area they may open containing a landing page they may not is a
   * link that leads to a refusal.
   */
  const railTarget = (item) => {
    const inside = SIDEBARS[item.to]?.sections.flatMap((section) => section.items) || [];
    const reachable = inside.find((entry) => !entry.module || canRead(entry.module));
    const landing = inside.find((entry) => entry.to === item.to);

    if (landing && (!landing.module || canRead(landing.module))) return item.to;
    return reachable?.to || item.to;
  };

  const owns = (item) =>
    (item.paths || [item.to]).some((path) => location.pathname.startsWith(path));
  const sidebarKey = railItems.find((item) => item.to !== '/' && owns(item))?.to;
  const sidebar = SIDEBARS[sidebarKey || '/'];

  /*
   * The nav, narrowed to what this person may read.
   *
   * Kept here rather than inside `SidebarNav`, because what somebody may open is the Layout's
   * business and a nav that decided it too would be a second access rule to keep in step with
   * the first.
   *
   * `admin` sits beside `module` rather than pretending to be one. Some screens are not a module
   * at all — the integrations page carries a third party's key state and spends API calls the
   * whole plant shares — and inventing a grant for them would mean an access list with an entry
   * nobody knows how to reason about.
   *
   * A child is dropped with its parent: a report on a module you cannot open is a screen you
   * cannot open either, and offering it would be offering a refusal.
   */
  const mayOpen = (item) => (!item.module || canRead(item.module)) && (!item.admin || isAdmin);

  const readableSections = sidebar.sections
    .map((section) => ({
      ...section,
      items: section.items.filter(mayOpen).map((item) => ({
        ...item,
        children: (item.children || []).filter(mayOpen),
      })),
    }))
    .filter((section) => section.items.length);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* Far-left rail */}
        <nav
          aria-label="Areas"
          className="hidden w-[4.25rem] shrink-0 flex-col items-center gap-1 border-r border-line/[0.06] bg-ink-850 py-3 sm:flex"
        >
          {railItems.map((item) => (
            <NavLink
              key={item.to}
              to={railTarget(item)}
              end={item.end}
              /* An area stays lit across every route it owns, not just its landing page. */
              className={({ isActive }) =>
                `flex w-[3.4rem] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.75rem] font-semibold transition-colors ${
                  /*
                   * `owns` is consulted for every area now, not only the ones without `end`.
                   * Home is exact-matched on `/` so that My day does not light it from every
                   * route, but it still owns the dashboards — and an area with no lit icon on
                   * a screen it owns reads as the navigation having lost its place.
                   */
                  isActive || owns(item)
                    ? 'bg-line/[0.08] text-flame-500'
                    : 'text-steel-400 hover:bg-line/[0.05] hover:text-steel-100'
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}

          <div className="mt-auto flex flex-col items-center gap-1">
            <span className="rounded bg-flame-500/15 px-1.5 py-0.5 text-[0.75rem] font-bold uppercase tracking-wide text-flame-400">
              Trial
            </span>
          </div>
        </nav>

        {/* Secondary sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-line/[0.06] bg-ink-850/95 backdrop-blur-xl transition-transform duration-300 ease-out lg:static lg:translate-x-0 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="border-b border-line/[0.06] px-4 py-3.5">
            <Wordmark />
          </div>

          <div className="px-4 py-3">
            <p className="text-xs font-bold tracking-tight text-steel-100">
              {sidebar.title}
            </p>
          </div>

          <SidebarNav sections={readableSections} scope={sidebarKey || '/'} />

          <div className="border-t border-line/[0.06] px-4 py-3">
            <p className="text-xs text-steel-500">A hanger expert you can hang onto</p>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 animate-fade-in bg-scrim/70 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* `relative z-30` so the header's own overlays — the search results — paint above
              the main pane. Without a stacking context here, `main` comes later in the DOM
              and wins, and the results render behind the page they are offering to open. */}
          <header className="relative z-30 flex shrink-0 items-center gap-3 border-b border-line/[0.06] bg-ink-900/80 px-4 py-2 backdrop-blur-xl">
            <button
              type="button"
              className="btn-ghost px-2.5 py-1.5 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <TopTabs />

            <GlobalSearch />

            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold leading-tight text-steel-100">
                  {user?.name}
                </p>
                <p className="text-xs font-medium text-steel-500">
                  {humanise(user?.department) || humanise(user?.role)}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-flame-500/15 text-xs font-bold text-flame-400 ring-1 ring-inset ring-flame-500/25">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <button type="button" className="btn-secondary px-3 py-1.5" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </header>

          <main key={location.pathname} className="min-h-0 flex-1 animate-fade-up overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>

        {/*
          The workspace, on the right of every screen. A sibling of the main column rather than
          something floating above it: that is what lets the page reflow around it and the
          to-do list stay open while you work, instead of covering the work it refers to.
        */}
        <WorkspaceRail />
      </div>

      {/* Bottom bar: who is signed in, and nothing else — the tools moved to the right. */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-line/[0.06] bg-ink-850 px-3 py-1">
        <span className="hidden text-xs text-steel-500 sm:block">
          {user?.name} · {humanise(user?.department)}
        </span>
      </footer>
  const sections = [
    SIDEBARS['/'].sections[0],
    { title: 'Sales and operations', items: SIDEBARS['/enquiries'].sections[0].items },
    SIDEBARS['/enquiries'].sections[1],
    ...SIDEBARS['/users'].sections,
  ];
  const navigation = <nav aria-label="Main navigation" className="space-y-6">
    {sections.map((section) => {
      const items = section.items.filter((item) => (!item.module || canRead(item.module)) && (!item.admin || isAdmin));
      if (!items.length) return null;
      return <div key={section.title}><p className="eyebrow mb-2 px-3">{section.title}</p><div className="space-y-1">{items.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-line/[0.08] font-semibold text-accent' : 'text-steel-300 hover:bg-line/[0.04] hover:text-steel-50'}`}>{item.label}</NavLink>)}</div></div>;
    })}
  </nav>;
  return <div className="flex h-dvh overflow-hidden">
    <a href="#main-content" className="skip-link">Skip to main content</a>
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line/10 bg-ink-850 lg:flex">
      <div className="border-b border-line/10 px-5 py-5"><Wordmark /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">{navigation}</div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="relative z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-line/10 bg-ink-850 px-3 py-2 sm:px-6">
        <button type="button" className="btn-secondary px-3 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}>☰ <span className="hidden sm:inline">Menu</span></button>
        <div className="min-w-0 flex-1"><GlobalSearch /></div>
        <ThemeToggle />
        <NavLink to="/profile" className="hidden rounded-lg px-2 py-1 text-sm sm:block" title="Profile and access"><span className="block font-semibold text-steel-100">{user?.name}</span><span className="block text-xs text-steel-400">{humanise(user?.department) || humanise(user?.role)}</span></NavLink>
        <button type="button" className="btn-ghost px-2 text-xs sm:text-sm" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
      </header>
      <main id="main-content" tabIndex={-1} key={location.pathname} className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
    <WorkspaceRail />
    <Modal open={menuOpen} title="Navigate" onClose={() => setMenuOpen(false)} size="sm">{navigation}</Modal>
  </div>;
}
