import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Dock from './dock/Dock.jsx';
import { humanise } from '../utils/format.js';

/**
 * Icons are inline single-path SVGs rather than emoji: they inherit currentColor,
 * stay optically consistent, and never shift with the platform's emoji font.
 */
const ICONS = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c-3.9 0-7 2.5-7 5.6V20h14v-2.4c0-3.1-3.1-5.6-7-5.6Z',
  users: 'M16 19v-1.6c0-2.4-2.4-4.4-5.5-4.4S5 15 5 17.4V19m5.5-8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 19v-1.6c0-1.8-1.3-3.4-3.2-4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10M9 7h2M9 11h2M9 15h2',
  grid: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  shield: 'M12 3l7 3v5.5c0 4.2-2.9 7.7-7 8.5-4.1-.8-7-4.3-7-8.5V6l7-3Z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Zm13-4a6 6 0 0 1 0 10M6 14v5h3',
  factory: 'M2 20h20M4 20V10l6 4V10l6 4V6l4-2v16M7 20v-4h3v4',
};

/** The far-left rail: the top-level areas of the console. */
const RAIL = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/profile', label: 'Profile', icon: 'user' },
  { to: '/users', label: 'Users', icon: 'users', module: 'users' },
];

/**
 * The secondary sidebar, per rail area. Sections mirror the shape the app will take as
 * modules land, with each item gated on the grant that will govern it.
 */
const SIDEBARS = {
  '/': {
    title: 'Home',
    sections: [
      { title: 'Overview', items: [{ to: '/', label: 'Dashboard', end: true }] },
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
    ],
  },
};

function Icon({ name, className = 'h-[1.15rem] w-[1.15rem]' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

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
          <span className="mt-0.5 block text-[0.6875rem] font-semibold tracking-[0.12em] text-steel-500">
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

/** The module tabs across the top. Unbuilt modules read as pending, not as links. */
function TopTabs() {
  const { user } = useAuth();
  const modules = (user?.modules || []).filter((module) => module.canRead);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
      {modules.map((module) => (
        <span
          key={module.key}
          title={module.available ? module.label : `${module.label} — not built yet`}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-semibold transition-colors ${
            module.available
              ? 'text-steel-200 hover:bg-line/[0.06]'
              : 'cursor-default text-steel-500'
          }`}
        >
          {module.label}
          {!module.available && <span className="ml-1 text-[0.625rem] align-super">soon</span>}
        </span>
      ))}
    </div>
  );
}

export default function Layout() {
  const { user, logout, canRead } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const railItems = RAIL.filter((item) => !item.module || canRead(item.module));
  const sidebarKey = railItems.find(
    (item) => item.to !== '/' && location.pathname.startsWith(item.to)
  )?.to;
  const sidebar = SIDEBARS[sidebarKey || '/'];

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
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex w-[3.4rem] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[0.625rem] font-semibold transition-colors ${
                  isActive
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
            <span className="rounded bg-flame-500/15 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-flame-400">
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
            <p className="text-[0.8125rem] font-bold tracking-tight text-steel-100">
              {sidebar.title}
            </p>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
            {sidebar.sections.map((section) => {
              const items = section.items.filter((item) => !item.module || canRead(item.module));
              if (!items.length) return null;

              return (
                <div key={section.title}>
                  <p className="eyebrow mb-1.5 px-3">{section.title}</p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `relative flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] font-semibold tracking-tight transition-colors ${
                            isActive
                              ? 'bg-line/[0.07] text-steel-50'
                              : 'text-steel-400 hover:bg-line/[0.04] hover:text-steel-100'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-flame-500 transition-opacity ${
                                isActive ? 'opacity-100' : 'opacity-0'
                              }`}
                            />
                            {item.label}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-line/[0.06] px-4 py-3">
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

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-line/[0.06] bg-ink-900/80 px-4 py-2 backdrop-blur-xl">
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

            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-[0.8125rem] font-semibold leading-tight text-steel-100">
                  {user?.name}
                </p>
                <p className="text-[0.6875rem] font-medium text-steel-500">
                  {humanise(user?.department) || humanise(user?.role)}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-flame-500/15 text-[0.8125rem] font-bold text-flame-400 ring-1 ring-inset ring-flame-500/25">
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
      </div>

      {/* Bottom bar: context on the left, the utility dock on the right. */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-line/[0.06] bg-ink-850 px-3 py-1">
        <span className="hidden text-[0.6875rem] text-steel-500 sm:block">
          {user?.name} · {humanise(user?.department)}
        </span>
        <div className="ml-auto">
          <Dock />
        </div>
      </footer>
    </div>
  );
}
