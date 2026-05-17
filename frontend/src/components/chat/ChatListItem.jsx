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
          <strong>{chat.nombre || chat.numero}</strong>
          <small>{formatHora(chat.ultimoMensajeEn)}</small>
        </div>

        <span className="numero">{chat.numero}</span>

        <div className="tagRow">
          {(chat.etiquetas || []).map((tag) => (
            <div
              key={tag.nombre}
              className="tag"
              style={{ background: tag.color, borderColor: tag.color }}
            >
              {tag.nombre}
            </div>
          ))}

          {chat.noLeidos > 0 && (
            <div className="badge">{chat.noLeidos}</div>
          )}

          {chat.bloqueado && <div className="blocked">Bloqueado</div>}
        </div>

        <p className="preview">{chat.ultimoMensaje}</p>
      </div>

      <button
        type="button"
        className="dots"
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(chat.numero);
        }}
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
  );
}
