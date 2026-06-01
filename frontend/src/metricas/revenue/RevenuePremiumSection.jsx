import React, { useEffect, useMemo, useState } from "react";
import { useRevenueBreakdown } from "../useRevenueBreakdown";
import {
  REVENUE_PERIODOS,
  pickDefaultMoneda,
  sortMonedasRevenue,
} from "../format";
import RevenueMonedaTabs from "./RevenueMonedaTabs";
import RevenueKpiStrip from "./RevenueKpiStrip";
import RevenueBreakdownColumn from "./RevenueBreakdownColumn";

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
  flujoId = "",
  conexionSeleccionadaId = null,
  conexionesLoading = false,
}) {
  const [periodoApi, setPeriodoApi] = useState("7d");
  const [monedaActiva, setMonedaActiva] = useState("BOB");

  const { data, loading, error, reload } = useRevenueBreakdown(
    periodoApi,
    flujoId,
    conexionSeleccionadaId,
    conexionesLoading
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
        <div>
          <span className="eyebrow">Revenue intelligence</span>
          <h2 id="revenue-premium-title">💰 Ingresos Premium</h2>
          <p className="revenuePremiumHint">
            Desglose por origen y tipo de conversión. Moneda y periodo independientes del embudo
            clásico.
          </p>
        </div>
        <div className="revenuePremiumControls">
          {monedas.length > 0 && (
            <div className="revenueControlGroup">
              <label className="revenueControlLabel">Moneda</label>
              <RevenueMonedaTabs
                monedas={monedas}
                value={monedaActiva}
                onChange={setMonedaActiva}
                disabled={loading || !!error}
              />
            </div>
          )}
          <div className="revenueControlGroup">
            <label className="revenueControlLabel">Periodo</label>
            <div className="periodos">
              {REVENUE_PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={periodoApi === p.id ? "active" : ""}
                  onClick={() => setPeriodoApi(p.id)}
                  disabled={loading}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
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
            />
          </div>
        </>
      )}
    </section>
  );
}

const sectionStyles = `
.revenuePremiumSection {
  margin-bottom: 18px;
  animation: fadeUp .35s ease both;
}
.revenuePremiumHead {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.revenuePremiumHead h2 {
  margin: 8px 0 6px;
  font-size: 22px;
}
.revenuePremiumHint {
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
  max-width: 520px;
  line-height: 1.45;
}
.revenuePremiumControls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
}
.revenueControlGroup {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.revenueControlLabel {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.revenueMonedaTabs {
  justify-content: flex-end;
}
.revenueKpiGrid {
  margin-bottom: 18px;
}
.revenueBreakdownGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.revenueBreakdownCol {
  padding: 16px;
  border-radius: 22px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(148,163,184,.1);
}
.revenueBreakdownColHead h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.revenueBreakdownColHead p {
  margin: 0 0 10px;
  color: #94a3b8;
  font-size: 12px;
}
.revenueBreakdownSubtotal {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}
.revenueBreakdownSubtotal strong {
  font-size: 18px;
  color: #e2e8f0;
}
.revenueBreakdownSubtotal span {
  color: #94a3b8;
  font-size: 12px;
}
.revenueTipoGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.revenueTipoCard {
  flex-direction: column;
  align-items: flex-start;
}
.revenueTipoCard h3 {
  font-size: 18px !important;
}
.revenueTipoCard--empty {
  opacity: 0.55;
}
.revenueTipoSkel {
  min-height: 90px;
}
.revenueErrorCard {
  text-align: center;
  padding: 28px 20px;
  border-color: rgba(239,68,68,.25);
  background: linear-gradient(135deg, rgba(239,68,68,.08), rgba(15,23,42,.85));
}
.revenueErrorCard h2 {
  margin: 10px 0 8px;
  font-size: 18px;
}
.revenueErrorCard p {
  color: #94a3b8;
  margin: 0 0 16px;
  font-size: 13px;
}
@media (max-width: 900px) {
  .revenueBreakdownGrid { grid-template-columns: 1fr; }
  .revenuePremiumControls { align-items: stretch; width: 100%; }
  .revenueControlGroup { align-items: stretch; }
  .revenueMonedaTabs { justify-content: flex-start; }
}
@media (max-width: 760px) {
  .revenueKpiGrid { grid-template-columns: 1fr; }
  .revenueTipoGrid { grid-template-columns: 1fr; }
}
`;
