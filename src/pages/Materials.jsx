import CrudPage from '../components/CrudPage.jsx';
import { materials } from '../api/endpoints.js';
import { formatCurrency, formatNumber, humanise } from '../utils/format.js';

const CATEGORIES = ['resin', 'masterbatch', 'metal_wire', 'wood', 'paint', 'flocking', 'packaging', 'consumable'];
const UOMS = ['kg', 'g', 'pcs', 'ltr', 'mtr', 'box', 'roll'];

export default function Materials() {
  return (
    <CrudPage
      title="Raw materials"
      subtitle="Resin, masterbatch, hook wire, wood and packaging"
      resourceKey="materials"
      resource={materials}
      entityName="material"
      writeRoles={['inventory', 'production']}
      searchPlaceholder="Search code or name…"
      defaultParams={{ sort: 'code' }}
      filters={[
        {
          key: 'category',
          label: 'All categories',
          options: CATEGORIES.map((category) => ({ value: category, label: humanise(category) })),
        },
      ]}
      columns={[
        {
          key: 'name',
          header: 'Material',
          render: (row) => (
            <div>
              <p className="font-medium text-slate-800">{row.name}</p>
              <p className="text-xs text-slate-400">{row.code}</p>
            </div>
          ),
        },
        { key: 'category', header: 'Category', render: (row) => humanise(row.category) },
        { key: 'uom', header: 'UOM' },
        {
          key: 'standardCost',
          header: 'Standard cost',
          className: 'text-right',
          render: (row) => `${formatCurrency(row.standardCost)} / ${row.uom}`,
        },
        {
          key: 'reorderLevel',
          header: 'Reorder at',
          className: 'text-right',
          render: (row) => formatNumber(row.reorderLevel),
        },
        {
          key: 'preferredSupplier',
          header: 'Preferred supplier',
          render: (row) => row.preferredSupplier?.name || '—',
        },
      ]}
      fields={[
        { name: 'code', label: 'Material code', required: true, uppercase: true },
        { name: 'name', label: 'Material name', required: true },
        {
          name: 'category',
          label: 'Category',
          type: 'select',
          required: true,
          defaultValue: 'resin',
          options: CATEGORIES.map((category) => ({ value: category, label: humanise(category) })),
        },
        {
          name: 'uom',
          label: 'Unit of measure',
          type: 'select',
          required: true,
          defaultValue: 'kg',
          options: UOMS.map((uom) => ({ value: uom, label: uom })),
        },
        { name: 'standardCost', label: 'Standard cost (₹)', type: 'number', defaultValue: 0 },
        { name: 'taxPercent', label: 'GST %', type: 'number', defaultValue: 18 },
        { name: 'reorderLevel', label: 'Reorder level', type: 'number', defaultValue: 0 },
        { name: 'reorderQuantity', label: 'Reorder quantity', type: 'number', defaultValue: 0 },
        { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
      ]}
    />
  );
}
