const express = require("express");
const router = express.Router();

const axios = require("axios");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

const upload = multer({
  storage: multer.memoryStorage()
});

const { protegerPanel } = require("../middlewares/auth");
const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp
} = require("../services/whatsappService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
router.post("/subir-archivo", protegerPanel, upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }

    const extension = req.file.originalname.split(".").pop();
    const nombreArchivo = Date.now() + "-" + Math.random().toString(36).substring(2) + "." + extension;

    const rutaArchivo = `whatsapp/${req.session.usuario.id}/${nombreArchivo}`;

    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaArchivo}`,
      req.file.buffer,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": req.file.mimetype,
          "x-upsert": "true"
        }
      }
    );

    const urlPublica = `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaArchivo}`;

    res.json({
      ok: true,
      url: urlPublica,
      tipo: req.file.mimetype
    });

  } catch (error) {
    console.log("ERROR SUBIENDO ARCHIVO:", error.response?.data || error.message);
    res.status(500).json({ error: "Error subiendo archivo" });
  }
});

// ✅ CREAR FLUJO
router.post("/crear-flujo", protegerPanel, async (req, res) => {
  try {
    const { nombre } = req.body;

    await axios.post(
  `${SUPABASE_URL}/rest/v1/flujos_builder`,
  {
  nombre,
  usuario_id: req.session.usuario.id,
  data: {
    nodos: [],
    conexiones: []
  }
},
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect("/admin?tab=flujos");

  } catch (error) {
    console.log(error.response?.data || error.message);
    res.send("Error creando flujo");
  }
});


// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

// =========================
// ✍️ RESPONDER MANUAL
// =========================

router.post("/inbox/responder", protegerPanel, upload.single("archivo"), async (req, res) => {

  try {

    const { numero, respuesta } = req.body;

    // =========================
    // SOLO TEXTO
    // =========================

    if (!req.file) {

      if (!respuesta || !respuesta.trim()) {
        return res.redirect("/inbox?numero=" + numero);
      }

      await enviarTextoWhatsApp(
        numero,
        respuesta,
        {
          usuarioId: req.session.usuario.id
        }
      );

      return res.redirect("/inbox?numero=" + numero);
    }

    // =========================
    // ARCHIVO
    // =========================

    const mime = req.file.mimetype;
    const sizeMB = req.file.size / 1024 / 1024;

    let tipoWhatsApp = null;

    // =========================
    // IMAGEN
    // =========================

    if (mime.startsWith("image/")) {

      if (sizeMB > 2) {
        return res.send("❌ Imagen máxima 2MB");
      }

      tipoWhatsApp = "image";
    }

    // =========================
    // VIDEO
    // =========================

    else if (mime.startsWith("video/")) {

      tipoWhatsApp = "video";

      // video temporal original
      const tempInput = path.join(
        __dirname,
        "../temp",
        Date.now() + "-input.mp4"
      );

      // video comprimido
      const tempOutput = path.join(
        __dirname,
        "../temp",
        Date.now() + "-output.mp4"
      );

      fs.writeFileSync(tempInput, req.file.buffer);

      // comprimir video
      await new Promise((resolve, reject) => {

        ffmpeg(tempInput)

          .outputOptions([
            "-vcodec libx264",
            "-crf 32",
            "-preset veryfast",
            "-movflags +faststart",
            "-acodec aac",
            "-b:a 96k",
            "-vf scale=720:-2"
          ])

          .save(tempOutput)

          .on("end", resolve)

          .on("error", reject);

      });

      const compressedBuffer = fs.readFileSync(tempOutput);

      req.file.buffer = compressedBuffer;

      fs.unlinkSync(tempInput);
      fs.unlinkSync(tempOutput);

    }

    // =========================
// AUDIO
// =========================

else if (mime.startsWith("audio/")) {

  tipoWhatsApp = "audio";

  const tempInput = path.join(
    __dirname,
    "../temp",
    Date.now() + "-input.webm"
  );

  const tempOutput = path.join(
    __dirname,
    "../temp",
    Date.now() + "-output.mp3"
  );

  fs.writeFileSync(tempInput, req.file.buffer);

  await new Promise((resolve, reject) => {
    ffmpeg(tempInput)
      .outputOptions([
        "-vn",
        "-ar 44100",
        "-ac 2",
        "-b:a 96k"
      ])
      .save(tempOutput)
      .on("end", resolve)
      .on("error", reject);
  });

  const audioConvertido = fs.readFileSync(tempOutput);

  req.file.buffer = audioConvertido;
  req.file.mimetype = "audio/mpeg";
  req.file.originalname = "audio.mp3";

  fs.unlinkSync(tempInput);
  fs.unlinkSync(tempOutput);

}

    // =========================
    // DOCUMENTOS
    // =========================

    else if (

      mime === "application/pdf" ||

      mime === "application/msword" ||

      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||

      mime === "application/vnd.ms-excel" ||

      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    ) {

      tipoWhatsApp = "document";

    }

    else {

      return res.send("❌ Archivo no permitido");

    }

    // =========================
    // SUBIR A SUPABASE
    // =========================

    const extension = req.file.originalname.split(".").pop();

    const nombreArchivo =
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2) +
      "." +
      extension;

    const rutaArchivo =
      `whatsapp/${req.session.usuario.id}/${nombreArchivo}`;

    await axios.post(

      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaArchivo}`,

      req.file.buffer,

      {

        headers: {

          apikey: SUPABASE_KEY,

          Authorization: `Bearer ${SUPABASE_KEY}`,

          "Content-Type": req.file.mimetype,

          "x-upsert": "true"

        }

      }

    );

    const urlPublica =
      `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaArchivo}`;

    // =========================
    // ENVIAR WHATSAPP
    // =========================

    await enviarMediaWhatsApp(

      numero,

      tipoWhatsApp,

      urlPublica,

      respuesta || "",

      {

        usuarioId: req.session.usuario.id

      }

    );

    res.redirect("/inbox?numero=" + numero);

  }

  catch (error) {

    console.log(
      "ERROR ARCHIVO:",
      error.response?.data || error.message
    );

    res.send("Error enviando archivo");

  }

});

