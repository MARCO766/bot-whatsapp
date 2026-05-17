import React from "react";
import { formatHeaderTrend, formatNumber } from "../../flujos/utils";

const CARDS = [
  { key: "leadsVivos", label: "Leads vivos", icon: "⚡", trendKey: "tendenciaLeads", accent: "accentCyan" },
  {
    key: "conversaciones",
    label: "Conversaciones",
    icon: "💬",
    trendKey: "tendenciaConversaciones",
    accent: "",
  },
  {
    key: "ventasCantidad",
    label: "Ventas",
    icon: "💎",
    trendKey: "tendenciaVentas",
    accent: "accentGreen",
  },
  { key: "flujosActivos", label: "Flujos activos", icon: "🧩", accent: "accentGreen" },
];

export default function FlujosHeaderStats({ data, loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="flHeaderStats flHeaderStats4">
        {CARDS.map((_, i) => (
          <div key={i} className="flHeaderStatCard flSkeleton" style={{ minHeight: 88 }} />
        ))}
      </div>
    );
  }

  const d = data || {};

  return (
    <>
      {error && (
        <div className="flHeaderStatsError">
          <span>{error}</span>
          {onRetry && (
            <button type="button" className="flBtn flBtnGhost" onClick={onRetry}>
              Reintentar
            </button>
          )}
        </div>
      )}
      <div className="flHeaderStats flHeaderStats4">
        {CARDS.map((card) => {
          const trend = card.trendKey ? formatHeaderTrend(d[card.trendKey]) : null;
          const value = card.format
            ? card.format(d)
            : formatNumber(d[card.key] ?? 0);

          return (
            <div key={card.key} className="flHeaderStatCard">
              <div className="flHeaderStatIcon">{card.icon}</div>
              <div className="flHeaderStatBody">
                <span className="flHeaderStatLabel">{card.label}</span>
                <h3 className={`flHeaderStatValue ${card.accent || ""}`}>{value}</h3>
              </div>
              {trend && (
                <b className={`flHeaderStatTrend ${trend.positive ? "up" : "down"}`}>{trend.text}</b>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
