import React, { useRef, useState } from "react";
import { IMPORT_TEMPLATES } from "../../flujos/constants";

export default function ImportFlowModal({
  open,
  onClose,
  onImport,
  onImportJson,
  onJsonParseError,
  puedeEscribir = false,
}) {
  const fileRef = useRef(null);
  const [jsonBusy, setJsonBusy] = useState(false);

  if (!open) return null;

  async function handleJsonFile(e) {
    const file = e.target.files?.[0];
    if (!file || !onImportJson) return;

    if (!puedeEscribir) return;

    setJsonBusy(true);
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("El archivo no es un JSON válido");
      }
      const ok = await onImportJson(parsed);
      if (ok) onClose();
    } catch (err) {
      onJsonParseError?.(err?.message || "No se pudo leer el archivo");
    } finally {
      setJsonBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div className="flModal flModalWide" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>Importar flujo</h2>
        <p className="sub">
          Plantillas vacías o archivo JSON exportado desde MacBot. El flujo se crea en la línea
          WhatsApp seleccionada.
        </p>

        <div className="flImportJsonBlock">
          <div className="flImportJsonHead">
            <strong>Subir JSON</strong>
            <span className="flImportJsonHint">Formato export v1 o legacy</span>
          </div>
          {!puedeEscribir ? (
            <p className="flImportJsonWarn">
              Selecciona una línea WhatsApp específica (no «Todas las líneas») para importar un
              archivo.
            </p>
          ) : (
            <label className="flImportJsonLabel">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="flImportJsonInput"
                disabled={jsonBusy}
                onChange={handleJsonFile}
              />
              <span className="flBtn flBtnGhost flImportJsonBtn">
                {jsonBusy ? "Importando…" : "Elegir archivo .json"}
              </span>
            </label>
          )}
        </div>

        <div className="flImportDivider">
          <span>Plantillas base</span>
        </div>

        <div className="flTemplateGrid">
          {IMPORT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="flTemplateCard"
              disabled={!puedeEscribir}
              title={
                puedeEscribir
                  ? undefined
                  : "Selecciona una línea WhatsApp (no «Todas las líneas»)"
              }
              onClick={() => onImport(tpl.id)}
            >
              <span style={{ fontSize: "1.6rem" }}>{tpl.icon}</span>
              <div>
                <strong style={{ color: "#e2e8f0", display: "block", marginBottom: 4 }}>
                  {tpl.title}
                </strong>
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>{tpl.desc}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flModalActions">
          <button type="button" className="flBtn flBtnGhost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
