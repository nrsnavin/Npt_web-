import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { leadCards as cardsApi } from '../api/endpoints.js';
import { Badge, EmptyState, ErrorState, Field, Notice, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import { SOURCES } from '../utils/pipeline.js';
import { CARD_FIELDS, CARD_STATUS, cardProblem } from '../utils/leadCards.js';

/**
 * Cards to confirm.
 *
 * A salesperson photographs a visiting card or an enquiry slip and sends it to the plant's
 * WhatsApp number — or uploads it here — and the model reads it. The reading waits on this
 * screen beside the photo, so whoever confirms it can see the card they are vouching for. Nothing
 * is a lead until somebody presses "Make it a lead" here, or replies YES on WhatsApp.
 */

function CardPhoto({ id }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made = null;
    setUrl(null);
    setFailed(false);
    cardsApi
      .image(id)
      .then((blob) => {
        if (!live) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);

  if (failed) return <p className="p-6 text-sm text-steel-500">The photo could not be loaded.</p>;
  if (!url) return <div className="h-64 animate-pulse rounded-xl bg-line/[0.05]" aria-label="Loading the photo" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open the photo full size">
      <img src={url} alt="The card as it was sent" className="max-h-[28rem] w-full rounded-xl bg-ink-850 object-contain ring-1 ring-line/[0.08]" />
    </a>
  );
}

function CardEditor({ card, onDone }) {
  const [fields, setFields] = useState({});
  const [source, setSource] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    setFields({ ...(card.reading || {}) });
    setSource('manual');
    setProblem(null);
  }, [card._id]);

  const open = ['ready', 'unreadable'].includes(card.status);
  const why = cardProblem(fields);
  const holder = card.matchedLead
    ? { to: `/leads/${card.matchedLead._id}`, text: `lead ${card.matchedLead.number} (${card.matchedLead.company})` }
    : card.matchedCustomer
      ? { to: `/customers/${card.matchedCustomer._id}`, text: `customer ${card.matchedCustomer.code} (${card.matchedCustomer.name})` }
      : null;

  const confirm = async (event) => {
    event.preventDefault();
    if (why) return;
    setBusy(true);
    setProblem(null);
    try {
      const done = await cardsApi.confirm({ id: card._id, ...fields, source });
      onDone(done.card, done.lead);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try {
      onDone(await cardsApi.discard(card._id));
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-3">
        <CardPhoto id={card._id} />
        <p className="text-xs text-steel-500">
          {card.via === 'whatsapp' ? 'Sent on WhatsApp' : 'Uploaded'} by {card.sender?.name || 'a colleague'} · {formatDate(card.createdAt)}
          {card.caption && <span className="mt-1 block text-steel-400">“{card.caption}”</span>}
        </p>
      </div>

      <form onSubmit={confirm} className="space-y-3">
        {card.readBy === 'model' && open && (
          <Notice tone="info">Read from the photo by AI. Check each field against the card before you confirm.</Notice>
        )}
        {card.problem && open && <Notice tone="warn">{card.problem}</Notice>}
        {holder && (
          <Notice tone="warn">
            This buyer is already <Link className="font-semibold underline" to={holder.to}>{holder.text}</Link>.
          </Notice>
        )}
        {card.status === 'confirmed' && card.lead && (
          <Notice tone="success">
            Made lead <Link className="font-semibold underline" to={`/leads/${card.lead._id}`}>{card.lead.number}</Link>
            {card.decidedBy ? ` by ${card.decidedBy.name}` : ''}.
          </Notice>
        )}
        {card.status === 'discarded' && <Notice tone="info">Dropped{card.decidedBy ? ` by ${card.decidedBy.name}` : ''}.</Notice>}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label="Company" required className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
            <input
              required
              className="input"
              value={fields.company || ''}
              disabled={!open || busy}
              onChange={(event) => {
                setFields({ ...fields, company: event.target.value });
                setProblem(null);
              }}
            />
          </Field>
          {CARD_FIELDS.filter(([key]) => key !== 'company').map(([key, label]) => (
            <Field key={key} label={label} className={key === 'notes' || key === 'productInterest' ? 'sm:col-span-2 xl:col-span-1 2xl:col-span-2' : ''}>
              <input
                className="input"
                value={fields[key] || ''}
                disabled={!open || busy}
                inputMode={key === 'mobile' || key === 'whatsapp' ? 'tel' : key === 'email' ? 'email' : undefined}
                onChange={(event) => {
                  setFields({ ...fields, [key]: event.target.value });
                  setProblem(null);
                }}
              />
            </Field>
          ))}
          <Field label="How we met them">
            <select className="input" value={source} disabled={!open || busy} onChange={(event) => setSource(event.target.value)}>
              {SOURCES.filter((entry) => entry.value !== 'indiamart').map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {open && (
          <>
            {(problem || (why && Object.keys(fields).length > 0)) && <Notice>{problem || why}</Notice>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" disabled={busy} onClick={discard}>Drop it</button>
              <button type="submit" className="btn-primary" disabled={busy || Boolean(why)}>
                {busy ? 'Saving…' : 'Make it a lead'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default function LeadCards() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState('waiting');
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProblem, setUploadProblem] = useState(null);
  const picker = useRef(null);
  const wanted = params.get('card');

  const load = () => {
    setError(null);
    cardsApi
      .list({ status: view === 'waiting' ? undefined : 'decided' })
      .then((answer) => {
        setState(answer);
        setSelected((current) => {
          const keep = answer.data.find((row) => row._id === (current?._id || wanted));
          return keep || answer.data[0] || null;
        });
      })
      .catch(setError);
  };
  useEffect(load, [view]);

  /* A link from a WhatsApp reply names a card that may already be decided — fetch it directly. */
  useEffect(() => {
    if (!wanted || !state || state.data.some((row) => row._id === wanted)) return;
    cardsApi.get(wanted).then(setSelected).catch(() => {});
  }, [wanted, state]);

  /* A card still being read is looked at again shortly, so it fills in without a reload. */
  useEffect(() => {
    if (!state?.data.some((row) => row.status === 'reading')) return undefined;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [state]);

  const choose = (card) => {
    setSelected(card);
    setParams(card ? { card: card._id } : {}, { replace: true });
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProblem(null);
    try {
      const card = await cardsApi.upload({ file });
      setView('waiting');
      setState((current) => (current ? { ...current, data: [card, ...current.data], waiting: (current.waiting || 0) + 1 } : current));
      choose(card);
    } catch (failure) {
      setUploadProblem(failure.message);
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = '';
    }
  };

  const done = (card, lead) => {
    if (lead) {
      navigate(`/leads/${lead._id}`);
      return;
    }
    setState((current) => ({ ...current, data: current.data.filter((row) => row._id !== card._id), waiting: Math.max(0, (current.waiting || 1) - 1) }));
    setSelected(null);
    load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Cards to confirm"
        subtitle="Visiting cards and enquiry slips, read from the photo. Nothing is a lead until you confirm it."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/leads" className="btn-secondary">All leads</Link>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => upload(event.target.files?.[0])}
            />
            <button type="button" className="btn-primary" disabled={uploading} onClick={() => picker.current?.click()}>
              {uploading ? 'Reading the card…' : '+ Photo of a card'}
            </button>
          </div>
        }
      />

      <p className="text-sm text-steel-400">
        On the road? Send the photo to the plant’s WhatsApp number from your own phone. The reply says what was read — answer
        YES to add the lead, or NO to drop it.
      </p>
      {state && state.reading === false && (
        <Notice tone="warn">Reading cards automatically is not switched on, so each card is typed in from its photo.</Notice>
      )}
      {uploadProblem && <Notice>{uploadProblem}</Notice>}

      <div role="tablist" aria-label="Which cards" className="inline-flex rounded-lg bg-line/[0.05] p-1">
        {[['waiting', `Waiting${state?.waiting ? ` (${state.waiting})` : ''}`], ['decided', 'Done']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === key ? 'bg-ink-850 text-steel-50 shadow-raised' : 'text-steel-400 hover:text-steel-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <ErrorState error={error} onRetry={load} />}
      {!state && !error && <div className="h-64 animate-pulse rounded-2xl bg-line/[0.04]" aria-label="Loading cards" />}

      {state && !state.data.length && !selected && (
        <EmptyState
          title={view === 'waiting' ? 'No cards waiting' : 'No cards yet'}
          description="Send a photo of a visiting card to the WhatsApp number, or take one here."
          icon="▭"
        />
      )}

      {state && (state.data.length > 0 || selected) && (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <ul className="card divide-y divide-line/[0.05] self-start overflow-hidden">
            {state.data.map((row) => {
              const status = CARD_STATUS[row.status] || CARD_STATUS.ready;
              return (
                <li key={row._id}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    aria-current={selected?._id === row._id}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-line/[0.03] ${selected?._id === row._id ? 'bg-flame-500/[0.07]' : ''}`}
                  >
                    <span className="block truncate text-sm font-semibold text-steel-100">
                      {row.reading?.company || row.reading?.contactName || 'A card to read'}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-steel-500">
                      <span className="truncate">{row.sender?.name} · {formatDate(row.createdAt)}</span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <section className="card p-5">{selected ? <CardEditor card={selected} onDone={done} /> : <p className="text-sm text-steel-500">Choose a card.</p>}</section>
        </div>
      )}
    </div>
  );
}
