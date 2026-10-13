import { useEffect, useRef, useState } from 'react';

/**
 * A button that opens a short list of choices under it — the "⋯" on a task card, "+ Raise a
 * task" on the enquiry. Items may be grouped under headings; choosing one closes the menu.
 * Closes on a click anywhere else and on Escape, and the trigger says it is a menu.
 *
 *   <Menu label="Raise a task" items={[{ key, label, hint, group, onSelect }]} />
 */
export default function Menu({ label, items, align = 'left', className = '', buttonClassName = 'btn-secondary px-3 py-1.5 text-xs', srLabel }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  if (!items?.length) return null;

  const groups = [];
  for (const item of items) {
    const name = item.group || '';
    let group = groups.find((entry) => entry.name === name);
    if (!group) groups.push((group = { name, items: [] }));
    group.items.push(item);
  }

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={srLabel}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 max-h-[22rem] min-w-[14rem] overflow-y-auto rounded-xl border border-line/10 bg-ink-850 p-1.5 shadow-modal ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {groups.map((group) => (
            <div key={group.name} className="[&+&]:mt-1 [&+&]:border-t [&+&]:border-line/[0.06] [&+&]:pt-1">
              {group.name && <p className="px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-steel-500">{group.name}</p>}
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  title={item.hint}
                  disabled={item.disabled}
                  className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-line/[0.06] disabled:opacity-50 ${item.danger ? 'text-danger-400' : 'text-steel-100'}`}
                  onClick={() => { setOpen(false); item.onSelect?.(); }}
                >
                  <span className="font-semibold">{item.label}</span>
                  {item.hint && <span className="text-xs text-steel-500">{item.hint}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
