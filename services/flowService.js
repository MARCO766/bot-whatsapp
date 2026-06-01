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
  esConfigRouterLocal,
  parseIAFromNodo,
} = require("./aiService");
const { ejecutarNodoIAPro, parseIAProFromNodo } = require("./iaProService");
const { ejecutarNodoOpenAIAgent } = require("./openaiAgentService");
const {
  guardarSesionIAPendiente,
  obtenerSesionIAPendiente,
  limpiarSesionIAPendiente,
  logFlowKey,
} = require("./iaFlowSession");
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
  debeBloquearActivadoresNormales,
} = require("./remarketing24h/rmContextPolicy");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

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
  if (conexionWhatsappId) op.conexionWhatsappId = conexionWhatsappId;
  return op;
}

async function ejecutarBloqueContenido(numero, bloque, usuarioId, conexionWhatsappId = null) {
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
    await enviarTextoWhatsApp(numero, mensaje, opEnvio);
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

  const media = urlMediaBloque(bloque);
  if (!media) {
    console.log("⚠️ MEDIA SIN URL, SE OMITE:", tipo);
    return;
  }

  if (tipo.includes("imagen") || tipo === "image") {
    const caption = captionMediaBloque(bloque);
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
    const enviado = await enviarMediaWhatsApp(numero, "video", media, captionMediaBloque(bloque), opEnvio);
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
    const enviado = await enviarMediaWhatsApp(numero, "document", media, captionMediaBloque(bloque), {
      ...opEnvio,
      filename: bloque.nombre || bloque.filename || "archivo.pdf",
    });
    if (enviado) console.log("✅ PDF ENVIADO");
    else console.log("❌ PDF NO ENVIADO (Meta o URL inválida)");
    return;
  }

  console.log("⚠️ TIPO DE BLOQUE NO RECONOCIDO:", tipo);
}

