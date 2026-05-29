import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createEtiqueta,
  deleteEtiqueta,
  fetchEtiquetas,
  updateEtiqueta,
} from "./api";
import { fetchConexiones } from "../services/chatService";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";
import {
  CONEXION_TODAS,
  normalizeConexionesInbox,
  sameConexionId,
} from "../utils/conexionesInbox";

export const STORAGE_ETIQUETAS_CONEXION = "macbot_etiquetas_conexion";

export function etiquetaTabConexion(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

export function useEtiquetas() {
  const [etiquetas, setEtiquetas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");
  const [conexionesInbox, setConexionesInbox] = useState([]);
  const [conexionSeleccionadaId, setConexionSeleccionadaId] = useState(null);
  const [conexionesLoading, setConexionesLoading] = useState(true);

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

        const guardada = localStorage.getItem(STORAGE_ETIQUETAS_CONEXION);
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
    if (id) localStorage.setItem(STORAGE_ETIQUETAS_CONEXION, id);
  }, []);

  const load = useCallback(async () => {
    if (!conexionSeleccionadaId) {
      setLoading(false);
      setEtiquetas([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setApiError(null);
    try {
      const res = await fetchEtiquetas(conexionSeleccionadaId);
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
  }, [conexionSeleccionadaId]);

  useEffect(() => {
    if (conexionesLoading) return;
    load();
  }, [load, conexionesLoading]);

  const reloadLive = useDebouncedCallback(load, 400);
  useSocketEvent(RT.ETIQUETA_ACTUALIZADA, reloadLive);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return etiquetas;
    return etiquetas.filter((t) => t.nombre?.toLowerCase().includes(q));
  }, [etiquetas, query]);

  const run = useCallback(
    async (fn, okMsg) => {
      if (!requireLineaParaEscribir()) return false;
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
    [load, showToast, requireLineaParaEscribir]
  );

  const conexionActiva = useMemo(
    () => conexionesInbox.find((c) => sameConexionId(c.id, conexionSeleccionadaId)) || null,
    [conexionesInbox, conexionSeleccionadaId]
  );

  const lineaLabel =
    conexionSeleccionadaId === CONEXION_TODAS
      ? "Todas las líneas"
      : conexionActiva
        ? etiquetaTabConexion(conexionActiva)
        : null;

  return {
    etiquetas: filtered,
    total,
    loading: loading || conexionesLoading,
    saving,
    apiError,
    toast,
    query,
    setQuery,
    reload: load,
    conexionesInbox,
    conexionSeleccionadaId,
    conexionActiva,
    lineaLabel,
    seleccionarConexion,
    puedeEscribir,
    mostrarBadgeLinea,
    etiquetaTabConexion,
    crear: (body) =>
      run(() => createEtiqueta(body, conexionSeleccionadaId), "Etiqueta creada"),
    editar: (id, body) =>
      run(() => updateEtiqueta(id, body, conexionSeleccionadaId), "Etiqueta actualizada"),
    eliminar: (id) =>
      run(() => deleteEtiqueta(id, conexionSeleccionadaId), "Etiqueta eliminada"),
    abrirCrear: () => {
      if (!requireLineaParaEscribir()) return false;
      return true;
    },
  };
}
