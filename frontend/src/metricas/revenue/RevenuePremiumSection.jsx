import React, { useEffect, useMemo, useState } from "react";
import { useRevenueBreakdown } from "../useRevenueBreakdown";
import {
  pickDefaultMoneda,
  sortMonedasRevenue,
} from "../format";
import RevenueMonedaTabs from "./RevenueMonedaTabs";
import RevenueKpiStrip from "./RevenueKpiStrip";
import RevenueBreakdownColumn from "./RevenueBreakdownColumn";
import RevenueDonutChart from "./RevenueDonutChart";
import RevenueTipoComparisonChart from "./RevenueTipoComparisonChart";

function RevenueErrorCard({ message, onRetry }) {
  return (
    <div className="revenueErrorCard panelCard">
      <span className="eyebrow">Ingresos premium</span>
      <h2>No se pudo cargar el desglose</h2>
      <p>{message}</p>
      <button type="button" className="refreshBtn" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

export default function RevenuePremiumSection({
  periodo = "7d",
  customRange = null,
  flujoId = "",
  conexionSeleccionadaId = null,
  conexionesLoading = false,
}) {
  const [monedaActiva, setMonedaActiva] = useState("BOB");

  const { data, loading, error, reload } = useRevenueBreakdown(
    periodo,
    flujoId,
    conexionSeleccionadaId,
    conexionesLoading,
    customRange
  );

  const monedas = useMemo(
    () => sortMonedasRevenue(Object.keys(data?.porMoneda || {})),
    [data?.porMoneda]
  );

  useEffect(() => {
    if (!monedas.length) return;
    if (!monedas.includes(monedaActiva)) {
      setMonedaActiva(pickDefaultMoneda(data?.porMoneda));
    }
  }, [monedas, monedaActiva, data?.porMoneda]);

  const bucket = data?.porMoneda?.[monedaActiva];
  const kpis = bucket?.kpis;
  const sinMonedas = !loading && !error && monedas.length === 0;

  return (
    <section className="revenuePremiumSection panelCard" aria-labelledby="revenue-premium-title">
      <style>{sectionStyles}</style>

      <div className="revenuePremiumHead">
        <div className="revenuePremiumTitleBlock">
          <h2 id="revenue-premium-title">💰 Ingresos Premium</h2>
          <p className="revenuePremiumHint">
            Inteligencia de ventas por flujo y remarketing
          </p>
        </div>
        <div className="revenuePremiumControls">
          {monedas.length > 0 && (
            <RevenueMonedaTabs
              monedas={monedas}
              value={monedaActiva}
              onChange={setMonedaActiva}
              disabled={loading || !!error}
            />
          )}
        </div>
      </div>

      {error && !loading ? (
        <RevenueErrorCard message={error} onRetry={reload} />
      ) : sinMonedas ? (
        <div className="emptyBlock">
          <span>💰</span>
          <strong>Sin ingresos clasificados</strong>
          <p>
            No hay conversiones con metadata de origen/tipo en este periodo. Registra ventas desde
            flujo o remarketing.
          </p>
        </div>
      ) : (
        <>
          <RevenueKpiStrip kpis={kpis} moneda={monedaActiva} loading={loading} />

          <RevenueDonutChart kpis={kpis} moneda={monedaActiva} loading={loading} />

          <RevenueTipoComparisonChart
            flujoBucket={bucket?.flujo}
            remarketingBucket={bucket?.remarketing}
            moneda={monedaActiva}
            loading={loading}
          />

          <div className="revenueBreakdownGrid">
            <RevenueBreakdownColumn
              title="Flujo normal"
              subtitle="Ventas del embudo principal"
              origenBucket={bucket?.flujo}
              moneda={monedaActiva}
              loading={loading}
            />
            <RevenueBreakdownColumn
              title="Remarketing"
              subtitle="Recuperación y ventas RM"
              origenBucket={bucket?.remarketing}
              moneda={monedaActiva}
              loading={loading}
              rmRevenuePct={kpis?.porcentajeIngresosRemarketing}
            />
          </div>
        </>
      )}
    </section>
  );
}

const sectionStyles = `
.revenuePremiumSection {
  margin-bottom: 14px;
  padding: 14px 16px;
  border-radius: 20px;
  animation: fadeUp .35s ease both;
}
.revenuePremiumHead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(148,163,184,.08);
}
.revenuePremiumTitleBlock {
  min-width: 0;
  flex: 1 1 220px;
}
.revenuePremiumHead h2 {
  margin: 0 0 3px;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.revenuePremiumHint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.35;
}
.revenuePremiumControls {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  flex: 0 1 auto;
}
.revenuePremiumSection .revenueMonedaTabs {
  gap: 6px;
}
.revenuePremiumSection .revenueMonedaTabs button {
  height: 32px;
  padding: 0 11px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 800;
}
.revenuePremiumSection .revenueKpiGrid {
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 12px;
}
.revenuePremiumSection .revenueKpiGrid .mainCard {
  min-height: 0;
  padding: 10px 12px;
  border-radius: 14px;
}
.revenuePremiumSection .revenueKpiGrid .mainCard h2 {
  margin: 6px 0 2px;
  font-size: 20px;
  line-height: 1.15;
}
.revenuePremiumSection .revenueKpiGrid .cardTop {
  margin-bottom: 0;
  justify-content: space-between;
  align-items: center;
}
.revenuePremiumSection .revenueKpiGrid .icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 14px;
}
.revenuePremiumSection .revenueKpiTitle {
  font-size: 11px;
  font-weight: 800;
  color: #cbd5e1;
  letter-spacing: 0.02em;
}
.revenuePremiumSection .revenueKpiChip {
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(148,163,184,.1);
  line-height: 1.3;
}
.revenuePremiumSection .revenueKpiGrid .skelCard {
  min-height: 72px;
}
.revenueBreakdownGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.revenueBreakdownCol {
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(255,255,255,.045), rgba(15,23,42,.35));
  border: 1px solid rgba(148,163,184,.12);
}
.revenueBreakdownColHead {
  margin-bottom: 8px;
}
.revenueBreakdownColTitleRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.revenueBreakdownColHead h3 {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 900;
}
.revenueBreakdownColHead p {
  margin: 0;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.3;
}
.revenueRmBadge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  color: #c4b5fd;
  background: linear-gradient(135deg, rgba(168,85,247,.18), rgba(124,58,237,.1));
  border: 1px solid rgba(168,85,247,.22);
}
.revenueBreakdownSubtotal {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.revenueBreakdownSubtotal strong {
  font-size: 16px;
  color: #e2e8f0;
  font-weight: 900;
}
.revenueBreakdownSubtotal span {
  color: #94a3b8;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255,255,255,.05);
}
.revenueTipoGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.revenuePremiumSection .revenueTipoCard {
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 11px;
  border-radius: 12px;
  border: 1px solid rgba(148,163,184,.1);
  min-height: 0;
}
.revenuePremiumSection .revenueTipoCard h3 {
  margin: 4px 0 2px;
  font-size: 15px !important;
  font-weight: 900;
  line-height: 1.2;
}
.revenuePremiumSection .revenueTipoCard p {
  font-size: 12px;
  font-weight: 700;
  color: #cbd5e1;
}
.revenuePremiumSection .revenueTipoLabel {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.revenuePremiumSection .revenueTipoCard--venta {
  background: linear-gradient(135deg, rgba(34,197,94,.12), rgba(6,182,212,.07));
  border-color: rgba(34,197,94,.14);
}
.revenuePremiumSection .revenueTipoCard--upsell {
  background: linear-gradient(135deg, rgba(168,85,247,.13), rgba(139,92,246,.06));
  border-color: rgba(168,85,247,.14);
}
.revenuePremiumSection .revenueTipoCard--downsell {
  background: linear-gradient(135deg, rgba(249,115,22,.12), rgba(234,88,12,.06));
  border-color: rgba(249,115,22,.14);
}
.revenuePremiumSection .revenueTipoCard--recuperacion {
  background: linear-gradient(135deg, rgba(59,130,246,.11), rgba(6,182,212,.08));
  border-color: rgba(59,130,246,.14);
}
.revenuePremiumSection .revenueTipoCard--empty .revenueTipoMuted {
  opacity: 0.42;
}
.revenueTipoSkel {
  min-height: 68px;
  border-radius: 12px;
}
.revenuePremiumSection .emptyBlock {
  padding: 20px 16px;
  border-radius: 14px;
}
.revenueErrorCard {
  text-align: center;
  padding: 20px 16px;
  border-radius: 14px;
  border-color: rgba(239,68,68,.25);
  background: linear-gradient(135deg, rgba(239,68,68,.08), rgba(15,23,42,.85));
}
.revenueErrorCard h2 {
  margin: 8px 0 6px;
  font-size: 16px;
}
.revenueErrorCard p {
  color: #94a3b8;
  margin: 0 0 12px;
  font-size: 12px;
}
@media (max-width: 900px) {
  .revenueBreakdownGrid { grid-template-columns: 1fr; }
  .revenuePremiumHead { align-items: flex-start; }
  .revenuePremiumControls {
    width: 100%;
    justify-content: flex-start;
  }
}
@media (max-width: 760px) {
  .revenuePremiumSection .revenueKpiGrid { grid-template-columns: repeat(2, 1fr); }
  .revenueTipoGrid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .revenuePremiumSection .revenueKpiGrid { grid-template-columns: 1fr; }
}
`;
