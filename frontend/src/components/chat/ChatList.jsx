import React, { useEffect, useRef } from "react";
import ChatListItem from "./ChatListItem";
import { sameChat } from "../../utils/chatFormat";

export default function ChatList({
  chats,
  selectedChat,
  mostrarBadgeLinea = false,
  menuChatKey,
  mapaNombreConexion = {},
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
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) {
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore();
        }
      },
      { root, rootMargin: "120px", threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loadingMore, chats.length]);

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

      <div className="chatListScroll" ref={scrollRef}>
        {chats.length === 0 && (
          <p className="emptyList">Sin conversaciones</p>
        )}
        {chats.map((c) => (
          <ChatListItem
            key={c.chatKey}
            chat={c}
            activo={Boolean(selectedChat && sameChat(c, selectedChat))}
            menuAbierto={menuChatKey === c.chatKey}
            lineaLabel={
              mostrarBadgeLinea
                ? c.conexion_nombre ||
                  mapaNombreConexion[
                    c.conexion_whatsapp_id || c.conexionWhatsappId
                  ]
                : null
            }
            onSelect={onSelect}
            onToggleMenu={onToggleMenu}
            onEtiqueta={onEtiqueta}
            onBloquear={onBloquear}
            onEliminar={onEliminar}
          />
        ))}
        {hasMore && <div ref={sentinelRef} className="chatListSentinel" aria-hidden />}
        {loadingMore && (
          <p className="chatListLoadingMore">Cargando más conversaciones...</p>
        )}
      </div>
    </aside>
  );
}
