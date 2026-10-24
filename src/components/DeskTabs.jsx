import { departmentLabel } from '../utils/pipeline.js';

/**
 * The teams of a shared desk as tabs across the top — Quality, Printing, Assembly — so each
 * team's tasks fill the screen on their own instead of being stacked one below the other
 * [utils/pipeline.js DESK_GROUPS]. Each tab carries its count of open tasks.
 */
export default function DeskTabs({ departments, counts = {}, value, onChange, label = 'Team' }) {
  return (
    <div role="tablist" aria-label={label} className="grid grid-cols-3 gap-1 rounded-xl border border-line/[0.08] bg-line/[0.02] p-1">
      {departments.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
              active ? 'fill-primary shadow-sm' : 'text-steel-300 hover:bg-line/[0.05] hover:text-steel-100'
            }`}
          >
            <span className="truncate">{departmentLabel(key)}</span>
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-black/15' : 'bg-line/[0.08] text-steel-400'}`}>{counts[key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The tab a shared desk opens on: the person's own team where they are in one, else the first. */
export const firstDeskTab = (desk, departments = []) => departments.find((key) => desk.includes(key)) || desk[0];
