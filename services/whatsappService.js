const axios = require("axios");
const rt = require("./realtimeService");
const { prepararImagenParaWhatsApp, mimeCompatibleWhatsApp } = require("./imageWhatsAppService");
const {
  sanitizarUnicodeRoto,
  logEmojiDebug,
} = require("./textoSeguro");
const {
  aplicarGuardsSeguimientoPreMeta,
  validarConexionInbox,
  logSegPostMetaFinal,
  esSeguimientoBlockedError,
} = require("./seguimiento/seguimientoGuards");

const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

/** UTF-8 válido para PostgREST: solo repara sustitutos rotos; conserva emojis. */
function sanitizarContenidoMensajeSupabase(contenido) {
  const raw = typeof contenido === "string" ? contenido : String(contenido ?? "");
  logEmojiDebug("antes guardar supabase (entrada)", raw);
  const out = sanitizarUnicodeRoto(raw);
  logEmojiDebug("antes guardar supabase (seguro)", out);
  return out;
}

function filtroConexionConversacion(conexionWhatsappId) {
  const conexion = normalizarConexionWhatsappIdOpciones(conexionWhatsappId);
  if (!conexion) {
    throw new Error(
      "filtroConexionConversacion requiere conexion_whatsapp_id (no actualizar conversación solo por cliente_numero)"
    );
  }
  return `&conexion_whatsapp_id=eq.${encodeURIComponent(conexion)}`;
}

async function actualizarConversacionSaliente(
  usuarioId,
  numero,
  texto,
  conexionWhatsappId = null
) {
  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return;

  const conexion = normalizarConexionWhatsappIdOpciones(conexionWhatsappId);
  if (!conexion) {
    console.warn(
      "[WhatsApp] actualizarConversacionSaliente omitido — sin conexion_whatsapp_id",
      { cliente_numero: numero, usuario_id: usuarioId }
    );
    return;
  }

  const ultimoMensaje = sanitizarContenidoMensajeSupabase(texto);
  const headers = supabaseHeaders({ "Content-Type": "application/json" });
  const ahora = new Date().toISOString();
  const filtroConexion = filtroConexionConversacion(conexion);

  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}&select=*`,
      { headers }
    );
    const conv = res.data?.[0];

    if (conv) {
      await axios.patch(
        `${SUPABASE_URL}/rest/v1/conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
        {
          ultimo_mensaje: ultimoMensaje,
          ultimo_mensaje_en: ahora,
          estado: "abierta",
        },
        { headers }
      );
      return;
    }

    const nueva = {
      cliente_numero: numero,
      usuario_id: usuarioId,
      ultimo_mensaje: ultimoMensaje,
      ultimo_mensaje_en: ahora,
      estado: "abierta",
      unread_count: 0,
      conexion_whatsapp_id: conexion,
    };

    await axios.post(
      `${SUPABASE_URL}/rest/v1/conversaciones`,
      nueva,
      { headers }
    );
  } catch (err) {
    console.log("[WhatsApp] conversacion saliente (SUPABASE):", {
      code: err.response?.data?.code,
      message: err.response?.data?.message || err.message,
      details: err.response?.data,
      url: err.config?.url,
      bodyEnviado: err.config?.data,
    });
  }
}

/**
 * Inferir línea solo si el lead tiene UNA conexión en historial.
 * Con varias líneas (A+B) devuelve null — obliga conexion explícita (webhook/flujo).
 */
