import { useEffect, useState } from 'react';
import { settings } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The plant's working calendar [server: settings.service `plantCalendar`]: the press hours a
 * day and the weekly day off. Every capacity figure — pieces a day on a mould, the press days a
 * quantity needs, the day it would finish — is worked out from these.
 */
export default function PlantCalendarCard({ mayEdit = false }) {
  const [plant, setPlant] = useState(null);
  const [hours, setHours] = useState('');
  const [off, setOff] = useState('0');
  const [change, setChange] = useState('2');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  useEffect(() => {
    settings.plant().then((value) => {
      setPlant(value);
      setHours(String(value.hoursPerDay));
      setOff(value.weeklyOff == null ? 'none' : String(value.weeklyOff));
      setChange(String(value.mouldChangeHours ?? 2));
    }).catch(() => setPlant(null));
  }, []);
  if (!plant) return null;
  const changed = Number(hours) !== plant.hoursPerDay || off !== (plant.weeklyOff == null ? 'none' : String(plant.weeklyOff))
    || Number(change) !== (plant.mouldChangeHours ?? 2);
  const valid = Number(hours) >= 1 && Number(hours) <= 24 && change !== '' && Number(change) >= 0 && Number(change) <= 24;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await settings.setPlant({ hoursPerDay: Number(hours), weeklyOff: off === 'none' ? null : Number(off), mouldChangeHours: Number(change) });
      setPlant(saved);
      setMessage({ tone: 'success', text: 'Saved. Capacity and finish dates use the new hours.' });
    } catch (failure) {
      setMessage({ tone: 'danger', text: failure.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} aria-label="Plant hours" className="card space-y-3 p-4">
      <div>
        <p className="text-sm font-semibold text-steel-100">Plant hours</p>
        <p className="text-xs text-steel-400">Capacity on every mould is its pieces an hour times these press hours, skipping the day off. The mould-change hours go into which press the board suggests.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Press hours a day" hint="Two 12-hour shifts less changeovers and breaks is about 22">
          <input type="number" min="1" max="24" step="0.5" className="input" value={hours} disabled={!mayEdit} onChange={(event) => setHours(event.target.value)} />
        </Field>
        <Field label="Weekly day off">
          <select className="input" value={off} disabled={!mayEdit} onChange={(event) => setOff(event.target.value)}>
            {DAYS.map((day, index) => <option key={day} value={String(index)}>{day}</option>)}
            <option value="none">No day off</option>
          </select>
        </Field>
        <Field label="A mould change takes, hours" hint="Mould out, mould in, heat-up and first piece approved. A mould's own time wins.">
          <input type="number" min="0" max="24" step="0.25" className="input" value={change} disabled={!mayEdit} onChange={(event) => setChange(event.target.value)} />
        </Field>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {mayEdit && (
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={busy || !changed || !valid}>{busy ? 'Saving…' : 'Save plant hours'}</button>
        </div>
      )}
    </form>
  );
}
