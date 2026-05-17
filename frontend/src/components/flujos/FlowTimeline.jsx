import React, { useEffect, useState } from "react";
import { fetchFlowTimeline } from "../../flujos/api";
import { formatDate } from "../../flujos/utils";

const DOT_COLORS = {
  lead_entro: "#22c55e",
  nodo_ejecutado: "#06b6d4",
  seguimiento_enviado: "#ff6b35",
  seguimiento_programado: "#8b5cf6",
  lead_respondio: "#a855f7",
  etiqueta_aplicada: "#3b82f6",
  conversion_registrada: "#facc15",
};

export default function FlowTimeline({ flowId, expanded }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || !flowId) return;
    let cancelled = false;
    setLoading(true);
    fetchFlowTimeline(flowId)
      .then((res) => {
        if (!cancelled) setEvents(res.events || []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId, expanded]);

  if (!expanded) return null;

  if (loading) {
    return (
      <div className="flTimeline">
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>Cargando actividad…</span>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="flTimeline">
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
          Sin eventos recientes. La actividad aparecerá cuando el flujo se ejecute.
        </span>
      </div>
    );
  }

  return (
    <div className="flTimeline">
      {events.slice(0, 5).map((ev, i) => (
        <div key={i} className="flTimelineItem">
          <span
            className="flTimelineDot"
            style={{ background: DOT_COLORS[ev.tipo] || "#22c55e" }}
          />
          <div>
            <strong style={{ color: "#cbd5e1" }}>{ev.titulo}</strong>
            {ev.detalle && <div>{ev.detalle}</div>}
            <div style={{ opacity: 0.65 }}>{formatDate(ev.fecha)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
