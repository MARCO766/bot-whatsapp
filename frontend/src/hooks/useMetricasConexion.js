import { useCallback, useEffect, useState } from "react";
import { fetchConexiones } from "../services/chatService";
import {
  CONEXION_TODAS,
  normalizeConexionesInbox,
  sameConexionId,
} from "../utils/conexionesInbox";

export const STORAGE_METRICAS_CONEXION = "macbot_metricas_conexion";

export function etiquetaTabConexion(c) {
  const nombre = String(c?.nombre ?? "").trim();
  if (nombre) return nombre;
  const numero = String(c?.numero ?? "").trim();
  if (numero) return numero;
  return `Línea ${String(c?.phone_id || "").slice(-4) || "—"}`;
}

export function useMetricasConexion() {
  const [conexionesInbox, setConexionesInbox] = useState([]);
  const [conexionSeleccionadaId, setConexionSeleccionadaId] = useState(null);
  const [conexionesLoading, setConexionesLoading] = useState(true);

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
          setConexionSeleccionadaId(CONEXION_TODAS);
          return;
        }

        const guardada = localStorage.getItem(STORAGE_METRICAS_CONEXION);
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
        if (!cancelled) {
          setConexionesInbox([]);
          setConexionSeleccionadaId(CONEXION_TODAS);
        }
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
    if (id) localStorage.setItem(STORAGE_METRICAS_CONEXION, id);
  }, []);

  return {
    conexionesInbox,
    conexionSeleccionadaId,
    conexionesLoading,
    seleccionarConexion,
    etiquetaTabConexion,
  };
}
