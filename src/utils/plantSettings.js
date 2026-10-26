import { settings } from '../api/endpoints.js';

/**
 * The plant's settings, read once and kept for the session [server: settings.service
 * `plantCalendar`] — what a form needs to start from without asking again: the days each
 * finishing team gets before the EDD, the mould-change hours.
 */
let plant = null;
let loading = null;

export function loadPlant() {
  if (plant || loading) return loading || Promise.resolve(plant);
  loading = settings.plant().then((value) => { plant = value || {}; return plant; }).catch(() => { loading = null; return null; });
  return loading;
}

/** Days each finishing team gets before the EDD — the plant's, else five. */
export const plantLead = () => Number(plant?.handoverLeadDays) || 5;

/* Screens that follow a setting as it changes — the bar hides the Production floor when Admin turns floor planning off. */
const listeners = new Set();
export const onPlantChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Kept fresh after somebody changes it here — and whoever follows it is told. */
export const rememberPlant = (value) => {
  plant = value || plant;
  for (const listener of listeners) listener(plant);
};
