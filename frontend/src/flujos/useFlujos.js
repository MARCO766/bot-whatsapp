import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createFlow,
  deleteFlow,
  downloadFlowExportFile,
  duplicateFlow,
  fetchFlowExport,
  fetchFlows,
  importFlowJson,
  importFlowTemplate,
  fetchFlowVersions,
  restoreFlowVersion,
  patchFlowMeta,
  patchFlowNombre,
  resolveApiUrl,
} from "./api";
import { fetchConexiones } from "../services/chatService";
import {
  CONEXION_TODAS,
  normalizeConexionesInbox,
  sameConexionId,
} from "../utils/conexionesInbox";

import {
  countByEstado,
  countByFolder,
  filterFlows,
  sortFlows,
} from "./utils";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

const STORAGE_CONEXION = "macbot_flujos_conexion";

function etiquetaTabConexion(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

export function useFlujos() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiUrl, setApiUrl] = useState("");
  const [toast, setToast] = useState(null);

  const [conexionesInbox, setConexionesInbox] = useState([]);
  const [conexionSeleccionadaId, setConexionSeleccionadaId] = useState(null);
  const [conexionesLoading, setConexionesLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [estado, setEstado] = useState("all");
  const [activador, setActivador] = useState("all");
  const [nodeType, setNodeType] = useState("all");
  const [sortBy, setSortBy] = useState("recientes");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("macbot_flujos_view") || "cards");

  const puedeEscribir =
    Boolean(conexionSeleccionadaId) && conexionSeleccionadaId !== CONEXION_TODAS;
  const mostrarBadgeLinea = conexionSeleccionadaId === CONEXION_TODAS;

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const requireLineaParaEscribir = useCallback(() => {
    if (puedeEscribir) return true;
    showToast("Selecciona una línea WhatsApp (no «Todas las líneas»)", "error");
    return false;
  }, [puedeEscribir, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function initConexiones() {
      setConexionesLoading(true);
      try {
        const { conexiones: lista } = await fetchConexiones();
        if (cancelled) return;

        const normalizadas = normalizeConexionesInbox(lista);
        setConexionesInbox(normalizadas);

        if (!normalizadas.length) {
          setConexionSeleccionadaId(null);
          return;
        }

        const guardada = localStorage.getItem(STORAGE_CONEXION);
        if (guardada === CONEXION_TODAS) {
          setConexionSeleccionadaId(CONEXION_TODAS);
          return;
        }
        if (guardada && normalizadas.some((c) => sameConexionId(c.id, guardada))) {
          setConexionSeleccionadaId(guardada);
          return;
        }
        setConexionSeleccionadaId(CONEXION_TODAS);
      } catch {
        if (!cancelled) setConexionesInbox([]);
      } finally {
        if (!cancelled) setConexionesLoading(false);
      }
    }

    initConexiones();
    return () => {
      cancelled = true;
    };
  }, []);

  const seleccionarConexion = useCallback((id) => {
    setConexionSeleccionadaId(id);
    if (id) localStorage.setItem(STORAGE_CONEXION, id);
  }, []);

  const load = useCallback(async () => {
    if (!conexionSeleccionadaId) {
      setLoading(false);
      setFlows([]);
      return;
    }

    setLoading(true);
    setApiError(null);
    setApiUrl(resolveApiUrl(withConexionQueryForLog(conexionSeleccionadaId)));

    try {
      const flowsRes = await fetchFlows(conexionSeleccionadaId);

      if (!flowsRes.ok && !flowsRes.flows) {
        throw new ApiError(flowsRes.error || "Error cargando flujos", "SERVER");
      }

      setFlows(flowsRes.flows || []);
      setApiOnline(true);
      setApiError(null);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      console.warn("[Flujos] API:", apiErr.code, apiErr.message, apiErr.details);

      setApiOnline(false);
      setFlows([]);
      setApiError({
        code: apiErr.code,
        message: apiErr.message,
        status: apiErr.status,
        url: apiErr.details?.url || resolveApiUrl("/api/flujos"),
      });
    } finally {
      setLoading(false);
    }
  }, [conexionSeleccionadaId]);

  function withConexionQueryForLog(conexionId) {
    const q = encodeURIComponent(conexionId || CONEXION_TODAS);
    return `/api/flujos?conexion_whatsapp_id=${q}`;
  }

  useEffect(() => {
    if (conexionSeleccionadaId) load();
  }, [conexionSeleccionadaId, load]);

  const reloadLive = useDebouncedCallback(load, 400);
  useSocketEvent(RT.FLUJO_GUARDADO, reloadLive);
  useSocketEvent(RT.METRICA_ACTUALIZADA, reloadLive);

  useEffect(() => {
    localStorage.setItem("macbot_flujos_view", viewMode);
  }, [viewMode]);

  const filtered = useMemo(
    () => sortFlows(filterFlows(flows, { query, folder, estado, activador, nodeType }), sortBy),
    [flows, query, folder, estado, activador, nodeType, sortBy]
  );

  const folderCounts = useMemo(() => countByFolder(flows), [flows]);
  const estadoCounts = useMemo(() => countByEstado(flows), [flows]);

  const updateMeta = useCallback(
    async (id, patch) => {
      if (!apiOnline) {
        showToast("Sin sesión API", "error");
        return;
      }

      setFlows((prev) =>
        prev.map((f) => (f.id === id ? { ...f, meta: { ...f.meta, ...patch } } : f))
      );

      try {
        const res = await patchFlowMeta(id, patch, conexionSeleccionadaId);
        setFlows((prev) =>
          prev.map((f) => (f.id === id ? { ...f, meta: { ...f.meta, ...res.meta } } : f))
        );
        showToast("Flujo actualizado");
      } catch {
        showToast("Error al guardar en servidor", "error");
        await load();
      }
    },
    [apiOnline, conexionSeleccionadaId, load, showToast]
  );

  const toggleEstado = useCallback(
    async (flow) => {
      const next = flow.meta?.estado === "activo" ? "pausado" : "activo";
      await updateMeta(flow.id, { estado: next });
    },
    [updateMeta]
  );

  const moveToFolder = useCallback(
    async (id, carpeta) => {
      await updateMeta(id, { carpeta });
    },
    [updateMeta]
  );

  const renombrar = useCallback(
    async (id, nombre) => {
      if (!apiOnline) return showToast("Sin sesión API", "error");
      try {
        await patchFlowNombre(id, nombre, conexionSeleccionadaId);
        showToast("Nombre actualizado");
        await load();
      } catch {
        showToast("Error al renombrar", "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, load, showToast]
  );

  const crearFlujo = useCallback(
    async (nombre) => {
      if (!requireLineaParaEscribir()) return null;
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para crear flujos", "error");
        return null;
      }
      try {
        const res = await createFlow(nombre, {}, conexionSeleccionadaId);
        showToast("Flujo creado");
        await load();
        return res.flow;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "No se pudo crear el flujo";
        showToast(msg, "error");
        return null;
      }
    },
    [apiOnline, conexionSeleccionadaId, load, requireLineaParaEscribir, showToast]
  );

  const importar = useCallback(
    async (templateId) => {
      if (!requireLineaParaEscribir()) return;
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para importar", "error");
        return;
      }
      try {
        await importFlowTemplate(templateId, conexionSeleccionadaId);
        showToast("Plantilla importada");
        await load();
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Error al importar";
        showToast(msg, "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, load, requireLineaParaEscribir, showToast]
  );

  const duplicar = useCallback(
    async (id) => {
      if (!requireLineaParaEscribir()) return;
      if (!apiOnline) return showToast("Sin conexión API", "error");
      try {
        await duplicateFlow(id, conexionSeleccionadaId);
        showToast("Flujo duplicado en la línea seleccionada");
        await load();
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          showToast(
            "Este flujo es de otra línea. Cambia a esa línea WhatsApp y vuelve a duplicar.",
            "error"
          );
          return;
        }
        const msg = err instanceof ApiError ? err.message : "Error al duplicar";
        showToast(msg, "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, load, requireLineaParaEscribir, showToast]
  );

  const exportar = useCallback(
    async (flow) => {
      if (!flow?.id) return;
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para exportar", "error");
        return;
      }
      try {
        const payload = await fetchFlowExport(flow.id, conexionSeleccionadaId);
        downloadFlowExportFile(payload);
        showToast(`Exportado: ${payload.nombre || flow.nombre}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          showToast(
            "Este flujo es de otra línea. Selecciona su línea WhatsApp para exportarlo.",
            "error"
          );
          return;
        }
        const msg = err instanceof ApiError ? err.message : "Error al exportar JSON";
        showToast(msg, "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, showToast]
  );

  const importarJson = useCallback(
    async (rawPayload) => {
      if (!rawPayload) return false;
      if (!requireLineaParaEscribir()) return false;
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para importar", "error");
        return false;
      }
      try {
        await importFlowJson(rawPayload, conexionSeleccionadaId);
        showToast("Flujo importado en la línea seleccionada");
        await load();
        return true;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Error al importar JSON";
        showToast(msg, "error");
        return false;
      }
    },
    [apiOnline, conexionSeleccionadaId, load, requireLineaParaEscribir, showToast]
  );

  const cargarVersiones = useCallback(
    async (flujoId) => {
      if (!flujoId || !apiOnline) return [];
      try {
        const res = await fetchFlowVersions(flujoId, conexionSeleccionadaId);
        return res.versiones || [];
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          showToast(
            "Este flujo es de otra línea. Cambia a la línea correcta para ver el historial.",
            "error"
          );
        } else {
          const msg = err instanceof ApiError ? err.message : "No se pudo cargar el historial";
          showToast(msg, "error");
        }
        return [];
      }
    },
    [apiOnline, conexionSeleccionadaId, showToast]
  );

  const restaurarVersion = useCallback(
    async (flujoId, versionId) => {
      if (!puedeEscribir) {
        showToast("Selecciona una línea para restaurar una versión", "error");
        return false;
      }
      if (!apiOnline) {
        showToast("Sin conexión API", "error");
        return false;
      }
      try {
        await restoreFlowVersion(flujoId, versionId, conexionSeleccionadaId);
        showToast("Versión restaurada. Abre el constructor para revisar el grafo.");
        await load();
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
          showToast(
            "Este flujo es de otra línea. Selecciona la línea correcta para restaurar.",
            "error"
          );
          return false;
        }
        const msg = err instanceof ApiError ? err.message : "No se pudo restaurar la versión";
        showToast(msg, "error");
        return false;
      }
    },
    [apiOnline, conexionSeleccionadaId, load, puedeEscribir, showToast]
  );

  const eliminar = useCallback(
    async (id) => {
      if (!apiOnline) return showToast("Sin conexión API", "error");
      try {
        await deleteFlow(id, conexionSeleccionadaId);
        showToast("Flujo eliminado");
        await load();
      } catch {
        showToast("Error al eliminar", "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, load, showToast]
  );

  return {
    flows,
    filtered,
    loading: loading || conexionesLoading,
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
    estadoCounts,
    load,
    showToast,
    updateMeta,
    toggleEstado,
    moveToFolder,
    renombrar,
    crearFlujo,
    importar,
    importarJson,
    duplicar,
    exportar,
    cargarVersiones,
    restaurarVersion,
    eliminar,
    conexionesInbox,
    conexionSeleccionadaId,
    seleccionarConexion,
    puedeEscribir,
    mostrarBadgeLinea,
    etiquetaTabConexion,
  };
}
