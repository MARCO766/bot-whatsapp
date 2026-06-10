const axios = require("axios");

const {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp,
  enviarBotonesWhatsApp,
} = require("./whatsappService");
const { normalizarBotones } = require("./seguimiento/normalizarBotones");
const { esperarSegundos } = require("../utils/timers");
const { detectarTipoNodo } = require("./seguimiento/detectarTipoNodo");
const { ejecutarSeguimientoEnFlujo } = require("./seguimiento/ejecutarSeguimientoEnFlujo");
const { esNodoSeguimientoV2 } = require("./seguimientoV2/seguimientoV2Parser");
const { programarSeguimientoV2EnFlujo } = require("./seguimientoV2/seguimientoV2Service");
const {
  crearNodoSeguimientoV2Test,
  esNodoSeguimientoV2Test,
} = require("./seguimientoV2/seguimientoV2TestNode");
const {
  registrarConversion,
  parseConversionFromNodo,
} = require("./conversionService");
const {
  ejecutarNodoIA,
  enriquecerContextoFlujo,
  esConfigRouterLocal,
  parseIAFromNodo,
} = require("./aiService");
const { ejecutarNodoIAPro, parseIAProFromNodo } = require("./iaProService");
const {
  ejecutarNodoOpenAIAgent,
  trimChatHistory,
  appendChatHistory,
  limpiarRutasContexto,
} = require("./openaiAgentService");
const {
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
  logFlowKey,
  logChatHistorySource,
} = require("./iaFlowSession");
const {
  esNodoIAReentrable,
  esEtiquetaRutaIA,
  hayBucleIAActivo,
  debePermitirRevisitaEnBucleIA,
  manejarReentradaIALoop,
} = require("./iaLoopReentry");
const {
  esComandoResetFlujo,
  resetearFlujoLead,
} = require("./resetFlujoLeadService");
const {
  iniciarEsperaLectorPago,
  procesarImagenLectorPago,
} = require("./lectorPagoService");
const {
  continuarMiniFlujoRmTrasPagoValido,
} = require("./remarketing24h/rmMiniFlowRuntime");
const { esTipoIA, resolverTipoRaw } = require("./seguimiento/detectarTipoNodo");
const {
  esNodoSeguimiento,
  parseSeguimientoFromHtml,
} = require("./seguimiento/parseSeguimientoNode");
const { obtenerConfigRemarketingGlobal } = require("./remarketing24h/parseRemarketingGlobalNode");
const {
  iniciarRemarketing24h,
  resetearRemarketing24h,
  cancelarRemarketing24h,
} = require("./remarketing24h/remarketing24hService");
const repoRm24h = require("./remarketing24h/remarketing24hRepository");
const {
  obtenerContextoRemarketingPostEnvio,
} = require("./remarketing24h/rmContextPostEnvio");
const {
  procesarRespuestaRemarketing,
} = require("./remarketing24h/procesarRespuestaRemarketing");
const {
  estaBotPausado,
  reactivarBotConversacion,
} = require("./conversaciones/botPauseService");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function extraerMediaEntrante(opts = {}) {
  const messageType = opts.messageType ? String(opts.messageType).trim() : null;
  const imageUrl = opts.imageUrl || null;
  const imageMetaId = opts.imageMetaId || null;
  const metaToken = opts.metaToken || null;
  const esMedia =
    messageType === "image" ||
    messageType === "document" ||
    !!imageUrl ||
    !!imageMetaId;
  if (!esMedia) return null;
  return { messageType, imageUrl, imageMetaId, metaToken };
}

function optsMediaParaOpenAI(opts = {}) {
  const media = extraerMediaEntrante(opts);
  if (!media) return {};
  return media;
}

function prepararFlowContextSesionIA(flowContext) {
  const ctx = limpiarRutasContexto({ ...(flowContext || {}) });
  delete ctx.messageType;
  delete ctx.imageUrl;
  delete ctx.imageMetaId;
  delete ctx.metaToken;
  ctx.ultimo_mensaje = "";
  ctx.ultimoMensaje = "";
  return ctx;
}

function guardarSesionOpenAIPendiente(payload) {
  const flowContext = prepararFlowContextSesionIA(payload.flowContext);
  if (flowContext.openaiPaymentReaderEsperando) {
    console.log(
      "[OPENAI_PAYMENT_READER_WAITING]",
      JSON.stringify({
        nodoId: payload.nodoId,
        numero: payload.numero,
        flujoId: payload.flujoId,
      })
    );
  }
  return guardarSesionIAPendiente({
    ...payload,
    flowContext,
  });
}

async function agregarEtiquetaCliente(
  numero,
  etiqueta,
  usuarioId = null,
  conexionWhatsappId = null
) {
  if (!numero || !etiqueta) return;
  if (!conexionWhatsappId) {
    console.log(
      "[FLUJO] agregarEtiquetaCliente omitido — sin conexionWhatsappId",
      { numero, usuarioId, etiqueta }
    );
    return;
  }

  const etiquetaLimpia = etiqueta.trim();
  const filtroConexion = `&conexion_whatsapp_id=eq.${encodeURIComponent(conexionWhatsappId)}`;

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}${filtroConexion}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  await axios.post(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
    {
      cliente_numero: numero,
      etiqueta: etiquetaLimpia,
      usuario_id: usuarioId,
      conexion_whatsapp_id: conexionWhatsappId,
    },
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
    }
  );
}


function normalizarConexionesFlujo(conexionesRaw) {
  if (!Array.isArray(conexionesRaw)) return [];

  const lista = [];
  const vistos = new Set();

  conexionesRaw.forEach((c) => {
    if (!c || typeof c !== "object") return;

    const desde =
      c.desde || c.from || c.source || c.source_node_id || c.sourceNodeId;
    const hasta =
      c.hasta || c.to || c.target || c.target_node_id || c.targetNodeId;

    if (!desde || !hasta || desde === hasta) return;

    const sourceHandle =
      c.sourceHandle ||
      c.source_handle ||
      c.desdeHandle ||
      c.handle ||
      c.puerto ||
      c.dataHandle ||
      c.salida ||
      null;

    const key = desde + "->" + hasta + "@" + (sourceHandle || "");
    if (vistos.has(key)) return;
    vistos.add(key);

    const item = { desde, hasta };
    if (sourceHandle) item.sourceHandle = sourceHandle;
    lista.push(item);
  });

  return lista;
}

function obtenerSiguientesNodos(conexiones, nodoId) {
  return conexiones.filter((c) => c.desde === nodoId);
}

function handleConexion(c) {
  if (!c || typeof c !== "object") return null;
  return (
    c.sourceHandle ||
    c.source_handle ||
    c.desdeHandle ||
    c.handle ||
    c.puerto ||
    c.dataHandle ||
    c.salida ||
    null
  );
}

