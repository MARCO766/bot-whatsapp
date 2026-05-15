const socket = io();

function getAppCRM() {
  return document.querySelector(".whatsapp");
}

function getChatActual() {
  const appCRM = getAppCRM();
  return appCRM?.dataset?.chat || "";
}

function getUsuarioId() {
  const appCRM = getAppCRM();
  return appCRM?.dataset?.usuario || "";
}

const USUARIO_ID = getUsuarioId();

if (USUARIO_ID) {
  socket.emit("join-user", USUARIO_ID);
}

socket.on("nuevo-mensaje", function(msg){

  const numero = msg.cliente_numero;

  moverChatArriba(numero, msg);

  actualizarUltimoMensajeLista(
    numero,
    msg.contenido || msg.tipo || ""
  );

  const chatActual = getChatActual();

  if (numero !== chatActual) return;

  const mensajes = document.getElementById("mensajes");
  if (!mensajes) return;

  const div = renderIncomingMessage(msg);

  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;

});

socket.on("mensaje-estado", function(data){

  const msg = document.querySelector(
    '[data-whatsapp-id="' + data.whatsapp_message_id + '"]'
  );

  if(!msg) return;

  const status = msg.querySelector(".msg-status");

  if(!status) return;

  if(data.estado_envio === "read"){
    status.className = "msg-status read";
    status.innerText = "✓✓";
    return;
  }

  if(data.estado_envio === "delivered"){
    status.className = "msg-status delivered";
    status.innerText = "✓✓";
    return;
  }

  status.className = "msg-status sent";
  status.innerText = "✓";

});

function moverChatArriba(numero, msg = null) {
  const chatList = document.querySelector(".chat-list");
  if (!chatList || !numero) return;

  let item = document.querySelector(
    '.chat-item[data-numero="' + numero + '"]'
  );

  if (!item) {
    item = crearChatItemRealtime(numero, msg);
  }

  chatList.prepend(item);
}

function actualizarUltimoMensajeLista(numero, texto) {
  let preview = document.querySelector(
    '.chat-last-message[data-numero="' + numero + '"]'
  );

  const item = document.querySelector(
    '.chat-item[data-numero="' + numero + '"]'
  );

  if (!preview && item) {
    const info = item.querySelector(".chat-info");

    if (info) {
      preview = document.createElement("p");
      preview.className = "chat-last-message";
      preview.dataset.numero = numero;
      info.appendChild(preview);
    }
  }

  if (!preview) return;

  preview.innerText = (texto || "").substring(0, 35);
}

function crearChatItemRealtime(numero, msg) {
  const item = document.createElement("div");

  item.className = "chat-item";
  item.dataset.numero = numero;

  item.onclick = function () {
    cargarChatSinRecargar(numero);
  };

  item.innerHTML = `
    <div class="avatar"></div>

    <div class="chat-info">
      <h4>${msg?.nombre || numero}</h4>
      <small style="color:#8f9ba8;">${numero}</small>

      <p class="chat-last-message" data-numero="${numero}">
        ${(msg?.contenido || msg?.tipo || "").substring(0, 35)}
      </p>
    </div>

    <div class="chat-actions" onclick="event.stopPropagation()">
      <button class="chat-dots" onclick='toggleChatMenu("${numero}")'>⋮</button>

      <div class="chat-menu" id="chat_menu_${numero}">
        <a href="#" onclick='abrirMiniEtiqueta("${numero}"); return false;'>🏷️ Etiqueta</a>
        <a href="/bloquear-chat?numero=${numero}" onclick="return confirm('¿Bloquear este chat?')">🚫 Bloquear</a>
        <a class="danger" href="/eliminar-chat?numero=${numero}" onclick="return confirm('¿Eliminar este chat?')">🗑️ Eliminar</a>
      </div>
    </div>
  `;

  return item;
}