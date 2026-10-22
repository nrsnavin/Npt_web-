import { useRef, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { Modal, Notice, Section } from './ui.jsx';
import AuthedImage from './AuthedImage.jsx';
import { shrinkImage } from '../utils/shrinkImage.js';
import { formatDate } from '../utils/format.js';

/**
 * The two pictures on each model row of a sample [server: Sample items `photo`,
 * `referencePhoto`; the sampling audit, items 1 and 2]: the buyer's reference for that model
 * on the left, the finished piece the bench photographed on the right. Side by side is the
 * point — the buyer approves a piece everybody can see again, and the order check compares a
 * picture with a picture rather than a word with a word.
 *
 * Who edits which: the bench takes the finished piece (`mayBench`); marketing, who spoke to
 * the buyer, adds the reference (`mayReference`) — the bench may too. Each slot holds one
 * photo, replaced rather than accumulated. Phone photos are shrunk in the browser first
 * [utils/shrinkImage.js].
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

/** One slot: the picture, or an invitation to add it; replace and remove beside it. */
export function PhotoSlot({ label, photo, mayEdit, busy, onPick, onClear, onOpen, capture, emptyText }) {
  const input = useRef(null);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-steel-500">{label}</p>
      <div className="mt-1 flex items-start gap-3">
        <button
          type="button"
          onClick={photo?.key ? onOpen : () => input.current?.click()}
          disabled={!photo?.key && (!mayEdit || busy)}
          className="h-24 w-28 shrink-0 overflow-hidden rounded-lg border border-line/[0.08] bg-line/[0.03] transition-opacity hover:opacity-90 disabled:cursor-default disabled:hover:opacity-100"
          aria-label={photo?.key ? `Open the ${label.toLowerCase()} full size` : `Add the ${label.toLowerCase()}`}
        >
          {photo?.key ? (
            <AuthedImage attachmentKey={photo.key} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center px-2 text-center text-[0.75rem] text-steel-500">
              {busy ? 'Uploading…' : emptyText || 'No photo'}
            </span>
          )}
        </button>
        {mayEdit && (
          <div className="flex flex-col gap-1.5">
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              capture={capture}
              className="sr-only"
              aria-label={`${label} file`}
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) onPick(chosen);
                /* Cleared so retaking the same photo still fires a change. */
                event.target.value = '';
              }}
            />
            <button type="button" className="row-action" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Uploading…' : photo?.key ? 'Retake' : capture ? 'Take photo' : 'Add photo'}
            </button>
            {photo?.key && (
              <button type="button" className="row-action-danger" disabled={busy} onClick={onClear}>Remove</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** What the check said about a finished piece — a line under the photo, never a gate [server: checkFinishedPiece]. */
export function CheckLine({ row }) {
  const check = row.check;
  if (!check?.verdict) return null;
  const tone = check.verdict === 'matches' ? 'text-success-400' : check.verdict === 'differs' ? 'text-warn-400' : 'text-steel-400';
  return (
    <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${check.verdict === 'differs' ? 'border-warn-500/40 bg-warn-500/[0.06]' : 'border-line/[0.08]'}`} role={check.verdict === 'differs' ? 'alert' : undefined}>
      <p className={`font-semibold ${tone}`}>
        {check.verdict === 'matches' ? 'Checked: matches the reference' : check.verdict === 'differs' ? 'Checked: a difference' : 'Checked: unsure'}
        {check.summary ? ` — ${check.summary}` : ''}
      </p>
      {check.findings?.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-steel-300">
          {check.findings.map((finding) => <li key={finding}>{finding}</li>)}
        </ul>
      )}
      {row.checkAccepted?.reason && <p className="mt-1 text-steel-400">Sent as it is: {row.checkAccepted.reason}</p>}
    </div>
  );
}

/**
 * The buyer's photo matched to the register [server: matchItemPhoto]: the three nearest models with
 * a confidence each, or "not one of ours" with what the model saw. Tapping one fills the model —
 * the person's choice; nothing is filled in by itself.
 */
function MatchPanel({ sample, row, mayPick, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const match = row.match;
  const hasReference = Boolean(row.referencePhoto?.key || sample.referencePhoto?.key);
  if (!hasReference || (row.mould && !match)) return null;

  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await work());
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-line/[0.08] px-2.5 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-steel-200">{row.mould ? 'Matched to the register' : 'Which model is this?'}</p>
        <button type="button" className="row-action" disabled={busy} onClick={() => run(() => samplesApi.matchItemPhoto({ id: sample._id, itemId: row._id, fresh: Boolean(match) }))}>
          {busy ? 'Matching…' : match ? 'Match again' : 'Match to the register'}
        </button>
      </div>
      {match?.problem && <p className="mt-1 text-steel-400">{match.problem}</p>}
      {match && !match.problem && (
        <>
          {match.seen && (
            <p className="mt-1 text-steel-400">
              Seen: {[match.seen.shape, match.seen.size && `${match.seen.size} mm`, match.seen.hook && `${match.seen.hook} hook`, match.seen.print, match.seen.colour].filter(Boolean).join(' · ')}
            </p>
          )}
          {match.none && <p className="mt-1 font-semibold text-warn-400">Not clearly one of ours — the nearest are shown; pick only if you are sure.</p>}
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {match.candidates.map((candidate) => (
              <li key={candidate.ref}>
                <button
                  type="button"
                  disabled={busy || !mayPick || candidate.kind !== 'mould'}
                  onClick={() => run(() => samplesApi.pickMatchedModel({ id: sample._id, itemId: row._id, ref: candidate.ref }))}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${candidate.sure ? 'border-flame-500/40 text-flame-400 hover:bg-flame-500/10' : 'border-line/15 text-steel-400 hover:bg-line/[0.05]'}`}
                  title={candidate.name || ''}
                >
                  {candidate.code} · {Math.round(candidate.confidence * 100)}%{candidate.sure ? '' : ' · unsure'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="mt-1 text-danger-400">{error}</p>}
    </div>
  );
}

export default function SamplePhotos({ sample, mayBench, mayReference, onSaved }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);

  const rows = sample.items?.length ? sample.items : [];
  if (!rows.length) return null;

  const run = async (key, work) => {
    setBusy(key);
    setError(null);
    try {
      onSaved(await work());
    } catch (runError) {
      setError(runError.message);
    } finally {
      setBusy(null);
    }
  };

  const taken = rows.filter((row) => row.photo?.key).length;

  return (
    <Section
      title={rows.length > 1 ? `Photos per model (${taken} of ${rows.length} finished)` : 'Photos'}
      actions={<span className="text-xs text-steel-500">Reference beside the finished piece</span>}
    >
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row._id || index} className="rounded-xl border border-line/[0.08] bg-line/[0.02] p-4">
            <p className="mb-3 text-sm font-semibold text-steel-100">
              {rows.length > 1 && <span className="mr-2 rounded-md bg-flame-500/15 px-1.5 py-0.5 text-xs font-bold text-flame-400">{index + 1}</span>}
              {row.modelNumber || row.mould?.name || `Item ${index + 1}`}
              {row.colour && <span className="ml-2 text-xs font-normal text-steel-400">{row.colour}</span>}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <PhotoSlot
                label="Buyer's reference"
                photo={row.referencePhoto}
                mayEdit={mayReference}
                busy={busy === `ref-${row._id}`}
                emptyText="What the buyer sent for this model"
                onPick={(file) => run(`ref-${row._id}`, async () => samplesApi.setItemReferencePhoto({ id: sample._id, itemId: row._id, photo: await shrinkImage(file) }))}
                onClear={() => run(`ref-${row._id}`, () => samplesApi.clearItemReferencePhoto({ id: sample._id, itemId: row._id }))}
                onOpen={() => setViewing({ title: `Buyer's reference — ${row.modelNumber || `item ${index + 1}`}`, key: row.referencePhoto.key })}
              />
              <PhotoSlot
                label="Finished piece"
                photo={row.photo}
                mayEdit={mayBench}
                busy={busy === `fin-${row._id}`}
                capture="environment"
                emptyText="Taken on the bench at Sample Ready"
                onPick={(file) => run(`fin-${row._id}`, async () => samplesApi.setItemPhoto({ id: sample._id, itemId: row._id, photo: await shrinkImage(file) }))}
                onClear={() => run(`fin-${row._id}`, () => samplesApi.clearItemPhoto({ id: sample._id, itemId: row._id }))}
                onOpen={() => setViewing({ title: `Finished piece — ${row.modelNumber || `item ${index + 1}`}`, key: row.photo.key })}
              />
            </div>
            {row.photo?.key && (row.photoBy?.name || row.photoAt) && (
              <p className="mt-2 text-xs text-steel-500">
                Taken {row.photoAt ? formatDate(row.photoAt) : ''}{row.photoBy?.name ? ` by ${row.photoBy.name}` : ''}
              </p>
            )}
            <CheckLine row={row} />
            <MatchPanel sample={sample} row={row} mayPick={mayReference} onSaved={onSaved} />
          </li>
        ))}
      </ol>

      {sample.readyWithoutPhoto?.reason && (
        <div className="mt-3">
          <Notice tone="warn">
            Marked ready without a photo of every piece{sample.readyWithoutPhoto.by?.name ? ` by ${sample.readyWithoutPhoto.by.name}` : ''}: {sample.readyWithoutPhoto.reason}
          </Notice>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <Modal open={Boolean(viewing)} title={viewing?.title || ''} size="lg" onClose={() => setViewing(null)}>
        {viewing && <AuthedImage attachmentKey={viewing.key} alt={viewing.title} eager className="max-h-[70vh] w-full rounded-lg object-contain" />}
      </Modal>
    </Section>
  );
}
