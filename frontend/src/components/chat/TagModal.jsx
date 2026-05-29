import React, { useEffect, useState } from "react";

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

  useEffect(() => {
    setEtiqueta(etiquetasDisponibles[0]?.nombre || "");
  }, [numero, etiquetasDisponibles]);

  if (!numero) return null;

  const sinEtiquetas = etiquetasDisponibles.length === 0;

  return (
    <div className="tagModalOverlay" onClick={onCerrar}>
      <div className="tagModalBox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tagModalClose" onClick={onCerrar}>
          ×
        </button>
        <h3>🏷️ Etiquetar chat</h3>
        <p className="tagModalNum">{numero}</p>

        {sinEtiquetas ? (
          <p className="tagModalEmpty">
            No hay etiquetas en esta línea. Créalas en la sección Etiquetas.
          </p>
        ) : (
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
        )}

        <button
          type="button"
          className="tagSave"
          disabled={sinEtiquetas || !etiqueta}
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
