import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { humanise } from '../utils/format.js';

/**
 * Icons are inline single-path SVGs rather than emoji: they inherit currentColor,
 * stay optically consistent, and never shift with the platform's emoji font.
 */
const ICONS = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2',
  quote: 'M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M8 3v2h8V3M8 3h8m-6 8h4m-4 4h4',
  box: 'm21 8-9-5-9 5m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5',
  factory: 'M2 20h20M4 20V10l6 4V10l6 4V6l4-2v16M7 20v-4h3v4',
  hanger: 'M12 4a2 2 0 0 1 2 2c0 1.1-.9 2-2 2v2m0 0L4 16h16l-8-6Z',
  flask: 'M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3M8 14h8',
  cart: 'M3 4h2l2.4 11.2A2 2 0 0 0 9.4 17h7.9a2 2 0 0 0 2-1.6L21 8H6M9 21h.01M18 21h.01',
  truck: 'M3 16V6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10M15 9h4l3 4v3h-3M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
};

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    title: 'Revenue',
    items: [
      { to: '/leads', label: 'Leads', icon: 'target' },
      { to: '/customers', label: 'Customers', icon: 'building' },
      { to: '/quotations', label: 'Quotations', icon: 'quote' },
      { to: '/sales-orders', label: 'Sales Orders', icon: 'box' },
    ],
  },
  {
    title: 'Plant',
    items: [
      { to: '/production', label: 'Production', icon: 'factory' },
      { to: '/products', label: 'Hanger Catalogue', icon: 'hanger' },
    ],
  },
  {
    title: 'Supply chain',
    items: [
      { to: '/materials', label: 'Raw Materials', icon: 'flask' },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: 'cart' },
      { to: '/suppliers', label: 'Suppliers', icon: 'truck' },
    ],
  },
];

function NavIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.05rem] w-[1.05rem] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold
         tracking-tight transition-colors duration-150 ${
           isActive
             ? 'bg-white/[0.07] text-steel-50'
             : 'text-steel-400 hover:bg-white/[0.04] hover:text-steel-100'
         }`
      }
    >
      {({ isActive }) => (
        <>
          {/* The accent marks position, it does not fill the row — one hot element per view. */}
          <span
            className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-flame-500
              transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`}
          />
          <span className={isActive ? 'text-flame-500' : 'text-steel-500 group-hover:text-steel-300'}>
            <NavIcon name={item.icon} />
          </span>
          {item.label}
        </>
      )}
    </NavLink>
  );
}

/** Brand lockup: the hook mark plus the wordmark, used in the sidebar and on the login screen. */
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
          <span className="mt-0.5 block text-[0.6875rem] font-semibold tracking-[0.12em] text-steel-500">
            CRM · ERP
          </span>
        </span>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating on mobile should always dismiss the drawer.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-white/[0.06]
          bg-ink-850/95 backdrop-blur-xl transition-transform duration-300 ease-out
          lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-5">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="eyebrow mb-1.5 px-3">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItem key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] px-5 py-3">
          <p className="text-[0.6875rem] text-steel-500">A hanger expert you can hang onto</p>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 animate-fade-in bg-ink-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-white/[0.06] bg-ink-900/80 px-4 py-3 backdrop-blur-xl sm:px-6">
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

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[0.8125rem] font-semibold leading-tight text-steel-100">{user?.name}</p>
              <p className="text-[0.6875rem] font-medium text-steel-500">{humanise(user?.role)}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-flame-500/15 text-[0.8125rem] font-bold text-flame-400 ring-1 ring-inset ring-flame-500/25">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main key={location.pathname} className="flex-1 animate-fade-up p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
