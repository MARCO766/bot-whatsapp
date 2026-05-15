async function cargarChatSinRecargar(numero) {
  window.history.pushState({}, "", "/inbox?numero=" + numero);

  const mensajes = document.getElementById("mensajes");
  const appCRM = document.querySelector(".whatsapp");

  if (!mensajes || !appCRM) return;

  mensajes.innerHTML = `
    <div style="color:#8f9ba8;text-align:center;margin-top:40px;">
      Cargando chat...
    </div>
  `;

  try {
    const res = await fetch("/inbox/chat-json?numero=" + numero);
    const data = await res.json();
    window.chatAbiertoManual = true;

    appCRM.dataset.chat = numero;
    limpiarBadgeNuevo(numero);
    const numeroResponder = document.getElementById("numeroResponder");
if (numeroResponder) numeroResponder.value = numero;
    document
  .querySelectorAll(".chat-item")
  .forEach(el => el.classList.remove("chat-selected"));

const item = document.querySelector(
  '.chat-item[data-numero="' + numero + '"]'
);

if (item) {
  item.classList.add("chat-selected");
}
    if (window.chatAbiertoManual) {
  
}

    const titulo = document.querySelector(".chat-top h3");
    const numeroSmall = document.querySelector(".chat-top small");

    if (titulo) titulo.innerText = data.nombre || numero;
    if (numeroSmall) numeroSmall.innerText = numero + " · en línea";

    mensajes.innerHTML = "";

    data.mensajes.forEach(msg => {
      const div = renderMessageFromDB(msg);
      mensajes.appendChild(div);
    });

    mensajes.scrollTop = mensajes.scrollHeight;

  } catch (error) {
    console.log("ERROR CARGANDO CHAT:", error);
    mensajes.innerHTML = `
      <div style="color:#ff4d4d;text-align:center;margin-top:40px;">
        Error cargando chat
      </div>
    `;
  }
}

function renderMessageFromDB(msg) {
  const div = document.createElement("div");

  div.className =
    "message " + (msg.direccion === "saliente" ? "saliente" : "entrante");

  if (msg.whatsapp_message_id) {
    div.dataset.whatsappId = msg.whatsapp_message_id;
  }

  let mediaHtml = renderMedia(msg);

  let checks = "";

  if (msg.direccion === "saliente") {
    if (msg.estado_envio === "read") {
      checks = '<span class="msg-status read">✓✓</span>';
    } else if (msg.estado_envio === "delivered") {
      checks = '<span class="msg-status delivered">✓✓</span>';
    } else {
      checks = '<span class="msg-status sent">✓</span>';
    }
  }

  div.innerHTML =
    mediaHtml +
    ((msg.contenido && !msg.contenido.startsWith("http")) ? msg.contenido : "") +
    '<span class="time">' +
      formatearHora(msg.creado_en) +
      checks +
    '</span>';

  return div;
}

function formatearHora(fecha) {
  if (!fecha) return "";

  return new Date(fecha).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function limpiarBadgeNuevo(numero) {
  const item = document.querySelector('.chat-item[data-numero="' + numero + '"]');
  if (!item) return;

  const badge = item.querySelector(".unread-badge");
  if (badge) badge.remove();

  const badges = JSON.parse(localStorage.getItem("macbot_badges") || "{}");
  delete badges[numero];
  localStorage.setItem("macbot_badges", JSON.stringify(badges));
}