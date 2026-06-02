import React, { useMemo } from "react";
import {
  REVENUE_TIPOS,
  REVENUE_TIPO_LABELS,
  formatNum,
  formatRevenueMoney,
} from "../format";

const COLOR_FLUJO = "#5eead4";
const COLOR_FLUJO_GLOW = "rgba(45, 212, 191, 0.32)";
const COLOR_RM = "#a78bfa";
const COLOR_RM_GLOW = "rgba(167, 139, 250, 0.28)";
const MIN_BAR_PCT = 6;

function readCell(bucket, tipo) {
  const cell = bucket?.[tipo] || {};
  const ingresos = Number(cell.ingresos);
  const cantidad = Number(cell.cantidad);
  return {
    ingresos: Number.isFinite(ingresos) && ingresos >= 0 ? ingresos : 0,
    cantidad: Number.isFinite(cantidad) && cantidad >= 0 ? Math.round(cantidad) : 0,
  };
}

function ventasShort(n) {
  const c = Math.max(0, Math.round(Number(n) || 0));
  return `${formatNum(c)} venta${c === 1 ? "" : "s"}`;
}

function resolveBarWidth(value, maxGlobal, bothZero) {
  if (bothZero) return MIN_BAR_PCT;
  if (value <= 0) return 0;
  if (maxGlobal <= 0) return MIN_BAR_PCT;
  const pct = (value / maxGlobal) * 100;
  return Math.max(pct, 12);
}

