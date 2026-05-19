const axios = require("axios");

const { enviarTextoWhatsApp, enviarMediaWhatsApp } = require("./whatsappService");
const { esperarSegundos } = require("../utils/timers");
const { detectarTipoNodo } = require("./seguimiento/detectarTipoNodo");
const { ejecutarSeguimientoEnFlujo } = require("./seguimiento/ejecutarSeguimientoEnFlujo");
const {
  registrarConversion,
  parseConversionFromNodo,
} = require("./conversionService");
const {
  ejecutarNodoIA,
  enriquecerContextoFlujo,
} = require("./aiService");
const { esTipoIA, resolverTipoRaw } = require("./seguimiento/detectarTipoNodo");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function agregarEtiquetaCliente(numero, etiqueta, usuarioId = null) {
  if (!numero || !etiqueta) return;

  const etiquetaLimpia = etiqueta.trim();

  await axios.delete(
    `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${numero}&usuario_id=eq.${usuarioId}`,
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
  etiqueta: etiquetaLimpia,
  usuario_id: usuarioId
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

    const key = desde + "->" + hasta;
    if (vistos.has(key)) return;
    vistos.add(key);

    lista.push({ desde, hasta });
  });

  return lista;
}

function obtenerSiguientesNodos(conexiones, nodoId) {
  return conexiones.filter((c) => c.desde === nodoId);
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

async function ejecutarBloqueContenido(numero, bloque, usuarioId) {
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
      return;
    }
    await enviarTextoWhatsApp(numero, mensaje, { usuarioId });
    console.log("✅ TEXTO ENVIADO");
    return;
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

  const media = urlMediaBloque(bloque);
  if (!media) {
    console.log("⚠️ MEDIA SIN URL, SE OMITE:", tipo);
    return;
  }

  if (tipo.includes("imagen") || tipo === "image") {
    const enviado = await enviarMediaWhatsApp(numero, "image", media, captionMediaBloque(bloque), {
      usuarioId,
    });
    if (enviado) console.log("✅ IMAGEN ENVIADA");
    else console.log("❌ IMAGEN NO ENVIADA (Meta o URL inválida)");
    return;
  }

  if (tipo.includes("video")) {
    const enviado = await enviarMediaWhatsApp(numero, "video", media, captionMediaBloque(bloque), {
      usuarioId,
    });
    if (enviado) console.log("✅ VIDEO ENVIADO");
    else console.log("❌ VIDEO NO ENVIADO (Meta o URL inválida)");
    return;
  }

  if (tipo.includes("audio")) {
    const enviado = await enviarMediaWhatsApp(numero, "audio", media, "", { usuarioId });
    if (enviado) console.log("✅ AUDIO ENVIADO");
    else console.log("❌ AUDIO NO ENVIADO (Meta o URL inválida)");
    return;
  }

  if (tipo.includes("pdf") || tipo.includes("doc") || tipo === "document") {
    const enviado = await enviarMediaWhatsApp(numero, "document", media, captionMediaBloque(bloque), {
      usuarioId,
      filename: bloque.nombre || bloque.filename || "archivo.pdf",
    });
    if (enviado) console.log("✅ PDF ENVIADO");
    else console.log("❌ PDF NO ENVIADO (Meta o URL inválida)");
    return;
  }

  console.log("⚠️ TIPO DE BLOQUE NO RECONOCIDO:", tipo);
}

