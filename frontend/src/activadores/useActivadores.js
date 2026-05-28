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
import { fetchConexiones } from "../services/chatService";
import {
  CONEXION_TODAS,
  normalizeConexionesInbox,
  sameConexionId,
} from "../utils/conexionesInbox";
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

export function useActivadores() {
  const [activadores, setActivadores] = useState([]);
  const [flujos, setFlujos] = useState([]);
  const [stats, setStats] = useState({ total: 0, activos: 0, pausados: 0, usados_hoy: 0 });
  const [loading, setLoading] = useState(true);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);

  const [conexionesInbox, setConexionesInbox] = useState([]);
  const [conexionSeleccionadaId, setConexionSeleccionadaId] = useState(null);
  const [conexionesLoading, setConexionesLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [filtroFlujo, setFiltroFlujo] = useState("all");
  const [filtroEstado, setFiltroEstado] = useState("all");

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
      setActivadores([]);
      setFlujos([]);
      setStats({ total: 0, activos: 0, pausados: 0, usados_hoy: 0 });
      return;
    }

    setLoading(true);
    setApiError(null);

    try {
      const res = await fetchActivadores(conexionSeleccionadaId);
      setActivadores(res.activadores || []);
      setFlujos(res.flujos || []);
      setStats(res.stats || { total: 0, activos: 0, pausados: 0, usados_hoy: 0 });
      setApiOnline(true);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(err.message, "SERVER");
      setApiOnline(false);
      setActivadores([]);
      setFlujos([]);
      setApiError({
        code: apiErr.code,
        message: apiErr.message,
        url: apiErr.details?.url || resolveApiUrl("/api/activadores"),
      });
    } finally {
      setLoading(false);
    }
  }, [conexionSeleccionadaId]);

  useEffect(() => {
    if (conexionSeleccionadaId) load();
  }, [conexionSeleccionadaId, load]);

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
      if (!requireLineaParaEscribir()) return false;
      if (!apiOnline) return showToast("Sin sesión API", "error");
      try {
        if (id) {
          await updateActivador(id, payload, conexionSeleccionadaId);
          showToast("Activador actualizado");
        } else {
          await createActivador(payload, conexionSeleccionadaId);
          showToast("Activador creado");
        }
        await load();
        return true;
      } catch (e) {
        showToast(e.message || "Error al guardar", "error");
        return false;
      }
    },
    [apiOnline, conexionSeleccionadaId, load, requireLineaParaEscribir, showToast]
  );

  const eliminar = useCallback(
    async (id) => {
      if (!apiOnline) {
        showToast("Sin sesión API", "error");
        return false;
      }
      try {
        await deleteActivador(id, conexionSeleccionadaId);
        showToast("Activador eliminado correctamente");
        await load();
        return true;
      } catch (e) {
        showToast(e.message || "No se pudo eliminar el activador", "error");
        return false;
      }
    },
    [apiOnline, conexionSeleccionadaId, load, showToast]
  );

  const toggle = useCallback(
    async (id) => {
      if (!apiOnline) return showToast("Sin sesión API", "error");
      try {
        const res = await toggleActivador(id, conexionSeleccionadaId);
        showToast(res.estado === "activo" ? "Activador activado" : "Activador pausado");
        await load();
      } catch (e) {
        showToast(e.message || "Error al cambiar estado", "error");
      }
    },
    [apiOnline, conexionSeleccionadaId, load, showToast]
  );

  return {
    activadores: filtered,
    allActivadores: activadores,
    flujos,
    stats,
    loading: loading || conexionesLoading,
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
    conexionesInbox,
    conexionSeleccionadaId,
    seleccionarConexion,
    puedeEscribir,
    mostrarBadgeLinea,
    etiquetaTabConexion,
  };
}
