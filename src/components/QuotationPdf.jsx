import { useEffect, useState } from 'react';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { Modal, Notice, Spinner } from './ui.jsx';

/**
 * The quotation as the customer will see it [BLUEPRINT §10].
 *
 * Fetched as a blob rather than pointed at with an `<iframe src>`, because the route is behind
 * the session's bearer token and an iframe cannot carry one. That has a consequence worth being
 * deliberate about: the object URL holds the whole PDF in memory until it is revoked, so it is
 * revoked when the dialog closes and re-made when it opens. A viewer that leaks one blob per
 * open is a tab that grows all afternoon.
 *
 * Shown before sending rather than only after, which is the point of having it at all: the
 * moment to catch a wrong quantity or a missing payment term is while it is still a draft.
 */
export default function QuotationPdf({ quotation, open, onClose }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !quotation?._id) return undefined;

    let objectUrl;
    let cancelled = false;

    setError(null);
    setUrl(null);

    quotationsApi
      .pdf(quotation._id)
      .then((blob) => {
        if (cancelled) return;
        /*
         * The type is forced. A blob that arrives without `application/pdf` — a proxy that
         * strips it, an error body that slipped through — renders as a download prompt inside
         * the frame rather than as a document, which reads as the viewer being broken.
         */
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setUrl(objectUrl);
      })
      .catch((problem) => !cancelled && setError(problem));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, quotation?._id]);

  const download = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quotation.number}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${quotation?.number || 'Quotation'} — document`}
      description="What the customer receives. Check it before it goes out."
    >
      {error && <Notice>{error.message}</Notice>}

      {!error && !url && <Spinner label="Preparing the document" />}

      {url && (
        <>
          {/*
            A tall frame rather than a scaled thumbnail: the point of showing the document is
            that somebody can read the terms on it, and a preview too small to read is
            decoration.
          */}
          <div className="overflow-hidden rounded-xl border border-line/[0.08] bg-white">
            <iframe
              title={`Quotation ${quotation?.number}`}
              src={url}
              className="h-[65vh] w-full"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-steel-400">
              Rendered from the record — a new revision produces a new document.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={download}>
                Download PDF
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
