export const CONEXION_TODAS = "__todas__";

/**
 * Valor para query/body API: solo UUID de línea.
 * "Todas las líneas" (CONEXION_TODAS) → undefined (no enviar param).
 */
export function apiConexionWhatsappParam(conexionWhatsappId) {
  if (conexionWhatsappId == null) return undefined;
  const raw = String(conexionWhatsappId).trim();
  if (!raw || raw === CONEXION_TODAS) return undefined;
  return raw;
}

/** Comparación estable de UUID / id de conexiones_whatsapp */
export function sameConexionId(a, b) {
  if (a == null || b == null) return false;
  if (a === CONEXION_TODAS || b === CONEXION_TODAS) return a === b;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/** Filas de GET /api/inbox/conexiones → conexiones_whatsapp */
export function normalizeConexionesInbox(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((row) => {
      const id = row?.id;
      if (id == null || id === "") return null;
      return {
        ...row,
        id: String(id),
        nombre: row.nombre != null ? String(row.nombre) : "",
        numero: row.numero != null ? String(row.numero) : "",
        phone_id: row.phone_id != null ? String(row.phone_id) : "",
        activo: row.activo === true,
      };
    })
    .filter(Boolean);
}

export function findConexionInbox(conexionesInbox, conexionSeleccionadaId) {
  if (
    !conexionSeleccionadaId ||
    conexionSeleccionadaId === CONEXION_TODAS ||
    !Array.isArray(conexionesInbox)
  ) {
    return null;
  }
  return (
    conexionesInbox.find((c) => sameConexionId(c.id, conexionSeleccionadaId)) ??
    null
  );
}
