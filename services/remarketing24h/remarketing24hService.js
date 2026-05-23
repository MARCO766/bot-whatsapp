const {
  ESTADOS_RM24H,
  MS_INACTIVIDAD,
  HORAS_INACTIVIDAD,
  ESTADOS_REINICIO_RESPUESTA,
} = require("./constants");
const repo = require("./remarketing24hRepository");
const { procesarPendientesDisparo } = require("./executeRemarketing24h");
const { nowUtc } = require("../seguimiento/timestamps");

function calcularExpiraEn() {
  return new Date(Date.now() + MS_INACTIVIDAD).toISOString();
}

function normalizarUltimoNodo(ultimoNodo) {
  if (!ultimoNodo || typeof ultimoNodo !== "object") return {};
  return {
    ultimo_nodo_id: ultimoNodo.id || ultimoNodo.nodoId || null,
    ultimo_nodo_tipo: ultimoNodo.tipo || ultimoNodo.tipoNodo || null,
    ultimo_nodo_nombre: ultimoNodo.nombre || ultimoNodo.label || null,
    ultimo_camino: ultimoNodo.camino || ultimoNodo.route || null,
  };
}

function flujoNombreValido(valor) {
  const s = String(valor ?? "").trim();
  return s.length > 0 ? s : null;
}

async function resolverFlujoNombreCancelacion({
  fila,
  usuario_id,
  flujo_id,
  flujo_nombre_hint,
}) {
  const existente = flujoNombreValido(fila?.flujo_nombre);
  if (existente) return existente;

  const hint = flujoNombreValido(flujo_nombre_hint);
  if (hint) return hint;

  if (!usuario_id || !flujo_id) return null;
  return repo.obtenerNombreFlujo(usuario_id, flujo_id);
}

async function iniciarRemarketing24h({
  usuario_id,
  cliente_numero,
  flujo_id,
  flujo_nombre,
  config,
}) {
  if (!usuario_id || !cliente_numero || !flujo_id) return null;

  const ahora = nowUtc();
  const expira_en = calcularExpiraEn();
  const mensaje = String(config?.mensajeRemarketing || "").trim() || null;

  const existente = await repo.buscarAbierto({
    usuario_id,
    cliente_numero,
    flujo_id: String(flujo_id),
  });

  const payload = {
    usuario_id,
    cliente_numero,
    flujo_id: String(flujo_id),
    flujo_nombre: flujo_nombre || null,
    estado: ESTADOS_RM24H.ACTIVO,
    activo: true,
    ultimo_mensaje_lead_at: ahora,
    expira_en,
    mensaje_remarketing: mensaje,
    config_snapshot: config || {},
    cancelado_en: null,
    motivo_cancelacion: null,
    disparado_en: null,
  };

  let fila;
  if (existente?.id) {
    fila = await repo.actualizarPorId(existente.id, payload);
  } else {
    fila = await repo.insertar({
      ...payload,
      contador_resets: 0,
      creado_en: ahora,
      actualizado_en: ahora,
    });
  }

  console.log("[RM24H] iniciado", {
    usuario_id,
    cliente: cliente_numero,
    flujo_id,
    expira_en,
    horas: HORAS_INACTIVIDAD,
  });

  return fila;
}

async function resetearRemarketing24h({
  usuario_id,
  cliente_numero,
  flujo_id,
  ultimoNodo,
}) {
  if (!usuario_id || !cliente_numero) return [];

  const ahora = nowUtc();
  const expira_en = calcularExpiraEn();
  const extraNodo = normalizarUltimoNodo(ultimoNodo);
  const actualizados = [];

  let filas = [];
  if (flujo_id) {
    const una = await repo.buscarAbierto({
      usuario_id,
      cliente_numero,
      flujo_id: String(flujo_id),
    });
    if (una) filas = [una];
  } else {
    filas = await repo.listarReinicioPorCliente(usuario_id, cliente_numero);
  }

  for (const fila of filas) {
    if (!ESTADOS_REINICIO_RESPUESTA.includes(fila.estado)) continue;

    const resets = (Number(fila.contador_resets) || 0) + 1;
    const actualizado = await repo.actualizarPorId(fila.id, {
      estado: ESTADOS_RM24H.ACTIVO,
      activo: true,
      ultimo_mensaje_lead_at: ahora,
      expira_en,
      contador_resets: resets,
      ...extraNodo,
    });
    actualizados.push(actualizado);

    console.log("[RM24H] reseteado por respuesta lead", {
      usuario_id,
      cliente: cliente_numero,
      flujo_id: fila.flujo_id,
      expira_en,
      contador_resets: resets,
    });
  }

  return actualizados;
}