async function obtenerConexionWhatsappIdDeChat(usuarioId, numero, conexionPreferida = null) {
  const preferida = normalizarConexionWhatsappIdOpciones(conexionPreferida);
  if (preferida) return preferida;

  if (!usuarioId || !numero || !SUPABASE_URL || !SUPABASE_KEY) return null;

  const headers = supabaseHeaders();
  const uid = encodeURIComponent(String(usuarioId).trim());
  const num = encodeURIComponent(String(numero).trim());

  const conexiones = new Set();

  try {
    const msgRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/mensajes?usuario_id=eq.${uid}&cliente_numero=eq.${num}&conexion_whatsapp_id=not.is.null&select=conexion_whatsapp_id&order=creado_en.desc&limit=15`,
      { headers }
    );
    for (const row of msgRes.data || []) {
      const id = normalizarConexionWhatsappIdOpciones(row?.conexion_whatsapp_id);
      if (id) conexiones.add(id);
    }
  } catch (err) {
    console.log("[WhatsApp] conexion desde mensajes:", err.response?.data?.message || err.message);
  }

  try {
    const convRes = await axios.get(
      `${SUPABASE_URL}/rest/v1/conversaciones?usuario_id=eq.${uid}&cliente_numero=eq.${num}&conexion_whatsapp_id=not.is.null&select=conexion_whatsapp_id&order=ultimo_mensaje_en.desc&limit=15`,
      { headers }
    );
    for (const row of convRes.data || []) {
      const id = normalizarConexionWhatsappIdOpciones(row?.conexion_whatsapp_id);
      if (id) conexiones.add(id);
    }
  } catch (err) {
    console.log("[WhatsApp] conexion desde conversaciones:", err.response?.data?.message || err.message);
  }

  if (conexiones.size === 1) {
    return [...conexiones][0];
  }

  if (conexiones.size > 1) {
    console.warn(
      "[WhatsApp] lead con varias líneas — no inferir conexion por último chat",
      { cliente_numero: numero, usuario_id: usuarioId, lineas: [...conexiones] }
    );
  }

  return null;
}

function esOrigenSeguimiento(opciones) {
  return opciones?.origen === "seguimiento";
}

function normalizarConexionWhatsappIdOpciones(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

function esInboxSeguimientoV2(opciones) {
  return (
    opciones?.origen === "seguimiento_v2" ||
    (opciones?.seguimientoV2Id != null && String(opciones.seguimientoV2Id).trim() !== "")
  );
}

function esInboxSeguimiento(opciones) {
  return (
    opciones?.origen === "seguimiento" ||
    (opciones?.seguimientoId != null && String(opciones.seguimientoId).trim() !== "")
  );
}

function esInboxSeguimientoCualquiera(opciones) {
  return esInboxSeguimiento(opciones) || esInboxSeguimientoV2(opciones);
}

function esInsertMensajeSeguimientoV2({ origen, seguimientoV2Id, insertPayload } = {}) {
  if (origen === "seguimiento_v2") return true;
  if (seguimientoV2Id != null && String(seguimientoV2Id).trim() !== "") return true;
  if (
    insertPayload?.seguimiento_v2_id != null &&
    String(insertPayload.seguimiento_v2_id).trim() !== ""
  ) {
    return true;
  }
  return false;
}

function esInsertMensajeSeguimiento({ origen, seguimientoId, insertPayload } = {}) {
  if (origen === "seguimiento") return true;
  if (seguimientoId != null && String(seguimientoId).trim() !== "") return true;
  if (
    insertPayload?.seguimiento_id != null &&
    String(insertPayload.seguimiento_id).trim() !== ""
  ) {
    return true;
  }
  return false;
}

/**
 * Seguimiento CRM: sin fallback de línea. Devuelve { ok: false } para no insertar en mensajes.
 */
function validarGuardInsertMensajeSeguimientoV2({
  origen = null,
  seguimientoV2Id = null,
  conexionWhatsappId = null,
  insertPayload = null,
  cliente_numero = null,
  usuario_id = null,
} = {}) {
  if (!esInsertMensajeSeguimientoV2({ origen, seguimientoV2Id, insertPayload })) {
    return { ok: true };
  }

  const conn = normalizarConexionWhatsappIdOpciones(
    conexionWhatsappId || insertPayload?.conexion_whatsapp_id
  );
  if (!conn) {
    console.error("[SEG_V2_GUARD_MENSAJE] bloqueo insert sin conexion_whatsapp_id", {
      seguimiento_v2_id: seguimientoV2Id ?? insertPayload?.seguimiento_v2_id ?? null,
      cliente_numero,
      usuario_id,
      origen,
    });
    return { ok: false, motivo: "sin_conexion_whatsapp_id" };
  }

  const segId =
    (seguimientoV2Id != null && String(seguimientoV2Id).trim() !== ""
      ? String(seguimientoV2Id).trim()
      : null) ||
    (insertPayload?.seguimiento_v2_id != null &&
    String(insertPayload.seguimiento_v2_id).trim() !== ""
      ? String(insertPayload.seguimiento_v2_id).trim()
      : null);

  if (!segId) {
    console.error("[SEG_V2_GUARD_MENSAJE] bloqueo insert sin seguimiento_v2_id", {
      cliente_numero,
      usuario_id,
      conexion_whatsapp_id: conn,
      origen,
    });
    return { ok: false, motivo: "sin_seguimiento_v2_id" };
  }

  return {
    ok: true,
    conexionWhatsappId: conn,
    seguimientoV2Id: segId,
  };
}

function validarGuardInsertMensajeSeguimiento({
  origen = null,
  seguimientoId = null,
  seguimientoV2Id = null,
  conexionWhatsappId = null,
  insertPayload = null,
  cliente_numero = null,
  usuario_id = null,
} = {}) {
  const guardV2 = validarGuardInsertMensajeSeguimientoV2({
    origen,
    seguimientoV2Id,
    conexionWhatsappId,
    insertPayload,
    cliente_numero,
    usuario_id,
  });
  if (!guardV2.ok) return guardV2;
  if (esInsertMensajeSeguimientoV2({ origen, seguimientoV2Id, insertPayload })) {
    return guardV2;
  }

  if (!esInsertMensajeSeguimiento({ origen, seguimientoId, insertPayload })) {
    return { ok: true };
  }

  const conn = normalizarConexionWhatsappIdOpciones(
    conexionWhatsappId || insertPayload?.conexion_whatsapp_id
  );
  if (!conn) {
    console.error(
      "[SEGUIMIENTO_GUARD_MENSAJE] bloqueo insert sin conexion_whatsapp_id",
      {
        seguimiento_id: seguimientoId ?? insertPayload?.seguimiento_id ?? null,
        cliente_numero,
        usuario_id,
        origen,
      }
    );
    return { ok: false, motivo: "sin_conexion_whatsapp_id" };
  }

  const segId =
    (seguimientoId != null && String(seguimientoId).trim() !== ""
      ? String(seguimientoId).trim()
      : null) ||
    (insertPayload?.seguimiento_id != null &&
    String(insertPayload.seguimiento_id).trim() !== ""
      ? String(insertPayload.seguimiento_id).trim()
      : null);

  if (!segId) {
    console.error("[SEGUIMIENTO_GUARD_MENSAJE] bloqueo insert sin seguimiento_id", {
      cliente_numero,
      usuario_id,
      conexion_whatsapp_id: conn,
      origen,
    });
    return { ok: false, motivo: "sin_seguimiento_id" };
  }

  return {
    ok: true,
    conexionWhatsappId: conn,
    seguimientoId: segId,
  };
}

function resolverParamsInboxSaliente(opcionesEnvio, resolvedConexionWhatsappId) {
  const esV2 = esInboxSeguimientoV2(opcionesEnvio);
  const esSeg = esInboxSeguimiento(opcionesEnvio);
  const conexion = normalizarConexionWhatsappIdOpciones(
    resolvedConexionWhatsappId || opcionesEnvio?.conexionWhatsappId
  );
  if ((esSeg || esV2) && !conexion) {
    throw new Error(
      "Seguimiento: conexionParaInbox NULL — no registrar mensaje saliente"
    );
  }
  return {
    origen: esV2 ? "seguimiento_v2" : esSeg ? "seguimiento" : opcionesEnvio?.origen || null,
    conexionWhatsappId: conexion,
    seguimientoId: opcionesEnvio?.seguimientoId ?? null,
    seguimientoV2Id: opcionesEnvio?.seguimientoV2Id ?? null,
  };
}

function assertOpcionesSeguimiento(opciones) {
  const seguimientoId =
    opciones?.seguimientoId != null ? String(opciones.seguimientoId).trim() : "";
  if (!seguimientoId) {
    throw new Error("Seguimiento requiere seguimiento_id");
  }

  const conexionId = normalizarConexionWhatsappIdOpciones(opciones.conexionWhatsappId);
  if (!conexionId) {
    throw new Error(
      "Seguimiento requiere conexion_whatsapp_id (no se puede enviar ni guardar sin línea)"
    );
  }
  if (!opciones.usuarioId) {
    throw new Error("Seguimiento requiere usuario_id");
  }

  opciones.origen = "seguimiento";
  opciones.seguimientoId = seguimientoId;
  opciones.conexionWhatsappId = conexionId;
  opciones.strictConexionWhatsappId = true;
  return opciones;
}

function assertOpcionesSeguimientoV2(opciones) {
  const seguimientoV2Id =
    opciones?.seguimientoV2Id != null ? String(opciones.seguimientoV2Id).trim() : "";
  if (!seguimientoV2Id) {
    throw new Error("Seguimiento V2 requiere seguimiento_v2_id");
  }

  const conexionId = normalizarConexionWhatsappIdOpciones(opciones.conexionWhatsappId);
  if (!conexionId) {
    throw new Error(
      "Seguimiento V2 requiere conexion_whatsapp_id (no se puede enviar ni guardar sin línea)"
    );
  }
  if (!opciones.usuarioId) {
    throw new Error("Seguimiento V2 requiere usuario_id");
  }

  opciones.origen = "seguimiento_v2";
  opciones.seguimientoV2Id = seguimientoV2Id;
  opciones.conexionWhatsappId = conexionId;
  opciones.strictConexionWhatsappId = true;
  return opciones;
}

function chatListKeySaliente(numero, conexionWhatsappId) {
  const n = String(numero || "").trim();
  const c = normalizarConexionWhatsappIdOpciones(conexionWhatsappId);
  if (!n || !c) return null;
  return `${n}::${c}`;
}

async function completarOpcionesEnvio(opciones = {}, numero) {
  if (esInboxSeguimientoV2(opciones)) {
    opciones.origen = "seguimiento_v2";
    return assertOpcionesSeguimientoV2(opciones);
  }

  if (esInboxSeguimiento(opciones)) {
    opciones.origen = "seguimiento";
    return assertOpcionesSeguimiento(opciones);
  }

  if (opciones.strictConexionWhatsappId) return opciones;
  if (opciones.conexionWhatsappId) return opciones;
  if (!opciones.usuarioId || !numero) return opciones;

  const conexionWhatsappId = await obtenerConexionWhatsappIdDeChat(
    opciones.usuarioId,
    numero,
    opciones.conexionWhatsappId
  );
  if (!conexionWhatsappId) return opciones;

  return { ...opciones, conexionWhatsappId };
}

async function resolverConexionWhatsappPorId(usuarioId, conexionWhatsappId, { soloSeguimientoStrict = false } = {}) {
  const select = soloSeguimientoStrict
    ? "id,token,phone_id,activo,nombre"
    : "*";
  const responseConexion = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?id=eq.${encodeURIComponent(conexionWhatsappId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}&select=${select}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return responseConexion.data?.[0] || null;
}

function logResolverCredenciales(opciones, conexion, phoneIdEnviar) {
  console.log("[RESOLVER CREDENCIALES]", {
    origin: opciones.origen || null,
    strictConexionWhatsappId: Boolean(opciones.strictConexionWhatsappId),
    conexionWhatsappId_solicitada: opciones.conexionWhatsappId || null,
    conexion_encontrada_id: conexion?.id || null,
    conexion_encontrada_nombre: conexion?.nombre || null,
    conexion_encontrada_activo: conexion?.activo ?? null,
    phone_id_usado: phoneIdEnviar || null,
  });
}

function logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar) {
  const to = String(numero || "").trim();
  console.log(
    `[META SEND FINAL] seguimiento_id=${opcionesEnvio?.seguimientoId ?? null} origin=${opcionesEnvio?.origen ?? null} conexion_whatsapp_id=${opcionesEnvio?.conexionWhatsappId ?? null} phone_number_id=${phoneIdEnviar ?? null} to=${to} url_phone=${phoneIdEnviar ?? null}`
  );
}

/** Seguimiento / strict: nunca activo=true ni TOKEN/PHONE_ID globales. */
function debeResolverSoloConexionExplicita(opciones) {
  return (
    esInboxSeguimientoCualquiera(opciones) || opciones.strictConexionWhatsappId === true
  );
}

async function resolverSoloConexionExplicita(opciones) {
  if (esInboxSeguimientoV2(opciones)) {
    assertOpcionesSeguimientoV2(opciones);
  } else if (esInboxSeguimiento(opciones)) {
    assertOpcionesSeguimiento(opciones);
  } else if (!opciones.conexionWhatsappId || !opciones.usuarioId) {
    throw new Error(
      "Modo estricto requiere conexion_whatsapp_id y usuario_id (sin fallback activo)"
    );
  }

  const conexionSolicitada = normalizarConexionWhatsappIdOpciones(
    opciones.conexionWhatsappId
  );
  const conexion = await resolverConexionWhatsappPorId(
    opciones.usuarioId,
    conexionSolicitada,
    { soloSeguimientoStrict: true }
  );

  if (!conexion?.token || !conexion?.phone_id) {
    throw new Error(
      `Conexión WhatsApp no encontrada para id=${conexionSolicitada} (sin fallback activo=true)`
    );
  }

  const idResuelto = normalizarConexionWhatsappIdOpciones(
    conexion.id || conexionSolicitada
  );
  if (idResuelto !== conexionSolicitada) {
    throw new Error(
      `Conexión resuelta (${idResuelto}) no coincide con conexion_whatsapp_id solicitada (${conexionSolicitada})`
    );
  }

  console.log("[STRICT CONEXION RESUELTA]", {
    origen: opciones.origen || null,
    conexion_whatsapp_id: idResuelto,
    activo: conexion.activo,
    phone_id: conexion.phone_id,
    nombre: conexion.nombre || null,
  });

  logResolverCredenciales(opciones, conexion, conexion.phone_id);

  return {
    tokenEnviar: conexion.token,
    phoneIdEnviar: conexion.phone_id,
    resolvedConexionWhatsappId: idResuelto,
    nombreConexionResuelta: conexion.nombre || null,
  };
}

function logSegSendTrace(opcionesEnvio, numero, creds) {
  if (
    !debeResolverSoloConexionExplicita(opcionesEnvio) &&
    opcionesEnvio?.origen !== "seguimiento" &&
    opcionesEnvio?.origen !== "seguimiento_v2"
  ) {
    return;
  }

  const globalPhone = PHONE_ID || null;
  const phoneResuelto = creds?.phoneIdEnviar ?? null;
  const conexionFila =
    opcionesEnvio?.conexionWhatsappIdFila ?? opcionesEnvio?.conexionWhatsappId ?? null;

  console.log("[SEG_SEND_TRACE]", {
    seguimiento_id: opcionesEnvio?.seguimientoId ?? null,
    cliente_numero: String(numero || "").trim() || null,
    conexion_whatsapp_id_fila: conexionFila,
    "opciones.conexion_whatsapp_id": opcionesEnvio?.conexionWhatsappId ?? null,
    strictConexionWhatsappId: opcionesEnvio?.strictConexionWhatsappId === true,
    phone_number_id_resuelto: phoneResuelto,
    nombre_conexion_resuelta: creds?.nombreConexionResuelta ?? null,
    conexion_id_resuelto: creds?.resolvedConexionWhatsappId ?? null,
    usa_phone_id_env_global: Boolean(
      globalPhone && phoneResuelto && String(phoneResuelto) === String(globalPhone)
    ),
    origen: opcionesEnvio?.origen ?? null,
    modo_resolver: debeResolverSoloConexionExplicita(opcionesEnvio)
      ? "solo_conexion_explicita"
      : "legacy",
  });
}

async function resolverCredencialesEnvio(opciones = {}) {
  if (debeResolverSoloConexionExplicita(opciones)) {
    return resolverSoloConexionExplicita(opciones);
  }

  let tokenEnviar = TOKEN;
  let phoneIdEnviar = PHONE_ID;
  let conexionUsada = null;

  if (opciones.conexionWhatsappId && opciones.usuarioId) {
    const conexion = await resolverConexionWhatsappPorId(
      opciones.usuarioId,
      opciones.conexionWhatsappId
    );
    if (conexion) {
      conexionUsada = conexion;
      tokenEnviar = conexion.token;
      phoneIdEnviar = conexion.phone_id;
      logResolverCredenciales(opciones, conexionUsada, phoneIdEnviar);
      return {
        tokenEnviar,
        phoneIdEnviar,
        resolvedConexionWhatsappId: conexion.id || opciones.conexionWhatsappId,
        nombreConexionResuelta: conexion.nombre || null,
      };
    }
    throw new Error(
      `conexion_whatsapp_id=${opciones.conexionWhatsappId} no encontrada (sin fallback activo)`
    );
  }

  if (opciones.usuarioId) {
    const responseConexion = await axios.get(
      `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const conexion = responseConexion.data?.[0];
    if (conexion) {
      conexionUsada = conexion;
      tokenEnviar = conexion.token;
      phoneIdEnviar = conexion.phone_id;
    }
  }

  logResolverCredenciales(opciones, conexionUsada, phoneIdEnviar);
  return { tokenEnviar, phoneIdEnviar };
}

function logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar) {
  if (opcionesEnvio?.origen !== "seguimiento") return;
  const to = String(numero || "").trim();
  console.log(
    `[SEGUIMIENTO ENVIO] seguimiento_id=${opcionesEnvio.seguimientoId ?? null} conexion_whatsapp_id=${opcionesEnvio.conexionWhatsappId ?? null} phone_number_id=${phoneIdEnviar ?? null} to=${to} url_phone=${phoneIdEnviar ?? null}`
  );
}

/**
 * Mismo guardado + socket que bandeja manual (POST /inbox/responder texto).
 */
function normalizarBodyMensajeSupabase({
  usuarioId,
  numero,
  texto,
  wamid,
  tipo,
  imagen_url = null,
  conexionWhatsappId = null,
}) {
  const tipoDb = tipo === "text" ? "texto" : tipo || "texto";
  let contenido = texto;
  if (contenido != null && typeof contenido !== "string") {
    try {
      contenido = JSON.stringify(contenido);
    } catch {
      contenido = String(contenido);
    }
  }
  const contenidoSeguro = sanitizarContenidoMensajeSupabase(String(contenido ?? ""));

  const body = {
    cliente_numero: String(numero || "").trim(),
    usuario_id:
      usuarioId != null && usuarioId !== "" ? String(usuarioId).trim() : null,
    direccion: "saliente",
    tipo: tipoDb,
    contenido: contenidoSeguro,
    imagen_url: imagen_url ?? null,
    whatsapp_message_id: wamid != null && wamid !== "" ? String(wamid) : null,
    estado_envio: "sent",
  };
  if (conexionWhatsappId) {
    body.conexion_whatsapp_id = String(conexionWhatsappId).trim();
  }
  return body;
}

