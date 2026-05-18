import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  fetchClientes,
  fetchDashboard,
  fetchKanban,
  fetchMeta,
  fetchCliente,
  fetchTimeline,
  createCliente,
  updateCliente,
  patchEmbudo,
  addEtiqueta,
  registrarCompra,
  crearRecordatorio,
  bloquearCliente,
  desbloquearCliente,
  archivarCliente,
  eliminarCliente,
  iniciarFlujo,
  cancelarSeguimientos,
} from "./api";

const DEFAULT_FILTERS = {
  q: "",
  etiqueta: "",
  pais: "",
  estado_embudo: "",
  score: "",
  fuente: "",
  comprador: "",
  ingreso_min: "",
  ingreso_max: "",
  sin_responder: "",
  fecha_desde: "",
  fecha_hasta: "",
  actividad_desde: "",
};

export function useClientes() {
  const [dashboard, setDashboard] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [kanban, setKanban] = useState(null);
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [vistaLista, setVistaLista] = useState("tabla");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);

  const [perfilNumero, setPerfilNumero] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [perfilLoading, setPerfilLoading] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetchDashboard();
      setDashboard(res.dashboard);
    } catch {
      /* opcional */
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetchMeta();
      setMeta(res);
    } catch {
      setMeta(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const params = { ...filters, page, limit: 25 };
      const res = await fetchClientes(params);
      setClientes(res.clientes || []);
      setPagination(res.pagination || { page: 1, limit: 25, total: 0, pages: 1 });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      setApiError({ code: e.code, message: e.message });
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadKanban = useCallback(async () => {
    try {
      const res = await fetchKanban();
      setKanban(res.columnas);
    } catch {
      setKanban(null);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadMeta();
  }, [loadDashboard, loadMeta]);

  useEffect(() => {
    if (vistaLista === "kanban") {
      loadKanban();
    } else {
      loadList();
    }
  }, [vistaLista, loadList, loadKanban, filters, page]);

  const openPerfil = useCallback(async (numero) => {
    setPerfilNumero(numero);
    setPerfilLoading(true);
    setTimeline([]);
    try {
      const [det, tl] = await Promise.all([
        fetchCliente(numero),
        fetchTimeline(numero, 0),
      ]);
      setPerfil(det);
      setTimeline(tl.timeline || []);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Error cargando perfil", "error");
      setPerfilNumero(null);
    } finally {
      setPerfilLoading(false);
    }
  }, [showToast]);

  const closePerfil = useCallback(() => {
    setPerfilNumero(null);
    setPerfil(null);
    setTimeline([]);
  }, []);

  const reloadAll = useCallback(async () => {
    await loadDashboard();
    if (vistaLista === "kanban") await loadKanban();
    else await loadList();
    if (perfilNumero) await openPerfil(perfilNumero);
  }, [loadDashboard, loadKanban, loadList, vistaLista, perfilNumero, openPerfil]);

  const run = useCallback(
    async (fn, okMsg) => {
      setSaving(true);
      try {
        await fn();
        await reloadAll();
        if (okMsg) showToast(okMsg);
        return true;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Error", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reloadAll, showToast]
  );

  const setFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(
      ([k, v]) => k !== "q" && v !== "" && v != null
    ).length;
  }, [filters]);

  return {
    dashboard,
    clientes,
    pagination,
    kanban,
    meta,
    filters,
    setFilter,
    resetFilters,
    activeFilterCount,
    page,
    setPage,
    vistaLista,
    setVistaLista,
    loading,
    saving,
    apiError,
    toast,
    perfilNumero,
    perfil,
    timeline,
    perfilLoading,
    openPerfil,
    closePerfil,
    crear: (body) => run(() => createCliente(body), "Lead creado"),
    guardarNotas: (numero, notas) =>
      run(() => updateCliente(numero, { notas }), "Notas guardadas"),
    cambiarEmbudo: (numero, estado) =>
      run(() => patchEmbudo(numero, estado), "Embudo actualizado"),
    agregarEtiqueta: (numero, etiqueta) =>
      run(() => addEtiqueta(numero, etiqueta), "Etiqueta asignada"),
    marcarCompra: (numero, valor) =>
      run(() => registrarCompra(numero, { valor }), "Compra registrada"),
    recordatorio: (numero, body) =>
      run(() => crearRecordatorio(numero, body), "Recordatorio creado"),
    bloquear: (numero) => run(() => bloquearCliente(numero), "Bloqueado"),
    desbloquear: (numero) =>
      run(() => desbloquearCliente(numero), "Desbloqueado"),
    archivar: (numero) => run(() => archivarCliente(numero, true), "Archivado"),
    eliminar: (numero) => run(() => eliminarCliente(numero), "Eliminado"),
    iniciarFlujo: (numero, flujo_id) =>
      run(() => iniciarFlujo(numero, flujo_id), "Flujo iniciado"),
    cancelarFlujo: (numero) =>
      run(() => cancelarSeguimientos(numero), "Seguimientos cancelados"),
    reloadAll,
  };
}