router.post("/guardar-flujo-builder", protegerPanel, async (req, res) => {
  try {
    const { id, nombre, data } = req.body;

    if (!nombre || !data) {
      return res.status(400).send("Falta nombre o data del flujo");
    }

    if(id){
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}`,
        {
  nombre,
  usuario_id: req.session.usuario.id,
  data
},
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          }
        }
      );

      return res.send("✅ Flujo actualizado correctamente");
    }

    await axios.post(
  `${SUPABASE_URL}/rest/v1/flujos_builder`,
  {
    nombre,
    usuario_id: req.session.usuario.id,
    data
  },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    res.send("✅ Flujo guardado correctamente");

  } catch (error) {
    console.log("ERROR GUARDANDO FLUJO:", error.response?.data || error.message);
    res.status(500).send("❌ Error guardando flujo. Mira Railway logs.");
  }
});
router.post("/editar-nombre-flujo/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}`,
      { nombre },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    res.send("✅ Nombre actualizado");

  } catch (error) {
    console.log(error.response?.data || error.message);
    res.status(500).send("❌ Error editando nombre");
  }
});

router.get("/eliminar-flujo/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/admin?tab=flujos");

  } catch (error) {
    console.log(error.response?.data || error.message);
    res.send("Error eliminando flujo");
  }
});

router.get("/duplicar-flujo/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;

    const flujo = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const original = flujo.data[0];

    if(!original){
      return res.send("Flujo no encontrado");
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/flujos_builder`,
      {
        nombre: original.nombre + " - copia",
        data: original.data
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    res.redirect("/admin?tab=flujos");

  } catch (error) {
    console.log(error.response?.data || error.message);
    res.send("Error duplicando flujo");
  }
});

router.get("/exportar-flujo/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;

    const flujo = await axios.get(
      `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${id}&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const data = flujo.data[0];

    if(!data){
      return res.send("Flujo no encontrado");
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${data.nombre}.json"`);
    res.send(JSON.stringify(data, null, 2));

  } catch (error) {
    console.log(error.response?.data || error.message);
    res.send("Error exportando flujo");
  }
});

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

<script>

const archivoChat =
  document.getElementById("archivoChat");

const previewArchivo =
  document.getElementById("previewArchivo");

  const btnAudio = document.getElementById("btnAudio");

let mediaRecorder;
let audioChunks = [];

archivoChat.addEventListener("change", function(){

  if(!this.files[0]) return;

  const file = this.files[0];

  const mb = file.size / 1024 / 1024;

  if(file.type.startsWith("image/") && mb > 2){

    alert("❌ Imagen máxima 2MB");

    this.value = "";

    previewArchivo.innerHTML = "";

    return;

  }

  if(file.type.startsWith("video/") && mb > 15){

    alert("⚠️ El video será comprimido automáticamente");

  }

  previewArchivo.innerHTML =
    "📎 " + file.name;

});

