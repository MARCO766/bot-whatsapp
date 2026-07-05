import React, { useState } from "react";
import { useInbox, CONEXION_TODAS } from "../hooks/useInbox";
import { sameConexionId } from "../utils/conexionesInbox";
import ChatList from "../components/chat/ChatList";
import ChatWindow from "../components/chat/ChatWindow";
import ChatLeadPanel from "../components/chat/ChatLeadPanel";
import TagModal from "../components/chat/TagModal";
import BandejaLineaActiva from "../components/bandeja/BandejaLineaActiva";
import "../styles/bandeja.css";

function etiquetaTabConexion(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

export default function Bandeja({ onUnreadChange }) {
  const inbox = useInbox({ onUnreadChange });
  const [crmAbierto, setCrmAbierto] = useState(false);

  if (
    inbox.loading &&
    inbox.chats.length === 0 &&
    !inbox.conexionSeleccionadaId
  ) {
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
  (inbox.conexionesInbox || []).forEach((c) => {
    mapaNombreConexion[String(c.id)] = etiquetaTabConexion(c);
  });

  return (
    <div className="bandejaPage">
      <div className="bandejaTop">
        <div>
          <h1>Bandeja de entrada</h1>
          <BandejaLineaActiva
            conexionSeleccionadaId={inbox.conexionSeleccionadaId}
            conexionActual={inbox.conexionActual}
            conexionesInbox={inbox.conexionesInbox}
          />
          <p>Conversaciones en tiempo real · WhatsApp</p>
        </div>

        {inbox.conexionesInbox.length > 0 && (
          <div className="bandejaConexionPicker" role="tablist" aria-label="Línea WhatsApp">
            <button
              type="button"
              role="tab"
              aria-selected={inbox.conexionSeleccionadaId === CONEXION_TODAS}
              className={`bandejaConexionTab ${
                inbox.conexionSeleccionadaId === CONEXION_TODAS
                  ? "bandejaConexionTab--active"
                  : ""
              }`}
              onClick={() => inbox.seleccionarConexion(CONEXION_TODAS)}
            >
              Todas las líneas
            </button>
            {inbox.conexionesInbox.map((c) => {
              const activa = sameConexionId(
                inbox.conexionSeleccionadaId,
                c.id
              );
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  className={`bandejaConexionTab ${activa ? "bandejaConexionTab--active" : ""}`}
                  onClick={() => inbox.seleccionarConexion(c.id)}
                >
                  {etiquetaTabConexion(c)}
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
          key={inbox.conexionSeleccionadaId || "sin-conexion"}
          chats={inbox.chatsFiltrados}
          selectedChat={inbox.selectedChat}
          mostrarBadgeLinea={inbox.conexionSeleccionadaId === CONEXION_TODAS}
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
            inbox.openTagModal(chat);
            inbox.setMenuChatKey(null);
          }}
          onBloquear={inbox.toggleBloqueo}
          onEliminar={inbox.eliminarChatHandler}
          onFiltroEtiqueta={inbox.cambiarFiltroEtiqueta}
          hasMore={inbox.hasMore}
          loadingMore={inbox.loadingMore}
          onLoadMore={inbox.loadMoreInbox}
        />

        <div className={`bandejaChatArea ${crmAbierto ? "bandejaChatArea--crmOpen" : ""}`}>
          <div className="bandejaChatMain">
            <div className="bandejaChatToolbar">
              <button
                type="button"
                className={`crmToggleBtn ${crmAbierto ? "crmToggleBtn--active" : ""}`}
                onClick={() => setCrmAbierto((v) => !v)}
                disabled={!inbox.panelActivo}
              >
                {crmAbierto ? "Ocultar CRM" : "CRM"}
              </button>
            </div>

            <ChatWindow
              key={`panel-${inbox.conexionSeleccionadaId || "sin"}-${inbox.selectedChat?.cliente_numero || ""}-${inbox.selectedChat?.conexion_whatsapp_id || ""}`}
              panelActivo={inbox.panelActivo}
              chat={inbox.chat}
              chatMeta={inbox.chatMeta}
              mensajes={inbox.mensajes}
              cargando={inbox.cargandoChat}
              conexionWhatsappId={
                inbox.panelActivo
                  ? inbox.selectedChat?.conexion_whatsapp_id ||
                    inbox.selectedChat?.conexionWhatsappId
                  : null
              }
              conexionSeleccionada={inbox.conexionSeleccionadaId}
              onSent={inbox.appendMensaje}
              onPatchMensaje={inbox.patchMensaje}
              moverChatArriba={inbox.moverChatArriba}
              onOpenTagModal={inbox.openTagModal}
              onPatchBotPause={inbox.patchBotPause}
            />
          </div>

          <ChatLeadPanel
            abierto={crmAbierto && inbox.panelActivo}
            chat={inbox.chat}
            chatMeta={inbox.chatMeta}
            mensajes={inbox.mensajes}
            conexionWhatsappId={
              inbox.panelActivo
                ? inbox.selectedChat?.conexion_whatsapp_id ||
                  inbox.selectedChat?.conexionWhatsappId
                : null
            }
            onClose={() => setCrmAbierto(false)}
          />
        </div>
      </div>

      <TagModal
        numero={inbox.tagModalTarget?.numero}
        etiquetasDisponibles={inbox.etiquetasModal}
        mapaColores={inbox.mapaColores}
        onGuardar={inbox.aplicarEtiqueta}
        onQuitar={inbox.quitarEtiquetaChat}
        onCerrar={inbox.closeTagModal}
      />
    </div>
  );
}
