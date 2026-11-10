import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchAjustes } from "./ajustes/api";
import { panelStyles } from "./panel/styles";
import { ESTADO_SIN_LINEAS, estadoDeLineaWhatsapp } from "./panel/whatsappEstado";

function tituloLinea(conexion) {
  const nombre = String(conexion?.nombre || "").trim();
  if (nombre) return nombre;
  const numero = String(conexion?.numero || "").trim();
  if (numero) return numero;
  return "Línea de WhatsApp";
}

function numeroVisible(conexion) {
  const nombre = String(conexion?.nombre || "").trim();
  const numero = String(conexion?.numero || "").trim();
  if (nombre && numero && numero !== nombre) return numero;
  return "";
}

function lineasDesdeAjustes(data) {
  const lista = Array.isArray(data?.conexiones)
    ? data.conexiones
    : Array.isArray(data?.conexionesWhatsapp)
      ? data.conexionesWhatsapp
      : [];

  return lista.map((conexion, index) => ({
    id: conexion?.id != null && conexion.id !== "" ? String(conexion.id) : `linea-${index}`,
    titulo: tituloLinea(conexion),
    numero: numeroVisible(conexion),
    estado: estadoDeLineaWhatsapp(conexion),
  }));
}

function mensajeError(err) {
  return err instanceof ApiError
    ? err.message
    : "No se pudo leer el estado de WhatsApp.";
}

async function leerEstadoWhatsapp() {
  const data = await fetchAjustes();
  return {
    nombre: String(data?.perfil?.nombre || "").trim(),
    lineas: lineasDesdeAjustes(data),
  };
}

export default function Panel() {
  const [nombre, setNombre] = useState("");
  const [lineas, setLineas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const estado = await leerEstadoWhatsapp();
      setNombre(estado.nombre);
      setLineas(estado.lineas);
    } catch (err) {
      setLineas([]);
      setNombre("");
      setError(mensajeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    leerEstadoWhatsapp()
      .then((estado) => {
        if (cancelled) return;
        setNombre(estado.nombre);
        setLineas(estado.lineas);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setLineas([]);
        setNombre("");
        setError(mensajeError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const saludo = nombre ? `Hola, ${nombre}` : "Hola";
  const mostrarLineas = !error && lineas.length > 0;
  const sinLineas = !loading && !error && lineas.length === 0;

  return (
    <div className="panelDash">
      <style>{panelStyles}</style>
      <div className="welcome">
        <p className="eyebrow">Inicio</p>
        {loading && !nombre ? <div className="nameSkel" aria-hidden="true" /> : <h1>{saludo}</h1>}
        <p className="lead">
          Bienvenido a MacBot. Aquí puedes ver el estado real de WhatsApp.
        </p>

        <section className="waCard" aria-labelledby="wa-status-title">
          <div className="waHead">
            <h2 id="wa-status-title">WhatsApp</h2>
            <button type="button" className="refresh" onClick={cargar} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>

          {error ? (
            <p className="waError" role="alert">
              {error}
            </p>
          ) : null}

          {loading && !mostrarLineas && !error ? (
            <div className="waSkeleton" aria-hidden="true">
              <span />
              <span />
            </div>
          ) : null}

          {sinLineas ? (
            <article className="waRow">
              <div>
                <strong>Sin líneas</strong>
                <p>No hay una conexión de WhatsApp guardada.</p>
              </div>
              <span className={`pill ${ESTADO_SIN_LINEAS.key}`}>{ESTADO_SIN_LINEAS.label}</span>
            </article>
          ) : null}

          {mostrarLineas ? (
            <ul className="waList">
              {lineas.map((linea) => (
                <li key={linea.id} className="waRow">
                  <div>
                    <strong>{linea.titulo}</strong>
                    {linea.numero ? <p>{linea.numero}</p> : null}
                  </div>
                  <span className={`pill ${linea.estado.key}`}>{linea.estado.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
