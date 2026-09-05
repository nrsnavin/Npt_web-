import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dispatches as dispatchApi } from '../api/endpoints.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Notice, Section } from './ui.jsx';
import { DispatchDialog } from './DispatchForm.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import { dispatchStageLabel } from '../utils/pipeline.js';

/**
 * Where this order's goods are [BLUEPRINT §19].
 *
 * The panel §19 is actually about. Marketing is promised that the moment a lorry leaves they see
 * the quantity, the invoice, the LR and the transporter — without ringing the gate to ask. So
 * this sits on the *order*, on the order's own read grant, and shows the same facts despatch
 * typed rather than a summary of them.
 *
 * The bar across the top is the whole story in one line: **packed, held, gone, free**. Those
 * four numbers answer every question a buyer asks about a part delivery, and the one that is
 * least obvious is the third — *held* is material a consignment has claimed but not yet taken,
 * which is why a line can show 32,000 packed and nothing free.
 *
 * Despatch gets a button; nobody else does. Which pieces travel together on one lorry is their
 * judgement, and a marketing person raising a consignment would be committing a vehicle they
 * cannot see.
 */

/** The four figures, drawn as one bar so they read as parts of a whole rather than four stats. */
function StockBar({ meta }) {
  const total = Math.max(1, meta.readyQty || 0);
  const width = (value) => `${Math.min(100, ((value || 0) / total) * 100)}%`;

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-line/[0.08]">
        <div className="bg-success-500/70" style={{ width: width(meta.dispatched) }} />
        <div className="bg-warn-500/70" style={{ width: width(meta.reserved) }} />
        <div className="bg-flame-500/70" style={{ width: width(meta.available) }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="text-steel-400">
          Packed <span className="tabular-nums font-semibold text-steel-100">{formatNumber(meta.readyQty || 0)}</span>
        </span>
        <span className="text-success-400">
          Gone <span className="tabular-nums font-semibold">{formatNumber(meta.dispatched || 0)}</span>
        </span>
        <span className="text-warn-400">
          Held <span className="tabular-nums font-semibold">{formatNumber(meta.reserved || 0)}</span>
        </span>
        <span className="text-flame-400">
          Free to send <span className="tabular-nums font-semibold">{formatNumber(meta.available || 0)}</span>
        </span>
      </div>
    </div>
  );
}

export default function DispatchTracker({ order }) {
  const { canWrite } = useAuth();
  const [rows, setRows] = useState(null);
  const [stock, setStock] = useState([]);
  const [meta, setMeta] = useState({});
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await dispatchApi.onOrder(order._id);
      setRows(response.data);
      setStock(response.stock || []);
      setMeta(response.meta || {});
    } catch (loadError) {
      setError(loadError);
      setRows([]);
    }
  }, [order._id]);

  useEffect(() => {
    load();
  }, [load, order.status]);

  const mayDispatch = canWrite('dispatch');

  return (
    <Section
      title="Where the goods are"
      actions={
        mayDispatch && (
          <button
            type="button"
            className="btn-secondary px-3 py-1.5"
            disabled={!(meta.available > 0)}
            onClick={() => setRaising(true)}
          >
            Send some
          </button>
        )
      }
    >
      {rows === null && <p className="text-sm text-steel-500">Loading…</p>}

      {rows !== null && (
        <>
          {(meta.readyQty || 0) > 0 ? (
            <StockBar meta={meta} />
          ) : (
            <p className="text-sm text-steel-500">
              Nothing is packed yet. Material appears here as the plant records it, and despatch
              is told the moment it does.
            </p>
          )}

          {/*
            Per line beneath the total, because a two-model order finishes and ships at two
            different times — an order-level figure describes neither of them.
          */}
          {stock.length > 1 && (meta.readyQty || 0) > 0 && (
            <ul className="mt-4 space-y-1 border-t border-line/[0.06] pt-3">
              {stock.map((line) => (
                <li key={String(line.orderLine)} className="flex flex-wrap items-baseline gap-x-3 text-xs">
                  <span className="font-semibold text-steel-200">{line.modelNumber || 'Unnamed'}</span>
                  <span className="text-steel-500">
                    {formatNumber(line.dispatched)} of {formatNumber(line.quantity)} sent
                  </span>
                  {line.available > 0 && (
                    <span className="text-flame-400">{formatNumber(line.available)} free</span>
                  )}
                  {line.fullyShipped && <span className="text-success-400">complete</span>}
                </li>
              ))}
            </ul>
          )}

          {rows.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line/[0.06] pt-3">
              {rows.map((dispatch) => (
                <li
                  key={dispatch._id}
                  className="rounded-lg border border-line/[0.07] p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <Link to={`/dispatches/${dispatch._id}`} className="text-sm font-semibold text-steel-100 hover:text-accent">
                      {dispatch.number}
                    </Link>
                    <Badge status={dispatch.status}>{dispatchStageLabel(dispatch.status)}</Badge>
                  </div>

                  <p className="mt-1 text-xs text-steel-400">
                    {formatNumber(dispatch.dispatchQty)} pcs
                    {dispatch.lines?.length > 1 ? ` · ${dispatch.lines.length} models` : ''}
                    {dispatch.destination?.city ? ` · ${dispatch.destination.city}` : ''}
                  </p>

                  {/*
                    §19's promise, kept: the four facts marketing is owed the moment it leaves,
                    on the order screen rather than down a phone line.
                  */}
                  {dispatch.dispatchDate && (
                    <p className="mt-1.5 text-xs text-steel-500">
                      Left {formatDate(dispatch.dispatchDate)}
                      {dispatch.invoice?.number ? ` · invoice ${dispatch.invoice.number}` : ''}
                      {dispatch.lrNumber ? ` · LR ${dispatch.lrNumber}` : ''}
                      {dispatch.ownVehicle ? ' · our own vehicle' : dispatch.transporter ? ` · ${dispatch.transporter}` : ''}
                      {dispatch.vehicleNumber ? ` · ${dispatch.vehicleNumber}` : ''}
                    </p>
                  )}

                  {dispatch.isOverdue && (
                    <p className="mt-1 text-xs font-semibold text-danger-400">
                      Was due {formatDate(dispatch.expectedDeliveryDate)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <Notice tone="danger"><p>{error.message}</p></Notice>}

      <DispatchDialog
        order={order}
        stock={stock}
        open={raising}
        onClose={() => setRaising(false)}
        onRaised={() => {
          setRaising(false);
          load();
        }}
      />
    </Section>
  );
}
