import React, { useState } from "react";
import ActivadorModal from "./components/activadores/ActivadorModal";
import ActivadorDeleteModal from "./components/activadores/ActivadorDeleteModal";
import { activadoresStyles } from "./activadores/styles";
import { useActivadores } from "./activadores/useActivadores";
import { loginUrl } from "./activadores/api";
import { displayActivadorTrigger, labelTipoActivador } from "./activadores/constants";

function formatFecha(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-BO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function Activadores() {
  const {
    activadores,
    flujos,
    stats,
    loading,
    apiOnline,
    apiError,
    toast,
    query,
    setQuery,
    filtroFlujo,
    setFiltroFlujo,
    filtroEstado,
    setFiltroEstado,
    guardar,
    eliminar,
    toggle,
    load,
  } = useActivadores();

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditItem(null);
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setModalOpen(true);
  }

  async function handleConfirmDelete() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    const ok = await eliminar(confirmDelete.id);
    setDeleting(false);
    if (ok) setConfirmDelete(null);
  }

  return (
    <div className="actPage">
      <style>{activadoresStyles}</style>

      {toast && (
        <div className={`actToast ${toast.type === "error" ? "error" : "success"}`}>
          {toast.message}
        </div>
      )}

      <div className="actTopBar">
        <div>
          <h1>⚡ Activadores</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.88rem" }}>
            Palabras clave que disparan flujos automáticamente por WhatsApp.
          </p>
        </div>
        <button type="button" className="actBtn actBtnPrimary" onClick={openCreate} disabled={!apiOnline}>
          + Nuevo activador
        </button>
      </div>

      {apiError && (
        <div className="actApiBanner">
          <strong>{apiError.code === "NO_AUTH" ? "Sesión requerida" : "API no disponible"}</strong>
          <p style={{ margin: "8px 0 0" }}>{apiError.message}</p>
          {apiError.code === "NO_AUTH" && (
            <p style={{ marginTop: 10 }}>
              <a href={loginUrl()} style={{ color: "#fde047" }}>
                Iniciar sesión en MacBot →
              </a>
            </p>
          )}
        </div>
      )}

      <div className="actStats">
        <div className="actStatCard yellow">
          <span>Total</span>
          <h3>{stats.total}</h3>
        </div>
        <div className="actStatCard green">
          <span>Activos</span>
          <h3>{stats.activos}</h3>
        </div>
        <div className="actStatCard gray">
          <span>Pausados</span>
          <h3>{stats.pausados}</h3>
        </div>
        <div className="actStatCard cyan">
          <span>Usados hoy</span>
          <h3>{stats.usados_hoy}</h3>
        </div>
      </div>

      <div className="actToolbar">
        <input
          className="actSearch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar palabra, flujo o nombre…"
        />
        <select
          className="actSelect"
          value={filtroFlujo}
          onChange={(e) => setFiltroFlujo(e.target.value)}
        >
          <option value="all">Todos los flujos</option>
          {flujos.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
        <select
          className="actSelect"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
        >
          <option value="all">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="pausado">Pausados</option>
        </select>
        <button type="button" className="actBtn actBtnGhost" onClick={load} disabled={loading}>
          ↻ Actualizar
        </button>
      </div>

      {loading ? (
        <div className="actGrid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="actSkeleton" />
          ))}
        </div>
      ) : activadores.length === 0 ? (
        <div className="actEmpty">
          <h2>Sin activadores</h2>
          <p>
            Crea tu primer activador para que un mensaje como &quot;info&quot; ejecute un flujo
            automáticamente.
          </p>
          <button type="button" className="actBtn actBtnPrimary" onClick={openCreate} disabled={!apiOnline}>
            + Nuevo activador
          </button>
        </div>
      ) : (
        <div className="actGrid">
          {activadores.map((a) => (
            <article key={a.id} className="actCard">
              <div className="actCardTop">
                <div>
                  <div className="actTipoBadge">{labelTipoActivador(a.tipo_activador)}</div>
                  <div className="actKeyword">
                    {a.tipo_activador === "cualquier_mensaje"
                      ? "Cualquier mensaje"
                      : `"${displayActivadorTrigger(a)}"`}
                  </div>
                </div>
                <span className={`actBadge ${a.estado}`}>{a.estado}</span>
              </div>
              <div className="actMeta">
                <div>
                  Flujo: <b>{a.flujo_nombre || a.flujo_id || "—"}</b>
                </div>
                {a.tipo_activador !== "cualquier_mensaje" ? (
                  <div>
                    Coincidencia: <b>{a.coincidencia}</b> · Prioridad: <b>{a.prioridad}</b>
                  </div>
                ) : (
                  <div>
                    Prioridad: <b>{a.prioridad}</b>
                  </div>
                )}
                <div>
                  Usos: <b>{a.veces_usado}</b> · Última: <b>{formatFecha(a.ultima_ejecucion)}</b>
                </div>
              </div>
              <div className="actCardActions">
                <button type="button" className="actBtn actBtnGhost" onClick={() => openEdit(a)}>
                  Editar
                </button>
                <button type="button" className="actBtn actBtnGhost" onClick={() => toggle(a.id)}>
                  {a.estado === "activo" ? "Pausar" : "Activar"}
                </button>
                <button
                  type="button"
                  className="actBtn actBtnDanger"
                  onClick={() => setConfirmDelete(a)}
                >
                  Eliminar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <ActivadorModal
        open={modalOpen}
        activador={editItem}
        flujos={flujos}
        onSave={guardar}
        onClose={() => {
          setModalOpen(false);
          setEditItem(null);
        }}
      />

      <ActivadorDeleteModal
        open={Boolean(confirmDelete)}
        palabra={
          confirmDelete?.tipo_activador === "cualquier_mensaje"
            ? "Cualquier mensaje"
            : displayActivadorTrigger(confirmDelete || {})
        }
        deleting={deleting}
        onCancel={() => {
          if (!deleting) setConfirmDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
