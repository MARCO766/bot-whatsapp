import { PRODUCTO_TODOS } from "../../utils/bandejaProductos";

/**
 * Fila visual de productos de la línea activa.
 * Todos omite flujo_id. Un producto recarga la bandeja con ese flujo.
 */
export default function BandejaProductos({
  visible,
  flujos,
  flujoSeleccionadoId,
  cargando,
  error,
  vacio,
  onSeleccionar,
}) {
  if (!visible) return null;

  const todosActivo = flujoSeleccionadoId === PRODUCTO_TODOS;

  return (
    <div className="bandejaProductoPicker" role="tablist" aria-label="Producto">
      <button
        type="button"
        role="tab"
        aria-selected={todosActivo}
        className={`bandejaProductoChip ${todosActivo ? "bandejaProductoChip--active" : ""}`}
        onClick={() => onSeleccionar(PRODUCTO_TODOS)}
      >
        Todos
      </button>

      {cargando && (
        <span className="bandejaProductoEstado" role="status">
          Cargando productos...
        </span>
      )}

      {error && (
        <span className="bandejaProductoEstado bandejaProductoEstado--error" role="alert">
          {error}
        </span>
      )}

      {vacio && (
        <span className="bandejaProductoEstado" role="status">
          Esta línea no tiene flujos
        </span>
      )}

      {flujos.map((flujo) => {
        const activo = flujoSeleccionadoId === flujo.id;
        return (
          <button
            key={flujo.id}
            type="button"
            role="tab"
            aria-selected={activo}
            title={flujo.nombre}
            className={`bandejaProductoChip ${activo ? "bandejaProductoChip--active" : ""}`}
            onClick={() => onSeleccionar(flujo.id)}
          >
            {flujo.nombre}
          </button>
        );
      })}
    </div>
  );
}
