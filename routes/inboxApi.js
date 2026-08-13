/**
 * API JSON para Bandeja React — mismos datos que /inbox (Supabase + sesión).
 */
const express = require("express");
const multer = require("multer");
const router = express.Router();
const axios = require("axios");
const uploadInbox = multer({ storage: multer.memoryStorage() });
const { handleInboxResponder } = require("./flows");
const {
  loadInboxData,
  loadChatMessages,
  marcarLeido,
  loadConexionesInbox,
  filtroConexionQuery,
  SUPABASE_URL,
  SUPABASE_KEY,
  supabaseHeaders,
} = require("../services/inboxService");
const rt = require("../services/realtimeService");
const {
  pausarBotConversacion,
  reactivarBotConversacion,
} = require("../services/conversaciones/botPauseService");
const { protegerApi } = require("../middlewares/auth");

function log(msg, extra) {
  if (extra !== undefined) console.log(`[inboxApi] ${msg}`, extra);
  else console.log(`[inboxApi] ${msg}`);
}

// GET /api/inbox/session
router.get("/api/inbox/session", protegerApi, (req, res) => {
  const u = req.session.usuario;
  res.json({
    ok: true,
    usuarioId: u.id,
    email: u.email || null,
    nombre: u.nombre || null,
  });
});

// POST /api/inbox/responder — respuesta manual Bandeja (mismo handler que /inbox/responder)
router.post(
  "/api/inbox/responder",
  protegerApi,
  uploadInbox.single("archivo"),
  handleInboxResponder
);

// GET /api/inbox/conexiones
router.get("/api/inbox/conexiones", protegerApi, async (req, res) => {
  try {
    const conexiones = await loadConexionesInbox(req.session.usuario.id);
    res.json({ ok: true, conexiones });
  } catch (error) {
    const pg = error.response?.data;
    console.error("INBOX CONEXIONES ERROR:", {
      message: error?.message,
      details: error?.details ?? pg?.details,
      hint: error?.hint ?? pg?.hint,
      code: error?.code ?? pg?.code,
      stack: error?.stack,
    });
    log("GET /api/inbox/conexiones ERROR", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      error: "Error cargando líneas WhatsApp",
    });
  }
});

// GET /api/inbox?etiqueta=&conexion_whatsapp_id=&limit=&offset=
router.get("/api/inbox", protegerApi, async (req, res) => {
  try {
    const etiquetaFiltro = req.query.etiqueta || "";
    const conexionWhatsappId = req.query.conexion_whatsapp_id || null;
    const data = await loadInboxData(req.session.usuario.id, {
      etiquetaFiltro,
      conexionWhatsappId,
      limit: req.query.limit,
      offset: req.query.offset,
      includeMensajes: false,
    });
    res.json({
      ok: true,
      usuarioId: req.session.usuario.id,
      conexionWhatsappId: data.conexionWhatsappId,
      etiquetaFiltro: data.etiquetaFiltro,
      etiquetasUnicas: data.etiquetasUnicas,
      etiquetasDisponibles: data.etiquetasDisponibles,
      mapaColoresEtiquetas: data.mapaColoresEtiquetas,
      chats: data.chats,
      totalNoLeidos: data.totalNoLeidos,
      hasMore: data.hasMore,
      offset: data.offset,
      limit: data.limit,
      totalConversations: data.totalConversations,
    });
  } catch (error) {
    log("GET /api/inbox ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Error cargando bandeja" });
  }
});