async function ejecutarContenidoNodo(numero, nodo, usuarioId, conexionWhatsappId = null) {
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
      const enviado = await ejecutarBloqueContenido(numero, bloque, usuarioId, conexionWhatsappId);
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

  flowContext.usuarioId = usuarioId;
  flowContext.numero = flowContext.numero || numero;

  const conexionLineaEntrante =
    opts.conexionWhatsappId != null && String(opts.conexionWhatsappId).trim() !== ""
      ? String(opts.conexionWhatsappId).trim()
      : null;

  flowContext.conexionWhatsappId =
    conexionLineaEntrante ?? flowContext.conexionWhatsappId ?? null;

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

    console.log(
      "[FLUJO] Siguiente nodo:",
      ids.join(", "),
      etiqueta ? "| desde " + etiqueta : "| desde " + nodoId
    );

    for (const siguiente of siguientes) {
      await ejecutarNodo(siguiente.hasta, new Set(visitados));
    }
  }

  async function ejecutarNodoConversion(nodo, ctx = {}) {
    const nodoId = nodo?.id || null;
    const { valor, moneda, origen } = parseConversionFromNodo(nodo);
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
      },
    });
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
    const tipoRaw = resolverTipoRaw(nodo);

    console.log("🧩 Tipo nodo detectado:", tipoNodo);

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

    if (tipoNodo === "lector_pago" || tipoRaw === "lector_pago") {
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

    if (tipoNodo === "remarketing_global") {
      console.log("[RM24H] nodo cerebro omitido en ejecución (no avanza lead):", nodoId);
      await continuarASiguientes(nodoId, visitados, "remarketing_global");
      return;
    }

    if (tipoNodo === "conversion") {
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

    if (tipoNodo === "seguimiento") {
      console.log("[SEGUIMIENTO_DEBUG] nodo detectado", {
        nodoId,
        nodoTipo: tipoNodo,
        nodoNombre: nodo.data?.label || nodo.data?.nombre || nodo.dataset?.nombre || null,
        data: nodo.data,
      });
      console.log("[SEGUIMIENTO] nodo detectado en flujo", {
        nodoId,
        flujoId,
        numero,
      });
      try {
        const conexionParaSeguimiento =
          conexionLineaEntrante ?? flowContext.conexionWhatsappId ?? null;

        console.log(
          `[FLUJO SEGUIMIENTO CONTEXT] cliente_numero=${numero} flowContext.conexionWhatsappId=${flowContext.conexionWhatsappId ?? null} conexionLineaEntrante=${conexionLineaEntrante ?? null} conexionWhatsappId_pasada_a_seguimiento=${conexionParaSeguimiento ?? null}`
        );

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

      await continuarASiguientes(nodoId, visitados, "seguimiento");
      return;
    }

    if (tipoNodo === "contenido") {
      const ejecutado = await ejecutarContenidoNodo(
        numero,
        nodo,
        usuarioId,
        flowContext.conexionWhatsappId
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
        }
        await continuarASiguientes(nodoId, visitados, "contenido");
        return;
      }
    }

    if (tipoNodo === "openai_agent") {
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

      try {
        flowContext = await ejecutarNodoOpenAIAgent(
          nodo,
          {
            ...flowContext,
            numero,
            from: numero,
            telefono: numero,
            usuarioId,
            chat_history: flowContext.chat_history || [],
            mensaje: mensajeLeadOpenAI,
            texto: mensajeLeadOpenAI,
            body: mensajeLeadOpenAI,
          },
          { resume: resumeIA, usuarioId, nodoId }
        );
      } catch (error) {
        console.error("❌ OPENAI_AGENT ERROR", error.message || error);
        flowContext = {
          ...(flowContext || {}),
          openaiAgentPausar: true,
          iaPausar: true,
        };
      }

      if (flowContext.openaiAgentPausar && !resumeIA) {
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
        console.log("[FLUJO] Agente OpenAI en espera — nodo:", nodoId);
        return;
      }

      const routeHandle =
        flowContext.openaiAgentRouteId ||
        flowContext.iaRouteId ||
        flowContext.route ||
        null;

      if (flowContext.openaiAgentPausar && resumeIA && !routeHandle) {
        console.log("⏸️ Agente OpenAI sigue esperando");
        return;
      }

      if (resumeIA && routeHandle) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
        logConexionesSalientes(nodoId, "OpenAI");
        await continuarASiguientes(nodoId, visitados, "openai_agent", routeHandle);
        return;
      }

      if (resumeIA) {
        limpiarSesionIAPendiente(usuarioId, flowContext.conexionWhatsappId, numero);
      }
      return;
    }

    if (tipoNodo === "ia_pro") {
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

    if (tipoNodo === "ia" || esTipoIA(nodo)) {
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
        await enviarTextoWhatsApp(numero, accion.valor, opEnvioNodo());
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

  await enviarMediaWhatsApp(numero, "image", urlImagen, captionImagen, opEnvioNodo());
}

if (accion.tipo === "audio") {
  console.log("🎧 Nodo audio detectado:", accion.valor);

  await enviarMediaWhatsApp(numero, "audio", accion.valor, "", opEnvioNodo());
}

if (accion.tipo === "video") {
  const partes = accion.valor.split("||");
  const urlVideo = partes[0].trim();
  const captionVideo = partes[1] ? partes[1].trim() : "";

  await enviarMediaWhatsApp(numero, "video", urlVideo, captionVideo, opEnvioNodo());
}

if (accion.tipo === "doc") {
  console.log("📄 Nodo documento detectado:", accion.valor);

  await enviarMediaWhatsApp(numero, "document", accion.valor, "", opEnvioNodo());
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
    await continuarASiguientes(nodoId, visitados, tipoNodo);
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

async function reanudarFlujoIAPendiente(numero, mensaje, usuarioId, conexionWhatsappId) {
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

  const sesionConexion =
    conexionWhatsappId ||
    sesion.conexionWhatsappId ||
    sesion.flowContext?.conexionWhatsappId ||
    null;

  await ejecutarFlujo(numero, flujoDatos, usuarioId, sesion.flujoId, {
    iaResume: true,
    nodoResumeId: sesion.nodoId,
    visitadosResume: new Set(sesion.visitados || []),
    flowContextResume: {
      ...(sesion.flowContext || {}),
      conexionWhatsappId: sesionConexion,
      ultimo_mensaje: mensaje,
      ultimoMensaje: mensaje,
    },
    mensajeResume: mensaje,
    conexionWhatsappId: sesionConexion,
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
  console.log("[RM_DEBUG] paso=1 before_resetbot", {
    numero,
    usuarioId,
    texto: textoDebug.slice(0, 80),
    conexionWhatsappId: opts.conexionWhatsappId || null,
    messageId: messageId || null,
  });

  if (esComandoResetFlujo(texto)) {
    await resetearFlujoLead(numero, usuarioId, opts.conexionWhatsappId || null);
    console.log("[RM_DEBUG] paso=2 after_resetbot", {
      numero,
      usuarioId,
      conexionWhatsappId: opts.conexionWhatsappId || null,
      nota: "return true — no continúa a activador ni RM context",
    });
    return true;
  }

  console.log("[RM_DEBUG] paso=2 after_resetbot", {
    numero,
    texto: textoDebug.slice(0, 80),
    nota: "no era resetbot — continúa pipeline",
  });

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
    opts.conexionWhatsappId || null
  );
  if (reanudado) {
    console.log("[FLUJO] reanudado IA/OpenAI pendiente OK");
    return true;
  }

  const conexionEntrante = opts.conexionWhatsappId || null;
  console.log("[RM_DEBUG] paso=3 before_obtenerContextoRemarketingPostEnvio", {
    numero,
    usuarioId,
    conexionWhatsappId: conexionEntrante,
    texto: textoDebug.slice(0, 80),
  });
  let rmContext = null;
  try {
    rmContext = await obtenerContextoRemarketingPostEnvio({
      usuarioId,
      clienteNumero: numero,
      conexionWhatsappId: conexionEntrante,
    });
    const debeBloquearActivadoresRM =
      rmContext?.fila && rmContext?.policy
        ? debeBloquearActivadoresNormales(
            rmContext.policy,
            rmContext.disparado_en || rmContext.fila?.disparado_en
          )
        : null;
    console.log("[RM_DEBUG] paso=4 rmContext =", rmContext
      ? {
          bloquearActivadores: rmContext.bloquearActivadores,
          flujo_id: rmContext.flujo_id,
          disparado_en: rmContext.disparado_en,
          rm24h_id: rmContext.fila?.id,
          policy_mode: rmContext.policy?.mode,
          policy_duration: rmContext.policy?.duration,
          fila_estado: rmContext.fila?.estado,
          fila_motivo: rmContext.fila?.motivo_cancelacion,
        }
      : null);
    console.log("[RM_DEBUG] paso=5 bloquear =", rmContext?.bloquearActivadores ?? null, {
      debeBloquearActivadoresRM,
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
          console.log("[RM_DEBUG] paso=7 activador_result =", true, {
            motivo: "allow_normal_triggers + activador normal",
            texto: textoDebug.slice(0, 80),
          });
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
        console.log("[RM_DEBUG] paso=7 activador_result = skipped", {
          motivo: "allow_normal_triggers sin activador → mini flujo RM",
          texto: textoDebug.slice(0, 80),
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
        console.log("[RM_RUNTIME_DEBUG] entrando_procesarRespuestaRemarketing", {
          lead: numero,
          usuario: usuarioId,
          conexion_whatsapp_id: conexionEntrante,
          rm24h_id: rmContext.fila?.id,
          flujo_id: rmContext.flujo_id,
          texto: textoDebug.slice(0, 120),
        });
        await procesarRespuestaRemarketing({
          numero,
          texto,
          usuarioId,
          conexionWhatsappId: conexionEntrante,
          fila: rmContext.fila,
          policy: rmContext.policy,
        });
        console.log("[RM_DEBUG] paso=7 activador_result = skipped", {
          motivo: "RM context bloqueó activadores",
          texto: textoDebug.slice(0, 80),
        });
        return true;
      }
    }
  } catch (err) {
    console.log(
      "[RM_CONTEXT] error evaluando contexto post-envío:",
      err.response?.data || err.message
    );
    console.log("[RM_DEBUG] paso=4 rmContext = error", err.response?.data || err.message);
  }

  console.log("[RM_DEBUG] paso=6 before_activador", textoDebug.slice(0, 80), {
    numero,
    usuarioId,
    conexionWhatsappId: opts.conexionWhatsappId || null,
  });
  console.log("[FLUJO] sin sesión IA pendiente → buscar activador");
  const activadorEjecutado = await buscarYEjecutarActivador(
    numero,
    texto,
    usuarioId,
    messageId,
    opts.conexionWhatsappId || null
  );
  console.log("[RM_DEBUG] paso=7 activador_result =", activadorEjecutado, {
    texto: textoDebug.slice(0, 80),
  });

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
  matchActivador,
  sortActivadores,
  sameConexionId,
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

  const connEnc = encodeURIComponent(conexionWhatsappId);
  let activadores = [];
  try {
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,prioridad,coincidencia,veces_usado,repetible,tipo_activador,palabras_clave_array,conexion_whatsapp_id&activo=eq.true&usuario_id=eq.${usuarioId}&conexion_whatsapp_id=eq.${connEnc}`,
      { headers: supabaseHeaders() }
    );
    activadores = responseActivadores.data || [];
  } catch (e) {
    console.log(
      "[ACTIVADOR] fallback sin columnas extendidas:",
      e.response?.data?.message || e.message
    );
    const responseActivadores = await axios.get(
      `${SUPABASE_URL}/rest/v1/activadores?select=id,frase,flujo_id,activo,repetible,conexion_whatsapp_id&activo=eq.true&usuario_id=eq.${usuarioId}&conexion_whatsapp_id=eq.${connEnc}`,
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
    console.log(
      "⚠️ ACTIVADOR — ningún activador activo para usuario/línea:",
      usuarioId,
      conexionWhatsappId
    );
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

  if (
    conexionWhatsappId &&
    (!flujo.conexion_whatsapp_id ||
      !sameConexionId(flujo.conexion_whatsapp_id, conexionWhatsappId))
  ) {
    console.log(
      "⚠️ ACTIVADOR — flujo no pertenece a esta línea, abortando:",
      flowId,
      "| flujo:",
      flujo.conexion_whatsapp_id || "legacy",
      "| mensaje:",
      conexionWhatsappId
    );
    return false;
  }

  if (
    activador.conexion_whatsapp_id &&
    !sameConexionId(activador.conexion_whatsapp_id, conexionWhatsappId)
  ) {
    console.log("⚠️ ACTIVADOR — activador de otra línea, abortando:", activador.id);
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
  procesarMensajeEntrante,
  reanudarFlujoIAPendiente,
  registrarConversion,
};