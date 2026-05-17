import React from "react";

export default function EmptyState({ onCreate, onImport, apiOnline }) {
  return (
    <div className="flEmpty">
      <div className="flEmptyIcon">🧩</div>
      <h3>No hay flujos que coincidan</h3>
      <p>
        {apiOnline
          ? "Crea tu primer flujo automatizado o importa una plantilla premium para empezar."
          : "Inicia sesión en el panel MacBot (puerto 3000) para sincronizar tus flujos reales."}
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        {apiOnline && (
          <>
            <button type="button" className="flBtn flBtnPrimary" onClick={onCreate}>
              + Nuevo flujo
            </button>
            <button type="button" className="flBtn flBtnGhost" onClick={onImport}>
              Importar plantilla
            </button>
          </>
        )}
        <a href="/admin?tab=flujos" className="flBtn flBtnGhost" style={{ textDecoration: "none" }}>
          Abrir panel admin
        </a>
      </div>
    </div>
  );
}
