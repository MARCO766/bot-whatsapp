import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createFlow,
  deleteFlow,
  duplicateFlow,
  fetchFlows,
  importFlowTemplate,
  patchFlowMeta,
  patchFlowNombre,
  resolveApiUrl,
} from "./api";

import {
  countByEstado,
  countByFolder,
  filterFlows,
  sortFlows,
} from "./utils";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useFlujos() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiUrl, setApiUrl] = useState("");
  const [toast, setToast] = useState(null);

  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("all");
  const [estado, setEstado] = useState("all");
  const [activador, setActivador] = useState("all");
  const [nodeType, setNodeType] = useState("all");
  const [sortBy, setSortBy] = useState("recientes");
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("macbot_flujos_view") || "cards");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    setApiUrl(resolveApiUrl("/api/flujos"));

    try {
      const flowsRes = await fetchFlows();

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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        const res = await patchFlowMeta(id, patch);
        setFlows((prev) =>
          prev.map((f) => (f.id === id ? { ...f, meta: { ...f.meta, ...res.meta } } : f))
        );
        showToast("Flujo actualizado");
      } catch {
        showToast("Error al guardar en servidor", "error");
        await load();
      }
    },
    [apiOnline, load, showToast]
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
        await patchFlowNombre(id, nombre);
        showToast("Nombre actualizado");
        await load();
      } catch {
        showToast("Error al renombrar", "error");
      }
    },
    [apiOnline, load, showToast]
  );

  const crearFlujo = useCallback(
    async (nombre) => {
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para crear flujos", "error");
        return null;
      }
      try {
        const res = await createFlow(nombre);
        showToast("Flujo creado");
        await load();
        return res.flow;
      } catch {
        showToast("No se pudo crear el flujo", "error");
        return null;
      }
    },
    [apiOnline, load, showToast]
  );

  const importar = useCallback(
    async (templateId) => {
      if (!apiOnline) {
        showToast("Inicia sesión en el panel para importar", "error");
        return;
      }
      try {
        await importFlowTemplate(templateId);
        showToast("Plantilla importada");
        await load();
      } catch {
        showToast("Error al importar", "error");
      }
    },
    [apiOnline, load, showToast]
  );

  const duplicar = useCallback(
    async (id) => {
      if (!apiOnline) return showToast("Sin conexión API", "error");
      try {
        await duplicateFlow(id);
        showToast("Flujo duplicado");
        await load();
      } catch {
        showToast("Error al duplicar", "error");
      }
    },
    [apiOnline, load, showToast]
  );

  const eliminar = useCallback(
    async (id) => {
      if (!apiOnline) return showToast("Sin conexión API", "error");
      try {
        await deleteFlow(id);
        showToast("Flujo eliminado");
        await load();
      } catch {
        showToast("Error al eliminar", "error");
      }
    },
    [apiOnline, load, showToast]
  );

  return {
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
    estadoCounts,
    load,
    showToast,
    updateMeta,
    toggleEstado,
    moveToFolder,
    renombrar,
    crearFlujo,
    importar,
    duplicar,
    eliminar,
  };
}
