/**
 * Cliente PostgREST de la marca durable.
 * La fuente de verdad es PostgreSQL, mediante las funciones de
 * supabase/migrations/limpieza_media_marca.sql. Este módulo no guarda marcas.
 *
 * Sin permitirRed y sin cliente inyectado no abre red. Así las pruebas y un
 * require accidental no tocan producción. El webhook de producción pasa
 * permitirRed: true. Solo un PGRST202, un 42883 o el mensaje de
 * PostgREST de función ausente responde marca_no_instalada. Un 404
 * genérico, un timeout o un permiso denegado no se tratan como eso.
 */
const axios = require("axios");
const { clasificarErrorPostgrest } = require("../supabaseSafe");

function filaRpc(data) {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  return fila;
}

function tieneReloj(fila) {
  return Number.isFinite(Date.parse(fila?.ahora));
}

function destino(opciones = {}) {
  if (opciones.permitirRed !== true && !opciones.cliente) return null;
  const url = opciones.url || (opciones.permitirRed === true ? process.env.SUPABASE_URL : "");
  const key = opciones.key || (opciones.permitirRed === true ? process.env.SUPABASE_SECRET_KEY : "");
  if (!url || !key) return { motivo: "sin_supabase" };
  return {
    cliente: opciones.cliente || axios,
    url: String(url).replace(/\/+$/, ""),
    key,
  };
}

function motivoDeFallo(error) {
  const tipo = clasificarErrorPostgrest(error);
  if (tipo === "funcion_ausente") return "marca_no_instalada";
  if (tipo === "timeout") return "consulta_timeout";
  if (tipo === "permiso_denegado") return "permiso_denegado";
  return "marca_no_disponible";
}

async function rpc(ctx, nombre, body, timeoutMs) {
  return ctx.cliente.post(`${ctx.url}/rest/v1/rpc/${nombre}`, body, {
    headers: {
      apikey: ctx.key,
      Authorization: `Bearer ${ctx.key}`,
      "Content-Type": "application/json",
    },
    timeout: timeoutMs || 8000,
  });
}

async function llamar(opciones, nombre, body) {
  const ctx = destino(opciones);
  if (!ctx) return { ok: false, motivo: "marca_no_disponible", red: false };
  if (ctx.motivo) return { ok: false, motivo: ctx.motivo, red: false };
  try {
    const res = await rpc(ctx, nombre, body, opciones.timeoutMs);
    const fila = filaRpc(res?.data);
    if (!tieneReloj(fila)) return { ok: false, motivo: "reloj_postgres_ausente", red: true };
    return { ...fila, red: true };
  } catch (error) {
    return { ok: false, motivo: motivoDeFallo(error), red: true };
  }
}

function ids(opciones) {
  return {
    p_usuario_id: opciones.usuarioId == null ? "" : String(opciones.usuarioId),
    p_conexion_id: opciones.conexionId == null ? "" : String(opciones.conexionId),
    p_cliente_numero: opciones.numero == null ? "" : String(opciones.numero),
  };
}

function reservar(opciones) {
  return llamar(opciones, "limpieza_media_marca_reservar", {
    ...ids(opciones),
    p_owner: opciones.owner,
  });
}

function tomarEntrante(opciones) {
  return llamar(opciones, "limpieza_media_marca_entrante", {
    ...ids(opciones),
    p_owner: opciones.owner,
  });
}

function soltarEntrante(opciones) {
  return llamar(opciones, "limpieza_media_marca_soltar_entrante", {
    ...ids(opciones),
    p_owner: opciones.owner,
  });
}

function soltarReservado(opciones) {
  return llamar(opciones, "limpieza_media_marca_soltar_reservado", {
    ...ids(opciones),
    p_owner: opciones.owner,
  });
}

function pasarABorrando(opciones) {
  return llamar(opciones, "limpieza_media_marca_borrando", {
    ...ids(opciones),
    p_owner: opciones.owner,
    p_clave_archivo: opciones.claveArchivo,
  });
}

function registrarResultado(opciones) {
  return llamar(opciones, "limpieza_media_marca_resultado", {
    ...ids(opciones),
    p_owner: opciones.owner,
    p_resultado: opciones.resultado,
  });
}

function verificar(opciones) {
  return llamar(opciones, "limpieza_media_marca_verificar", {
    ...ids(opciones),
    p_resultado_verificado: opciones.resultadoVerificado,
    p_actor: opciones.actor,
    p_nota: opciones.nota || null,
  });
}

function liberar(opciones) {
  return llamar(opciones, "limpieza_media_marca_liberar", {
    ...ids(opciones),
    p_actor: opciones.actor,
    p_nota: opciones.nota || null,
  });
}

function consultar(opciones) {
  return llamar(opciones, "limpieza_media_marca_consultar", ids(opciones));
}

function listar(opciones = {}) {
  return llamar(opciones, "limpieza_media_marca_listar", {
    p_estado: opciones.estado || null,
  });
}

module.exports = {
  consultar,
  liberar,
  listar,
  pasarABorrando,
  registrarResultado,
  reservar,
  soltarEntrante,
  soltarReservado,
  tomarEntrante,
  verificar,
};
