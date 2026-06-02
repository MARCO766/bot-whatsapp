import React from "react";
import { formatNum, formatRevenueMoney } from "../format";

export default function RevenueTipoCard({
  tipo = "",
  label,
  cantidad = 0,
  ingresos = 0,
  moneda = "BOB",
}) {
  const vacio = (Number(cantidad) || 0) === 0 && (Number(ingresos) || 0) === 0;
  const tipoClass = tipo ? `revenueTipoCard--${tipo}` : "";

  return (
    <div
      className={`revenueTipoCard performanceCard ${tipoClass} ${vacio ? "revenueTipoCard--empty" : ""}`}
    >
      <span className="revenueTipoLabel">{label}</span>
      <h3 className={vacio ? "revenueTipoMuted" : ""}>{formatNum(cantidad)} ventas</h3>
      <p className={vacio ? "revenueTipoMuted" : ""}>{formatRevenueMoney(ingresos, moneda)}</p>
    </div>
  );
}
