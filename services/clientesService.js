/**
 * CRM Clientes — leads, embudo, score, timeline (Supabase).
 * No modifica Bandeja/inbox; reutiliza tablas existentes.
 */
const axios = require("axios");
const { ejecutarFlujo } = require("./flowService");
const { registrarConversion } = require("./conversionService");
const { isSchemaMissingError, logSchemaFallback } = require("./supabaseSafe");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const EMBUDOS = [
  "nuevo",
  "conversando",
  "interesado",
  "caliente",
  "esperando_pago",
  "compro",
  "recompra",
  "perdido",
];

const KANBAN_COLUMNAS = [
  { id: "nuevo", label: "Nuevos" },
  { id: "conversando", label: "Conversando" },
  { id: "interesado", label: "Interesados" },
  { id: "esperando_pago", label: "Esperando pago" },
  { id: "compro", label: "Comprados" },
];

const FUENTES_VALIDAS = [
  "whatsapp",
  "meta_ads",
  "tiktok",
  "landing",
  "qr",
  "organico",
];

const CLIENTE_SELECT =
  "id,numero,nombre,estado,estado_embudo,score,notas,fuente,pais,archivado,creado_en,ultima_actividad,total_gastado,usuario_id";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function log(msg, extra) {
  if (extra !== undefined) console.log(`[clientesService] ${msg}`, extra);
  else console.log(`[clientesService] ${msg}`);
}

function uidEnc(id) {
  return encodeURIComponent(id);
}

function inferPais(numero) {
  const n = String(numero || "").replace(/\D/g, "");
  const map = {
    "591": "Bolivia",
    "52": "México",
    "54": "Argentina",
    "57": "Colombia",
    "51": "Perú",
    "56": "Chile",
    "58": "Venezuela",
    "593": "Ecuador",
    "595": "Paraguay",
    "598": "Uruguay",
    "1": "USA/Canadá",
    "34": "España",
  };
  for (const [prefix, pais] of Object.entries(map)) {
    if (n.startsWith(prefix)) return pais;
  }
  return "";
}

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function supabaseGet(path, { schemaFallback = false } = {}) {
  try {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
    return res.data || [];
  } catch (err) {
    if (schemaFallback && isSchemaMissingError(err)) {
      logSchemaFallback(path.split("?")[0], err);
      return [];
    }
    throw err;
  }
}

async function getConversionesRows(usuarioId, extraQuery = "") {
  const q = `crm_conversiones?usuario_id=eq.${uidEnc(usuarioId)}${extraQuery}`;
  return supabaseGet(q, { schemaFallback: true });
}

async function supabasePost(table, body, prefer = "return=representation") {
  const res = await axios.post(`${SUPABASE_URL}/rest/v1/${table}`, body, {
    headers: headers({
      "Content-Type": "application/json",
      Prefer: prefer,
    }),
  });
  return Array.isArray(res.data) ? res.data[0] : res.data;
}

async function supabasePatch(path, body) {
  await axios.patch(`${SUPABASE_URL}/rest/v1/${path}`, body, {
    headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
  });
}

