import React, { useEffect, useRef } from "react";
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
  const bottomRef = useRef(null);
  const numero = chat?.numero || chatMeta?.numero;
  const nombre = chatMeta?.nombre || chat?.nombre || numero;
  const bloqueado = chatMeta?.bloqueado ?? chat?.bloqueado;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

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

      <div className="messagesArea">
        <div className="messages bandejaScroll">
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

          <div ref={bottomRef} className="messagesEnd" />
        </div>
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
