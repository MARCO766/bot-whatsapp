import React, { useState } from "react";

export default function TagModal({
  numero,
  etiquetasDisponibles,
  mapaColores,
  onGuardar,
  onQuitar,
  onCerrar,
}) {
  const [etiqueta, setEtiqueta] = useState(
    etiquetasDisponibles[0]?.nombre || ""
  );

  if (!numero) return null;

  return (
    <div className="tagModalOverlay" onClick={onCerrar}>
      <div className="tagModalBox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tagModalClose" onClick={onCerrar}>
          ×
        </button>
        <h3>🏷️ Etiquetar chat</h3>
        <p className="tagModalNum">{numero}</p>

        <select
          value={etiqueta}
          onChange={(e) => setEtiqueta(e.target.value)}
        >
          {etiquetasDisponibles.map((et) => (
            <option key={et.nombre} value={et.nombre}>
              {et.nombre}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="tagSave"
          style={{
            background:
              mapaColores[etiqueta] ||
              etiquetasDisponibles.find((e) => e.nombre === etiqueta)?.color ||
              "#22c55e",
          }}
          onClick={() => onGuardar(numero, etiqueta)}
        >
          Guardar etiqueta
        </button>

        <button
          type="button"
          className="tagRemove"
          onClick={() => onQuitar(numero)}
        >
          Quitar etiqueta
        </button>
      </div>
    </div>
  );
}
