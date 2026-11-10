/**
 * Estado visible de una línea con los campos que ya devuelve GET /api/ajustes.
 * Token y Phone ID indican que la API está guardada, no una sesión en vivo.
 * `activo` marca la línea principal.
 */

function tieneToken(conexion) {
  return Boolean(
    conexion?.tiene_token || conexion?.token_masked || conexion?.tokenMasked
  );
}

function tienePhone(conexion) {
  return Boolean(String(conexion?.phone_id || conexion?.phoneNumberId || "").trim());
}

export function estadoDeLineaWhatsapp(conexion) {
  const token = tieneToken(conexion);
  const phone = tienePhone(conexion);

  if (token && phone) {
    return { key: "configurada", label: "API configurada" };
  }

  return { key: "sin-configurar", label: "API sin configurar" };
}

export const ESTADO_SIN_LINEAS = {
  key: "sin-numero",
  label: "Sin número configurado",
};
