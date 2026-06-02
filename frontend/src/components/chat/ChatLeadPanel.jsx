import React, { useMemo } from "react";
import {
  calcularVentana24h,
  etiquetaVentanaBadge,
} from "../../utils/whatsappVentana24h";

export default function ChatLeadPanel({
  abierto = false,
  chat,
  chatMeta,
  mensajes = [],
  conexionWhatsappId,
  onClose,
}) {
  const nombre = chatMeta?.nombre || chat?.nombre || chat?.numero || "Lead";
  const numero = chat?.numero || chat?.cliente_numero || chatMeta?.numero || "—";
  const conexionNombre = String(chat?.conexion_nombre || "").trim();
  const conexionLabel =
    conexionNombre || `ID ${String(conexionWhatsappId || "").slice(-6) || "—"}`;
  const etiquetas = Array.isArray(chat?.etiquetas) ? chat.etiquetas.slice(0, 3) : [];
  const ventana = useMemo(() => calcularVentana24h(mensajes), [mensajes]);

  if (!abierto) return null;

  return (
    <aside className="chatLeadPanel" aria-label="Panel CRM del lead">
      <div className="chatLeadPanelHead">
        <strong>Lead info</strong>
        <button type="button" className="chatLeadPanelClose" onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div className="chatLeadCard">
        <div className="chatLeadRow">
          <span className="chatLeadLabel">Nombre</span>
          <span className="chatLeadValue">{nombre}</span>
        </div>
        <div className="chatLeadRow">
          <span className="chatLeadLabel">Numero</span>
          <span className="chatLeadValue">{numero}</span>
        </div>
        <div className="chatLeadRow">
          <span className="chatLeadLabel">Linea WhatsApp</span>
          <span className="chatLeadValue">{conexionLabel}</span>
        </div>
        <div className="chatLeadRow">
          <span className="chatLeadLabel">Estado 24h</span>
          <span
            className={`chatLeadWindowBadge ${
              ventana.abierta ? "chatLeadWindowBadge--open" : "chatLeadWindowBadge--closed"
            }`}
          >
            {etiquetaVentanaBadge(ventana)}
          </span>
        </div>
      </div>

      <div className="chatLeadCard">
        <span className="chatLeadLabel">Etiquetas</span>
        {etiquetas.length > 0 ? (
          <div className="chatLeadTags">
            {etiquetas.map((tag) => (
              <span
                key={tag.nombre}
                className="chatLeadTag"
                style={{
                  backgroundColor: `${tag.color}26`,
                  borderColor: `${tag.color}66`,
                }}
              >
                {tag.nombre}
              </span>
            ))}
          </div>
        ) : (
          <p className="chatLeadEmpty">Sin etiquetas</p>
        )}
      </div>
    </aside>
  );
}
