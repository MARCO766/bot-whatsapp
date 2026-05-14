const socket = io();
const appCRM = document.querySelector(".whatsapp");

const USUARIO_ID = appCRM.dataset.usuario;
const CHAT_ACTUAL = appCRM.dataset.chat;

socket.emit("join-user", USUARIO_ID);

socket.on("nuevo-mensaje", function(msg){
  if(msg.cliente_numero !== CHAT_ACTUAL) return;

  const mensajes = document.getElementById("mensajes");
  if(!mensajes) return;

  const div = document.createElement("div");
  div.className = "message entrante";
const mediaHtml = renderMedia(msg);
div.innerHTML =
  mediaHtml +
  (msg.contenido || "") +
  '<span class="time">ahora</span>';

  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;
});