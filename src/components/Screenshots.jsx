import { useCallback, useEffect, useState } from 'react';
import { enquiries as enquiriesApi, taskShots as taskShotsApi } from '../api/endpoints.js';
import { useToast } from '../context/ToastContext.jsx';
import { Modal, Notice } from './ui.jsx';
import { formatDate } from '../utils/format.js';

/**
 * The screenshots an enquiry was made from — the WhatsApp chat, the email, the visiting card —
 * as small pictures; one click shows it big, with the others a swipe away
 * [server: services/enquiryShots.service.js]. On the enquiry for its marketing person and Admin,
 * and on a task once they were forwarded to it.
 */

export const SHOT_KIND = {
  chat: 'WhatsApp chat',
  email: 'Email',
  card: 'Visiting card',
  screenshot: 'Screenshot',
  other: 'Picture',
};

/** The same, inside a sentence: "the WhatsApp chat this enquiry was made from". */
export const SHOT_WORD = {
  chat: 'WhatsApp chat',
  email: 'email',
  card: 'visiting card',
  screenshot: 'screenshot',
  other: 'picture',
};

/** Object URLs for every picture, loaded once and freed when the strip goes. */
function usePictures(count, load) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let live = true;
    const made = [];
    setUrls([]);
    Promise.all(Array.from({ length: count }, (unused, n) => load(n)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        made.push(url);
        return url;
      })
      .catch(() => null)))
      .then((loaded) => live && setUrls(loaded));
    return () => {
      live = false;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [count, load]);
  return urls;
}

