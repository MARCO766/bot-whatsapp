import React from "react";
import { formatNumber } from "../../flujos/utils";

const ITEMS = [
  { key: "leadsVivos", label: "Leads vivos", accent: "accentCyan" },
  { key: "conversaciones", label: "Conversaciones", accent: "" },
  {
    key: "ventas",
    label: "Ventas reales",
    accent: "accentGreen",
    format: (s) => formatNumber(s.conversiones ?? s.ventas ?? 0),
  },
  { key: "total", label: "Total flujos", accent: "" },
  { key: "activos", label: "Activos", accent: "accentGreen" },
  { key: "pausados", label: "Pausados", accent: "accentWarn" },
  { key: "borradores", label: "Borradores", accent: "" },
  { key: "errores", label: "Errores", accent: "accentError" },
  { key: "clientesPotencialesHoy", label: "Clientes pot. hoy", accent: "accentCyan" },
  { key: "mensajesEnviados", label: "Mensajes enviados", accent: "" },
  { key: "respuestas", label: "Respuestas", accent: "accentGreen" },
  { key: "seguimientosActivos", label: "Seguimientos activos", accent: "accentCyan" },
  {
    key: "conversionEstimada",
    label: "Conversión est.",
    accent: "accentGreen",
    format: (s) => {
      const env = s.mensajesEnviados ?? 0;
      const resp = s.respuestas ?? 0;
      if (env === 0 || resp === 0) return "0%";
      return `${s.conversionEstimada ?? 0}%`;
    },
  },
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
          <div className={`flStatValue ${item.accent || ""}`}>
            {item.format ? item.format(s) : formatNumber(s[item.key] ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}
