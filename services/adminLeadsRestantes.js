/**
 * Lectura de leads para la tabla /admin.
 *
 * Contador: contarLeadsCtwaUsuario (middleware planLimits) — COUNT de
 * macbot_ctwa_leads por usuario. No usa clientes ni conexiones WhatsApp.
 * Límite: obtenerCapacidadEfectivaContactos — la misma capacidad que el
 * gate CTWA y que Mi Plan expone como limites.leads (base + bloques MacBot).
 * Solo lectura. No escribe planes, bloques ni usuarios.
 */
const { contarLeadsCtwaUsuario } = require("../middlewares/planLimits");
const {
  esContactosIlimitado,
  obtenerCapacidadEfectivaContactos,
} = require("./planesService");

const CONTADOR_LEADS = contarLeadsCtwaUsuario;
const LIMITE_LEADS = obtenerCapacidadEfectivaContactos;
const CONCURRENCIA = 6;

function tonoPorcentaje(porcentaje) {
  if (porcentaje == null) return null;
  if (porcentaje >= 90) return "danger";
  if (porcentaje >= 70) return "warn";
  return "ok";
}

/**
 * Leads restantes = límite − usados. Ilimitado (null / -1) no resta.
 * Usados o límite ilegibles → disponible:false ("No disponible" en la UI).
 */
function resumirLeadsRestantes(usados, limite) {
  if (typeof usados !== "number" || !Number.isFinite(usados) || usados < 0) {
    return { disponible: false };
  }

  const usadosInt = Math.floor(usados);

  if (esContactosIlimitado(limite)) {
    return {
      disponible: true,
      ilimitado: true,
      usados: usadosInt,
      limite: null,
      restantes: null,
      porcentaje: null,
      tono: null,
    };
  }

  const max = Number(limite);
  if (!Number.isFinite(max) || max < 0) {
    return { disponible: false };
  }

  const limiteInt = Math.floor(max);
  const restantes = Math.max(0, limiteInt - usadosInt);
  const porcentaje =
    limiteInt <= 0 ? 0 : Math.round((usadosInt / limiteInt) * 100);

  return {
    disponible: true,
    ilimitado: false,
    usados: usadosInt,
    limite: limiteInt,
    restantes,
    porcentaje,
    tono: tonoPorcentaje(porcentaje),
  };
}

async function leadsDeUsuario(usuario, contarLeads, obtenerCapacidad) {
  const usuarioId = usuario && usuario.id != null ? String(usuario.id).trim() : "";
  if (!usuarioId) return { disponible: false };

  let limite;
  try {
    limite = await obtenerCapacidad(usuarioId, usuario);
  } catch (error) {
    console.log(
      "[adminLeads] límite no disponible:",
      error?.message || error
    );
    return { disponible: false };
  }

  let usados;
  try {
    usados = await contarLeads(usuarioId);
  } catch (error) {
    console.log(
      "[adminLeads] conteo no disponible:",
      error?.message || error
    );
    return { disponible: false };
  }

  return resumirLeadsRestantes(usados, limite);
}

async function mapConConcurrencia(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Math.min(Math.max(limit, 1), items.length);

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/**
 * Agrega `leads` a cada usuario del listado admin.
 * Un fallo de un usuario no tumba el resto: ese renglón queda no disponible.
 *
 * @param {Array<object>} usuarios
 * @param {{ contarLeads?: Function, obtenerCapacidad?: Function }} [deps]
 */
async function adjuntarLeadsRestantes(usuarios, deps = {}) {
  const lista = Array.isArray(usuarios) ? usuarios : [];
  if (lista.length === 0) return [];

  const contarLeads =
    typeof deps.contarLeads === "function" ? deps.contarLeads : CONTADOR_LEADS;
  const obtenerCapacidad =
    typeof deps.obtenerCapacidad === "function" ? deps.obtenerCapacidad : LIMITE_LEADS;

  return mapConConcurrencia(lista, CONCURRENCIA, async (usuario) => {
    const leads = await leadsDeUsuario(usuario, contarLeads, obtenerCapacidad);
    return { ...usuario, leads };
  });
}

module.exports = {
  CONTADOR_LEADS,
  LIMITE_LEADS,
  tonoPorcentaje,
  resumirLeadsRestantes,
  adjuntarLeadsRestantes,
};
