/**
 * API JSON — Carpetas premium de flujos (MacBot CRM).
 */
const express = require("express");
const router = express.Router();
const axios = require("axios");
const {
  CONEXION_TODAS,
  CARPETA_CATEGORIAS,
  CATEGORIA_UI,
  listCarpetasConConteos,
  crearCarpeta,
  actualizarCarpeta,
  eliminarCarpeta,
} = require("../services/flujosCarpetasService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function log(msg, extra) {
  if (extra !== undefined) console.log(`[flujosCarpetasApi] ${msg}`, extra);
  else console.log(`[flujosCarpetasApi] ${msg}`);
}

function protegerApi(req, res, next) {
  if (req.session?.usuario) return next();
  return res.status(401).json({ ok: false, error: "No autenticado" });
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function leerConexionScope(req) {
  const raw =
    req.body?.conexion_whatsapp_id ??
    req.body?.conexionWhatsappId ??
    req.query?.conexion_whatsapp_id;
  if (raw == null || String(raw).trim() === "") {
    return { todas: true, id: null };
  }
  const id = String(raw).trim();
  if (id === CONEXION_TODAS) return { todas: true, id: null };
  return { todas: false, id };
}

function requiereConexionEscribir(scope) {
  if (!scope?.id) {
    return {
      error:
        "Selecciona una línea WhatsApp (no «Todas las líneas») para gestionar carpetas",
    };
  }
  return null;
}

async function fetchFlujos(usuarioId, scope) {
  let url =
    `${SUPABASE_URL}/rest/v1/flujos_builder?select=id,conexion_whatsapp_id,data` +
    `&usuario_id=eq.${usuarioId}`;
  if (scope?.id) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
  }
  const res = await axios.get(url, { headers: supabaseHeaders() });
  return res.data || [];
}

// GET /api/flujos/carpetas
router.get("/api/flujos/carpetas", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);
  log(
    `GET carpetas usuario=${usuario.id} conexion=${scope.todas ? CONEXION_TODAS : scope.id}`
  );

  try {
    const flujos = await fetchFlujos(usuario.id, scope);
    const data = await listCarpetasConConteos(usuario.id, scope, flujos);

    res.json({
      ok: true,
      ...data,
      categorias_ui: CATEGORIA_UI,
      categorias: CARPETA_CATEGORIAS,
      conexion_whatsapp_id: scope.todas ? CONEXION_TODAS : scope.id,
    });
  } catch (error) {
    log("GET carpetas ERROR", error.response?.data || error.message);
    res.status(500).json({
      ok: false,
      error: "No se pudieron cargar las carpetas",
      carpetas: [],
      sin_carpeta: null,
      counts: { all: 0 },
    });
  }
});

// POST /api/flujos/carpetas
router.post("/api/flujos/carpetas", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);
  const bloqueo = requiereConexionEscribir(scope);
  if (bloqueo) return res.status(400).json({ ok: false, error: bloqueo.error });

  const { nombre, categoria } = req.body || {};
  log(`POST carpeta usuario=${usuario.id} linea=${scope.id}`);

  try {
    const result = await crearCarpeta(usuario.id, scope.id, { nombre, categoria });
    if (result.error) return res.status(400).json({ ok: false, error: result.error });
    res.status(201).json({ ok: true, carpeta: result.carpeta });
  } catch (error) {
    log("POST carpeta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo crear la carpeta" });
  }
});

// PATCH /api/flujos/carpetas/:id
router.patch("/api/flujos/carpetas/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);
  const bloqueo = requiereConexionEscribir(scope);
  if (bloqueo) return res.status(400).json({ ok: false, error: bloqueo.error });

  const { id } = req.params;
  log(`PATCH carpeta id=${id}`);

  try {
    const result = await actualizarCarpeta(usuario.id, id, req.body || {});
    if (result.error) {
      const status = result.error.includes("no encontrada") ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    res.json({ ok: true, carpeta: result.carpeta });
  } catch (error) {
    log("PATCH carpeta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo actualizar la carpeta" });
  }
});

// DELETE /api/flujos/carpetas/:id
router.delete("/api/flujos/carpetas/:id", protegerApi, async (req, res) => {
  const usuario = req.session.usuario;
  const scope = leerConexionScope(req);
  const bloqueo = requiereConexionEscribir(scope);
  if (bloqueo) return res.status(400).json({ ok: false, error: bloqueo.error });

  const { id } = req.params;
  log(`DELETE carpeta id=${id}`);

  try {
    const result = await eliminarCarpeta(usuario.id, id);
    if (result.error) {
      const status = result.error.includes("no encontrada") ? 404 : 400;
      return res.status(status).json({ ok: false, error: result.error });
    }
    res.json({ ok: true });
  } catch (error) {
    log("DELETE carpeta ERROR", error.response?.data || error.message);
    res.status(500).json({ ok: false, error: "No se pudo eliminar la carpeta" });
  }
});

module.exports = router;
