import { useEffect, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { Field, Notice } from './ui.jsx';
import { numeric, text } from '../utils/pipeline.js';
import { todayInIndia } from '../utils/taskForm.js';

/**
 * Putting the sample in the buyer's hands without a courier — the marketing person on a visit,
 * from the sample rack or with a piece the bench made [server: sample.controller `handOverSample`].
 * Who received it, how many pieces, when, and a photo of it or of the signed slip.
 */
export default function SampleHandOverForm({ sample, onClose, onSaved }) {
  const [values, setValues] = useState({
    receivedBy: '', phone: '', pieces: String(sample.quantity ?? ''), handedAt: todayInIndia(), note: '',
  });
  /* What the rack holds of this model, so the last piece is not taken unknowingly [components/SampleRack.jsx]. */
  const [rack, setRack] = useState(null);
  useEffect(() => {
    if (sample.handover !== 'in_person') return undefined;
    let cancelled = false;
    samplesApi.rack()
      .then((response) => {
        if (cancelled) return;
        const key = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const rows = sample.items?.length ? sample.items : [sample];
        setRack(rows.map((row) => {
          const line = (response.data || []).find((entry) => key(entry.modelNumber) === key(row.modelNumber) && key(entry.colour) === key(row.colour))
            || (response.data || []).find((entry) => key(entry.modelNumber) === key(row.modelNumber));
          return { model: row.modelNumber, pieces: line ? line.pieces : null };
        }).filter((entry) => entry.model));
      })
      .catch(() => !cancelled && setRack([]));
    return () => { cancelled = true; };
  }, [sample]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const phoneOk = !values.phone || /^\+?\d{10,13}$/.test(values.phone.replace(/\s/g, ''));
  const named = values.receivedBy.trim() || values.phone.trim();
  const tooBig = photo && photo.size > 8 * 1024 * 1024;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await samplesApi.handOver({
        id: sample._id,
        receivedBy: text(values.receivedBy),
        phone: text(values.phone.replace(/\s/g, '')),
        pieces: numeric(values.pieces),
        handedAt: text(values.handedAt),
        note: text(values.note),
        photo: photo || undefined,
      }));
      onClose();
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Hand over to the buyer">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Received by" hint="The buyer's name, or whoever took it for them">
          <input className="input" value={values.receivedBy} onChange={set('receivedBy')} placeholder="Mr Ravi, purchase" autoFocus />
        </Field>
        <Field label="Their phone" error={phoneOk ? undefined : { message: 'A 10-digit mobile number' }}>
          <input className="input" inputMode="tel" value={values.phone} onChange={set('phone')} placeholder="98xxxxxxxx" />
        </Field>
        <Field label="Pieces handed over">
          <input type="number" min="1" className="input" value={values.pieces} onChange={set('pieces')} />
        </Field>
        <Field label="Handed over on">
          <input type="date" className="input" max={todayInIndia()} value={values.handedAt} onChange={set('handedAt')} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <textarea rows={2} className="input" value={values.note} onChange={set('note')} placeholder="Models shown, what they said on the spot" />
        </Field>
        <Field label="Photo of the hand-over or the signed slip" className="sm:col-span-2" hint="JPEG, PNG or PDF, up to 8 MB">
          <input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" className="input" aria-label="Hand-over photo" onChange={(event) => setPhoto(event.target.files?.[0] || null)} />
        </Field>
      </div>
      {tooBig && <Notice tone="warn">That file is over 8 MB — take a smaller photo.</Notice>}
      {rack?.length > 0 && (
        <p className="text-xs text-steel-400" aria-label="On the rack">
          On the rack: {rack.map((entry) => `${entry.model} ${entry.pieces === null ? 'not listed' : `${entry.pieces} pc`}`).join(' · ')}
          {rack.some((entry) => entry.pieces === 0) ? ' — the rack is empty for one of these; the bench will need to top it up' : ' — the pieces handed over come off it'}
        </p>
      )}
      <Notice tone="info">The sample is marked Delivered, the enquiry moves to feedback, and you record what the buyer says next.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || !named || !phoneOk || tooBig}>
          {busy ? 'Saving…' : 'Record the hand-over'}
        </button>
      </div>
    </form>
  );
}
