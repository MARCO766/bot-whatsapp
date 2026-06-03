function inboxChatKey(numero, conexionWhatsappId) {
  const n = String(numero || "").trim();
  const c = String(conexionWhatsappId || "").trim();
  if (!n || !c) return "";
  return n + "::" + c;
}

function setChatAbiertoEnApp(appCRM, numero, conexionWhatsappId) {
  if (!appCRM) return;
  const key = inboxChatKey(numero, conexionWhatsappId);
  appCRM.dataset.chatNumero = numero || "";
  appCRM.dataset.conexionWhatsappId = conexionWhatsappId || "";
  appCRM.dataset.chatKey = key;
}

function getChatAbiertoDesdeApp(appCRM) {
  if (!appCRM) return { numero: "", conexionWhatsappId: "", chatKey: "" };
  const numero = String(appCRM.dataset.chatNumero || "").trim();
  const conexionWhatsappId = String(
    appCRM.dataset.conexionWhatsappId || ""
  ).trim();
  const chatKey =
    String(appCRM.dataset.chatKey || "").trim() ||
    inboxChatKey(numero, conexionWhatsappId);
  return { numero, conexionWhatsappId, chatKey };
}

function seleccionarChatItem(numero, conexionWhatsappId) {
  const key = inboxChatKey(numero, conexionWhatsappId);
  document.querySelectorAll(".chat-item").forEach((el) => {
    el.classList.remove("chat-selected");
  });
  const item = document.querySelector(
    '.chat-item[data-chat-key="' + key + '"]'
  );
  if (item) {
    item.classList.add("chat-selected");
  }
}

async function cargarChatSinRecargar(numero, conexionWhatsappId) {
  const num = String(numero || "").trim();
  const conn = String(conexionWhatsappId || "").trim();

  if (!num || !conn) {
    console.log("[INBOX_MULTI_GUARD] falta conexion_whatsapp_id");
    return;
  }

  const chatKey = inboxChatKey(num, conn);
  const qs =
    "numero=" +
    encodeURIComponent(num) +
    "&conexion_whatsapp_id=" +
    encodeURIComponent(conn);

  window.history.pushState({}, "", "/inbox?" + qs);

  const mensajes = document.getElementById("mensajes");
  const appCRM = document.querySelector(".whatsapp");

  if (!mensajes || !appCRM) return;

  mensajes.innerHTML = `
    <div style="color:#8f9ba8;text-align:center;margin-top:40px;">
      Cargando chat...
    </div>
  `;

  try {
    const res = await fetch("/inbox/chat-json?" + qs);
    const data = await res.json();
    window.chatAbiertoManual = true;

    setChatAbiertoEnApp(appCRM, num, conn);
    limpiarBadgeNuevo(chatKey);

    await fetch("/inbox/marcar-leido", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        numero: num,
        conexion_whatsapp_id: conn,
      }),
    });
    limpiarBadgeNuevo(chatKey);

    const numeroResponder = document.getElementById("numeroResponder");
    const conexionResponder = document.getElementById("conexionResponder");
    if (numeroResponder) numeroResponder.value = num;
    if (conexionResponder) conexionResponder.value = conn;

    seleccionarChatItem(num, conn);

    const titulo = document.querySelector(".chat-top h3");
    const numeroSmall = document.querySelector(".chat-top small");

    if (titulo) titulo.innerText = data.nombre || num;
    if (numeroSmall) {
      numeroSmall.innerText = num + " · en línea";
    }

    mensajes.innerHTML = "";

    (data.mensajes || []).forEach((msg) => {
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
    (msg.contenido && !msg.contenido.startsWith("http") ? msg.contenido : "") +
    '<span class="time">' +
    formatearHora(msg.creado_en) +
    checks +
    "</span>";

  return div;
}

function formatearHora(fecha) {
  if (!fecha) return "";

  return new Date(fecha).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function limpiarBadgeNuevo(chatKey) {
  const key = String(chatKey || "").trim();
  if (!key) return;

  const item = document.querySelector('.chat-item[data-chat-key="' + key + '"]');
  if (!item) return;

  const badge = item.querySelector(".unread-badge");
  if (badge) badge.remove();

  const badges = JSON.parse(localStorage.getItem("macbot_badges") || "{}");
  delete badges[key];
  localStorage.setItem("macbot_badges", JSON.stringify(badges));
}
