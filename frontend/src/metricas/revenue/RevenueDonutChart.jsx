import React, { useId, useMemo } from "react";
import { formatNum, formatRevenueMoney, formatRevenuePct } from "../format";

const COLOR_FLUJO = "#5eead4";
const COLOR_RM = "#a78bfa";
const COLOR_RM_GLOW = "rgba(167, 139, 250, 0.26)";

const SIZE = 206;
const STROKE = 16;
const GAP_PX = 3;
const CHART_PX = 206;
const CHART_PX_MOBILE = 184;

function pctShare(part, whole) {
  const p = Number(part) || 0;
  const w = Number(whole) || 0;
  if (w <= 0) return 0;
  return Math.round((p / w) * 1000) / 10;
}

function ventasLabel(n) {
  const v = Number(n);
  const count = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  return `${formatNum(count)} venta${count === 1 ? "" : "s"}`;
}

function DonutSvg({ flujoArc, rmArc, circumference, ready }) {
  const gradId = useId().replace(/:/g, "");
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - STROKE) / 2;
  const track = circumference;

  const flujoOffset = ready ? 0 : track;
  const rmOffset = ready ? -(flujoArc + GAP_PX) : track;

  return (
    <svg
      className="revenueDonutChart__svg"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`flujoGrad-${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor={COLOR_FLUJO} />
        </linearGradient>
        <linearGradient id={`rmGrad-${gradId}`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor={COLOR_RM} />
        </linearGradient>
      </defs>
      <circle
        className="revenueDonutChart__track"
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        strokeWidth={STROKE}
      />
      {flujoArc > 0.5 ? (
        <circle
          className="revenueDonutChart__ring revenueDonutChart__ring--flujo"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#flujoGrad-${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${flujoArc} ${track - flujoArc}`}
          strokeDashoffset={flujoOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}
      {rmArc > 0.5 ? (
        <circle
          className="revenueDonutChart__ring revenueDonutChart__ring--rm"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#rmGrad-${gradId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${rmArc} ${track - rmArc}`}
          strokeDashoffset={rmOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ) : null}
    </svg>
  );
}

function LegendKpiCard({ variant, emoji, title, pct, money, ventas }) {
  return (
    <li className={`revenueDonutChart__kpiCard revenueDonutChart__kpiCard--${variant}`}>
      <div className="revenueDonutChart__kpiHead">
        <span className="revenueDonutChart__kpiEmoji" aria-hidden="true">
          {emoji}
        </span>
        <span className="revenueDonutChart__kpiTitle">{title}</span>
      </div>
      <span className="revenueDonutChart__kpiPct">{pct}%</span>
      <strong className="revenueDonutChart__kpiMoney">{money}</strong>
      <span className="revenueDonutChart__kpiVentas">{ventas}</span>
    </li>
  );
}

export default function RevenueDonutChart({ kpis, moneda = "BOB", loading = false }) {
  const ingresosFlujo = Number(kpis?.ingresosFlujo) || 0;
  const ingresosRemarketing = Number(kpis?.ingresosRemarketing) || 0;

  let total = Number(kpis?.totalIngresos);
  if (!Number.isFinite(total)) total = 0;

  let totalCantidad = Number(kpis?.totalCantidad);
  if (!Number.isFinite(totalCantidad)) totalCantidad = 0;

  let cantidadFlujo = Number(kpis?.cantidadFlujo);
  if (!Number.isFinite(cantidadFlujo)) cantidadFlujo = 0;

  let cantidadRemarketing = Number(kpis?.cantidadRemarketing);
  if (!Number.isFinite(cantidadRemarketing)) cantidadRemarketing = 0;

  const rmPctGlobal = kpis?.porcentajeIngresosRemarketing;
  const showRmBadge = rmPctGlobal != null && Number.isFinite(Number(rmPctGlobal));

  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  const { flujoArc, rmArc } = useMemo(() => {
    if (total <= 0) return { flujoArc: 0, rmArc: 0 };
    const flujoShare = Math.max(0, ingresosFlujo / total);
    const rmShare = Math.max(0, ingresosRemarketing / total);
    const halfGap = GAP_PX / 2;
    return {
      flujoArc: Math.max(0, circumference * flujoShare - halfGap),
      rmArc: Math.max(0, circumference * rmShare - halfGap),
    };
  }, [total, ingresosFlujo, ingresosRemarketing, circumference]);

  const pctFlujo = pctShare(ingresosFlujo, total);
  const pctRm = pctShare(ingresosRemarketing, total);

  if (loading) {
    return (
      <div className="revenueDonutChart" aria-hidden="true">
        <style>{donutStyles}</style>
        <div className="revenueDonutChart__skel" />
      </div>
    );
  }

  if (!kpis) return null;

  if (total <= 0) {
    return (
      <div
        className="revenueDonutChart revenueDonutChart--empty"
        role="img"
        aria-label="Sin datos de flujo vs remarketing"
      >
        <style>{donutStyles}</style>
        <div className="revenueDonutChart__head">
          <h3 className="revenueDonutChart__title">Flujo vs Remarketing</h3>
        </div>
        <p className="revenueDonutChart__emptyMsg">No hay datos suficientes</p>
      </div>
    );
  }

  const rmBadgeText = showRmBadge
    ? `+${formatRevenuePct(rmPctGlobal)} revenue RM`
    : null;

  return (
    <div
      className="revenueDonutChart revenueDonutChart--ready"
      role="img"
      aria-label="Distribución de ingresos flujo vs remarketing"
    >
      <style>{donutStyles}</style>

      <div className="revenueDonutChart__head">
        <h3 className="revenueDonutChart__title">Flujo vs Remarketing</h3>
        {rmBadgeText ? (
          <span className="revenueDonutChart__rmBadge">{rmBadgeText}</span>
        ) : null}
      </div>

      <div className="revenueDonutChart__body">
        <div className="revenueDonutChart__chartCol">
            <div className="revenueDonutChart__chartWrap">
            <DonutSvg
              flujoArc={flujoArc}
              rmArc={rmArc}
              circumference={circumference}
              ready
            />
            <div className="revenueDonutChart__center">
              <span className="revenueDonutChart__centerLabel">TOTAL</span>
              <strong className="revenueDonutChart__centerMoney">
                {formatRevenueMoney(total, moneda)}
              </strong>
              <span className="revenueDonutChart__centerVentas">
                {ventasLabel(totalCantidad)}
              </span>
            </div>
          </div>
        </div>

        <ul className="revenueDonutChart__legend">
          <LegendKpiCard
            variant="flujo"
            emoji="🟢"
            title="Flujo normal"
            pct={pctFlujo}
            money={formatRevenueMoney(ingresosFlujo, moneda)}
            ventas={ventasLabel(cantidadFlujo)}
          />
          <LegendKpiCard
            variant="rm"
            emoji="🟣"
            title="Remarketing"
            pct={pctRm}
            money={formatRevenueMoney(ingresosRemarketing, moneda)}
            ventas={ventasLabel(cantidadRemarketing)}
          />
        </ul>
      </div>
    </div>
  );
}

