import { useEffect, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { Field, Notice, Spinner } from './ui.jsx';
import { CheckLine, PhotoSlot } from './SamplePhotos.jsx';
import { shrinkImage } from '../utils/shrinkImage.js';
import { text } from '../utils/pipeline.js';

/** The shortest reason the server takes for going without a photo [server: BACKWARD_REASON_MIN]. */
const REASON_MIN = 5;

/**
 * The Sample Ready move, with the camera in it [server: setSampleStatus; the sampling audit,
 * item 1]. One slot per model row, camera or gallery, retake allowed; the move is refused
 * without a photo on each row unless the bench ticks No photo and says why — so the rule is
 * firm without holding a piece that is already in the bag.
 *
 * Each photo is uploaded the moment it is chosen, onto the row, so a form abandoned halfway
 * has lost nothing. Reached from the sample's own page and from the work queue's dropdown.
 */
export default function SampleReadyForm({ sample: given, sampleId, onClose, onSaved }) {
  const [sample, setSample] = useState(given || null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');
  const [noPhoto, setNoPhoto] = useState(false);
  const [reason, setReason] = useState('');
  /* A difference the check found: stepped past out loud, with a reason on the move [server: checkOverride]. */
  const [checked, setChecked] = useState(false);
  const [checkReason, setCheckReason] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (given || !sampleId) return undefined;
    let cancelled = false;
    samplesApi.get(sampleId)
      .then((loaded) => !cancelled && setSample(loaded))
      .catch((fetchError) => !cancelled && setLoadError(fetchError.message));
    return () => { cancelled = true; };
  }, [given, sampleId]);

  if (loadError) return <Notice tone="danger">{loadError}</Notice>;
  if (!sample) return <Spinner label="Loading the bag" />;

  const rows = sample.items?.length ? sample.items : [];
  const missing = rows.filter((row) => !row.photo?.key);
  const reasonShort = noPhoto && reason.trim().length < REASON_MIN;
  const flagged = rows.filter((row) => row.check?.verdict === 'differs' && !row.checkAccepted?.reason);
  const checkShort = checked && checkReason.trim().length < REASON_MIN;
  const blocked = (missing.length > 0 && (!noPhoto || reasonShort)) || (flagged.length > 0 && (!checked || checkShort));

  const photo = async (row, file) => {
    setBusy(row._id);
    setError(null);
    try {
      setSample(await samplesApi.setItemPhoto({ id: sample._id, itemId: row._id, photo: await shrinkImage(file) }));
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(null);
    }
  };

  const clear = async (row) => {
    setBusy(row._id);
    setError(null);
    try {
      setSample(await samplesApi.clearItemPhoto({ id: sample._id, itemId: row._id }));
    } catch (clearError) {
      setError(clearError.message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (blocked) return;
    setBusy('move');
    setError(null);
    try {
      onSaved(await samplesApi.setStatus({
        id: sample._id,
        expectedUpdatedAt: sample.updatedAt,
        status: 'sample_ready',
        note: text(note),
        ...(missing.length ? { noPhoto: true, noPhotoReason: reason.trim() } : {}),
        ...(flagged.length ? { checkOverride: true, checkOverrideReason: checkReason.trim() } : {}),
      }));
      onClose();
    } catch (moveError) {
      setError(moveError.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Sample ready — photos of the finished pieces">
      <p className="text-sm text-steel-400">
        A photo of each finished piece goes with the sample from here: to marketing, to the buyer's
        message, to the enquiry and to the order check.
      </p>

      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={row._id || index} className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-3">
              <p className="mb-2 text-sm font-semibold text-steel-100">
                {rows.length > 1 && <span className="mr-2 rounded-md bg-flame-500/15 px-1.5 py-0.5 text-xs font-bold text-flame-400">{index + 1}</span>}
                {row.modelNumber || row.mould?.name || `Item ${index + 1}`}
                {row.colour && <span className="ml-2 text-xs font-normal text-steel-400">{row.colour}</span>}
                {row.quantity ? <span className="ml-2 text-xs font-normal text-steel-500">{row.quantity} pc</span> : null}
              </p>
              <PhotoSlot
                label="Finished piece"
                photo={row.photo}
                mayEdit
                capture="environment"
                busy={busy === row._id}
                emptyText="Camera or gallery"
                onPick={(file) => photo(row, file)}
                onClear={() => clear(row)}
                onOpen={() => {}}
              />
              <CheckLine row={row} />
            </li>
          ))}
        </ol>
      ) : (
        <Notice tone="info">This request names no model rows, so there is nothing to photograph.</Notice>
      )}

      {missing.length > 0 && (
        <div className="rounded-lg border border-warn-500/30 bg-warn-500/[0.06] p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-flame-500" checked={noPhoto} onChange={(event) => setNoPhoto(event.target.checked)} />
            <span>
              <span className="font-semibold text-steel-100">No photo for {missing.map((row) => row.modelNumber || 'a piece').join(', ')}</span>
              <span className="block text-xs text-steel-400">Allowed with a reason, which stays on the record beside this move.</span>
            </span>
          </label>
          {noPhoto && (
            <div className="mt-2">
              <Field label="Why no photo?" required hint={`At least ${REASON_MIN} characters`}>
                <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Pieces already bagged and sealed" aria-label="Why no photo" />
              </Field>
            </div>
          )}
        </div>
      )}

      {flagged.length > 0 && (
        <div className="rounded-lg border border-warn-500/30 bg-warn-500/[0.06] p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-flame-500" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            <span>
              <span className="font-semibold text-steel-100">Checked — {flagged.map((row) => row.modelNumber || 'a piece').join(', ')} goes as it is</span>
              <span className="block text-xs text-steel-400">The check found a difference. Retake the piece, or say why it goes anyway; marketing sees the note on the dispatch draft.</span>
            </span>
          </label>
          {checked && (
            <div className="mt-2">
              <Field label="Why it goes as it is" required hint={`At least ${REASON_MIN} characters`}>
                <input className="input" value={checkReason} onChange={(event) => setCheckReason(event.target.value)} placeholder="Buyer agreed the darker shade on the phone" aria-label="Why it goes as it is" />
              </Field>
            </div>
          )}
        </div>
      )}

      <Field label="Note" hint="Optional — recorded against this move in the stage history">
        <textarea rows={2} className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
      </Field>

      {error && <Notice tone="danger">{error}</Notice>}

      <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
        <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        <button type="submit" className="btn-primary" disabled={blocked || Boolean(busy)}>
          {busy === 'move' ? 'Saving…' : 'Mark Sample Ready'}
        </button>
      </div>
    </form>
  );
}
