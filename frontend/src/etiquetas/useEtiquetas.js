import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createEtiqueta,
  deleteEtiqueta,
  fetchEtiquetas,
  updateEtiqueta,
} from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useEtiquetas() {
  const [etiquetas, setEtiquetas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetchEtiquetas();
      setEtiquetas(res.etiquetas || []);
      setTotal(res.total ?? (res.etiquetas || []).length);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      setApiError({ code: e.code, message: e.message });
      setEtiquetas([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 400);
  useSocketEvent(RT.ETIQUETA_ACTUALIZADA, reloadLive);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return etiquetas;
    return etiquetas.filter((t) => t.nombre?.toLowerCase().includes(q));
  }, [etiquetas, query]);

  const run = useCallback(
    async (fn, okMsg) => {
      setSaving(true);
      try {
        await fn();
        await load();
        if (okMsg) showToast(okMsg);
        return true;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Error", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, showToast]
  );

  return {
    etiquetas: filtered,
    total,
    loading,
    saving,
    apiError,
    toast,
    query,
    setQuery,
    reload: load,
    crear: (body) => run(() => createEtiqueta(body), "Etiqueta creada"),
    editar: (id, body) => run(() => updateEtiqueta(id, body), "Etiqueta actualizada"),
    eliminar: (id) => run(() => deleteEtiqueta(id), "Etiqueta eliminada"),
  };
}
