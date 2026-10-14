import { useState } from 'react';
import { Link } from 'react-router-dom';
import { enquiries as enquiriesApi } from '../api/endpoints.js';
import { FormError, Modal, Notice, Section } from './ui.jsx';
import { CustomerSelect } from './pickers.jsx';
import { CustomerForm } from '../pages/Customers.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/* `+919840070001` read as a person would say it; anything not Indian shown as stored. */
const phoneText = (phone) => {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone || '');
  return match ? `+91 ${match[1]} ${match[2]}` : phone || '';
};

function Person({ role, name, phone, email, note }) {
  return (
    <div className="rounded-lg border border-line/[0.08] px-3 py-2.5">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-steel-400">{role}</p>
      {name || phone || email ? (
        <>
          {name && <p className="mt-0.5 text-sm font-semibold text-steel-100">{name}</p>}
          {phone && (
            <a href={`tel:${phone}`} className="block text-sm text-steel-200 hover:text-accent">{phoneText(phone)}</a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="block truncate text-sm text-steel-200 hover:text-accent">{email}</a>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-sm text-steel-500">Not given</p>
      )}
      {note && <p className="mt-0.5 text-xs text-steel-500">{note}</p>}
    </div>
  );
}

/* Delivery or accounts: the order contact when the buyer said so, its own person when one was given. */
function rolePerson(contact, order) {
  if (contact?.sameAsOrder) return { ...order, note: 'Same as order contact' };
  if (contact?.name || contact?.phone) return { name: contact.name, phone: contact.phone };
  return { ...order, note: 'Not given — the order contact' };
}

/**
 * Who to talk to about this enquiry [server: Customer `deliveryContact`, `accountsContact`]: the
 * order contact, who receives the goods, and who settles the bill. Before the buyer is a
 * customer it is the prospect as taken down on the call, with the way to convert them.
 */
export default function BuyerContactCard({ enquiry, canConvert, onConverted }) {
  const { opensCustomer } = useAuth();
  const [converting, setConverting] = useState(false);
  const customer = enquiry.customer;

  if (!customer) {
    const prospect = enquiry.prospect || {};
    return (
      <Section title="Contact">
        <Notice tone="warn">
          Not a customer yet. Convert to a customer before a sample, a quotation or an order.
        </Notice>
        <div className="mt-3 space-y-2">
          <Person
            role="Prospect"
            name={[prospect.name, prospect.contactPerson].filter(Boolean).join(' · ')}
            phone={prospect.mobile || prospect.whatsapp}
            email={prospect.email}
            note={[prospect.whatsapp && prospect.whatsapp !== prospect.mobile ? `WhatsApp ${phoneText(prospect.whatsapp)}` : null, prospect.city].filter(Boolean).join(' · ') || undefined}
          />
        </div>
        {canConvert && (
          <button type="button" className="btn-primary mt-3 w-full" onClick={() => setConverting(true)}>
            Convert to customer
          </button>
        )}
        <ConvertToCustomer
          open={converting}
          enquiry={enquiry}
          onClose={() => setConverting(false)}
          onConverted={onConverted}
        />
      </Section>
    );
  }

  const primary = customer.contacts?.find((contact) => contact.isPrimary) || customer.contacts?.[0];
  const order = {
    name: primary?.name || customer.name,
    phone: primary?.mobile || customer.mobile || customer.whatsapp,
    email: primary?.email || customer.email,
  };
  return (
    <Section title="Contact card">
      <p className="-mt-1 mb-2 text-xs text-steel-400">
        {opensCustomer(customer)
          ? <Link to={`/customers/${customer._id}`} className="font-semibold text-steel-200 hover:text-accent">{customer.name}</Link>
          : <span className="font-semibold text-steel-200">{customer.name}</span>}
        {customer.code ? ` · ${customer.code}` : ''}
      </p>
      <div className="space-y-2">
        <Person role="Order contact" {...order} note={customer.whatsapp && customer.whatsapp !== order.phone ? `WhatsApp ${phoneText(customer.whatsapp)}` : undefined} />
        <Person role="Delivery contact" {...rolePerson(customer.deliveryContact, order)} />
        <Person role="Accounts & Payments" {...rolePerson(customer.accountsContact, order)} />
      </div>
    </Section>
  );
}

/**
 * Making the prospect a customer: a new one, the form filled from what the enquiry took down,
 * or one already on the register. A number that is already a customer's offers that customer.
 */
function ConvertToCustomer({ open, enquiry, onClose, onConverted }) {
  const [mode, setMode] = useState('new');
  const [existing, setExisting] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const prospect = enquiry.prospect || {};

  const close = () => {
    setError(null);
    setFound(null);
    onClose();
  };
  const done = (result) => {
    onConverted?.(result);
    close();
  };

  const link = async (customerId) => {
    setError(null);
    setSaving(true);
    try {
      done(await enquiriesApi.convert({ id: enquiry._id, customer: customerId }));
    } catch (failure) {
      setError(failure);
    } finally {
      setSaving(false);
    }
  };

  const create = async (payload) => {
    try {
      return await enquiriesApi.convert({ id: enquiry._id, ...payload });
    } catch (failure) {
      /* Already a customer with that number or GST: offer it, rather than leave them to find it. */
      if (failure.status === 409 && failure.details?.existing) setFound(failure.details.existing);
      throw failure;
    }
  };

  return (
    <Modal
      open={open}
      title="Convert to customer"
      description={`${enquiry.number}${enquiry.groupRef ? ' and the other models from the same conversation' : ''} move to the customer`}
      size="lg"
      onClose={close}
    >
      <div role="radiogroup" aria-label="Convert how" className="mb-4 flex flex-wrap gap-2">
        {[['new', 'New customer'], ['existing', 'Already on the register']].map(([value, label]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${mode === value ? 'border-accent bg-accent/10 text-steel-50' : 'border-line/[0.12] text-steel-300'}`}
          >
            <input type="radio" name="convert-mode" checked={mode === value} onChange={() => setMode(value)} />
            {label}
          </label>
        ))}
      </div>

      {found && (
        <div className="mb-4">
          <Notice tone="warn">
            {found.name} ({found.code}) is already a customer with these details.{' '}
            <button type="button" className="font-semibold underline" disabled={saving} onClick={() => link(found._id)}>
              Link the enquiry to {found.name}
            </button>
          </Notice>
        </div>
      )}

      {mode === 'new' ? (
        <CustomerForm
          /* Everything the call took down, so nothing is typed twice: the company, the person
             and their numbers, the city, where the enquiry came from, and whose it is. */
          customer={{
            name: prospect.name || '',
            mobile: prospect.mobile || prospect.whatsapp || '',
            whatsapp: prospect.whatsapp || prospect.mobile || '',
            email: prospect.email || '',
            city: prospect.city || '',
            orderContact: prospect.contactPerson || '',
            contacts: prospect.contactPerson
              ? [{ name: prospect.contactPerson, mobile: prospect.mobile || prospect.whatsapp || '', email: prospect.email || '', isPrimary: true }]
              : [],
            source: enquiry.source || 'manual',
            assignedTo: enquiry.assignedTo?._id || enquiry.assignedTo || undefined,
            notes: enquiry.remarks ? `From ${enquiry.number}: ${enquiry.remarks}` : '',
          }}
          onCreate={create}
          submitLabel="Create customer and convert"
          ownerFixed
          onClose={close}
          onSaved={(result) => onConverted?.(result)}
        />
      ) : (
        <div className="space-y-4">
          <CustomerSelect value={existing} onChange={setExisting} allowCreate={false} aria-label="Customer" />
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!existing || saving} onClick={() => link(existing)}>
              {saving ? 'Converting…' : 'Link and convert'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
