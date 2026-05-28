import React, { useEffect, useState } from "react";
import { TIPOS_ACTIVADOR } from "../../activadores/constants";

const EMPTY = {
  nombre: "",
  tipo_activador: "palabra_unica",
  palabra_clave: "",
  palabras_clave_text: "",
  flujo_id: "",
  estado: "activo",
  coincidencia: "contiene",
  prioridad: 0,
  repetible: true,
};

export default function ActivadorModal({
  open,
  activador,
  flujos,
  puedeEscribir,
  onSave,
  onClose,
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (activador) {
      const tipo = activador.tipo_activador || "palabra_unica";
      setForm({
        nombre: activador.nombre || "",
        tipo_activador: tipo,
        palabra_clave:
          tipo === "palabra_unica" ? activador.palabra_clave || activador.frase || "" : "",
        palabras_clave_text:
          tipo === "multiples_palabras"
            ? activador.palabras_clave_text ||
              activador.palabras_clave_array?.join(", ") ||
              activador.frase ||
              ""
            : "",
        flujo_id: activador.flujo_id || "",
        estado: activador.estado || (activador.activo ? "activo" : "pausado"),
        coincidencia: activador.coincidencia || "contiene",
        prioridad: activador.prioridad ?? 0,
        repetible: activador.repetible !== false,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, activador]);

  if (!open) return null;

  const esCualquier = form.tipo_activador === "cualquier_mensaje";
  const esMultiples = form.tipo_activador === "multiples_palabras";
  const esUnica = form.tipo_activador === "palabra_unica";

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function buildPayload() {
    const base = {
      nombre: form.nombre,
      tipo_activador: form.tipo_activador,
      flujo_id: form.flujo_id,
      estado: form.estado,
      coincidencia: form.coincidencia,
      prioridad: form.prioridad,
      repetible: form.repetible,
    };

    if (esCualquier) return base;
    if (esMultiples) {
      return { ...base, palabras_clave_text: form.palabras_clave_text };
    }
    return { ...base, palabra_clave: form.palabra_clave };
  }

  function validate() {
    if (!form.flujo_id) return false;
    if (esCualquier) return true;
    if (esMultiples) {
      return (
        form.palabras_clave_text
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean).length > 0
      );
    }
    return Boolean(form.palabra_clave.trim());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!puedeEscribir) return;
    if (!validate()) return;
    setSaving(true);
    const ok = await onSave(buildPayload(), activador?.id);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="actModalOverlay" onClick={onClose} role="presentation">
      <div className="actModal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h2>{activador ? "Editar activador" : "Nuevo activador"}</h2>
        <p className="sub">
          Define cómo se dispara el flujo cuando el lead escribe por WhatsApp en la línea
          seleccionada.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="actField">
            <label>Nombre (opcional)</label>
            <input
              value={form.nombre}
              onChange={(e) => setField("nombre", e.target.value)}
              placeholder="Ej: Bienvenida automática"
            />
          </div>

          <div className="actField">
            <label>Tipo de activador</label>
            <select
              value={form.tipo_activador}
              onChange={(e) => setField("tipo_activador", e.target.value)}
            >
              {TIPOS_ACTIVADOR.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {esUnica && (
            <div className="actField">
              <label>Palabra clave *</label>
              <input
                value={form.palabra_clave}
                onChange={(e) => setField("palabra_clave", e.target.value)}
                placeholder="Ej: info"
                required
              />
            </div>
          )}

          {esMultiples && (
            <div className="actField">
              <label>Palabras clave (separadas por coma) *</label>
              <textarea
                value={form.palabras_clave_text}
                onChange={(e) => setField("palabras_clave_text", e.target.value)}
                placeholder="info,precio,costo,curso"
                required
              />
            </div>
          )}

          {esCualquier && (
            <p className="actHint">
              Se activará con cualquier mensaje de texto entrante (hola, info, emojis, etc.).
            </p>
          )}

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
            {!flujos.length && (
              <p className="actHint">No hay flujos en esta línea. Créalos en la pantalla Flujos.</p>
            )}
          </div>

          {!esCualquier && (
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
          )}

          {esCualquier && (
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
          )}

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
            <button
              type="submit"
              className="actBtn actBtnPrimary"
              disabled={saving || !puedeEscribir}
            >
              {saving ? "Guardando…" : activador ? "Guardar" : "Crear activador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