let grabando = false;

btnAudio.addEventListener("click", async () => {
  if (!grabando) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      const formData = new FormData();
      formData.append("numero", "${chatActual}");
      formData.append("archivo", audioBlob, "audio.webm");
alert("Audio grabado: " + audioBlob.size + " bytes");
      await fetch("/inbox/responder", {
        method: "POST",
        body: formData
      });

      window.location.reload();
    };

    mediaRecorder.start();
    grabando = true;
    btnAudio.style.background = "#ff3b30";
    btnAudio.innerHTML = "⏹";
  } else {
    mediaRecorder.stop();
    grabando = false;
    btnAudio.style.background = "#202c33";
    btnAudio.innerHTML = "🎤";
  }
});

</script>

      </div>
     `
: ""
}
  </div>

  </div>

<script src="/socket.io/socket.io.js"></script>
<script src="/js/crm.js"></script>


</div>
      `;


    res.send(html);

  } catch (error) {

    res.send(error.message);

  }

});
router.post("/guardar-activador", protegerPanel, async (req, res) => {
  try {
    const { id, nombre, flujo_id, conexion, frase } = req.body;

    const activo = req.body.activo === "on";
    const repetible = req.body.repetible === "on";

    if(id){
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}`,
        {
  nombre,
  flujo_id,
  conexion,
  frase,
  activo,
  repetible,
  usuario_id: req.session.usuario.id
},
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          }
        }
      );

      return res.redirect("/admin?tab=activadores");
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/activadores`,
      {
  nombre,
  flujo_id,
  conexion,
  frase,
  activo,
  repetible,
  usuario_id: req.session.usuario.id
},
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }
      }
    );

    res.redirect("/admin?tab=activadores");

  } catch (error) {
    console.log("ERROR GUARDANDO ACTIVADOR:", error.response?.data || error.message);
    res.send("Error guardando activador");
  }
});

router.get("/eliminar-activador/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/admin?tab=activadores");

  } catch (error) {
    console.log("ERROR ELIMINANDO ACTIVADOR:", error.response?.data || error.message);
    res.send("Error eliminando activador");
  }
});
router.post("/crear-etiqueta", protegerPanel, async (req, res) => {
  try {
    const { nombre, color } = req.body;

    if (!nombre) {
      return res.send("Falta nombre de etiqueta");
    }

    await axios.post(
      `${SUPABASE_URL}/rest/v1/etiquetas?on_conflict=nombre`,
      {
  nombre: nombre.trim(),
  color: color || "#25d366",
  usuario_id: req.session.usuario.id
},
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }
      }
    );

    res.redirect("/admin?tab=etiquetas");

  } catch (error) {
    console.log("ERROR CREANDO ETIQUETA:", error.response?.data || error.message);
    res.send("Error creando etiqueta");
  }
});

router.get("/eliminar-etiqueta/:id", protegerPanel, async (req, res) => {
  try {
    const { id } = req.params;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/admin?tab=etiquetas");

  } catch (error) {
    console.log("ERROR ELIMINANDO ETIQUETA:", error.response?.data || error.message);
    res.send("Error eliminando etiqueta");
  }
});

