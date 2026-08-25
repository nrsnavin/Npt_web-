import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { humanise } from '../utils/format.js';

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: '📊', end: true }],
  },
  {
    title: 'CRM',
    items: [
      { to: '/leads', label: 'Leads', icon: '🎯' },
      { to: '/customers', label: 'Customers', icon: '🏢' },
      { to: '/quotations', label: 'Quotations', icon: '📝' },
    ],
  },
  {
    title: 'Sales',
    items: [{ to: '/sales-orders', label: 'Sales Orders', icon: '📦' }],
  },
  {
    title: 'Manufacturing',
    items: [
      { to: '/production', label: 'Production', icon: '🏭' },
      { to: '/products', label: 'Hanger Catalogue', icon: '🪝' },
    ],
  },
  {
    title: 'Supply chain',
    items: [
      { to: '/materials', label: 'Raw Materials', icon: '⚗️' },
      { to: '/purchase-orders', label: 'Purchase Orders', icon: '🛒' },
      { to: '/suppliers', label: 'Suppliers', icon: '🚚' },
    ],
  },
];

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive ? 'bg-brand-600 font-medium text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto bg-slate-900 px-4 py-5 transition-transform lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-white">NPT Hangers</p>
          <p className="text-xs text-slate-400">CRM &amp; ERP</p>
        </div>

        <nav className="space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavItem key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 lg:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{humanise(user?.role)}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <button type="button" className="btn-secondary" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