function decodificarJsonHtml(raw) {
  return String(raw || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function normalizarVariantesContenido(parsed) {
  if (!parsed) return [];

  if (parsed.variantes && Array.isArray(parsed.variantes)) {
    return normalizarVariantesContenido(parsed.variantes);
  }

  if (!Array.isArray(parsed)) return [];

  if (
    parsed.length &&
    parsed[0] &&
    typeof parsed[0] === "object" &&
    !Array.isArray(parsed[0]) &&
    (parsed[0].tipo || parsed[0].type || parsed[0].blockType)
  ) {
    return [parsed];
  }

  if (parsed.length && parsed[0]?.bloques && Array.isArray(parsed[0].bloques)) {
    return parsed
      .map((v) => (Array.isArray(v.bloques) ? v.bloques : []))
      .filter((bloques) => bloques.length > 0);
  }

  return parsed.filter((v) => Array.isArray(v) && v.length > 0);
}

function extraerJsonVariantesDesdeNodo(nodo) {
  const html = nodo?.html || "";
  const matches = [
    ...html.matchAll(
      /<textarea[^>]*class="contenido-variantes-data"[^>]*>([\s\S]*?)<\/textarea>/gi
    ),
  ];

  let mejor = "";
  for (const m of matches) {
    const candidato = decodificarJsonHtml(m[1]);
    if (candidato.length > mejor.length) mejor = candidato;
  }

  if (mejor) return mejor;

  if (nodo?.data?.variantes) {
    return JSON.stringify(nodo.data.variantes);
  }

  return "";
}

function tipoBloqueContenido(bloque) {
  return String(
    bloque?.type || bloque?.tipo || bloque?.blockType || bloque?.mediaType || ""
  )
    .toLowerCase()
    .trim();
}

function valorTextoBloque(bloque) {
  return String(
    bloque?.valor ?? bloque?.texto ?? bloque?.mensaje ?? bloque?.content ?? ""
  ).trim();
}

function urlMediaBloque(bloque) {
  return String(
    bloque?.valor ?? bloque?.url ?? bloque?.media ?? bloque?.archivo ?? bloque?.file ?? ""
  ).trim();
}

function captionMediaBloque(bloque) {
  return String(
    bloque?.descripcion ?? bloque?.caption ?? bloque?.texto ?? ""
  ).trim();
}

function segundosPausaBloque(bloque) {
  const raw =
    bloque?.valor ?? bloque?.segundos ?? bloque?.time ?? bloque?.delay ?? 1;
  const segundos = parseInt(raw, 10);
  return !isNaN(segundos) && segundos > 0 ? segundos : 0;
}

function opcionesEnvioFlujo(usuarioId, conexionWhatsappId) {
  const op = { usuarioId };
  const conexion =
    conexionWhatsappId != null && String(conexionWhatsappId).trim() !== ""
      ? String(conexionWhatsappId).trim()
      : null;
  if (conexion) {
    op.conexionWhatsappId = conexion;
    op.strictConexionWhatsappId = true;
  }
  return op;
}

const REGEX_ACCION_LEGACY_HTML =
  /<p[^>]*>\s*(texto|tiempo|imagen|audio|video|doc):\s*([\s\S]*?)<\/p>/gi;

function normalizarTextoReservaSeguimiento(texto) {
  return String(texto || "").trim().toLowerCase();
}

function logSeguimientoLegacyBloqueado(payload) {
  console.log("[SEGUIMIENTO_LEGACY_BLOQUEADO]", payload);
}

function htmlTieneSeguimientoCRM(html) {
  const h = String(html || "");
  return (
    h.includes("seguimiento-data") ||
    h.includes("⏱️ Seguimiento") ||
    h.includes("🔔 Seguimiento") ||
    h.includes("Seguimiento CRM")
  );
}

/** HTML viejo con pasos tiempo+texto embebidos (no CRM) — no enviar por parser síncrono. */
function htmlPareceSeguimientoLegacyProgramado(html) {
  const h = String(html || "");
  if (htmlTieneSeguimientoCRM(h)) return true;
  const tiempos = (h.match(/tiempo\s*:/gi) || []).length;
  const textos = (h.match(/texto\s*:/gi) || []).length;
  return tiempos >= 1 && textos >= 1;
}

async function enviarTextoFlujoSeguro(numero, texto, opEnvio, ctx = {}) {
  const conexion = opEnvio?.conexionWhatsappId ?? null;
  console.log("[FLOW_WA_SEND_TRACE]", {
    cliente_numero: numero,
    conexion_whatsapp_id: conexion,
    strict: opEnvio?.strictConexionWhatsappId === true,
    fase: ctx.fase || "flowService",
    nodoId: ctx.nodoId ?? null,
  });
  return enviarTextoWhatsApp(numero, texto, opEnvio);
}

async function enviarMediaFlujoSeguro(numero, tipo, url, caption, opEnvio, ctx = {}) {
  const conexion = opEnvio?.conexionWhatsappId ?? null;
  console.log("[FLOW_WA_SEND_TRACE]", {
    cliente_numero: numero,
    conexion_whatsapp_id: conexion,
    tipo,
    fase: ctx.fase || "flowService",
    nodoId: ctx.nodoId ?? null,
  });
  return enviarMediaWhatsApp(numero, tipo, url, caption, opEnvio);
}

function nodoEsSeguimientoCRM(nodo) {
  return esNodoSeguimiento(nodo) || htmlTieneSeguimientoCRM(nodo?.html || "");
}

function esValorLegacyReservadoSeguimiento(valor, textosReservados) {
  const raw = String(valor || "").trim();
  if (!raw || !textosReservados?.size) return false;

  if (esTextoReservadoSeguimiento(raw, textosReservados)) return true;

  const partes = raw.split("||");
  for (const parte of partes) {
    if (esTextoReservadoSeguimiento(parte, textosReservados)) return true;
  }

  return false;
}

function extraerAccionesLegacyHtml(html) {
  const acciones = [];
  if (!html) return acciones;

  const regex = new RegExp(REGEX_ACCION_LEGACY_HTML.source, REGEX_ACCION_LEGACY_HTML.flags);
  let match;

  while ((match = regex.exec(html)) !== null) {
    const tipoAccion = match[1].trim().toLowerCase();
    const valorAccion = match[2]
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, "")
      .trim();

    acciones.push({ tipo: tipoAccion, valor: valorAccion });
  }

  return acciones;
}

function extraerTextosPasosSeguimiento(nodo) {
  const config = parseSeguimientoFromHtml(nodo?.html || "");
  const textos = [];

  for (const paso of config.pasos || []) {
    const msg = paso.mensaje || {};
    const t = String(msg.texto || "").trim();
    if (t) textos.push(t);
    const cap = String(msg.caption || "").trim();
    if (cap) textos.push(cap);
    const url = String(msg.url || "").trim();
    if (url) textos.push(url);
  }

  return textos;
}

function construirTextosReservadosSeguimientoFlujo(nodos) {
  const set = new Set();

  for (const nodo of nodos || []) {
    if (!nodoEsSeguimientoCRM(nodo)) continue;

    for (const t of extraerTextosPasosSeguimiento(nodo)) {
      const norm = normalizarTextoReservaSeguimiento(t);
      if (norm) set.add(norm);
    }

    for (const acc of extraerAccionesLegacyHtml(nodo.html || "")) {
      if (!acc.valor) continue;
      const norm = normalizarTextoReservaSeguimiento(acc.valor);
      if (norm) set.add(norm);
      for (const parte of String(acc.valor).split("||")) {
        const pNorm = normalizarTextoReservaSeguimiento(parte);
        if (pNorm) set.add(pNorm);
      }
    }
  }

  return set;
}

function esTextoReservadoSeguimiento(texto, textosReservados) {
  const norm = normalizarTextoReservaSeguimiento(texto);
  if (!norm || !textosReservados?.size) return false;
  return textosReservados.has(norm);
}

function auditarLegacySeguimientoEnNodo(nodo, nodoId, clienteNumero) {
  const legacyAcciones = extraerAccionesLegacyHtml(nodo?.html || "");
  const textosPasos = extraerTextosPasosSeguimiento(nodo);

  if (legacyAcciones.length) {
    logSeguimientoLegacyBloqueado({
      motivo: "html_legacy_detectado_en_nodo_seguimiento",
      nodoId,
      cliente_numero: clienteNumero,
      acciones_legacy: legacyAcciones.length,
      pasos_programados: textosPasos.length,
      tipos_legacy: legacyAcciones.map((a) => a.tipo),
    });

    for (const acc of legacyAcciones) {
      if (!acc.valor) continue;
      logSeguimientoLegacyBloqueado({
        motivo: "accion_legacy_omitida_en_nodo_seguimiento_crm",
        nodoId,
        cliente_numero: clienteNumero,
        tipo: acc.tipo,
        valor: acc.valor,
        coincide_con_paso:
          textosPasos.some(
            (t) => normalizarTextoReservaSeguimiento(t) === normalizarTextoReservaSeguimiento(acc.valor)
          ) || false,
      });
    }
  }

  return { legacyAcciones, textosPasos };
}

async function ejecutarBloqueContenido(
  numero,
  bloque,
  usuarioId,
  conexionWhatsappId = null,
  opts = {}
) {
  const opEnvio = opcionesEnvioFlujo(usuarioId, conexionWhatsappId);
  const tipo = tipoBloqueContenido(bloque);
  console.log("🧩 EJECUTANDO BLOQUE:", tipo, bloque);

  if (!tipo) {
    console.log("⚠️ BLOQUE SIN TIPO, SE OMITE");
    return;
  }

  if (tipo.includes("texto") || tipo === "text") {
    const mensaje = valorTextoBloque(bloque);
    if (!mensaje) {
      console.log("⚠️ TEXTO VACÍO, SE OMITE");
      return null;
    }
    if (esTextoReservadoSeguimiento(mensaje, opts.textosReservadosSeguimiento)) {
      logSeguimientoLegacyBloqueado({
        motivo: "texto_paso_seguimiento_en_ejecutarBloqueContenido",
        nodoId: opts.nodoId || null,
        cliente_numero: numero,
        texto: mensaje,
      });
      return null;
    }
    await enviarTextoFlujoSeguro(numero, mensaje, opEnvio, {
      fase: "ejecutarBloqueContenido",
      nodoId: opts.nodoId ?? null,
    });
    console.log("✅ TEXTO ENVIADO");
    return mensaje;
  }

  if (
    tipo.includes("pausa") ||
    tipo.includes("wait") ||
    tipo === "tiempo" ||
    tipo === "delay"
  ) {
    const segundos = segundosPausaBloque(bloque);
    if (!segundos) {
      console.log("⚠️ PAUSA INVÁLIDA, SE OMITE");
      return;
    }
    console.log("⏳ PAUSA:", segundos);
    await esperarSegundos(segundos);
    return;
  }

  if (tipo === "boton") {
    const texto = valorTextoBloque(bloque);
    if (!texto) {
      console.log("⚠️ BOTÓN SIN TEXTO, SE OMITE");
      return null;
    }
    if (esTextoReservadoSeguimiento(texto, opts.textosReservadosSeguimiento)) {
      logSeguimientoLegacyBloqueado({
        motivo: "boton_paso_seguimiento_en_ejecutarBloqueContenido",
        nodoId: opts.nodoId || null,
        cliente_numero: numero,
        texto,
      });
      return null;
    }

    const bloqueId = bloque.bloqueId || opts.nodoId || "cnt";
    const botones = normalizarBotones(bloque.botones, bloqueId);
    const ctxEnvio = {
      fase: "ejecutarBloqueContenido",
      nodoId: opts.nodoId ?? null,
    };

    if (!botones.length) {
      console.log("[CONTENIDO_BOTON] fallback_texto", {
        numero,
        nodoId: opts.nodoId ?? null,
      });
      await enviarTextoFlujoSeguro(numero, texto, opEnvio, ctxEnvio);
      return texto;
    }

    console.log("[CONTENIDO_BOTON] enviando", {
      numero,
      nodoId: opts.nodoId ?? null,
      botones: botones.length,
    });
    await enviarBotonesWhatsApp(numero, texto, botones, opEnvio);
    return texto;
  }

  const media = urlMediaBloque(bloque);
  if (!media) {
    console.log("⚠️ MEDIA SIN URL, SE OMITE:", tipo);
    return;
  }

  const caption = captionMediaBloque(bloque);
  if (
    esTextoReservadoSeguimiento(media, opts.textosReservadosSeguimiento) ||
    esTextoReservadoSeguimiento(caption, opts.textosReservadosSeguimiento)
  ) {
    logSeguimientoLegacyBloqueado({
      motivo: "media_paso_seguimiento_en_ejecutarBloqueContenido",
      nodoId: opts.nodoId || null,
      cliente_numero: numero,
      tipo,
      media,
      caption: caption || null,
    });
    return null;
  }

  if (tipo.includes("imagen") || tipo === "image") {
    console.log("🖼️ BLOQUE CONTENIDO IMAGEN:", { numero, mediaUrl: media, caption });
    const enviado = await enviarMediaWhatsApp(numero, "image", media, caption, opEnvio);
    if (enviado && enviado.whatsapp_message_id) {
      console.log("✅ IMAGEN ENVIADA A WHATSAPP:", enviado.whatsapp_message_id);
      return caption || media;
    }
    console.log("❌ IMAGEN NO ENVIADA — Meta no confirmó message_id");
    return false;
  }

  if (tipo.includes("video")) {
    const enviado = await enviarMediaWhatsApp(numero, "video", media, caption, opEnvio);
    if (enviado) console.log("✅ VIDEO ENVIADO");
    else console.log("❌ VIDEO NO ENVIADO (Meta o URL inválida)");
    return;
  }

  if (tipo.includes("audio")) {
    const enviado = await enviarMediaWhatsApp(numero, "audio", media, "", opEnvio);
    if (enviado) console.log("✅ AUDIO ENVIADO");
    else console.log("❌ AUDIO NO ENVIADO (Meta o URL inválida)");
    return;
  }

  if (tipo.includes("pdf") || tipo.includes("doc") || tipo === "document") {
    const enviado = await enviarMediaWhatsApp(numero, "document", media, caption, {
      ...opEnvio,
      filename: bloque.nombre || bloque.filename || "archivo.pdf",
    });
    if (enviado) console.log("✅ PDF ENVIADO");
    else console.log("❌ PDF NO ENVIADO (Meta o URL inválida)");
    return;
  }

  console.log("⚠️ TIPO DE BLOQUE NO RECONOCIDO:", tipo);
}

async function ejecutarContenidoNodo(
  numero,
  nodo,
  usuarioId,
  conexionWhatsappId = null,
  opts = {}
) {
  if (nodoEsSeguimientoCRM(nodo)) {
    logSeguimientoLegacyBloqueado({
      motivo: "ejecutarContenidoNodo_omitido_en_nodo_seguimiento_crm",
      nodoId: nodo?.id || null,
      cliente_numero: numero,
    });
    return false;
  }

  console.log("📦 EJECUTANDO NODO CONTENIDO");
  console.log("📦 DATA NODO:", nodo?.data);
  console.log("🧩 JSON REAL BLOQUES:", extraerJsonVariantesDesdeNodo(nodo) || "(vacío)");

  const textoJson = extraerJsonVariantesDesdeNodo(nodo);
  if (!textoJson) return false;

  try {
    const parsed = JSON.parse(textoJson);
    const variantes = normalizarVariantesContenido(parsed);
    console.log("📦 VARIANTES:", variantes);

    if (!variantes.length) return false;

    const varianteElegida =
      variantes[Math.floor(Math.random() * variantes.length)];
    const bloques = varianteElegida;
    console.log("📦 BLOQUES:", bloques);

    let ultimoTextoBot = "";
    for (const bloque of bloques) {
      console.log("📦 BLOQUE ACTUAL:", bloque);
      const enviado = await ejecutarBloqueContenido(numero, bloque, usuarioId, conexionWhatsappId, {
        textosReservadosSeguimiento: opts.textosReservadosSeguimiento,
        nodoId: nodo?.id || null,
      });
      if (enviado && typeof enviado === "string") ultimoTextoBot = enviado;
    }

    return { ok: true, ultimoTextoBot };
  } catch (e) {
    console.log("[FLUJO] ERROR LEYENDO VARIANTES DE CONTENIDO:", e.message);
    return false;
  }
}

async function ejecutarFlujo(
  numero,
  flujoData,
  usuarioId = null,
  flujoId = null,
  opts = {}
) {
  if (!flujoData || !flujoData.nodos || !flujoData.conexiones) return;

  const nodos = flujoData.nodos;
  const conexiones = normalizarConexionesFlujo(flujoData.conexiones);
  const textosReservadosSeguimiento = construirTextosReservadosSeguimientoFlujo(nodos);

  if (textosReservadosSeguimiento.size) {
    console.log("[FLUJO] Textos reservados seguimiento CRM:", textosReservadosSeguimiento.size);
  }

  let flowContext = opts.flowContextResume || {
    numero,
    telefono: numero,
    nombre: opts.nombre || "",
    ultimo_mensaje: opts.ultimoMensaje || opts.ultimo_mensaje || "",
    intent: "",
    score: "",
    route: "",
    ai: {},
    memoriaIA: {},
  };

  if (opts.mensajeResume) {
    flowContext.ultimo_mensaje = opts.mensajeResume;
    flowContext.ultimoMensaje = opts.mensajeResume;
  }

  const mediaEntrante = extraerMediaEntrante(opts);
  if (mediaEntrante) {
    Object.assign(flowContext, mediaEntrante);
  }

  flowContext.usuarioId = usuarioId;
  flowContext.numero = flowContext.numero || numero;

  const conexionLineaEntrante =
    opts.conexionWhatsappId != null && String(opts.conexionWhatsappId).trim() !== ""
      ? String(opts.conexionWhatsappId).trim()
      : null;

  if (conexionLineaEntrante) {
    flowContext.conexionWhatsappId = conexionLineaEntrante;
  } else if (!flowContext.conexionWhatsappId) {
    flowContext.conexionWhatsappId = null;
  }

  logFlowKey(usuarioId, flowContext.conexionWhatsappId, numero);

  const opEnvioNodo = () =>
    opcionesEnvioFlujo(usuarioId, flowContext.conexionWhatsappId);

  await enriquecerContextoFlujo(flowContext, numero, usuarioId);

  const rm24h = obtenerConfigRemarketingGlobal(flujoData);
  if (rm24h?.config) {
    try {
      await iniciarRemarketing24h({
        usuario_id: usuarioId,
        cliente_numero: numero,
        conexion_whatsapp_id:
          flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null,
        flujo_id: String(flujoId || ""),
        flujo_nombre: opts.flujoNombre || null,
        config: rm24h.config,
      });
    } catch (err) {
      console.log("[RM24H] error al iniciar:", err.response?.data || err.message);
    }
  }

  console.log(
    "[FLUJO] Inicio ejecución | nodos:",
    nodos.length,
    "| conexiones:",
    conexiones.length
  );
  if (conexiones.length) {
    console.log("[FLUJO] Conexiones encontradas:", JSON.stringify(conexiones));
  }

  function logConexionesSalientes(nodoId, etiqueta) {
    const salientes = conexiones.filter(
      (c) =>
        c.desde === nodoId ||
        c.from === nodoId ||
        c.source === nodoId ||
        c.sourceNode === nodoId
    );
    if (!salientes.length && (etiqueta === "ia" || etiqueta === "ia_pro" || etiqueta === "IA")) {
      console.warn("⚠️ Nodo IA sin conexión saliente");
      return;
    }
    salientes.forEach((c) => {
      const siguienteNodoId =
        c.hasta || c.to || c.target || c.targetNode || c.target_node_id;
      console.log("🔗 Siguiente conexión desde", etiqueta || nodoId + ":", c);
      console.log("➡️ Siguiente nodo después de", etiqueta || nodoId + ":", siguienteNodoId);
    });
  }

  async function continuarASiguientes(nodoId, visitados, etiqueta, sourceHandle) {
    let siguientes = obtenerSiguientesNodos(conexiones, nodoId);

    if (etiqueta === "ia" || etiqueta === "ia_pro") {
      console.log(
        "🔌 CONEXIONES DESDE IA:",
        conexiones
          .filter((c) => c.desde === nodoId)
          .map((c) => ({ hasta: c.hasta, handle: handleConexion(c) }))
      );
      if (sourceHandle) {
        console.log("🔍 BUSCANDO SOURCE HANDLE:", sourceHandle);
      }
    }

    if (sourceHandle && siguientes.length) {
      const filtradas = siguientes.filter(
        (c) => handleConexion(c) === sourceHandle
      );
      if (filtradas.length) {
        siguientes = filtradas;
      } else if (siguientes.length === 1) {
        console.warn(
          "⚠️ IA: sin match para sourceHandle",
          sourceHandle,
          "— fallback única salida:",
          siguientes[0].hasta,
          "handle guardado:",
          handleConexion(siguientes[0])
        );
      } else {
        console.error(
          "❌ IA: sourceHandle",
          sourceHandle,
          "sin conexión. Salidas:",
          siguientes.map((c) => ({
            hasta: c.hasta,
            handle: handleConexion(c) || "(sin handle)",
          }))
        );
        siguientes = [];
      }
    } else if (!sourceHandle && siguientes.length === 1) {
      console.log(
        "↪️ IA: una sola salida sin sourceHandle, usando",
        siguientes[0].hasta
      );
    }

    const ids = siguientes.map((s) => s.hasta);

    if (!ids.length) {
      console.log("[FLUJO] Sin siguiente nodo:", nodoId, etiqueta ? "(" + etiqueta + ")" : "");
      if (etiqueta === "ia" || etiqueta === "ia_pro") {
        console.warn("⚠️ Nodo IA sin conexión saliente");
      }
      return;
    }

    if (etiqueta === "ia" || etiqueta === "ia_pro") {
      logConexionesSalientes(nodoId, etiqueta === "ia_pro" ? "IA Pro" : "IA");
      console.log("[IA PATH DEBUG] nodo destino:", ids.join(", "));
      console.log("➡️ SIGUIENTE NODO IA:", ids.join(", "));
    }

    if (etiqueta === "seguimiento") {
      console.log(
        "[FLUJO] Seguimiento CRM — continuando solo por conexiones salientes:",
        ids.join(", ")
      );
    }

    console.log(
      "[FLUJO] Siguiente nodo:",
      ids.join(", "),
      etiqueta ? "| desde " + etiqueta : "| desde " + nodoId
    );

    for (const siguiente of siguientes) {
      const targetId = siguiente.hasta;
      const visitadosSiguiente = new Set(visitados);
      let repeatOk = false;

      if (targetId && esEtiquetaRutaIA(etiqueta) && sourceHandle) {
        if (visitadosSiguiente.has(targetId)) {
          visitadosSiguiente.delete(targetId);
          repeatOk = true;
        }
      } else if (
        targetId &&
        debePermitirRevisitaEnBucleIA(visitadosSiguiente, targetId, nodos)
      ) {
        visitadosSiguiente.delete(targetId);
        repeatOk = true;
      }

      if (repeatOk) {
        console.log("[IA_LOOP_REENTRY_REPEAT_OK]", {
          nodoId: targetId,
          desde: nodoId,
          etiqueta: etiqueta || null,
          sourceHandle: sourceHandle || null,
        });
      }

      await ejecutarNodo(targetId, visitadosSiguiente);
    }
  }

  async function ejecutarNodoConversion(nodo, ctx = {}) {
    const nodoId = nodo?.id || null;
    const { valor, moneda, origen, tipo } = parseConversionFromNodo(nodo);
    const nodeName =
      nodo?.data?.label ||
      nodo?.data?.nombre ||
      (nodo?.html || "").match(/class="conversion-title"[^>]*>([^<]+)/i)?.[1]?.trim() ||
      "Conversión";

    const conexionParaConversion =
      flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null;

    console.log("[CONVERSION] nodo detectado", {
      nodoId,
      flujoId,
      cliente_numero: numero,
      conexion_whatsapp_id: conexionParaConversion,
      valor,
      moneda,
      origen,
      visitados: ctx.visitados ? Array.from(ctx.visitados) : [],
    });

    await registrarConversion({
      usuarioId,
      flujoId,
      nodoId,
      clienteNumero: numero,
      conexionWhatsappId: conexionParaConversion,
      valor,
      moneda,
      origen: origen || "flujo",
      metadata: {
        source: "conversion_node",
        nodeName,
        flujoNombre: opts.flujoNombre || null,
        trigger: "nodo_flujo",
        tipo,
      },
    });
  }

  async function ejecutarNodo(nodoId, visitados = new Set()) {
    if (!nodoId) return;

    if (visitados.has(nodoId)) {
      const nodoBucle = nodos.find((n) => n.id === nodoId);
      if (nodoBucle && esNodoIAReentrable(nodoBucle)) {
        manejarReentradaIALoop({
          nodo: nodoBucle,
          nodoId,
          visitados,
          flowContext,
          usuarioId,
          numero,
          flujoId,
          conexionWhatsappId:
            flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null,
          conexiones,
        });
        return;
      }
      console.log("[IA_LOOP_REENTRY_BLOCKED]", {
        nodoId,
        visitados: Array.from(visitados),
        hayBucleIA: !!hayBucleIAActivo(visitados, nodos),
      });
      console.log("[FLUJO] ⚠ Bucle detectado en nodo:", nodoId);
      return;
    }

    visitados.add(nodoId);

    const nodo = nodos.find((n) => n.id === nodoId);
    if (!nodo) {
      console.log("[FLUJO] Nodo no encontrado:", nodoId);
      return;
    }

    const html = nodo.html || "";
    const tipoNodo = detectarTipoNodo(nodo);
    const tipoRaw = resolverTipoRaw(nodo);
    const esSeguimientoV2 = esNodoSeguimientoV2(nodo);
    const esSeguimientoCRM = !esSeguimientoV2 && nodoEsSeguimientoCRM(nodo);
    const tipoEjecucion = esSeguimientoV2
      ? "seguimiento_crm_v2"
      : esSeguimientoCRM
        ? "seguimiento"
        : tipoNodo;

    if (esSeguimientoCRM && tipoNodo !== "seguimiento") {
      logSeguimientoLegacyBloqueado({
        motivo: "reclasificado_a_seguimiento_crm",
        nodoId,
        tipoDetectado: tipoNodo,
        cliente_numero: numero,
      });
    }

    console.log("🧩 Tipo nodo detectado:", tipoEjecucion, tipoNodo !== tipoEjecucion ? `(raw: ${tipoNodo})` : "");

    console.log("➡️ NODO ACTUAL:", {
      id: nodo.id,
      type: nodo.type,
      tipo: nodo.tipo,
      tipoDetectado: tipoNodo,
      dataType: nodo.data?.type,
      label: nodo.data?.label,
      className: nodo.className,
      tipoRaw: resolverTipoRaw(nodo),
      esIA: esTipoIA(nodo),
    });
    console.log("[FLUJO] Nodo actual:", nodoId, "| tipo:", tipoEjecucion);

    if (tipoEjecucion === "inicio") {
      await continuarASiguientes(nodoId, visitados, "inicio");
      return;
    }

    if (tipoEjecucion === "lector_pago" || tipoRaw === "lector_pago") {
      console.log("[LECTOR_PAGO_V1] entrando nodo (flowService)", {
        nodoId,
        numero,
        flujoId,
      });
      try {
        const resultado = await iniciarEsperaLectorPago({
          usuarioId,
          clienteNumero: numero,
          conexionWhatsappId:
            flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null,
          flujoId,
          nodoId,
          nodo,
        });
        if (!resultado?.ok) {
          console.error(
            "[LECTOR_PAGO_V1] insert error",
            "iniciarEsperaLectorPago no devolvió ok"
          );
          return;
        }
        console.log("[LECTOR_PAGO_V1] nodo listo, estado id:", resultado.estado?.id);
      } catch (err) {
        console.error(
          "[LECTOR_PAGO_V1] insert error",
          err.response?.data || err.message
        );
        return;
      }
      return;
    }

    if (tipoEjecucion === "remarketing_global") {
      console.log("[RM24H] nodo cerebro omitido en ejecución (no avanza lead):", nodoId);
      await continuarASiguientes(nodoId, visitados, "remarketing_global");
      return;
    }

    if (tipoEjecucion === "conversion") {
      await ejecutarNodoConversion(nodo, { visitados });

      if (flujoId && usuarioId) {
        try {
          await cancelarRemarketing24h({
            usuario_id: usuarioId,
            cliente_numero: numero,
            conexion_whatsapp_id:
              flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null,
            flujo_id: String(flujoId),
            motivo: "conversion",
            flujo_nombre: opts.flujoNombre || null,
          });
        } catch (err) {
          console.log(
            "[RM24H] conversión detectada pendiente de conexión:",
            err.response?.data || err.message
          );
        }
      } else {
        console.log("[RM24H] conversión detectada pendiente de conexión (sin flujoId)");
      }

      await continuarASiguientes(nodoId, visitados, "conversion");
      return;
    }

    if (tipoEjecucion === "seguimiento_crm_v2") {
      try {
        const conexionParaSeguimientoV2 = conexionLineaEntrante;

        if (!conexionParaSeguimientoV2) {
          throw new Error(
            "Seguimiento V2 en flujo: falta conexion_whatsapp_id de la línea entrante (webhook)"
          );
        }

        const nodoV2 = esNodoSeguimientoV2Test(nodo)
          ? crearNodoSeguimientoV2Test({ id: nodoId })
          : nodo;

        await programarSeguimientoV2EnFlujo({
          numero,
          usuarioId,
          flujoId,
          nodoId,
          nodo: nodoV2,
          conexionWhatsappId: conexionParaSeguimientoV2,
        });
      } catch (err) {
        console.error(
          "[FLUJO] ✗ Error programando seguimiento V2:",
          err.response?.data || err.message
        );
      }

      console.log("[SEGUIMIENTO_V2_FLUJO_TERMINAL]", {
        nodoId,
        flujoId,
        cliente_numero: numero,
        conexion_whatsapp_id: conexionLineaEntrante ?? null,
        motivo: "sin_continuarASiguientes — envíos solo vía worker V2 (futuro)",
      });
      return;
    }

    if (tipoEjecucion === "seguimiento") {
      const auditLegacy = auditarLegacySeguimientoEnNodo(nodo, nodoId, numero);

      console.log("[SEGUIMIENTO_DEBUG] nodo detectado", {
        nodoId,
        nodoTipo: tipoEjecucion,
        nodoTipoDetectado: tipoNodo,
        nodoNombre: nodo.data?.label || nodo.data?.nombre || nodo.dataset?.nombre || null,
        legacy_en_html: auditLegacy.legacyAcciones.length,
        pasos_programados: auditLegacy.textosPasos.length,
        data: nodo.data,
      });
      console.log("[SEGUIMIENTO] nodo detectado en flujo", {
        nodoId,
        flujoId,
        numero,
      });
      try {
        const conexionParaSeguimiento = conexionLineaEntrante;

        console.log(
          `[FLUJO SEGUIMIENTO CONTEXT] cliente_numero=${numero} conexion_linea_entrante=${conexionLineaEntrante ?? null} (sin fallback flowContext)`
        );

        if (!conexionParaSeguimiento) {
          throw new Error(
            "Seguimiento en flujo: falta conexion_whatsapp_id de la línea entrante (webhook)"
          );
        }

        console.log("[FLUJO_SEGUIMIENTO_PROGRAMAR]", {
          cliente_numero: numero,
          flujo_id: flujoId,
          nodo_id: nodoId,
          conexion_whatsapp_id: conexionParaSeguimiento,
          conexion_linea_entrante: conexionLineaEntrante,
          flow_context_conexion: flowContext.conexionWhatsappId ?? null,
        });

        console.log("[SEGUIMIENTO_LEGACY_USED]", {
          flujo_id: flujoId,
          nodo_id: nodoId,
          usuario_id: usuarioId,
        });

        await ejecutarSeguimientoEnFlujo({
          numero,
          usuarioId,
          flujoId,
          nodoId,
          nodo,
          conexionWhatsappId: conexionParaSeguimiento,
        });
      } catch (err) {
        console.error(
          "[FLUJO] ✗ Error ejecutando seguimiento:",
          err.response?.data || err.message
        );
      }

      console.log("[SEGUIMIENTO_FLUJO_TERMINAL]", {
        nodoId,
        flujoId,
        cliente_numero: numero,
        conexion_whatsapp_id: conexionLineaEntrante ?? null,
        motivo: "sin_continuarASiguientes — envíos solo vía worker blindado",
      });
      return;
    }

    if (tipoEjecucion === "contenido") {
      if (esSeguimientoCRM) {
        logSeguimientoLegacyBloqueado({
          motivo: "nodo_seguimiento_no_ejecuta_contenido_variantes",
          nodoId,
          cliente_numero: numero,
        });
        await continuarASiguientes(nodoId, visitados, "seguimiento");
        return;
      }

      const ejecutado = await ejecutarContenidoNodo(
        numero,
        nodo,
        usuarioId,
        flowContext.conexionWhatsappId,
        { textosReservadosSeguimiento, nodoId }
      );
      if (ejecutado?.ok || ejecutado === true) {
        const ultimoTexto =
          typeof ejecutado === "object" ? ejecutado.ultimoTextoBot : "";
        if (ultimoTexto) {
          flowContext.ultimaSalidaBot = ultimoTexto;
          flowContext.memoriaIA = {
            ultimoMensajeBot: ultimoTexto,
            ultimaPregunta: ultimoTexto,
            ultimoNodo: nodoId,
          };
          flowContext.ultimoNodoContenido = nodoId;
          flowContext.chat_history = appendChatHistory(
            flowContext.chat_history,
            "assistant",
            ultimoTexto
          );
          logChatHistorySource("contenido_nodo_respuesta_bot", flowContext.chat_history);
        }
      }
      await continuarASiguientes(nodoId, visitados, "contenido");
      return;
    }

    if (tipoEjecucion === "openai_agent") {
      const resumeIA = !!opts.iaResume;
      const mensajeLeadOpenAI = resumeIA
        ? opts.mensajeResume ||
          flowContext.ultimo_mensaje ||
          flowContext.ultimoMensaje ||
          ""
        : "";

      console.log("🧭 OPENAI_AGENT bloque flowService", {
        nodoId,
        numero,
        usuarioId,
        resumeIA,
        mensajeLead: mensajeLeadOpenAI,
      });

      logChatHistorySource("flowService_antes_openai_agent", flowContext.chat_history);

      try {
        const mediaOpenAI = optsMediaParaOpenAI(opts);
        flowContext = await ejecutarNodoOpenAIAgent(
          nodo,
          {
            ...flowContext,
            ...mediaOpenAI,
            numero,
            from: numero,
            telefono: numero,
            usuarioId,
            chat_history: flowContext.chat_history || [],
            mensaje: mensajeLeadOpenAI,
            texto: mensajeLeadOpenAI,
            body: mensajeLeadOpenAI,
          },
          {
            resume: resumeIA,
            usuarioId,
            nodoId,
            messageType: opts.messageType || null,
            imageUrl: opts.imageUrl || null,
            imageMetaId: opts.imageMetaId || null,
            metaToken: opts.metaToken || null,
          }
        );
        logChatHistorySource("flowService_despues_openai_agent", flowContext.chat_history);
      } catch (error) {
        console.error("❌ OPENAI_AGENT ERROR", error.message || error);
        flowContext = {
          ...(flowContext || {}),
          openaiAgentPausar: true,
          iaPausar: true,
        };
      }

      if (flowContext.openaiAgentPausar && !resumeIA) {
        const flowContextGuardar = { ...flowContext };
        const ultimoBot =
          flowContextGuardar.ultimaSalidaBot ||
          flowContextGuardar.memoriaIA?.ultimoMensajeBot ||
          "";
        if (ultimoBot) {
          const historialActual = trimChatHistory(flowContextGuardar.chat_history);
          const yaIncluido = historialActual.some(
            (t) => t.role === "assistant" && t.text === ultimoBot
          );
          if (!yaIncluido) {
            flowContextGuardar.chat_history = appendChatHistory(
              historialActual,
              "assistant",
              ultimoBot
            );
          }
        }
        logChatHistorySource(
          "openai_agent_primera_pausa_antes_guardar",
          flowContextGuardar.chat_history
        );
        guardarSesionOpenAIPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext: flowContextGuardar,
        });
        console.log("[FLUJO] Agente OpenAI en espera — nodo:", nodoId);
        return;
      }

      const accionOpenAI = flowContext.openaiAgentAction || null;

      if (resumeIA && accionOpenAI !== "route") {
        const teniaRutasViejas =
          flowContext.openaiAgentRouteId ||
          flowContext.iaRouteId ||
          flowContext.route ||
          flowContext.route_id ||
          flowContext.sourceHandle;
        if (teniaRutasViejas) {
          flowContext = limpiarRutasContexto(flowContext);
          flowContext.openaiAgentAction = accionOpenAI;
        }
      }

      const routeHandle =
        accionOpenAI === "route"
          ? flowContext.openaiAgentRouteId ||
            flowContext.iaRouteId ||
            flowContext.route ||
            null
          : null;

      const debeSeguirEsperandoOpenAI =
        flowContext.openaiAgentPausar || flowContext.openaiPaymentReaderEsperando;

      const debeContinuar =
        resumeIA && accionOpenAI === "route" && !!routeHandle;

      console.log("[OPENAI_ROUTE_DECISION]", {
        action: accionOpenAI || "none",
        routeId: routeHandle,
        debeContinuar,
        debeSeguirEsperando: debeSeguirEsperandoOpenAI,
        nodoId,
        numero,
      });

      if (resumeIA && !debeContinuar && debeSeguirEsperandoOpenAI) {
        logChatHistorySource(
          "openai_agent_respuesta_pausa_antes_guardar",
          flowContext.chat_history
        );
        if (
          accionOpenAI === "reply" ||
          accionOpenAI === "media_library" ||
          !accionOpenAI
        ) {
          console.log("[OPENAI_REPLY_WAIT_ONLY]", {
            action: accionOpenAI || "reply",
            nodoId,
            numero,
          });
        }
        guardarSesionOpenAIPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext,
        });
        console.log("⏸️ Agente OpenAI sigue esperando");
        return;
      }

      if (debeContinuar) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
        logConexionesSalientes(nodoId, "OpenAI");
        await continuarASiguientes(nodoId, visitados, "openai_agent", routeHandle);
        return;
      }

      if (resumeIA && !debeSeguirEsperandoOpenAI) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
      }
      return;
    }

    if (tipoEjecucion === "ia_pro") {
      const resumeIA = !!opts.iaResume;

      flowContext = await ejecutarNodoIAPro(
        nodo,
        {
          ...flowContext,
          numero,
          from: numero,
          telefono: numero,
          usuarioId,
          chat_history: flowContext.chat_history || [],
          mensaje: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
          texto: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
          body: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
        },
        { resume: resumeIA }
      );

      if (flowContext.iaProPausar && !resumeIA) {
        guardarSesionIAPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext: {
            ...flowContext,
            ultimo_mensaje: "",
          },
        });
        console.log("[FLUJO] IA Pro en espera — nodo:", nodoId);
        return;
      }

      const routeHandle =
        flowContext.iaProRouteId ||
        flowContext.iaRouteId ||
        flowContext.route ||
        null;

      if (flowContext.iaProPausar && resumeIA && !routeHandle) {
        guardarSesionIAPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext: {
            ...flowContext,
            ultimo_mensaje: "",
          },
        });
        console.log("⏸️ IA PRO sigue esperando");
        return;
      }

      if (resumeIA && routeHandle) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
        logConexionesSalientes(nodoId, "IA Pro");
        await continuarASiguientes(nodoId, visitados, "ia_pro", routeHandle);
        return;
      }

      if (resumeIA) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
      }
      return;
    }

    if (tipoEjecucion === "ia" || esTipoIA(nodo)) {
      console.log("⚡ AGENTE RAPIDO intacto");
      const configIA = parseIAFromNodo(nodo);
      const esRouter = esConfigRouterLocal(configIA);
      const resumeIA = !!opts.iaResume;

      flowContext = await ejecutarNodoIA(
        nodo,
        {
          ...flowContext,
          numero,
          from: numero,
          telefono: numero,
          usuarioId,
          mensaje: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
          texto: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
          body: resumeIA
            ? opts.mensajeResume ||
              flowContext.ultimo_mensaje ||
              flowContext.ultimoMensaje ||
              ""
            : "",
          _buscarActivadores: resumeIA
            ? () =>
                buscarYEjecutarActivador(
                  numero,
                  opts.mensajeResume || flowContext.ultimo_mensaje || "",
                  usuarioId,
                  null,
                  flowContext.conexionWhatsappId || opts.conexionWhatsappId || null
                )
            : null,
        },
        { resume: resumeIA }
      );

      if (esRouter && flowContext.iaPausar && !resumeIA) {
        guardarSesionIAPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext: {
            ...flowContext,
            ultimo_mensaje: "",
          },
        });
        console.log("[FLUJO] IA en espera silenciosa — nodo:", nodoId);
        return;
      }

      const routeHandle =
        flowContext.iaRouteId ||
        flowContext.route ||
        flowContext.route_id ||
        null;

      console.log("🤖 IA ROUTE DETECTADA:", routeHandle);

      if (esRouter && flowContext.iaPausar && resumeIA && !routeHandle) {
        guardarSesionIAPendiente({
          usuarioId,
          conexionWhatsappId: flowContext.conexionWhatsappId,
          numero,
          flujoId,
          nodoId,
          visitados: Array.from(visitados),
          flowContext: {
            ...flowContext,
            ultimo_mensaje: "",
          },
        });
        console.log("[FLUJO] IA sigue en espera (sin ruta detectada)");
        return;
      }

      if (esRouter && resumeIA) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
      }

      logConexionesSalientes(nodoId, "IA");

      if (esRouter && resumeIA && routeHandle) {
        await continuarASiguientes(nodoId, visitados, "ia", routeHandle);
        return;
      }

      if (esRouter && resumeIA) {
        await continuarASiguientes(nodoId, visitados, "ia");
        return;
      }

      await continuarASiguientes(nodoId, visitados, "ia");
      return;
    }

    if (esSeguimientoCRM || htmlTieneSeguimientoCRM(html)) {
      auditarLegacySeguimientoEnNodo(nodo, nodoId, numero);
      logSeguimientoLegacyBloqueado({
        motivo: "parser_generico_omitido_en_nodo_seguimiento_crm",
        nodoId,
        cliente_numero: numero,
        tipoDetectado: tipoNodo,
      });
      await continuarASiguientes(nodoId, visitados, "seguimiento");
      return;
    }

    if (htmlPareceSeguimientoLegacyProgramado(html)) {
      console.log("[SEG_BLOCK_FLOW_LEGACY_PARSER]", {
        nodoId,
        cliente_numero: numero,
        motivo: "html_con_pasos_tiempo_texto — no envío síncrono; usar worker CRM",
      });
      await continuarASiguientes(nodoId, visitados, tipoEjecucion);
      return;
    }

    const acciones = extraerAccionesLegacyHtml(html);

    for (const accion of acciones) {
      console.log("✅ ACCION DETECTADA:", accion.tipo, accion.valor);
    }

    console.log("📦 TODAS LAS ACCIONES DEL NODO:", acciones);

    for (const accion of acciones) {
      if (esValorLegacyReservadoSeguimiento(accion.valor, textosReservadosSeguimiento)) {
        logSeguimientoLegacyBloqueado({
          motivo: "texto_reservado_seguimiento_en_parser_generico",
          nodoId,
          cliente_numero: numero,
          tipo: accion.tipo,
          valor: accion.valor,
          tipoDetectado: tipoNodo,
        });
        continue;
      }

      if (accion.tipo === "texto") {
        console.log("📤 MENSAJE ENVIADO (nodo):", accion.valor);
        await enviarTextoFlujoSeguro(numero, accion.valor, opEnvioNodo(), {
          fase: "parser_generico_texto",
          nodoId,
        });
      }

      if (accion.tipo === "tiempo") {
        const segundos = parseInt(accion.valor, 10);

        if (!isNaN(segundos) && segundos > 0) {
          await esperarSegundos(segundos);
        }
      }

      if (accion.tipo === "imagen") {
        const partes = accion.valor.split("||");
        const urlImagen = partes[0].trim();
        const captionImagen = partes[1] ? partes[1].trim() : "";

        await enviarMediaFlujoSeguro(numero, "image", urlImagen, captionImagen, opEnvioNodo(), {
          fase: "parser_generico_imagen",
          nodoId,
        });
      }

      if (accion.tipo === "audio") {
        console.log("🎧 Nodo audio detectado:", accion.valor);

        await enviarMediaFlujoSeguro(numero, "audio", accion.valor, "", opEnvioNodo(), {
          fase: "parser_generico_audio",
          nodoId,
        });
      }

      if (accion.tipo === "video") {
        const partes = accion.valor.split("||");
        const urlVideo = partes[0].trim();
        const captionVideo = partes[1] ? partes[1].trim() : "";

        await enviarMediaFlujoSeguro(numero, "video", urlVideo, captionVideo, opEnvioNodo(), {
          fase: "parser_generico_video",
          nodoId,
        });
      }

      if (accion.tipo === "doc") {
        console.log("📄 Nodo documento detectado:", accion.valor);

        await enviarMediaFlujoSeguro(numero, "document", accion.valor, "", opEnvioNodo(), {
          fase: "parser_generico_doc",
          nodoId,
        });
      }
    }

    if (html.includes("⏳ Espera")) {
      const matchEspera = html.match(/<input[^>]*value="([^"]*)"/i);
      const segundos = matchEspera ? parseInt(matchEspera[1], 10) : 0;

      if (!isNaN(segundos) && segundos > 0) {
        await esperarSegundos(segundos);
      }
    }

    if (html.includes("🏷️ Etiqueta")) {
      let etiqueta = "";

      const matchSelect = html.match(/<option[^>]*value="([^"]*)"[^>]*selected/i);
      const matchInput = html.match(/<input[^>]*value="([^"]*)"/i);

      if (matchSelect) {
        etiqueta = matchSelect[1].trim();
      } else if (matchInput) {
        etiqueta = matchInput[1].trim();
      }

      if (etiqueta) {
        const conexionParaEtiqueta =
          flowContext.conexionWhatsappId ?? conexionLineaEntrante ?? null;
        await agregarEtiquetaCliente(
          numero,
          etiqueta,
          usuarioId,
          conexionParaEtiqueta
        );
      }
    }

    await continuarASiguientes(nodoId, visitados, tipoEjecucion);
  }

  if (opts.lectorContinuarDesdeNodoId) {
    const visitadosLector = new Set(opts.visitadosLector || []);
    visitadosLector.add(opts.lectorContinuarDesdeNodoId);
    console.log(
      "[LECTOR_PAGO_V1] continuando al siguiente nodo",
      opts.lectorContinuarDesdeNodoId
    );
    await continuarASiguientes(
      opts.lectorContinuarDesdeNodoId,
      visitadosLector,
      "lector_pago"
    );
    return;
  }

  if (opts.iaResume && opts.nodoResumeId) {
    const visitadosResume = new Set(opts.visitadosResume || []);
    visitadosResume.delete(opts.nodoResumeId);
    console.log(
      "[FLUJO] Reanudar IA en nodo",
      opts.nodoResumeId,
      "| visitados:",
      Array.from(visitadosResume)
    );
    await ejecutarNodo(opts.nodoResumeId, visitadosResume);
    return;
  }

  await ejecutarNodo("nodo_inicio");
}