/** One picture big, with Previous / Next (and the arrow keys) through the rest. */
export function ShotViewer({ urls, start = 0, title, onClose }) {
  const [at, setAt] = useState(start);
  const count = urls.length;
  const go = useCallback((step) => setAt((current) => (current + step + count) % count), [count]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  const url = urls[at];
  return (
    <Modal open title={title} description={count > 1 ? `Picture ${at + 1} of ${count}` : 'The picture the enquiry was made from'} size="lg" onClose={onClose}>
      <div className="space-y-3">
        {url ? (
          <img src={url} alt={`${title} — picture ${at + 1}`} className="mx-auto max-h-[72vh] rounded-lg border border-line/[0.1] object-contain" />
        ) : (
          <Notice tone="danger">This picture could not be loaded.</Notice>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {count > 1 && <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => go(-1)}>‹ Previous</button>}
          {url && <a href={url} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1 text-xs">Open full size</a>}
          {count > 1 && <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => go(1)}>Next ›</button>}
        </div>
      </div>
    </Modal>
  );
}

/** The small pictures; a click opens the viewer at that one. */
export function ShotStrip({ shots, load, size = 'md' }) {
  const urls = usePictures(shots.images, load);
  const [viewing, setViewing] = useState(null);
  const title = SHOT_KIND[shots.kind] || 'Screenshot';
  const box = size === 'sm' ? 'h-16 w-12' : 'h-24 w-[4.5rem]';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: shots.images }, (unused, n) => (
          <button
            key={n}
            type="button"
            className={`${box} overflow-hidden rounded-lg border border-line/[0.12] bg-ink-900 transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
            onClick={() => setViewing(n)}
            aria-label={`Enlarge ${title.toLowerCase()} ${n + 1}`}
            title="Click to enlarge"
          >
            {urls[n] ? (
              <img src={urls[n]} alt="" className="h-full w-full object-cover object-top" />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-steel-500">{urls.length ? '—' : '…'}</span>
            )}
          </button>
        ))}
      </div>
      {viewing !== null && <ShotViewer urls={urls} start={viewing} title={title} onClose={() => setViewing(null)} />}
    </>
  );
}

/** The enquiry's own column: nothing at all when it was typed in, or not this person's to see. */
export function EnquiryScreenshots({ enquiryId, className = '' }) {
  const [shots, setShots] = useState(null);
  useEffect(() => {
    let live = true;
    setShots(null);
    enquiriesApi.source(enquiryId).then((data) => live && setShots(data)).catch(() => {});
    return () => { live = false; };
  }, [enquiryId]);
  const load = useCallback((n) => enquiriesApi.sourceImage(enquiryId, n), [enquiryId]);
  if (!shots?.images) return null;
  return (
    <section className={`card p-4 ${className}`} aria-label="Screenshots">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-steel-100">Screenshots</h2>
        <span className="text-xs text-steel-500">{SHOT_KIND[shots.kind] || 'Screenshot'} · {shots.images}</span>
      </div>
      <ShotStrip shots={shots} load={load} />
      <p className="mt-2 text-xs text-steel-500">
        What the enquiry was made from{shots.at ? `, ${formatDate(shots.at)}` : ''}. Click one to enlarge.
        {shots.caption ? <span className="mt-1 block text-steel-400">“{shots.caption}”</span> : null}
      </p>
    </section>
  );
}

/**
 * On a task: the screenshots once forwarded to it. Not forwarded, the enquiry's marketing person
 * or Admin sees Forward the screenshots (`withForward` — the task's own panel, not every card in a list).
 */
export function TaskScreenshots({ task, withForward = false, onChanged }) {
  const { toast } = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const taskId = task?._id;
  const wanted = Boolean(task?.enquiry) && (task.shotsForwarded || withForward);
  useEffect(() => {
    let live = true;
    setState(null);
    if (wanted) taskShotsApi.of(taskId).then((data) => live && setState(data)).catch(() => {});
    return () => { live = false; };
  }, [taskId, wanted, task?.shotsForwarded]);
  const load = useCallback((n) => taskShotsApi.image(taskId, n), [taskId]);
  if (!state) return null;

  const forward = async () => {
    setBusy(true);
    try {
      setState(await taskShotsApi.forward(taskId));
      toast('Screenshots forwarded', 'They now show on this task.');
      onChanged?.();
    } catch {
      /* The reason is said by the request's own message. */
    } finally {
      setBusy(false);
    }
  };

  if (state.forwarded && state.shots?.images) {
    return (
      <div className="rounded-lg border border-line/[0.06] p-2.5">
        <p className="mb-1.5 text-xs font-semibold text-steel-400">
          Screenshots from the enquiry <span className="font-normal text-steel-500">· {SHOT_KIND[state.shots.kind] || 'Screenshot'} · click to enlarge</span>
        </p>
        <ShotStrip shots={state.shots} load={load} size="sm" />
      </div>
    );
  }
  if (state.mayForward && state.shots?.images) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line/[0.12] p-2.5 text-xs text-steel-400">
        <span>The enquiry was made from {state.shots.images === 1 ? 'a screenshot' : `${state.shots.images} screenshots`} — not shown on this task.</span>
        <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={forward}>
          {busy ? 'Forwarding…' : 'Forward the screenshots'}
        </button>
      </div>
    );
  }
  return null;
}

/**
 * A row's small picture: the first screenshot forwarded to the task, with how many there are; a
 * click opens them big. For the queues and desk tables — Production, Printing, Assembly, Dispatch,
 * the SO desk — where a strip would crowd the row. Nothing when none were forwarded.
 */
export function TaskShotThumb({ task, className = '' }) {
  const taskId = task?._id;
  const forwarded = Boolean(task?.shotsForwarded);
  const [shots, setShots] = useState(null);
  const [first, setFirst] = useState(null);
  const [urls, setUrls] = useState(null);
  useEffect(() => {
    let live = true;
    let made;
    setShots(null);
    setFirst(null);
    if (forwarded && taskId) {
      taskShotsApi.of(taskId)
        .then((data) => {
          if (!live || !data?.shots?.images) return null;
          setShots(data.shots);
          return taskShotsApi.image(taskId, 0).then((blob) => {
            if (!live) return;
            made = URL.createObjectURL(blob);
            setFirst(made);
          });
        })
        .catch(() => {});
    }
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [taskId, forwarded]);
  useEffect(() => () => (urls || []).forEach((url) => url && URL.revokeObjectURL(url)), [urls]);
  if (!shots) return null;

  const open = async (event) => {
    event.stopPropagation();
    event.preventDefault();
    const loaded = await Promise.all(Array.from({ length: shots.images }, (unused, n) => taskShotsApi.image(taskId, n)
      .then((blob) => URL.createObjectURL(blob)).catch(() => null)));
    setUrls(loaded);
  };
  const title = SHOT_KIND[shots.kind] || 'Screenshot';
  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`relative inline-flex h-12 w-9 flex-none overflow-hidden rounded-md border border-line/[0.15] bg-ink-900 align-middle transition hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}
        aria-label={`Screenshots from the enquiry (${shots.images}) — click to enlarge`}
        title={`${title} the enquiry was made from — click to enlarge`}
      >
        {first ? <img src={first} alt="" className="h-full w-full object-cover object-top" /> : <span className="m-auto text-xs text-steel-500">…</span>}
        {shots.images > 1 && (
          <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/70 px-1 text-xs font-bold leading-4 text-white">{shots.images}</span>
        )}
      </button>
      {urls && <ShotViewer urls={urls} title={title} onClose={() => setUrls(null)} />}
    </>
  );
}
