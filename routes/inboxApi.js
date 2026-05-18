/**
 * API JSON para Bandeja React — mismos datos que /inbox (Supabase + sesión).
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  loadInboxData,
  loadChatMessages,
  marcarLeido,
  SUPABASE_URL,
  SUPABASE_KEY,
  supabaseHeaders,
} = require("../services/inboxService");
const rt = require("../services/realtimeService");

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

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

// GET /api/inbox?etiqueta=
router.get("/api/inbox", protegerApi, async (req, res) => {
  try {
    const etiquetaFiltro = req.query.etiqueta || "";
    const data = await loadInboxData(req.session.usuario.id, { etiquetaFiltro });
    res.json({
      ok: true,
      usuarioId: req.session.usuario.id,
      etiquetaFiltro: data.etiquetaFiltro,
      etiquetasUnicas: data.etiquetasUnicas,
      etiquetasDisponibles: data.etiquetasDisponibles,
      mapaColoresEtiquetas: data.mapaColoresEtiquetas,
      chats: data.chats,
      totalNoLeidos: data.totalNoLeidos,
    });
  } catch (error) {
    log("GET /api/inbox ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "Error cargando bandeja" });
  }
});

// GET /api/inbox/chat?numero=
router.get("/api/inbox/chat", protegerApi, async (req, res) => {
  try {
    const numero = req.query.numero;
    if (!numero) {
      return res.status(400).json({ ok: false, error: "Falta numero" });
    }
    const chat = await loadChatMessages(req.session.usuario.id, numero);
    res.json({ ok: true, numero, ...chat });
  } catch (error) {
    log("GET /api/inbox/chat ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/marcar-leido
router.post("/api/inbox/marcar-leido", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    if (!numero) return res.json({ ok: false });
    await marcarLeido(req.session.usuario.id, numero);
    res.json({ ok: true });
  } catch (error) {
    log("marcar-leido ERROR", error.response?.data || error.message);
    res.json({ ok: false });
  }
});

// POST /api/inbox/etiqueta
router.post("/api/inbox/etiqueta", protegerApi, async (req, res) => {
  try {
    const { numero, etiqueta } = req.body || {};
    if (!numero || !etiqueta) {
      return res.status(400).json({ ok: false, error: "Datos incompletos" });
    }
    const usuarioId = req.session.usuario.id;

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        etiqueta,
      },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );

    rt.etiquetaActualizada(req, usuarioId, { numero, etiqueta, accion: "asignada" });
    rt.clienteActualizado(req, usuarioId, { numero, etiquetas: [etiqueta] });
    res.json({ ok: true, numero, etiqueta });
  } catch (error) {
    log("etiqueta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/quitar-etiqueta
router.post("/api/inbox/quitar-etiqueta", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false });

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${req.session.usuario.id}`,
      { headers: supabaseHeaders() }
    );

    rt.etiquetaActualizada(req, req.session.usuario.id, {
      numero,
      accion: "quitada",
    });
    res.json({ ok: true, numero });
  } catch (error) {
    log("quitar-etiqueta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/bloquear
router.post("/api/inbox/bloquear", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false });
    const usuarioId = req.session.usuario.id;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
      { estado: "bloqueado" },
      { headers: supabaseHeaders({ "Content-Type": "application/json" }) }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        direccion: "sistema",
        tipo: "texto",
        contenido: "🚫 Chat bloqueado",
        imagen_url: null,
      },
      { headers: supabaseHeaders({ "Content-Type": "application/json" }) }
    );

    rt.chatBloqueado(req, usuarioId, { cliente_numero: numero, numero });
    res.json({ ok: true, bloqueado: true });
  } catch (error) {
    log("bloquear ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// POST /api/inbox/desbloquear
router.post("/api/inbox/desbloquear", protegerApi, async (req, res) => {
  try {
    const { numero } = req.body || {};
    if (!numero) return res.status(400).json({ ok: false });
    const usuarioId = req.session.usuario.id;

    await axios.patch(
      `${SUPABASE_URL}/rest/v1/clientes?numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
      { estado: "nuevo" },
      { headers: supabaseHeaders({ "Content-Type": "application/json" }) }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: usuarioId,
        direccion: "sistema",
        tipo: "texto",
        contenido: "✅ Chat desbloqueado",
        imagen_url: null,
      },
      { headers: supabaseHeaders({ "Content-Type": "application/json" }) }
    );

    rt.chatDesbloqueado(req, usuarioId, { cliente_numero: numero, numero });
    res.json({ ok: true, bloqueado: false });
  } catch (error) {
    log("desbloquear ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false });
  }
});

// DELETE /api/inbox/chat?numero=
router.delete("/api/inbox/chat", protegerApi, async (req, res) => {
  try {
    const numero = req.query.numero || req.body?.numero;
    if (!numero) return res.status(400).json({ ok: false });
    const usuarioId = req.session.usuario.id;
    const headers = supabaseHeaders();

    await axios.delete(
      `${SUPABASE_URL}/rest/v1/mensajes?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
      { headers }
    );
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
      { headers }
    );
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
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
