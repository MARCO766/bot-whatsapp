import React from "react";
import { CONEXION_TODAS } from "../../hooks/useInbox";

export function etiquetaConexion(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

function indiceLinea(conexiones, conexionId) {
  const key = String(conexionId ?? "");
  const idx = conexiones.findIndex((c) => String(c.id) === key);
  return idx < 0 ? 0 : idx;
}

/**
 * Badge de línea activa: solo datos de la conexión resuelta (tab seleccionado).
 */
export default function BandejaLineaActiva({
  conexionSeleccionada,
  conexionActiva,
  conexiones,
}) {
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

  if (!conexionActiva) return null;

  const lineaIdx = indiceLinea(conexiones, conexionActiva.id);
  const variant = lineaIdx === 0 ? "0" : "1";
  const esPrincipal = Boolean(conexionActiva.activo);
  const rol = esPrincipal ? "PRINCIPAL" : "SECUNDARIA";
  const nombre = String(conexionActiva.nombre ?? "").trim() || etiquetaConexion(conexionActiva);
  const pillKey = `${String(conexionActiva.id)}-${esPrincipal ? "p" : "s"}-${nombre}`;

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
