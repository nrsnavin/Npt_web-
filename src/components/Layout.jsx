import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import WorkspaceRail from './dock/WorkspaceRail.jsx';
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
        items: [
          // Exact, or Leads stays lit while its analytics page is open.
          { to: '/leads', label: 'Leads', module: 'enquiries', end: true },
          { to: '/leads/analytics', label: 'Lead analytics', module: 'enquiries' },
          { to: '/enquiries', label: 'Enquiries', module: 'enquiries' },
          { to: '/pricings', label: 'Costings', module: 'pricing' },
          { to: '/quotations', label: 'Quotations', module: 'quotations' },
          { to: '/orders', label: 'Sales orders', module: 'orders' },
          { to: '/production', label: 'Production', module: 'production' },
          // Exact, or the register stays lit while the report is open beneath it.
          { to: '/quality', label: 'Quality', module: 'quality', end: true },
          { to: '/quality/report', label: 'Quality report', module: 'quality' },
          { to: '/dispatches', label: 'Dispatch', module: 'dispatch' },
          { to: '/payments', label: 'Payments', module: 'payments' },
          // Exact, or the queue stays lit while the dashboard is open beneath it.
          { to: '/samples', label: 'Sampling', module: 'samples', end: true },
          { to: '/samples/dashboard', label: 'Sampling dashboard', module: 'samples' },
          { to: '/samples/analytics', label: 'Sample analytics', module: 'samples' },
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
