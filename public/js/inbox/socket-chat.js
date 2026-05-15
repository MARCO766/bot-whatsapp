const socket = io();
const appCRM = document.querySelector(".whatsapp");

const USUARIO_ID = appCRM.dataset.usuario;
const CHAT_ACTUAL = appCRM.dataset.chat;

socket.emit("join-user", USUARIO_ID);

socket.on("nuevo-mensaje", function(msg){
    moverChatArriba(msg.cliente_numero);
    actualizarUltimoMensajeLista(
  msg.cliente_numero,
  msg.contenido || msg.tipo || ""
);
  if(msg.cliente_numero !== CHAT_ACTUAL) return;

  const mensajes = document.getElementById("mensajes");
  if(!mensajes) return;

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

function moverChatArriba(numero) {
  const chatList = document.querySelector(".chat-list");
  const item = document.querySelector(`.chat-item[data-numero="${numero}"]`);

  if (!chatList || !item) return;

  chatList.prepend(item);
}

function actualizarUltimoMensajeLista(numero, texto) {
  const preview = document.querySelector(
    '.chat-last-message[data-numero="' + numero + '"]'
  );

  if (!preview) return;

  preview.innerText = (texto || "").substring(0, 30);
}