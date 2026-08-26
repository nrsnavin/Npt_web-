import { useEffect, useState } from 'react';
import { customers as customersApi, enquiries as enquiriesApi, products as productsApi } from '../api/endpoints.js';

/**
 * Reference-data selects.
 *
 * Both load their whole (small) list once and filter in the browser. The catalogue runs to
 * a few dozen models and a marketing person's customer list is smaller still, so a
 * type-ahead round trip would add latency without adding anything.
 */

const useOptions = (loader) => {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((response) => {
        if (!cancelled) setOptions(response.data || []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  return options;
};

const loadProducts = () => productsApi.list({ limit: 200, isActive: true });
const loadCustomers = () => customersApi.list({ limit: 200 });

export function ProductSelect({ value, onChange, disabled, includeBlank = 'Select a model…', ...rest }) {
  const products = useOptions(loadProducts);

  return (
    <select
      className="input"
      value={value || ''}
      onChange={(event) => onChange(event.target.value || undefined)}
      disabled={disabled}
      {...rest}
    >
      <option value="">{includeBlank}</option>
      {products.map((product) => (
        <option key={product._id} value={product._id}>
          {product.modelCode} — {product.name}
        </option>
      ))}
    </select>
  );
}

export function CustomerSelect({ value, onChange, ...rest }) {
  const customers = useOptions(loadCustomers);

  return (
    <select
      className="input"
      value={value || ''}
      onChange={(event) => onChange(event.target.value || undefined)}
      {...rest}
    >
      <option value="">Select a customer…</option>
      {customers.map((customer) => (
        <option key={customer._id} value={customer._id}>
          {customer.name} ({customer.code})
        </option>
      ))}
    </select>
  );
}

const loadOpenEnquiries = () => enquiriesApi.list({ limit: 200, open: 'true' });

/** Open enquiries only: a sample is never raised against one that is already won or lost. */
export function EnquirySelect({ value, onChange, customer, ...rest }) {
  const enquiries = useOptions(loadOpenEnquiries);
  // When the sample already names a customer, only that customer's enquiries can match.
  const visible = customer
    ? enquiries.filter((enquiry) => (enquiry.customer?._id || enquiry.customer) === customer)
    : enquiries;

  return (
    <>
      <select
        className="input"
        value={value || ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        {...rest}
      >
        <option value="">No enquiry — this is a standalone request</option>
        {visible.map((enquiry) => (
          <option key={enquiry._id} value={enquiry._id}>
            {enquiry.number} — {enquiry.customer?.name} · {enquiry.requirement?.modelNumber}
          </option>
        ))}
      </select>

      {/* A select holding only its placeholder explains nothing on its own. */}
      {customer && visible.length === 0 && (
        <p className="mt-1.5 text-xs text-steel-500">
          That customer has no open enquiry to attach this to. Won and lost ones are not
          offered — raise a new enquiry if the work is live again.
        </p>
      )}
    </>
  );
}