async function supabaseDelete(path) {
  await axios.delete(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
}

async function registrarHistorial(usuarioId, numero, tipo, titulo, detalle = "", metadata = {}) {
  try {
    await supabasePost("crm_historial_cliente", {
      usuario_id: usuarioId,
      cliente_numero: numero,
      tipo,
      titulo,
      detalle,
      metadata,
    });
  } catch (e) {
    log("historial (opcional):", e.response?.data || e.message);
  }
}

function computeScoreFromSignals({
  conversiones = [],
  mensajes = [],
  etiquetas = [],
  ultimaActividad,
}) {
  let pts = 0;
  if (conversiones.length > 0) pts += 45;
  if (conversiones.length > 1) pts += 15;

  const entrantes = mensajes.filter((m) => m.direccion === "entrante");
  const salientes = mensajes.filter((m) => m.direccion === "saliente");
  if (entrantes.length > 0) pts += 12;
  if (mensajes.length >= 8) pts += 8;

  const textos = mensajes.map((m) => String(m.contenido || "").toLowerCase());
  if (textos.some((t) => /precio|costo|cuánto|cuanto|valor/.test(t))) pts += 18;
  if (textos.some((t) => /qr|yape|transfer/.test(t))) pts += 14;

  const tagNames = etiquetas.map((e) => String(e.etiqueta || e).toLowerCase());
  if (tagNames.some((t) => /comprador|pagó|pago|premium|caliente/.test(t))) pts += 20;
  if (tagNames.some((t) => /frío|frio|perdido/.test(t))) pts -= 10;

  if (ultimaActividad) {
    const h = (Date.now() - new Date(ultimaActividad).getTime()) / 3600000;
    if (h > 72) pts -= 15;
    else if (h < 24 && entrantes.length > 0) pts += 8;
  }

  if (salientes.length > 0 && entrantes.length === 0) pts -= 8;

  if (pts >= 50) return "caliente";
  if (pts >= 22) return "medio";
  return "frio";
}

function scoreEmoji(score) {
  if (score === "caliente") return "🔥";
  if (score === "medio") return "🟡";
  return "❄️";
}

function embudoLabel(e) {
  const labels = {
    nuevo: "Nuevo",
    conversando: "Conversando",
    interesado: "Interesado",
    caliente: "Caliente",
    esperando_pago: "Esperando pago",
    compro: "Compró",
    recompra: "Recompra",
    perdido: "Perdido",
  };
  return labels[e] || e;
}

async function fetchConversionesMap(usuarioId) {
  const rows = await getConversionesRows(
    usuarioId,
    "&select=cliente_numero,valor,creado_en&order=creado_en.desc"
  );
  const map = {};
  rows.forEach((r) => {
    const n = r.cliente_numero;
    if (!map[n]) map[n] = { count: 0, total: 0, last: null };
    map[n].count += 1;
    map[n].total += parseFloat(r.valor) || 0;
    if (!map[n].last) map[n].last = r.creado_en;
  });
  return map;
}

async function fetchEtiquetasMap(usuarioId) {
  const [asignaciones, catalogo] = await Promise.all([
    supabaseGet(
      `clientes_etiquetas?usuario_id=eq.${uidEnc(usuarioId)}&select=cliente_numero,etiqueta`
    ),
    supabaseGet(`etiquetas?usuario_id=eq.${uidEnc(usuarioId)}&select=nombre,color`),
  ]);
  const colores = {};
  catalogo.forEach((e) => {
    colores[e.nombre] = e.color || "#22c55e";
  });
  const map = {};
  asignaciones.forEach((a) => {
    if (!map[a.cliente_numero]) map[a.cliente_numero] = [];
    map[a.cliente_numero].push({
      nombre: a.etiqueta,
      color: colores[a.etiqueta] || "#22c55e",
    });
  });
  return map;
}

async function fetchConversacionesMap(usuarioId) {
  const rows = await supabaseGet(
    `conversaciones?usuario_id=eq.${uidEnc(usuarioId)}&select=cliente_numero,ultimo_mensaje_en,unread_count`
  );
  const map = {};
  rows.forEach((c) => {
    map[c.cliente_numero] = c;
  });
  return map;
}

async function fetchMensajesStats(usuarioId, numeros) {
  if (!numeros.length) return {};
  const sample = numeros.slice(0, 200);
  const orFilter = sample.map((n) => `cliente_numero.eq.${n}`).join(",");
  let rows = [];
  try {
    rows = await supabaseGet(
      `mensajes?usuario_id=eq.${uidEnc(usuarioId)}&or=(${orFilter})&select=cliente_numero,direccion,contenido,creado_en&order=creado_en.desc&limit=5000`
    );
  } catch {
    rows = [];
  }
  const map = {};
  rows.forEach((m) => {
    const n = m.cliente_numero;
    if (!map[n]) map[n] = [];
    if (map[n].length < 30) map[n].push(m);
  });
  return map;
}

function enrichCliente(row, ctx) {
  const conv = ctx.conversaciones[row.numero];
  const convData = ctx.conversiones[row.numero] || { count: 0, total: 0 };
  const tags = ctx.etiquetas[row.numero] || [];
  const msgs = ctx.mensajes[row.numero] || [];
  const ultima =
    row.ultima_actividad ||
    conv?.ultimo_mensaje_en ||
    row.creado_en;

  const totalGastado =
    parseFloat(row.total_gastado) > 0
      ? parseFloat(row.total_gastado)
      : convData.total;

  const score =
    row.score && ["caliente", "medio", "frio"].includes(row.score)
      ? row.score
      : computeScoreFromSignals({
          conversiones: Array(convData.count).fill({}),
          mensajes: msgs,
          etiquetas: tags,
          ultimaActividad: ultima,
        });

  const sinResponder =
    (conv?.unread_count || 0) > 0 ||
    (msgs.length > 0 &&
      msgs[0]?.direccion === "entrante" &&
      Date.now() - new Date(msgs[0].creado_en).getTime() < 7 * 86400000);

  return {
    id: row.id,
    numero: row.numero,
    nombre: row.nombre || row.numero,
    pais: row.pais || inferPais(row.numero),
    estado: row.estado,
    bloqueado: row.estado === "bloqueado",
    archivado: !!row.archivado,
    estadoEmbudo: row.estado_embudo || "nuevo",
    estadoEmbudoLabel: embudoLabel(row.estado_embudo || "nuevo"),
    score,
    scoreEmoji: scoreEmoji(score),
    notas: row.notas || "",
    fuente: row.fuente || "whatsapp",
    creadoEn: row.creado_en,
    ultimaActividad: ultima,
    etiquetas: tags,
    compras: convData.count,
    totalGastado,
    sinResponder,
    noLeidos: conv?.unread_count || 0,
  };
}

async function listClientesRaw(usuarioId, { archivado = false } = {}) {
  const arch = archivado ? "true" : "false";
  try {
    return await supabaseGet(
      `clientes?usuario_id=eq.${uidEnc(usuarioId)}&archivado=eq.${arch}&select=${CLIENTE_SELECT}&order=creado_en.desc`
    );
  } catch (e) {
    if (e.response?.status === 400) {
      return await supabaseGet(
        `clientes?usuario_id=eq.${uidEnc(usuarioId)}&select=id,numero,nombre,estado,creado_en,usuario_id&order=creado_en.desc`
      );
    }
    throw e;
  }
}

async function getDashboard(usuarioId) {
  const [clientes, conversiones] = await Promise.all([
    listClientesRaw(usuarioId),
    getConversionesRows(usuarioId, "&select=valor,cliente_numero,creado_en"),
  ]);

  const hoy = startOfTodayUtc();
  const compradores = new Set();
  let ingresos = 0;
  conversiones.forEach((c) => {
    ingresos += parseFloat(c.valor) || 0;
    compradores.add(c.cliente_numero);
  });

  const activos = clientes.filter(
    (c) => c.estado !== "bloqueado" && !c.archivado
  ).length;

  const nuevosHoy = clientes.filter(
    (c) => c.creado_en && c.creado_en >= hoy
  ).length;

  const convMap = await fetchConversacionesMap(usuarioId);
  let sinResponder = 0;
  let calientes = 0;

  clientes.forEach((c) => {
    const conv = convMap[c.numero];
    if ((conv?.unread_count || 0) > 0) sinResponder += 1;
    const emb = c.estado_embudo || "nuevo";
    if (emb === "caliente" || c.score === "caliente") calientes += 1;
  });

  const leads = clientes.filter((c) => !c.archivado).length;
  const tasaConversion =
    leads > 0 ? Math.round((compradores.size / leads) * 1000) / 10 : 0;

  return {
    ok: true,
    dashboard: {
      totalLeads: leads,
      leadsActivos: activos,
      compradores: compradores.size,
      ingresosTotales: Math.round(ingresos * 100) / 100,
      leadsCalientes: calientes,
      sinResponder,
      nuevosHoy,
      tasaConversion,
    },
  };
}

async function listClientes(usuarioId, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(query.limit, 10) || 25));
  const q = String(query.q || "").trim().toLowerCase();

  let clientes = await listClientesRaw(usuarioId, {
    archivado: query.archivado === "true",
  });

  const numeros = clientes.map((c) => c.numero);
  const [etiquetas, conversiones, conversaciones, mensajes] = await Promise.all([
    fetchEtiquetasMap(usuarioId),
    fetchConversionesMap(usuarioId),
    fetchConversacionesMap(usuarioId),
    fetchMensajesStats(usuarioId, numeros),
  ]);

  const ctx = { etiquetas, conversiones, conversaciones, mensajes };
  let items = clientes.map((r) => enrichCliente(r, ctx));

  if (q) {
    let matchNumeros = null;
    if (q.length >= 3) {
      try {
        const found = await supabaseGet(
          `mensajes?usuario_id=eq.${uidEnc(usuarioId)}&contenido=ilike.*${encodeURIComponent(q)}*&select=cliente_numero&limit=100`
        );
        matchNumeros = new Set(found.map((m) => m.cliente_numero));
      } catch {
        matchNumeros = null;
      }
    }
    items = items.filter((c) => {
      if (c.nombre.toLowerCase().includes(q)) return true;
      if (c.numero.includes(q)) return true;
      if (c.pais.toLowerCase().includes(q)) return true;
      if (c.etiquetas.some((t) => t.nombre.toLowerCase().includes(q))) return true;
      if (matchNumeros && matchNumeros.has(c.numero)) return true;
      return false;
    });
  }

  if (query.etiqueta) {
    const et = query.etiqueta.toLowerCase();
    items = items.filter((c) =>
      c.etiquetas.some((t) => t.nombre.toLowerCase() === et)
    );
  }
  if (query.pais) {
    items = items.filter(
      (c) => c.pais.toLowerCase() === query.pais.toLowerCase()
    );
  }
  if (query.estado_embudo) {
    items = items.filter((c) => c.estadoEmbudo === query.estado_embudo);
  }
  if (query.score) {
    items = items.filter((c) => c.score === query.score);
  }
  if (query.fuente) {
    items = items.filter((c) => c.fuente === query.fuente);
  }
  if (query.comprador === "true") {
    items = items.filter((c) => c.compras > 0);
  }
  if (query.comprador === "false") {
    items = items.filter((c) => c.compras === 0);
  }
  if (query.ingreso_min) {
    const min = parseFloat(query.ingreso_min);
    items = items.filter((c) => c.totalGastado >= min);
  }
  if (query.ingreso_max) {
    const max = parseFloat(query.ingreso_max);
    items = items.filter((c) => c.totalGastado <= max);
  }
  if (query.sin_responder === "true") {
    items = items.filter((c) => c.sinResponder);
  }
  if (query.fecha_desde) {
    items = items.filter(
      (c) => c.creadoEn && c.creadoEn >= query.fecha_desde
    );
  }
  if (query.fecha_hasta) {
    items = items.filter(
      (c) => c.creadoEn && c.creadoEn <= `${query.fecha_hasta}T23:59:59Z`
    );
  }
  if (query.actividad_desde) {
    items = items.filter(
      (c) => c.ultimaActividad && c.ultimaActividad >= query.actividad_desde
    );
  }

  const total = items.length;
  const offset = (page - 1) * limit;
  const pageItems = items.slice(offset, offset + limit);

  return {
    ok: true,
    clientes: pageItems,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    kanbanColumnas: KANBAN_COLUMNAS,
  };
}

