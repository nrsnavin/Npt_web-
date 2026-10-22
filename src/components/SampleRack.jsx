import { useCallback, useState } from 'react';
import { samples as samplesApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRecord } from '../hooks/useRecords.js';
import { Field, Modal, Notice, Section } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The sample rack as a stock list [server: sampleRack.controller; the sampling audit, item 12]:
 * what is on the rack by model and colour. The bench counts it; marketing reads it before a
 * visit; a piece handed over in person comes off it by itself. Empty lines stand out, so the
 * bench sees what to top up.
 */
export default function SampleRack({ compact = false }) {
  const { canWrite } = useAuth();
  const fetch = useCallback(() => samplesApi.rack(), []);
  const { data, loading, error, reload } = useRecord(fetch, 'sample-rack');
  const [counting, setCounting] = useState(false);
  const [draft, setDraft] = useState({ modelNumber: '', colour: '', pieces: '', shelf: '' });
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);
  const mayCount = canWrite('samples');

  const rows = data?.data || [];
  const meta = data?.meta || {};

  const save = async (lines) => {
    setBusy('save');
    setProblem(null);
    try {
      await samplesApi.setRack(lines);
      await reload();
      setCounting(false);
      setDraft({ modelNumber: '', colour: '', pieces: '', shelf: '' });
    } catch (saveError) {
      setProblem(saveError.message);
    } finally {
      setBusy(null);
    }
  };

  const count = (row, pieces) => save([{ modelNumber: row.modelNumber, colour: row.colour || '', pieces: Math.max(0, Number(pieces) || 0) }]);

  const remove = async (row) => {
    setBusy(row._id);
    try {
      await samplesApi.removeRackLine(row._id);
      await reload();
    } catch (removeError) {
      setProblem(removeError.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Notice tone="danger">{error.message}</Notice>;

  return (
    <Section
      title={`Sample rack${meta.lines ? ` (${meta.pieces} pieces on ${meta.lines} lines)` : ''}`}
      actions={mayCount ? <button type="button" className="row-action" onClick={() => setCounting(true)}>Add a line</button> : null}
    >
      {loading && !data ? (
        <p className="text-sm text-steel-500">Counting the rack…</p>
      ) : !rows.length ? (
        <p className="text-sm text-steel-500">Nothing listed. {mayCount ? 'Add what is on the rack, by model and colour, so a visit can take a piece knowing what is left.' : 'The bench lists what is on the rack here.'}</p>
      ) : (
        <ul className="divide-y divide-line/[0.05]" aria-label="Sample rack">
          {rows.map((row) => (
            <li key={row._id} className={`flex flex-wrap items-center gap-3 py-2 ${row.pieces ? '' : 'opacity-80'}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-steel-100">
                  {row.modelNumber}{row.colour ? <span className="font-normal text-steel-400"> · {row.colour}</span> : null}
                  {row.shelf ? <span className="ml-2 text-xs font-normal text-steel-500">shelf {row.shelf}</span> : null}
                </span>
                {!compact && row.lastTaken?.at && (
                  <span className="block text-xs text-steel-500">
                    Last taken {formatDate(row.lastTaken.at)}{row.lastTaken.by?.name ? ` by ${row.lastTaken.by.name}` : ''}{row.lastTaken.sample?.number ? ` · ${row.lastTaken.sample.number}` : ''}
                  </span>
                )}
              </span>
              <span className={`text-sm font-bold tabular-nums ${row.pieces ? 'text-steel-100' : 'text-danger-400'}`}>
                {row.pieces ? `${row.pieces} pc` : 'Empty — top up'}
              </span>
              {mayCount && (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    className="input w-20 py-1 text-sm"
                    aria-label={`Pieces of ${row.modelNumber}${row.colour ? ` ${row.colour}` : ''} on the rack`}
                    defaultValue={row.pieces}
                    disabled={busy === 'save'}
                    onBlur={(event) => { if (Number(event.target.value) !== row.pieces) count(row, event.target.value); }}
                  />
                  <button type="button" className="row-action-danger" disabled={busy === row._id} onClick={() => remove(row)}>Remove</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && <div className="mt-2"><Notice tone="danger">{problem}</Notice></div>}

      <Modal open={counting} title="A line on the rack" description="Counted as it stands — a piece taken on a visit comes off it by itself" onClose={() => setCounting(false)}>
        <form
          className="space-y-4"
          onSubmit={(event) => { event.preventDefault(); save([{ modelNumber: draft.modelNumber.trim(), colour: draft.colour.trim(), pieces: Number(draft.pieces) || 0, shelf: draft.shelf.trim() || undefined }]); }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Model" required><input className="input" required value={draft.modelNumber} onChange={(event) => setDraft({ ...draft, modelNumber: event.target.value })} placeholder="NPT-400S" aria-label="Rack model" /></Field>
            <Field label="Colour"><input className="input" value={draft.colour} onChange={(event) => setDraft({ ...draft, colour: event.target.value })} placeholder="White" aria-label="Rack colour" /></Field>
            <Field label="Pieces" required><input type="number" min="0" className="input" required value={draft.pieces} onChange={(event) => setDraft({ ...draft, pieces: event.target.value })} aria-label="Rack pieces" /></Field>
            <Field label="Shelf"><input className="input" value={draft.shelf} onChange={(event) => setDraft({ ...draft, shelf: event.target.value })} placeholder="A2" aria-label="Rack shelf" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCounting(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy === 'save' || !draft.modelNumber.trim()}>{busy === 'save' ? 'Saving…' : 'Save the line'}</button>
          </div>
        </form>
      </Modal>
    </Section>
  );
}
