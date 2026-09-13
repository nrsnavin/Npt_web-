import { useEffect, useRef, useState } from 'react';
import AuthedImage from './AuthedImage.jsx';

/**
 * The photograph of the part a tool makes.
 *
 * The register is otherwise all numbers, and a plant recognises a hanger by its shape long
 * before it recognises the code stamped on the mould. Marketing picking a model for a quotation,
 * a bench choosing what to sample, a buyer reading a price list — all three are looking for a
 * shape, and all three were being shown "NCP-27".
 *
 * So the photo travels with the model wherever the model is chosen, and the same two components
 * do it everywhere: a thumbnail that degrades to a labelled blank when there is no photo, and
 * the control that puts one on the record.
 */

/** Sizes the thumbnail is asked for, so eleven screens cannot each invent their own. */
const SIZES = {
  sm: 'h-9 w-12',
  md: 'h-14 w-20',
  lg: 'h-28 w-36',
};

/**
 * A part photo, or an honest blank.
 *
 * The blank says "no photo" rather than drawing nothing, because a missing image and an image
 * that failed to load look identical when both are empty — and on a register where the photo is
 * the point, "this one has none" is worth knowing at a glance.
 */
export function MouldThumb({ mould, size = 'sm', className = '', eager = false }) {
  const box = `${SIZES[size] || SIZES.sm} shrink-0 overflow-hidden rounded-md border border-line/[0.08] ${className}`;

  if (!mould?.photo?.key) {
    /*
     * A drawn placeholder rather than the words "no photo". At thumbnail size the words wrap to
     * two cramped lines and read as an error; an outline of a hanger reads as "there is meant
     * to be a picture here" at any size, in any language, and does not compete with the code
     * beside it for attention.
     */
    return (
      <div
        className={`${box} grid place-items-center bg-line/[0.03] text-steel-600`}
        title="No photo on the register yet"
      >
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4a2 2 0 0 1 2 2c0 1.1-.9 2-2 2v2" />
          <path d="m12 10-8 5.4a.9.9 0 0 0 .5 1.6h15a.9.9 0 0 0 .5-1.6L12 10Z" />
        </svg>
        <span className="sr-only">No photo</span>
      </div>
    );
  }

  return (
    <AuthedImage
      attachmentKey={mould.photo.key}
      alt={`${mould.mouldCode || 'Model'} — the part it makes`}
      eager={eager}
      /* `object-contain` on a pale ground rather than `cover`: a hanger is a thin outline, and
         cropping one to fill a box cuts off the hook, which is the half people recognise. */
      className={`${box} bg-line/[0.03] object-contain`}
    />
  );
}

/**
 * Choosing the photo on the register form.
 *
 * Deferred rather than uploaded the moment it is picked. The upload is its own endpoint — a
 * photo is multipart and the rest of the record is JSON — but that is the server's shape, not
 * something the person filling in a form should have to know: they press Save once, and
 * everything they changed is saved, including the picture. A file that uploaded itself on
 * selection would leave the register holding a new photo for a mould whose edits were abandoned.
 *
 * The preview is of the chosen file, not of the saved one, so what you see before saving is what
 * you are about to save.
 */
export function MouldPhotoField({ photo, file, onPick, onClear }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    /* Revoked when the choice changes or the form closes, or a long editing session leaks a
       copy of every photograph somebody looked at. */
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const showing = preview || photo?.key;

  return (
    <div className="flex items-start gap-3">
      <div className="h-28 w-36 shrink-0 overflow-hidden rounded-lg border border-line/[0.08] bg-line/[0.03]">
        {preview ? (
          <img src={preview} alt="The part, as chosen" className="h-full w-full object-contain" />
        ) : photo?.key ? (
          <AuthedImage
            attachmentKey={photo.key}
            alt="The part this tool makes"
            eager
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-steel-500">
            No photo yet
          </div>
        )}
      </div>

      <div className="min-w-0">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onPick(chosen);
            /* Cleared so picking the same file twice still fires a change — the commonest way
               somebody re-takes a photo is to overwrite it and choose it again. */
            event.target.value = '';
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => input.current?.click()}>
            {showing ? 'Choose another' : 'Add a photo'}
          </button>
          {file && (
            <button type="button" className="btn-ghost" onClick={onClear}>
              Undo
            </button>
          )}
        </div>

        <p className="mt-2 text-xs text-steel-500">
          The piece this tool makes. It travels with the model everywhere it is chosen, and onto
          the price quote the customer receives.
        </p>
        {file && (
          <p className="mt-1 text-xs font-semibold text-accent">
            {file.name} — saved when you save the mould
          </p>
        )}
      </div>
    </div>
  );
}
