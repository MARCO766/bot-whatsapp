import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createActivador,
  deleteActivador,
  fetchActivadores,
  resolveApiUrl,
  toggleActivador,
  updateActivador,
} from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useActivadores() {
  const [activadores, setActivadores] = useState([]);
  const [flujos, setFlujos] = useState([]);
  const [stats, setStats] = useState({ total: 0, activos: 0, pausados: 0, usados_hoy: 0 });
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);

  const [query, setQuery] = useState("");
  const [filtroFlujo, setFiltroFlujo] = useState("all");
  const [filtroEstado, setFiltroEstado] = useState("all");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);

    try {
      const res = await fetchActivadores();
      setActivadores(res.activadores || []);
      setFlujos(res.flujos || []);
      setStats(res.stats || { total: 0, activos: 0, pausados: 0, usados_hoy: 0 });
      setApiOnline(true);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      setApiOnline(false);
      setActivadores([]);
      setApiError({
        code: apiErr.code,
        message: apiErr.message,
        url: apiErr.details?.url || resolveApiUrl("/api/activadores"),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 400);
  useSocketEvent(RT.ACTIVADOR_CREADO, reloadLive);
  useSocketEvent(RT.ACTIVADOR_ELIMINADO, reloadLive);
  useSocketEvent(RT.ACTIVADOR_ACTUALIZADO, reloadLive);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activadores
      .filter((a) => {
        if (filtroFlujo !== "all" && a.flujo_id !== filtroFlujo) return false;
        if (filtroEstado === "activo" && a.estado !== "activo") return false;
        if (filtroEstado === "pausado" && a.estado !== "pausado") return false;
        if (!q) return true;
        const hay = [
          a.nombre,
          a.palabra_clave,
          a.palabras_clave_text,
          ...(a.palabras_clave_array || []),
          a.frase,
          a.flujo_nombre,
          a.conexion,
          a.tipo_activador,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const pa = Number(a.prioridad) || 0;
        const pb = Number(b.prioridad) || 0;
        if (pb !== pa) return pb - pa;
        return new Date(b.creado_en || 0) - new Date(a.creado_en || 0);
      });
  }, [activadores, query, filtroFlujo, filtroEstado]);

  const guardar = useCallback(
    async (payload, id) => {
      if (!apiOnline) return showToast("Sin sesión API", "error");
      try {
        if (id) {
          await updateActivador(id, payload);
          showToast("Activador actualizado");
        } else {
          await createActivador(payload);
          showToast("Activador creado");
        }
        await load();
        return true;
      } catch (e) {
        showToast(e.message || "Error al guardar", "error");
        return false;
      }
    },
    [apiOnline, load, showToast]
  );

  const eliminar = useCallback(
    async (id) => {
      if (!apiOnline) {
        showToast("Sin sesión API", "error");
        return false;
      }
      try {
        await deleteActivador(id);
        showToast("Activador eliminado correctamente");
        await load();
        return true;
      } catch (e) {
        showToast(e.message || "No se pudo eliminar el activador", "error");
        return false;
      }
    },
    [apiOnline, load, showToast]
  );

  const toggle = useCallback(
    async (id) => {
      if (!apiOnline) return showToast("Sin sesión API", "error");
      try {
        const res = await toggleActivador(id);
        showToast(res.estado === "activo" ? "Activador activado" : "Activador pausado");
        await load();
      } catch (e) {
        showToast(e.message || "Error al cambiar estado", "error");
      }
    },
    [apiOnline, load, showToast]
  );

  return {
    activadores: filtered,
    allActivadores: activadores,
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
    showToast,
    guardar,
    eliminar,
    toggle,
    load,
  };
}