async function ejecutarContenidoNodo(numero, nodo, usuarioId) {
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

    for (const bloque of bloques) {
      console.log("📦 BLOQUE ACTUAL:", bloque);
      await ejecutarBloqueContenido(numero, bloque, usuarioId);
    }

    return true;
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

  let flowContext = {
    numero,
    telefono: numero,
    nombre: opts.nombre || "",
    ultimo_mensaje: opts.ultimoMensaje || opts.ultimo_mensaje || "",
    intent: "",
    score: "",
    ai: {},
  };

  await enriquecerContextoFlujo(flowContext, numero, usuarioId);

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
    if (!salientes.length && (etiqueta === "ia" || etiqueta === "IA")) {
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

  async function continuarASiguientes(nodoId, visitados, etiqueta) {
    const siguientes = obtenerSiguientesNodos(conexiones, nodoId);
    const ids = siguientes.map((s) => s.hasta);

    if (!ids.length) {
      console.log("[FLUJO] Sin siguiente nodo:", nodoId, etiqueta ? "(" + etiqueta + ")" : "");
      if (etiqueta === "ia") {
        console.warn("⚠️ Nodo IA sin conexión saliente");
      }
      return;
    }

    if (etiqueta === "ia") {
      logConexionesSalientes(nodoId, "IA");
    }

    console.log(
      "[FLUJO] Siguiente nodo:",
      ids.join(", "),
      etiqueta ? "| desde " + etiqueta : "| desde " + nodoId
    );

    for (const siguiente of siguientes) {
      await ejecutarNodo(siguiente.hasta, new Set(visitados));
    }
  }

  async function ejecutarNodo(nodoId, visitados = new Set()) {
    if (!nodoId) return;

    if (visitados.has(nodoId)) {
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
    console.log("[FLUJO] Nodo actual:", nodoId, "| tipo:", tipoNodo);

    if (tipoNodo === "inicio") {
      await continuarASiguientes(nodoId, visitados, "inicio");
      return;
    }

    if (tipoNodo === "conversion") {
      const { valor, moneda, origen } = parseConversionFromNodo(nodo);
      await registrarConversion({
        usuarioId,
        flujoId,
        nodoId,
        clienteNumero: numero,
        valor,
        moneda,
        origen,
        metadata: { trigger: "nodo_flujo" },
      });

      await continuarASiguientes(nodoId, visitados, "conversion");
      return;
    }

    if (tipoNodo === "seguimiento") {
      try {
        await ejecutarSeguimientoEnFlujo({
          numero,
          usuarioId,
          flujoId,
          nodoId,
          nodo,
        });
      } catch (err) {
        console.error(
          "[FLUJO] ✗ Error ejecutando seguimiento:",
          err.response?.data || err.message
        );
      }

      await continuarASiguientes(nodoId, visitados, "seguimiento");
      return;
    }

    if (tipoNodo === "contenido") {
      const ejecutado = await ejecutarContenidoNodo(numero, nodo, usuarioId);
      if (ejecutado) {
        await continuarASiguientes(nodoId, visitados, "contenido");
        return;
      }
    }

    if (tipoNodo === "ia" || esTipoIA(nodo)) {
      flowContext = await ejecutarNodoIA(nodo, {
        ...flowContext,
        numero,
        from: numero,
        telefono: numero,
        usuarioId,
        mensaje: flowContext.ultimo_mensaje || flowContext.ultimoMensaje || "",
        texto: flowContext.ultimo_mensaje || flowContext.ultimoMensaje || "",
        body: flowContext.ultimo_mensaje || flowContext.ultimoMensaje || "",
      });
      logConexionesSalientes(nodoId, "IA");
      await continuarASiguientes(nodoId, visitados, "ia");
      return;
    }

const acciones = [];

const regex = /<p[^>]*>\s*(texto|tiempo|imagen|audio|video|doc):\s*([\s\S]*?)<\/p>/gi;
let match;

while ((match = regex.exec(html)) !== null) {
  const tipoAccion = match[1].trim().toLowerCase();

  let valorAccion = match[2]
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();

  console.log("✅ ACCION DETECTADA:", tipoAccion, valorAccion);

  acciones.push({
    tipo: tipoAccion,
    valor: valorAccion
  });
}

console.log("📦 TODAS LAS ACCIONES DEL NODO:", acciones);

    for (const accion of acciones) {
      if (accion.tipo === "texto") {
        console.log("📤 MENSAJE ENVIADO (nodo):", accion.valor);
        await enviarTextoWhatsApp(numero, accion.valor, {
  usuarioId
});
      }

      if (accion.tipo === "tiempo") {
        const segundos = parseInt(accion.valor);

        if (!isNaN(segundos) && segundos > 0) {
          await esperarSegundos(segundos);
        }
      }

if (accion.tipo === "imagen") {
  const partes = accion.valor.split("||");
  const urlImagen = partes[0].trim();
  const captionImagen = partes[1] ? partes[1].trim() : "";

  await enviarMediaWhatsApp(numero, "image", urlImagen, captionImagen, {
    usuarioId
  });
}

if (accion.tipo === "audio") {
  console.log("🎧 Nodo audio detectado:", accion.valor);

  await enviarMediaWhatsApp(numero, "audio", accion.valor, "", {
    usuarioId
  });
}

if (accion.tipo === "video") {
  const partes = accion.valor.split("||");
  const urlVideo = partes[0].trim();
  const captionVideo = partes[1] ? partes[1].trim() : "";

  await enviarMediaWhatsApp(numero, "video", urlVideo, captionVideo, {
    usuarioId
  });
}

if (accion.tipo === "doc") {
  console.log("📄 Nodo documento detectado:", accion.valor);

  await enviarMediaWhatsApp(numero, "document", accion.valor, "", {
    usuarioId
  });
}

    }

    if (html.includes("⏳ Espera")) {
      const matchEspera = html.match(/<input[^>]*value="([^"]*)"/i);
      const segundos = matchEspera ? parseInt(matchEspera[1]) : 0;

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
    await agregarEtiquetaCliente(numero, etiqueta, usuarioId);
  }
}
    await continuarASiguientes(nodoId, visitados, tipoNodo);
  }

  await ejecutarNodo("nodo_inicio");
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
  matchActivador,
  sortActivadores,
} = require("./activadorUtils");
const { resolveEstado } = require("./flujosMetricsService");

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