async function registrarMensajeSalienteEnInbox({
  usuarioId,
  numero,
  texto,
  wamid,
  tipo = "texto",
  conexionWhatsappId = null,
  origen = null,
  seguimientoId = null,
  seguimientoV2Id = null,
  opcionesSeguimiento = null,
}) {
  if (opcionesSeguimiento && esInboxSeguimiento(opcionesSeguimiento)) {
    validarConexionInbox(opcionesSeguimiento, conexionWhatsappId);
  }

  const guardPrevio = validarGuardInsertMensajeSeguimiento({
    origen,
    seguimientoId,
    seguimientoV2Id,
    conexionWhatsappId,
    cliente_numero: numero,
    usuario_id: usuarioId,
  });
  if (!guardPrevio.ok) {
    return null;
  }
  if (guardPrevio.conexionWhatsappId) {
    conexionWhatsappId = guardPrevio.conexionWhatsappId;
  }
  if (guardPrevio.seguimientoV2Id) {
    seguimientoV2Id = guardPrevio.seguimientoV2Id;
    origen = "seguimiento_v2";
  } else if (guardPrevio.seguimientoId) {
    seguimientoId = guardPrevio.seguimientoId;
    origen = "seguimiento";
  }

  const insertPayload = normalizarBodyMensajeSupabase({
    usuarioId,
    numero,
    texto,
    wamid,
    tipo,
    conexionWhatsappId,
  });

  if (origen === "seguimiento_v2") {
    insertPayload.conexion_whatsapp_id = guardPrevio.conexionWhatsappId;
    insertPayload.seguimiento_v2_id = guardPrevio.seguimientoV2Id;
  } else if (origen === "seguimiento") {
    insertPayload.conexion_whatsapp_id = guardPrevio.conexionWhatsappId;
    insertPayload.seguimiento_id = guardPrevio.seguimientoId;
  }

  const guardPayload = validarGuardInsertMensajeSeguimiento({
    origen,
    seguimientoId,
    seguimientoV2Id,
    conexionWhatsappId,
    insertPayload,
    cliente_numero: numero,
    usuario_id: usuarioId,
  });
  if (!guardPayload.ok) {
    return null;
  }

  console.log("[SEGUIMIENTO_INSERT_TRACE]", {
    texto,
    origen,
    seguimientoId,
    conexionWhatsappId,
    insertPayloadConexion: insertPayload.conexion_whatsapp_id ?? null,
  });

  let bodyJson = "";
  try {
    bodyJson = JSON.stringify(insertPayload);
  } catch (serialErr) {
    console.log("[SEND DEBUG] payload supabase NO serializable:", insertPayload);
    console.log("[SEND DEBUG] error JSON:", serialErr.message);
    throw serialErr;
  }

  console.log("[SEND DEBUG] payload supabase:", insertPayload);
  console.log("[SEND DEBUG] body JSON length:", bodyJson.length);

  const insertRes = await axios.post(
    `${SUPABASE_URL}/rest/v1/mensajes`,
    insertPayload,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    }
  );

  const row = insertRes.data?.[0];
  if (!usuarioId) return row;

  await actualizarConversacionSaliente(
    usuarioId,
    numero,
    insertPayload.contenido,
    conexionWhatsappId
  );

  const conexionSocket = insertPayload.conexion_whatsapp_id || conexionWhatsappId || null;
  const payloadMensaje = {
    id: row?.id,
    cliente_numero: numero,
    usuario_id: usuarioId,
    direccion: "saliente",
    tipo: insertPayload.tipo,
    contenido: insertPayload.contenido,
    imagen_url: insertPayload.imagen_url,
    whatsapp_message_id: wamid || null,
    estado_envio: "sent",
    conexion_whatsapp_id: conexionSocket,
    chatKey: chatListKeySaliente(numero, conexionSocket),
    creado_en: row?.creado_en || new Date().toISOString(),
  };

  rt.nuevoMensaje(null, usuarioId, payloadMensaje);
  rt.conversacionActualizada(null, usuarioId, {
    cliente_numero: numero,
    conexion_whatsapp_id: conexionSocket,
    ultimo_mensaje: insertPayload.contenido,
    ultimo_mensaje_en: payloadMensaje.creado_en,
    direccion: "saliente",
  });

  return row;
}

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  const opcionesEnvio = await completarOpcionesEnvio(opciones, numero);

  const textoEnvio =
    texto != null && typeof texto !== "string" ? String(texto) : String(texto ?? "");
  const payloadWhatsapp = {
    messaging_product: "whatsapp",
    to: numero,
    text: { body: textoEnvio },
  };

  try {
    const credenciales = await resolverCredencialesEnvio(opcionesEnvio);
    const {
      tokenEnviar,
      phoneIdEnviar,
      resolvedConexionWhatsappId,
      nombreConexionResuelta,
    } = credenciales;
    const inbox = resolverParamsInboxSaliente(opcionesEnvio, resolvedConexionWhatsappId);
    await aplicarGuardsSeguimientoPreMeta(opcionesEnvio, credenciales);
    logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar);
    logSegSendTrace(opcionesEnvio, numero, credenciales);

    logEmojiDebug("antes enviar whatsapp", textoEnvio);
    console.log("[SEND DEBUG] payload whatsapp:", payloadWhatsapp);
    logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar);

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payloadWhatsapp,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    const meta = respuestaMeta.data;
    logSegPostMetaFinal(opcionesEnvio, credenciales, meta?.messages?.[0]?.id ?? null);

    if (opciones._soloEnvioMeta) {
      return meta;
    }

    const wamid = meta?.messages?.[0]?.id || null;
    const usuarioId = opcionesEnvio.usuarioId ?? null;

    console.log("[SEGUIMIENTO_INBOX_TRACE]", {
      texto: textoEnvio,
      origen: inbox.origen,
      seguimientoId: inbox.seguimientoId,
      opcionesConexion: opcionesEnvio.conexionWhatsappId ?? null,
      resolvedConexionWhatsappId: resolvedConexionWhatsappId ?? null,
      conexionParaInbox: inbox.conexionWhatsappId,
    });

    validarConexionInbox(opcionesEnvio, inbox.conexionWhatsappId);

    try {
      if (usuarioId) {
        return await registrarMensajeSalienteEnInbox({
          usuarioId,
          numero,
          texto: textoEnvio,
          wamid,
          tipo: "texto",
          conexionWhatsappId: inbox.conexionWhatsappId,
          origen: inbox.origen,
          seguimientoId: inbox.seguimientoId,
          seguimientoV2Id: inbox.seguimientoV2Id,
          opcionesSeguimiento: opcionesEnvio,
        });
      }

      return await registrarMensajeSalienteEnInbox({
        usuarioId: null,
        numero,
        texto: textoEnvio,
        wamid,
        tipo: "texto",
        conexionWhatsappId: inbox.conexionWhatsappId,
        origen: inbox.origen,
        seguimientoId: inbox.seguimientoId,
        seguimientoV2Id: inbox.seguimientoV2Id,
        opcionesSeguimiento: opcionesEnvio,
      });
    } catch (supabaseErr) {
      console.log("ERROR ENVIANDO WHATSAPP (SUPABASE mensajes):", {
        code: supabaseErr.response?.data?.code,
        message: supabaseErr.response?.data?.message || supabaseErr.message,
        details: supabaseErr.response?.data,
        url: supabaseErr.config?.url,
        bodyEnviado: supabaseErr.config?.data,
      });
      throw supabaseErr;
    }
  } catch (error) {
    if (esSeguimientoBlockedError(error)) {
      throw error;
    }
    const esSupabase =
      String(error.config?.url || "").includes(SUPABASE_URL) ||
      error.response?.data?.code === "PGRST102";
    console.log(
      esSupabase ? "ERROR ENVIANDO WHATSAPP (SUPABASE):" : "ERROR ENVIANDO WHATSAPP (META):",
      {
        code: error.response?.data?.code,
        message: error.response?.data?.message || error.message,
        details: error.response?.data,
        url: error.config?.url,
        bodyEnviado: error.config?.data,
      }
    );
    if (esInboxSeguimientoCualquiera(opciones)) {
      throw error;
    }
    return null;
  }
}

