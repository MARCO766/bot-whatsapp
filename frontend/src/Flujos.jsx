import React, { useCallback, useEffect, useState } from "react";
import FlowFolders from "./components/flujos/FlowFolders";
import FlowList from "./components/flujos/FlowList";
import FlujosHeaderStats from "./components/flujos/FlujosHeaderStats";
import { useFlujosHeaderStats } from "./flujos/useFlujosHeaderStats";
import ConfirmModal from "./components/flujos/ConfirmModal";
import CarpetaModal from "./components/flujos/CarpetaModal";
import ImportFlowModal from "./components/flujos/ImportFlowModal";
import FlowVersionsModal from "./components/flujos/FlowVersionsModal";
import { FLOW_STATES } from "./flujos/constants";
import { flujosStyles } from "./flujos/styles";
import { SORT_OPTIONS } from "./flujos/constants";
import { useFlujos } from "./flujos/useFlujos";
import { loginUrl } from "./flujos/api";
import { CONEXION_TODAS, sameConexionId } from "./utils/conexionesInbox";
import { FLOW_DRAG_MIME, flowMatchesFolder } from "./flujos/utils";

const STORAGE_COLLAPSE = "macbot_flujos_collapse_sections";

function readCollapseSections() {
  try {
    const raw = localStorage.getItem(STORAGE_COLLAPSE);
    if (!raw) return { sistema: true, custom: true };
    const parsed = JSON.parse(raw);
    return {
      sistema: parsed.sistema !== false,
      custom: parsed.custom !== false,
    };
  } catch {
    return { sistema: true, custom: true };
  }
}

