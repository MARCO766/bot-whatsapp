/**
 * Valla por conversación y por objeto.
 * No usa el candado global: ese solo impide dos recorridos de limpieza.
 * La fila de la conversación se conserva mientras Storage responde al DELETE.
 * El webhook no puede insertar el entrante mientras esa fila siga vigente.
 * Si la función todavía no está instalada, el mensaje se guarda y la limpieza
 * no elimina. Si la valla está ocupada, el webhook no inserta y no responde 200.
 */
const axios = require("axios");
const reglas = require("./reglas");
const { clasificarErrorPostgrest } = require("../supabaseSafe");

const TTL_ENTRANTE_S = 45;
const TTL_LIMPIEZA_S = 90;
const MARGEN_STORAGE_MS = 30000;

function contexto(opciones = {}) {
  return {
    cliente: opciones.cliente || axios,
    url: opciones.url || process.env.SUPABASE_URL,
    key: opciones.key || process.env.SUPABASE_SECRET_KEY,
  };
}

function filaRpc(data) {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  return fila;
}

function tieneReloj(fila) {
  return Number.isFinite(Date.parse(fila?.ahora));
}

async function rpc(opciones, nombre, body) {
  const { cliente, url, key } = contexto(opciones);
  if (!url || !key) {
    const error = new Error("sin supabase");
    error.code = "VALLA_SIN_SUPABASE";
    throw error;
  }
  return cliente.post(`${url}/rest/v1/rpc/${nombre}`, body, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    timeout: opciones.timeoutMs || 8000,
  });
}

function motivoDeError(error) {
  if (error?.code === "VALLA_SIN_SUPABASE") return "valla_no_instalada";
  const tipo = clasificarErrorPostgrest(error);
  if (tipo === "funcion_ausente" || tipo === "tabla_ausente") return "valla_no_instalada";
  return "valla_no_disponible";
}

async function llamar(opciones, nombre, body) {
  try {
    const res = await rpc(opciones, nombre, body);
    const fila = filaRpc(res?.data);
    if (!tieneReloj(fila)) return { ok: false, motivo: "reloj_postgres_ausente" };
    return fila;
  } catch (error) {
    return { ok: false, motivo: motivoDeError(error) };
  }
}

function ownerLimpieza(workerId) {
  return `cl:${workerId}`;
}

function ownerWebhook(wamid, hilo) {
  return `wh:${wamid || hilo}`;
}

async function adquirirHilo(opciones) {
  return llamar(opciones, "limpieza_media_hilo_adquirir", {
    p_hilo: opciones.hilo,
    p_modo: opciones.modo,
    p_owner: opciones.owner,
    p_ttl_seconds: opciones.ttlSeconds,
  });
}

async function renovarHilo(opciones) {
  return llamar(opciones, "limpieza_media_hilo_renovar", {
    p_hilo: opciones.hilo,
    p_modo: opciones.modo,
    p_owner: opciones.owner,
    p_ttl_seconds: opciones.ttlSeconds || TTL_LIMPIEZA_S,
  });
}

async function verificarHilo(opciones) {
  return llamar(opciones, "limpieza_media_hilo_verificar", {
    p_hilo: opciones.hilo,
    p_modo: opciones.modo,
    p_owner: opciones.owner,
  });
}

async function liberarHilo(opciones) {
  if (!opciones?.hilo || !opciones?.owner) return { ok: false, motivo: "valla_ajena" };
  return llamar(opciones, "limpieza_media_hilo_liberar", {
    p_hilo: opciones.hilo,
    p_modo: opciones.modo,
    p_owner: opciones.owner,
  });
}

async function adquirirObjeto(opciones) {
  return llamar(opciones, "limpieza_media_objeto_adquirir", {
    p_clave: opciones.clave,
    p_hilo: opciones.hilo,
    p_owner: opciones.owner,
    p_ttl_seconds: opciones.ttlSeconds || TTL_LIMPIEZA_S,
  });
}

