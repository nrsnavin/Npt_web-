import { useCallback, useState } from 'react';
import { customers as customersApi, enquiries as enquiriesApi, moulds as mouldsApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import Combobox from './Combobox.jsx';
import CustomerQuickCreate from './CustomerQuickCreate.jsx';
import MouldQuickCreate from './MouldQuickCreate.jsx';

/**
 * Reference-data selects.
 *
 * These used to load the first two hundred records into a `<select>` and filter in the
 * browser, on the reasoning that the register runs to a few dozen tools and a marketing
 * person's customer list is smaller still. That reasoning expires: the two hundred and first
 * customer could not be selected at all, and nothing on screen said why.
 *
 * Each one now searches server-side through `Combobox`. The API already knows how to search
 * and page all three collections, so this is the same query the list screens run.
 */

/** How many matches to offer at once. Enough to browse, few enough to read. */
const PAGE = 20;

/**
 * Picks the model, which is to say the tool that makes it.
 *
 * There is no product catalogue behind this any more. A model *is* a mould — the code, the
 * size, the category, the hook and the minimum are all facts about the steel — so this reads
 * the register, and choosing here is what tells a costing which tool's consumption to price
 * from. Leaving it empty is a real answer, and a common one: a new development has no tool
 * yet, and a traded piece never will.
 *
 * `allowCreate` puts a model on the register without leaving the form. On by default for the
 * same reason as the customer picker — a sample is often the first time a model exists — but
 * offered only to someone who may actually write the register, which now means production and
 * sampling rather than marketing. That is a deliberate narrowing: minting a tool that does not
 * exist on the floor is exactly what the catalogue's `mouldAvailable` tick used to allow.
 */
export function MouldSelect({
  value,
  onChange,
  disabled,
  includeBlank = 'Select a model…',
  allowCreate = true,
  ...rest
}) {
  const { canWrite } = useAuth();
  const [creating, setCreating] = useState(null);
  const mayCreate = allowCreate && !disabled && canWrite('moulds');

  const loadOptions = useCallback(
    (search) => mouldsApi.list({ search: search || undefined, isActive: true, limit: PAGE }),
    []
  );
  const loadOne = useCallback((id) => mouldsApi.get(id), []);
  const toOption = useCallback(
    (mould) => ({ value: mould._id, label: `${mould.mouldCode} — ${mould.name}` }),
    []
  );

  return (
    <>
      <Combobox
        value={value}
        onChange={onChange}
        disabled={disabled}
        loadOptions={loadOptions}
        loadOne={loadOne}
        toOption={toOption}
        placeholder="Search the register…"
        emptyLabel={includeBlank}
        noMatchLabel="No model matches"
        onCreate={mayCreate ? (typed) => setCreating(typed ?? '') : undefined}
        createLabel="Add a new model"
        {...rest}
      />

      <MouldQuickCreate
        open={creating !== null}
        initialName={creating || ''}
        onClose={() => setCreating(null)}
        // Selected the moment it exists: adding it was only ever a way of choosing it.
        onCreated={(mould) => onChange(mould._id)}
      />
    </>
  );
}

/**
 * `allowCreate` adds a customer without leaving the form. On by default: every place that
 * asks for a customer is a place where the buyer may not be in the master yet, and being
 * sent away to add one is how a half-filled form gets abandoned.
 *
 * `emptyLabel` is what "no customer" is called. It reads as a real choice rather than as a
 * placeholder wherever leaving it blank is a legitimate answer — a sample raised at the
 * counter, or an internal trial that belongs to nobody.
 */
export function CustomerSelect({
  value,
  onChange,
  allowCreate = true,
  emptyLabel = 'Select a customer…',
  ...rest
}) {
  const { canWrite } = useAuth();
  const [creating, setCreating] = useState(null);
  // The sample team holds customers at read only, and is exactly who raises counter
  // requests. Offering them a form that ends in a refusal helps nobody.
  const mayCreate = allowCreate && canWrite('customers');

  const loadOptions = useCallback(
    (search) => customersApi.list({ search: search || undefined, limit: PAGE }),
    []
  );
  /*
   * The customer detail route answers with `{ customer, timeline }` rather than the customer
   * alone — it is what the detail screen needs. Unwrapped here, or resolving an already-chosen
   * customer by id yields a record with no name and the box renders empty.
   */
  const loadOne = useCallback(
    (id) => customersApi.get(id).then((data) => data?.customer || data),
    []
  );
  const toOption = useCallback(
    (customer) => ({ value: customer._id, label: customer.name, hint: customer.code }),
    []
  );

  return (
    <>
      <Combobox
        value={value}
        onChange={onChange}
        loadOptions={loadOptions}
        loadOne={loadOne}
        toOption={toOption}
        placeholder="Search a customer…"
        emptyLabel={emptyLabel}
        noMatchLabel="No customer matches"
        onCreate={mayCreate ? (typed) => setCreating(typed ?? '') : undefined}
        createLabel="Add a new customer"
        {...rest}
      />

      <CustomerQuickCreate
        open={creating !== null}
        initialName={creating || ''}
        onClose={() => setCreating(null)}
        // Selected the moment it exists: adding it was only ever a way of choosing it.
        onCreated={(customer) => onChange(customer._id)}
      />
    </>
  );
}

/** Open enquiries only: a sample is never raised against one that is already won or lost. */
export function EnquirySelect({ value, onChange, customer, ...rest }) {
  // Filtered by the server rather than in the browser. Narrowing a page of results locally
  // is how a customer's enquiry goes missing when it happens to fall on the second page.
  const loadOptions = useCallback(
    (search) =>
      enquiriesApi.list({
        search: search || undefined,
        open: 'true',
        customer: customer || undefined,
        limit: PAGE,
      }),
    [customer]
  );
  const loadOne = useCallback((id) => enquiriesApi.get(id), []);
  const toOption = useCallback(
    (enquiry) => ({
      value: enquiry._id,
      label: `${enquiry.number} — ${enquiry.customer?.name || 'No customer'}`,
      hint: enquiry.requirement?.modelNumber,
    }),
    []
  );

  return (
    <Combobox
      value={value}
      onChange={onChange}
      loadOptions={loadOptions}
      loadOne={loadOne}
      toOption={toOption}
      placeholder="Search an open enquiry…"
      emptyLabel="No enquiry — this is a standalone request"
      noMatchLabel={
        customer
          ? 'That customer has no open enquiry. Won and lost ones are not offered.'
          : 'No open enquiry matches'
      }
      {...rest}
    />
  );
}