function normalizarNumeroWhatsApp(numero) {
  return String(numero || "").replace(/\D/g, "");
}

function normalizarTipoMediaWhatsApp(tipo) {
  const t = String(tipo || "").toLowerCase().trim();
  if (t === "imagen" || t === "image") return "image";
  if (t === "video") return "video";
  if (t === "audio") return "audio";
  if (t === "document" || t === "doc" || t === "pdf") return "document";
  return t;
}

function nombreArchivoDesdeUrl(mediaUrl, fallback = "archivo.pdf") {
  try {
    const base = new URL(mediaUrl).pathname.split("/").pop();
    return base && base.includes(".") ? base : fallback;
  } catch {
    return fallback;
  }
}

async function resolverCredencialesWhatsApp(opciones = {}) {
  return resolverCredencialesEnvio(opciones);
}

function esUrlPublicaHttps(url) {
  const u = String(url || "").trim();
  if (!u.startsWith("https://")) return false;
  if (u.includes("/object/sign/")) return false;
  if (/[?&]token=/.test(u)) return false;
  return true;
}

function pareceUrlWebp(url, contentType) {
  const u = String(url || "").toLowerCase();
  const ct = String(contentType || "").toLowerCase();
  return u.includes(".webp") || ct.includes("webp");
}

async function verificarUrlAccesible(url) {
  try {
    const head = await axios.head(url, {
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return true;
  } catch {
    try {
      const get = await axios.get(url, {
        timeout: 12000,
        responseType: "arraybuffer",
        maxContentLength: 512 * 1024,
      });
      return !!get.data?.byteLength;
    } catch {
      return false;
    }
  }
}

async function obtenerContentTypeRemoto(url) {
  try {
    const head = await axios.head(url, { timeout: 12000, maxRedirects: 5 });
    return head.headers["content-type"] || "";
  } catch {
    return "";
  }
}

async function rehostImagenJpegPublica(urlOrigen, opciones = {}) {
  console.log("???? Convirtiendo imagen a JPEG p?blico para Meta:", urlOrigen);

  const res = await axios.get(urlOrigen, {
    responseType: "arraybuffer",
    timeout: 45000,
    maxContentLength: 12 * 1024 * 1024,
  });

  const prep = await prepararImagenParaWhatsApp(
    Buffer.from(res.data),
    res.headers["content-type"],
    urlOrigen
  );

  const uid = opciones.usuarioId || "flow";
  const ruta = `whatsapp-meta/${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${prep.extension}`;

  await axios.post(`${SUPABASE_URL}/storage/v1/object/archivos/${ruta}`, prep.buffer, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": prep.mimetype,
      "x-upsert": "true",
    },
  });

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/archivos/${ruta}`;
  console.log("??? URL JPEG p?blica para Meta:", publicUrl);
  return publicUrl;
}

async function resolverLinkImagenWhatsApp(mediaUrl, opciones = {}) {
  let url = String(mediaUrl || "").trim();

  if (!esUrlPublicaHttps(url)) {
    throw new Error(
      "La URL de imagen debe ser HTTPS p?blica (sin token firmado). Usa /storage/v1/object/public/..."
    );
  }

  const contentType = await obtenerContentTypeRemoto(url);
  const necesitaConversion =
    pareceUrlWebp(url, contentType) ||
    (contentType && !mimeCompatibleWhatsApp(contentType));

  if (necesitaConversion) {
    console.log("????? Imagen WEBP/incompatible ??? convirtiendo antes de Meta");
    return rehostImagenJpegPublica(url, opciones);
  }

  const accesible = await verificarUrlAccesible(url);
  if (!accesible) {
    console.warn("???? Meta no podr?a leer la URL ??? rehost JPEG:", url);
    return rehostImagenJpegPublica(url, opciones);
  }

  return url;
}

function construirPayloadMediaWhatsApp(numeroDestino, tipoApi, mediaUrl, caption, opciones = {}) {
  const payload = {
    messaging_product: "whatsapp",
    to: numeroDestino,
    type: tipoApi,
  };

  if (tipoApi === "image") {
    payload.image = {
      link: mediaUrl,
      ...(caption ? { caption: String(caption) } : {}),
    };
    return payload;
  }

  if (tipoApi === "video") {
    payload.video = {
      link: mediaUrl,
      caption: caption || "",
    };
    return payload;
  }

  if (tipoApi === "audio") {
    payload.audio = {
      link: mediaUrl,
    };
    return payload;
  }

  if (tipoApi === "document") {
    payload.document = {
      link: mediaUrl,
      filename:
        opciones.filename ||
        nombreArchivoDesdeUrl(mediaUrl, "archivo.pdf"),
      caption: caption || "",
    };
    return payload;
  }

  return null;
}

function aplicarCamposInsertSeguimiento(insertPayload, inbox) {
  if (inbox.origen === "seguimiento_v2") {
    insertPayload.conexion_whatsapp_id = inbox.conexionWhatsappId;
    insertPayload.seguimiento_v2_id = String(inbox.seguimientoV2Id).trim();
    return insertPayload;
  }
  if (inbox.origen !== "seguimiento") return insertPayload;
  insertPayload.conexion_whatsapp_id = inbox.conexionWhatsappId;
  insertPayload.seguimiento_id = String(inbox.seguimientoId).trim();
  return insertPayload;
}

async function enviarMediaWhatsApp(numero, tipo, mediaUrl, caption = "", opciones = {}) {
  const numeroDestino = normalizarNumeroWhatsApp(numero);
  const opcionesEnvio = await completarOpcionesEnvio(opciones, numeroDestino);

  const urlOriginal = String(mediaUrl || "").trim();
  const tipoApi = normalizarTipoMediaWhatsApp(tipo);

  if (!numeroDestino) {
    console.error("?? N??MERO DESTINO INV?LIDO:", numero);
    return false;
  }

  if (!["image", "video", "audio", "document"].includes(tipoApi)) {
    console.error("?? TIPO MEDIA NO SOPORTADO:", tipo);
    return false;
  }

  let urlEnvio = urlOriginal;

  try {
    if (tipoApi === "image") {
      console.log("????? ENVIANDO IMAGEN A META:", {
        numero: numeroDestino,
        mediaUrl: urlOriginal,
        caption: caption || "",
      });

      if (!urlOriginal) {
        console.error("?? IMAGEN SIN URL");
        return false;
      }

      urlEnvio = await resolverLinkImagenWhatsApp(urlOriginal, opcionesEnvio);

      if (urlEnvio !== urlOriginal) {
        console.log("????? URL FINAL PARA META (JPEG):", urlEnvio);
      }
    } else {
      console.log("???? ENVIANDO MEDIA A META:", {
        numero: numeroDestino,
        tipo: tipoApi,
        mediaUrl: urlOriginal,
        caption: caption || "",
      });

      if (!urlOriginal || !esUrlPublicaHttps(urlOriginal)) {
        console.error("?? MEDIA URL INV?LIDA:", urlOriginal);
        return false;
      }
      urlEnvio = urlOriginal;
    }

    const credenciales = await resolverCredencialesWhatsApp(opcionesEnvio);
    const {
      tokenEnviar,
      phoneIdEnviar,
      resolvedConexionWhatsappId,
    } = credenciales;
    const inbox = resolverParamsInboxSaliente(opcionesEnvio, resolvedConexionWhatsappId);
    await aplicarGuardsSeguimientoPreMeta(opcionesEnvio, credenciales);
    logSeguimientoEnvio(opcionesEnvio, numeroDestino, phoneIdEnviar);
    logSegSendTrace(opcionesEnvio, numeroDestino, credenciales);

    if (!tokenEnviar || !phoneIdEnviar) {
      console.error("?? FALTAN CREDENCIALES WHATSAPP (token o phone_id)");
      return false;
    }

    const payload = construirPayloadMediaWhatsApp(
      numeroDestino,
      tipoApi,
      urlEnvio,
      caption,
      opcionesEnvio
    );

    if (!payload) {
      console.error("?? NO SE PUDO CONSTRUIR PAYLOAD MEDIA:", tipoApi);
      return false;
    }

    logMetaSendFinal(opcionesEnvio, numeroDestino, phoneIdEnviar);

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    logSegPostMetaFinal(
      opcionesEnvio,
      credenciales,
      respuestaMeta.data?.messages?.[0]?.id ?? null
    );

    if (tipoApi === "image") {
      console.log("??? RESPUESTA META IMAGEN:", respuestaMeta.data);
    } else {
      console.log("??? RESPUESTA META MEDIA:", respuestaMeta.data);
    }

    if (respuestaMeta.data?.error) {
      if (tipoApi === "image") {
        console.error("?? ERROR META IMAGEN:", respuestaMeta.data.error);
      } else {
        console.error("?? ERROR META MEDIA:", respuestaMeta.data.error);
      }
      return false;
    }

    const whatsappMessageId = respuestaMeta.data?.messages?.[0]?.id || null;

    if (!whatsappMessageId) {
      console.error("?? META NO DEVOLVI?? message_id ??? NO se guarda en bandeja:", respuestaMeta.data);
      return false;
    }

    console.log("??? message_id Meta:", whatsappMessageId);

    const insertPayload = normalizarBodyMensajeSupabase({
      usuarioId: opcionesEnvio.usuarioId,
      numero: numeroDestino,
      texto: caption || urlOriginal,
      wamid: whatsappMessageId,
      tipo: tipoApi,
      imagen_url: urlEnvio,
      conexionWhatsappId: inbox.conexionWhatsappId,
    });

    if (inbox.origen === "seguimiento" || inbox.origen === "seguimiento_v2") {
      aplicarCamposInsertSeguimiento(insertPayload, inbox);
      console.log("[SEGUIMIENTO_INSERT_TRACE]", {
        texto: insertPayload.contenido,
        origen: inbox.origen,
        seguimientoId: inbox.seguimientoId,
        seguimientoV2Id: inbox.seguimientoV2Id,
        conexionWhatsappId: inbox.conexionWhatsappId,
        insertPayloadConexion: insertPayload.conexion_whatsapp_id ?? null,
        seguimiento_id: insertPayload.seguimiento_id ?? null,
        seguimiento_v2_id: insertPayload.seguimiento_v2_id ?? null,
      });
    }

    const guardMedia = validarGuardInsertMensajeSeguimiento({
      origen: inbox.origen,
      seguimientoId: inbox.seguimientoId,
      seguimientoV2Id: inbox.seguimientoV2Id,
      conexionWhatsappId: inbox.conexionWhatsappId,
      insertPayload,
      cliente_numero: numeroDestino,
      usuario_id: opcionesEnvio.usuarioId,
    });
    if (!guardMedia.ok) {
      return false;
    }

    validarConexionInbox(opcionesEnvio, inbox.conexionWhatsappId);

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      insertPayload,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const row = insertRes.data?.[0];
    if (opcionesEnvio.usuarioId && row) {
      await actualizarConversacionSaliente(
        opcionesEnvio.usuarioId,
        numeroDestino,
        insertPayload.contenido,
        insertPayload.conexion_whatsapp_id
      );

      const conexionSocket = insertPayload.conexion_whatsapp_id;
      rt.nuevoMensaje(null, opcionesEnvio.usuarioId, {
        id: row.id,
        cliente_numero: numeroDestino,
        usuario_id: opcionesEnvio.usuarioId,
        direccion: "saliente",
        tipo: tipoApi,
        contenido: insertPayload.contenido,
        imagen_url: urlEnvio,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        conexion_whatsapp_id: conexionSocket,
        chatKey: chatListKeySaliente(numeroDestino, conexionSocket),
        creado_en: row.creado_en || new Date().toISOString(),
      });
    }

    return row;
  } catch (error) {
    if (esSeguimientoBlockedError(error)) {
      throw error;
    }
    if (tipoApi === "image") {
      console.error("?? ERROR META IMAGEN:", error.response?.data || error.message);
    } else {
      console.error("?? ERROR META MEDIA:", error.response?.data || error.message);
    }
    if (esInboxSeguimientoCualquiera(opciones)) {
      throw error;
    }
    return false;
  }
}

async function enviarBotonesWhatsApp(numero, texto, botones, opciones = {}) {
  try {
    const opcionesEnvio = await completarOpcionesEnvio(opciones, numero);

    const credenciales = await resolverCredencialesEnvio(opcionesEnvio);
    const { tokenEnviar, phoneIdEnviar, resolvedConexionWhatsappId } = credenciales;
    const inbox = resolverParamsInboxSaliente(opcionesEnvio, resolvedConexionWhatsappId);
    await aplicarGuardsSeguimientoPreMeta(opcionesEnvio, credenciales);
    logSeguimientoEnvio(opcionesEnvio, numero, phoneIdEnviar);
    logSegSendTrace(opcionesEnvio, numero, credenciales);

    const lista = (botones || []).slice(0, 3).filter(function (b) {
      return b && String(b.texto || "").trim();
    });

    if (!lista.length) {
      await enviarTextoWhatsApp(numero, texto, opcionesEnvio);
      return;
    }

    const payload = {
      messaging_product: "whatsapp",
      to: numero,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto },
        action: {
          buttons: lista.map(function (btn) {
            return {
              type: "reply",
              reply: {
                id: String(btn.id || btn.texto).slice(0, 128),
                title: String(btn.texto).trim().slice(0, 20),
              },
            };
          }),
        },
      },
    };

    logMetaSendFinal(opcionesEnvio, numero, phoneIdEnviar);

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json",
        },
      }
    );

    const whatsappMessageId = respuestaMeta.data?.messages?.[0]?.id || null;
    logSegPostMetaFinal(opcionesEnvio, credenciales, whatsappMessageId);

    const insertPayload = normalizarBodyMensajeSupabase({
      usuarioId: opcionesEnvio.usuarioId,
      numero,
      texto,
      wamid: whatsappMessageId,
      tipo: "interactive",
      conexionWhatsappId: inbox.conexionWhatsappId,
    });

    if (inbox.origen === "seguimiento" || inbox.origen === "seguimiento_v2") {
      aplicarCamposInsertSeguimiento(insertPayload, inbox);
      console.log("[SEGUIMIENTO_INSERT_TRACE]", {
        texto: insertPayload.contenido,
        origen: inbox.origen,
        seguimientoId: inbox.seguimientoId,
        seguimientoV2Id: inbox.seguimientoV2Id,
        conexionWhatsappId: inbox.conexionWhatsappId,
        insertPayloadConexion: insertPayload.conexion_whatsapp_id ?? null,
        seguimiento_id: insertPayload.seguimiento_id ?? null,
        seguimiento_v2_id: insertPayload.seguimiento_v2_id ?? null,
      });
    }

    const guardBotones = validarGuardInsertMensajeSeguimiento({
      origen: inbox.origen,
      seguimientoId: inbox.seguimientoId,
      seguimientoV2Id: inbox.seguimientoV2Id,
      conexionWhatsappId: inbox.conexionWhatsappId,
      insertPayload,
      cliente_numero: numero,
      usuario_id: opcionesEnvio.usuarioId,
    });
    if (!guardBotones.ok) {
      return false;
    }

    validarConexionInbox(opcionesEnvio, inbox.conexionWhatsappId);

    const insertRes = await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      insertPayload,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      }
    );

    const row = insertRes.data?.[0];
    if (opcionesEnvio.usuarioId) {
      await actualizarConversacionSaliente(
        opcionesEnvio.usuarioId,
        numero,
        insertPayload.contenido,
        insertPayload.conexion_whatsapp_id
      );

      rt.nuevoMensaje(null, opcionesEnvio.usuarioId, {
        id: row?.id,
        cliente_numero: numero,
        usuario_id: opcionesEnvio.usuarioId,
        direccion: "saliente",
        tipo: "interactive",
        contenido: insertPayload.contenido,
        whatsapp_message_id: whatsappMessageId,
        estado_envio: "sent",
        conexion_whatsapp_id: inbox.conexionWhatsappId,
        chatKey: chatListKeySaliente(numero, inbox.conexionWhatsappId),
        creado_en: row?.creado_en || new Date().toISOString(),
      });
    }
    return row;
  } catch (error) {
    if (esSeguimientoBlockedError(error)) {
      throw error;
    }
    console.log(
      "ERROR ENVIANDO BOTONES WHATSAPP:",
      error.response?.data || error.message
    );
    throw error;
  }
}

module.exports = {
  enviarTextoWhatsApp,
  registrarMensajeSalienteEnInbox,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
};