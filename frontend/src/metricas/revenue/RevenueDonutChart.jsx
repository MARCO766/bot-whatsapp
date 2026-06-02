import React, { useId, useMemo } from "react";
import { formatRevenueMoney, formatRevenuePct } from "../format";

const COLOR_FLUJO = "#5eead4";
const COLOR_FLUJO_GLOW = "rgba(45, 212, 191, 0.45)";
const COLOR_RM = "#a78bfa";
const COLOR_RM_GLOW = "rgba(167, 139, 250, 0.4)";

const SIZE = 168;
const STROKE = 14;
const GAP_PX = 3;

function pctShare(part, whole) {
  const p = Number(part) || 0;
  const w = Number(whole) || 0;
  if (w <= 0) return 0;
  return Math.round((p / w) * 1000) / 10;
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
      width={SIZE}
      height={SIZE}
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

export default function RevenueDonutChart({ kpis, moneda = "BOB", loading = false }) {
  const ingresosFlujo = Number(kpis?.ingresosFlujo) || 0;
  const ingresosRemarketing = Number(kpis?.ingresosRemarketing) || 0;

  let total = Number(kpis?.totalIngresos);
  if (!Number.isFinite(total)) total = 0;

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

  return (
    <div
      className="revenueDonutChart revenueDonutChart--ready"
      role="img"
      aria-label="Distribución de ingresos flujo vs remarketing"
    >
      <style>{donutStyles}</style>

      <div className="revenueDonutChart__head">
        <h3 className="revenueDonutChart__title">Flujo vs Remarketing</h3>
        {showRmBadge ? (
          <span className="revenueDonutChart__rmBadge">RM {formatRevenuePct(rmPctGlobal)}</span>
        ) : null}
      </div>

      <div className="revenueDonutChart__body">
        <div className="revenueDonutChart__chartWrap">
          <div className="revenueDonutChart__glow revenueDonutChart__glow--flujo" />
          <div className="revenueDonutChart__glow revenueDonutChart__glow--rm" />
          <DonutSvg
            flujoArc={flujoArc}
            rmArc={rmArc}
            circumference={circumference}
            ready
          />
          <div className="revenueDonutChart__center">
            <span className="revenueDonutChart__centerLabel">Total</span>
            <strong>{formatRevenueMoney(total, moneda)}</strong>
          </div>
        </div>

        <ul className="revenueDonutChart__legend">
          <li>
            <span className="revenueDonutChart__dot revenueDonutChart__dot--flujo" aria-hidden="true" />
            <div className="revenueDonutChart__legendText">
              <span className="revenueDonutChart__legendName">Flujo</span>
              <span className="revenueDonutChart__legendPct">{pctFlujo}%</span>
            </div>
            <span className="revenueDonutChart__legendMoney">
              {formatRevenueMoney(ingresosFlujo, moneda)}
            </span>
          </li>
          <li>
            <span className="revenueDonutChart__dot revenueDonutChart__dot--rm" aria-hidden="true" />
            <div className="revenueDonutChart__legendText">
              <span className="revenueDonutChart__legendName">Remarketing</span>
              <span className="revenueDonutChart__legendPct">{pctRm}%</span>
            </div>
            <span className="revenueDonutChart__legendMoney">
              {formatRevenueMoney(ingresosRemarketing, moneda)}
            </span>
          </li>
        </ul>
      </div>

      <p className="revenueDonutChart__footer">{formatRevenueMoney(total, moneda)} total</p>
    </div>
  );
}

const donutStyles = `
.revenueDonutChart {
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(255,255,255,.04), rgba(15,23,42,.42));
  border: 1px solid rgba(148,163,184,.1);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.02) inset,
    0 12px 32px rgba(0,0,0,.22);
  animation: revenueDonutFadeUp .45s ease both;
}
@keyframes revenueDonutFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.revenueDonutChart__skel {
  min-height: 200px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,.04) 0%,
    rgba(255,255,255,.08) 50%,
    rgba(255,255,255,.04) 100%
  );
  background-size: 200% 100%;
  animation: revenueDonutShimmer 1.2s ease-in-out infinite;
}
@keyframes revenueDonutShimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
.revenueDonutChart__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
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
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  color: #c4b5fd;
  background: linear-gradient(135deg, rgba(168,85,247,.16), rgba(124,58,237,.08));
  border: 1px solid rgba(168,85,247,.2);
  box-shadow: 0 0 18px ${COLOR_RM_GLOW};
}
.revenueDonutChart__body {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(160px, 1.1fr);
  gap: 12px 16px;
  align-items: center;
}
.revenueDonutChart__chartWrap {
  position: relative;
  width: 100%;
  max-width: 200px;
  margin: 0 auto;
  aspect-ratio: 1;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 0 14px ${COLOR_FLUJO_GLOW});
}
.revenueDonutChart__glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0.35;
  filter: blur(28px);
}
.revenueDonutChart__glow--flujo {
  width: 55%;
  height: 55%;
  left: 8%;
  top: 18%;
  background: ${COLOR_FLUJO_GLOW};
}
.revenueDonutChart__glow--rm {
  width: 48%;
  height: 48%;
  right: 6%;
  bottom: 12%;
  background: ${COLOR_RM_GLOW};
}
.revenueDonutChart__svg {
  display: block;
  position: relative;
  z-index: 1;
}
.revenueDonutChart__track {
  stroke: rgba(30, 41, 59, 0.85);
}
.revenueDonutChart__ring {
  transition: stroke-dashoffset 0.95s cubic-bezier(0.22, 1, 0.36, 1);
}
.revenueDonutChart--ready .revenueDonutChart__ring--flujo {
  animation: revenueDonutDrawFlujo 0.95s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.revenueDonutChart--ready .revenueDonutChart__ring--rm {
  animation: revenueDonutDrawRm 0.95s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
}
@keyframes revenueDonutDrawFlujo {
  from { stroke-dashoffset: ${2 * Math.PI * ((SIZE - STROKE) / 2)}; opacity: 0.4; }
  to { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes revenueDonutDrawRm {
  from { opacity: 0.35; }
  to { opacity: 1; }
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
  padding: 0 12px;
  z-index: 2;
}
.revenueDonutChart__centerLabel {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  margin-bottom: 2px;
}
.revenueDonutChart__center strong {
  font-size: 15px;
  font-weight: 900;
  color: #f1f5f9;
  line-height: 1.2;
}
.revenueDonutChart__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.revenueDonutChart__legend li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(148,163,184,.08);
}
.revenueDonutChart__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.revenueDonutChart__dot--flujo {
  background: linear-gradient(135deg, #34d399, ${COLOR_FLUJO});
  box-shadow: 0 0 10px ${COLOR_FLUJO_GLOW};
}
.revenueDonutChart__dot--rm {
  background: linear-gradient(135deg, #8b5cf6, ${COLOR_RM});
  box-shadow: 0 0 10px ${COLOR_RM_GLOW};
}
.revenueDonutChart__legendText {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.revenueDonutChart__legendName {
  font-size: 12px;
  font-weight: 800;
  color: #cbd5e1;
}
.revenueDonutChart__legendPct {
  font-size: 13px;
  font-weight: 900;
  color: #f8fafc;
}
.revenueDonutChart__legendMoney {
  font-size: 11px;
  font-weight: 700;
  color: #94a3b8;
  white-space: nowrap;
}
.revenueDonutChart__footer {
  margin: 10px 0 0;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
}
.revenueDonutChart--empty {
  text-align: center;
  min-height: 120px;
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
    grid-template-columns: 1fr;
  }
  .revenueDonutChart__chartWrap {
    max-width: 180px;
  }
}
`;
