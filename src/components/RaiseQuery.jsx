import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { queries as queriesApi } from '../api/endpoints.js';
import { Field, FormError, Modal, Notice } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import ParticipantPicker, { describeParticipant, useParticipantOptions } from './ParticipantPicker.jsx';

/**
 * Asking a question about a buyer.
 *
 * Three things are required and the form refuses without them, because each is what makes the
 * thread findable or answerable later: the customer it is about, what is actually being asked,
 * and at least one person or department to ask. A query addressed to nobody is a note to self,
 * and the to-do dock already exists for those.
 *
 * The customer is a dropdown rather than free text for the same reason it is required on the
 * record: it is how the thread is found again six weeks later, and it is what decides who may
 * see it. A typed company name would be neither.
 */
export default function RaiseQuery({ open, customer, onClose, onRaised }) {
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(customer || '');
  const [asked, setAsked] = useState([]);
  const { options, loading } = useParticipantOptions();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    if (!open) return;
    reset({ subject: '', question: '' });
    setChosen(customer || '');
    setAsked([]);
    setError(null);
  }, [open, customer, reset]);

  /* The same person twice is a no-op the server refuses, so it is refused here rather than
     collected and turned into an error message after the question has been typed. */
  const add = (row) => {
    const already = asked.some(
      (entry) => entry.department === row.department && (entry.user || '') === (row.user || '')
    );
    if (!already) setAsked((rows) => [...rows, row]);
  };

  const submit = async (values) => {
    setError(null);
    try {
      const created = await queriesApi.create({
        customer: chosen,
        subject: values.subject.trim(),
        question: values.question.trim(),
        participants: asked,
      });
      onRaised?.(created);
      onClose();
    } catch (failure) {
      setError(failure);
    }
  };

  return (
    <Modal open={open} title="Ask a question" size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-4">
        <p className="text-xs leading-relaxed text-steel-500">
          Everybody you ask can see the thread, reply to it, and pull somebody else in. They will
          also be able to open this customer&rsquo;s record.
        </p>

        <Field label="About which customer" required>
          {/*
            Creating a buyer from inside a question is off: a query is a conversation about a
            customer somebody already deals with, and a thread is not the place a firm should
            first appear in the master.
          */}
          <CustomerSelect value={chosen} onChange={setChosen} allowCreate={false} />
        </Field>

        <Field label="Subject" error={errors.subject?.message} required>
          <input
            className="input"
            placeholder="September invoice disputed"
            {...register('subject', {
              required: 'A line somebody can recognise in a list',
              maxLength: { value: 200, message: 'Keep it to a line — the detail goes below' },
            })}
          />
        </Field>

        <Field label="The question" error={errors.question?.message} required>
          <textarea
            className="input min-h-[7rem]"
            placeholder="The buyer says the September load was short by 1,000 pcs. What actually went on the lorry, and do we have the signed LR?"
            {...register('question', { required: 'What do you need to know?' })}
          />
        </Field>

        <div className="rounded-lg border border-line/[0.06] p-4">
          <ParticipantPicker options={options} loading={loading} onAdd={add} disabled={isSubmitting} />

          {asked.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {asked.map((row, index) => (
                <span
                  key={`${row.department || ''}-${row.user || ''}`}
                  className="inline-flex items-center gap-2 rounded-md bg-line/[0.06] px-2.5 py-1 text-xs text-steel-300"
                >
                  {describeParticipant(row, options)}
                  <button
                    type="button"
                    className="text-steel-500 hover:text-danger-400"
                    aria-label={`Remove ${describeParticipant(row, options)}`}
                    onClick={() => setAsked((rows) => rows.filter((_, at) => at !== index))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Said before the press rather than after the refusal: both are conditions the server
            enforces, and meeting a refusal is a poor way to learn what a form needed. */}
        {!asked.length && <Notice tone="warn">Choose at least one department or person to ask.</Notice>}

        <FormError error={error} />

        <div className="flex justify-end gap-2 border-t border-line/[0.06] pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn-primary"
            disabled={isSubmitting || !chosen || !asked.length}
          >
            {isSubmitting ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