function OriginLane({
  variant,
  emoji,
  label,
  ingresos,
  cantidad,
  maxGlobal,
  bothZero,
  moneda,
  ready,
  delayMs,
}) {
  const empty = ingresos <= 0 && cantidad <= 0;
  const widthPct = resolveBarWidth(ingresos, maxGlobal, bothZero);

  return (
    <div
      className={`revTipoCmp__lane revTipoCmp__lane--${variant}${empty ? " revTipoCmp__lane--empty" : ""}`}
      style={{ "--bar-delay": `${delayMs}ms` }}
    >
      <div className="revTipoCmp__laneHead">
        <span className="revTipoCmp__laneLabel">
          <span className="revTipoCmp__laneEmoji" aria-hidden="true">
            {emoji}
          </span>
          {label}
        </span>
        <div className="revTipoCmp__laneStats">
          <strong className="revTipoCmp__laneMoney">{formatRevenueMoney(ingresos, moneda)}</strong>
          <span className="revTipoCmp__laneVentas">{ventasShort(cantidad)}</span>
        </div>
      </div>
      <div className="revTipoCmp__barTrack" aria-hidden="true">
        <div
          className={`revTipoCmp__barFill revTipoCmp__barFill--${variant}${ready ? " revTipoCmp__barFill--ready" : ""}${bothZero ? " revTipoCmp__barFill--ghost" : ""}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function TipoKpiCard({
  tipo,
  flujo,
  rm,
  maxGlobal,
  moneda,
  ready,
  cardIndex,
}) {
  const bothZero =
    flujo.ingresos <= 0 &&
    flujo.cantidad <= 0 &&
    rm.ingresos <= 0 &&
    rm.cantidad <= 0;
  const baseDelay = cardIndex * 40;

  return (
    <article className={`revTipoCmp__card revTipoCmp__card--${tipo}`}>
      <h4 className="revTipoCmp__cardTitle">{REVENUE_TIPO_LABELS[tipo]}</h4>
      <OriginLane
        variant="flujo"
        emoji="🟢"
        label="Flujo"
        ingresos={flujo.ingresos}
        cantidad={flujo.cantidad}
        maxGlobal={maxGlobal}
        bothZero={bothZero}
        moneda={moneda}
        ready={ready}
        delayMs={baseDelay}
      />
      <OriginLane
        variant="rm"
        emoji="🟣"
        label="Remarketing"
        ingresos={rm.ingresos}
        cantidad={rm.cantidad}
        maxGlobal={maxGlobal}
        bothZero={bothZero}
        moneda={moneda}
        ready={ready}
        delayMs={baseDelay + 24}
      />
    </article>
  );
}

export default function RevenueTipoComparisonChart({
  flujoBucket,
  remarketingBucket,
  moneda = "BOB",
  loading = false,
}) {
  const rows = useMemo(
    () =>
      REVENUE_TIPOS.map((tipo) => ({
        tipo,
        flujo: readCell(flujoBucket, tipo),
        rm: readCell(remarketingBucket, tipo),
      })),
    [flujoBucket, remarketingBucket]
  );

  const maxGlobal = useMemo(() => {
    let max = 0;
    rows.forEach(({ flujo, rm }) => {
      max = Math.max(max, flujo.ingresos, rm.ingresos);
    });
    return max;
  }, [rows]);

  if (loading) {
    return (
      <div className="revTipoCmp" aria-hidden="true">
        <style>{chartStyles}</style>
        <div className="revTipoCmp__head">
          <h3 className="revTipoCmp__title">📊 Comparación por tipo de conversión</h3>
          <p className="revTipoCmp__subtitle">Flujo normal vs remarketing</p>
        </div>
        <div className="revTipoCmp__grid revTipoCmp__grid--skel">
          {REVENUE_TIPOS.map((tipo) => (
            <div key={tipo} className="revTipoCmp__skelCard" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className="revTipoCmp revTipoCmp--ready"
      aria-label="Comparación de ingresos por tipo: flujo normal vs remarketing"
    >
      <style>{chartStyles}</style>

      <div className="revTipoCmp__head">
        <h3 className="revTipoCmp__title">📊 Comparación por tipo de conversión</h3>
        <p className="revTipoCmp__subtitle">Flujo normal vs remarketing</p>
      </div>

      <div className="revTipoCmp__grid">
        {rows.map(({ tipo, flujo, rm }, i) => (
          <TipoKpiCard
            key={tipo}
            tipo={tipo}
            flujo={flujo}
            rm={rm}
            maxGlobal={maxGlobal}
            moneda={moneda}
            ready
            cardIndex={i}
          />
        ))}
      </div>
    </section>
  );
}

const chartStyles = `
.revTipoCmp {
  margin-bottom: 8px;
  padding: 9px 10px 10px;
  border-radius: 14px;
  background: linear-gradient(165deg, rgba(255,255,255,.04), rgba(15,23,42,.44));
  border: 1px solid rgba(148,163,184,.1);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.02) inset,
    0 6px 20px rgba(0,0,0,.16);
  animation: revTipoCmpFadeUp .38s ease both;
}
@keyframes revTipoCmpFadeUp {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
.revTipoCmp__head {
  margin-bottom: 7px;
}
.revTipoCmp__title {
  margin: 0 0 1px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #e2e8f0;
  line-height: 1.2;
}
.revTipoCmp__subtitle {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  color: #94a3b8;
  line-height: 1.25;
}
.revTipoCmp__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.revTipoCmp--ready .revTipoCmp__card {
  animation: revTipoCmpFadeUp .34s ease both;
}
.revTipoCmp__card {
  padding: 8px 9px 7px;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(255,255,255,.05), rgba(15,23,42,.38));
  border: 1px solid rgba(148,163,184,.1);
  min-width: 0;
}
.revTipoCmp__card--venta {
  border-color: rgba(34,197,94,.12);
  box-shadow: 0 0 14px rgba(34,197,94,.04);
}
.revTipoCmp__card--upsell {
  border-color: rgba(168,85,247,.12);
  box-shadow: 0 0 14px rgba(168,85,247,.04);
}
.revTipoCmp__card--downsell {
  border-color: rgba(249,115,22,.12);
  box-shadow: 0 0 14px rgba(249,115,22,.04);
}
.revTipoCmp__card--recuperacion {
  border-color: rgba(59,130,246,.12);
  box-shadow: 0 0 14px rgba(59,130,246,.04);
}
.revTipoCmp__cardTitle {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #cbd5e1;
  line-height: 1.15;
}
.revTipoCmp__lane {
  margin-bottom: 6px;
}
.revTipoCmp__lane:last-child {
  margin-bottom: 0;
}
.revTipoCmp__laneHead {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
}
.revTipoCmp__laneLabel {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  line-height: 1.2;
  flex-shrink: 0;
}
.revTipoCmp__laneEmoji {
  font-size: 8px;
  line-height: 1;
}
.revTipoCmp__laneStats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  min-width: 0;
  text-align: right;
}
.revTipoCmp__laneMoney {
  font-size: 12px;
  font-weight: 900;
  color: #f1f5f9;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.revTipoCmp__lane--flujo .revTipoCmp__laneMoney {
  color: #ccfbf1;
}
.revTipoCmp__lane--rm .revTipoCmp__laneMoney {
  color: #ede9fe;
}
.revTipoCmp__laneVentas {
  font-size: 9px;
  font-weight: 700;
  color: #64748b;
  line-height: 1.2;
}
.revTipoCmp__lane--empty .revTipoCmp__laneMoney,
.revTipoCmp__lane--empty .revTipoCmp__laneVentas {
  opacity: 0.42;
}
.revTipoCmp__barTrack {
  height: 11px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.9);
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.28);
}
.revTipoCmp__barFill {
  height: 100%;
  border-radius: 8px;
  width: 0;
  transition: width 0.75s cubic-bezier(0.22, 1, 0.36, 1);
}
.revTipoCmp__barFill--flujo {
  background: linear-gradient(90deg, #34d399, ${COLOR_FLUJO});
  box-shadow: 0 0 12px ${COLOR_FLUJO_GLOW};
}
.revTipoCmp__barFill--rm {
  background: linear-gradient(90deg, #8b5cf6, ${COLOR_RM});
  box-shadow: 0 0 12px ${COLOR_RM_GLOW};
}
.revTipoCmp__barFill--ghost {
  opacity: 0.26;
  box-shadow: none;
}
.revTipoCmp__barFill--ready {
  animation: revTipoCmpBarPop 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--bar-delay, 0ms);
}
@keyframes revTipoCmpBarPop {
  from { opacity: 0.45; transform: scaleX(0.92); transform-origin: left; }
  to { opacity: 1; transform: scaleX(1); }
}
.revTipoCmp__grid--skel .revTipoCmp__skelCard {
  min-height: 78px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,.04) 0%,
    rgba(255,255,255,.08) 50%,
    rgba(255,255,255,.04) 100%
  );
  background-size: 200% 100%;
  animation: revTipoCmpShimmer 1.15s ease-in-out infinite;
}
@keyframes revTipoCmpShimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@media (max-width: 560px) {
  .revTipoCmp__grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
  .revTipoCmp__card {
    padding: 8px 10px 7px;
  }
}
@media (max-width: 400px) {
  .revTipoCmp {
    padding: 8px 9px 9px;
  }
  .revTipoCmp__laneMoney {
    font-size: 11px;
  }
}
`;