async function continuarFlujoDesdeLectorPago(numero, usuarioId, resultado) {
  const flujoId = resultado?.flujoId;
  const nodoId = resultado?.nodoId;
  if (!flujoId || !nodoId) {
    console.log("[LECTOR_PAGO_V1] sin flujo/nodo para continuar");
    return false;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) return false;

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flujoId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);
  if (!flujo || !flujoDatos) return false;

  if (!flujoEstaActivo(flujo)) return false;

  const conexionReanudar =
    resultado?.conexionWhatsappId != null &&
    String(resultado.conexionWhatsappId).trim() !== ""
      ? String(resultado.conexionWhatsappId).trim()
      : null;

  await ejecutarFlujo(numero, flujoDatos, usuarioId, flujo.id, {
    lectorContinuarDesdeNodoId: nodoId,
    visitadosLector: [nodoId],
    flujoNombre: flujo.nombre || null,
    conexionWhatsappId: conexionReanudar,
  });

  return true;
}

async function reanudarFlujoIAPendiente(
  numero,
  mensaje,
  usuarioId,
  conexionWhatsappId,
  resumeOpts = {}
) {
  logFlowKey(usuarioId, conexionWhatsappId, numero);

  if (!conexionWhatsappId) {
    console.log("[FLUJO] reanudar IA omitido — sin conexionWhatsappId");
    return false;
  }

  const sesion = obtenerSesionIAPendiente(usuarioId, conexionWhatsappId, numero);
  if (!sesion?.flujoId || !sesion?.nodoId) return false;

  if (!SUPABASE_URL || !SUPABASE_KEY) return false;

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${sesion.flujoId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);
  if (!flujo || !flujoDatos) {
    limpiarSesionIAPendiente(usuarioId, conexionWhatsappId, numero);
    return false;
  }

  if (!flujoEstaActivo(flujo)) {
    limpiarSesionIAPendiente(usuarioId, conexionWhatsappId, numero);
    return false;
  }

  const nodoPendiente = flujoDatos.nodos?.find((n) => n.id === sesion.nodoId);
  const tipoPendiente = nodoPendiente ? detectarTipoNodo(nodoPendiente) : "?";

  console.log("[FLUJO] Reanudando IA pendiente | nodo:", sesion.nodoId, "| tipo:", tipoPendiente);
  logChatHistorySource("reanudar_sesion_cargada", sesion.flowContext?.chat_history);

  const sesionConexion =
    conexionWhatsappId ||
    sesion.conexionWhatsappId ||
    sesion.flowContext?.conexionWhatsappId ||
    null;

  const mediaResume = extraerMediaEntrante(resumeOpts) || {};
  await ejecutarFlujo(numero, flujoDatos, usuarioId, sesion.flujoId, {
    iaResume: true,
    nodoResumeId: sesion.nodoId,
    visitadosResume: new Set(sesion.visitados || []),
    flowContextResume: {
      ...(sesion.flowContext || {}),
      conexionWhatsappId: sesionConexion,
      ultimo_mensaje: mensaje,
      ultimoMensaje: mensaje,
      ...mediaResume,
    },
    mensajeResume: mensaje,
    conexionWhatsappId: sesionConexion,
    ...mediaResume,
  });

  return true;
}

