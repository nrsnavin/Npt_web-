import { useEffect, useState } from 'react';
import { settings } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Notice } from './ui.jsx';
import { rememberPlant } from '../utils/plantSettings.js';

/**
 * The days each finishing team gets before the EDD [server: settings.service `setHandoverLead`]:
 * a model printed and assembled goes to Printing twice this before the EDD and to Assembly once;
 * printed or assembled only, once. Every hand-over date form starts from it, and anyone giving
 * the date may still change it there. The Production in charge, Admin or marketing set it.
 */
export default function HandoverLeadCard() {
  const { mayPlanProduction, departments = [] } = useAuth();
  const mayEdit = mayPlanProduction || departments.includes('marketing');
  const [saved, setSaved] = useState(null);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    settings.plant().then((value) => { setSaved(value?.handoverLeadDays || 5); setDays(String(value?.handoverLeadDays || 5)); }).catch(() => {});
  }, []);
  if (!saved || !mayEdit) return null;
  const value = Number(days);
  const valid = Number.isInteger(value) && value >= 1 && value <= 30;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const plant = await settings.setHandoverLead(value);
      rememberPlant(plant);
      setSaved(plant.handoverLeadDays);
      setMessage({ tone: 'success', text: `Saved — printed and assembled: to Printing ${plant.handoverLeadDays * 2} days and to Assembly ${plant.handoverLeadDays} days before the EDD.` });
    } catch (failure) {
      setMessage({ tone: 'danger', text: failure.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label="Hand-over days" className="card mt-5 space-y-3 p-5">
      <div>
        <p className="text-sm font-semibold text-steel-100">Hand-over days before the EDD</p>
        <p className="text-xs text-steel-400">The days each finishing team gets. Printed and assembled: to Printing {(valid ? value : saved) * 2} days before the EDD, to Assembly {valid ? value : saved}. Printed or assembled only: {valid ? value : saved}. Each date can still be changed on the task.</p>
      </div>
      <Field label="Days for each team">
        <input type="number" min="1" max="30" className="input w-32" value={days} onChange={(event) => setDays(event.target.value)} />
      </Field>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy || !valid || value === saved}>{busy ? 'Saving…' : 'Save hand-over days'}</button>
      </div>
    </form>
  );
}