const donutStyles = `
.revenueDonutChart {
  margin-bottom: 10px;
  padding: 10px 12px 11px;
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(255,255,255,.045), rgba(15,23,42,.4));
  border: 1px solid rgba(148,163,184,.1);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.02) inset,
    0 10px 28px rgba(0,0,0,.2);
}
.revenueDonutChart__skel {
  min-height: 168px;
  max-width: 420px;
  border-radius: 12px;
  background: rgba(255,255,255,.06);
}
.revenueDonutChart__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.revenueDonutChart__title {
  margin: 0;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #e2e8f0;
}
.revenueDonutChart__rmBadge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  color: #ddd6fe;
  background: linear-gradient(135deg, rgba(168,85,247,.14), rgba(124,58,237,.07));
  border: 1px solid rgba(168,85,247,.18);
  box-shadow: 0 0 12px ${COLOR_RM_GLOW};
}
.revenueDonutChart__body {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}
.revenueDonutChart__chartCol {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}
.revenueDonutChart__chartWrap {
  position: relative;
  width: ${CHART_PX}px;
  height: ${CHART_PX}px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.revenueDonutChart__glow {
  display: none;
}
.revenueDonutChart__svg {
  display: block;
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}
.revenueDonutChart__track {
  stroke: rgba(30, 41, 59, 0.9);
}
.revenueDonutChart__ring {
  transition: none;
}
.revenueDonutChart--ready .revenueDonutChart__ring--flujo,
.revenueDonutChart--ready .revenueDonutChart__ring--rm {
  animation: none;
}
.revenueDonutChart__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  pointer-events: none;
  padding: 0 16px;
  z-index: 2;
  gap: 1px;
}
.revenueDonutChart__centerLabel {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
}
.revenueDonutChart__centerMoney {
  font-size: 18px;
  font-weight: 900;
  color: #f8fafc;
  line-height: 1.12;
  letter-spacing: -0.02em;
}
.revenueDonutChart__centerVentas {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  margin-top: 2px;
}
.revenueDonutChart__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 0 1 auto;
  min-width: 0;
  width: 188px;
}
.revenueDonutChart__kpiCard {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 10px;
  border-radius: 11px;
  border: 1px solid rgba(148,163,184,.1);
  background: linear-gradient(165deg, rgba(255,255,255,.05), rgba(15,23,42,.32));
}
.revenueDonutChart__kpiCard--flujo {
  border-color: rgba(45, 212, 191, 0.14);
  box-shadow: 0 0 16px rgba(45, 212, 191, 0.05);
}
.revenueDonutChart__kpiCard--rm {
  border-color: rgba(167, 139, 250, 0.14);
  box-shadow: 0 0 16px rgba(167, 139, 250, 0.05);
}
.revenueDonutChart__kpiHead {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 2px;
  width: 100%;
}
.revenueDonutChart__kpiEmoji {
  font-size: 11px;
  line-height: 1;
  flex-shrink: 0;
}
.revenueDonutChart__kpiTitle {
  font-size: 11px;
  font-weight: 800;
  color: #cbd5e1;
  line-height: 1.2;
}
.revenueDonutChart__kpiPct {
  font-size: 18px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.03em;
  line-height: 1.1;
}
.revenueDonutChart__kpiMoney {
  font-size: 12px;
  font-weight: 900;
  color: #e2e8f0;
  line-height: 1.25;
}
.revenueDonutChart__kpiVentas {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  line-height: 1.3;
}
.revenueDonutChart--empty {
  text-align: center;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.revenueDonutChart__emptyMsg {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
}
@media (max-width: 560px) {
  .revenueDonutChart__body {
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }
  .revenueDonutChart__chartWrap {
    width: ${CHART_PX_MOBILE}px;
    height: ${CHART_PX_MOBILE}px;
  }
  .revenueDonutChart__legend {
    width: 100%;
    max-width: 280px;
  }
}
`;
