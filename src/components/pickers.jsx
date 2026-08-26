import { useEffect, useState } from 'react';
import { customers as customersApi, products as productsApi } from '../api/endpoints.js';

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
