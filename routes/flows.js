const express = require("express");
const router = express.Router();

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

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
  registrarMensajeSalienteEnInbox,
  enviarMediaWhatsApp,
} = require("../services/whatsappService");
const {
  esArchivoImagen,
  prepararImagenParaWhatsApp,
} = require("../services/imageWhatsAppService");
const { optimizarImagenFlujoStorage } = require("../services/flowImageStorageService");
const { subirArchivoRm24hMedia } = require("../services/rm24hMediaStorage");

const MAX_IMAGEN_NODO_FLUJO = 2 * 1024 * 1024;
const seguimientoRoutes = require("./seguimiento");
const rt = require("../services/realtimeService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function wantsInboxJson(req) {
  return (
    req.get("X-Inbox-Api") === "1" ||
    (req.get("Accept") || "").includes("application/json")
  );
}

function finishInbox(req, res, numero) {
  if (wantsInboxJson(req)) {
    return res.json({ ok: true, numero: numero || null });
  }
  if (numero) return res.redirect("/inbox?numero=" + numero);
  return res.redirect("/inbox");
}

router.use(seguimientoRoutes);

/** RM24H — media a bucket rm24h-media (session, service role servidor) */
router.post(
  "/subir-rm24h-media",
  protegerPanel,
  upload.single("archivo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió archivo" });
      }

      const tipo = String(req.body?.tipo || "").toLowerCase();
      if (!["imagen", "video", "audio", "documento"].includes(tipo)) {
        return res.status(400).json({ error: "Tipo de media inválido" });
      }

      const resultado = await subirArchivoRm24hMedia(req.file, tipo);

      res.json(resultado);
    } catch (error) {
      const status = error.status || 500;
      console.error("[RM24H_UPLOAD] error:", error.message);
      res.status(status).json({
        error: error.message || "Error subiendo archivo RM24H",
      });
    }
  }
);

router.post("/subir-archivo", protegerPanel, upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }

    const esVideo = (req.file.mimetype || "").startsWith("video/");
    const maxBytes = esVideo ? 15 * 1024 * 1024 : 50 * 1024 * 1024;

    if (req.file.size > maxBytes) {
      return res.status(400).json({
        error: esVideo
          ? "El video debe ser menor a 15MB"
          : "Archivo demasiado grande",
      });
    }

    let bufferSubir = req.file.buffer;
    let mimeSubir = req.file.mimetype;
    let extension = req.file.originalname.split(".").pop();

    if (esArchivoImagen(req.file)) {
      try {
        const preparada = await prepararImagenParaWhatsApp(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        );
        bufferSubir = preparada.buffer;
        mimeSubir = preparada.mimetype;
        extension = preparada.extension;
      } catch (convErr) {
        return res.status(400).json({
          error: convErr.message || "No se pudo convertir la imagen",
        });
      }
    }

    const nombreArchivo =
      Date.now() + "-" + Math.random().toString(36).substring(2) + "." + extension;

    const rutaArchivo = `whatsapp/${req.session.usuario.id}/${nombreArchivo}`;

    await axios.post(
      `${SUPABASE_URL}/storage/v1/object/archivos/${rutaArchivo}`,
      bufferSubir,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": mimeSubir,
          "x-upsert": "true"
        }
      }
    );

    const urlPublica = `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaArchivo}`;

    res.json({
      ok: true,
      url: urlPublica,
      tipo: mimeSubir
    });

  } catch (error) {
    console.log("ERROR SUBIENDO ARCHIVO:", error.response?.data || error.message);
    res.status(500).json({ error: "Error subiendo archivo" });
  }
});

