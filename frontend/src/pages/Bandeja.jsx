import React from "react";
import { useInbox } from "../hooks/useInbox";
import ChatList from "../components/chat/ChatList";
import ChatWindow from "../components/chat/ChatWindow";
import TagModal from "../components/chat/TagModal";
import "../styles/bandeja.css";

export default function Bandeja({ onUnreadChange }) {
  const inbox = useInbox({ onUnreadChange });

  if (inbox.loading && inbox.chats.length === 0) {
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

  return (
    <div className="bandejaPage">
      <div className="bandejaTop">
        <div>
          <h1>Bandeja de entrada</h1>
          <p>Conversaciones en tiempo real · WhatsApp</p>
        </div>
      </div>

      {inbox.error && <div className="bandejaError">{inbox.error}</div>}

      <div className="bandejaLayout">
        <ChatList
          chats={inbox.chatsFiltrados}
          chatActivo={inbox.chatActivo}
          menuChat={inbox.menuChat}
          etiquetasUnicas={inbox.etiquetasUnicas}
          etiquetaFiltro={inbox.etiquetaFiltro}
          busqueda={inbox.busqueda}
          onBusqueda={inbox.setBusqueda}
          onSelect={inbox.abrirChat}
          onToggleMenu={(numero) =>
            inbox.setMenuChat(inbox.menuChat === numero ? null : numero)
          }
          onEtiqueta={(numero) => {
            inbox.setTagModalNumero(numero);
            inbox.setMenuChat(null);
          }}
          onBloquear={inbox.toggleBloqueo}
          onEliminar={inbox.eliminarChatHandler}
          onFiltroEtiqueta={inbox.cambiarFiltroEtiqueta}
        />

        <ChatWindow
          chat={inbox.chat}
          chatMeta={inbox.chatMeta}
          mensajes={inbox.mensajes}
          cargando={inbox.cargandoChat}
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
