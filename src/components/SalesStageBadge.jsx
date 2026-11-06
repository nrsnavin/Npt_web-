import { Badge } from './ui.jsx';
import { useHandoffCatalogue } from '../hooks/useHandoffCatalogue.js';
import { salesStageOf } from '../utils/salesStage.js';

/** The enquiry's sales stage — its sales status in the sales stages, the plant's stage past PO & SO [utils/salesStage.js]. */
export default function SalesStageBadge({ enquiry }) {
  const catalogue = useHandoffCatalogue();
  const { status, label } = salesStageOf(enquiry, catalogue?.stages || []);
  return <Badge status={status}>{label}</Badge>;
}
