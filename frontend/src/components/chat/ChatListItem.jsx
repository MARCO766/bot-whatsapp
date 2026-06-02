import React from "react";
import { formatHora } from "../../utils/chatFormat";

export default function ChatListItem({
  chat,
  activo,
  menuAbierto,
  lineaLabel,
  onSelect,
  onToggleMenu,
  onEtiqueta,
  onBloquear,
  onEliminar,
}) {
  const inicial = (chat.nombre || chat.numero || "?").charAt(0).toUpperCase();
  const etiquetas = Array.isArray(chat.etiquetas) ? chat.etiquetas.slice(0, 2) : [];
  const lineaCorta = lineaLabel
    ? lineaLabel.length > 18
      ? `${lineaLabel.slice(0, 18)}...`
      : lineaLabel
    : null;
  const rmEstado =
    chat?.rm24h_activo != null
      ? chat.rm24h_activo
        ? "RM activo"
        : "RM pausado"
      : chat?.remarketing_activo != null
        ? chat.remarketing_activo
          ? "RM activo"
          : "RM pausado"
        : null;
  const ventanaFlag =
    chat?.ventana24h_abierta != null
      ? chat.ventana24h_abierta
      : chat?.ventana_24h_abierta != null
        ? chat.ventana_24h_abierta
        : null;

  return (
    <div
      className={`chatItem ${activo ? "active" : ""}`}
      onClick={() => onSelect(chat)}
    >
      <div className="avatar">{inicial}</div>

      <div className="chatInfo">
        <div className="chatTop">
          <strong className="chatName">{chat.nombre || chat.numero}</strong>
          <div className="chatMeta">
            <small className="chatTime">{formatHora(chat.ultimoMensajeEn)}</small>
            {chat.noLeidos > 0 && (
              <span className="unreadBadge" aria-label={`${chat.noLeidos} sin leer`}>
                {chat.noLeidos > 99 ? "99+" : chat.noLeidos}
              </span>
            )}
          </div>
        </div>

        <div className="chatInlineBadges">
          {lineaCorta && (
            <span className="chatLineaBadge" title={lineaLabel}>
              {lineaCorta}
            </span>
          )}
          {ventanaFlag != null && (
            <span
              className={`chatWindowFlag ${
                ventanaFlag ? "chatWindowFlag--open" : "chatWindowFlag--closed"
              }`}
              title={
                ventanaFlag
                  ? "Ventana de 24h disponible"
                  : "Ventana de 24h cerrada"
              }
            >
              {ventanaFlag ? "24h abierta" : "24h cerrada"}
            </span>
          )}
          {rmEstado && <span className="chatRmFlag">{rmEstado}</span>}
        </div>

        <p className="preview preview--premium">{chat.ultimoMensaje || "Sin mensajes"}</p>

        {(etiquetas.length > 0 || chat.bloqueado) && (
          <div className="tagRow">
            {etiquetas.map((tag) => (
              <span
                key={tag.nombre}
                className="tag"
                style={{ background: tag.color, borderColor: tag.color }}
              >
                {tag.nombre}
              </span>
            ))}
            {(chat.etiquetas?.length || 0) > etiquetas.length && (
              <span className="tag tagMore">+{chat.etiquetas.length - etiquetas.length}</span>
            )}
            {chat.bloqueado && <span className="blocked">Bloqueado</span>}
          </div>
        )}
      </div>

      <div className="chatItemActions">
        <button
          type="button"
          className={`dots ${menuAbierto ? "open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu(chat);
          }}
          aria-label="Opciones del chat"
        >
          ⋮
        </button>

        {menuAbierto && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => onEtiqueta(chat)}>
              🏷️ Etiqueta
            </button>
            <button
              type="button"
              onClick={() => onBloquear(chat, chat.bloqueado)}
            >
              {chat.bloqueado ? "Desbloquear" : "Bloquear"}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onEliminar(chat)}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
