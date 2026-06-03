const socket = io();

function getAppCRM() {
  return document.querySelector(".whatsapp");
}

function getChatActual() {
  return getChatAbiertoDesdeApp(getAppCRM());
}

function mensajeCoincideChatAbierto(msg, chatActual) {
  const numeroMsg = String(msg.cliente_numero || "").trim();
  const connMsg = String(msg.conexion_whatsapp_id || "").trim();
  if (!numeroMsg || !connMsg) return false;
  if (!chatActual.numero || !chatActual.conexionWhatsappId) return false;
  return (
    numeroMsg === chatActual.numero &&
    connMsg === chatActual.conexionWhatsappId
  );
}

function getUsuarioId() {
  const appCRM = getAppCRM();
  return appCRM?.dataset?.usuario || "";
}

const USUARIO_ID = getUsuarioId();

if (USUARIO_ID) {
  socket.emit("join-user", USUARIO_ID);
}

socket.on("nuevo-mensaje", function (msg) {
  const numero = String(msg.cliente_numero || "").trim();
  const conexionWhatsappId = String(msg.conexion_whatsapp_id || "").trim();
  const chatKey =
    String(msg.chatKey || "").trim() ||
    inboxChatKey(numero, conexionWhatsappId);

  if (!numero || !conexionWhatsappId || !chatKey) {
    return;
  }

  moverChatArriba(chatKey, numero, conexionWhatsappId, msg);

  actualizarUltimoMensajeLista(
    chatKey,
    msg.contenido || msg.tipo || ""
  );

  const chatActual = getChatActual();

  if (!mensajeCoincideChatAbierto(msg, chatActual)) {
    incrementarBadgeNuevo(chatKey);
    return;
  }

  const mensajes = document.getElementById("mensajes");
  if (!mensajes) return;

  const div = renderIncomingMessage(msg);

  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;
});

socket.on("mensaje-estado", function (data) {
  const msg = document.querySelector(
    '[data-whatsapp-id="' + data.whatsapp_message_id + '"]'
  );

  if (!msg) return;

  const status = msg.querySelector(".msg-status");

  if (!status) return;

  if (data.estado_envio === "read") {
    status.className = "msg-status read";
    status.innerText = "✓✓";
    return;
  }

  if (data.estado_envio === "delivered") {
    status.className = "msg-status delivered";
    status.innerText = "✓✓";
    return;
  }

  status.className = "msg-status sent";
  status.innerText = "✓";
});

socket.on("seguimiento-estado", function (data) {
  const chatActual = getChatActual();
  const numero = String(data.cliente_numero || "").trim();
  const conexionWhatsappId = String(data.conexion_whatsapp_id || "").trim();

  if (
    !numero ||
    !conexionWhatsappId ||
    numero !== chatActual.numero ||
    conexionWhatsappId !== chatActual.conexionWhatsappId
  ) {
    return;
  }

  const mensajes = document.getElementById("mensajes");
  if (!mensajes) return;

  const aviso = document.createElement("div");
  aviso.className = "msg-system seguimiento-estado-aviso";
  aviso.textContent =
    "⏱ Seguimiento paso " +
    ((data.paso_index || 0) + 1) +
    ": " +
    (data.estado || "actualizado");
  mensajes.appendChild(aviso);
  mensajes.scrollTop = mensajes.scrollHeight;
});

function moverChatArriba(chatKey, numero, conexionWhatsappId, msg = null) {
  const chatList = document.querySelector(".chat-list");
  const key = String(chatKey || "").trim();
  if (!chatList || !key) return;

  let item = document.querySelector('.chat-item[data-chat-key="' + key + '"]');

  if (!item) {
    item = crearChatItemRealtime(numero, conexionWhatsappId, msg);
  }

  chatList.prepend(item);
}

function actualizarUltimoMensajeLista(chatKey, texto) {
  const key = String(chatKey || "").trim();
  let preview = document.querySelector(
    '.chat-last-message[data-chat-key="' + key + '"]'
  );

  const item = document.querySelector('.chat-item[data-chat-key="' + key + '"]');

  if (!preview && item) {
    const info = item.querySelector(".chat-info");

    if (info) {
      preview = document.createElement("p");
      preview.className = "chat-last-message";
      preview.dataset.chatKey = key;
      info.appendChild(preview);
    }
  }

  if (!preview) return;

  preview.innerText = (texto || "").substring(0, 35);
}

function crearChatItemRealtime(numero, conexionWhatsappId, msg) {
  const num = String(numero || "").trim();
  const conn = String(conexionWhatsappId || "").trim();
  const key = inboxChatKey(num, conn);

  const item = document.createElement("div");

  item.className = "chat-item";
  item.dataset.numero = num;
  item.dataset.conexionWhatsappId = conn;
  item.dataset.chatKey = key;

  item.onclick = function () {
    cargarChatSinRecargar(num, conn);
  };

  item.innerHTML = `
    <div class="avatar"></div>

    <div class="chat-info">
      <h4>${msg?.nombre || num}</h4>
      <small style="color:#8f9ba8;">${num}</small>

      <p class="chat-last-message" data-chat-key="${key}">
        ${(msg?.contenido || msg?.tipo || "").substring(0, 35)}
      </p>
    </div>

    <div class="chat-actions" onclick="event.stopPropagation()">
      <button class="chat-dots" onclick='toggleChatMenu("${key}")'>⋮</button>

      <div class="chat-menu" id="chat_menu_${key.replace(/::/g, "__")}">
        <a href="#" onclick='abrirMiniEtiqueta("${num}"); return false;'>🏷️ Etiqueta</a>
        <a href="/bloquear-chat?numero=${num}" onclick="return confirm('¿Bloquear este chat?')">🚫 Bloquear</a>
        <a class="danger" href="/eliminar-chat?numero=${num}" onclick="return confirm('¿Eliminar este chat?')">🗑️ Eliminar</a>
      </div>
    </div>
  `;

  return item;
}

function incrementarBadgeNuevo(chatKey) {
  const key = String(chatKey || "").trim();
  const item = document.querySelector('.chat-item[data-chat-key="' + key + '"]');
  if (!item) return;

  let badge = item.querySelector(".unread-badge");

  if (!badge) {
    badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.dataset.chatKey = key;
    badge.innerText = "1 nuevo";

    item.appendChild(badge);

    return;
  }

  const actual = parseInt(badge.innerText, 10) || 0;
  const nuevo = actual + 1;

  badge.innerText = nuevo + " nuevo";
}
