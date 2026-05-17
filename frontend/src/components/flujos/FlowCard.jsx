import React, { useState } from "react";
import { builderUrl } from "../../flujos/api";
import { folderLabel, formatDate, formatMetric, stateMeta } from "../../flujos/utils";
import FlowActionsMenu from "./FlowActionsMenu";
import FlowCampaignsPanel from "./FlowCampaignsPanel";
import FlowPreviewMini from "./FlowPreviewMini";
import FlowTimeline from "./FlowTimeline";

export default function FlowCard({
  flow,
  listMode,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onUpdateCampanas,
  onEditName,
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const st = stateMeta(flow.meta?.estado);
  const m = flow.metricas || {};

  return (
    <article className={`flCard ${listMode ? "listMode" : ""}`}>
      <div className="flCardHead">
        <div>
          <h3 className="flCardTitle">{flow.nombre}</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span
              className="flBadge"
              style={{
                background: `${st.color}22`,
                color: st.color,
                border: `1px solid ${st.color}44`,
              }}
            >
              <span className="flBadgeDot" style={{ background: st.color }} />
              {st.label}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              📁 {folderLabel(flow.meta?.carpeta)}
            </span>
            {flow.activadores?.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                ⚡ {flow.activadores.filter((a) => a.activo).length}/{flow.activadores.length} activadores
              </span>
            )}
          </div>
        </div>
        <FlowActionsMenu
          flow={flow}
          onToggleEstado={onToggleEstado}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoveFolder={onMoveFolder}
          onEditName={onEditName}
          onShowStats={() => setShowTimeline(true)}
        />
      </div>

      <div className={`flPreviewWrap ${listMode ? "tall" : ""}`} style={listMode ? { flex: "0 0 160px" } : undefined}>
        <FlowPreviewMini preview={flow.preview} />
      </div>

      <div className="flMetrics">
        <div className="flMetric">
          <b>{formatMetric(m.clientesEnFlujo, { pendiente: false })}</b>
          <span>Clientes en flujo</span>
        </div>
        <div className="flMetric">
          <b>{formatMetric(m.leadsHoy)}</b>
          <span>Entradas hoy</span>
        </div>
        <div className="flMetric">
          <b>{formatMetric(m.mensajesEnviados)}</b>
          <span>Seg. enviados</span>
        </div>
        <div className="flMetric">
          <b>{formatMetric(m.respuestas)}</b>
          <span>Respuestas</span>
        </div>
        <div className="flMetric">
          <b>{formatMetric(m.conversiones, { pendiente: m.ventasPendiente, emptyLabel: "0" })}</b>
          <span>Ventas</span>
        </div>
        <div className="flMetric">
          <b>{formatMetric(m.seguimientosActivos)}</b>
          <span>Seg. activos</span>
        </div>
        <div className="flMetric">
          <b>{flow.nodosCount || 0}</b>
          <span>Nodos</span>
        </div>
        <div className="flMetric">
          <b>{flow.conexionesCount || 0}</b>
          <span>Conexiones</span>
        </div>
      </div>

      <FlowCampaignsPanel
        campanas={flow.meta?.campanas || []}
        readOnly={false}
        onToggle={(id) => {
          const current = flow.meta?.campanas || [];
          const next = current.includes(id)
            ? current.filter((c) => c !== id)
            : [...current, id];
          onUpdateCampanas(flow.id, next);
        }}
      />

      <FlowTimeline flowId={flow.id} expanded={showTimeline} />

      <div className="flCardFooter">
        <span>
          Últ. ejecución: {formatDate(m.ultimaEjecucion)} · Modificado:{" "}
          {formatDate(flow.meta?.actualizado_en)}
        </span>
        <div className="flQuickActions">
          <a href={builderUrl(flow)} target="_blank" rel="noreferrer" className="flQuickBtn">
            Constructor
          </a>
          <button type="button" className="flQuickBtn" onClick={() => onToggleEstado(flow)}>
            {flow.meta?.estado === "activo" ? "Pausar" : "Activar"}
          </button>
          <button type="button" className="flQuickBtn" onClick={() => setShowTimeline(!showTimeline)}>
            {showTimeline ? "Ocultar" : "Actividad"}
          </button>
        </div>
      </div>
    </article>
  );
}
