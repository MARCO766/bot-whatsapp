import React from "react";
import { formatNumber } from "../../flujos/utils";

const ITEMS = [
  { key: "leadsVivos", label: "Leads vivos", accent: "accentCyan" },
  { key: "conversaciones", label: "Conversaciones", accent: "" },
  { key: "activos", label: "Flujos activos", accent: "accentGreen" },
  {
    key: "ventas",
    label: "Ventas reales",
    accent: "accentGreen",
    format: (s) => formatNumber(s.ventas ?? 0),
  },
];

export default function FlowStatsCards({ stats, loading }) {
  if (loading) {
    return (
      <div className="flStatsGrid flStatsGridCompact">
        {ITEMS.map((_, i) => (
          <div key={i} className="flSkeleton" style={{ minHeight: 72 }} />
        ))}
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="flStatsGrid flStatsGridCompact">
      {ITEMS.map((item) => (
        <div key={item.key} className="flStatCard">
          <div className="flStatLabel">{item.label}</div>
          <div className={`flStatValue ${item.accent || ""}`}>
            {item.format ? item.format(s) : formatNumber(s[item.key] ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}
