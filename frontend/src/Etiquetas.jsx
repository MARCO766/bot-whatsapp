import React, { useEffect, useState } from "react";
import { etiquetasStyles } from "./etiquetas/styles";
import { useEtiquetas } from "./etiquetas/useEtiquetas";
import { loginUrl } from "./etiquetas/api";

function TagModal({ open, title, initial, saving, onClose, onSave }) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#22c55e");

  useEffect(() => {
    if (open) {
      setNombre(initial?.nombre || "");
      setColor(initial?.color || "#22c55e");
    }
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="etqModalBackdrop" onClick={onClose}>
      <div className="etqModal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="etqField">
          <label>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </div>
        <div className="etqField">
          <label>Color</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="etqModalActions">
          <button type="button" className="etqBtn etqBtnGhost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="etqBtn etqBtnPrimary"
            disabled={saving || !nombre.trim()}
            onClick={() => onSave({ nombre: nombre.trim(), color })}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Etiquetas() {
  const {
    etiquetas,
    total,
    loading,
    saving,
    apiError,
    toast,
    query,
    setQuery,
    crear,
    editar,
    eliminar,
  } = useEtiquetas();

  const [vista, setVista] = useState("lista");
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function handleSave(form) {
    const ok = modal?.mode === "edit"
      ? await editar(modal.item.id, form)
      : await crear(form);
    if (ok) setModal(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const ok = await eliminar(deleteTarget.id);
    if (ok) setDeleteTarget(null);
  }

  const totalLeads = etiquetas.reduce((s, t) => s + (t.leadsCount || 0), 0);

  return (
    <div className="etqPage">
      <style>{etiquetasStyles}</style>

      {toast && (
        <div className={`etqToast ${toast.type === "error" ? "err" : "ok"}`}>{toast.message}</div>
      )}

      <div className="etqTopBar">
        <div>
          <h1>🏷️ Etiquetas</h1>
          <p>Organiza leads y chats sin afectar conversiones</p>
        </div>
        <button
          type="button"
          className="etqBtn etqBtnPrimary"
          onClick={() => setModal({ mode: "create" })}
          disabled={!!apiError}
        >
          + Nueva etiqueta
        </button>
      </div>

      <p className="etqNote">
        Las etiquetas son organización. No suman ventas. Las ventas se registran con el nodo Conversión.
      </p>

      {apiError && (
        <div
          className="etqNote"
          style={{
            borderColor: "rgba(248,113,113,.4)",
            color: "#fecaca",
            background: "rgba(127,29,29,.25)",
          }}
        >
          {apiError.message}
          {apiError.code === "NO_AUTH" && (
            <>
              {" "}
              <a href={loginUrl()} style={{ color: "#fde047" }}>
                Iniciar sesión
              </a>
            </>
          )}
        </div>
      )}

      <div className="etqStats">
        <div className="etqStat">
          <b>{total}</b>
          <span>Etiquetas</span>
        </div>
        <div className="etqStat">
          <b>{totalLeads}</b>
          <span>Asignaciones en chats</span>
        </div>
        <div className="etqStat">
          <b>{etiquetas.length}</b>
          <span>Mostrando (filtro)</span>
        </div>
      </div>

      <div className="etqToolbar">
        <input
          className="etqSearch"
          placeholder="Buscar etiqueta..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="etqViewSwitch">
          <button type="button" className={vista === "lista" ? "on" : ""} onClick={() => setVista("lista")}>
            Vista Lista
          </button>
          <button type="button" className={vista === "tarjetas" ? "on" : ""} onClick={() => setVista("tarjetas")}>
            Vista Tarjetas
          </button>
        </div>
      </div>

      <div className="etqCard">
        {loading ? (
          <>
            <div className="etqSkel" />
            <div className="etqSkel" />
            <div className="etqSkel" />
          </>
        ) : etiquetas.length === 0 ? (
          <div className="etqEmpty">
            <p>
              {query
                ? "No hay etiquetas que coincidan con la búsqueda."
                : "Aún no tienes etiquetas. Crea la primera."}
            </p>
          </div>
        ) : vista === "tarjetas" ? (
          <div className="etqGrid">
            {etiquetas.map((t) => (
              <div key={t.id} className="etqTagCard" style={{ "--tag-color": t.color }}>
                <h3>{t.nombre}</h3>
                <p className="leads">{t.leadsCount || 0} leads</p>
                <div className="actions">
                  <button
                    type="button"
                    className="etqBtn etqBtnGhost"
                    onClick={() => setModal({ mode: "edit", item: t })}
                  >
                    Editar
                  </button>
                  <button type="button" className="etqBtn etqBtnDanger" onClick={() => setDeleteTarget(t)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="etqTable">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Color</th>
                <th>Leads</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {etiquetas.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="etqDot" style={{ background: t.color }} />
                    {t.nombre}
                  </td>
                  <td>
                    <code>{t.color}</code>
                  </td>
                  <td>{t.leadsCount || 0}</td>
                  <td style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="etqBtn etqBtnGhost"
                      onClick={() => setModal({ mode: "edit", item: t })}
                    >
                      Editar
                    </button>
                    <button type="button" className="etqBtn etqBtnDanger" onClick={() => setDeleteTarget(t)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TagModal
        open={!!modal}
        title={modal?.mode === "edit" ? "Editar etiqueta" : "Nueva etiqueta"}
        initial={modal?.item}
        saving={saving}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />

      {deleteTarget && (
        <div className="etqModalBackdrop" onClick={() => setDeleteTarget(null)}>
          <div className="etqModal" onClick={(e) => e.stopPropagation()}>
            <h2>¿Eliminar etiqueta?</h2>
            <p style={{ color: "#94a3b8", marginBottom: 16 }}>
              Se eliminará <strong style={{ color: "#fff" }}>{deleteTarget.nombre}</strong> y sus
              asignaciones en chats.
            </p>
            <div className="etqModalActions">
              <button type="button" className="etqBtn etqBtnGhost" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className="etqBtn etqBtnDanger" disabled={saving} onClick={handleDelete}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
