import { useState } from 'react';
import { payments as paymentsApi } from '../api/endpoints.js';
import { Field, FormError, Section } from './ui.jsx';

/**
 * Who to speak to about this money (role requirements §10: "Record the payment contact person").
 * Accounts keeps it; everyone who can see the payment can read it.
 */
export default function PaymentContact({ receivable, canWrite, onSaved }) {
  const contact = receivable.paymentContact || {};
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: contact.name || '', phone: contact.phone || '', email: contact.email || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSaved(await paymentsApi.setContact({ id: receivable._id, ...values }));
      setEditing(false);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Payment contact"
      actions={canWrite && !editing && (
        <button type="button" className="row-action" onClick={() => setEditing(true)}>{contact.name ? 'Change' : 'Add'}</button>
      )}
    >
      {editing ? (
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><input className="input" value={values.name} onChange={set('name')} placeholder="Mr Ravi, accounts" /></Field>
            <Field label="Phone"><input className="input" value={values.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><input type="email" className="input" value={values.email} onChange={set('email')} /></Field>
          </div>
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      ) : contact.name || contact.phone || contact.email ? (
        <p className="text-sm text-steel-200">
          <span className="font-semibold text-steel-100">{contact.name || 'No name'}</span>
          {contact.phone && <> · <a className="hover:text-accent" href={`tel:${contact.phone}`}>{contact.phone}</a></>}
          {contact.email && <> · <a className="hover:text-accent" href={`mailto:${contact.email}`}>{contact.email}</a></>}
        </p>
      ) : (
        <p className="text-sm text-steel-500">Nobody named yet. Add who to ask for, so every call starts with the right person.</p>
      )}
    </Section>
  );
}
