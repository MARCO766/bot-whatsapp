const express = require("express");
const router = express.Router();

const axios = require("axios");

const { protegerPanel } = require("../middlewares/auth");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

// =========================
// 📥 INBOX VISUAL
// =========================

router.get("/inbox", protegerPanel, async (req, res) => {

  try {
const etiquetaFiltro = req.query.etiqueta || "";
    const response = await axios.get(
  `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${req.session.usuario.id}&select=*&order=creado_en.asc&limit=1000`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

const responseEtiquetas = await axios.get(
  `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${req.session.usuario.id}&select=*`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

const responseColoresEtiquetas = await axios.get(
  `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${req.session.usuario.id}&select=nombre,color`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

const mapaColoresEtiquetas = {};

(responseColoresEtiquetas.data || []).forEach(e => {
  mapaColoresEtiquetas[e.nombre] = e.color || "#25d366";
});

const etiquetasClientes = responseEtiquetas.data || [];
const etiquetasUnicas = [...new Set(etiquetasClientes.map(e => e.etiqueta))];
const conversaciones = {};
const mensajes = response.data || [];

const responseConversaciones = await axios.get(
  `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${req.session.usuario.id}&select=*`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

const conversacionesDB = responseConversaciones.data || [];

const mapaUnread = {};

conversacionesDB.forEach(c => {
  mapaUnread[c.cliente_numero] = c.unread_count || 0;
});
mensajes.sort((a, b) => {
  return new Date(a.creado_en) - new Date(b.creado_en);
});
mensajes.forEach(msg => {

  const numero =
    msg.cliente_numero ||
    msg.numero_de_cliente ||
    msg["número_de_cliente"];

  if (!numero) return;

  if (!conversaciones[numero]) {
    conversaciones[numero] = [];
  }

  conversaciones[numero].push(msg);

});
let numeros = Object.keys(conversaciones);

if (etiquetaFiltro) {
  const numerosConEtiqueta = etiquetasClientes
    .filter(e => e.etiqueta === etiquetaFiltro)
    .map(e => e.cliente_numero);

  numeros = numeros.filter(numero => numerosConEtiqueta.includes(numero));
}
const chatSeleccionado = req.query.numero || "";
const chatActual = numeros.includes(chatSeleccionado) ? chatSeleccionado : (numeros[0] || "");

if (chatActual) {
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${chatActual}&usuario_id=eq.${req.session.usuario.id}`,
    {
      unread_count: 0
    },
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );
}

function horaBolivia(fecha) {
  if (!fecha) return "";

  return new Date(fecha).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}
    let html = `

<link rel="stylesheet" href="/css/crm.css">

<div
  class="whatsapp"
  data-usuario="${req.session.usuario.id}"
  data-chat="${chatActual}"
>

  <!-- SIDEBAR -->
  <div class="sidebar">

    <div class="sidebar-top">
      MacBot Inbox
    </div>

    <div class="search">
  <input type="text" placeholder="Buscar chat...">

  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
    <a href="/inbox" style="
      background:${!etiquetaFiltro ? "#25d366" : "#202c33"};
      color:white;
      padding:6px 10px;
      border-radius:8px;
      text-decoration:none;
      font-size:12px;
    ">Todos</a>

    ${etiquetasUnicas.map(et => `
      <a href="/inbox?etiqueta=${encodeURIComponent(et)}" style="
        background:${etiquetaFiltro === et ? (mapaColoresEtiquetas[et] || "#25d366") : "#202c33"};
        color:white;
        padding:6px 10px;
        border-radius:8px;
        text-decoration:none;
        font-size:12px;
      ">${et}</a>
    `).join("")}
  </div>
</div>

    <div class="chat-list">

      ${numeros.map(numero => `
        <div class="chat-item" onclick="window.location.href='/inbox?numero=${numero}${etiquetaFiltro ? '&etiqueta=' + encodeURIComponent(etiquetaFiltro) : ''}'">

          <div class="avatar"></div>

          <div class="chat-info">
            <h4>${numero}</h4>
            ${
  mapaUnread[numero] > 0
  ? `<span style="
      background:#ff3b30;
      color:white;
      padding:3px 8px;
      border-radius:999px;
      font-size:12px;
      font-weight:bold;
      display:inline-block;
      margin-top:5px;
    ">
      ${mapaUnread[numero]} nuevo
    </span>`
  : ""
}
<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">

  ${
    etiquetasClientes
      .filter(e => e.cliente_numero === numero)
      .map(e => `
        <span style="
  background:${mapaColoresEtiquetas[e.etiqueta] || "#25d366"};
  color:white;
  padding:3px 8px;
  border-radius:999px;
  font-size:11px;
  font-weight:bold;
  border:1px solid ${mapaColoresEtiquetas[e.etiqueta] || "#25d366"};
">
  ${e.etiqueta}
</span>
      `).join("")
  }

</div>
            <p>
              ${(conversaciones[numero][conversaciones[numero].length - 1]?.contenido || "").substring(0,30)}
            </p>
          </div>
          <div class="chat-actions" onclick="event.stopPropagation()">
  <button class="chat-dots" onclick="toggleChatMenu('${numero}')">⋮</button>

  <div class="chat-menu" id="chat_menu_${numero}">
    <a href="/chat-etiqueta?numero=${numero}">🏷️ Etiqueta</a>
    <a href="/bloquear-chat?numero=${numero}" onclick="return confirm('¿Bloquear este chat?')">🚫 Bloquear</a>
     <a href="/desbloquear-chat?numero=${numero}">✅ Desbloquear</a>
    <a class="danger" href="/eliminar-chat?numero=${numero}" onclick="return confirm('¿Eliminar este chat?')">🗑️ Eliminar</a>
  </div>
</div>
        </div>
      `).join("")}

    </div>

  </div>

  <!-- CHAT -->
  <div class="chat">

    <div class="chat-top">
      <div class="avatar"></div>

      <div>
        <h3>${chatActual || "Selecciona un chat"}</h3>
        <small style="color:#25d366;">en línea</small>
      </div>
    </div>

    <div class="chat-messages" id="mensajes">

      ${
  chatActual && conversaciones[chatActual]
  ? conversaciones[chatActual].map(msg => `

    <div class="message ${msg.direccion === "saliente" ? "saliente" : "entrante"}">

      ${
        (msg.tipo === "image" || msg.tipo === "imagen") && msg.imagen_url
        ? `<img src="${msg.imagen_url}" style="max-width:260px;border-radius:10px;display:block;margin-bottom:6px;">`
        : ""
      }

      ${
  msg.tipo === "video" && msg.imagen_url
  ? `<video controls style="max-width:280px;border-radius:10px;display:block;margin-bottom:6px;">
       <source src="${msg.imagen_url}">
     </video>`
  : ""
}

${
  msg.tipo === "document" && msg.imagen_url
  ? `<a href="${msg.imagen_url}" target="_blank" style="
        display:block;
        background:#202c33;
        color:#25d366;
        padding:12px;
        border-radius:10px;
        text-decoration:none;
        margin-bottom:6px;
      ">
        📄 Abrir documento
     </a>`
  : ""
}

${
  msg.tipo === "audio" && msg.imagen_url
    ? '<audio controls style="width:260px;display:block;margin-bottom:6px;"><source src="' + msg.imagen_url + '"></audio>'
    : ""
}

      ${
        msg.contenido && !msg.contenido.startsWith("http")
        ? msg.contenido
        : ""
      }

      <span class="time">
        ${horaBolivia(msg.creado_en)}
      </span>

    </div>

  `).join("")
  : ""
}

    </div>

<script src="/js/autoscroll.js"></script>

<script src="/js/chat-menu.js"></script>

    ${
      chatActual
      ? `
      <div class="chat-bottom">

<form action="/inbox/responder" method="POST" enctype="multipart/form-data">

  <input type="hidden" name="numero" value="${chatActual}">

  <input
    type="file"
    name="archivo"
    id="archivoChat"
    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
    style="display:none;"
  >

  <button
    type="button"
    onclick="document.getElementById('archivoChat').click()"
    style="
      width:55px;
      border:none;
      border-radius:50%;
      background:#2a3942;
      color:white;
      font-size:28px;
      cursor:pointer;
    "
  >
    +
  </button>

  <textarea
    name="respuesta"
    placeholder="Mensaje..."
  ></textarea>

  <button type="submit">➤</button>
  <button id="btnAudio" type="button" style="
  width:55px;
  border:none;
  border-radius:50%;
  background:#202c33;
  color:white;
  font-size:22px;
  cursor:pointer;
">
🎤
</button>

</form>

<div
  id="previewArchivo"
  style="
    color:#25d366;
    font-size:13px;
    margin-top:8px;
  "
></div>


      </div>
     `
: ""
}
  </div>

  </div>

<script src="/socket.io/socket.io.js"></script>
<script src="/js/crm.js"></script>
<script src="/js/preview.js"></script>
<script src="/js/audio-recorder.js"></script>


</div>
      `;


    res.render("inbox", {
  html
});

  } catch (error) {

    res.send(error.message);

  }

});

module.exports = router;