async function renovarObjeto(opciones) {
  return llamar(opciones, "limpieza_media_objeto_renovar", {
    p_clave: opciones.clave,
    p_owner: opciones.owner,
    p_ttl_seconds: opciones.ttlSeconds || TTL_LIMPIEZA_S,
  });
}

async function verificarObjeto(opciones) {
  return llamar(opciones, "limpieza_media_objeto_verificar", {
    p_clave: opciones.clave,
    p_owner: opciones.owner,
  });
}

async function liberarObjeto(opciones) {
  if (!opciones?.clave || !opciones?.owner) return { ok: false, motivo: "valla_ajena" };
  return llamar(opciones, "limpieza_media_objeto_liberar", {
    p_clave: opciones.clave,
    p_owner: opciones.owner,
  });
}

async function prepararPersistenciaEntrante(opciones = {}) {
  const hilo = reglas.claveHilo(opciones.usuarioId, opciones.conexionId, opciones.numero);
  if (!hilo) {
    return { ok: true, persistir: true, degradada: true, motivo: "valla_sin_hilo", valla: null };
  }
  const owner = opciones.owner || ownerWebhook(opciones.wamid, hilo);
  const tomada = await adquirirHilo({
    ...opciones,
    hilo,
    modo: "entrante",
    owner,
    ttlSeconds: opciones.ttlSeconds || TTL_ENTRANTE_S,
  });
  if (tomada.motivo === "valla_no_instalada") {
    return { ok: true, persistir: true, degradada: true, motivo: "valla_no_instalada", valla: null };
  }
  if (tomada.ok !== true) {
    return { ok: false, persistir: false, status: 503, motivo: tomada.motivo || "valla_ocupada", valla: null };
  }
  return {
    ok: true,
    persistir: true,
    valla: { hilo, modo: "entrante", owner, ok: true },
    motivo: "adquirida",
  };
}

async function ejecutarPersistenciaEntrante(opciones = {}) {
  const prep = await prepararPersistenciaEntrante(opciones);
  if (!prep.persistir) {
    return {
      status: 503,
      guardado: false,
      confirmado: false,
      reintentar: true,
      motivo: prep.motivo,
      valla: null,
    };
  }
  let resultado;
  try {
    resultado = await opciones.persistir();
  } catch (error) {
    if (prep.valla) await liberarHilo({ ...opciones, ...prep.valla });
    return {
      status: 503,
      guardado: false,
      confirmado: false,
      reintentar: true,
      motivo: "persistencia_fallida",
      valla: null,
    };
  }
  if (resultado?.duplicate) {
    if (prep.valla) await liberarHilo({ ...opciones, ...prep.valla });
    return { status: 200, guardado: false, confirmado: true, duplicado: true, valla: null };
  }
  if (!resultado?.claimed) {
    if (prep.valla) await liberarHilo({ ...opciones, ...prep.valla });
    if (resultado?.reason === "no_wamid") {
      return { status: 200, guardado: false, confirmado: false, motivo: "no_wamid", valla: null };
    }
    return {
      status: 503,
      guardado: false,
      confirmado: false,
      reintentar: true,
      motivo: resultado?.reason || "claim_fallido",
      valla: null,
    };
  }
  return {
    status: 200,
    guardado: true,
    confirmado: true,
    degradada: prep.degradada === true,
    motivo: prep.motivo || "adquirida",
    valla: prep.valla,
  };
}

function margenSuficiente(fila, margenMs = MARGEN_STORAGE_MS) {
  const ahora = Date.parse(fila?.ahora);
  const hasta = Date.parse(fila?.locked_until);
  return Number.isFinite(ahora) && Number.isFinite(hasta) && hasta - ahora >= margenMs;
}

