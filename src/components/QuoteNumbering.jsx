import { useEffect, useState } from 'react';
import { quotations as quotationsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Modal, Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';
import { formatQuoteNumber, numberingProblem } from '../utils/quoteNumbers.js';

/**
 * Quote numbering: where the sequence stands, and — for an administrator — where it carries on
 * from.
 *
 * Everyone who quotes can see the next number; only an administrator can move it, and never onto
 * a number already on a quote. Next year's sequence can be set before 1 April. The server holds
 * both rules; the form says them first.
 */
export default function QuoteNumbering({ open, onClose }) {
  const { isAdmin } = useAuth();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [year, setYear] = useState('current');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);

  const load = () => {
    setError(null);
    quotationsApi.numbering().then(setState).catch(setError);
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  const sequence = state?.[year];
  useEffect(() => {
    setDraft(sequence ? String(sequence.nextSeq) : '');
    setProblem(null);
  }, [sequence?.nextSeq, year]);

  const why = sequence ? numberingProblem(draft, sequence) : null;
  const unchanged = sequence && Number(draft) === sequence.nextSeq;

  const save = async (event) => {
    event.preventDefault();
    if (why || unchanged) return;
    setSaving(true);
    setProblem(null);
    try {
      const saved = await quotationsApi.setNumbering({ next: Number(draft), year });
      setState((current) => ({ ...current, [year]: saved }));
    } catch (failure) {
      setProblem(failure.message);
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quote numbering" description="NP / financial year / number — restarts at 001 every 1 April" size="sm">
      {error && <Notice>{error.message}</Notice>}
      {!state && !error && <p className="text-sm text-steel-400">Loading…</p>}

      {state && (
        <div className="space-y-5">
          <div role="tablist" aria-label="Financial year" className="inline-flex rounded-lg bg-line/[0.05] p-1">
            {[['current', state.current.financialYear, 'this year'], ['next', state.next.financialYear, 'from 1 April']].map(([key, label, hint]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={year === key}
                onClick={() => setYear(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                  year === key ? 'bg-ink-850 text-steel-50 shadow-raised' : 'text-steel-400 hover:text-steel-200'
                }`}
              >
                {label} <span className="font-normal text-steel-500">· {hint}</span>
              </button>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-line/[0.04] p-3.5">
              <dt className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">Last issued</dt>
              <dd className="mt-1 font-mono text-base font-semibold text-steel-100">{sequence.lastIssued || 'None yet'}</dd>
            </div>
            <div className="rounded-xl bg-flame-500/[0.08] p-3.5 ring-1 ring-inset ring-flame-500/20">
              <dt className="text-xs font-bold uppercase tracking-[0.08em] text-flame-400">Next quote</dt>
              <dd className="mt-1 font-mono text-base font-bold text-steel-50">{sequence.next}</dd>
            </div>
          </dl>

          {sequence.changed && (
            <p className="text-xs text-steel-500">
              Last moved by {sequence.changed.by || 'somebody'} on {formatDate(sequence.changed.at)}.
            </p>
          )}

          {isAdmin ? (
            <form onSubmit={save} className="space-y-3">
              <Field
                label="Carry on from"
                hint={why ? undefined : `The next quote will be ${formatQuoteNumber(sequence.financialYear, Number(draft) || sequence.nextSeq)}`}
                error={draft && why ? why : undefined}
              >
                <input
                  className="input font-mono"
                  inputMode="numeric"
                  value={draft}
                  disabled={saving}
                  onChange={(event) => {
                    setDraft(event.target.value.replace(/[^\d]/g, ''));
                    setProblem(null);
                  }}
                />
              </Field>
              <p className="text-xs text-steel-500">
                Numbers sent by hand before the app? Set this to the one after the last you sent. It can go back down
                to fix a mistake, but never to {sequence.highestIssued ? `${sequence.lowestAllowed - 1} or below` : 'below 1'} — those are on quotes already.
              </p>
              {problem && <Notice>{problem}</Notice>}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
                <button type="submit" className="btn-primary" disabled={saving || Boolean(why) || unchanged}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-steel-400">Only an administrator can change where the sequence carries on from.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
