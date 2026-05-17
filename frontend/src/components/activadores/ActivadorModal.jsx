import React, { useEffect, useState } from "react";

const EMPTY = {
  nombre: "",
  palabra_clave: "",
  flujo_id: "",
  estado: "activo",
  coincidencia: "contiene",
  prioridad: 0,
  conexion: "WhatsApp",
  repetible: true,
};

export default function ActivadorModal({ open, activador, flujos, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (activador) {
      setForm({
        nombre: activador.nombre || "",
        palabra_clave: activador.palabra_clave || activador.frase || "",
        flujo_id: activador.flujo_id || "",
        estado: activador.estado || (activador.activo ? "activo" : "pausado"),
        coincidencia: activador.coincidencia || "contiene",
        prioridad: activador.prioridad ?? 0,
        conexion: activador.conexion || "WhatsApp",
        repetible: activador.repetible !== false,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, activador]);

  if (!open) return null;

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.palabra_clave.trim()) return;
    if (!form.flujo_id) return;
    setSaving(true);
    const ok = await onSave(form, activador?.id);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="actModalOverlay" onClick={onClose} role="presentation">
      <div className="actModal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>{activador ? "Editar activador" : "Nuevo activador"}</h2>
        <p className="sub">
          La palabra clave dispara el flujo cuando el lead escribe por WhatsApp.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="actField">
            <label>Nombre (opcional)</label>
            <input
              value={form.nombre}
              onChange={(e) => setField("nombre", e.target.value)}
              placeholder="Ej: Info productos"
            />
          </div>

          <div className="actField">
            <label>Palabra clave *</label>
            <input
              value={form.palabra_clave}
              onChange={(e) => setField("palabra_clave", e.target.value)}
              placeholder="Ej: info"
              required
            />
          </div>

          <div className="actField">
            <label>Flujo asignado *</label>
            <select
              value={form.flujo_id}
              onChange={(e) => setField("flujo_id", e.target.value)}
              required
            >
              <option value="">Seleccionar flujo…</option>
              {flujos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="actRow2">
            <div className="actField">
              <label>Coincidencia</label>
              <select
                value={form.coincidencia}
                onChange={(e) => setField("coincidencia", e.target.value)}
              >
                <option value="contiene">Contiene</option>
                <option value="exacta">Exacta</option>
              </select>
            </div>

            <div className="actField">
              <label>Prioridad</label>
              <input
                type="number"
                min={0}
                max={999}
                value={form.prioridad}
                onChange={(e) => setField("prioridad", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="actRow2">
            <div className="actField">
              <label>Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setField("estado", e.target.value)}
              >
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
              </select>
            </div>

            <div className="actField">
              <label>Conexión</label>
              <input
                value={form.conexion}
                onChange={(e) => setField("conexion", e.target.value)}
              />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.repetible}
              onChange={(e) => setField("repetible", e.target.checked)}
            />
            <span style={{ fontSize: "0.88rem", color: "#94a3b8" }}>Repetible</span>
          </label>

          <div className="actModalActions">
            <button type="button" className="actBtn actBtnGhost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="actBtn actBtnPrimary" disabled={saving}>
              {saving ? "Guardando…" : activador ? "Guardar" : "Crear activador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
