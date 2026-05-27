const MS_24H = 24 * 60 * 60 * 1000;

function fechaMensaje(msg) {
  const raw = msg?.creado_en || msg?.created_at || msg?.timestamp || msg?.fecha;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Último mensaje del lead (entrante), excluye sistema y salientes. */
export function getUltimoMensajeEntrante(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return null;

  let ultimo = null;
  let ultimoTs = -Infinity;

  for (const m of mensajes) {
    if (!m || m.direccion !== "entrante") continue;
    const d = fechaMensaje(m);
    if (!d) continue;
    const ts = d.getTime();
    if (ts > ultimoTs) {
      ultimoTs = ts;
      ultimo = m;
    }
  }

  return ultimo;
}

/**
 * @returns {{ abierta: boolean, msTranscurrido: number, msRestante: number, ultimoEntrante: object|null }}
 */
export function calcularVentana24h(mensajes, ahora = Date.now()) {
  const ultimoEntrante = getUltimoMensajeEntrante(mensajes);
  if (!ultimoEntrante) {
    return {
      abierta: false,
      msTranscurrido: MS_24H + 1,
      msRestante: 0,
      ultimoEntrante: null,
    };
  }

  const d = fechaMensaje(ultimoEntrante);
  const ts = d.getTime();
  const msTranscurrido = Math.max(0, ahora - ts);
  const msRestante = Math.max(0, MS_24H - msTranscurrido);

  return {
    abierta: msTranscurrido <= MS_24H,
    msTranscurrido,
    msRestante,
    ultimoEntrante,
  };
}

export function formatTiempoRestante(ms) {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${totalMin}m`;
}

export function etiquetaVentanaBadge(ventana) {
  if (ventana.abierta) {
    return `🟢 Ventana abierta · ${formatTiempoRestante(ventana.msRestante)} restantes`;
  }
  return "🔴 Ventana cerrada · pasaron 24h";
}
