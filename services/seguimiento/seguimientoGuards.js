const { existeMensajePorSeguimientoIdDuro } = require("./mensajesSeguimientoIdempotencia");

const CODIGOS_BLOQUEO = {
  CONEXION_MISMATCH_OPCIONES: "conexion_mismatch_opciones",
  CONEXION_MISMATCH_RESUELTA: "conexion_mismatch_resuelta",
  INBOX_MISMATCH: "inbox_mismatch",
  DUP_META: "dup_meta",
};

class SeguimientoBlockedError extends Error {
  constructor(code, details = {}) {
    super(details.message || code);
    this.name = "SeguimientoBlockedError";
    this.code = code;
    this.details = details;
  }
}

function esSeguimientoBlockedError(err) {
  return err?.name === "SeguimientoBlockedError";
}

function normalizarConexionId(conexionWhatsappId) {
  if (conexionWhatsappId == null || String(conexionWhatsappId).trim() === "") {
    return null;
  }
  return String(conexionWhatsappId).trim();
}

function conexionProgramadaSeguimiento(opciones) {
  return normalizarConexionId(
    opciones?.conexionWhatsappIdFila ?? opciones?.conexionWhatsappId
  );
}

function esSeguimientoOpciones(opciones) {
  return (
    opciones?.origen === "seguimiento" ||
    (opciones?.seguimientoId != null && String(opciones.seguimientoId).trim() !== "")
  );
}

function validarConexionPrePostMeta(opcionesEnvio) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return;

  const programada = conexionProgramadaSeguimiento(opcionesEnvio);
  const opcionesConn = normalizarConexionId(opcionesEnvio.conexionWhatsappId);

  if (!programada || !opcionesConn || programada !== opcionesConn) {
    console.log("[SEG_BLOCK_MISMATCH]", {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_opciones: opcionesConn,
    });
    throw new SeguimientoBlockedError(CODIGOS_BLOQUEO.CONEXION_MISMATCH_OPCIONES, {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_opciones: opcionesConn,
    });
  }
}

function validarConexionResuelta(opcionesEnvio, credenciales) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return;

  const programada = conexionProgramadaSeguimiento(opcionesEnvio);
  const resuelta = normalizarConexionId(credenciales?.resolvedConexionWhatsappId);

  if (!programada || !resuelta || programada !== resuelta) {
    console.log("[SEG_BLOCK_MISMATCH]", {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_resuelta: resuelta,
    });
    throw new SeguimientoBlockedError(CODIGOS_BLOQUEO.CONEXION_MISMATCH_RESUELTA, {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_resuelta: resuelta,
    });
  }
}

function validarConexionInbox(opcionesEnvio, conexionInbox) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return;

  const programada = conexionProgramadaSeguimiento(opcionesEnvio);
  const inboxConn = normalizarConexionId(conexionInbox);

  if (!programada || !inboxConn || programada !== inboxConn) {
    console.log("[SEG_BLOCK_INBOX_MISMATCH]", {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_inbox: inboxConn,
    });
    throw new SeguimientoBlockedError(CODIGOS_BLOQUEO.INBOX_MISMATCH, {
      seguimiento_id: opcionesEnvio.seguimientoId ?? null,
      conexion_programada: programada,
      conexion_inbox: inboxConn,
    });
  }
}

async function bloquearDuplicadoMeta(opcionesEnvio) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return null;

  const seguimientoId =
    opcionesEnvio.seguimientoId != null ? String(opcionesEnvio.seguimientoId).trim() : "";
  if (!seguimientoId) return null;

  const existente = await existeMensajePorSeguimientoIdDuro(seguimientoId);
  if (!existente) return null;

  console.log("[SEG_BLOCK_DUP_META]", {
    seguimiento_id: seguimientoId,
    mensaje_id: existente.id ?? null,
    conexion_mensaje: existente.conexion_whatsapp_id ?? null,
  });
  throw new SeguimientoBlockedError(CODIGOS_BLOQUEO.DUP_META, {
    seguimiento_id: seguimientoId,
    mensaje_id: existente.id ?? null,
  });
}

async function aplicarGuardsSeguimientoPreMeta(opcionesEnvio, credenciales) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return;
  validarConexionPrePostMeta(opcionesEnvio);
  validarConexionResuelta(opcionesEnvio, credenciales);
  await bloquearDuplicadoMeta(opcionesEnvio);
}

function logSegPostMetaFinal(opcionesEnvio, credenciales, mensajeMetaId) {
  if (!esSeguimientoOpciones(opcionesEnvio)) return;
  console.log("[SEG_POST_META_FINAL]", {
    seguimiento_id: opcionesEnvio.seguimientoId ?? null,
    campana_id: opcionesEnvio.campanaId ?? null,
    paso_index: opcionesEnvio.pasoIndex ?? null,
    cliente_numero: opcionesEnvio.clienteNumero ?? null,
    conexion_whatsapp_id_programada: conexionProgramadaSeguimiento(opcionesEnvio),
    conexion_whatsapp_id_resuelta: credenciales?.resolvedConexionWhatsappId ?? null,
    phone_id: credenciales?.phoneIdEnviar ?? null,
    mensaje_meta_id: mensajeMetaId ?? null,
    pid: process.pid,
    worker_instance_id: global.__macbotSeguimientoWorkerInstanceId ?? null,
  });
}

module.exports = {
  SeguimientoBlockedError,
  CODIGOS_BLOQUEO,
  esSeguimientoBlockedError,
  conexionProgramadaSeguimiento,
  validarConexionPrePostMeta,
  validarConexionResuelta,
  validarConexionInbox,
  bloquearDuplicadoMeta,
  aplicarGuardsSeguimientoPreMeta,
  logSegPostMetaFinal,
};
