/**
 * Marca durable que la limpieza toma antes de Storage.
 * La fila vive en PostgreSQL, vía las funciones de limpieza_media_marca.sql.
 * Mientras está reservada o en borrando, el webhook no inserta el entrante.
 * Este módulo no llama a Storage y no borra filas de mensajes.
 * Sin permitirRed y sin cliente no abre red.
 */
const marcaStore = require("./limpiezaMediaMarcaStore");

const RESULTADOS = new Set([
  "eliminado_confirmado",
  "no_eliminado_confirmado",
  "incierto",
]);

function rechazo(motivo) {
  return {
    bloqueaInsertos: false,
    sesionAbierta: false,
    sinVencimiento: false,
    sobreviveDesconexion: false,
    motivo: motivo || "intervalo_no_garantizado",
  };
}

function partesHilo(hilo) {
  const [usuarioId, conexionId, numero] = String(hilo || "").split("|");
  if (!usuarioId || !conexionId || !numero) return null;
  return { usuarioId, conexionId, numero };
}

function fichaEntrante(ids) {
  return {
    usuario_id: ids.usuarioId,
    conexion_whatsapp_id: ids.conexionId,
    cliente_numero: ids.numero,
  };
}

async function soltarReserva(base) {
  const suelta = await marcaStore.soltarReservado(base);
  if (suelta.ok !== true || suelta.storage === true || suelta.estado != null) {
    return { ok: false, motivo: suelta.motivo || "liberacion_fallida" };
  }
  return { ok: true, motivo: suelta.motivo || "soltada" };
}

async function abrirMarcaDurable(peticion = {}) {
  if (peticion.permitirRed !== true && !peticion.cliente) return rechazo("intervalo_no_garantizado");
  const ids = partesHilo(peticion.hilo);
  if (!ids || !peticion.workerId || !peticion.clave) return rechazo("valla_sin_hilo");
  const base = {
    ...peticion,
    ...ids,
    owner: `cl:${peticion.workerId}`,
  };
  const reserva = await marcaStore.reservar(base);
  if (reserva.ok !== true || reserva.estado !== "reservado") {
    return rechazo(reserva.motivo || "valla_ocupada");
  }

  let entranteObservadoMs = null;
  try {
    if (typeof peticion.leerUltimoEntrante !== "function") throw new Error("sin lectura");
    entranteObservadoMs = await peticion.leerUltimoEntrante(fichaEntrante(ids));
    if (entranteObservadoMs == null) throw new Error("sin entrante");
  } catch (error) {
    await soltarReserva(base);
    return rechazo("consulta_fallida");
  }

  const marca = {
    bloqueaInsertos: true,
    sesionAbierta: true,
    sinVencimiento: true,
    sobreviveDesconexion: true,
    entranteObservadoMs,
    owner: base.owner,
    hilo: peticion.hilo,
    async hayEspera() {
      return false;
    },
    async leerUltimoEntrante() {
      return peticion.leerUltimoEntrante(fichaEntrante(ids));
    },
    async leer() {
      const visto = await marcaStore.consultar(base);
      const fila = visto?.marca;
      if (!fila) return null;
      return {
        estado: fila.estado,
        owner: fila.owner,
        resultado: fila.resultado,
        claveArchivo: fila.clave_archivo,
      };
    },
    async promoverABorrando() {
      const paso = await marcaStore.pasarABorrando({ ...base, claveArchivo: peticion.clave });
      return { ok: paso.ok === true && paso.estado === "borrando" && paso.storage !== true };
    },
    async confirmar(estado) {
      const fila = await marca.leer();
      return { ok: fila?.estado === estado && fila?.owner === base.owner };
    },
    async fijar(campos) {
      if (!RESULTADOS.has(campos?.resultado)) return { ok: true };
      const paso = await marcaStore.registrarResultado({ ...base, resultado: campos.resultado });
      return { ok: paso.ok === true && paso.storage !== true };
    },
    async cerrar() {
      if (!marca.sesionAbierta) return { ok: true };
      const fila = await marca.leer();
      if (!fila || fila.owner !== base.owner) return { ok: false, motivo: "valla_ajena" };
      if (fila.estado === "borrando" || fila.resultado === "incierto" || fila.resultado != null) {
        return { ok: false, motivo: "resultado_incierto" };
      }
      if (fila.estado !== "reservado") return { ok: false, motivo: "valla_ajena" };
      const suelta = await soltarReserva(base);
      if (suelta.ok) marca.sesionAbierta = false;
      return suelta;
    },
    async soltarTrasExito() {
      const fila = await marca.leer();
      if (!fila || fila.owner !== base.owner) return { ok: false, motivo: "valla_ajena" };
      if (fila.estado !== "borrando") return { ok: false, motivo: "marca_no_resoluble" };
      if (fila.resultado == null) return { ok: false, motivo: "storage_en_curso" };
      if (fila.resultado === "incierto") return { ok: false, motivo: "resultado_incierto" };
      if (fila.resultado !== "eliminado_confirmado" && fila.resultado !== "no_eliminado_confirmado") {
        return { ok: false, motivo: "resultado_incierto" };
      }
      const ver = await marcaStore.verificar({
        ...base,
        resultadoVerificado: fila.resultado,
        actor: base.owner,
        nota: "cierre de limpieza",
      });
      if (ver.ok !== true || ver.storage === true) return { ok: false, motivo: ver.motivo || "verificacion_fallida" };
      const suelta = await marcaStore.liberar({
        ...base,
        actor: base.owner,
        nota: "cierre de limpieza",
      });
      if (suelta.liberada === true && suelta.storage !== true) marca.sesionAbierta = false;
      return { ok: suelta.liberada === true && suelta.storage !== true, motivo: suelta.motivo };
    },
  };
  return marca;
}

module.exports = {
  abrirMarcaDurable,
};
