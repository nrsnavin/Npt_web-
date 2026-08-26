import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { humanise } from '../utils/format.js';

/**
 * Icons are inline single-path SVGs rather than emoji: they inherit currentColor,
 * stay optically consistent, and never shift with the platform's emoji font.
 */
const ICONS = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c-3.9 0-7 2.5-7 5.6V20h14v-2.4c0-3.1-3.1-5.6-7-5.6Z',
  users: 'M16 19v-1.6c0-2.4-2.4-4.4-5.5-4.4S5 15 5 17.4V19m5.5-8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 19v-1.6c0-1.8-1.3-3.4-3.2-4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
};

/**
 * `module` gates an item on the signed-in user's grants, so the navigation can never
 * offer a screen the API would refuse.
 */
const NAV_SECTIONS = [
  {
    title: 'Account',
    items: [{ to: '/profile', label: 'My profile', icon: 'user' }],
  },
  {
    title: 'Administration',
    items: [{ to: '/users', label: 'Users', icon: 'users', module: 'users' }],
  },
];

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
      <svg
        viewBox="0 0 24 24"
        className="h-[1.05rem] w-[1.05rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
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
             ? 'bg-line/[0.07] text-steel-50'
             : 'text-steel-400 hover:bg-line/[0.04] hover:text-steel-100'
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
  const { user, logout, canRead } = useAuth();
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line/[0.06]
          bg-ink-850/95 backdrop-blur-xl transition-transform duration-300 ease-out
          lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-5">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !item.module || canRead(item.module));
            if (!items.length) return null;

            return (
              <div key={section.title}>
                <p className="eyebrow mb-1.5 px-3">{section.title}</p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavItem key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-line/[0.06] px-5 py-3">
          <p className="text-[0.6875rem] text-steel-500">A hanger expert you can hang onto</p>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-line/[0.06] bg-ink-900/80 px-4 py-3 backdrop-blur-xl sm:px-6">
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
            <ThemeToggle />
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
