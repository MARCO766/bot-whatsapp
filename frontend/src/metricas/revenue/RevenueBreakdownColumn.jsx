import React from "react";
import {
  REVENUE_TIPOS,
  REVENUE_TIPO_LABELS,
  formatNum,
  formatRevenueMoney,
  formatRevenuePct,
} from "../format";
import RevenueTipoCard from "./RevenueTipoCard";

function sumOrigenBucket(bucket) {
  if (!bucket) return { cantidad: 0, ingresos: 0 };
  return REVENUE_TIPOS.reduce(
    (acc, tipo) => {
      const cell = bucket[tipo] || {};
      acc.cantidad += Number(cell.cantidad) || 0;
      acc.ingresos += Number(cell.ingresos) || 0;
      return acc;
    },
    { cantidad: 0, ingresos: 0 }
  );
}

export default function RevenueBreakdownColumn({
  title,
  subtitle,
  origenBucket,
  moneda = "BOB",
  loading = false,
  rmRevenuePct,
}) {
  if (loading) {
    return (
      <div className="revenueBreakdownCol">
        <div className="revenueBreakdownColHead">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="revenueTipoGrid">
          {REVENUE_TIPOS.map((tipo) => (
            <div key={tipo} className="skel revenueTipoSkel" />
          ))}
        </div>
      </div>
    );
  }

  const subtotal = sumOrigenBucket(origenBucket);

  const showRmBadge = rmRevenuePct != null && Number.isFinite(Number(rmRevenuePct));

  return (
    <div className="revenueBreakdownCol">
      <div className="revenueBreakdownColHead">
        <div className="revenueBreakdownColTitleRow">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {showRmBadge ? (
            <span className="revenueRmBadge">
              +{formatRevenuePct(rmRevenuePct)} revenue RM
            </span>
          ) : null}
        </div>
        <div className="revenueBreakdownSubtotal">
          <strong>{formatRevenueMoney(subtotal.ingresos, moneda)}</strong>
          <span>{formatNum(subtotal.cantidad)} ventas</span>
        </div>
      </div>
      <div className="revenueTipoGrid">
        {REVENUE_TIPOS.map((tipo) => {
          const cell = origenBucket?.[tipo] || {};
          return (
            <RevenueTipoCard
              key={tipo}
              tipo={tipo}
              label={REVENUE_TIPO_LABELS[tipo]}
              cantidad={cell.cantidad}
              ingresos={cell.ingresos}
              moneda={moneda}
            />
          );
        })}
      </div>
    </div>
  );
}
