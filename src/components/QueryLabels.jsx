import { useEffect, useId, useState } from 'react';
import { queries as queriesApi } from '../api/endpoints.js';
import { LABEL_MAX_LENGTH, MAX_LABELS, labelProblem, normaliseLabel } from '../utils/labels.js';

/** One label, as a chip. `#` so it reads as a group rather than as a status. */
export function LabelChip({ label, active = false, count, onClick }) {
  const body = (
    <>
      #{label}
      {count !== undefined && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
    </>
  );
  const tone = active
    ? 'bg-flame-500/20 text-flame-400 ring-flame-500/40'
    : 'bg-line/[0.05] text-steel-300 ring-line/10';
  if (!onClick) {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ring-inset ${tone}`}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors hover:bg-line/[0.06] ${tone}`}
    >
      {body}
    </button>
  );
}


/**
 * Filing a thread under labels — the groups the list's chip bar is made of.
 *
 * Anybody who can open the thread can file it. Labels already in use are offered as you type, so
 * "quality" is picked rather than typed a third way; a new word starts a new group.
 */
export default function QueryLabels({ query, onSaved }) {
  const [labels, setLabels] = useState(query.labels || []);
  const [draft, setDraft] = useState('');
  const [known, setKnown] = useState([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const listId = useId();

  useEffect(() => setLabels(query.labels || []), [query.labels]);

  /* The groups already in use, for the suggestions. One small request, once. */
  useEffect(() => {
    let live = true;
    queriesApi
      .list({ limit: 1 })
      .then((answer) => live && setKnown((answer.labels || []).map((entry) => entry.label)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const save = async (next) => {
    setBusy(true);
    setProblem(null);
    try {
      const saved = await queriesApi.setLabels({ id: query._id, labels: next });
      setLabels(saved.labels || next);
      onSaved?.(saved);
    } catch (saveError) {
      setProblem(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (event) => {
    event.preventDefault();
    const label = normaliseLabel(draft);
    if (!label) return;
    const why = labelProblem(label, labels);
    if (why) {
      setProblem(why);
      return;
    }
    setDraft('');
    save([...labels, label]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Labels">
      <span className="text-xs font-semibold uppercase tracking-wide text-steel-500">Labels</span>
      {labels.map((label) => (
        <span key={label} className="inline-flex items-center gap-0.5">
          <LabelChip label={label} />
          <button
            type="button"
            className="rounded-full px-1 text-xs text-steel-500 hover:text-danger-400"
            aria-label={`Remove the label ${label}`}
            disabled={busy}
            onClick={() => save(labels.filter((entry) => entry !== label))}
          >
            ✕
          </button>
        </span>
      ))}

      {labels.length < MAX_LABELS && (
        <form onSubmit={add} className="flex items-center gap-1.5">
          <input
            className="input h-8 w-56 py-1 text-xs"
            aria-label="Add a label"
            placeholder={labels.length ? 'Add another…' : 'Add a label, e.g. quality'}
            list={listId}
            maxLength={LABEL_MAX_LENGTH}
            value={draft}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setProblem(null);
            }}
          />
          <datalist id={listId}>
            {known.filter((label) => !labels.includes(label)).map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <button type="submit" className="btn-secondary h-8 px-3 py-1 text-xs" disabled={busy || !draft.trim()}>
            Add
          </button>
        </form>
      )}

      {problem && <span role="alert" className="text-xs text-danger-400">{problem}</span>}
    </div>
  );
}
