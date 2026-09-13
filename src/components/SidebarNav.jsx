import { useCallback, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/**
 * The sidebar's groups, as things that open and shut.
 *
 * A flat wall of links is only navigable while it is short. Once every module is in one column
 * it stops being a menu and becomes a list to read: nothing tells you where one area ends and
 * the next begins, every entry carries the same weight, and finding "Quality report" means
 * scanning twenty labels that all look alike. That is the complaint — it reads blunt — and the
 * fix is not smaller text, it is structure you can put away.
 *
 * Two levels, because the nav has two:
 *
 *   **Sections** — "Before the order", "Masters". The band of the business you are working in.
 *
 *   **A module with screens under it** — Quality and its report, Sampling and its two boards.
 *   These were siblings in a flat list, which said they were peers when one is plainly inside
 *   the other. Nested and collapsible, the parent reads as the thing and the rest as its views.
 *
 * Three rules make it behave rather than merely animate:
 *
 * **What you are looking at is never hidden.** A group holding the current page opens itself,
 * whatever was remembered. Collapse "Before the order", navigate to an order from a search
 * result, and a sidebar that stayed shut would show a nav with nothing lit — which reads as a
 * broken screen, not as a tidy one.
 *
 * **Shut is remembered, per browser.** Which areas somebody works in is a standing preference,
 * not state to rediscover every morning.
 *
 * **Open is the default.** A nav that starts closed hides the application from whoever has just
 * been given an account, and they have no idea what they are missing.
 */

const STORE_KEY = 'npt.sidebar';

const readStored = () => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    /* A private window, cleared site data, storage blocked — all fine. Everything opens. */
    return new Set();
  }
};

const store = (shut) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...shut]));
  } catch {
    /* Not being able to remember a preference is not worth failing a render over. */
  }
};

/**
 * Whether a route is the one being looked at.
 *
 * `end` means exactly this path and no deeper — the same flag `NavLink` takes, and it is on the
 * items that have children beneath them: without it Quality stays lit while its report is open,
 * and two entries claim to be the current page at once.
 */
const isActive = (pathname, to, end) =>
  end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