// GET /api/inbox/chat?numero=&conexion_whatsapp_id=
router.get("/api/inbox/chat", protegerApi, async (req, res) => {
  try {
    const numero = req.query.numero;
    const conexionWhatsappId = req.query.conexion_whatsapp_id || null;
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Falta numero" });
    }
    if (!conexionWhatsappId) {
      return res.status(400).json({ ok: false, error: "Falta conexion_whatsapp_id" });
    }
    const chat = await loadChatMessages(
      req.session.usuario.id,
      numero,
      conexionWhatsappId
    );
    res.json({ ok: true, numero, conexionWhatsappId, ...chat });
  } catch (error) {
    log("GET /api/inbox/chat ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/bot-pause
router.post("/api/inbox/bot-pause", protegerApi, async (req, res) => {
  try {
    const {
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexionWhatsappId,
      action,
    } = req.body || {};

    if (!clienteNumero || !conexionWhatsappId) {
      return res.status(400).json({ ok: false, error: "Datos incompletos" });
    }

    const usuarioId = req.session.usuario.id;
    let result;

    if (action === "resume") {
      result = await reactivarBotConversacion({
        usuarioId,
        clienteNumero,
        conexionWhatsappId,
      });
    } else if (action === "pause") {
      result = await pausarBotConversacion({
        usuarioId,
        clienteNumero,
        conexionWhatsappId,
        hasta: null,
        motivo: "manual",
      });
    } else {
      return res.status(400).json({ ok: false, error: "action inválida" });
    }

    if (!result?.ok) {
      return res.status(400).json({ ok: false, error: result?.error || "Error" });
    }

    rt.conversacionActualizada(req, usuarioId, {
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexionWhatsappId,
      bot_pausado: result.bot_pausado,
      bot_pausado_hasta: result.bot_pausado_hasta,
      bot_pausado_motivo: result.bot_pausado_motivo,
    });

    res.json({
      ok: true,
      bot_pausado: result.bot_pausado,
      bot_pausado_hasta: result.bot_pausado_hasta,
      bot_pausado_motivo: result.bot_pausado_motivo,
    });
  } catch (error) {
    log("bot-pause ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Error actualizando flujo" });
  }
});

// POST /api/inbox/marcar-leido
router.post("/api/inbox/marcar-leido", protegerApi, async (req, res) => {
  try {
    const { numero, conexion_whatsapp_id: conexionWhatsappId } = req.body || {};
    if (!numero || !conexionWhatsappId) return res.json({ ok: false });
    await marcarLeido(req.session.usuario.id, numero, conexionWhatsappId);
    res.json({ ok: true });
  } catch (error) {
    log("marcar-leido ERROR", error.response?.data || error.message);
    res.json({ ok: false });
  }
});

// POST /api/inbox/etiqueta
router.post("/api/inbox/etiqueta", protegerApi, async (req, res) => {
  try {
    const {
      numero,
      etiqueta,
      conexion_whatsapp_id: conexionWhatsappId,
    } = req.body || {};
    if (!numero || !etiqueta || !conexionWhatsappId) {
      return res.status(400).json({ ok: false, error: "Datos incompletos" });
    }
    const usuarioId = req.session.usuario.id;
    const filtroConexion = filtroConexionQuery(conexionWhatsappId);

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
      { headers: supabaseHeaders() }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        etiqueta,
        conexion_whatsapp_id: conexionWhatsappId,
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    rt.etiquetaActualizada(req, usuarioId, {
      numero,
      etiqueta,
      conexion_whatsapp_id: conexionWhatsappId,
      accion: "asignada",
    });
    rt.clienteActualizado(req, usuarioId, { numero, etiquetas: [etiqueta] });
    res.json({ ok: true, numero, etiqueta, conexion_whatsapp_id: conexionWhatsappId });
  } catch (error) {
    log("etiqueta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/quitar-etiqueta
router.post("/api/inbox/quitar-etiqueta", protegerApi, async (req, res) => {
  try {
    const { numero, conexion_whatsapp_id: conexionWhatsappId } = req.body || {};
    if (!numero || !conexionWhatsappId) {
      return res.status(400).json({ ok: false, error: "Datos incompletos" });
    }
    const filtroConexion = filtroConexionQuery(conexionWhatsappId);

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${req.session.usuario.id}${filtroConexion}`,
      { headers: supabaseHeaders() }
    );

    rt.etiquetaActualizada(req, req.session.usuario.id, {
      numero,
      conexion_whatsapp_id: conexionWhatsappId,
      accion: "quitada",
    });
    res.json({ ok: true, numero, conexion_whatsapp_id: conexionWhatsappId });
  } catch (error) {
    log("quitar-etiqueta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// PATCH clientes.estado por usuario_id + numero; exige ≥1 fila afectada.
async function patchClienteEstadoBloqueo(usuarioId, numero, estado) {
  const numeroEnc = encodeURIComponent(String(numero).trim());
  const usuarioEnc = encodeURIComponent(usuarioId);
  const response = await axios.patch(
    `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numeroEnc}&usuario_id=eq.${usuarioEnc}`,
    { estado },
    {
      headers: supabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.length > 0;
}

async function insertMensajeSistemaBloqueo(usuarioId, numero, contenido) {
  try {
    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        direccion: "sistema",
        tipo: "texto",
        contenido,
        imagen_url: null,
      },
      { headers: supabaseHeaders({ "Content-Type": "application/json" }) }
    );
  } catch (error) {
    log("mensaje sistema bloqueo WARN", error.response?.data || error.message);
  }
}

// POST /api/inbox/bloquear
router.post("/api/inbox/bloquear", protegerApi, async (req, res) => {
  try {
    const numero = String(req.body?.numero || "").trim();
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Número requerido" });
    }
    const usuarioId = req.session.usuario.id;

    const updated = await patchClienteEstadoBloqueo(
      usuarioId,
      numero,
      "bloqueado"
    );
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: "No se encontró el contacto para bloquear",
      });
    }

    await insertMensajeSistemaBloqueo(usuarioId, numero, "🚫 Chat bloqueado");

    rt.chatBloqueado(req, usuarioId, { cliente_numero: numero, numero });
    res.json({ ok: true, bloqueado: true });
  } catch (error) {
    log("bloquear ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Error bloqueando contacto" });
  }
});

// POST /api/inbox/desbloquear
router.post("/api/inbox/desbloquear", protegerApi, async (req, res) => {
  try {
    const numero = String(req.body?.numero || "").trim();
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Número requerido" });
    }
    const usuarioId = req.session.usuario.id;

    const updated = await patchClienteEstadoBloqueo(usuarioId, numero, "nuevo");
    if (!updated) {
      return res.status(404).json({
        ok: false,
        error: "No se encontró el contacto para desbloquear",
      });
    }

    await insertMensajeSistemaBloqueo(
      usuarioId,
      numero,
      "✅ Chat desbloqueado"
    );

    rt.chatDesbloqueado(req, usuarioId, { cliente_numero: numero, numero });
    res.json({ ok: true, bloqueado: false });
  } catch (error) {
    log("desbloquear ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Error desbloqueando contacto" });
  }
});

// DELETE /api/inbox/chat?numero=
router.delete("/api/inbox/chat", protegerApi, async (req, res) => {
  try {
    const numero = req.query.numero || req.body?.numero;
    const conexionWhatsappId =
      req.query.conexion_whatsapp_id || req.body?.conexion_whatsapp_id;
    if (!numero) return res.status(400).json({ ok: false });
    if (!conexionWhatsappId) {
      return res.status(400).json({ ok: false, error: "Falta conexion_whatsapp_id" });
    }
    const usuarioId = req.session.usuario.id;
    const headers = supabaseHeaders();
    const filtroConexion = filtroConexionQuery(conexionWhatsappId);

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
      { headers }
    );
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
      { headers }
    );
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
      { headers }
    );
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
      { headers }
    );

    res.json({ ok: true });
  } catch (error) {
    log("eliminar ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