async function cancelarRemarketing24h({
  usuario_id,
  cliente_numero,
  flujo_id,
  motivo,
  flujo_nombre: flujo_nombre_hint,
}) {
  if (!usuario_id || !cliente_numero || !flujo_id) return null;

  const fila = await repo.buscarAbierto({
    usuario_id,
    cliente_numero,
    flujo_id: String(flujo_id),
  });

  if (!fila?.id) return null;

  const esConversion = motivo === "conversion";
  const estado = esConversion
    ? ESTADOS_RM24H.CONVERTIDO
    : ESTADOS_RM24H.CANCELADO;

  const payload = {
    estado,
    activo: false,
    cancelado_en: nowUtc(),
    motivo_cancelacion: motivo || null,
  };

  let flujoNombreFinal = null;

  if (esConversion) {
    const flujoNombreAntes = flujoNombreValido(fila.flujo_nombre);
    console.log("[RM24H] cancelando por conversion");
    console.log("[RM24H] flujo_nombre antes:", flujoNombreAntes || "(vacío)");

    flujoNombreFinal = await resolverFlujoNombreCancelacion({
      fila,
      usuario_id,
      flujo_id: String(flujo_id),
      flujo_nombre_hint,
    });

    console.log("[RM24H] flujo_nombre final:", flujoNombreFinal || "(vacío)");

    if (flujoNombreFinal) {
      payload.flujo_nombre = flujoNombreFinal;
    }
  }

  const actualizado = await repo.actualizarPorId(fila.id, payload);

  if (esConversion) {
    console.log("[RM24H] cancelado por conversión", {
      usuario_id,
      cliente: cliente_numero,
      flujo_id,
      motivo,
      estado,
      flujo_nombre:
        actualizado?.flujo_nombre || flujoNombreFinal || fila.flujo_nombre || null,
    });
  } else {
    console.log("[RM24H] cancelado", {
      usuario_id,
      cliente: cliente_numero,
      flujo_id,
      motivo,
      estado,
    });
  }

  return actualizado;
}

async function listarVencidos() {
  return repo.listarVencidos();
}

async function marcarVencidosComoPendienteDisparo() {
  const vencidos = await listarVencidos();
  const marcados = [];

  for (const fila of vencidos) {
    await repo.marcarPendienteDisparo(fila.id);

    console.log("[RM24H] contador vencido");
    console.log("[RM24H] usuario", fila.usuario_id);
    console.log("[RM24H] cliente", fila.cliente_numero);
    console.log("[RM24H] flujo", fila.flujo_id, fila.flujo_nombre || "");
    console.log(
      "[RM24H] ultimo nodo",
      fila.ultimo_nodo_id,
      fila.ultimo_nodo_tipo,
      fila.ultimo_nodo_nombre
    );
    console.log("[RM24H] mensaje configurado", fila.mensaje_remarketing || "(vacío)");
    console.log("[RM24H] vencido", {
      id: fila.id,
      expira_en: fila.expira_en,
      estado_nuevo: ESTADOS_RM24H.PENDIENTE_DISPARO,
    });

    marcados.push(fila);
  }

  return marcados;
}

/** Ciclo worker Fase 2: vencer contadores → enviar pendiente_disparo */
async function procesarRemarketing24hWorker() {
  const vencidos = await marcarVencidosComoPendienteDisparo();
  const disparos = await procesarPendientesDisparo();

  return {
    vencidos: vencidos.length,
    pendientesProcesados: disparos.procesados,
    enviados: disparos.enviados,
  };
}

module.exports = {
  iniciarRemarketing24h,
  resetearRemarketing24h,
  cancelarRemarketing24h,
  listarVencidos,
  marcarVencidosComoPendienteDisparo,
  procesarRemarketing24hWorker,
  HORAS_INACTIVIDAD,
};
