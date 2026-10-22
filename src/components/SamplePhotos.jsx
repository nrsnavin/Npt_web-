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
