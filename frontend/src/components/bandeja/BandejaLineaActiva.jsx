import React from "react";
import { CONEXION_TODAS, sameConexionId } from "../../utils/conexionesInbox";

function variantLinea(conexionesInbox, conexionId) {
  const idx = (conexionesInbox || []).findIndex((c) =>
    sameConexionId(c.id, conexionId)
  );
  return idx <= 0 ? "0" : "1";
}

/**
 * Badge superior: solo conexionActual de conexiones_whatsapp (tab seleccionado).
 */
export default function BandejaLineaActiva({
  conexionSeleccionadaId,
  conexionActual,
  conexionesInbox,
}) {
  if (!conexionesInbox?.length || !conexionSeleccionadaId) return null;

  if (conexionSeleccionadaId === CONEXION_TODAS) {
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

  if (!conexionActual?.id) return null;

  const nombre = String(conexionActual.nombre ?? "").trim();
  if (!nombre) return null;

  const esPrincipal = conexionActual.activo === true;
  const rol = esPrincipal ? "PRINCIPAL" : "SECUNDARIA";
  const variant = variantLinea(conexionesInbox, conexionActual.id);
  const pillKey = `${conexionActual.id}-${esPrincipal ? "p" : "s"}`;

  return (
    <div className="bandejaLineaActivaWrap">
      <div
        key={pillKey}
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
