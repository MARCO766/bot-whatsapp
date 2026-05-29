import React, { useEffect, useState } from "react";
import { CARPETA_CATEGORIAS } from "../../flujos/constants";

export default function CarpetaModal({ open, mode = "create", carpeta, saving, onClose, onSubmit }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(CARPETA_CATEGORIAS[0]?.id || "ventas_automaticas");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && carpeta) {
      setNombre(carpeta.nombre || "");
      setCategoria(carpeta.categoria || CARPETA_CATEGORIAS[0]?.id);
      return;
    }
    setNombre("");
    setCategoria(CARPETA_CATEGORIAS[0]?.id || "ventas_automaticas");
  }, [open, mode, carpeta]);

  if (!open) return null;

  const titulo = mode === "edit" ? "Editar carpeta" : "Nueva carpeta";
  const subtitulo =
    mode === "edit"
      ? "Actualiza el nombre o la categoría visual de esta carpeta personalizada."
      : "Crea una carpeta solo para la línea WhatsApp seleccionada.";

  function handleSubmit(e) {
    e.preventDefault();
    const nombreTrim = nombre.trim();
    if (!nombreTrim) return;
    onSubmit({ nombre: nombreTrim, categoria });
  }

  return (
    <div className="flModalOverlay" onClick={onClose} role="presentation">
      <div className="flModal flModalCarpeta" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>{titulo}</h2>
        <p className="sub">{subtitulo}</p>

        <form onSubmit={handleSubmit}>
          <label className="flFormField">
            <span className="flFormLabel">Nombre</span>
            <input
              className="flInput"
              placeholder="Ej. Black Friday 2026"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </label>

          <label className="flFormField">
            <span className="flFormLabel">Categoría visual</span>
            <select
              className="flSelect flSelectFull"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CARPETA_CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flModalActions">
            <button type="button" className="flBtn flBtnGhost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className="flBtn flBtnPrimary"
              disabled={saving || !nombre.trim()}
            >
              {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear carpeta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