async function getKanban(usuarioId) {
  const { clientes } = await listClientes(usuarioId, { limit: 500, page: 1 });
  const columnas = {};
  KANBAN_COLUMNAS.forEach((col) => {
    columnas[col.id] = [];
  });
  clientes.forEach((c) => {
    const key = KANBAN_COLUMNAS.some((k) => k.id === c.estadoEmbudo)
      ? c.estadoEmbudo
      : "nuevo";
    if (columnas[key]) columnas[key].push(c);
    else columnas.nuevo.push(c);
  });
  return { ok: true, columnas, kanbanColumnas: KANBAN_COLUMNAS };
}

async function getCliente(usuarioId, numero) {
  const rows = await supabaseGet(
    `clientes?usuario_id=eq.${uidEnc(usuarioId)}&numero=eq.${encodeURIComponent(numero)}&select=${CLIENTE_SELECT}`
  );
  const row = rows[0];
  if (!row) {
    const err = new Error("Cliente no encontrado");
    err.status = 404;
    throw err;
  }

  const [etiquetas, conversiones, conversaciones, mensajes, historial, seguimientos] =
    await Promise.all([
      fetchEtiquetasMap(usuarioId),
      fetchConversionesMap(usuarioId),
      fetchConversacionesMap(usuarioId),
      supabaseGet(
        `mensajes?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=direccion,contenido,tipo,creado_en,imagen_url&order=creado_en.desc&limit=50`
      ),
      supabaseGet(
        `crm_historial_cliente?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=*&order=creado_en.desc&limit=30`
      ).catch(() => []),
      supabaseGet(
        `seguimientos_programados?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=id,run_at,estado,mensaje_tipo,mensaje_payload,creado_en&order=run_at.desc&limit=20`
      ).catch(() => []),
    ]);

  const ctx = {
    etiquetas,
    conversiones,
    conversaciones,
    mensajes: { [numero]: mensajes },
  };
  const lead = enrichCliente(row, ctx);
  const convData = conversiones[numero] || { count: 0, total: 0 };

  const entrantes = mensajes.filter((m) => m.direccion === "entrante").length;
  const salientes = mensajes.filter((m) => m.direccion === "saliente").length;
  const tasaRespuesta =
    salientes > 0 ? Math.round((entrantes / salientes) * 100) : 0;

  let tiempoRespuestaMin = null;
  const sorted = [...mensajes].sort(
    (a, b) => new Date(a.creado_en) - new Date(b.creado_en)
  );
  for (let i = 0; i < sorted.length - 1; i++) {
    if (
      sorted[i].direccion === "entrante" &&
      sorted[i + 1].direccion === "saliente"
    ) {
      const diff =
        (new Date(sorted[i + 1].creado_en) - new Date(sorted[i].creado_en)) /
        60000;
      if (diff >= 0 && diff < 10080) {
        tiempoRespuestaMin =
          tiempoRespuestaMin == null
            ? Math.round(diff)
            : Math.round((tiempoRespuestaMin + diff) / 2);
      }
    }
  }

  const pendientesSeg = seguimientos.filter((s) => s.estado === "pendiente");

  return {
    ok: true,
    cliente: lead,
    metricas: {
      totalCompras: convData.count,
      ingresos: lead.totalGastado,
      conversaciones: conversaciones[numero] ? 1 : 0,
      tiempoRespuestaMin,
      tasaRespuesta,
      seguimientosEnviados: seguimientos.filter((s) => s.estado === "enviado")
        .length,
      mensajesTotal: mensajes.length,
    },
    seguimientosPendientes: pendientesSeg,
    historial,
  };
}

