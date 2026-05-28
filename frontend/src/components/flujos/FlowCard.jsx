import React, { memo, useState } from "react";
import { builderUrl } from "../../flujos/api";
import {
  folderLabel,
  formatDate,
  formatMetric,
  formatRelativeTime,
  formatUltimoLead,
  stateMeta,
} from "../../flujos/utils";
import FlowActionsMenu from "./FlowActionsMenu";
import FlowPreviewMini from "./FlowPreviewMini";
import FlowTimeline from "./FlowTimeline";

function FlowCard({
  flow,
  listMode,
  mostrarBadgeLinea = false,
  conexionWhatsappId,
  openMenuId,
  onMenuOpenChange,
  onToggleEstado,
  onDuplicate,
  onDelete,
  onMoveFolder,
  onEditName,
}) {
  const [showTimeline, setShowTimeline] = useState(false);
  const st = stateMeta(flow.meta?.estado);
  const m = flow.metricas || {};
  const isMenuOpen = openMenuId === flow.id;

  const actividadRel = formatRelativeTime(m.ultimaActividad);
  const ultimoLeadTxt = formatUltimoLead(m.ultimoLead);

  return (
    <article className={`flCard ${listMode ? "listMode" : ""} ${isMenuOpen ? "flCardMenuOpen" : ""}`}>
      <div className="flCardHead">
        <div>
          <h3 className="flCardTitle">{flow.nombre}</h3>
          <div className="flCardMeta">
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
            <span className="flCardMetaItem">📁 {folderLabel(flow.meta?.carpeta)}</span>
            <span className="flCardMetaItem">
              ⚡ {flow.activadores?.filter((a) => a.activo).length || 0}/
              {flow.activadores?.length || 0} activadores
            </span>
            {mostrarBadgeLinea && (
              <span className="flBadgeLinea" title="Línea WhatsApp del flujo">
                {flow.conexion_nombre || (flow.conexion_whatsapp_id ? "Línea" : "Sin línea")}
              </span>
            )}
          </div>
        </div>
        <FlowActionsMenu
          flow={flow}
          conexionWhatsappId={conexionWhatsappId}
          isOpen={isMenuOpen}
          onOpenChange={onMenuOpenChange}
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

      <div className="flMetrics flMetricsCompact flMetrics5">
        <div className="flMetric" title="Clientes únicos en seguimientos de este flujo">
          <b>{formatMetric(m.clientesEnFlujo)}</b>
          <span>En flujo</span>
        </div>
        <div className="flMetric" title="Actividad real registrada hoy">
          <b>{formatMetric(m.leadsHoy)}</b>
          <span>Hoy</span>
        </div>
        <div className="flMetric" title="Leads que respondieron (seguimiento o mensaje entrante)">
          <b>{formatMetric(m.respuestas)}</b>
          <span>Respuestas</span>
        </div>
        <div className="flMetric" title="Registros en crm_conversiones">
          <b>{formatMetric(m.conversiones ?? 0)}</b>
          <span>Conversiones</span>
        </div>
        <div className="flMetric" title="seguimientos_programados pendientes">
          <b>{formatMetric(m.seguimientosActivos)}</b>
          <span>Seg. activos</span>
        </div>
      </div>

      <div className="flCardActivity">
        <div className="flCardActivityItem">
          <span className="flCardActivityLabel">Última actividad</span>
          <span className="flCardActivityValue">{actividadRel || "Sin actividad"}</span>
        </div>
        <div className="flCardActivityItem">
          <span className="flCardActivityLabel">Último lead</span>
          <span className="flCardActivityValue">{ultimoLeadTxt || "—"}</span>
        </div>
      </div>

      <FlowTimeline
        flowId={flow.id}
        conexionWhatsappId={conexionWhatsappId}
        expanded={showTimeline}
      />

      <div className="flCardFooter">
        <span>Modificado: {formatDate(flow.meta?.actualizado_en)}</span>
        <div className="flQuickActions">
          <a
            href={builderUrl(flow, conexionWhatsappId)}
            target="_blank"
            rel="noreferrer"
            className="flQuickBtn"
          >
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

export default memo(FlowCard);
