import React from "react";
import { formatNumber } from "../../flujos/utils";

const ITEMS = [
  { key: "total", label: "Total flujos", accent: "" },
  { key: "activos", label: "Activos", accent: "accentGreen" },
  { key: "pausados", label: "Pausados", accent: "accentWarn" },
  { key: "borradores", label: "Borradores", accent: "" },
  { key: "errores", label: "Errores", accent: "accentError" },
  { key: "leadsHoy", label: "Leads hoy", accent: "accentCyan" },
  { key: "mensajesEnviados", label: "Mensajes enviados", accent: "" },
  { key: "respuestas", label: "Respuestas", accent: "accentGreen" },
  { key: "seguimientosActivos", label: "Seguimientos activos", accent: "accentCyan" },
  { key: "conversionEstimada", label: "Conversión est.", accent: "accentGreen", suffix: "%" },
];

export default function FlowStatsCards({ stats, loading }) {
  if (loading) {
    return (
      <div className="flStatsGrid">
        {ITEMS.map((_, i) => (
          <div key={i} className="flSkeleton" style={{ minHeight: 72 }} />
        ))}
      </div>
    );
  }

  const s = stats || {};

  return (
    <div className="flStatsGrid">
      {ITEMS.map((item) => (
        <div key={item.key} className="flStatCard">
          <div className="flStatLabel">{item.label}</div>
          <div className={`flStatValue ${item.accent}`}>
            {formatNumber(s[item.key] ?? 0)}
            {item.suffix || ""}
          </div>
        </div>
      ))}
    </div>
  );
}
