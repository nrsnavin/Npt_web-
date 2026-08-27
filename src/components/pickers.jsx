import { useCallback } from 'react';
import { customers as customersApi, enquiries as enquiriesApi, products as productsApi } from '../api/endpoints.js';
import Combobox from './Combobox.jsx';

/**
 * Reference-data selects.
 *
 * These used to load the first two hundred records into a `<select>` and filter in the
 * browser, on the reasoning that the catalogue runs to a few dozen models and a marketing
 * person's customer list is smaller still. That reasoning expires: the two hundred and first
 * customer could not be selected at all, and nothing on screen said why.
 *
 * Each one now searches server-side through `Combobox`. The API already knows how to search
 * and page all three collections, so this is the same query the list screens run.
 */

/** How many matches to offer at once. Enough to browse, few enough to read. */
const PAGE = 20;

export function ProductSelect({ value, onChange, disabled, includeBlank = 'Select a model…', ...rest }) {
  const loadOptions = useCallback(
    (search) => productsApi.list({ search: search || undefined, isActive: true, limit: PAGE }),
    []
  );
  const loadOne = useCallback((id) => productsApi.get(id), []);
  const toOption = useCallback(
    (product) => ({ value: product._id, label: `${product.modelCode} — ${product.name}` }),
    []
  );

  return (
    <Combobox
      value={value}
      onChange={onChange}
      disabled={disabled}
      loadOptions={loadOptions}
      loadOne={loadOne}
      toOption={toOption}
      placeholder={includeBlank}
      emptyLabel={includeBlank}
      noMatchLabel="No model matches"
      {...rest}
    />
  );
}

export function CustomerSelect({ value, onChange, ...rest }) {
  const loadOptions = useCallback(
    (search) => customersApi.list({ search: search || undefined, limit: PAGE }),
    []
  );
  const loadOne = useCallback((id) => customersApi.get(id), []);
  const toOption = useCallback(
    (customer) => ({ value: customer._id, label: customer.name, hint: customer.code }),
    []
  );

  return (
    <Combobox
      value={value}
      onChange={onChange}
      loadOptions={loadOptions}
      loadOne={loadOne}
      toOption={toOption}
      placeholder="Select a customer…"
      emptyLabel="Select a customer…"
      noMatchLabel="No customer matches"
      {...rest}
    />
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
