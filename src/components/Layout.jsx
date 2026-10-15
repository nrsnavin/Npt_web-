import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WorkspaceRail from './dock/WorkspaceRail.jsx';
import SidebarNav from './SidebarNav.jsx';
import InboxBell from './InboxBell.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Modal } from './ui.jsx';
import { humanise } from '../utils/format.js';
import { departmentLabel } from '../utils/pipeline.js';
import { simpleNavFor } from '../config/simpleNav.js';
import { barItems, litItem } from '../config/topBar.js';

/**
 * The plant's own layout: a dark bar across the top with Dashboard · Enquiries · Department
 * Tasks · Quotations · Masters & Access, the account under it ("email · Role" and the initials),
 * and the page full width beneath — no sidebar. A bar item with several screens opens a menu of
 * them; on a phone the bar folds into a drawer.
 *
 * MODULES below is the catalogue of every screen and the grant that governs it; the bar is built
 * from it [barItems]. Each feature carries its grant, falling back to the module's own; `admin`
 * marks the screens only Admin opens.
 */
const MODULES = [
  /*
   * The dashboard: everyone's one screen [pages/DepartmentDashboard.jsx] — the enquiries with
   * their department now, and every enquiry they may see (all of them for Admin, their own for
   * marketing). The enquiry list, its drafts and marketing's figures live under it, because
   * everything in this plant is an enquiry. The dashboard itself carries no grant; the enquiry
   * screens keep theirs.
   */
  {
    key: 'dashboard',
    label: 'Dashboard',
    features: [
      { to: '/departments/mine', label: 'Dashboard' },
      /* Draft enquiries — chats and cards sent to the WhatsApp number — are not a menu item of their
         own: they sit, highlighted, in New Enquiries on the dashboard, and open the drafts screen
         from there. A draft is a new enquiry nobody has finished, not a separate place to visit. */
      { to: '/enquiries', label: 'All enquiries', end: true, module: 'enquiries' },
      { to: '/departments', label: 'All departments', admin: true, end: true },
    ],
  },
  /*
   * First on the strip, because it is the front door: `/` redirects here [App.jsx].
   *
   * Queries belong to no one department — a thread about a disputed invoice needs accounts,
   * despatch and marketing at once, and filing it under whoever raised it would hide it from
   * the two who have to answer. Every department holds the grant for the same reason, which is
   * also what makes it a reasonable thing to open the application on.
   */
  {
    key: 'queries',
    label: 'Queries',
    module: 'queries',
    features: [
      { to: '/queries', label: 'Questions & answers' },
      /* The day by role — the bench queue, the plant's numbers, what is waiting on my team —
         for whoever wants a morning screen before the list. See `Home`. */
      { to: '/today', label: 'Today' },
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
      /* The quotation carries its costing now — one record from the price request to the buyer. */
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
    features: [
      { to: '/production', label: 'Production status' },
      { to: '/mould-runs', label: 'Mould runs', module: ['production', 'moulds'] },
      { to: '/machines', label: 'Machines & maintenance', module: ['production', 'moulds'] },
    ],
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
      { to: '/qc-records', label: 'QC records' },
      { to: '/qc-records/report', label: 'Reject report', module: ['quality', 'production'] },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    module: 'dispatch',
    features: [
      { to: '/dispatch/plan', label: 'Plan trips' },
      { to: '/dispatch/trips', label: 'Trips' },
      { to: '/dispatch/report', label: 'Dispatch report' },
      { to: '/dispatch/register', label: 'Dispatch register' },
      { to: '/dispatches', label: 'Consignments' },
      { to: '/dispatch/lists', label: 'Vehicles & transporters' },
    ],
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
      { to: '/trading', label: 'Trading master', module: 'materials' },
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

/** One item on the bar: a link, or — when it holds several screens — a menu of them. */
function BarItem({ item, lit }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const tone = `flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-[0.95rem] font-semibold transition-colors ${
    /* The current item: accent text with an accent underline on the bar's own background — a grey
       wash behind the accent took it under 4.5:1 in the light theme. */
    lit ? 'text-accent shadow-[inset_0_-2px_0_0_currentColor]' : 'text-steel-300 hover:bg-line/[0.05] hover:text-steel-50'
  }`;
  const icon = item.icon ? <span aria-hidden className="text-sm opacity-80">{item.icon}</span> : null;
  const screens = item.features.flatMap((feature) => [feature, ...(feature.children || []).map((child) => ({ ...child, child: true }))]);

  if (screens.length === 1) {
    return <NavLink to={screens[0].to} end={screens[0].end} className={tone} data-active={lit}>{icon}{item.label}</NavLink>;
  }
  return (
    <div ref={box} className="relative">
      <button type="button" className={tone} aria-haspopup="menu" aria-expanded={open} data-active={lit} onClick={() => setOpen((value) => !value)}>
        {icon}{item.label}<span aria-hidden className="text-xs opacity-70">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-40 mt-1 min-w-[14rem] rounded-xl border border-line/10 bg-ink-850 p-1.5 shadow-modal">
          {screens.map((screen) => (
            <NavLink
              key={screen.to}
              to={screen.to}
              end={screen.end}
              role="menuitem"
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${screen.child ? 'pl-6 text-steel-300' : 'font-semibold text-steel-100'} ${
                isActive ? 'bg-flame-500/10 text-accent' : 'hover:bg-line/[0.05]'
              }`}
            >
              {screen.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

const initialsOf = (name = '', email = '') => {
  const words = String(name).split(/\s+/).filter(Boolean);
  return (words.length ? words.slice(0, 2).map((word) => word[0]) : [email[0] || '?']).join('').toUpperCase();
};

/** Who is signed in, as the plant's own screen shows it: "email · Role", and the initials. */
function AccountBar({ user, roleLabel, onSignOut, accounts = [], onSwitch, onAddAccount, onLock, hasPin, onSignOutAll }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const who = user?.email || user?.phone || user?.name || '';
  return (
    <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-line/10 bg-ink-850 px-3 py-2.5 sm:px-5">
      <div ref={box} className="relative min-w-0 flex-1 sm:w-[22rem] sm:flex-none">
        <button
          type="button"
          aria-label="Your account"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-line/15 bg-ink-850 px-3.5 py-2.5 text-left text-sm text-steel-100 hover:border-line/25"
        >
          {/* The email and role on a wide screen; on a phone, where that was cut to "rsnavin1@g…", the
              name alone — the role is in the menu it opens. */}
          <span className="truncate sm:hidden">{user?.name || who}</span>
          <span className="hidden truncate sm:inline">{who}{roleLabel ? ` · ${roleLabel}` : ''}</span>
          <span aria-hidden className="text-steel-400">⌄</span>
        </button>
        {open && (
          <div role="menu" className="absolute left-0 top-full z-40 mt-1 w-full rounded-xl border border-line/10 bg-ink-850 p-1.5 shadow-modal">
            <p className="px-3 py-2 text-xs text-steel-400">Signed in as <span className="font-semibold text-steel-100">{user?.name}</span>{roleLabel ? ` · ${roleLabel}` : ''}</p>
            <NavLink to="/profile" role="menuitem" className="block rounded-lg px-3 py-2 text-sm font-semibold text-steel-100 hover:bg-line/[0.05]">Profile and access</NavLink>
            {/* The other accounts on this device [auth/accounts.js]: one tap to become them. */}
            {accounts.filter((row) => !row.active).length > 0 && (
              <div className="mt-1 border-t border-line/10 pt-1">
                <p className="px-3 py-1.5 text-xs font-semibold text-steel-400">Switch account</p>
                {accounts.filter((row) => !row.active).map((row) => (
                  <button key={row.id} type="button" role="menuitem" onClick={() => onSwitch?.(row.id)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-steel-100 hover:bg-line/[0.05]">
                    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-flame-50 text-xs font-bold text-accent ring-1 ring-inset ring-flame-500/20">{initialsOf(row.name, row.email || '')}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{row.name}</span>
                      <span className="block truncate text-xs text-steel-400">{row.roleLabel || (row.department ? departmentLabel(row.department) : '')}{row.locked ? ' · locked' : !row.signedIn ? ' · signed out' : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1 border-t border-line/10 pt-1">
              <button type="button" role="menuitem" onClick={onAddAccount} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-steel-100 hover:bg-line/[0.05]">+ Add another account</button>
              {hasPin
                ? <button type="button" role="menuitem" onClick={onLock} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-steel-100 hover:bg-line/[0.05]">Lock now <kbd className="rounded border border-line/15 px-1.5 text-xs font-normal text-steel-400">Ctrl+L</kbd></button>
                : <NavLink to="/profile" role="menuitem" className="block rounded-lg px-3 py-2 text-sm text-steel-400 hover:bg-line/[0.05]">Set a PIN to lock the app</NavLink>}
              <button type="button" role="menuitem" onClick={onSignOut} className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-danger-400 hover:bg-line/[0.05]">Sign out</button>
              {accounts.length > 1 && <button type="button" role="menuitem" onClick={onSignOutAll} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-danger-400 hover:bg-line/[0.05]">Sign out of all accounts</button>}
            </div>
          </div>
        )}
      </div>
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-flame-50 text-sm font-bold text-accent ring-1 ring-inset ring-flame-500/20">
        {initialsOf(user?.name, who)}
      </span>
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <div className="min-w-0 sm:w-64"><GlobalSearch /></div>
        <InboxBell />
        <ThemeToggle />
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, canRead, isAdmin, departments, accounts, switchTo, lock, hasPin, signOutAll, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  /* "Lock the app" from the command palette lands on `?lock=1` [utils/commands.js]. */
  useEffect(() => {
    if (new URLSearchParams(location.search).get('lock') !== '1') return;
    lock();
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, lock, navigate]);

  const handleLogout = async () => {
    await logout();
    /* Another account on the device takes over; without one, the login page. */
    if (!accounts.some((row) => !row.active && (row.signedIn || row.locked))) navigate('/login');
  };
  const handleSignOutAll = () => {
    signOutAll();
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
    const mayOpen = (feature, entry) => {
      if (feature.admin && !isAdmin) return false;
      /* A list means any one of them: the tool room reads the machines without the production grant. */
      const grant = feature.module ?? entry.module;
      return !grant || [].concat(grant).some(canRead);
    };

    return MODULES.map((entry) => ({
      ...entry,
      features: entry.features
        .filter((feature) => mayOpen(feature, entry))
        .map((feature) => ({
          ...feature,
          children: (feature.children || []).filter((child) => mayOpen(child, entry)),
        })),
    })).filter((entry) => entry.features.length);
  }, [canRead, isAdmin]);

  /*
   * The bar [the plant's own layout]: Dashboard · Enquiries · Department Tasks · Quotations ·
   * Masters & Access, the department's own modules beside them, and the rest under More.
   */
  const items = useMemo(
    () => barItems(readable, simpleNavFor(departments, { isAdmin }) || []),
    [readable, departments, isAdmin],
  );
  const lit = litItem(location.pathname, items);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* `relative z-30` so the menus open over the main pane, which comes later in the DOM. */}
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
        <div className="lg:hidden"><Wordmark /></div>

        {/* The bar. Hidden on a narrow screen, where the drawer carries it instead. */}
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {items.map((item) => <BarItem key={item.key} item={item} lit={lit === item.key} />)}
        </nav>
      </header>

      <AccountBar
        user={user}
        roleLabel={isAdmin ? 'Admin' : (user?.department && departmentLabel(user.department)) || humanise(user?.role)}
        onSignOut={handleLogout}
        accounts={accounts}
        onSwitch={(id) => { switchTo(id).then((row) => { if (row && !row.token && !row.sealed) navigate('/login?add=1', { state: { email: row.email } }); else navigate('/'); }); }}
        onAddAccount={() => navigate('/login?add=1')}
        onLock={lock}
        hasPin={hasPin}
        onSignOutAll={handleSignOutAll}
      />
      {notice && (
        <div className="flex items-center justify-between gap-3 border-b border-warn-500/20 bg-warn-500/10 px-4 py-2 text-sm text-warn-400">
          <span>{notice}</span>
          <button type="button" className="row-action" onClick={clearNotice}>Dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main
            id="main-content"
            tabIndex={-1}
            key={location.pathname}
            /* Room at the foot on a phone for the floating Workspace button, which otherwise
               sits on top of whatever is last on the page — a reply box, a row's menu. */
            className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-8"
          >
            {/* Inside the main column, so a screen that throws loses the screen and not the
                navigation; keyed on the path so the apology clears on the next screen. */}
            <ErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/* The workspace, on the right of every screen — a sibling, so the page reflows around it. */}
        <WorkspaceRail />
      </div>

      {/* The drawer on a phone: every bar item, with its screens under it, as one list. */}
      <Modal open={menuOpen} title="Navigate" onClose={() => setMenuOpen(false)} size="sm">
        <SidebarNav
          sections={[
            ...items.map((item) => ({ title: item.label, items: item.features })),
            { title: 'Your account', items: [{ to: '/profile', label: 'Profile and access' }] },
          ]}
          scope="drawer"
        />
      </Modal>
    </div>
  );
}
