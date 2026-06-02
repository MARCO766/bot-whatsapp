import React from "react";
import { formatNum, formatRevenueMoney, formatRevenuePct } from "../format";

const KPI_ITEMS = [
  {
    key: "total",
    titulo: "Ingresos totales",
    icono: "💰",
    color: "orange",
    getValor: (k) => formatRevenueMoney(k?.totalIngresos, k?._moneda),
    getDetalle: (k) => `${formatNum(k?.totalCantidad)} ventas`,
  },
  {
    key: "remarketing",
    titulo: "Remarketing",
    icono: "🔥",
    color: "purple",
    getValor: (k) => formatRevenueMoney(k?.ingresosRemarketing, k?._moneda),
    getDetalle: (k) => {
      const pct = formatRevenuePct(k?.porcentajeIngresosRemarketing);
      const n = formatNum(k?.cantidadRemarketing);
      return `${n} ventas · ${pct} del total`;
    },
  },
  {
    key: "flujo",
    titulo: "Flujo normal",
    icono: "🛒",
    color: "cyan",
    getValor: (k) => formatRevenueMoney(k?.ingresosFlujo, k?._moneda),
    getDetalle: (k) => `${formatNum(k?.cantidadFlujo)} ventas`,
  },
  {
    key: "ticket",
    titulo: "Ticket promedio",
    icono: "🎯",
    color: "green",
    getValor: (k) => formatRevenueMoney(k?.ticketPromedioTotal, k?._moneda),
    getDetalle: () => "Promedio por venta",
  },
];

export default function RevenueKpiStrip({ kpis, moneda = "BOB", loading = false }) {
  const k = kpis ? { ...kpis, _moneda: moneda } : null;

  if (loading) {
    return (
      <div className="revenueKpiGrid mainGrid">
        {KPI_ITEMS.map((item) => (
          <div key={item.key} className="mainCard skelCard" />
        ))}
      </div>
    );
  }

  return (
    <div className="revenueKpiGrid mainGrid">
      {KPI_ITEMS.map((item, i) => (
        <div
          key={item.key}
          className={`mainCard ${item.color}`}
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="shine" />
          <div className="cardTop">
            <div className="icon">{item.icono}</div>
            <strong className="revenueKpiTitle">{item.titulo}</strong>
          </div>
          <h2>{k ? item.getValor(k) : formatRevenueMoney(0, moneda)}</h2>
          <span className="revenueKpiChip">{k ? item.getDetalle(k) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
