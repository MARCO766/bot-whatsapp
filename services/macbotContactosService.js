/**
 * Ledger de bloques de contactos MacBot (Fase 2.1).
 *
 * Aislado: NO modifica max_contactos, clientes, campañas, webhook ni planLimits.
 * La acreditación manual solo inserta una fila pagada con origen=admin.
 */
const axios = require("axios");
const {
  BLOQUES_CONTACTOS,
  SKUS_BLOQUES,
  obtenerBloqueCatalogo,
  buildWhatsappCompraBloqueUrl,
} = require("../config/macbotSales");
const {
  esPlanMacbot,
  obtenerPlanUsuario,
  obtenerUsoUsuario,
  normalizarPlanUsuario,
} = require("./planesService");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const TABLE = "macbot_contactos_bloques";

const SELECT_BLOQUE =
  "id,usuario_id,sku,cantidad,precio_usd,estado,origen,proveedor_pago,referencia_pago,metadata,created_at,paid_at";

const ESTADOS_BLOQUE = new Set(["pendiente", "pagado", "anulado", "reembolsado"]);

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[macbotContactos] ${msg}`, extra);
  else console.log(`[macbotContactos] ${msg}`);
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function normalizarUsuarioId(id) {
  return String(id ?? "").trim();
}

function esElegibleBloquesContactos(plan) {
  return esPlanMacbot(plan);
}

function mapBloqueRow(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : "",
    usuario_id: row.usuario_id != null ? String(row.usuario_id) : "",
    sku: row.sku || "",
    cantidad: toInt(row.cantidad, 0),
    precio_usd: Number(row.precio_usd),
    estado: row.estado || "",
    origen: row.origen || "",
    proveedor_pago: row.proveedor_pago || null,
    referencia_pago: row.referencia_pago || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
    created_at: row.created_at || null,
    paid_at: row.paid_at || null,
  };
}

async function fetchUsuarioBasico(usuarioId) {
  const uid = normalizarUsuarioId(usuarioId);
  if (!uid || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(uid)}&select=id,plan,email,max_contactos`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

function schemaMissingResult(err, fallback) {
  if (isSchemaMissingError(err)) {
    logSchemaFallback(TABLE, err);
    return fallback;
  }
  return null;
}

/**
 * Historial de bloques del usuario (más reciente primero).
 * No elimina ni modifica filas.
 */
