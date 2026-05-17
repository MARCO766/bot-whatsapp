import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createFlow,
  deleteFlow,
  duplicateFlow,
  fetchFlowStats,
  fetchFlows,
  importFlowTemplate,
  patchFlowMeta,
  resolveApiUrl,
} from "./api";
import {
  countByEstado,
  countByFolder,
  filterFlows,
  loadLocalMeta,
  mergeLocalMeta,
  saveLocalMeta,
  sortFlows,
} from "./utils";

const EMPTY_STATS = {
  total: 0,
  activos: 0,
  pausados: 0,
  borradores: 0,
  errores: 0,
  leadsHoy: 0,
  mensajesEnviados: 0,
  respuestas: 0,
  seguimientosActivos: 0,
  conversionEstimada: 0,
};

export function useFlujos() {
  const [flows, setFlows] = useState([]);
  const [stats, setStats] = useState(null);
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
      const [flowsRes, statsRes] = await Promise.all([fetchFlows(), fetchFlowStats()]);
      const merged = mergeLocalMeta(flowsRes.flows || []);
      setFlows(merged);
      setStats(statsRes.stats || EMPTY_STATS);
      setApiOnline(true);
      setApiError(null);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      console.warn("[Flujos] API:", apiErr.code, apiErr.message, apiErr.details);

      setApiOnline(false);
      setFlows([]);
      setStats(EMPTY_STATS);
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
      const local = loadLocalMeta();
      local[id] = { ...(local[id] || {}), ...patch };
      saveLocalMeta(local);

      setFlows((prev) =>
        prev.map((f) => (f.id === id ? { ...f, meta: { ...f.meta, ...patch } } : f))
      );

      if (!apiOnline) {
        showToast("Sin sesión API — cambio solo local", "error");
        return;
      }

      try {
        await patchFlowMeta(id, patch);
        showToast("Flujo actualizado");
      } catch {
        showToast("Error al guardar en servidor", "error");
      }
    },
    [apiOnline, showToast]
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
    stats,
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
    crearFlujo,
    importar,
    duplicar,
    eliminar,
  };
}
