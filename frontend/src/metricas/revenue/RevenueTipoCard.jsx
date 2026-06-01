import React from "react";
import { formatNum, formatRevenueMoney } from "../format";

export default function RevenueTipoCard({ label, cantidad = 0, ingresos = 0, moneda = "BOB" }) {
  const vacio = (Number(cantidad) || 0) === 0 && (Number(ingresos) || 0) === 0;

  return (
    <div className={`revenueTipoCard performanceCard ${vacio ? "revenueTipoCard--empty" : ""}`}>
      <div>
        <span>{label}</span>
        <h3>{formatNum(cantidad)} ventas</h3>
        <p>{formatRevenueMoney(ingresos, moneda)}</p>
      </div>
    </div>
  );
}
