import { useEffect, useState } from 'react';
import { settings } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Notice } from './ui.jsx';
import { rememberPlant } from '../utils/plantSettings.js';

/**
 * Production floor planning — Admin's switch [server: settings.service `setFloorPlanning`]. Off,
 * the Production tasks run as they always have: routed to Printing and Assembly, statuses moved by
 * hand. On, each routed model gets a work order, is put on a press from its task, needs its first
 * piece approved on the floor tablet before the run, and the plan and the runs move its status.
 */
export default function FloorPlanningCard() {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => { settings.plant().then((value) => setOn(Boolean(value?.floorPlanning))).catch(() => {}); }, []);
  if (!isAdmin || on === null) return null;
  const flip = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const plant = await settings.setFloorPlanning(!on);
      rememberPlant(plant);
      setOn(Boolean(plant.floorPlanning));
      setMessage({ tone: 'success', text: plant.floorPlanning ? 'On — each routed model now gets a work order and is planned on a press from its Production task.' : 'Off — Production tasks run as before; nothing new is linked.' });
    } catch (failure) {
      setMessage({ tone: 'danger', text: failure.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Production floor planning" className="card mt-5 space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-steel-100">Production floor planning</p>
          <p className="mt-1 text-xs text-steel-400">
            {on
              ? 'On. Each model Production routes gets a work order and a press step on its task. Putting it on a press reads Planning, its first run Production Started, its pieces made Production Completed. The floor tablet asks for the first piece before a run.'
              : 'Off. Production tasks run as they always have — routed to Printing and Assembly, statuses moved by hand. Turn it on to link the tasks to work orders, presses, the planning board and the floor tablet.'}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={flip}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${on ? 'bg-accent' : 'bg-line/[0.15]'}`}>
          <span className="sr-only">Production floor planning</span>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </section>
  );
}