async function abrirVallaLimpieza(peticion = {}) {
  if (!peticion.permitirRed && !peticion.cliente) {
    return { bloqueaInsertos: false, sesionAbierta: false, motivo: "intervalo_no_garantizado" };
  }
  if (!peticion.hilo || !peticion.clave || !peticion.workerId) {
    return { bloqueaInsertos: false, sesionAbierta: false, motivo: "valla_sin_hilo" };
  }
  const owner = ownerLimpieza(peticion.workerId);
  const hilo = await adquirirHilo({
    ...peticion,
    modo: "limpieza",
    owner,
    ttlSeconds: TTL_LIMPIEZA_S,
  });
  if (hilo.ok !== true) {
    return { bloqueaInsertos: false, sesionAbierta: false, motivo: hilo.motivo || "valla_ocupada" };
  }
  const objeto = await adquirirObjeto({ ...peticion, owner, ttlSeconds: TTL_LIMPIEZA_S });
  if (objeto.ok !== true) {
    await liberarHilo({ ...peticion, modo: "limpieza", owner });
    return { bloqueaInsertos: false, sesionAbierta: false, motivo: objeto.motivo || "objeto_ocupado" };
  }

  const partes = String(peticion.hilo).split("|");
  const filaHilo = {
    usuario_id: partes[0],
    conexion_whatsapp_id: partes[1],
    cliente_numero: partes[2],
  };
  let entranteObservadoMs = null;
  try {
    if (typeof peticion.leerUltimoEntrante !== "function") throw new Error("sin lectura");
    entranteObservadoMs = await peticion.leerUltimoEntrante(filaHilo);
    if (entranteObservadoMs == null) throw new Error("sin entrante");
  } catch (error) {
    await liberarObjeto({ ...peticion, owner });
    await liberarHilo({ ...peticion, modo: "limpieza", owner });
    return { bloqueaInsertos: false, sesionAbierta: false, motivo: "consulta_fallida" };
  }

  const valla = {
    bloqueaInsertos: true,
    sesionAbierta: true,
    entranteObservadoMs,
    motivoPerdida: null,
    async leerUltimoEntrante() {
      return peticion.leerUltimoEntrante(filaHilo);
    },
    async asegurarVigencia() {
      const hiloOk = await renovarHilo({ ...peticion, modo: "limpieza", owner, ttlSeconds: TTL_LIMPIEZA_S });
      const objetoOk = hiloOk.ok === true
        ? await renovarObjeto({ ...peticion, owner, ttlSeconds: TTL_LIMPIEZA_S })
        : { ok: false, motivo: "valla_perdida" };
      const ok = hiloOk.ok === true && objetoOk.ok === true && margenSuficiente(hiloOk) && margenSuficiente(objetoOk);
      if (!ok) valla.motivoPerdida = "valla_perdida";
      return { ok, motivo: ok ? "renovada" : "valla_perdida" };
    },
    async hayEspera() {
      const hiloOk = await verificarHilo({ ...peticion, modo: "limpieza", owner });
      const objetoOk = await verificarObjeto({ ...peticion, owner });
      const sigue = hiloOk.ok === true && objetoOk.ok === true;
      if (!sigue) valla.motivoPerdida = "valla_perdida";
      return !sigue;
    },
    async cerrar() {
      valla.sesionAbierta = false;
      await liberarObjeto({ ...peticion, owner });
      await liberarHilo({ ...peticion, modo: "limpieza", owner });
    },
  };
  return valla;
}

module.exports = {
  MARGEN_STORAGE_MS,
  TTL_ENTRANTE_S,
  TTL_LIMPIEZA_S,
  abrirVallaLimpieza,
  adquirirHilo,
  adquirirObjeto,
  ejecutarPersistenciaEntrante,
  liberarHilo,
  liberarObjeto,
  margenSuficiente,
  ownerLimpieza,
  ownerWebhook,
  prepararPersistenciaEntrante,
  renovarHilo,
  verificarHilo,
};
