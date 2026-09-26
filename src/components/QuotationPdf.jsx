import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Modal, Notice, Spinner } from './ui.jsx';
import SendQuotationForm from './SendQuotationForm.jsx';
import { deliveryLines } from '../utils/quoteSend.js';

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
 *
 * Send opens the message itself — the email and the WhatsApp text, pre-filled and editable —
 * in place of the document, and Back returns to it. `compose` opens straight onto the message,
 * for the Send buttons on lists where the document has already been read.
 */
export default function QuotationPdf({ quotation, open, onClose, onSent, compose = false }) {
  const { canQuote } = useAuth();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  /*
   * The send is tracked here rather than read back off the `quotation` prop, because the
   * caller may or may not re-fetch — this dialog is opened from five screens — and the person
   * looking at it needs to see the outcome either way.
   */
  const [composing, setComposing] = useState(false);
  const [justSent, setJustSent] = useState(null);
  const [deliveries, setDeliveries] = useState([]);

  /* A fresh open is a fresh question: a dialog that reopens still saying "Sent" about the last
     quotation is worse than one that says nothing. */
  useEffect(() => {
    setJustSent(null);
    setDeliveries([]);
    setComposing(Boolean(open && compose));
  }, [open, quotation?._id, compose]);

  useEffect(() => {
    /*
     * Closing drops the document as well as the fetch.
     *
     * Returning early left the last `url` set, so the body below went on rendering the previous
     * quotation's frame and its "has gone out" notice against a `quotation` the caller had
     * already set to null — `quotation.number` on nothing, which takes the whole page down. The
     * callers that close this dialog by clearing the record are the ordinary ones: the costing
     * screen opens it on the quote it just raised and clears it on Done.
     */
    if (!open || !quotation?._id) {
      setUrl(null);
      return undefined;
    }

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
   * Offered only where it is the real next step: on a quote the customer has not been given in
   * this form, and to a reader with the quoting right.
   *
   * The test is the *status*, matching the server and the quotations register. It used to be
   * `sentAt`, which is a date that never clears — so once a quote had gone out, revising it and
   * sending the new price was impossible from the document: the button vanished for good and the
   * only way through was the register's own Send, on a screen the person had already left. A
   * revision is exactly the case where somebody is looking at the document and deciding to send
   * it, and it was the one case this dialog refused.
   *
   * `justSent` is still consulted, so the button disappears the moment it is pressed rather than
   * waiting for the caller to re-fetch.
   */
  const maySend =
    canQuote('pricing') &&
    quotation?._id &&
    !justSent &&
    !['sent', 'accepted', 'rejected'].includes(quotation?.status);

  const sent = ({ quotation: done, deliveries: went }) => {
    setComposing(false);
    setJustSent(done);
    setDeliveries(went);
    onSent?.(done);
  };

  const download = () => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    /* NP/26-27/001 → NP-26-27-001.pdf: a slash is not allowed in a file name. */
    link.download = `${(quotation?.number || 'quotation').replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${quotation?.number || 'Quotation'} — ${composing ? 'send to the buyer' : 'document'}`}
      description={
        composing
          ? 'The message as it will go. Change anything — the address, the number, the words.'
          : 'What the customer receives. Check it before it goes out.'
      }
    >
      {composing && quotation?._id && (
        <SendQuotationForm
          quotation={quotation}
          onCancel={() => (compose ? onClose() : setComposing(false))}
          onSent={sent}
          onRefused={() => onSent?.(null)}
        />
      )}

      {!composing && error && <Notice>{error.message}</Notice>}

      {!composing && !error && !url && <Spinner label="Preparing the document" />}

      {!composing && url && (
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

          {/* Where it went, said as a place somebody can go and look. A confirmation that only
              says "done" leaves the person wondering where "done" is. */}
          {justSent && (
            <div className="mt-4">
              <Notice tone="success">
                {justSent.number || quotation?.number} has gone out, and is on the{' '}
                <Link to="/quotations/sent" className="font-semibold underline">
                  sent quotations
                </Link>{' '}
                board. What the buyer says next is recorded there.
                {deliveries.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {deliveryLines(deliveries).map((line) => (
                      <li key={line.text} className={line.ok ? '' : 'text-warn-400'}>
                        {line.ok ? '✓' : '!'} {line.text}
                      </li>
                    ))}
                  </ul>
                )}
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
                  onClick={() => setComposing(true)}
                >
                  {/* A quote that has been out before is going out again with a new price on
                      it, and saying so is what tells the sender they are revising rather than
                      repeating. */}
                  {quotation?.sentAt ? 'Send the new price…' : 'Send to the buyer…'}
                </button>
              )}
              {/* Why there is no Send, rather than a gap where one was. Sending twice overwrites
                  the date the chase is measured from, so the way to put a changed offer in front
                  of the buyer is a revision. */}
              {quotation?.status === 'sent' && !justSent && canQuote('pricing') && (
                <p className="self-center text-xs text-steel-400">
                  Already with the buyer — revise it to send a new price
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
