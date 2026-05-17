import React from "react";
import { formatHora } from "../../utils/chatFormat";

export default function ChatListItem({
  chat,
  activo,
  menuAbierto,
  onSelect,
  onToggleMenu,
  onEtiqueta,
  onBloquear,
  onEliminar,
}) {
  const inicial = (chat.nombre || chat.numero || "?").charAt(0).toUpperCase();

  return (
    <div
      className={`chatItem ${activo ? "active" : ""}`}
      onClick={() => onSelect(chat.numero)}
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

        <p className="preview">{chat.ultimoMensaje || "Sin mensajes"}</p>

        {(chat.etiquetas?.length > 0 || chat.bloqueado) && (
          <div className="tagRow">
            {(chat.etiquetas || []).map((tag) => (
              <span
                key={tag.nombre}
                className="tag"
                style={{ background: tag.color, borderColor: tag.color }}
              >
                {tag.nombre}
              </span>
            ))}
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
            onToggleMenu(chat.numero);
          }}
          aria-label="Opciones del chat"
        >
          ⋮
        </button>

        {menuAbierto && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => onEtiqueta(chat.numero)}>
              🏷️ Etiqueta
            </button>
            <button
              type="button"
              onClick={() => onBloquear(chat.numero, chat.bloqueado)}
            >
              {chat.bloqueado ? "Desbloquear" : "Bloquear"}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => onEliminar(chat.numero)}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