async function getTimeline(usuarioId, numero, { limit = 40, offset = 0 } = {}) {
  const take = Math.min(80, Math.max(10, limit));
  const skip = Math.max(0, offset);

  const [mensajes, conversiones, historial, seguimientos] = await Promise.all([
    supabaseGet(
      `mensajes?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=id,direccion,tipo,contenido,imagen_url,creado_en,flujo_id&order=creado_en.desc&limit=${take}&offset=${skip}`
    ),
    getConversionesRows(
      usuarioId,
      `&cliente_numero=eq.${encodeURIComponent(numero)}&select=id,valor,moneda,origen,creado_en&order=creado_en.desc&limit=20`
    ),
    supabaseGet(
      `crm_historial_cliente?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=*&order=creado_en.desc&limit=30`
    ).catch(() => []),
    supabaseGet(
      `seguimientos_programados?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=id,run_at,estado,mensaje_payload,creado_en,enviado_en&order=creado_en.desc&limit=20`
    ).catch(() => []),
  ]);

  const events = [];

  mensajes.forEach((m) => {
    let kind = "mensaje";
    const t = (m.tipo || "").toLowerCase();
    if (t.includes("audio")) kind = "audio";
    else if (t.includes("imagen") || m.imagen_url) kind = "imagen";
    else if (t.includes("pdf") || t.includes("document")) kind = "pdf";

    events.push({
      id: `msg-${m.id || m.creado_en}`,
      tipo: kind,
      titulo:
        m.direccion === "entrante"
          ? "Mensaje recibido"
          : m.direccion === "saliente"
            ? "Mensaje enviado"
            : "Sistema",
      detalle: m.contenido || m.tipo,
      fecha: m.creado_en,
      meta: { direccion: m.direccion, imagen_url: m.imagen_url },
    });
  });

  conversiones.forEach((c) => {
    events.push({
      id: `conv-${c.id}`,
      tipo: "conversion",
      titulo: "Compra / conversión",
      detalle: `${c.valor} ${c.moneda || "USD"} (${c.origen})`,
      fecha: c.creado_en,
    });
  });

  historial.forEach((h) => {
    events.push({
      id: `hist-${h.id}`,
      tipo: h.tipo,
      titulo: h.titulo,
      detalle: h.detalle,
      fecha: h.creado_en,
    });
  });

  seguimientos.forEach((s) => {
    const nota =
      s.mensaje_payload?.nota ||
      s.mensaje_payload?.titulo ||
      "Seguimiento programado";
    events.push({
      id: `seg-${s.id}`,
      tipo: "seguimiento",
      titulo: `Seguimiento (${s.estado})`,
      detalle: nota,
      fecha: s.enviado_en || s.run_at || s.creado_en,
    });
  });

  events.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return { ok: true, timeline: events, limit: take, offset: skip };
}

