/**
 * Etiquetas CRM — catálogo por usuario + línea WhatsApp.
 * Conteo de leads sigue global (clientes_etiquetas sin scope hasta fase bandeja).
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const CONEXION_TODAS = "__todas__";

const SELECT_BASE = "id,nombre,color,creado_en,usuario_id";
const SELECT_EXTENDED = `${SELECT_BASE},conexion_whatsapp_id`;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[etiquetasService] ${msg}`, extra);
  else console.log(`[etiquetasService] ${msg}`);
}

function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function parseScope(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { todas: true, id: null };
  }
  const id = String(raw).trim();
  if (id === CONEXION_TODAS) return { todas: true, id: null };
  return { todas: false, id };
}

function resolveScope(scopeInput, body) {
  if (
    typeof scopeInput === "object" &&
    scopeInput !== null &&
    "todas" in scopeInput
  ) {
    return scopeInput;
  }
  return parseScope(
    scopeInput ??
      body?.conexion_whatsapp_id ??
      body?.conexionWhatsappId
  );
}

function requiereConexionEscribir(scope) {
  if (!scope?.id) {
    const err = new Error(
      "Selecciona una línea WhatsApp (no «Todas las líneas») para crear o editar etiquetas"
    );
    err.status = 400;
    throw err;
  }
}

function etiquetaConexionLabel(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

async function fetchConexionesMap(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id,nombre,numero,phone_id,activo&order=creado_en.asc`,
      { headers: headers() }
    );
    const map = {};
    (res.data || []).forEach((c) => {
      if (c?.id != null) {
        map[String(c.id)] = etiquetaConexionLabel(c);
      }
    });
    return map;
  } catch (error) {
    log("fetchConexionesMap:", error.response?.data || error.message);
    return {};
  }
}

async function fetchEtiquetasRaw(usuarioId, scope) {
  let url =
    `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
    `&select=${SELECT_EXTENDED}&order=creado_en.desc`;

  if (scope?.id) {
    url += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
  }

  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data || [];
  } catch (error) {
    log("select extended fallback", error.response?.data?.message || error.message);
    let fallbackUrl =
      `${SUPABASE_URL}/rest/v1/etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}` +
      `&select=${SELECT_BASE}&order=creado_en.desc`;
    if (scope?.id) {
      fallbackUrl += `&conexion_whatsapp_id=eq.${encodeURIComponent(scope.id)}`;
    }
    const res = await axios.get(fallbackUrl, { headers: headers() });
    return res.data || [];
  }
}

async function fetchAsignaciones(usuarioId) {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=etiqueta,cliente_numero`,
      { headers: headers() }
    );
    return res.data || [];
  } catch (error) {
    log("fetchAsignaciones:", error.response?.data || error.message);
    return [];
  }
}

function buildLeadCounts(asignaciones) {
  const counts = {};
  (asignaciones || []).forEach((row) => {
    const key = String(row.etiqueta || "").trim();
    if (!key) return;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function mapEtiquetaRow(row, counts, conexionLabels) {
  const connId = row.conexion_whatsapp_id ?? null;
  return {
    id: row.id,
    nombre: row.nombre,
    color: row.color || "#22c55e",
    creado_en: row.creado_en,
    conexion_whatsapp_id: connId,
    conexionWhatsappId: connId,
    conexion_nombre: connId
      ? conexionLabels[String(connId)] || "Línea"
      : "Sin línea",
    leadsCount: counts[row.nombre] || 0,
  };
}

async function obtenerEtiquetaUsuario(usuarioId, id) {
  let url =
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}` +
    `&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=${SELECT_EXTENDED}`;
  try {
    const res = await axios.get(url, { headers: headers() });
    return res.data?.[0] || null;
  } catch {
    url =
      `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}` +
      `&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=${SELECT_BASE}`;
    const res = await axios.get(url, { headers: headers() });
    return res.data?.[0] || null;
  }
}

async function assertEtiquetaEnScope(usuarioId, id, scope) {
  const row = await obtenerEtiquetaUsuario(usuarioId, id);
  if (!row) {
    const err = new Error("Etiqueta no encontrada");
    err.status = 404;
    throw err;
  }
  if (scope?.id) {
    if (!row.conexion_whatsapp_id || !sameConexionId(row.conexion_whatsapp_id, scope.id)) {
      const err = new Error("Etiqueta no pertenece a esta línea WhatsApp");
      err.status = 403;
      throw err;
    }
  }
  return row;
}

async function listEtiquetas(usuarioId, scopeInput) {
  const scope = typeof scopeInput === "object" && scopeInput !== null
    ? scopeInput
    : parseScope(scopeInput);

  const [rows, asignaciones, conexionLabels] = await Promise.all([
    fetchEtiquetasRaw(usuarioId, scope),
    fetchAsignaciones(usuarioId),
    fetchConexionesMap(usuarioId),
  ]);

  const counts = buildLeadCounts(asignaciones);
  const etiquetas = rows.map((e) => mapEtiquetaRow(e, counts, conexionLabels));

  return {
    ok: true,
    total: etiquetas.length,
    etiquetas,
    conexion_whatsapp_id: scope.todas ? CONEXION_TODAS : scope.id,
  };
}

async function createEtiqueta(usuarioId, body, scopeInput) {
  const scope = resolveScope(scopeInput, body);
  requiereConexionEscribir(scope);

  const nombre = String(body?.nombre || "").trim();
  if (!nombre) {
    const err = new Error("Nombre de etiqueta obligatorio");
    err.status = 400;
    throw err;
  }

  const res = await axios.post(
    `${SUPABASE_URL}/rest/v1/etiquetas`,
    {
      nombre,
      color: body?.color || "#22c55e",
      usuario_id: usuarioId,
      conexion_whatsapp_id: scope.id,
    },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    }
  );

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const conexionLabels = await fetchConexionesMap(usuarioId);
  return {
    ok: true,
    etiqueta: mapEtiquetaRow(row, {}, conexionLabels),
  };
}

async function updateEtiqueta(usuarioId, id, body, scopeInput) {
  const scope = resolveScope(scopeInput, body);
  requiereConexionEscribir(scope);

  const existing = await assertEtiquetaEnScope(usuarioId, id, scope);
  const patch = {};
  if (body.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body.color !== undefined) patch.color = String(body.color).trim();

  if (Object.keys(patch).length === 0) {
    const listed = await listEtiquetas(usuarioId, scope);
    const etiqueta = listed.etiquetas.find((e) => e.id === id);
    return { ok: true, etiqueta };
  }

  await axios.patch(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    patch,
    { headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }) }
  );

  if (patch.nombre && existing.nombre && patch.nombre !== existing.nombre) {
    try {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&etiqueta=eq.${encodeURIComponent(existing.nombre)}`,
        { etiqueta: patch.nombre },
        { headers: headers({ "Content-Type": "application/json" }) }
      );
    } catch (error) {
      log("rename clientes_etiquetas (opcional):", error.response?.data || error.message);
    }
  }

  const listed = await listEtiquetas(usuarioId, scope);
  const etiqueta = listed.etiquetas.find((e) => e.id === id);
  return { ok: true, etiqueta };
}

async function deleteEtiqueta(usuarioId, id, scopeInput) {
  const scope = resolveScope(scopeInput);
  requiereConexionEscribir(scope);

  const tag = await assertEtiquetaEnScope(usuarioId, id, scope);

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/etiquetas?id=eq.${encodeURIComponent(id)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`,
    { headers: headers() }
  );

  if (tag?.nombre && !tag.conexion_whatsapp_id) {
    try {
      await axios.delete(
        `${SUPABASE_URL}/rest/v1/clientes_etiquetas?usuario_id=eq.${encodeURIComponent(usuarioId)}&etiqueta=eq.${encodeURIComponent(tag.nombre)}`,
        { headers: headers() }
      );
    } catch (error) {
      log("delete clientes_etiquetas legacy (opcional):", error.response?.data || error.message);
    }
  }

  return { ok: true };
}

module.exports = {
  CONEXION_TODAS,
  parseScope,
  listEtiquetas,
  createEtiqueta,
  updateEtiqueta,
  deleteEtiqueta,
};
