import React from "react";
import { useInbox, CONEXION_TODAS } from "../hooks/useInbox";
import ChatList from "../components/chat/ChatList";
import ChatWindow from "../components/chat/ChatWindow";
import TagModal from "../components/chat/TagModal";
import "../styles/bandeja.css";

function etiquetaConexion(c) {
  if (c.nombre?.trim()) return c.nombre.trim();
  if (c.numero?.trim()) return c.numero.trim();
  return `Línea ${String(c.phone_id || "").slice(-4) || "—"}`;
}

export default function Bandeja({ onUnreadChange }) {
  const inbox = useInbox({ onUnreadChange });

  if (inbox.loading && inbox.chats.length === 0 && !inbox.conexionSeleccionada) {
    return (
      <div className="bandejaPage">
        <div className="bandejaTop">
          <div>
            <h1>Bandeja de entrada</h1>
            <p>Cargando conversaciones...</p>
          </div>
        </div>
      </div>
    );
  }

  const mapaNombreConexion = {};
  (inbox.conexiones || []).forEach((c) => {
    mapaNombreConexion[c.id] = etiquetaConexion(c);
  });

  return (
    <div className="bandejaPage">
      <div className="bandejaTop">
        <div>
          <h1>Bandeja de entrada</h1>
          <p>Conversaciones en tiempo real · WhatsApp</p>
        </div>

        {inbox.conexiones.length > 0 && (
          <div className="bandejaConexionPicker" role="tablist" aria-label="Línea WhatsApp">
            <button
              type="button"
              role="tab"
              aria-selected={inbox.conexionSeleccionada === CONEXION_TODAS}
              className={`bandejaConexionTab ${
                inbox.conexionSeleccionada === CONEXION_TODAS
                  ? "bandejaConexionTab--active"
                  : ""
              }`}
              onClick={() => inbox.cambiarConexion(CONEXION_TODAS)}
            >
              Todas las líneas
            </button>
            {inbox.conexiones.map((c) => {
              const activa = inbox.conexionSeleccionada === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  className={`bandejaConexionTab ${activa ? "bandejaConexionTab--active" : ""}`}
                  onClick={() => inbox.cambiarConexion(c.id)}
                >
                  {etiquetaConexion(c)}
                  {c.activo && (
                    <span className="bandejaConexionPrincipal">principal</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {inbox.error && <div className="bandejaError">{inbox.error}</div>}

      <div className="bandejaLayout">
        <ChatList
          chats={inbox.chatsFiltrados}
          selectedChat={inbox.selectedChat}
          menuChatKey={inbox.menuChatKey}
          mapaNombreConexion={mapaNombreConexion}
          etiquetasUnicas={inbox.etiquetasUnicas}
          etiquetaFiltro={inbox.etiquetaFiltro}
          busqueda={inbox.busqueda}
          onBusqueda={inbox.setBusqueda}
          onSelect={inbox.abrirChat}
          onToggleMenu={(chat) =>
            inbox.setMenuChatKey(
              inbox.menuChatKey === chat.chatKey ? null : chat.chatKey
            )
          }
          onEtiqueta={(chat) => {
            inbox.setTagModalNumero(chat.numero || chat.cliente_numero);
            inbox.setMenuChatKey(null);
          }}
          onBloquear={inbox.toggleBloqueo}
          onEliminar={inbox.eliminarChatHandler}
          onFiltroEtiqueta={inbox.cambiarFiltroEtiqueta}
        />

        <ChatWindow
          panelActivo={inbox.panelActivo}
          chat={inbox.chat}
          chatMeta={inbox.chatMeta}
          mensajes={inbox.mensajes}
          cargando={inbox.cargandoChat}
          conexionWhatsappId={
            inbox.selectedChat?.conexion_whatsapp_id ||
            inbox.selectedChat?.conexionWhatsappId
          }
          conexionSeleccionada={inbox.conexionSeleccionada}
          onSent={inbox.appendMensaje}
          onPatchMensaje={inbox.patchMensaje}
          moverChatArriba={inbox.moverChatArriba}
        />
      </div>

      <TagModal
        numero={inbox.tagModalNumero}
        etiquetasDisponibles={inbox.etiquetasDisponibles}
        mapaColores={inbox.mapaColores}
        onGuardar={inbox.aplicarEtiqueta}
        onQuitar={inbox.quitarEtiquetaChat}
        onCerrar={() => inbox.setTagModalNumero(null)}
      />
    </div>
  );
}
