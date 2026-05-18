import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  cambiarPassword,
  createConexion,
  createEtiqueta,
  deleteConexion,
  deleteEtiqueta,
  fetchAjustes,
  patchAjustes,
  patchPerfil,
  probarConexion,
  probarMeta,
  updateConexion,
  updateEtiqueta,
} from "./api";

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
    saveAjustes: (body) => run(() => patchAjustes(body), "Ajustes guardados"),
    savePassword: (body) => run(() => cambiarPassword(body), "Contraseña actualizada"),
    probarMetaEvento: () => run(() => probarMeta(), "Evento de prueba enviado"),
    addConexion: (body) => run(() => createConexion(body), "Conexión guardada"),
    editConexion: (id, body) => run(() => updateConexion(id, body), "Conexión actualizada"),
    removeConexion: (id) => run(() => deleteConexion(id), "Conexión eliminada"),
    testConexion: (id, numero) => run(() => probarConexion(id, numero), "Prueba enviada"),
    addEtiqueta: (body) => run(() => createEtiqueta(body), "Etiqueta creada"),
    editEtiqueta: (id, body) => run(() => updateEtiqueta(id, body), "Etiqueta actualizada"),
    removeEtiqueta: (id) => run(() => deleteEtiqueta(id), "Etiqueta eliminada"),
  };
}
