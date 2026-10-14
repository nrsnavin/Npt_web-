import { useEffect, useRef, useState } from 'react';
import { usePhotoDrafts } from '../hooks/usePhotoDrafts.js';
import { takeSharedPhotos } from '../utils/sharedPhotos.js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { buyerCards as cardsApi, customers as customersApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, EmptyState, ErrorState, Field, Notice, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import { SOURCES } from '../utils/pipeline.js';
import {
  CARD_STATUS, COLOUR_TYPES, KIND_LABEL, NEXT_STEPS, cardProblem, nextStepOf, quantityOf, todayIso, withoutStepFields,
} from '../utils/buyerCards.js';

/**
 * Draft enquiries.
 *
 * A salesperson screenshots a WhatsApp chat with a buyer, or photographs a visiting card or an
 * enquiry slip, and sends it to the plant's WhatsApp number — or uploads it here — and the model
 * reads it into a draft holding only what the picture shows. The draft waits here beside the
 * picture; the salesperson checks what was recognised, fills in the rest — the next step, when to
 * follow up, how they met the buyer — and saves it, which makes the customer and the enquiry.
 * Nothing is saved until they do.
 */

function CardPhoto({ id, n = 0 }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made = null;
    setUrl(null);
    setFailed(false);
    cardsApi
      .image(id, n)
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
  }, [id, n]);

  if (failed) return <p className="p-6 text-sm text-steel-500">The photo could not be loaded.</p>;
  if (!url) return <div className="h-64 animate-pulse rounded-xl bg-line/[0.05]" aria-label="Loading the photo" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Open the photo full size">
      <img src={url} alt={n ? `Screenshot ${n + 1} as it was sent` : 'The card as it was sent'} className="max-h-[28rem] w-full rounded-xl bg-ink-850 object-contain ring-1 ring-line/[0.08]" />
    </a>
  );
}

/** One field as recognised in the picture: marked while it still holds what was read. */
function ReadField({ label, name, fields, reading, set, disabled, wide = false, textarea = false, inputMode }) {
  const value = fields[name] ?? '';
  const read = reading?.[name];
  const fromPicture = read !== undefined && read !== null && read !== '' && String(read) === String(value);
  const Control = textarea ? 'textarea' : 'input';
  return (
    <Field
      label={label}
      hint={fromPicture ? 'From the picture' : !String(value) ? 'Not in the picture' : undefined}
      className={wide ? 'sm:col-span-2 xl:col-span-1 2xl:col-span-2' : ''}
    >
      <Control
        className={`input ${fromPicture ? 'ring-1 ring-inset ring-aqua-500/30' : ''}`}
        rows={textarea ? 3 : undefined}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        onChange={(event) => set(name, event.target.value)}
      />
    </Field>
  );
}

