import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";
import {
  calcularVentana24h,
  etiquetaVentanaBadge,
} from "../../utils/whatsappVentana24h";

export default function ChatWindow({
  panelActivo = false,
  chat,
  chatMeta,
  mensajes,
  cargando,
  conexionWhatsappId,
  conexionSeleccionada,
  onSent,
  onPatchMensaje,
  moverChatArriba,
}) {
  const scrollRef = useRef(null);
  const [ventanaTick, setVentanaTick] = useState(0);
  const numero = panelActivo ? chat?.numero || chat?.cliente_numero : null;
  const nombre = panelActivo
    ? chatMeta?.nombre || chat?.nombre || numero
    : null;
  const bloqueado = panelActivo
    ? chatMeta?.bloqueado ?? chat?.bloqueado
    : false;

  const ventana = useMemo(
    () => calcularVentana24h(mensajes),
    [mensajes, ventanaTick]
  );
  const ventanaAbierta = ventana.abierta;

  useEffect(() => {
    if (!numero || !ventanaAbierta) return undefined;
    const id = setInterval(() => setVentanaTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [numero, ventanaAbierta]);

  const scrollToBottom = useCallback((instant = false) => {
    const el = scrollRef.current;
    if (!el) return;

    const run = () => {
      if (instant) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };

    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  }, []);

  useEffect(() => {
    if (!numero) return;
    scrollToBottom(true);
  }, [numero, scrollToBottom]);

  useEffect(() => {
    if (!numero || cargando) return;
    scrollToBottom(false);
  }, [mensajes, cargando, numero, scrollToBottom]);

  useEffect(() => {
    if (!numero || cargando) return;
    scrollToBottom(true);
  }, [cargando, numero, scrollToBottom]);

  const conexionChat = String(
    chat?.conexion_whatsapp_id || chat?.conexionWhatsappId || conexionWhatsappId || ""
  );
  const conexionTab = String(conexionSeleccionada || "");
  const conexionCoincide =
    !conexionTab ||
    conexionTab === "__todas__" ||
    !conexionChat ||
    conexionChat === conexionTab;

  if (!panelActivo || !numero || !conexionCoincide) {
    return (
      <section className="chatWindow">
        <div className="empty">Selecciona un chat</div>
      </section>
    );
  }

  return (
    <section className="chatWindow">
      <header className="chatHeader">
        <div className="chatUser">
          <div className="bigAvatar">{(nombre || "?").charAt(0)}</div>
          <div className="chatUserText">
            <h2>{nombre}</h2>
            <p>{numero}</p>
            <small className="online">En línea</small>
          </div>
        </div>
        <span
          className={`whatsappVentanaBadge ${
            ventanaAbierta ? "whatsappVentanaBadge--open" : "whatsappVentanaBadge--closed"
          }`}
          title={
            ventanaAbierta
              ? "Puedes enviar mensajes manuales dentro de la ventana de 24h"
              : "El lead debe responder para reabrir la ventana de 24h"
          }
        >
          {etiquetaVentanaBadge(ventana)}
        </span>
      </header>

      {bloqueado && (
        <div className="blockedBanner">Este contacto está bloqueado</div>
      )}

      <div
        ref={scrollRef}
        className="messages"
        aria-label="Mensajes del chat"
      >
          {cargando && (
            <div className="loadingChat">Cargando conversación...</div>
          )}

          {!cargando &&
            mensajes.map((m) => (
              <MessageBubble
                key={m.id || `${m.creado_en}-${m.contenido}`}
                msg={m}
                uploadProgress={m._uploadProgress}
              />
            ))}

        <div className="messagesEnd" />
      </div>

      <ChatComposer
        numero={numero}
        conexionWhatsappId={conexionWhatsappId}
        bloqueado={bloqueado}
        ventanaAbierta={ventanaAbierta}
        onSent={onSent}
        onPreviewList={(id, patch) => onPatchMensaje(id, patch)}
        moverChatArriba={moverChatArriba}
      />
    </section>
  );
}
