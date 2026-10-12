import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatchPlanning } from '../api/endpoints.js';
import { Modal, Spinner } from './ui.jsx';

/**
 * Suggest trips [server: dispatchPlanning.service `suggestTrips`]: every ready group made into a
 * draft trip in one press — one per transporter, our own groups given a vehicle in turn. Untick
 * what should not go, change a vehicle, pick the day, press Make. Nothing is saved before that.
 */

const indiaDay = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));

export default function SuggestTrips({ open, onClose, onMade }) {
  const [draft, setDraft] = useState(null);
  const [rows, setRows] = useState([]);
  const [day, setDay] = useState('tomorrow');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDraft(null); setResult(null); setProblem(null); setDay('tomorrow');
    dispatchPlanning.suggest()
      .then((data) => { setDraft(data); setRows(data.trips.map((trip) => ({ ...trip, picked: true, vehicleId: trip.vehicle?._id || '' }))); })
      .catch((failure) => setProblem(failure.message));
  }, [open]);

  const picked = rows.filter((row) => row.picked);
  const change = (index, patch) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const make = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await dispatchPlanning.makeSuggested({
        date: day === 'today' ? indiaDay() : indiaDay(1),
        trips: picked.map((row) => ({
          tasks: row.stops.map((stop) => String(stop.task)),
          mode: row.mode,
          vehicle: row.mode === 'own_vehicle' ? row.vehicleId || undefined : undefined,
          transporter: row.transporter?._id,
          ...(row.mode === 'own_vehicle' && !row.vehicleId ? { driverName: 'To be decided' } : {}),
        })),
      });
      setResult(answer.data);
      onMade();
    } catch (failure) {
      setProblem(failure.details?.refused?.[0]?.message || failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Suggested trips" description="Every ready group as a trip. Untick what should not go, change a vehicle, then make them.">
      {!draft && !problem && <Spinner label="Working out the trips" />}
      {problem && <p role="alert" className="text-sm text-danger-400">{problem}</p>}

      {result ? (
        <div className="space-y-3">
          <p className="text-sm text-steel-200">{result.made.length} {result.made.length === 1 ? 'trip' : 'trips'} made:</p>
          <ul className="flex flex-wrap gap-2">
            {result.made.map((trip) => <li key={trip._id}><Link to={`/dispatch/trips/${trip._id}`} className="btn-secondary px-3 py-1 text-sm" onClick={onClose}>{trip.number}</Link></li>)}
          </ul>
          {result.refused.length > 0 && (
            <ul className="space-y-1 text-sm text-warn-400">{result.refused.map((row, index) => <li key={index}>Not made: {row.message}</li>)}</ul>
          )}
          <div className="flex justify-end"><button type="button" className="btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : draft && (
        <div className="space-y-4">
          {!draft.trips.length ? (
            <p className="text-sm text-steel-300">Nothing ready to put on a trip right now.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Which day">
                {[['today', 'Today'], ['tomorrow', 'Tomorrow']].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={day === key} onClick={() => setDay(key)}
                    className={`rounded-full border px-3 py-1 text-sm font-semibold ${day === key ? 'border-accent bg-accent/15 text-accent' : 'border-line/[0.12] text-steel-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {rows.map((row, index) => (
                  <li key={row.key} className={`rounded-xl border p-3 ${row.picked ? 'border-accent/40' : 'border-line/[0.08] opacity-60'}`}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-flame-500" checked={row.picked} onChange={(event) => change(index, { picked: event.target.checked })} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-steel-50">{row.label}</span>
                        <span className="block text-xs text-steel-400">{row.modeLabel} · {row.stops.length} {row.stops.length === 1 ? 'stop' : 'stops'}: {row.stops.map((stop) => stop.customer?.name).filter(Boolean).join(', ')}</span>
                      </span>
                    </label>
                    {row.mode === 'own_vehicle' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <select className="input w-auto py-1 text-sm" value={row.vehicleId} onChange={(event) => change(index, { vehicleId: event.target.value })} aria-label={`Vehicle for ${row.label}`}>
                          <option value="">Vehicle to be decided</option>
                          {draft.vehicles.map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.number}{vehicle.kind ? ` · ${vehicle.kind}` : ''}</option>)}
                        </select>
                        {row.run > 1 && <span className="text-xs text-warn-400">{row.run === 2 ? 'Second run' : `Run ${row.run}`} for this vehicle</span>}
                      </div>
                    )}
                    {row.mode === 'transport' && row.transporter && <p className="mt-1 pl-6 text-xs text-steel-400">{row.transporter.name}{row.transporter.bookingOffice ? ` · ${row.transporter.bookingOffice}` : ''}</p>}
                  </li>
                ))}
              </ul>
              {draft.leftOut > 0 && <p className="text-xs text-warn-400">{draft.leftOut} {draft.leftOut === 1 ? 'request is' : 'requests are'} left out until their delivery details are filled in.</p>}
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            {draft.trips.length > 0 && (
              <button type="button" className="btn-primary" disabled={!picked.length || busy} onClick={make}>
                {busy ? 'Making…' : `Make ${picked.length} ${picked.length === 1 ? 'trip' : 'trips'}`}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