const mensajesEntrantesProcesados = new Map();
const DEDUPE_MS = 120000;

function mensajeEntranteYaProcesado(messageId) {
  if (!messageId) return false;
  const ahora = Date.now();
  if (mensajesEntrantesProcesados.has(messageId)) return true;
  mensajesEntrantesProcesados.set(messageId, ahora);
  for (const [id, ts] of mensajesEntrantesProcesados) {
    if (ahora - ts > DEDUPE_MS) mensajesEntrantesProcesados.delete(id);
  }
  return false;
}

async function procesarMensajeEntrante(
  numero,
  texto,
  usuarioId,
  messageId,
  opts = {}
) {
  console.log("[FLOW SERVICE ENTRANTE]", {
    numero,
    usuarioId,
    texto: String(texto || "").slice(0, 80),
    messageId: messageId || null,
  });
  console.log("[FLUJO] procesarMensajeEntrante", {
    numero,
    usuarioId,
    conexionWhatsappId: opts.conexionWhatsappId || null,
    texto: String(texto || "").slice(0, 60),
    messageId: messageId || null,
  });

  logFlowKey(usuarioId, opts.conexionWhatsappId || null, numero);

  if (mensajeEntranteYaProcesado(messageId)) {
    console.log("[FLUJO] mensaje duplicado ignorado (webhook):", messageId);
    return true;
  }

  const textoDebug = String(texto || "").trim();

  if (esComandoResetFlujo(texto)) {
    await resetearFlujoLead(numero, usuarioId, opts.conexionWhatsappId || null);
    return true;
  }

  const conexionEntranteGuard = opts.conexionWhatsappId || null;
  const guardPausa = await manejarGuardPausaBot({
    usuarioId,
    clienteNumero: numero,
    conexionWhatsappId: conexionEntranteGuard,
    texto: textoDebug,
    origen: "flowService",
  });
  if (!guardPausa.continuar) {
    return true;
  }

  if (opts?.messageType === "image") {
    const lecturaPago = await procesarImagenLectorPago({
      usuarioId,
      clienteNumero: numero,
      conexionWhatsappId: opts.conexionWhatsappId || null,
      imageMetaId: opts.imageMetaId || null,
      metaToken: opts.metaToken || null,
      imagePublicUrl: opts.imageUrl || null,
    });

    if (lecturaPago?.handled) {
      if (!lecturaPago.enviadoPorServicio && lecturaPago.mensaje) {
        const conexionEnvio =
          lecturaPago.conexionWhatsappId || opts.conexionWhatsappId || null;
        const opEnvio = { usuarioId };
        if (conexionEnvio) {
          opEnvio.conexionWhatsappId = conexionEnvio;
          opEnvio.strictConexionWhatsappId = true;
        }
        await enviarTextoWhatsApp(numero, lecturaPago.mensaje, opEnvio);
      }
      if (lecturaPago.valido && lecturaPago.continuarFlujoRm) {
        await continuarMiniFlujoRmTrasPagoValido({
          rm24hId: lecturaPago.rm24h_id,
          usuarioId,
          clienteNumero: numero,
          conexionWhatsappId:
            lecturaPago.conexionWhatsappId || opts.conexionWhatsappId || null,
        });
      } else if (lecturaPago.valido && lecturaPago.continuarFlujo) {
        await continuarFlujoDesdeLectorPago(numero, usuarioId, lecturaPago);
      }
      return true;
    }
  }

  const reanudado = await reanudarFlujoIAPendiente(
    numero,
    texto,
    usuarioId,
    opts.conexionWhatsappId || null,
    {
      messageType: opts.messageType || null,
      imageUrl: opts.imageUrl || null,
      imageMetaId: opts.imageMetaId || null,
      metaToken: opts.metaToken || null,
    }
  );
  if (reanudado) {
    console.log("[FLUJO] reanudado IA/OpenAI pendiente OK");
    return true;
  }

  const conexionEntrante = opts.conexionWhatsappId || null;
  let rmContext = null;
  try {
    rmContext = await obtenerContextoRemarketingPostEnvio({
      usuarioId,
      clienteNumero: numero,
      conexionWhatsappId: conexionEntrante,
    });
    if (rmContext?.fila?.id) {
      const policyMode = rmContext.policy?.mode;

      if (policyMode === "allow_normal_triggers") {
        console.log(
          "[RM_CONTEXT] allow_normal_triggers: intentando activador normal",
          {
            lead: numero,
            usuario: usuarioId,
            conexion_whatsapp_id: conexionEntrante,
            rm24h_id: rmContext.fila.id,
            flujo_id: rmContext.flujo_id,
            texto: textoDebug.slice(0, 80),
          }
        );

        const activadorPrioritario = await buscarYEjecutarActivador(
          numero,
          texto,
          usuarioId,
          messageId,
          opts.conexionWhatsappId || null
        );

        if (activadorPrioritario) {
          try {
            const filaInvalidada = await repoRm24h.invalidarPostEnvioPorResetbot({
              usuario_id: usuarioId,
              cliente_numero: numero,
              conexion_whatsapp_id: opts.conexionWhatsappId ?? null,
            });
            console.log("[RM_CONTEXT] activador normal encontrado, cerrando RM", {
              rm24h_id: filaInvalidada?.id || rmContext.fila.id,
              lead: numero,
              usuario: usuarioId,
              conexion_whatsapp_id: opts.conexionWhatsappId ?? null,
            });
          } catch (errInv) {
            console.log(
              "[RM_CONTEXT] error cerrando contexto RM tras activador normal:",
              errInv.response?.data || errInv.message
            );
          }
          return true;
        }

        console.log(
          "[RM_CONTEXT] sin activador normal, procesando mini flujo RM",
          {
            lead: numero,
            usuario: usuarioId,
            conexion_whatsapp_id: conexionEntrante,
            rm24h_id: rmContext.fila.id,
            flujo_id: rmContext.flujo_id,
            texto: textoDebug.slice(0, 80),
          }
        );
        await procesarRespuestaRemarketing({
          numero,
          texto,
          usuarioId,
          conexionWhatsappId: conexionEntrante,
          fila: rmContext.fila,
          policy: rmContext.policy,
        });
        return true;
      }

      if (
        rmContext.policy?.mode === "time_window" &&
        !rmContext.bloquearActivadores
      ) {
        console.log(
          "[RM_CONTEXT] time_window expired: continuando a activador normal",
          {
            lead: numero,
            usuario: usuarioId,
            conexion_whatsapp_id: conexionEntrante,
            rm24h_id: rmContext.fila.id,
            flujo_id: rmContext.flujo_id,
            disparado_en: rmContext.disparado_en,
            duration: rmContext.policy?.duration,
          }
        );
      } else if (rmContext.bloquearActivadores) {
        console.log("[RM_CONTEXT] Lead en remarketing, bloqueando activadores normales", {
          lead: numero,
          usuario: usuarioId,
          conexion_whatsapp_id: conexionEntrante,
          rm24h_id: rmContext.fila?.id,
          flujo_id: rmContext.flujo_id,
          policy_mode: rmContext.policy?.mode,
          disparado_en: rmContext.disparado_en,
        });
        await procesarRespuestaRemarketing({
          numero,
          texto,
          usuarioId,
          conexionWhatsappId: conexionEntrante,
          fila: rmContext.fila,
          policy: rmContext.policy,
        });
        return true;
      }
    }
  } catch (err) {
    console.log(
      "[RM_CONTEXT] error evaluando contexto post-envío:",
      err.response?.data || err.message
    );
  }

  console.log("[FLUJO] sin sesión IA pendiente → buscar activador");
  const activadorEjecutado = await buscarYEjecutarActivador(
    numero,
    texto,
    usuarioId,
    messageId,
    opts.conexionWhatsappId || null
  );
  if (!activadorEjecutado && usuarioId && numero) {
    try {
      await resetearRemarketing24h({
        usuario_id: usuarioId,
        cliente_numero: numero,
        conexion_whatsapp_id: opts.conexionWhatsappId ?? null,
      });
    } catch (err) {
      console.log("[RM24H] error al resetear por respuesta:", err.response?.data || err.message);
    }
  }

  return activadorEjecutado;
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

const {
  TIPOS,
  resolveTipo,
  matchActivador,
  sortActivadores,
  sameConexionId,
} = require("./activadorUtils");
function normalizarTextoActivador(texto) {
  return String(texto || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function obtenerDatosFlujo(flujo) {
  if (!flujo) return null;
  return flujo.data || flujo.datos || null;
}

function flujoEstaActivo(flujo) {
  const datos = obtenerDatosFlujo(flujo);
  if (!datos) return false;
  const meta = datos.macbot_meta;
  if (meta && typeof meta.estado === "string") {
    return meta.estado === "activo";
  }
  return Array.isArray(datos.nodos) && datos.nodos.length > 0;
}

async function registrarUsoActivador(activador) {
  const veces = (Number(activador.veces_usado) || 0) + 1;
  const ahora = new Date().toISOString();
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/activadores?id=eq.${activador.id}`,
      { veces_usado: veces, ultima_ejecucion: ahora },
      {
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
      }
    );
  } catch (e) {
    // Columnas extendidas pueden no existir aún
  }
}

async function cargarActivadoresActivos(usuarioId, conexionWhatsappId) {
  const connEnc = encodeURIComponent(conexionWhatsappId);
  try {
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,prioridad,coincidencia,veces_usado,repetible,tipo_activador,palabras_clave_array,conexion_whatsapp_id&activo=eq.true&usuario_id=eq.${usuarioId}&conexion_whatsapp_id=eq.${connEnc}`,
      { headers: supabaseHeaders() }
    );
    const lista = responseActivadores.data || [];
    const testbEnLinea = lista.filter((a) =>
      String(a.frase || "")
        .toLowerCase()
        .includes("testb")
    );
    if (testbEnLinea.length) {
      console.log("[ACTIVADOR_TESTB_EN_LINEA]", {
        conexion_whatsapp_id: conexionWhatsappId,
        total_activadores_linea: lista.length,
        activadores_testb: testbEnLinea.map((a) => ({
          id: a.id,
          frase: a.frase,
          flujo_id: a.flujo_id,
          conexion_whatsapp_id: a.conexion_whatsapp_id ?? null,
        })),
      });
    }
    return lista;
  } catch (e) {
    console.log(
      "[ACTIVADOR] fallback sin columnas extendidas:",
      e.response?.data?.message || e.message
    );
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,repetible,conexion_whatsapp_id&activo=eq.true&usuario_id=eq.${usuarioId}&conexion_whatsapp_id=eq.${connEnc}`,
      { headers: supabaseHeaders() }
    );
    return (responseActivadores.data || []).map((a) => ({
      ...a,
      prioridad: 0,
      coincidencia: "contiene",
      veces_usado: 0,
      tipo_activador: "palabra_unica",
      palabras_clave_array: [],
    }));
  }
}

async function resolverActivadorEntrante(
  textoCliente,
  usuarioId,
  conexionWhatsappId,
  opts = {}
) {
  if (!textoCliente || !usuarioId || !conexionWhatsappId) return null;

  const textoNorm = normalizarTextoActivador(textoCliente);
  if (!textoNorm) return null;

  const activadores = await cargarActivadoresActivos(usuarioId, conexionWhatsappId);
  if (!activadores.length) return null;

  const ordenados = sortActivadores(activadores);
  let activador = null;
  let matchInfo = null;

  for (const a of ordenados) {
    if (opts.excluirCualquierMensaje && resolveTipo(a) === TIPOS.CUALQUIER) {
      continue;
    }
    const result = matchActivador(textoNorm, a);
    if (result.matched) {
      activador = a;
      matchInfo = result;
      break;
    }
  }

  if (!activador || !matchInfo) return null;

  console.log("[ACTIVADOR_MATCH_TRACE]", {
    texto_norm: textoNorm,
    activador_id: activador.id,
    frase: activador.frase,
    activador_conexion_whatsapp_id: activador.conexion_whatsapp_id ?? null,
    conexion_entrante: conexionWhatsappId,
    flujo_id: activador.flujo_id,
    tipo_match: matchInfo.tipo,
  });

  const flowId = activador.flujo_id;
  if (!flowId || flowId === "undefined" || flowId === "null") return null;

  if (
    activador.conexion_whatsapp_id &&
    !sameConexionId(activador.conexion_whatsapp_id, conexionWhatsappId)
  ) {
    return null;
  }

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flowId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);

  if (!flujo || !flujoDatos) return null;

  if (
    conexionWhatsappId &&
    (!flujo.conexion_whatsapp_id ||
      !sameConexionId(flujo.conexion_whatsapp_id, conexionWhatsappId))
  ) {
    return null;
  }

  if (!flujoEstaActivo(flujo)) return null;

  return { activador, matchInfo, flujo, flujoDatos, flowId };
}

async function buscarActivadorValido(textoCliente, usuarioId, conexionWhatsappId) {
  const resolved = await resolverActivadorEntrante(
    textoCliente,
    usuarioId,
    conexionWhatsappId,
    { excluirCualquierMensaje: true }
  );
  return resolved?.activador || null;
}

async function manejarGuardPausaBot({
  usuarioId,
  clienteNumero,
  conexionWhatsappId,
  texto,
  origen = "flowService",
}) {
  if (!conexionWhatsappId) return { continuar: true };

  const pausado = await estaBotPausado({
    usuarioId,
    clienteNumero,
    conexionWhatsappId,
  });
  if (!pausado) return { continuar: true };

  const activador = await buscarActivadorValido(
    texto,
    usuarioId,
    conexionWhatsappId
  );
  if (!activador) {
    console.log("[BOT_PAUSE] automatizacion omitida por pausa", {
      usuario_id: usuarioId,
      cliente_numero: clienteNumero,
      conexion_whatsapp_id: conexionWhatsappId,
      origen,
    });
    return { continuar: false };
  }

  await reactivarBotConversacion({
    usuarioId,
    clienteNumero,
    conexionWhatsappId,
  });
  console.log("[BOT_PAUSE] reactivado por activador", {
    usuario_id: usuarioId,
    cliente_numero: clienteNumero,
    conexion_whatsapp_id: conexionWhatsappId,
    activador_id: activador.id,
    origen,
  });
  return { continuar: true, reactivado: true };
}

async function buscarYEjecutarActivador(
  numero,
  textoCliente,
  usuarioId = null,
  messageId = null,
  conexionWhatsappId = null
) {
  if (!textoCliente || !usuarioId) {
    console.log("⚠️ ACTIVADOR — omitido (sin texto o sin usuario_id):", {
      texto: textoCliente,
      usuarioId,
    });
    return false;
  }

  if (!conexionWhatsappId) {
    console.log("⚠️ ACTIVADOR — omitido (sin conexion_whatsapp_id):", { usuarioId, numero });
    return false;
  }

  const textoNorm = normalizarTextoActivador(textoCliente);
  if (!textoNorm) return false;

  console.log(
    "🔎 BUSCANDO ACTIVADOR:",
    textoNorm,
    "| numero:",
    numero,
    "| usuario:",
    usuarioId,
    "| conexion:",
    conexionWhatsappId
  );

  const resolved = await resolverActivadorEntrante(
    textoCliente,
    usuarioId,
    conexionWhatsappId
  );
  if (!resolved) {
    console.log("⚠️ ACTIVADOR — no encontrado para texto:", textoNorm);
    return false;
  }

  const { activador, matchInfo, flujo, flujoDatos, flowId } = resolved;

  console.log("✅ ACTIVADOR ENCONTRADO:", {
    id: activador.id,
    frase: activador.frase,
    flujo_id: activador.flujo_id,
    tipo: matchInfo.tipo,
    detalle: matchInfo.detalle,
  });

  if (matchInfo.tipo === TIPOS.CUALQUIER) {
    console.log(
      "[ACTIVADOR] tipo: cualquier_mensaje",
      "| usuario:",
      usuarioId,
      messageId ? `| msg:${messageId}` : ""
    );
  } else if (matchInfo.tipo === TIPOS.MULTIPLES) {
    console.log(
      "[ACTIVADOR] coincidencia múltiple encontrada:",
      matchInfo.detalle,
      "| usuario:",
      usuarioId,
      messageId ? `| msg:${messageId}` : ""
    );
  } else {
    console.log(
      "[ACTIVADOR] palabra detectada:",
      matchInfo.detalle || activador.frase,
      "| usuario:",
      usuarioId,
      messageId ? `| msg:${messageId}` : ""
    );
  }

  console.log("✅ FLUJO ENCONTRADO:", flujo.nombre || "—", "| id:", flujo.id);

  await ejecutarFlujo(numero, flujoDatos, usuarioId, flujo.id, {
    ultimoMensaje: textoCliente,
    flujoNombre: flujo.nombre || null,
    conexionWhatsappId: conexionWhatsappId || null,
  });
  await registrarUsoActivador(activador);

  return true;
}

module.exports = {
  agregarEtiquetaCliente,
  ejecutarFlujo,
  buscarYEjecutarActivador,
  buscarActivadorValido,
  manejarGuardPausaBot,
  procesarMensajeEntrante,
  reanudarFlujoIAPendiente,
  registrarConversion,
};