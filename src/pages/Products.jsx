import CrudPage from '../components/CrudPage.jsx';
import { products } from '../api/endpoints.js';
import { formatCurrency, formatNumber, humanise } from '../utils/format.js';

const HANGER_TYPES = ['shirt', 'trouser', 'suit', 'skirt', 'kids', 'lingerie', 'coat', 'multi', 'accessory'];
const MATERIALS = ['plastic', 'wood', 'metal', 'velvet', 'acrylic', 'recycled_pp'];
const FINISHES = ['glossy', 'matte', 'chrome', 'painted', 'natural', 'flocked'];
const HOOKS = ['fixed', 'swivel', 'metal_swivel', 'plastic'];

export default function Products() {
  return (
    <CrudPage
      title="Hanger catalogue"
      subtitle="Finished goods with moulding parameters and price list"
      resourceKey="products"
      resource={products}
      entityName="hanger"
      writeRoles={['production', 'inventory']}
      searchPlaceholder="Search SKU, name, colour…"
      defaultParams={{ sort: 'sku' }}
      formSize="lg"
      filters={[
        {
          key: 'hangerType',
          label: 'All types',
          options: HANGER_TYPES.map((type) => ({ value: type, label: humanise(type) })),
        },
        {
          key: 'material',
          label: 'All materials',
          options: MATERIALS.map((material) => ({ value: material, label: humanise(material) })),
        },
      ]}
      columns={[
        {
          key: 'sku',
          header: 'SKU',
          render: (row) => (
            <div>
              <p className="font-medium text-steel-50">{row.name}</p>
              <p className="text-xs text-steel-500">{row.sku}</p>
            </div>
          ),
        },
        { key: 'hangerType', header: 'Type', render: (row) => humanise(row.hangerType) },
        {
          key: 'spec',
          header: 'Spec',
          render: (row) => (
            <span className="text-xs text-steel-300">
              {humanise(row.material)} · {row.sizeMm}mm · {row.color}
            </span>
          ),
        },
        {
          key: 'mould',
          header: 'Mould',
          render: (row) =>
            row.moldNumber ? (
              <span className="text-xs">
                {row.moldNumber} · {row.cavitiesPerCycle} cav · {row.cycleTimeSeconds}s
              </span>
            ) : (
              '—'
            ),
        },
        {
          key: 'unitPrice',
          header: 'Price',
          className: 'text-right',
          render: (row) => formatCurrency(row.unitPrice),
        },
        {
          key: 'standardCost',
          header: 'Cost',
          className: 'text-right',
          render: (row) => (
            <span className="text-steel-400">{formatCurrency(row.standardCost)}</span>
          ),
        },
        {
          key: 'margin',
          header: 'Margin',
          className: 'text-right',
          render: (row) => {
            if (!row.unitPrice) return '—';
            const margin = ((row.unitPrice - row.standardCost) / row.unitPrice) * 100;
            return (
              <span className={margin < 20 ? 'font-medium text-warn-400' : 'text-success-400'}>
                {margin.toFixed(1)}%
              </span>
            );
          },
        },
        {
          key: 'reorderLevel',
          header: 'Reorder at',
          className: 'text-right',
          render: (row) => formatNumber(row.reorderLevel),
        },
      ]}
      fields={[
        { name: 'sku', label: 'SKU', required: true, uppercase: true },
        { name: 'name', label: 'Product name', required: true },
        {
          name: 'hangerType',
          label: 'Hanger type',
          type: 'select',
          required: true,
          defaultValue: 'shirt',
          options: HANGER_TYPES.map((type) => ({ value: type, label: humanise(type) })),
        },
        {
          name: 'material',
          label: 'Material',
          type: 'select',
          required: true,
          defaultValue: 'plastic',
          options: MATERIALS.map((material) => ({ value: material, label: humanise(material) })),
        },
        { name: 'sizeMm', label: 'Size (mm)', type: 'number', required: true },
        { name: 'color', label: 'Colour', defaultValue: 'Black' },
        {
          name: 'finish',
          label: 'Finish',
          type: 'select',
          defaultValue: 'glossy',
          options: FINISHES.map((finish) => ({ value: finish, label: humanise(finish) })),
        },
        {
          name: 'hookType',
          label: 'Hook type',
          type: 'select',
          defaultValue: 'fixed',
          options: HOOKS.map((hook) => ({ value: hook, label: humanise(hook) })),
        },
        { name: 'weightGrams', label: 'Weight (g)', type: 'number' },
        { name: 'moldNumber', label: 'Mould number' },
        { name: 'cavitiesPerCycle', label: 'Cavities per cycle', type: 'number', defaultValue: 1 },
        { name: 'cycleTimeSeconds', label: 'Cycle time (s)', type: 'number', defaultValue: 30 },
        { name: 'unitPrice', label: 'Selling price (₹)', type: 'number', required: true },
        { name: 'standardCost', label: 'Standard cost (₹)', type: 'number', defaultValue: 0 },
        { name: 'taxPercent', label: 'GST %', type: 'number', defaultValue: 18 },
        { name: 'packSize', label: 'Pack size', type: 'number', defaultValue: 100 },
        { name: 'reorderLevel', label: 'Reorder level', type: 'number', defaultValue: 0 },
        { name: 'description', label: 'Description', type: 'textarea', span: 2 },
      ]}
    />
  );
}
