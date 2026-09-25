import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { views as viewsApi } from '../api/endpoints.js';
import { viewHref } from '../utils/views.js';

/** Said when a view is saved or removed anywhere, so the sidebar shows it at once. */
export const VIEWS_CHANGED = 'npt:views-changed';
export const announceViewsChanged = () => window.dispatchEvent(new Event(VIEWS_CHANGED));

/**
 * The person's saved views, at the foot of the sidebar — "My unanswered", "Despatch this week".
 *
 * A view is a link to the list with its filters in the address, so it opens the same way a
 * shared link would, and the list decides what the person may see as it always does.
 */
export default function SavedViewsNav() {
  const [list, setList] = useState([]);
  const location = useLocation();

  const load = useCallback(() => {
    viewsApi.list().then((rows) => setList((rows || []).filter((view) => view.pinned))).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(VIEWS_CHANGED, load);
    return () => window.removeEventListener(VIEWS_CHANGED, load);
  }, [load]);

  if (!list.length) return null;
  const here = `${location.pathname}${location.search}`;

  return (
    <div>
      <p className="eyebrow mb-1.5 px-3">My views</p>
      <ul className="space-y-0.5">
        {list.map((view) => {
          const href = viewHref(view);
          const lit = here === href;
          return (
            <li key={view._id} className="group/view relative">
              <NavLink
                to={href}
                className={`relative flex items-center gap-2 rounded-lg py-2 pl-3 pr-7 text-xs font-semibold tracking-tight transition-colors ${
                  lit ? 'bg-line/[0.07] text-steel-50' : 'text-steel-400 hover:bg-line/[0.04] hover:text-steel-100'
                }`}
              >
                <span aria-hidden className="text-flame-400">★</span>
                <span className="min-w-0 truncate">{view.name}</span>
              </NavLink>
              <button
                type="button"
                aria-label={`Remove the view ${view.name}`}
                onClick={() => viewsApi.remove(view._id).then(announceViewsChanged).catch(() => {})}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-steel-500 opacity-0 transition-opacity hover:text-danger-400 focus:opacity-100 group-hover/view:opacity-100"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
