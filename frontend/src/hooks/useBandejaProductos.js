import { useCallback, useEffect, useState } from "react";
import { fetchFlujosBandeja } from "../flujos/api";
import {
  esLineaConcreta,
  normalizarFlujosProducto,
  PRODUCTO_TODOS,
  seleccionTrasCambiarLinea,
} from "../utils/bandejaProductos";

export function useBandejaProductos(conexionSeleccionadaId) {
  const concreta = esLineaConcreta(conexionSeleccionadaId);
  const [lineaVista, setLineaVista] = useState(conexionSeleccionadaId);
  const [flujos, setFlujos] = useState([]);
  const [flujoSeleccionadoId, setFlujoSeleccionadoId] = useState(PRODUCTO_TODOS);
  const [cargando, setCargando] = useState(concreta);
  const [error, setError] = useState(null);

  if (lineaVista !== conexionSeleccionadaId) {
    setLineaVista(conexionSeleccionadaId);
    setFlujoSeleccionadoId(
      seleccionTrasCambiarLinea(
        lineaVista,
        conexionSeleccionadaId,
        flujoSeleccionadoId
      )
    );
    setFlujos([]);
    setError(null);
    setCargando(concreta);
  }

  useEffect(() => {
    if (!concreta) return undefined;

    let cancelado = false;

    fetchFlujosBandeja(conexionSeleccionadaId)
      .then((data) => {
        if (cancelado) return;
        setFlujos(normalizarFlujosProducto(data?.flows));
      })
      .catch((err) => {
        if (cancelado) return;
        setFlujos([]);
        setError(err?.message || "No se pudieron cargar los productos");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [conexionSeleccionadaId, concreta]);

  const seleccionarProducto = useCallback(
    (id) => {
      const next = id == null || String(id).trim() === "" ? PRODUCTO_TODOS : String(id).trim();
      if (next !== PRODUCTO_TODOS && !flujos.some((f) => f.id === next)) return;
      setFlujoSeleccionadoId(next);
    },
    [flujos]
  );

  const visible = esLineaConcreta(conexionSeleccionadaId);

  return {
    visible,
    flujos,
    flujoSeleccionadoId,
    cargando,
    error,
    vacio: visible && !cargando && !error && flujos.length === 0,
    seleccionarProducto,
  };
}