async function obtenerBloquesUsuario(usuarioId, { estado, throwIfMissing = false } = {}) {
  const uid = normalizarUsuarioId(usuarioId);
  if (!uid || !SUPABASE_URL || !SUPABASE_KEY) return [];

  let filter = `usuario_id=eq.${encodeURIComponent(uid)}`;
  if (estado && ESTADOS_BLOQUE.has(estado)) {
    filter += `&estado=eq.${encodeURIComponent(estado)}`;
  }

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${filter}&select=${SELECT_BLOQUE}&order=created_at.desc`,
      { headers: headers() }
    );
    return (res.data || []).map(mapBloqueRow);
  } catch (error) {
    if (isSchemaMissingError(error)) {
      if (throwIfMissing) throw error;
      logSchemaFallback(TABLE, error);
      return [];
    }
    log("obtenerBloquesUsuario:", error.response?.data || error.message);
    throw error;
  }
}

async function obtenerCapacidadPagada(usuarioId) {
  const bloques = await obtenerBloquesUsuario(usuarioId, { estado: "pagado" });
  return bloques.reduce((sum, b) => sum + toInt(b.cantidad, 0), 0);
}

/**
 * Capacidad comprada = suma de bloques pagados.
 * En Fase 2.1 NO reemplaza max_contactos ni el enforcement.
 */
async function obtenerCapacidadComprada(usuarioId) {
  return obtenerCapacidadPagada(usuarioId);
}

function opcionesCompraWhatsapp(email) {
  return SKUS_BLOQUES.map((sku) => {
    const cat = BLOQUES_CONTACTOS[sku];
    return {
      sku: cat.sku,
      cantidad: cat.cantidad,
      precio_usd: cat.precio_usd,
      label: cat.label,
      whatsapp_url: buildWhatsappCompraBloqueUrl(sku, email),
    };
  });
}

/**
 * Datos para Mi Plan. No cambia usados/max_contactos.
 * FREE y AGENCY no reciben opciones de compra.
 */
async function obtenerVistaCompraUsuario(usuarioId, { email } = {}) {
  const plan = await obtenerPlanUsuario(usuarioId);
  const puedeComprar = esElegibleBloquesContactos(plan.plan);
  let capacidadComprada = 0;
  try {
    capacidadComprada = await obtenerCapacidadComprada(usuarioId);
  } catch (error) {
    log("obtenerVistaCompraUsuario capacidad:", error.response?.data || error.message);
    capacidadComprada = 0;
  }

  return {
    puede_comprar: puedeComprar,
    capacidad_comprada: capacidadComprada,
    capacidad_pagada: capacidadComprada,
    opciones: puedeComprar ? opcionesCompraWhatsapp(email) : [],
  };
}

async function obtenerPanelAdminContactos(usuarioId) {
  const uid = normalizarUsuarioId(usuarioId);
  if (!uid) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const row = await fetchUsuarioBasico(uid);
  if (!row) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  const plan = normalizarPlanUsuario(row);
  const puedeAcreditar = esElegibleBloquesContactos(plan.plan);

  let bloques = [];
  let capacidadComprada = 0;
  let tablaDisponible = true;
  try {
    bloques = await obtenerBloquesUsuario(uid, { throwIfMissing: true });
    capacidadComprada = bloques
      .filter((b) => b.estado === "pagado")
      .reduce((sum, b) => sum + toInt(b.cantidad, 0), 0);
  } catch (error) {
    const fallback = schemaMissingResult(error, []);
    if (fallback) {
      bloques = [];
      tablaDisponible = false;
    } else {
      throw error;
    }
  }

  let contactosUsados = 0;
  try {
    const uso = await obtenerUsoUsuario(uid);
    contactosUsados = toInt(uso?.contactos_usados, 0);
  } catch (error) {
    log("obtenerPanelAdminContactos uso:", error.response?.data || error.message);
  }

  return {
    ok: true,
    usuario_id: String(row.id),
    email: row.email || "",
    plan: plan.plan,
    plan_almacenado: plan.plan_almacenado,
    puede_acreditar: puedeAcreditar,
    capacidad_comprada: capacidadComprada,
    contactos_usados: contactosUsados,
    max_contactos_actual: plan.max_contactos,
    tabla_disponible: tablaDisponible,
    bloques,
    catalogo: SKUS_BLOQUES.map((sku) => {
      const cat = BLOQUES_CONTACTOS[sku];
      return {
        sku: cat.sku,
        cantidad: cat.cantidad,
        precio_usd: cat.precio_usd,
        label: cat.label,
      };
    }),
  };
}

/**
 * Acreditación manual desde Admin.
 * Inserta fila pagada. NO toca max_contactos ni clientes.
 */
async function acreditarBloqueManual(usuarioId, opts = {}) {
  const uid = normalizarUsuarioId(usuarioId);
  if (!uid) {
    return { ok: false, status: 400, error: "id de usuario inválido" };
  }

  const catalogo = obtenerBloqueCatalogo(opts.sku || opts.cantidad);
  if (!catalogo) {
    return { ok: false, status: 400, error: "bloque inválido (usa blk_1000 o blk_2000)" };
  }

  const row = await fetchUsuarioBasico(uid);
  if (!row) {
    return { ok: false, status: 404, error: "Usuario no encontrado" };
  }

  const plan = normalizarPlanUsuario(row);
  if (!esElegibleBloquesContactos(plan.plan)) {
    const motivo =
      plan.plan === "agency"
        ? "Agency no usa bloques de contactos"
        : "Solo cuentas MACBOT pueden recibir bloques de contactos";
    return { ok: false, status: 403, error: motivo, plan: plan.plan };
  }

  const now = new Date().toISOString();
  const metadata = {
    ...(opts.metadata && typeof opts.metadata === "object" ? opts.metadata : {}),
    acreditado_por: opts.adminEmail || null,
    fase: "2.1",
    nota: "Acreditación manual. No modifica max_contactos.",
  };

  const payload = {
    usuario_id: uid,
    sku: catalogo.sku,
    cantidad: catalogo.cantidad,
    precio_usd: catalogo.precio_usd,
    estado: "pagado",
    origen: "admin",
    proveedor_pago: opts.proveedor_pago || null,
    referencia_pago: opts.referencia_pago || null,
    metadata,
    paid_at: now,
  };

  try {
    const res = await axios.post(`${SUPABASE_URL}/rest/v1/${TABLE}`, payload, {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=representation",
      }),
    });
    const inserted = Array.isArray(res.data) ? res.data[0] : res.data;
    const bloque = mapBloqueRow(inserted);
    const capacidadComprada = await obtenerCapacidadComprada(uid);

    log("acreditarBloqueManual", {
      usuario_id: uid,
      sku: catalogo.sku,
      cantidad: catalogo.cantidad,
      max_contactos_sin_cambio: true,
    });

    return {
      ok: true,
      bloque,
      capacidad_comprada: capacidadComprada,
      usuario: {
        id: String(row.id),
        email: row.email || "",
        plan: plan.plan,
      },
    };
  } catch (error) {
    if (isSchemaMissingError(error)) {
      logSchemaFallback(TABLE, error);
      return {
        ok: false,
        status: 503,
        error: "La tabla macbot_contactos_bloques aún no existe. Ejecuta la migración tras revisión.",
      };
    }
    log("acreditarBloqueManual error:", error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  BLOQUES_CONTACTOS,
  SKUS_BLOQUES,
  esElegibleBloquesContactos,
  obtenerBloquesUsuario,
  obtenerCapacidadComprada,
  obtenerCapacidadPagada,
  obtenerVistaCompraUsuario,
  obtenerPanelAdminContactos,
  acreditarBloqueManual,
};