/** A caret that points down when open. One glyph, rotated, so the two states are the same mark. */
function Caret({ open }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * The open/shut animation.
 *
 * `grid-template-rows: 0fr → 1fr` rather than a measured pixel height: it animates content of
 * any length without JavaScript reading the DOM, and it cannot disagree with the real height the
 * way a hard-coded `max-height` does when somebody's grants add a row.
 */
function Collapsible({ open, id, children }) {
  return (
    <div
      id={id}
      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      {/*
        `min-h-0` so the row can actually collapse to nothing — a grid child's default
        `min-height: auto` refuses to shrink below its content and the animation does nothing.

        `invisible` is the half that matters and is easy to miss: a zero-height box still holds
        its links in the page, so without it a collapsed group is hidden from the eye and not
        from the keyboard — tab through the sidebar and the focus ring walks into a group that
        is not on screen, and a screen reader reads out a nav somebody has put away.
        `visibility: hidden` takes them out of the tab order and out of the accessibility tree
        while still allowing the height to animate, which `display: none` would not.

        Nothing is set when open, rather than `visible`. `visibility` inherits, and a descendant
        that declares `visible` un-hides itself from a hidden ancestor — which is exactly this
        component's shape: shutting a whole section left the nested children of every module
        inside it on screen, because each of those had said `visible` for itself.
      */}
      <div className={`min-h-0 overflow-hidden ${open ? '' : 'invisible'}`}>{children}</div>
    </div>
  );
}

/** One link. The bar on the left is the lit marker; it is drawn always and faded when inactive. */
function Item({ item, depth = 0 }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive: lit }) =>
        `relative flex items-center gap-2 rounded-lg py-2 pr-3 text-xs font-semibold tracking-tight transition-colors ${
          depth ? 'pl-6' : 'pl-3'
        } ${lit ? 'bg-line/[0.07] text-steel-50' : 'text-steel-400 hover:bg-line/[0.04] hover:text-steel-100'}`
      }
    >
      {({ isActive: lit }) => (
        <>
          <span
            className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-flame-500 transition-opacity ${
              lit ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

/**
 * A module with screens beneath it.
 *
 * The parent is both a link and a disclosure, and they are two controls rather than one: making
 * the whole row toggle would mean you cannot reach Quality without also opening it, and making
 * the whole row navigate would mean you cannot put it away. So the label goes to the page and
 * the caret opens the list — which is the arrangement every file tree has settled on.
 */
function Parent({ item, shut, toggle, pathname }) {
  const key = `i:${item.to}`;
  const holdsCurrent =
    isActive(pathname, item.to, item.end) ||
    item.children.some((child) => isActive(pathname, child.to, child.end));

  /* Forced open while it holds the current page — see the note at the top of the file. */
  const open = holdsCurrent || !shut.has(key);
  const id = `nav-${item.to.replace(/\W+/g, '-')}`;

  return (
    <div>
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">
          <Item item={item} />
        </div>
        <button
          type="button"
          onClick={() => toggle(key)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? 'Hide' : 'Show'} what is under ${item.label}`}
          /* Disabled rather than hidden while it holds the current page: a control that
             vanishes as you navigate is a control people stop trusting. */
          disabled={holdsCurrent}
          className="flex w-7 shrink-0 items-center justify-center rounded-lg text-steel-500 transition-colors hover:text-steel-100 disabled:opacity-30 disabled:hover:text-steel-500"
        >
          <Caret open={open} />
        </button>
      </div>

      <Collapsible open={open} id={id}>
        {/* A rule down the left, so the indent reads as containment rather than as a margin
            somebody got wrong. */}
        <div className="ml-3 space-y-0.5 border-l border-line/[0.14] pt-0.5">
          {item.children.map((child) => (
            <Item key={child.to} item={child} depth={1} />
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

/**
 * One section of the nav.
 *
 * Collapsible only when it holds more than one thing. A disclosure control that puts away a
 * single link is chrome pretending to be a feature, and the row it adds costs more than the row
 * it saves.
 */
function Section({ section, scope, shut, toggle, pathname }) {
  const key = `s:${scope}:${section.title}`;

  const holdsCurrent = section.items.some(
    (item) =>
      isActive(pathname, item.to, item.end) ||
      (item.children || []).some((child) => isActive(pathname, child.to, child.end))
  );

  const collapsible = section.items.length > 1;
  const open = !collapsible || holdsCurrent || !shut.has(key);
  const id = `nav-section-${scope.replace(/\W+/g, '-')}-${section.title.replace(/\W+/g, '-')}`;

  const body = (
    <div className="space-y-0.5">
      {section.items.map((item) =>
        item.children?.length ? (
          <Parent key={item.to} item={item} shut={shut} toggle={toggle} pathname={pathname} />
        ) : (
          <Item key={item.to} item={item} />
        )
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <div>
        <p className="eyebrow mb-1.5 px-3">{section.title}</p>
        {body}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(key)}
        aria-expanded={open}
        aria-controls={id}
        disabled={holdsCurrent}
        className="eyebrow mb-1.5 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1 text-left transition-colors hover:text-steel-200 disabled:cursor-default"
      >
        <span className="truncate">{section.title}</span>
        {/* Drawn even while it refuses to shut, dimmed, exactly as the module carets are. A
            control that disappears on the one group you are working in makes that group look
            like a different kind of thing, and the reader has to work out which. */}
        <span className={holdsCurrent ? 'opacity-30' : ''}>
          <Caret open={open} />
        </span>
      </button>

      <Collapsible open={open} id={id}>
        {body}
      </Collapsible>
    </div>
  );
}

/**
 * The whole thing.
 *
 * `sections` are already filtered by the caller's grants — what somebody may read is the
 * Layout's business, and a nav that decided it too would be a second access rule to keep in
 * step with the first.
 */
export default function SidebarNav({ sections, scope = 'nav' }) {
  const { pathname } = useLocation();
  const [shut, setShut] = useState(readStored);

  const toggle = useCallback((key) => {
    setShut((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      store(next);
      return next;
    });
  }, []);

  const visible = useMemo(() => sections.filter((section) => section.items.length), [sections]);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
      {visible.map((section) => (
        <Section
          key={section.title}
          section={section}
          scope={scope}
          shut={shut}
          toggle={toggle}
          pathname={pathname}
        />
      ))}
    </nav>
  );
}
