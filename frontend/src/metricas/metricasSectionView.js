/**
 * loading: primera vez, sin datos, mostrar el esqueleto de esa sección.
 * updating: ya hay datos y llega una recarga; conservar lo pintado.
 * ready: datos asentados.
 * error: falló y no hay datos previos.
 * idle: la petición terminó sin datos ni error; no es un estado de carga.
 */
export function metricasSectionView({ hasData, pending, error }) {
  if (hasData && pending) return "updating";
  if (hasData) return "ready";
  if (pending) return "loading";
  if (error) return "error";
  return "idle";
}

/** Aviso de recarga fallida. Null si no hay datos previos, si sigue cargando o si ya no hay error. */
export function metricasReloadNotice({ hasData, pending, error }) {
  if (hasData && !pending && error) return error;
  return null;
}