async function createCliente(usuarioId, body) {
  const numero = String(body.numero || "").replace(/\D/g, "");
  const nombre = String(body.nombre || "").trim() || numero;
  if (!numero) {
    const err = new Error("Número obligatorio");
    err.status = 400;
    throw err;
  }

  const payload = {
    numero,
    usuario_id: usuarioId,
    nombre,
    estado: "nuevo",
    estado_embudo: body.estado_embudo || "nuevo",
    score: "frio",
    notas: body.notas || "",
    fuente: FUENTES_VALIDAS.includes(body.fuente) ? body.fuente : "whatsapp",
    pais: body.pais || inferPais(numero),
    archivado: false,
    ultima_actividad: new Date().toISOString(),
  };

  const row = await supabasePost("clientes?on_conflict=numero", payload, "resolution=merge-duplicates,return=representation");
  await registrarHistorial(usuarioId, numero, "lead_creado", "Lead creado en CRM", nombre);

  return { ok: true, cliente: row };
}

async function updateCliente(usuarioId, numero, patch) {
  const allowed = {};
  if (patch.nombre !== undefined) allowed.nombre = String(patch.nombre).trim();
  if (patch.notas !== undefined) allowed.notas = String(patch.notas);
  if (patch.pais !== undefined) allowed.pais = String(patch.pais);
  if (patch.fuente !== undefined && FUENTES_VALIDAS.includes(patch.fuente)) {
    allowed.fuente = patch.fuente;
  }
  if (patch.score !== undefined && ["caliente", "medio", "frio"].includes(patch.score)) {
    allowed.score = patch.score;
  }
  if (patch.archivado !== undefined) allowed.archivado = !!patch.archivado;

  if (Object.keys(allowed).length === 0) {
    return getCliente(usuarioId, numero);
  }

  allowed.ultima_actividad = new Date().toISOString();
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    allowed
  );
  return getCliente(usuarioId, numero);
}

