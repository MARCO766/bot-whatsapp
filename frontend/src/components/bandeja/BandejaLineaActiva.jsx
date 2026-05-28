import React from "react";
import { CONEXION_TODAS } from "../../hooks/useInbox";

export function etiquetaConexion(c) {
  if (c.nombre?.trim()) return c.nombre.trim();
  if (c.numero?.trim()) return c.numero.trim();
  return `Línea ${String(c.phone_id || "").slice(-4) || "—"}`;
}

function indiceLinea(conexiones, conexionId) {
  const idx = conexiones.findIndex((c) => c.id === conexionId);
  return idx < 0 ? 0 : idx;
}

/**
 * Badge de línea activa en el header de Bandeja (desde conexión seleccionada en tabs).
 */
export default function BandejaLineaActiva({ conexionSeleccionada, conexiones }) {
  if (!conexiones?.length || !conexionSeleccionada) return null;

  if (conexionSeleccionada === CONEXION_TODAS) {
    return (
      <div className="bandejaLineaActivaWrap">
        <div
          key={CONEXION_TODAS}
          className="bandejaLineaPill bandejaLineaPill--todas"
          role="status"
          aria-live="polite"
          aria-label="Vista: todas las líneas WhatsApp"
        >
          <span className="bandejaLineaDot bandejaLineaDot--todas" aria-hidden="true" />
          <span className="bandejaLineaNombre">Todas las líneas</span>
        </div>
      </div>
    );
  }

  const conexion = conexiones.find((c) => c.id === conexionSeleccionada);
  if (!conexion) return null;

  const lineaIdx = indiceLinea(conexiones, conexion.id);
  const variant = lineaIdx === 0 ? "0" : "1";
  const esPrincipal = Boolean(conexion.activo);
  const rol = esPrincipal ? "PRINCIPAL" : "SECUNDARIA";
  const nombre = etiquetaConexion(conexion);

  return (
    <div className="bandejaLineaActivaWrap">
      <div
        key={conexion.id}
        className={`bandejaLineaPill bandejaLineaPill--linea${variant}`}
        role="status"
        aria-live="polite"
        aria-label={`Línea activa: ${nombre}, ${rol}`}
      >
        <span
          className={`bandejaLineaDot bandejaLineaDot--linea${variant}`}
          aria-hidden="true"
        />
        <span className="bandejaLineaNombre">{nombre}</span>
        <span className="bandejaLineaSep" aria-hidden="true">
          •
        </span>
        <span
          className={`bandejaLineaRol bandejaLineaRol--${
            esPrincipal ? "principal" : "secundaria"
          }`}
        >
          {rol}
        </span>
      </div>
    </div>
  );
}
