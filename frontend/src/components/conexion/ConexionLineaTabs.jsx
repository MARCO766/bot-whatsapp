import React from "react";
import { CONEXION_TODAS, sameConexionId } from "../../utils/conexionesInbox";

const tabStyles = `
.flConexionPicker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 18px;
}
.flConexionTab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid #2a3140;
  background: #11151c;
  color: #94a3b8;
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.flConexionTab:hover {
  border-color: #3d4a5c;
  color: #e2e8f0;
}
.flConexionTab--active {
  border-color: #22c55e66;
  background: #22c55e14;
  color: #86efac;
}
.flConexionPrincipal {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.85;
  color: #22c55e;
}
`;

export default function ConexionLineaTabs({
  conexionesInbox = [],
  conexionSeleccionadaId,
  onSeleccionar,
  etiquetaTabConexion,
  className = "",
}) {
  if (!conexionesInbox.length) return null;

  const label = typeof etiquetaTabConexion === "function" ? etiquetaTabConexion : (c) => c?.nombre || c?.numero || "Línea";

  return (
    <>
      <style>{tabStyles}</style>
      <div className={`flConexionPicker ${className}`.trim()} role="tablist" aria-label="Línea WhatsApp">
        <button
          type="button"
          role="tab"
          aria-selected={conexionSeleccionadaId === CONEXION_TODAS}
          className={`flConexionTab ${
            conexionSeleccionadaId === CONEXION_TODAS ? "flConexionTab--active" : ""
          }`}
          onClick={() => onSeleccionar(CONEXION_TODAS)}
        >
          Todas las líneas
        </button>
        {conexionesInbox.map((c) => {
          const activa = sameConexionId(conexionSeleccionadaId, c.id);
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activa}
              className={`flConexionTab ${activa ? "flConexionTab--active" : ""}`}
              onClick={() => onSeleccionar(c.id)}
            >
              {label(c)}
              {c.activo && <span className="flConexionPrincipal">principal</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
