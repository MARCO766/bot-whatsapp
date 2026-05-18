import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  cambiarPassword,
  desconectarWhatsapp,
  fetchAjustes,
  guardarConexion,
  patchPerfil,
  probarMeta,
  probarWhatsapp,
} from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

export function useAjustes() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAjustes();
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Error cargando ajustes";
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reloadLive = useDebouncedCallback(load, 400);
  useSocketEvent(RT.CONEXION_ACTUALIZADA, reloadLive);

  const run = useCallback(
    async (fn, okMsg) => {
      setSaving(true);
      try {
        await fn();
        await load();
        if (okMsg) showToast(okMsg);
        return true;
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, showToast]
  );

  return {
    data,
    loading,
    saving,
    error,
    toast,
    showToast,
    reload: load,
    savePerfil: (body) => run(() => patchPerfil(body), "Perfil guardado"),
    saveConexion: (body) => run(() => guardarConexion(body), "Conexión guardada"),
    desconectar: () => run(() => desconectarWhatsapp(), "WhatsApp desconectado"),
    probarWhatsapp: (numero) => run(() => probarWhatsapp(numero), "Prueba enviada"),
    probarMetaEvento: () => run(() => probarMeta(), "Evento de prueba enviado"),
    savePassword: (body) => run(() => cambiarPassword(body), "Contraseña actualizada"),
  };
}
