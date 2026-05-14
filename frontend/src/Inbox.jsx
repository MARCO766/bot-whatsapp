import React, { useEffect, useMemo, useRef, useState } from "react";

const initialChats = [
  {
    id: "1",
    nombre: "Carlos Mendoza",
    numero: "59171234567",
    etiqueta: "Nuevo",
    bloqueado: false,
    noLeidos: 2,
    online: true,
    mensajes: [
      {
        id: "m1",
        tipo: "texto",
        autor: "cliente",
        texto: "Hola quiero información",
        hora: "10:22",
      },
      {
        id: "m2",
        tipo: "texto",
        autor: "cliente",
        texto: "¿Cuánto cuesta?",
        hora: "10:23",
      },
    ],
  },

  {
    id: "2",
    nombre: "María López",
    numero: "59170000000",
    etiqueta: "Interesado",
    bloqueado: false,
    noLeidos: 0,
    online: false,
    mensajes: [
      {
        id: "m3",
        tipo: "texto",
        autor: "cliente",
        texto: "Aceptas QR?",
        hora: "09:11",
      },
    ],
  },
];

export default function Inbox() {
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem("macbot_inbox");

    return saved ? JSON.parse(saved) : initialChats;
  });

  const [chatActivo, setChatActivo] = useState(chats[0]?.id || null);

  const [mensaje, setMensaje] = useState("");

  const [busqueda, setBusqueda] = useState("");

  const [archivo, setArchivo] = useState(null);

  const [menuChat, setMenuChat] = useState(null);

  const [typing, setTyping] = useState(false);

  const fileRef = useRef(null);

  const bottomRef = useRef(null);

  const chat = chats.find((c) => c.id === chatActivo);

  useEffect(() => {
    localStorage.setItem(
      "macbot_inbox",
      JSON.stringify(chats)
    );
  }, [chats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [chat?.mensajes]);

  function horaActual() {
    return new Date().toLocaleTimeString("es-BO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function abrirChat(id) {
    setChatActivo(id);

    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, noLeidos: 0 }
          : c
      )
    );
  }

  function enviarMensaje() {
    if (!chat) return;

    if (chat.bloqueado) {
      alert("Este contacto está bloqueado");
      return;
    }

    if (!mensaje.trim() && !archivo) return;

    const nuevoMensaje = {
      id: Date.now().toString(),
      tipo: archivo ? "archivo" : "texto",
      autor: "yo",
      texto: mensaje,
      archivo,
      hora: horaActual(),
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === chat.id
          ? {
              ...c,
              mensajes: [...c.mensajes, nuevoMensaje],
            }
          : c
      )
    );

    setMensaje("");

    setArchivo(null);
  }

  function adjuntarArchivo(e) {
    const file = e.target.files[0];

    if (!file) return;

    const fileData = {
      nombre: file.name,
      tipo: file.type,
      url: URL.createObjectURL(file),
    };

    setArchivo(fileData);

    e.target.value = "";
  }

  function eliminarChat(id) {
    const ok = confirm(
      "¿Eliminar este chat?"
    );

    if (!ok) return;

    const nuevosChats = chats.filter(
      (c) => c.id !== id
    );

    setChats(nuevosChats);

    setMenuChat(null);

    if (chatActivo === id) {
      setChatActivo(
        nuevosChats[0]?.id || null
      );
    }
  }

  function bloquearChat(id) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              bloqueado: !c.bloqueado,
            }
          : c
      )
    );

    setMenuChat(null);
  }

  function cambiarEtiqueta(
    id,
    nuevaEtiqueta
  ) {
    setChats((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              etiqueta: nuevaEtiqueta,
            }
          : c
      )
    );

    setMenuChat(null);
  }

  function mensajeFake() {
    if (!chat) return;

    setTyping(true);

    setTimeout(() => {
      setTyping(false);

      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id
            ? {
                ...c,
                mensajes: [
                  ...c.mensajes,
                  {
                    id: Date.now().toString(),
                    tipo: "texto",
                    autor: "cliente",
                    texto:
                      "Hola, sigo interesado 👀",
                    hora: horaActual(),
                  },
                ],
              }
            : c
        )
      );
    }, 1300);
  }

  const chatsFiltrados = useMemo(() => {
    return chats.filter(
      (c) =>
        c.nombre
          .toLowerCase()
          .includes(
            busqueda.toLowerCase()
          ) ||
        c.numero.includes(busqueda)
    );
  }, [busqueda, chats]);

  return (
    <div className="inboxPage">
      <style>{styles}</style>

      <div className="topBar">
        <div>
          <h1>Bandeja de entrada</h1>

          <p>
            Conversaciones en tiempo real
          </p>
        </div>

        <div className="topActions">
          <input
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) =>
              setBusqueda(e.target.value)
            }
          />

          <button onClick={mensajeFake}>
            Simular mensaje
          </button>
        </div>
      </div>

      <div className="inboxLayout">
        <aside className="chatSidebar">
          {chatsFiltrados.map((c) => (
            <div
              key={c.id}
              className={`chatItem ${
                chatActivo === c.id
                  ? "active"
                  : ""
              }`}
              onClick={() => abrirChat(c.id)}
            >
              <div className="avatar">
                {c.nombre.charAt(0)}
              </div>

              <div className="chatInfo">
                <div className="chatTop">
                  <strong>{c.nombre}</strong>

                  <small>
                    {
                      c.mensajes[
                        c.mensajes.length - 1
                      ]?.hora
                    }
                  </small>
                </div>

                <span>{c.numero}</span>

                <div className="tagRow">
                  <div
                    className={`tag ${c.etiqueta.toLowerCase()}`}
                  >
                    {c.etiqueta}
                  </div>

                  {c.noLeidos > 0 && (
                    <div className="badge">
                      {c.noLeidos}
                    </div>
                  )}

                  {c.bloqueado && (
                    <div className="blocked">
                      Bloqueado
                    </div>
                  )}
                </div>
              </div>

              <button
                className="dots"
                onClick={(e) => {
                  e.stopPropagation();

                  setMenuChat(
                    menuChat === c.id
                      ? null
                      : c.id
                  );
                }}
              >
                ⋮
              </button>

              {menuChat === c.id && (
                <div
                  className="menu"
                  onClick={(e) =>
                    e.stopPropagation()
                  }
                >
                  <button
                    onClick={() =>
                      cambiarEtiqueta(
                        c.id,
                        "Nuevo"
                      )
                    }
                  >
                    Nuevo
                  </button>

                  <button
                    onClick={() =>
                      cambiarEtiqueta(
                        c.id,
                        "Interesado"
                      )
                    }
                  >
                    Interesado
                  </button>

                  <button
                    onClick={() =>
                      cambiarEtiqueta(
                        c.id,
                        "Pagó"
                      )
                    }
                  >
                    Pagó
                  </button>

                  <button
                    onClick={() =>
                      bloquearChat(c.id)
                    }
                  >
                    {c.bloqueado
                      ? "Desbloquear"
                      : "Bloquear"}
                  </button>

                  <button
                    className="danger"
                    onClick={() =>
                      eliminarChat(c.id)
                    }
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </aside>

        <section className="chatWindow">
          {chat ? (
            <>
              <div className="chatHeader">
                <div className="chatUser">
                  <div className="bigAvatar">
                    {chat.nombre.charAt(0)}
                  </div>

                  <div>
                    <h2>{chat.nombre}</h2>

                    <p>
                      {chat.online
                        ? "En línea"
                        : "Desconectado"}
                    </p>
                  </div>
                </div>

                <div className="chatButtons">
                  <button>
                    Llamar
                  </button>

                  <button>
                    Perfil
                  </button>
                </div>
              </div>

              {chat.bloqueado && (
                <div className="blockedBanner">
                  Este contacto está
                  bloqueado
                </div>
              )}

              <div className="messages">
                {chat.mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`bubble ${
                      m.autor === "yo"
                        ? "me"
                        : "client"
                    }`}
                  >
                    {m.archivo && (
                      <div className="fileBox">
                        {m.archivo.tipo.startsWith(
                          "image/"
                        ) ? (
                          <img
                            src={
                              m.archivo.url
                            }
                            alt=""
                          />
                        ) : (
                          <a
                            href={
                              m.archivo.url
                            }
                            target="_blank"
                          >
                            📎{" "}
                            {
                              m.archivo
                                .nombre
                            }
                          </a>
                        )}
                      </div>
                    )}

                    {m.texto && (
                      <p>{m.texto}</p>
                    )}

                    <span>{m.hora}</span>
                  </div>
                ))}

                {typing && (
                  <div className="typing">
                    escribiendo...
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {archivo && (
                <div className="previewBar">
                  <div>
                    📎 {archivo.nombre}
                  </div>

                  <button
                    onClick={() =>
                      setArchivo(null)
                    }
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="composer">
                <button
                  className="attach"
                  onClick={() =>
                    fileRef.current.click()
                  }
                >
                  +
                </button>

                <input
                  hidden
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={adjuntarArchivo}
                />

                <textarea
                  placeholder={
                    chat.bloqueado
                      ? "Bloqueado"
                      : "Escribe..."
                  }
                  disabled={
                    chat.bloqueado
                  }
                  value={mensaje}
                  onChange={(e) =>
                    setMensaje(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey
                    ) {
                      e.preventDefault();

                      enviarMensaje();
                    }
                  }}
                />

                <button
                  className="send"
                  onClick={enviarMensaje}
                >
                  Enviar
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              Selecciona un chat
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = `
.inboxPage {
  min-height: 100%;
}

.topBar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:20px;
}

.topBar h1 {
  margin:0;
  font-size:30px;
}

.topBar p {
  margin:6px 0 0;
  color:#94a3b8;
}

.topActions {
  display:flex;
  gap:10px;
}

.topActions input {
  width:280px;
  height:46px;
  border:none;
  border-radius:14px;
  background:#111827;
  color:white;
  padding:0 14px;
}

.topActions button {
  height:46px;
  border:none;
  border-radius:14px;
  padding:0 16px;
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
  font-weight:900;
  cursor:pointer;
}

.inboxLayout {
  display:grid;
  grid-template-columns:360px 1fr;
  gap:18px;
  height:calc(100vh - 180px);
}

.chatSidebar,
.chatWindow {
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:24px;
  overflow:hidden;
}

.chatSidebar {
  overflow-y:auto;
}

.chatItem {
  position:relative;
  display:flex;
  gap:12px;
  padding:16px;
  cursor:pointer;
  border-bottom:1px solid rgba(148,163,184,.08);
}

.chatItem:hover,
.chatItem.active {
  background:rgba(34,197,94,.08);
}

.avatar,
.bigAvatar {
  border-radius:50%;
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
  font-weight:900;
  display:flex;
  align-items:center;
  justify-content:center;
}

.avatar {
  width:48px;
  height:48px;
}

.bigAvatar {
  width:54px;
  height:54px;
  font-size:22px;
}

.chatInfo {
  flex:1;
  min-width:0;
}

.chatTop {
  display:flex;
  justify-content:space-between;
}

.chatInfo span {
  display:block;
  margin-top:4px;
  color:#94a3b8;
  font-size:13px;
}

.tagRow {
  display:flex;
  gap:6px;
  margin-top:10px;
  flex-wrap:wrap;
}

.tag,
.badge,
.blocked {
  padding:4px 8px;
  border-radius:999px;
  font-size:11px;
  font-weight:800;
}

.tag.nuevo {
  background:#0c4a6e;
}

.tag.interesado {
  background:#78350f;
}

.tag.pagó {
  background:#14532d;
}

.badge {
  background:#dc2626;
}

.blocked {
  background:#7f1d1d;
}

.dots {
  border:none;
  background:none;
  color:#cbd5e1;
  font-size:22px;
  cursor:pointer;
}

.menu {
  position:absolute;
  top:55px;
  right:14px;
  width:170px;
  background:#020617;
  border:1px solid rgba(148,163,184,.15);
  border-radius:16px;
  overflow:hidden;
  z-index:30;
}

.menu button {
  width:100%;
  border:none;
  background:none;
  color:white;
  text-align:left;
  padding:12px;
  cursor:pointer;
}

.menu button:hover {
  background:#111827;
}

.menu .danger {
  color:#fca5a5;
}

.chatWindow {
  display:flex;
  flex-direction:column;
}

.chatHeader {
  height:80px;
  border-bottom:1px solid rgba(148,163,184,.12);
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:0 20px;
}

.chatUser {
  display:flex;
  gap:12px;
  align-items:center;
}

.chatUser h2 {
  margin:0;
}

.chatUser p {
  margin:4px 0 0;
  color:#94a3b8;
}

.chatButtons {
  display:flex;
  gap:10px;
}

.chatButtons button {
  height:42px;
  border:none;
  border-radius:12px;
  background:#111827;
  color:white;
  padding:0 14px;
  cursor:pointer;
}

.blockedBanner {
  padding:10px;
  background:#7f1d1d;
  text-align:center;
  color:#fecaca;
  font-weight:700;
}

.messages {
  flex:1;
  overflow-y:auto;
  padding:20px;
  background:
    radial-gradient(circle at top left, rgba(34,197,94,.08), transparent 25%),
    #020617;
}

.bubble {
  max-width:70%;
  padding:12px 14px;
  border-radius:18px;
  margin-bottom:12px;
}

.bubble.client {
  background:#1e293b;
  border-bottom-left-radius:4px;
}

.bubble.me {
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
  margin-left:auto;
  border-bottom-right-radius:4px;
}

.bubble p {
  margin:0;
  white-space:pre-wrap;
}

.bubble span {
  display:block;
  margin-top:6px;
  font-size:11px;
  opacity:.7;
  text-align:right;
}

.fileBox {
  margin-bottom:8px;
}

.fileBox img {
  max-width:250px;
  border-radius:14px;
}

.fileBox a {
  color:white;
}

.typing {
  color:#94a3b8;
  font-size:13px;
}

.previewBar {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:10px 16px;
  background:#111827;
  border-top:1px solid rgba(148,163,184,.1);
}

.previewBar button {
  border:none;
  background:#7f1d1d;
  color:white;
  width:28px;
  height:28px;
  border-radius:8px;
  cursor:pointer;
}

.composer {
  display:flex;
  gap:10px;
  padding:14px;
  border-top:1px solid rgba(148,163,184,.12);
}

.attach,
.send {
  border:none;
  border-radius:14px;
  cursor:pointer;
  font-weight:900;
}

.attach {
  width:48px;
  background:#111827;
  color:white;
  font-size:22px;
}

.send {
  padding:0 18px;
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
}

.composer textarea {
  flex:1;
  resize:none;
  min-height:48px;
  max-height:120px;
  border:none;
  border-radius:14px;
  background:#111827;
  color:white;
  padding:14px;
}

.empty {
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#94a3b8;
}

@media (max-width: 950px) {
  .inboxLayout {
    grid-template-columns:1fr;
    height:auto;
  }

  .chatSidebar {
    height:300px;
  }

  .chatWindow {
    height:700px;
  }

  .topBar {
    flex-direction:column;
    align-items:flex-start;
    gap:14px;
  }

  .topActions {
    width:100%;
  }

  .topActions input {
    flex:1;
    width:auto;
  }
}
`;