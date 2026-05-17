import React, { useState } from "react";
import FlowFolders from "./components/flujos/FlowFolders";
import FlowList from "./components/flujos/FlowList";
import FlujosHeaderStats from "./components/flujos/FlujosHeaderStats";
import { useFlujosHeaderStats } from "./flujos/useFlujosHeaderStats";
import ConfirmModal from "./components/flujos/ConfirmModal";
import ImportFlowModal from "./components/flujos/ImportFlowModal";
import { FLOW_STATES } from "./flujos/constants";
import { flujosStyles } from "./flujos/styles";
import { SORT_OPTIONS } from "./flujos/constants";
import { useFlujos } from "./flujos/useFlujos";
import { loginUrl } from "./flujos/api";

export default function Flujos() {
  const {
    filtered,
    loading,
    apiOnline,
    apiError,
    apiUrl,
    toast,
    query,
    setQuery,
    folder,
    setFolder,
    estado,
    setEstado,
    activador,
    setActivador,
    nodeType,
    setNodeType,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    folderCounts,
    showToast,
    toggleEstado,
    moveToFolder,
    crearFlujo,
    importar,
    duplicar,
    eliminar,
    renombrar,
    updateMeta,
    load,
  } = useFlujos();

  const headerStats = useFlujosHeaderStats(true);

  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");

  async function handleCreate() {
    if (!newFlowName.trim()) return;
    await crearFlujo(newFlowName.trim());
    setNewFlowName("");
    setNewFlowOpen(false);
  }

  function handleEditName(flow) {
    const nombre = prompt("Nuevo nombre del flujo:", flow.nombre);
    if (!nombre?.trim()) return;
    renombrar(flow.id, nombre.trim());
  }

  return (
    <div className="flujosPage">
      <style>{flujosStyles}</style>

      {toast && (
        <div className={`flToast ${toast.type === "error" ? "error" : "success"}`}>{toast.message}</div>
      )}

      <div className="flTopBar">
        <div>
          <h1>Flujos</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.88rem" }}>
            Automatizaciones premium · MacBot CRM
          </p>
        </div>
        <div className="flTopActions">
          <button type="button" className="flBtn flBtnGhost" onClick={() => setImportOpen(true)}>
            Importar flujo
          </button>
          <button type="button" className="flBtn flBtnPrimary" onClick={() => setNewFlowOpen(true)}>
            + Nuevo flujo
          </button>
        </div>
      </div>

      {!apiOnline && !loading && apiError && (
        <div className={`flApiBanner ${apiError.code !== "NO_AUTH" ? "error" : ""}`}>
          <strong>
            {apiError.code === "NO_AUTH" && "Sesión requerida"}
            {apiError.code === "NETWORK" && "Sin conexión al backend"}
            {apiError.code === "API_UNAVAILABLE" && "API no disponible en esta URL"}
            {apiError.code === "SERVER" && "Error del servidor"}
          </strong>
          <p style={{ margin: "8px 0 0" }}>{apiError.message}</p>
          <p style={{ margin: "6px 0 0", opacity: 0.85 }}>
            Endpoint: <code>{apiUrl}</code>
          </p>
          <div className="flApiBannerActions">
            <button type="button" className="flBtn flBtnGhost" onClick={load}>
              Reintentar
            </button>
            {apiError.code === "NO_AUTH" && (
              <a href={loginUrl()} className="flBtn flBtnPrimary" style={{ textDecoration: "none" }}>
                Iniciar sesión
              </a>
            )}
          </div>
        </div>
      )}

      <FlujosHeaderStats
        data={headerStats.data}
        loading={headerStats.loading}
        error={headerStats.error}
        onRetry={headerStats.reload}
      />

      <FlowFolders active={folder} onChange={setFolder} counts={folderCounts} />

      <div className="flToolbar">
        <div className="flSearch">
          <span>🔍</span>
          <input
            type="search"
            placeholder="Buscar por nombre, carpeta, activador, etiquetas, nodos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="flSelect" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="all">Todos los estados</option>
          {FLOW_STATES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="flSelect" value={activador} onChange={(e) => setActivador(e.target.value)}>
          <option value="all">Activadores</option>
          <option value="activo">Con activador activo</option>
          <option value="inactivo">Sin activador activo</option>
        </select>
        <select className="flSelect" value={nodeType} onChange={(e) => setNodeType(e.target.value)}>
          <option value="all">Tipo de nodo</option>
          <option value="inicio">Inicio</option>
          <option value="contenido">Contenido</option>
          <option value="seguimiento">Seguimiento</option>
          <option value="espera">Espera</option>
          <option value="etiqueta">Etiqueta</option>
        </select>
        <select className="flSelect" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flViewToggle">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
          >
            Tarjetas
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
          >
            Lista
          </button>
        </div>
      </div>

      <FlowList
        flows={filtered}
        loading={loading}
        viewMode={viewMode}
        apiOnline={apiOnline}
        onToggleEstado={toggleEstado}
        onDuplicate={duplicar}
        onDelete={(flow) => setConfirmDelete(flow)}
        onMoveFolder={moveToFolder}
        onEditName={handleEditName}
        onCreate={() => setNewFlowOpen(true)}
        onImport={() => setImportOpen(true)}
      />

      <ImportFlowModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (id) => {
          await importar(id);
          setImportOpen(false);
        }}
      />

      <ConfirmModal
        open={!!confirmDelete}
        title="Eliminar flujo"
        message={`¿Eliminar "${confirmDelete?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          eliminar(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />

      {newFlowOpen && (
        <div className="flModalOverlay" onClick={() => setNewFlowOpen(false)} role="presentation">
          <div className="flModal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h2>Nuevo flujo</h2>
            <p className="sub">Crea un flujo vacío y ábrelo en el builder de producción.</p>
            <input
              className="flInput"
              placeholder="Nombre del flujo"
              value={newFlowName}
              onChange={(e) => setNewFlowName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <div className="flModalActions">
              <button type="button" className="flBtn flBtnGhost" onClick={() => setNewFlowOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="flBtn flBtnPrimary" onClick={handleCreate}>
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