/** Solo nodo Contenido del builder — WEBP optimizado, máx 2MB entrada */
router.post(
  "/subir-imagen-nodo-flujo",
  protegerPanel,
  upload.single("archivo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió archivo" });
      }

      if (!esArchivoImagen(req.file)) {
        return res.status(400).json({ error: "El archivo no es una imagen" });
      }

      if (req.file.size > MAX_IMAGEN_NODO_FLUJO) {
        return res.status(400).json({
          error:
            "⚠️ La imagen supera el límite de 2MB. Usa una imagen más ligera.",
        });
      }

      let preparada;
      try {
        preparada = await optimizarImagenFlujoStorage(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        );
      } catch (convErr) {
        return res.status(400).json({
          error: convErr.message || "No se pudo optimizar la imagen",
        });
      }

      const nombreArchivo =
        Date.now() +
        "-" +
        Math.random().toString(36).substring(2) +
        "." +
        preparada.extension;

      const rutaArchivo = `whatsapp/${req.session.usuario.id}/${nombreArchivo}`;

      console.log("☁️ subiendo a supabase");

      await axios.post(
        `${SUPABASE_URL}/storage/v1/object/archivos/${rutaArchivo}`,
        preparada.buffer,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": preparada.mimetype,
            "x-upsert": "true",
          },
        }
      );

      const urlPublica = `${SUPABASE_URL}/storage/v1/object/public/archivos/${rutaArchivo}`;

      console.log("✅ upload completado");

      res.json({
        ok: true,
        url: urlPublica,
        tipo: preparada.mimetype,
        size: preparada.buffer.length,
      });
    } catch (error) {
      console.log(
        "ERROR SUBIENDO IMAGEN NODO FLUJO:",
        error.response?.data || error.message
      );
      res.status(500).json({ error: "Error subiendo imagen" });
    }
  }
);

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

    const { numero, respuesta, conexion_whatsapp_id } = req.body;
    const conexionWhatsappId = conexion_whatsapp_id
      ? String(conexion_whatsapp_id).trim()
      : null;

    if (!conexionWhatsappId) {
      if (wantsInboxJson(req)) {
        return res.status(400).json({
          ok: false,
          error: "Falta conexion_whatsapp_id",
        });
      }
      return res.send("❌ Falta la línea WhatsApp (conexion_whatsapp_id)");
    }

    // =========================
    // SOLO TEXTO
    // =========================

    if (!req.file) {

      if (!respuesta || !respuesta.trim()) {
        return finishInbox(req, res, numero);
      }

      const usuarioIdManual = String(req.session.usuario.id).trim();
      const meta = await enviarTextoWhatsApp(numero, respuesta, {
        usuarioId: usuarioIdManual,
        conexionWhatsappId,
        _soloEnvioMeta: true,
      });
      const wamid = meta?.messages?.[0]?.id || null;
      await registrarMensajeSalienteEnInbox({
        usuarioId: usuarioIdManual,
        numero,
        texto: respuesta,
        wamid,
        tipo: "text",
        conexionWhatsappId,
      });

      return finishInbox(req, res, numero);
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

    if (mime.startsWith("image/") || esArchivoImagen(req.file)) {

      if (sizeMB > 2) {
        return res.send("❌ Imagen máxima 2MB");
      }

      try {
        const preparada = await prepararImagenParaWhatsApp(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        );
        req.file.buffer = preparada.buffer;
        req.file.mimetype = preparada.mimetype;
        req.file.originalname =
          "imagen." + preparada.extension;
      } catch (convErr) {
        if (wantsInboxJson(req)) {
          return res.status(400).json({
            ok: false,
            error: convErr.message || "No se pudo convertir la imagen",
          });
        }
        return res.send(
          "❌ " + (convErr.message || "No se pudo convertir la imagen")
        );
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

        usuarioId: req.session.usuario.id,
        conexionWhatsappId,

      }

    );

    return finishInbox(req, res, numero);

  }

  catch (error) {

    console.log(
      "ERROR ARCHIVO:",
      error.response?.data || error.message
    );

    if (wantsInboxJson(req)) {
      return res.status(500).json({ ok: false, error: "Error enviando archivo" });
    }
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

      rt.flujoGuardado(req, req.session.usuario.id, {
        id,
        nombre,
        accion: "actualizado",
      });
      return res.send("✅ Flujo actualizado correctamente");
    }

    const createRes = await axios.post(
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
          Prefer: "return=representation"
        }
      }
    );

    const nuevoId = createRes.data?.[0]?.id;
    rt.flujoGuardado(req, req.session.usuario.id, {
      id: nuevoId,
      nombre,
      accion: "creado",
    });

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
      `${SUPABASE_URL}/rest/v1/etiquetas`,
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
          Prefer: "return=minimal"
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

await axios.delete(
  `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  }
);

await axios.delete(
  `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
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
  const body = req.body || {};
const numero = body.numero;
const etiqueta = body.etiqueta;

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  await axios.post(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
    {
      cliente_numero: numero,
      usuario_id: req.session.usuario.id,
      etiqueta: etiqueta
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

  return finishInbox(req, res, numero);

} catch (error) {
  console.log("ERROR GUARDANDO ETIQUETA CHAT:", error.response?.data || error.message);
  if (wantsInboxJson(req)) {
    return res.status(500).json({ ok: false });
  }
  return res.redirect("/inbox?numero=" + req.body.numero);
}
});

router.post("/quitar-etiqueta-chat", protegerPanel, async (req, res) => {
  try {
    const body = req.body || {};
const numero = body.numero;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    return finishInbox(req, res, numero);

  } catch (error) {
    console.log("ERROR QUITANDO ETIQUETA:", error.response?.data || error.message);
    if (wantsInboxJson(req)) {
      return res.status(500).json({ ok: false });
    }
    res.send("Error quitando etiqueta");
  }
});

module.exports = router;