async function patchEmbudo(usuarioId, numero, estado_embudo) {
  if (!EMBUDOS.includes(estado_embudo)) {
    const err = new Error("Estado de embudo inválido");
    err.status = 400;
    throw err;
  }
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    {
      estado_embudo,
      ultima_actividad: new Date().toISOString(),
    }
  );
  await registrarHistorial(
    usuarioId,
    numero,
    "embudo",
    `Estado: ${embudoLabel(estado_embudo)}`,
    estado_embudo
  );
  return getCliente(usuarioId, numero);
}

async function recalcScores(usuarioId, numeros) {
  const updates = [];
  for (const numero of numeros.slice(0, 50)) {
    const msgs = await supabaseGet(
      `mensajes?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=direccion,contenido&limit=30`
    );
    const conv = await getConversionesRows(
      usuarioId,
      `&cliente_numero=eq.${encodeURIComponent(numero)}&select=id&limit=5`
    );
    const tags = await supabaseGet(
      `clientes_etiquetas?usuario_id=eq.${uidEnc(usuarioId)}&cliente_numero=eq.${encodeURIComponent(numero)}&select=etiqueta`
    );
    const score = computeScoreFromSignals({
      conversiones: conv,
      mensajes: msgs,
      etiquetas: tags,
    });
    updates.push({ numero, score });
  }
  await Promise.all(
    updates.map((u) =>
      supabasePatch(
        `clientes?numero=eq.${encodeURIComponent(u.numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
        { score: u.score }
      ).catch(() => null)
    )
  );
}

async function addEtiqueta(usuarioId, numero, etiqueta) {
  await supabaseDelete(
    `clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  await supabasePost("clientes_etiquetas", {
    cliente_numero: numero,
    usuario_id: usuarioId,
    etiqueta,
  });
  await registrarHistorial(usuarioId, numero, "etiqueta", `Etiqueta: ${etiqueta}`);
  return getCliente(usuarioId, numero);
}

async function removeEtiqueta(usuarioId, numero) {
  await supabaseDelete(
    `clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  return getCliente(usuarioId, numero);
}

async function registrarCompraManual(usuarioId, numero, { valor, moneda }) {
  await registrarConversion({
    usuarioId,
    clienteNumero: numero,
    valor: valor || 0,
    moneda: moneda || "USD",
    origen: "manual",
  });
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    {
      estado_embudo: "compro",
      ultima_actividad: new Date().toISOString(),
    }
  );
  await registrarHistorial(
    usuarioId,
    numero,
    "compra",
    "Compra registrada",
    String(valor)
  );
  return getCliente(usuarioId, numero);
}

async function crearRecordatorio(usuarioId, numero, body) {
  const nota = String(body.nota || body.titulo || "Recordatorio").trim();
  const runAt = body.run_at || body.runAt;
  if (!runAt) {
    const err = new Error("Fecha run_at obligatoria");
    err.status = 400;
    throw err;
  }

  const campanaId = require("crypto").randomUUID();
  const row = await supabasePost("seguimientos_programados", {
    campana_id: campanaId,
    usuario_id: usuarioId,
    cliente_numero: numero,
    flujo_id: null,
    nodo_id: "crm_recordatorio",
    paso_index: 0,
    run_at: runAt,
    mensaje_tipo: "texto",
    mensaje_payload: { nota, titulo: nota, crm: true },
    solo_si_no_respondio: false,
    detener_si_responde: false,
    estado: "pendiente",
  });

  await registrarHistorial(usuarioId, numero, "recordatorio", nota, runAt);
  return { ok: true, recordatorio: row };
}

async function bloquearCliente(usuarioId, numero) {
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    { estado: "bloqueado" }
  );
  await supabasePost("mensajes", {
    cliente_numero: numero,
    usuario_id: usuarioId,
    direccion: "sistema",
    tipo: "texto",
    contenido: "🚫 Bloqueado desde CRM",
    imagen_url: null,
  });
  return { ok: true, bloqueado: true };
}

async function desbloquearCliente(usuarioId, numero) {
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    { estado: "nuevo" }
  );
  return { ok: true, bloqueado: false };
}

async function archivarCliente(usuarioId, numero, archivado) {
  await supabasePatch(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`,
    { archivado: !!archivado }
  );
  return { ok: true, archivado: !!archivado };
}

async function eliminarCliente(usuarioId, numero) {
  await supabaseDelete(
    `mensajes?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  await supabaseDelete(
    `clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  await supabaseDelete(
    `conversaciones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  try {
    await supabaseDelete(
      `crm_conversiones?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
    );
  } catch (err) {
    if (!isSchemaMissingError(err)) throw err;
  }
  await supabaseDelete(
    `seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  ).catch(() => null);
  await supabaseDelete(
    `crm_historial_cliente?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  ).catch(() => null);
  await supabaseDelete(
    `clientes?numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}`
  );
  return { ok: true };
}

async function iniciarFlujo(usuarioId, numero, flujoId) {
  const flujos = await supabaseGet(
    `flujos_builder?id=eq.${encodeURIComponent(flujoId)}&usuario_id=eq.${uidEnc(usuarioId)}&select=id,nombre,data`
  );
  const flujo = flujos[0];
  if (!flujo?.data) {
    const err = new Error("Flujo no encontrado");
    err.status = 404;
    throw err;
  }
  await ejecutarFlujo(numero, flujo.data, usuarioId, flujo.id);
  await registrarHistorial(
    usuarioId,
    numero,
    "flujo",
    `Flujo iniciado: ${flujo.nombre || flujo.id}`,
    flujoId
  );
  return { ok: true, flujo: { id: flujo.id, nombre: flujo.nombre } };
}

async function cancelarSeguimientos(usuarioId, numero) {
  await supabasePatch(
    `seguimientos_programados?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${uidEnc(usuarioId)}&estado=eq.pendiente`,
    { estado: "cancelado", cancelado_en: new Date().toISOString() }
  );
  return { ok: true };
}

async function listFlujos(usuarioId) {
  const flujos = await supabaseGet(
    `flujos_builder?usuario_id=eq.${uidEnc(usuarioId)}&select=id,nombre&order=nombre.asc`
  );
  const activadores = await supabaseGet(
    `activadores?usuario_id=eq.${uidEnc(usuarioId)}&select=id,nombre,flujo_id,frase,activo`
  );
  return { ok: true, flujos, activadores };
}

async function getMetaFilters(usuarioId) {
  const [etiquetas, clientes] = await Promise.all([
    supabaseGet(`etiquetas?usuario_id=eq.${uidEnc(usuarioId)}&select=nombre,color`),
    listClientesRaw(usuarioId),
  ]);
  const paises = [
    ...new Set(
      clientes.map((c) => c.pais || inferPais(c.numero)).filter(Boolean)
    ),
  ].sort();
  return {
    ok: true,
    etiquetas,
    paises,
    embudos: EMBUDOS.map((e) => ({ id: e, label: embudoLabel(e) })),
    fuentes: FUENTES_VALIDAS,
    scores: ["caliente", "medio", "frio"],
  };
}

module.exports = {
  getDashboard,
  listClientes,
  getKanban,
  getCliente,
  getTimeline,
  createCliente,
  updateCliente,
  patchEmbudo,
  addEtiqueta,
  removeEtiqueta,
  registrarCompraManual,
  crearRecordatorio,
  bloquearCliente,
  desbloquearCliente,
  archivarCliente,
  eliminarCliente,
  iniciarFlujo,
  cancelarSeguimientos,
  listFlujos,
  getMetaFilters,
  recalcScores,
  EMBUDOS,
  KANBAN_COLUMNAS,
};
