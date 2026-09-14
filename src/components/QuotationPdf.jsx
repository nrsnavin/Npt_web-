import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
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
 *
 * And sending happens *here*, from the same dialog, for the same reason. Raising a quote off a
 * costing used to leave it as a draft on a screen the person had already navigated away from:
 * they saw the document, closed it, and the quotation sat unsent until somebody went looking
 * for it on the quotations register. The step that follows reading a document is deciding to
 * send it, so the decision belongs on the document.
 *
 * §9's gate still applies and still refuses without naming the floor [§8]. It arrives here as a
 * message rather than as a silent failure, because a Send that does nothing reads as a broken
 * button rather than as a rule.
 */
export default function QuotationPdf({ quotation, open, onClose, onSent }) {
  const { canQuote } = useAuth();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  /*
   * The send is tracked here rather than read back off the `quotation` prop, because the
   * caller may or may not re-fetch — this dialog is opened from five screens — and the person
   * looking at it needs to see the outcome either way.
   */
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [justSent, setJustSent] = useState(null);

  /* A fresh open is a fresh question: a dialog that reopens still saying "Sent" about the last
     quotation is worse than one that says nothing. */
  useEffect(() => {
    setSendError(null);
    setJustSent(null);
  }, [open, quotation?._id]);

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

  /*
   * Offered only where it is the real next step. Not on a quote that has already gone out —
   * changing what a customer has been told is a revision, which is the quotation screen's job —
   * and not to a reader without the quoting right.
   */
  const alreadyOut = Boolean(justSent?.sentAt || quotation?.sentAt);
  const maySend =
    canQuote('pricing') &&
    quotation?._id &&
    !alreadyOut &&
    !['accepted', 'rejected'].includes(quotation?.status);

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      const sent = await quotationsApi.send({ id: quotation._id });
      setJustSent(sent);
      onSent?.(sent);
    } catch (failure) {
      /* §9 arrives here. Said plainly, without the figure it is protecting. */
      setSendError(failure.message);
      /* The refusal moves the quote into the approval queue, so the caller's list is now stale
         whether the send worked or not. */
      onSent?.(null);
    } finally {
      setSending(false);
    }
  };

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

          {sendError && (
            <div className="mt-4">
              <Notice tone="warn">{sendError}</Notice>
            </div>
          )}

          {/* Where it went, said as a place somebody can go and look. A confirmation that only
              says "done" leaves the person wondering where "done" is. */}
          {justSent && (
            <div className="mt-4">
              <Notice tone="success">
                {quotation.number} has gone out, and is on the{' '}
                <Link to="/quotations/sent" className="font-semibold underline">
                  sent quotations
                </Link>{' '}
                board. What the buyer says next is recorded there.
              </Notice>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-steel-400">
              Rendered from the record — a new revision produces a new document.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>
                {justSent ? 'Done' : 'Close'}
              </button>
              <button type="button" className="btn-secondary" onClick={download}>
                Download PDF
              </button>
              {maySend && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={sending}
                  onClick={send}
                >
                  {sending ? 'Sending…' : 'Mark it sent'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
