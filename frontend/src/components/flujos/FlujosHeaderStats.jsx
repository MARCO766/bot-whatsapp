import React from "react";
import { formatHeaderTrend, formatHeaderVentas, formatNumber } from "../../flujos/utils";

const CARDS = [
  {
    key: "leadsVivos",
    label: "Leads vivos",
    icon: "⚡",
    trendKey: "tendenciaLeads",
    accent: "cyan",
  },
  {
    key: "conversaciones",
    label: "Conversaciones",
    icon: "💬",
    trendKey: "tendenciaConversaciones",
    accent: "violet",
  },
  {
    key: "ventasCantidad",
    label: "Ventas",
    icon: "💎",
    trendKey: "tendenciaVentas",
    accent: "green",
    subKey: "ventasMonto",
  },
  {
    key: "flujosActivos",
    label: "Flujos activos",
    icon: "🧩",
    accent: "emerald",
  },
];

export default function FlujosHeaderStats({ data, loading, error, onRetry }) {
  if (loading) {
    return (
      <div className="flHeaderStats flHeaderStats4">
        {CARDS.map((_, i) => (
          <div key={i} className="flHeaderStatCard flSkeleton" style={{ minHeight: 96 }} />
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
          const value = formatNumber(d[card.key] ?? 0);
          const sub =
            card.subKey && Number(d[card.subKey]) > 0
              ? formatHeaderVentas(d[card.subKey])
              : null;

          return (
            <div
              key={card.key}
              className={`flHeaderStatCard flHeaderStatCard--${card.accent}`}
            >
              <div className={`flHeaderStatIcon flHeaderStatIcon--${card.accent}`}>
                <span aria-hidden>{card.icon}</span>
              </div>
              <div className="flHeaderStatBody">
                <span className="flHeaderStatLabel">{card.label}</span>
                <h3 className="flHeaderStatValue">{value}</h3>
                {sub && <span className="flHeaderStatSub">{sub}</span>}
              </div>
              {trend && (
                <span
                  className={`flHeaderStatTrend ${trend.positive ? "up" : "down"}`}
                  title="vs. ayer"
                >
                  {trend.positive ? "↑" : "↓"} {trend.text}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
