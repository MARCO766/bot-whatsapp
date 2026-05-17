import React from "react";
import ChatListItem from "./ChatListItem";

export default function ChatList({
  chats,
  chatActivo,
  menuChat,
  etiquetasUnicas,
  etiquetaFiltro,
  busqueda,
  onBusqueda,
  onSelect,
  onToggleMenu,
  onEtiqueta,
  onBloquear,
  onEliminar,
  onFiltroEtiqueta,
}) {
  return (
    <aside className="chatSidebar">
      <div className="sidebarFilters">
        <input
          placeholder="Buscar..."
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
        />

        <div className="tagFilters">
          <button
            type="button"
            className={!etiquetaFiltro ? "active" : ""}
            onClick={() => onFiltroEtiqueta("")}
          >
            Todos
          </button>
          {etiquetasUnicas.map((et) => (
            <button
              key={et}
              type="button"
              className={etiquetaFiltro === et ? "active" : ""}
              onClick={() => onFiltroEtiqueta(et)}
            >
              {et}
            </button>
          ))}
        </div>
      </div>

      <div className="chatListScroll bandejaScroll">
        {chats.length === 0 && (
          <p className="emptyList">Sin conversaciones</p>
        )}
        {chats.map((c) => (
          <ChatListItem
            key={c.numero}
            chat={c}
            activo={chatActivo === c.numero}
            menuAbierto={menuChat === c.numero}
            onSelect={onSelect}
            onToggleMenu={onToggleMenu}
            onEtiqueta={onEtiqueta}
            onBloquear={onBloquear}
            onEliminar={onEliminar}
          />
        ))}
      </div>
    </aside>
  );
}
