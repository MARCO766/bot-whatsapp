import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const contentRef = useRef(null);
  const sentinelRef = useRef(null);
  const [listFillsContainer, setListFillsContainer] = useState(false);

  const filtroEtiquetaActivo = Boolean(String(etiquetaFiltro || "").trim());
  const autoLoadEnabled = Boolean(
    onLoadMore && hasMore && !filtroEtiquetaActivo && listFillsContainer
  );
  const showManualLoadMore = Boolean(
    onLoadMore && hasMore && (filtroEtiquetaActivo || !listFillsContainer)
  );

  useLayoutEffect(() => {
    const root = scrollRef.current;
    const content = contentRef.current;
    if (!root || !content) return undefined;

    const measure = () => {
      setListFillsContainer(content.scrollHeight > root.clientHeight + 8);
    };

    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(content);
    return () => observer.disconnect();
  }, [chats.length, loadingMore, etiquetaFiltro, hasMore]);

  useEffect(() => {
    if (!autoLoadEnabled || loadingMore) return;
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
  }, [autoLoadEnabled, onLoadMore, loadingMore]);

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
        <div ref={contentRef}>
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
        </div>
        {autoLoadEnabled && (
          <div ref={sentinelRef} className="chatListSentinel" aria-hidden />
        )}
        {autoLoadEnabled && loadingMore && (
          <p className="chatListLoadingMore">Cargando más conversaciones...</p>
        )}
        {showManualLoadMore && (
          <button
            type="button"
            className="chatListLoadMoreBtn"
            onClick={() => onLoadMore()}
            disabled={loadingMore}
          >
            {loadingMore
              ? "Cargando más conversaciones..."
              : "Cargar más conversaciones"}
          </button>
        )}
      </div>
    </aside>
  );
}