async function buscarYEjecutarActivador(numero, textoCliente, usuarioId = null, messageId = null) {
  if (!textoCliente || !usuarioId) {
    console.log("⚠️ ACTIVADOR — omitido (sin texto o sin usuario_id):", {
      texto: textoCliente,
      usuarioId,
    });
    return false;
  }

  const textoNorm = normalizarTextoActivador(textoCliente);
  if (!textoNorm) return false;

  console.log("🔎 BUSCANDO ACTIVADOR:", textoNorm, "| numero:", numero, "| usuario:", usuarioId);

  let activadores = [];
  try {
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,prioridad,coincidencia,veces_usado,repetible,tipo_activador,palabras_clave_array&activo=eq.true&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );
    activadores = responseActivadores.data || [];
  } catch (e) {
    console.log(
      "[ACTIVADOR] fallback sin columnas extendidas:",
      e.response?.data?.message || e.message
    );
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,repetible&activo=eq.true&usuario_id=eq.${usuarioId}`,
      { headers: supabaseHeaders() }
    );
    activadores = (responseActivadores.data || []).map((a) => ({
      ...a,
      prioridad: 0,
      coincidencia: "contiene",
      veces_usado: 0,
      tipo_activador: "palabra_unica",
      palabras_clave_array: [],
    }));
  }

  if (!activadores.length) {
    console.log("⚠️ ACTIVADOR — ningún activador activo para usuario:", usuarioId);
    return false;
  }

  const ordenados = sortActivadores(activadores);
  let activador = null;
  let matchInfo = null;

  for (const a of ordenados) {
    const result = matchActivador(textoNorm, a);
    if (result.matched) {
      activador = a;
      matchInfo = result;
      break;
    }
  }

  if (!activador || !matchInfo) {
    console.log("⚠️ ACTIVADOR — no encontrado para texto:", textoNorm);
    return false;
  }

  console.log("✅ ACTIVADOR ENCONTRADO:", {
    id: activador.id,
    frase: activador.frase,
    flujo_id: activador.flujo_id,
    tipo: matchInfo.tipo,
    detalle: matchInfo.detalle,
  });

  const flowId = activador.flujo_id;
  if (!flowId || flowId === "undefined" || flowId === "null") {
    console.error("❌ Flow ID inválido:", flowId);
    return false;
  }

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

  const responseFlujo = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?id=eq.${flowId}&usuario_id=eq.${usuarioId}&select=*`,
    { headers: supabaseHeaders() }
  );

  const flujo = responseFlujo.data?.[0];
  const flujoDatos = obtenerDatosFlujo(flujo);

  if (!flujo || !flujoDatos) {
    console.log("⚠️ FLUJO — no encontrado o sin datos:", flowId);
    return false;
  }

  if (!flujoEstaActivo(flujo)) {
    console.log(
      "⚠️ FLUJO — pausado/inactivo:",
      flujo.nombre || flowId,
      "| estado:",
      resolveEstado(flujoDatos)
    );
    return false;
  }

  console.log("✅ FLUJO ENCONTRADO:", flujo.nombre || "—", "| id:", flujo.id);

  await ejecutarFlujo(numero, flujoDatos, usuarioId, flujo.id, {
    ultimoMensaje: textoCliente,
  });
  await registrarUsoActivador(activador);

  return true;
}

module.exports = {
  agregarEtiquetaCliente,
  ejecutarFlujo,
  buscarYEjecutarActivador,
  registrarConversion,
};