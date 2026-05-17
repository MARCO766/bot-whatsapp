import React, { useCallback, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ChatComposer from "./ChatComposer";

export default function ChatWindow({
  chat,
  chatMeta,
  mensajes,
  cargando,
  onSent,
  onPatchMensaje,
  moverChatArriba,
}) {
  const scrollRef = useRef(null);
  const numero = chat?.numero || chatMeta?.numero;
  const nombre = chatMeta?.nombre || chat?.nombre || numero;
  const bloqueado = chatMeta?.bloqueado ?? chat?.bloqueado;

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

  if (!numero) {
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
      </header>

      {bloqueado && (
        <div className="blockedBanner">Este contacto está bloqueado</div>
      )}

      <div
        ref={scrollRef}
        className="messages"
        aria-label="Mensajes del chat"
      >
          <div className="messagesTopSpacer" aria-hidden />

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
        bloqueado={bloqueado}
        onSent={onSent}
        onPreviewList={(id, patch) => onPatchMensaje(id, patch)}
        moverChatArriba={moverChatArriba}
      />
    </section>
  );
}