router.post("/probar-whatsapp", protegerPanel, async (req, res) => {
  try {
    const { numero } = req.body;

    if (!numero) {
      return res.send("Falta número");
    }

    const responseConexion = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${req.session.usuario.id}&activo=eq.true&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const conexion = responseConexion.data?.[0];

    if (!conexion || !conexion.token || !conexion.phone_id) {
      return res.send("❌ Primero conecta tu WhatsApp en la pestaña Conexiones");
    }

    await axios.post(
      `https://graph.facebook.com/v19.0/${conexion.phone_id}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: {
          body: "✅ MacBot conectado correctamente. Esta es una prueba de WhatsApp API."
        }
      },
      {
        headers: {
          Authorization: `Bearer ${conexion.token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect("/admin?tab=inicio");

  } catch (error) {
    console.log("ERROR PROBANDO WHATSAPP:", error.response?.data || error.message);
    res.send("❌ Error enviando prueba. Revisa Railway logs.");
  }
});
router.post("/guardar-conexion", protegerPanel, async (req, res) => {
  try {

    const { 
      nombre, 
      numero, 
      token, 
      phone_id,
      pixel_id,
      capi_token
    } = req.body;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${req.session.usuario.id}`,
      {
        activo: false
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp`,
      {
        usuario_id: req.session.usuario.id,
        nombre,
        numero,
        token,
        phone_id,
        pixel_id: pixel_id || null,
        capi_token: capi_token || null,
        activo: true
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect("/admin?tab=conexiones");

  } catch (error) {

    console.log(
      "ERROR GUARDANDO CONEXION:",
      error.response?.data || error.message
    );

    res.send("Error guardando conexión");

  }
});

router.post("/desconectar-whatsapp", protegerPanel, async (req, res) => {

  try {

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${req.session.usuario.id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/admin?tab=inicio");

  } catch (error) {

    console.log(
      "ERROR DESCONECTANDO:",
      error.response?.data || error.message
    );

    res.send("Error desconectando WhatsApp");
  }

});

router.get("/eliminar-chat", protegerPanel, async (req, res) => {
  try {
    const numero = req.query.numero;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/inbox");

  } catch (error) {
    console.log("ERROR ELIMINANDO CHAT:", error.response?.data || error.message);
    res.send("Error eliminando chat");
  }
});

router.get("/bloquear-chat", protegerPanel, async (req, res) => {
  try {
    const numero = req.query.numero;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      { estado: "bloqueado" },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: req.session.usuario.id,
        direccion: "sistema",
        tipo: "texto",
        contenido: "🚫 Chat bloqueado",
        imagen_url: null
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect("/inbox?numero=" + numero);

  } catch (error) {
    console.log("ERROR BLOQUEANDO CHAT:", error.response?.data || error.message);
    res.send("Error bloqueando chat");
  }
});

router.get("/desbloquear-chat", protegerPanel, async (req, res) => {
  try {
    const numero = req.query.numero;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      { estado: "nuevo" },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: req.session.usuario.id,
        direccion: "sistema",
        tipo: "texto",
        contenido: "✅ Chat desbloqueado",
        imagen_url: null
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.redirect("/inbox?numero=" + numero);

  } catch (error) {
    console.log("ERROR DESBLOQUEANDO CHAT:", error.response?.data || error.message);
    res.send("Error desbloqueando chat");
  }
});

router.get("/chat-etiqueta", protegerPanel, async (req, res) => {
  try {
    const numero = req.query.numero;

    const responseEtiquetas = await axios.get(
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${req.session.usuario.id}&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const etiquetas = responseEtiquetas.data || [];

    res.send(`
      <body style="background:#0b141a;color:white;font-family:Arial;padding:30px;">
        <h2>🏷️ Etiqueta para ${numero}</h2>

        <form method="POST" action="/guardar-etiqueta-chat">
          <input type="hidden" name="numero" value="${numero}">

          <select name="etiqueta" style="width:100%;padding:14px;border-radius:10px;margin:15px 0;">
            ${etiquetas.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join("")}
          </select>

          <button style="background:#25d366;color:white;border:none;padding:14px 20px;border-radius:10px;font-weight:bold;">
            Guardar etiqueta
          </button>
        </form>

        <form method="POST" action="/quitar-etiqueta-chat" style="margin-top:15px;">
          <input type="hidden" name="numero" value="${numero}">
          <button style="background:#ff4d4d;color:white;border:none;padding:14px 20px;border-radius:10px;font-weight:bold;">
            Quitar etiqueta
          </button>
        </form>

        <br>
        <a href="/inbox" style="color:#25d366;">← Volver</a>
        
      </body>
    `);

  } catch (error) {
    res.send("Error abriendo etiquetas");
  }
});

router.post("/guardar-etiqueta-chat", protegerPanel, async (req, res) => {
  try {
    const { numero, etiqueta } = req.body;

    await agregarEtiquetaCliente(numero, etiqueta, req.session.usuario.id);

    res.redirect("/inbox?numero=" + numero);

  } catch (error) {
    console.log("ERROR GUARDANDO ETIQUETA CHAT:", error.response?.data || error.message);
    res.send("Error guardando etiqueta");
  }
});

router.post("/quitar-etiqueta-chat", protegerPanel, async (req, res) => {
  try {
    const { numero } = req.body;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    res.redirect("/inbox?numero=" + numero);

  } catch (error) {
    console.log("ERROR QUITANDO ETIQUETA:", error.response?.data || error.message);
    res.send("Error quitando etiqueta");
  }
});

module.exports = router;