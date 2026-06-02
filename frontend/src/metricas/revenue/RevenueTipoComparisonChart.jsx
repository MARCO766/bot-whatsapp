import React, { useMemo } from "react";
import {
  REVENUE_TIPOS,
  REVENUE_TIPO_LABELS,
  formatRevenueMoney,
} from "../format";

const COLOR_FLUJO = "#5eead4";
const COLOR_FLUJO_GLOW = "rgba(45, 212, 191, 0.35)";
const COLOR_RM = "#a78bfa";
const COLOR_RM_GLOW = "rgba(167, 139, 250, 0.32)";
const MIN_BAR_PCT = 4;

function readIngresos(bucket, tipo) {
  const v = Number(bucket?.[tipo]?.ingresos);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function resolveBarWidth(value, maxGlobal, bothZeroInRow) {
  if (bothZeroInRow) return MIN_BAR_PCT;
  if (value <= 0) return 0;
  if (maxGlobal <= 0) return MIN_BAR_PCT;
  const pct = (value / maxGlobal) * 100;
  return Math.max(pct, 5);
}

function ComparisonBarRow({
  variant,
  emoji,
  label,
  ingresos,
  maxGlobal,
  bothZeroInRow,
  moneda,
  ready,
  delayMs,
}) {
  const widthPct = resolveBarWidth(ingresos, maxGlobal, bothZeroInRow);
  const money = formatRevenueMoney(ingresos, moneda);

  return (
    <div
      className={`revTipoCmp__barRow revTipoCmp__barRow--${variant}`}
      style={{ "--bar-delay": `${delayMs}ms` }}
    >
      <span className="revTipoCmp__barLabel">
        <span className="revTipoCmp__barEmoji" aria-hidden="true">
          {emoji}
        </span>
        {label}
      </span>
      <div className="revTipoCmp__barTrack" aria-hidden="true">
        <div
          className={`revTipoCmp__barFill revTipoCmp__barFill--${variant}${ready ? " revTipoCmp__barFill--ready" : ""}${bothZeroInRow ? " revTipoCmp__barFill--ghost" : ""}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span className="revTipoCmp__barMoney">{money}</span>
    </div>
  );
}

function TipoRow({ tipo, flujoIngresos, rmIngresos, maxGlobal, moneda, ready, rowIndex }) {
  const bothZero = flujoIngresos <= 0 && rmIngresos <= 0;
  const baseDelay = rowIndex * 55;

  return (
    <div className="revTipoCmp__tipoBlock">
      <h4 className="revTipoCmp__tipoTitle">{REVENUE_TIPO_LABELS[tipo]}</h4>
      <ComparisonBarRow
        variant="flujo"
        emoji="🟢"
        label="Flujo"
        ingresos={flujoIngresos}
        maxGlobal={maxGlobal}
        bothZeroInRow={bothZero}
        moneda={moneda}
        ready={ready}
        delayMs={baseDelay}
      />
      <ComparisonBarRow
        variant="rm"
        emoji="🟣"
        label="Remarketing"
        ingresos={rmIngresos}
        maxGlobal={maxGlobal}
        bothZeroInRow={bothZero}
        moneda={moneda}
        ready={ready}
        delayMs={baseDelay + 28}
      />
    </div>
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
        flujo: readIngresos(flujoBucket, tipo),
        rm: readIngresos(remarketingBucket, tipo),
      })),
    [flujoBucket, remarketingBucket]
  );

  const maxGlobal = useMemo(() => {
    let max = 0;
    rows.forEach(({ flujo, rm }) => {
      max = Math.max(max, flujo, rm);
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
        <div className="revTipoCmp__skelGrid">
          {REVENUE_TIPOS.map((tipo) => (
            <div key={tipo} className="revTipoCmp__skelRow" />
          ))}
        </div>
      </div>
    );
  }

  const ready = true;

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

      <div className="revTipoCmp__rows">
        {rows.map(({ tipo, flujo, rm }, i) => (
          <TipoRow
            key={tipo}
            tipo={tipo}
            flujoIngresos={flujo}
            rmIngresos={rm}
            maxGlobal={maxGlobal}
            moneda={moneda}
            ready={ready}
            rowIndex={i}
          />
        ))}
      </div>
    </section>
  );
}

const chartStyles = `
.revTipoCmp {
  margin-bottom: 10px;
  padding: 10px 12px 11px;
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(255,255,255,.04), rgba(15,23,42,.42));
  border: 1px solid rgba(148,163,184,.1);
  box-shadow:
    0 0 0 1px rgba(255,255,255,.02) inset,
    0 8px 24px rgba(0,0,0,.18);
  animation: revTipoCmpFadeUp .42s ease both;
}
.revTipoCmp--ready .revTipoCmp__tipoBlock {
  animation: revTipoCmpFadeUp .38s ease both;
}
@keyframes revTipoCmpFadeUp {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.revTipoCmp__head {
  margin-bottom: 8px;
}
.revTipoCmp__title {
  margin: 0 0 2px;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: -0.02em;
  color: #e2e8f0;
  line-height: 1.25;
}
.revTipoCmp__subtitle {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  line-height: 1.3;
}
.revTipoCmp__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.revTipoCmp__tipoBlock {
  padding: 7px 8px 6px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.35);
  border: 1px solid rgba(148, 163, 184, 0.08);
}
.revTipoCmp__tipoTitle {
  margin: 0 0 5px;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #cbd5e1;
  line-height: 1.2;
}
.revTipoCmp__barRow {
  display: grid;
  grid-template-columns: 88px 1fr auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.revTipoCmp__barRow:last-child {
  margin-bottom: 0;
}
.revTipoCmp__barLabel {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  white-space: nowrap;
  min-width: 0;
}
.revTipoCmp__barEmoji {
  font-size: 9px;
  line-height: 1;
  flex-shrink: 0;
}
.revTipoCmp__barTrack {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.85);
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
}
.revTipoCmp__barFill {
  height: 100%;
  border-radius: 999px;
  width: 0;
  transition: width 0.85s cubic-bezier(0.22, 1, 0.36, 1);
}
.revTipoCmp__barFill--flujo {
  background: linear-gradient(90deg, #34d399, ${COLOR_FLUJO});
  box-shadow: 0 0 10px ${COLOR_FLUJO_GLOW};
}
.revTipoCmp__barFill--rm {
  background: linear-gradient(90deg, #8b5cf6, ${COLOR_RM});
  box-shadow: 0 0 10px ${COLOR_RM_GLOW};
}
.revTipoCmp__barFill--ghost {
  opacity: 0.28;
  box-shadow: none;
}
.revTipoCmp__barFill--ready {
  animation: revTipoCmpBarGrow 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--bar-delay, 0ms);
}
@keyframes revTipoCmpBarGrow {
  from { opacity: 0.4; filter: brightness(0.85); }
  to { opacity: 1; filter: brightness(1); }
}
.revTipoCmp__barMoney {
  font-size: 11px;
  font-weight: 900;
  color: #e2e8f0;
  white-space: nowrap;
  text-align: right;
  min-width: 52px;
  font-variant-numeric: tabular-nums;
}
.revTipoCmp__barRow--flujo .revTipoCmp__barMoney {
  color: #ccfbf1;
}
.revTipoCmp__barRow--rm .revTipoCmp__barMoney {
  color: #ede9fe;
}
.revTipoCmp__skelGrid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.revTipoCmp__skelRow {
  min-height: 52px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(255,255,255,.04) 0%,
    rgba(255,255,255,.08) 50%,
    rgba(255,255,255,.04) 100%
  );
  background-size: 200% 100%;
  animation: revTipoCmpShimmer 1.2s ease-in-out infinite;
}
@keyframes revTipoCmpShimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@media (max-width: 560px) {
  .revTipoCmp__barRow {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: 4px;
  }
  .revTipoCmp__barLabel {
    font-size: 11px;
  }
  .revTipoCmp__barTrack {
    grid-column: 1;
    width: 100%;
  }
  .revTipoCmp__barMoney {
    text-align: left;
    min-width: 0;
  }
}
@media (max-width: 400px) {
  .revTipoCmp {
    padding: 9px 10px 10px;
  }
  .revTipoCmp__tipoBlock {
    padding: 6px 7px 5px;
  }
}
`;
