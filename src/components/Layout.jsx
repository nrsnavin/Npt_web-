import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WorkspaceRail from './dock/WorkspaceRail.jsx';
import SidebarNav from './SidebarNav.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { Modal } from './ui.jsx';
import { humanise } from '../utils/format.js';

/**
 * The navigation, as one list.
 *
 * It used to be two: a rail of areas on the far left, and a sidebar that changed to match
 * whichever area you were in. That arrangement kept each column short, and paid for it in the
 * thing navigation is for — you could not see where anything was without first guessing which
 * area held it, and the sidebar rearranging itself under you as you moved made the app feel
 * like several apps. One list, always the same, is worth more rows.
 *
 * The rows it costs are given back by the groups, which collapse [`SidebarNav`]. Sections put
 * away whole bands of the business; a module with screens under it nests them rather than
 * listing them as peers — "Quality" and "Quality report" were siblings in a flat list, which
 * said they were equals when one is plainly a view of the other.
 *
 * Every item is gated on the grant that governs it, and `admin` sits beside `module` rather
 * than pretending to be one: some screens are not a module at all — the integrations page
 * carries a third party's key state and spends API calls the whole plant shares — and inventing
 * a grant for them would mean an access list with an entry nobody knows how to reason about.
 */
const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'My day', end: true },
      /*
       * "How am I doing", where My day answers "what needs me now" — the same question at two
       * ranges, and both are why somebody opens the app rather than something they navigate to
       * mid-task.
       */
      { to: '/dashboard/marketing', label: 'My dashboard', module: 'enquiries' },
      { to: '/profile', label: 'Profile and access' },
    ],
  },
  {
    title: 'Sales and operations',
    /*
     * The boards and reports sit *under* the module they are about rather than beside it. A
     * parent with children is `end`, or it stays lit while a child is open and two rows claim
     * to be the current page at once.
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
  {
    title: 'Security control',
    items: [{ to: '/users', label: 'Users and access', module: 'users' }],
  },
  {
    title: 'Outside feeds',
    items: [{ to: '/integrations', label: 'Integrations', admin: true }],
  },
];

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

export default function Layout() {
  const { user, logout, canRead, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  /* The drawer closes on arrival. Leaving it open over the screen it just opened is the
     commonest small annoyance in a mobile nav. */
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /*
   * The nav, narrowed to what this person may read.
   *
   * Kept here rather than inside `SidebarNav`, because what somebody may open is the Layout's
   * business and a nav that decided it too would be a second access rule to keep in step with
   * the first.
   *
   * A child is dropped with its parent: a report on a module you cannot open is a screen you
   * cannot open either, and offering it would be offering a refusal.
   */
  const mayOpen = (item) => (!item.module || canRead(item.module)) && (!item.admin || isAdmin);

  const readableSections = NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(mayOpen).map((item) => ({
        ...item,
        children: (item.children || []).filter(mayOpen),
      })),
    }))
    .filter((section) => section.items.length);

  /*
   * One nav, rendered in two places — the column on a wide screen, the drawer on a narrow one.
   * They are never both on screen, so each keeps its own open/shut state and both read the same
   * remembered preference when they mount.
   */
  const navigation = <SidebarNav sections={readableSections} scope="main" />;

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <aside className="hidden w-56 shrink-0 flex-col border-r border-line/10 bg-ink-850 lg:flex">
        <div className="border-b border-line/10 px-5 py-5">
          <Wordmark />
        </div>
        {/* `min-h-0` so the nav scrolls inside the column rather than pushing it taller. */}
        <div className="flex min-h-0 flex-1 flex-col py-3">{navigation}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* `relative z-30` so the header's own overlays — the search results — paint above the
            main pane. Without a stacking context here, `main` comes later in the DOM and wins,
            and the results render behind the page they are offering to open. */}
        <header className="relative z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-line/10 bg-ink-850 px-3 py-2 sm:px-6">
          <button
            type="button"
            className="btn-secondary px-3 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation"
            aria-expanded={menuOpen}
          >
            <span aria-hidden>☰</span> <span className="hidden sm:inline">Menu</span>
          </button>

          <div className="min-w-0 flex-1"><GlobalSearch /></div>

          <ThemeToggle />

          <NavLink
            to="/profile"
            className="hidden rounded-lg px-2 py-1 text-sm transition-colors hover:bg-line/[0.04] sm:block"
            title="Profile and access"
          >
            <span className="block font-semibold text-steel-100">{user?.name}</span>
            <span className="block text-xs text-steel-400">
              {humanise(user?.department) || humanise(user?.role)}
            </span>
          </NavLink>

          <button type="button" className="btn-ghost px-2 text-xs sm:text-sm" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          key={location.pathname}
          className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8"
        >
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
    </div>
    <WorkspaceRail />
    <Modal open={menuOpen} title="Navigate" onClose={() => setMenuOpen(false)} size="sm">{navigation}</Modal>
  </div>;
}