function CardEditor({ card, onDone }) {
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  /*
   * Admin and management send screenshots too, but do not hold buyers themselves: they say which
   * salesperson gets this one. Left on automatic, the sender keeps it if they can, else the
   * marketing rotation picks [server: intake.service ownerForNewBuyer].
   */
  const { isManagement } = useAuth();
  const [team, setTeam] = useState([]);
  useEffect(() => {
    if (!isManagement) return undefined;
    let live = true;
    customersApi.team().then((answer) => live && setTeam(answer?.data || [])).catch(() => {});
    return () => {
      live = false;
    };
  }, [isManagement]);

  /* Only what was recognised. The next step, the date and how we met them start empty: they are
     the salesperson's to give, not the app's to guess. */
  useEffect(() => {
    setFields({
      ...(card.reading || {}), nextAction: '', nextFollowUpDate: '', source: '', estimatedValue: '', assignedTo: '',
      /* The next step, picked; a sample or a quotation also raises that department's task. */
      nextStep: '', stepModel: '', stepColour: '', stepColourType: '', stepPieces: '2',
      stepQuantity: card.reading?.estimatedQuantity ? String(card.reading.estimatedQuantity) : '', stepTargetPrice: '', stepNote: '',
    });
    setProblem(null);
  }, [card._id]);

  const set = (name, value) => {
    setFields((current) => ({ ...current, [name]: value }));
    setProblem(null);
  };

  const open = ['ready', 'unreadable'].includes(card.status);
  const why = cardProblem(fields);
  const holder = card.matchedCustomer
    ? { to: `/customers/${card.matchedCustomer._id}`, text: `customer ${card.matchedCustomer.code} (${card.matchedCustomer.name})` }
    : null;

  const save = async (event) => {
    event.preventDefault();
    if (why) return;
    setBusy(true);
    setProblem(null);
    try {
      const value = String(fields.estimatedValue ?? '').replace(/,/g, '').trim();
      const done = await cardsApi.confirm({
        id: card._id,
        ...withoutStepFields(fields),
        ...nextStepOf(fields),
        estimatedQuantity: quantityOf(fields.estimatedQuantity),
        estimatedValue: value ? Number(value) : null,
        assignedTo: fields.assignedTo || undefined,
      });
      onDone(done.card, done.enquiry);
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

  const off = !open || busy;
  const common = { fields, reading: card.reading, set, disabled: off };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-3">
        <CardPhoto id={card._id} />
        {(card.moreImages || []).map((image, index) => (
          <CardPhoto key={image.imageKey} id={card._id} n={index + 1} />
        ))}
        <p className="text-xs text-steel-500">
          {KIND_LABEL[card.kind] ? `${KIND_LABEL[card.kind]} · ` : ''}
          {card.via === 'whatsapp' ? 'sent on WhatsApp' : 'uploaded'} by {card.sender?.name || 'a colleague'} · {formatDate(card.createdAt)}
          {card.caption && <span className="mt-1 block text-steel-400">“{card.caption}”</span>}
        </p>
      </div>

      <form onSubmit={save} className="space-y-4">
        {card.problem && open && <Notice tone="warn">{card.problem}</Notice>}
        {card.companyFromName && open && (
          <Notice tone="warn">No business was named, so the company is the person’s name. Change it if you know the business.</Notice>
        )}
        {holder && (
          <Notice tone="warn">
            This buyer is already <Link className="font-semibold underline" to={holder.to}>{holder.text}</Link> — raise the enquiry there.
          </Notice>
        )}
        {card.status === 'confirmed' && card.enquiry && (
          <Notice tone="success">
            Saved as enquiry <Link className="font-semibold underline" to={`/enquiries/${card.enquiry._id}`}>{card.enquiry.number}</Link>
            {card.customer ? <> for <Link className="font-semibold underline" to={`/customers/${card.customer._id}`}>{card.customer.name}</Link></> : ''}
            {card.decidedBy ? ` by ${card.decidedBy.name}` : ''}.
          </Notice>
        )}
        {card.status === 'discarded' && <Notice tone="info">Dropped{card.decidedBy ? ` by ${card.decidedBy.name}` : ''}.</Notice>}

        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-steel-500">
            Recognised in the picture{card.readBy === 'model' ? ' — by AI, check it' : ''}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Field
              label="Company"
              required
              hint={card.reading?.company && fields.company === card.reading.company ? 'From the picture' : !fields.company ? 'Not in the picture' : undefined}
              className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"
            >
              <input
                required
                className={`input ${card.reading?.company && fields.company === card.reading.company ? 'ring-1 ring-inset ring-aqua-500/30' : ''}`}
                value={fields.company || ''}
                disabled={off}
                onChange={(event) => set('company', event.target.value)}
              />
            </Field>
            <ReadField {...common} label="Contact name" name="contactName" />
            <ReadField {...common} label="Designation" name="designation" />
            <ReadField {...common} label="Mobile" name="mobile" inputMode="tel" />
            <ReadField {...common} label="WhatsApp" name="whatsapp" inputMode="tel" />
            <ReadField {...common} label="Email" name="email" inputMode="email" />
            <ReadField {...common} label="City" name="city" />
            <ReadField {...common} label="State" name="state" />
            <ReadField {...common} label="Interested in" name="productInterest" wide />
            <ReadField {...common} label="Quantity (pieces)" name="estimatedQuantity" inputMode="numeric" />
            <ReadField {...common} label={card.kind === 'chat' ? 'What was said' : 'Notes'} name="notes" wide textarea />
          </div>
        </section>

        {open && (
          <section className="space-y-3 rounded-xl border border-flame-500/20 bg-flame-500/[0.04] p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-flame-400">For you to fill in</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field
                label="Next step"
                required
                hint={NEXT_STEPS.find((step) => step.value === fields.nextStep)?.hint}
                className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"
              >
                <select required className="input" value={fields.nextStep || ''} disabled={off} onChange={(event) => set('nextStep', event.target.value)} aria-label="Next step">
                  <option value="">Choose…</option>
                  {NEXT_STEPS.map((step) => <option key={step.value} value={step.value}>{step.label}</option>)}
                </select>
              </Field>
              {fields.nextStep === 'other' && (
                <Field label="What is next" required className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                  <input
                    required
                    className="input"
                    placeholder="Call back after the buyer checks with the owner"
                    value={fields.nextAction || ''}
                    disabled={off}
                    onChange={(event) => set('nextAction', event.target.value)}
                  />
                </Field>
              )}
              {fields.nextStep === 'sample' && (
                <Field label="Model" required>
                  <input required className="input" placeholder="NH-400" value={fields.stepModel || ''} disabled={off} onChange={(event) => set('stepModel', event.target.value)} aria-label="Model" />
                </Field>
              )}
              {['quote', 'photos'].includes(fields.nextStep) && (
                <Field label="Model" hint={fields.nextStep === 'photos' ? 'If you know it' : undefined}>
                  <input className="input" placeholder="NH-400" value={fields.stepModel || ''} disabled={off} onChange={(event) => set('stepModel', event.target.value)} aria-label="Model" />
                </Field>
              )}
              {['sample', 'quote'].includes(fields.nextStep) && (
                <Field label={fields.nextStep === 'sample' ? 'Colour' : 'Material / colour'}>
                  <input className="input" placeholder={fields.nextStep === 'sample' ? 'Black' : 'PP black'} value={fields.stepColour || ''} disabled={off} onChange={(event) => set('stepColour', event.target.value)} aria-label={fields.nextStep === 'sample' ? 'Colour' : 'Material / colour'} />
                </Field>
              )}
              {fields.nextStep === 'sample' && (
                <>
                  <Field label="Colour is">
                    <select className="input" value={fields.stepColourType || ''} disabled={off} onChange={(event) => set('stepColourType', event.target.value)} aria-label="Colour is">
                      <option value="">Not said</option>
                      {COLOUR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </Field>
                  <Field label="Sample pieces">
                    <input className="input" inputMode="numeric" value={fields.stepPieces || ''} disabled={off} onChange={(event) => set('stepPieces', event.target.value.replace(/\D/g, ''))} aria-label="Sample pieces" />
                  </Field>
                </>
              )}
              {fields.nextStep === 'quote' && (
                <>
                  <Field label="Quantity (pieces)">
                    <input className="input" inputMode="numeric" value={fields.stepQuantity || ''} disabled={off} onChange={(event) => set('stepQuantity', event.target.value.replace(/[^\d,]/g, ''))} aria-label="Quotation quantity" />
                  </Field>
                  <Field label="Buyer’s target price (₹ / pc)">
                    <input className="input" inputMode="decimal" value={fields.stepTargetPrice || ''} disabled={off} onChange={(event) => set('stepTargetPrice', event.target.value.replace(/[^\d.]/g, ''))} aria-label="Target price" />
                  </Field>
                </>
              )}
              {['sample', 'quote'].includes(fields.nextStep) && (
                <Field
                  label={`Instruction to ${fields.nextStep === 'sample' ? 'Sampling' : 'Quotation'}`}
                  hint={fields.nextStep === 'sample' ? 'Needed when more than 3 pcs' : 'Packing, target, anything the costing should know'}
                  className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"
                >
                  <input className="input" value={fields.stepNote || ''} disabled={off} onChange={(event) => set('stepNote', event.target.value)} aria-label="Instruction" />
                </Field>
              )}
              <Field label="Follow up on" required>
                <input
                  required
                  type="date"
                  min={todayIso()}
                  className="input"
                  value={fields.nextFollowUpDate || ''}
                  disabled={off}
                  onChange={(event) => set('nextFollowUpDate', event.target.value)}
                />
              </Field>
              <Field label="How we met them" required>
                <select required className="input" value={fields.source || ''} disabled={off} onChange={(event) => set('source', event.target.value)}>
                  <option value="">Choose…</option>
                  {SOURCES.filter((entry) => entry.value !== 'indiamart').map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
              </Field>
              {isManagement && team.length > 0 && (
                <Field label="Marketing person" hint="Automatic: the sender keeps it, else the marketing rotation">
                  <select className="input" value={fields.assignedTo || ''} disabled={off} onChange={(event) => set('assignedTo', event.target.value)}>
                    <option value="">Automatic</option>
                    {team.map((person) => (
                      <option key={person._id} value={person._id}>{person.self ? `${person.name} (you)` : person.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Estimated value (₹)" hint="If you have a feel for it">
                <input
                  className="input"
                  inputMode="decimal"
                  value={fields.estimatedValue ?? ''}
                  disabled={off}
                  onChange={(event) => set('estimatedValue', event.target.value.replace(/[^\d.,]/g, ''))}
                />
              </Field>
            </div>
          </section>
        )}

        {open && (
          <>
            {(problem || why) && <Notice tone={problem ? 'danger' : 'info'}>{problem || why}</Notice>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" disabled={busy} onClick={discard}>Drop the draft</button>
              <button type="submit" className="btn-primary" disabled={busy || Boolean(why)}>
                {busy ? 'Saving…' : fields.nextStep === 'sample' ? 'Save & raise sample request' : fields.nextStep === 'quote' ? 'Save & raise quotation' : 'Save as enquiry'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

export default function BuyerCards() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState('waiting');
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
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

  /*
   * From the gallery or the camera, several at once. The list is read again afterwards: the later
   * screenshots of one chat fold into the draft its first one made, so the server says what is
   * left to show.
   */
  const photos = usePhotoDrafts({
    onDone: (cards) => {
      setParams({ card: cards[0]._id }, { replace: true });
      setSelected(cards[0]);
      if (view === 'waiting') load(); else setView('waiting');
    },
  });

  /* Pictures shared to the app from the gallery [public/sw.js] — taken once and uploaded. */
  const sharedTaken = useRef(false);
  useEffect(() => {
    if (!params.get('shared') || sharedTaken.current) return;
    sharedTaken.current = true;
    takeSharedPhotos()
      .then((files) => (files.length ? photos.upload(files) : setParams({}, { replace: true })))
      .catch(() => setParams({}, { replace: true }));
  }, [params]);

  const done = (card, enquiry) => {
    if (enquiry) {
      navigate(`/enquiries/${enquiry._id}`);
      return;
    }
    setState((current) => ({ ...current, data: current.data.filter((row) => row._id !== card._id), waiting: Math.max(0, (current.waiting || 1) - 1) }));
    setSelected(null);
    load();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Draft enquiries"
        subtitle="Started from WhatsApp chat screenshots and visiting cards. Check what was recognised, fill in the rest, and save it — that makes the customer and the enquiry."
        actions={
          <div className="flex items-center gap-2">
            <Link to="/enquiries" className="btn-secondary">All enquiries</Link>
            <input {...photos.inputProps} aria-label="Photos or screenshots" />
            <button type="button" className="btn-primary" disabled={Boolean(photos.busy)} onClick={photos.open}>
              {photos.label || '+ Photos or screenshots'}
            </button>
          </div>
        }
      />

      <p className="text-sm text-steel-400">
        On the road? Send a photo of the card, or screenshots of your chat with the buyer, to the plant’s WhatsApp number from your
        own phone. What it shows is saved here as a draft — finish it with the next step, when to follow up, and how you met them.
        {' '}On the phone, <span className="font-semibold text-steel-200">+ Photos or screenshots</span> picks from the gallery or the
        camera, several at once; with the app installed on Android, a screenshot can also be sent straight from the gallery with
        {' '}<span className="font-semibold text-steel-200">Share → Navin Hangers</span>.
      </p>
      {state && state.reading === false && (
        <Notice tone="warn">Reading pictures automatically is not switched on, so each one is typed in from its picture.</Notice>
      )}
      {photos.problem && <Notice>{photos.problem}</Notice>}

      <div role="tablist" aria-label="Which cards" className="inline-flex rounded-lg bg-line/[0.05] p-1">
        {[['waiting', `Drafts${state?.waiting ? ` (${state.waiting})` : ''}`], ['decided', 'Finished or dropped']].map(([key, label]) => (
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
          title={view === 'waiting' ? 'No drafts' : 'Nothing finished yet'}
          description="Send a photo of a visiting card or a screenshot of a chat with a buyer to the WhatsApp number, or add one here."
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
                      {row.reading?.company || row.reading?.contactName || 'A draft to fill in'}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-steel-500">
                      <span className="truncate">{row.kind === 'chat' ? 'Chat · ' : ''}{row.sender?.name} · {formatDate(row.createdAt)}</span>
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
