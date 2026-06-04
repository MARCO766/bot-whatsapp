import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  cambiarPassword,
  desconectarWhatsapp,
  desconectarWhatsappPorId,
  fetchAjustes,
  hacerPrincipalWhatsapp,
  guardarConexion,
  patchPerfil,
  probarMeta,
  probarWhatsapp,
  probarWhatsappPorId,
} from "./api";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";
import { RT } from "../realtime/events";

import { usePlanLimitModal } from "../planes/usePlanLimitModal";

export function useAjustes() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const { limitModal, tryHandlePlanLimitError, closeLimitModal } = usePlanLimitModal();

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
        if (tryHandlePlanLimitError(err)) return false;
        showToast(err instanceof ApiError ? err.message : "Error al guardar", "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [load, showToast, tryHandlePlanLimitError]
  );

  return {
    data,
    loading,
    saving,
    error,
    toast,
    showToast,
    reload: load,
    limitModal,
    closeLimitModal,
    savePerfil: (body) => run(() => patchPerfil(body), "Perfil guardado"),
    saveConexion: (body) => run(() => guardarConexion(body), "Conexión guardada"),
    desconectar: () => run(() => desconectarWhatsapp(), "WhatsApp desconectado"),
    desconectarPorId: (id) => run(() => desconectarWhatsappPorId(id), "WhatsApp desconectado"),
    probarWhatsapp: (numero) => run(() => probarWhatsapp(numero), "Prueba enviada"),
    probarWhatsappPorId: (id, numero) => run(() => probarWhatsappPorId(id, numero), "Prueba enviada"),
    hacerPrincipal: (id) => run(() => hacerPrincipalWhatsapp(id), "Conexión principal actualizada"),
    probarMetaEvento: (opts) =>
      run(() => probarMeta(opts && typeof opts === "object" ? opts : {}), "Evento de prueba enviado"),
    savePassword: (body) => run(() => cambiarPassword(body), "Contraseña actualizada"),
  };
}