export default function Flujos() {
  const {
    flows,
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
    carpetas,
    sinCarpeta,
    carpetasLoading,
    carpetasMoverMenu,
    crearCarpetaFlujo,
    editarCarpetaFlujo,
    eliminarCarpetaFlujo,
    showToast,
    toggleEstado,
    moveToFolder,
    crearFlujo,
    importar,
    duplicar,
    exportar,
    importarJson,
    cargarVersiones,
    restaurarVersion,
    eliminar,
    renombrar,
    updateMeta,
    load,
    conexionesInbox,
    conexionSeleccionadaId,
    seleccionarConexion,
    puedeEscribir,
    mostrarBadgeLinea,
    etiquetaTabConexion,
  } = useFlujos();

  const headerStats = useFlujosHeaderStats(true, conexionSeleccionadaId);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "macbot:flujo_guardado") load();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [load]);

  const [importOpen, setImportOpen] = useState(false);
  const [historyFlow, setHistoryFlow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [carpetaModal, setCarpetaModal] = useState(null);
  const [carpetaSaving, setCarpetaSaving] = useState(false);
  const [confirmDeleteCarpeta, setConfirmDeleteCarpeta] = useState(null);
  const [draggingFlowId, setDraggingFlowId] = useState(null);
  const [dropTargetKey, setDropTargetKey] = useState(null);
  const [expandedSections, setExpandedSections] = useState(readCollapseSections);

  const persistCollapse = useCallback((next) => {
    setExpandedSections(next);
    localStorage.setItem(STORAGE_COLLAPSE, JSON.stringify(next));
  }, []);

  const handleToggleSection = useCallback(
    (key) => {
      persistCollapse({ ...expandedSections, [key]: !expandedSections[key] });
    },
    [expandedSections, persistCollapse]
  );

  const handleExpandSection = useCallback(
    (key) => {
      if (expandedSections[key] === false) {
        persistCollapse({ ...expandedSections, [key]: true });
      }
    },
    [expandedSections, persistCollapse]
  );

  const clearDragState = useCallback(() => {
    setDraggingFlowId(null);
    setDropTargetKey(null);
  }, []);

  const handleFlowDragStart = useCallback(
    (e, flow) => {
      if (!puedeEscribir) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      setDraggingFlowId(flow.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        FLOW_DRAG_MIME,
        JSON.stringify({
          flowId: flow.id,
          conexion_whatsapp_id: flow.conexion_whatsapp_id || null,
        })
      );
    },
    [puedeEscribir]
  );

  const handleFlowDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleFlowDropOnFolder = useCallback(
    async (folderKey, folderItem) => {
      if (!puedeEscribir) {
        showToast("Selecciona una línea WhatsApp (no «Todas las líneas»)", "error");
        clearDragState();
        return;
      }

      const flow = flows.find((f) => f.id === draggingFlowId);
      if (!flow) {
        clearDragState();
        return;
      }

      if (
        flow.conexion_whatsapp_id &&
        !sameConexionId(flow.conexion_whatsapp_id, conexionSeleccionadaId)
      ) {
        showToast("Este flujo pertenece a otra línea WhatsApp", "error");
        clearDragState();
        return;
      }

      if (
        folderItem?.conexion_whatsapp_id &&
        !sameConexionId(folderItem.conexion_whatsapp_id, conexionSeleccionadaId)
      ) {
        showToast("Esta carpeta pertenece a otra línea WhatsApp", "error");
        clearDragState();
        return;
      }

      if (flowMatchesFolder(flow, folderKey, carpetas)) {
        clearDragState();
        return;
      }

      await moveToFolder(flow.id, folderKey, folderItem?.nombre);
      clearDragState();
    },
    [
      puedeEscribir,
      draggingFlowId,
      flows,
      conexionSeleccionadaId,
      carpetas,
      moveToFolder,
      showToast,
      clearDragState,
    ]
  );

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
    <div className={`flujosPage ${draggingFlowId ? "flujosPage--dragging" : ""}`}>
      <style>{flujosStyles}</style>

      {toast && (
        <div className={`flToast ${toast.type === "error" ? "error" : "success"}`}>{toast.message}</div>
      )}

      <header className="flTopBar">
        <div className="flPageHeader">
          <span className="flPageEyebrow">MacBot CRM</span>
          <h1>Automatizaciones Premium</h1>
          <p className="flPageSubtitle">
            Orquesta flujos por línea WhatsApp, mide conversiones y activa automatizaciones con
            control total.
          </p>
        </div>
        <div className="flTopActions">
          <button
            type="button"
            className="flBtn flBtnGhost"
            disabled={!puedeEscribir}
            title={
              puedeEscribir
                ? undefined
                : "Selecciona una línea WhatsApp (no «Todas las líneas»)"
            }
            onClick={() => setImportOpen(true)}
          >
            Importar flujo
          </button>
          <button
            type="button"
            className="flBtn flBtnPrimary"
            disabled={!puedeEscribir}
            title={
              puedeEscribir
                ? undefined
                : "Selecciona una línea WhatsApp (no «Todas las líneas»)"
            }
            onClick={() => setNewFlowOpen(true)}
          >
            + Nuevo flujo
          </button>
        </div>
      </header>

      {conexionesInbox.length > 0 && (
        <div className="flConexionPicker" role="tablist" aria-label="Línea WhatsApp">
          <button
            type="button"
            role="tab"
            aria-selected={conexionSeleccionadaId === CONEXION_TODAS}
            className={`flConexionTab ${
              conexionSeleccionadaId === CONEXION_TODAS ? "flConexionTab--active" : ""
            }`}
            onClick={() => seleccionarConexion(CONEXION_TODAS)}
          >
            Todas las líneas
          </button>
          {conexionesInbox.map((c) => {
            const activa = sameConexionId(conexionSeleccionadaId, c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={activa}
                className={`flConexionTab ${activa ? "flConexionTab--active" : ""}`}
                onClick={() => seleccionarConexion(c.id)}
              >
                {etiquetaTabConexion(c)}
                {c.activo && <span className="flConexionPrincipal">principal</span>}
              </button>
            );
          })}
        </div>
      )}

      {!puedeEscribir && conexionSeleccionadaId === CONEXION_TODAS && (
        <p className="flConexionHint">
          Vista global: los flujos sin línea solo aparecen aquí. Para crear carpetas, mover flujos,
          importar o duplicar, elige un número.
        </p>
      )}

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

      <FlowFolders
        active={folder}
        onChange={setFolder}
        counts={folderCounts}
        carpetas={carpetas}
        sinCarpeta={sinCarpeta}
        loading={carpetasLoading}
        mostrarLinea={mostrarBadgeLinea}
        puedeEscribir={puedeEscribir}
        onCreateCarpeta={() => {
          if (!puedeEscribir) {
            showToast("Selecciona una línea WhatsApp (no «Todas las líneas»)", "error");
            return;
          }
          setCarpetaModal({ mode: "create" });
        }}
        onEditCarpeta={(c) => {
          if (!puedeEscribir) {
            showToast("Selecciona una línea WhatsApp (no «Todas las líneas»)", "error");
            return;
          }
          setCarpetaModal({ mode: "edit", carpeta: c });
        }}
        onDeleteCarpeta={(c) => {
          if (!puedeEscribir) {
            showToast("Selecciona una línea WhatsApp (no «Todas las líneas»)", "error");
            return;
          }
          setConfirmDeleteCarpeta(c);
        }}
        conexionesMap={Object.fromEntries(
          conexionesInbox.map((c) => [c.id, etiquetaTabConexion(c)])
        )}
        draggingFlowId={draggingFlowId}
        dropTargetKey={dropTargetKey}
        onDropTargetChange={setDropTargetKey}
        onFlowDrop={handleFlowDropOnFolder}
        expandedSections={expandedSections}
        onToggleSection={handleToggleSection}
        onExpandSection={handleExpandSection}
      />

      <div className="flToolbar">
        <div className="flSearch">
          <span className="flSearchIcon" aria-hidden>⌕</span>
          <input
            type="search"
            placeholder="Buscar por nombre, carpeta, activador, etiquetas, nodos…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar flujos"
          />
        </div>
        <div className="flFilterGroup">
          <label className="flFilterField">
            <span className="flFilterLabel">Estado</span>
            <select className="flSelect" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="all">Todos</option>
              {FLOW_STATES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flFilterField">
            <span className="flFilterLabel">Activadores</span>
            <select
              className="flSelect"
              value={activador}
              onChange={(e) => setActivador(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="activo">Con activador activo</option>
              <option value="inactivo">Sin activador activo</option>
            </select>
          </label>
          <label className="flFilterField">
            <span className="flFilterLabel">Tipo nodo</span>
            <select
              className="flSelect"
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="inicio">Inicio</option>
              <option value="contenido">Contenido</option>
              <option value="ia">IA</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="espera">Espera</option>
              <option value="etiqueta">Etiqueta</option>
            </select>
          </label>
          <label className="flFilterField">
            <span className="flFilterLabel">Orden</span>
            <select className="flSelect" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flViewToggle" role="group" aria-label="Vista">
          <button
            type="button"
            className={viewMode === "cards" ? "active" : ""}
            onClick={() => setViewMode("cards")}
            title="Vista tarjetas"
          >
            ⊞ Tarjetas
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
            title="Vista lista"
          >
            ☰ Lista
          </button>
        </div>
      </div>

      <FlowList
        flows={filtered}
        loading={loading}
        viewMode={viewMode}
        apiOnline={apiOnline}
        mostrarBadgeLinea={mostrarBadgeLinea}
        conexionWhatsappId={conexionSeleccionadaId}
        onToggleEstado={toggleEstado}
        onDuplicate={duplicar}
        onExport={exportar}
        onDelete={(flow) => setConfirmDelete(flow)}
        onMoveFolder={moveToFolder}
        onEditName={handleEditName}
        onShowHistory={(flow) => setHistoryFlow(flow)}
        onCreate={() => setNewFlowOpen(true)}
        onImport={() => setImportOpen(true)}
        carpetas={carpetas}
        carpetasMover={carpetasMoverMenu}
        puedeEscribir={puedeEscribir}
        draggingFlowId={draggingFlowId}
        onFlowDragStart={handleFlowDragStart}
        onFlowDragEnd={handleFlowDragEnd}
      />

      <FlowVersionsModal
        open={!!historyFlow}
        flow={historyFlow}
        onClose={() => setHistoryFlow(null)}
        onLoadVersions={cargarVersiones}
        onRestore={restaurarVersion}
        onRestoreBlocked={() =>
          showToast("Selecciona una línea para restaurar una versión", "error")
        }
        puedeEscribir={puedeEscribir}
      />

      <ImportFlowModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        puedeEscribir={puedeEscribir}
        onImport={async (id) => {
          await importar(id);
          setImportOpen(false);
        }}
        onImportJson={importarJson}
        onJsonParseError={(msg) => showToast(msg, "error")}
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

      <ConfirmModal
        open={!!confirmDeleteCarpeta}
        title="Eliminar carpeta"
        message={
          confirmDeleteCarpeta
            ? `¿Eliminar la carpeta «${confirmDeleteCarpeta.nombre}»?${
                (confirmDeleteCarpeta.flujos_count || 0) > 0
                  ? ` Los ${confirmDeleteCarpeta.flujos_count} flujo(s) pasarán a «Sin carpeta».`
                  : ""
              }`
            : ""
        }
        confirmLabel="Eliminar carpeta"
        danger
        onCancel={() => setConfirmDeleteCarpeta(null)}
        onConfirm={async () => {
          const c = confirmDeleteCarpeta;
          setConfirmDeleteCarpeta(null);
          if (c) await eliminarCarpetaFlujo(c);
        }}
      />

      <CarpetaModal
        open={!!carpetaModal}
        mode={carpetaModal?.mode || "create"}
        carpeta={carpetaModal?.carpeta}
        saving={carpetaSaving}
        onClose={() => setCarpetaModal(null)}
        onSubmit={async (payload) => {
          setCarpetaSaving(true);
          let ok = false;
          if (carpetaModal?.mode === "edit" && carpetaModal.carpeta?.id) {
            ok = await editarCarpetaFlujo(carpetaModal.carpeta.id, payload);
          } else {
            ok = await crearCarpetaFlujo(payload);
          }
          setCarpetaSaving(false);
          if (ok) setCarpetaModal(null);
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
