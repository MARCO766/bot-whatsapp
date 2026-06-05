/**
 * Estado de onboarding MacBot — checklist, progreso y bienvenida.
 */
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const IA_NODE_TYPES = new Set(["ia", "ia_pro", "openai_agent"]);

const CHECKLIST_IDS = [
  "crear_cuenta",
  "conectar_whatsapp",
  "crear_flujo",
  "activar_ia",
  "recibir_lead",
];

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function nodoTipo(nodo) {
  return String(nodo?.tipo || nodo?.type || "").toLowerCase().trim();
}

function flujoTieneNodoIA(data) {
  const nodos = data?.nodos;
  if (!Array.isArray(nodos)) return false;
  return nodos.some((n) => IA_NODE_TYPES.has(nodoTipo(n)));
}

async function fetchUsuarioOnboarding(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,bienvenida_mostrada&limit=1`,
    { headers: headers() }
  );
  return res.data?.[0] || null;
}

/**
 * Cuenta filas en conexiones_whatsapp por usuario_id.
 */
async function contarConexionesWhatsapp(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id`,
    { headers: headers() }
  );
  return Array.isArray(res.data) ? res.data.length : 0;
}

async function contarFlujos(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id,data`,
    { headers: headers() }
  );
  return Array.isArray(res.data) ? res.data : [];
}

async function tienePrimerLead(usuarioId) {
  const res = await axios.get(
    `${SUPABASE_URL}/rest/v1/clientes?usuario_id=eq.${encodeURIComponent(usuarioId)}&select=id&limit=1`,
    { headers: headers() }
  );
  return (res.data?.length || 0) > 0;
}

function buildChecklist({ tieneWhatsapp, totalFlujos, tieneIA, tieneLead }) {
  const done = {
    crear_cuenta: true,
    conectar_whatsapp: tieneWhatsapp,
    crear_flujo: totalFlujos > 0,
    activar_ia: tieneIA,
    recibir_lead: tieneLead,
  };

  const items = [
    { id: "crear_cuenta", label: "Crear cuenta", done: done.crear_cuenta },
    { id: "conectar_whatsapp", label: "Conectar WhatsApp", done: done.conectar_whatsapp },
    { id: "crear_flujo", label: "Crear flujo", done: done.crear_flujo },
    { id: "activar_ia", label: "Activar IA", done: done.activar_ia },
    { id: "recibir_lead", label: "Recibir primer lead", done: done.recibir_lead },
  ];

  const completados = items.filter((i) => i.done).length;
  const total = CHECKLIST_IDS.length;
  const porcentaje = Math.round((completados / total) * 100);

  return { items, completados, total, porcentaje };
}

/**
 * @returns {Promise<object>}
 */
async function obtenerEstadoOnboarding(usuarioId) {
  const [usuario, total_conexiones, flujosRows, tieneLead] = await Promise.all([
    fetchUsuarioOnboarding(usuarioId),
    contarConexionesWhatsapp(usuarioId),
    contarFlujos(usuarioId),
    tienePrimerLead(usuarioId),
  ]);

  const tiene_conexion_whatsapp = total_conexiones > 0;
  const total_flujos = flujosRows.length;
  const tiene_ia = flujosRows.some((f) => flujoTieneNodoIA(f?.data));

  const checklist = buildChecklist({
    tieneWhatsapp: tiene_conexion_whatsapp,
    totalFlujos: total_flujos,
    tieneIA: tiene_ia,
    tieneLead,
  });

  const bienvenida_mostrada = Boolean(usuario?.bienvenida_mostrada);

  return {
    tiene_conexion_whatsapp,
    total_conexiones,
    total_flujos,
    tiene_ia,
    tiene_primer_lead: tieneLead,
    bienvenida_mostrada,
    mostrar_modal_bienvenida: !bienvenida_mostrada,
    paso_actual: tiene_conexion_whatsapp ? "listo" : "conectar_whatsapp",
    checklist: checklist.items,
    progreso: {
      completados: checklist.completados,
      total: checklist.total,
      porcentaje: checklist.porcentaje,
    },
  };
}

async function marcarBienvenidaMostrada(usuarioId) {
  await axios.patch(
    `${SUPABASE_URL}/rest/v1/crm_usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
    { bienvenida_mostrada: true },
    {
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      }),
    }
  );
  return { bienvenida_mostrada: true };
}

module.exports = {
  contarConexionesWhatsapp,
  obtenerEstadoOnboarding,
  marcarBienvenidaMostrada,
};
