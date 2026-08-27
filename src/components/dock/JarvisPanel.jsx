import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { jarvis } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DockIcon from './DockIcon.jsx';

/**
 * Ask Jarvis — the plant, in a sentence.
 *
 * The question this answers is the one somebody asks walking between the office and the
 * bench: what is late, what came in, where is SMP-2026-0004. Every one of those is already
 * on a screen, and finding the screen is the friction — three clicks and a filter to learn
 * something that fits in a line.
 *
 * Two decisions shape it.
 *
 * **Every answer shows its records.** The sentence is the summary; underneath it are the real
 * rows, each a link. Nobody should have to take a number on trust, and the first time one
 * turns out to be wrong with no way to check it, the feature is finished.
 *
 * **The suggestions are the documentation.** An empty text box that answers some questions
 * and not others teaches nothing, and people give up after two misses. The openers are real
 * questions that work, so the first thing anybody does is a success.
 */

/** Real questions, phrased the way somebody would actually type them. */
const OPENERS = [
  { label: 'What is overdue?', question: 'what is overdue on the bench' },
  { label: 'New enquiries this week', question: 'any new enquiries this week' },
  { label: 'Follow-ups due', question: 'what follow-ups are due' },
  { label: 'Open samples', question: 'how many samples are open' },
];

function Rows({ rows, total }) {
  if (!rows?.length) return null;

  return (
    <div className="mt-2 space-y-1">
      {rows.map((row) => (
        <Link
          key={row._id}
          to={row.link}
          className="block rounded-lg border border-line/[0.06] px-2.5 py-1.5 transition-colors hover:bg-line/[0.05]"
        >
          <p className="truncate text-[0.8125rem] font-semibold text-steel-100">{row.title}</p>
          <p className="truncate text-[0.6875rem] text-steel-400">
            {row.subtitle}
            {row.meta && <span className="text-steel-500"> · {row.meta}</span>}
          </p>
        </Link>
      ))}
      {/* A list that stops at eight without saying so is the panel disagreeing with the books. */}
      {total > rows.length && (
        <p className="px-1 pt-0.5 text-[0.6875rem] text-steel-500">
          Showing {rows.length} of {total}.
        </p>
      )}
    </div>
  );
}

export default function JarvisPanel() {
  const { user } = useAuth();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The newest answer is the one being read, and it arrives at the bottom.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const send = async (text) => {
    const asked = (text ?? question).trim();
    if (!asked || busy) return;

    setQuestion('');
    setBusy(true);
    setTurns((current) => [...current, { role: 'you', text: asked }]);

    try {
      const result = await jarvis.ask(asked);
      setTurns((current) => [
        ...current,
        { role: 'jarvis', text: result.answer, rows: result.rows, total: result.total },
      ]);
    } catch (error) {
      /*
       * A failure is shown in the thread rather than as a banner. The question it belongs to
       * is right above it, and an error floating elsewhere on the screen loses that.
       */
      setTurns((current) => [...current, { role: 'jarvis', text: error.message, failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!turns.length && (
          <div>
            <p className="text-[0.8125rem] leading-relaxed text-steel-300">
              Ask me about samples, enquiries, leads or customers
              {user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Every figure comes straight
              from the records, with the rows behind it.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OPENERS.map((opener) => (
                <button
                  key={opener.question}
                  type="button"
                  onClick={() => send(opener.question)}
                  className="rounded-full border border-line/[0.08] px-2.5 py-1 text-[0.6875rem] font-semibold text-steel-300 transition-colors hover:border-flame-500/40 hover:text-steel-100"
                >
                  {opener.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, index) => (
          <div key={index} className={turn.role === 'you' ? 'flex justify-end' : ''}>
            {turn.role === 'you' ? (
              <p className="max-w-[85%] rounded-xl rounded-br-sm bg-flame-500/15 px-3 py-1.5 text-[0.8125rem] text-steel-100">
                {turn.text}
              </p>
            ) : (
              <div className="max-w-full">
                <p
                  className={`text-[0.8125rem] leading-relaxed ${
                    turn.failed ? 'text-danger-400' : 'text-steel-200'
                  }`}
                >
                  {turn.text}
                </p>
                <Rows rows={turn.rows} total={turn.total} />
              </div>
            )}
          </div>
        ))}

        {busy && <p className="text-[0.8125rem] text-steel-500">Looking…</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t border-line/[0.06] px-3 py-2.5"
      >
        <input
          ref={inputRef}
          className="input flex-1 !py-1.5 text-[0.8125rem]"
          placeholder="What is overdue?"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!question.trim() || busy}
          aria-label="Ask"
          className="rounded-md p-1.5 text-flame-500 transition-colors hover:bg-line/[0.06] disabled:opacity-40"
        >
          <DockIcon name="send" className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
