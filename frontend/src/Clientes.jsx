import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "macbot_clientes";

const initialClients = [
  {
    id: "1",
    nombre: "Carlos Mendoza",
    numero: "59171234567",
    pais: "Bolivia",
    etiqueta: "Nuevo",
    estado: "Activo",
    compras: 1,
    total: 39,
    notas: "Interesado en papercraft",
  },

  {
    id: "2",
    nombre: "María López",
    numero: "59170000000",
    pais: "Perú",
    etiqueta: "Pagó",
    estado: "Activo",
    compras: 3,
    total: 117,
    notas: "Compró varios packs",
  },
];

export default function Clientes() {
  const [clientes, setClientes] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    return saved
      ? JSON.parse(saved)
      : initialClients;
  });

  const [search, setSearch] = useState("");

  const [modal, setModal] = useState(false);

  const [toast, setToast] = useState("");

  const [nuevoCliente, setNuevoCliente] =
    useState({
      nombre: "",
      numero: "",
      pais: "",
      etiqueta: "Nuevo",
      notas: "",
    });

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(clientes)
    );
  }, [clientes]);

  function showToast(text) {
    setToast(text);

    setTimeout(() => {
      setToast("");
    }, 2200);
  }

  function crearCliente() {
    if (
      !nuevoCliente.nombre.trim()
    )
      return;

    const nuevo = {
      id: Date.now().toString(),

      nombre:
        nuevoCliente.nombre,

      numero:
        nuevoCliente.numero,

      pais: nuevoCliente.pais,

      etiqueta:
        nuevoCliente.etiqueta,

      estado: "Activo",

      compras: 0,

      total: 0,

      notas:
        nuevoCliente.notas,
    };

    setClientes((prev) => [
      nuevo,
      ...prev,
    ]);

    setNuevoCliente({
      nombre: "",
      numero: "",
      pais: "",
      etiqueta: "Nuevo",
      notas: "",
    });

    setModal(false);

    showToast(
      "Cliente creado"
    );
  }

  function eliminarCliente(id) {
    const ok = confirm(
      "¿Eliminar cliente?"
    );

    if (!ok) return;

    setClientes((prev) =>
      prev.filter(
        (c) => c.id !== id
      )
    );

    showToast(
      "Cliente eliminado"
    );
  }

  function cambiarEstado(id) {
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              estado:
                c.estado ===
                "Activo"
                  ? "Inactivo"
                  : "Activo",
            }
          : c
      )
    );

    showToast(
      "Estado actualizado"
    );
  }

  function cambiarEtiqueta(
    id,
    etiqueta
  ) {
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              etiqueta,
            }
          : c
      )
    );

    showToast(
      "Etiqueta actualizada"
    );
  }

  function simularCompra(id) {
    setClientes((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              compras:
                c.compras + 1,

              total:
                c.total + 39,

              etiqueta:
                "Pagó",
            }
          : c
      )
    );

    showToast(
      "Compra simulada"
    );
  }

  const filtered = useMemo(() => {
    return clientes.filter(
      (c) =>
        c.nombre
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||
        c.numero.includes(search)
    );
  }, [clientes, search]);

  const resumen = useMemo(() => {
    const activos =
      clientes.filter(
        (c) =>
          c.estado === "Activo"
      ).length;

    const ingresos =
      clientes.reduce(
        (acc, c) =>
          acc + c.total,
        0
      );

    const compras =
      clientes.reduce(
        (acc, c) =>
          acc + c.compras,
        0
      );

    return {
      activos,
      ingresos,
      compras,
    };
  }, [clientes]);

  return (
    <div className="clientesPage">
      <style>{styles}</style>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

      <div className="top">
        <div>
          <h1>Clientes</h1>

          <p>
            Gestión visual de
            leads y compradores.
          </p>
        </div>

        <div className="topActions">
          <input
            placeholder="Buscar..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
          />

          <button
            className="primary"
            onClick={() =>
              setModal(true)
            }
          >
            + Nuevo cliente
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Clientes activos</span>

          <strong>
            {resumen.activos}
          </strong>
        </div>

        <div className="stat">
          <span>Compras</span>

          <strong>
            {resumen.compras}
          </strong>
        </div>

        <div className="stat">
          <span>Ingresos</span>

          <strong>
            Bs{" "}
            {resumen.ingresos}
          </strong>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>

              <th>País</th>

              <th>Etiqueta</th>

              <th>Compras</th>

              <th>Total</th>

              <th>Estado</th>

              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="userCell">
                    <div className="avatar">
                      {c.nombre.charAt(
                        0
                      )}
                    </div>

                    <div>
                      <strong>
                        {c.nombre}
                      </strong>

                      <p>
                        {c.numero}
                      </p>
                    </div>
                  </div>
                </td>

                <td>{c.pais}</td>

                <td>
                  <span
                    className={`tag ${c.etiqueta.toLowerCase()}`}
                  >
                    {c.etiqueta}
                  </span>
                </td>

                <td>
                  {c.compras}
                </td>

                <td>
                  Bs {c.total}
                </td>

                <td>
                  <span
                    className={`estado ${c.estado.toLowerCase()}`}
                  >
                    {c.estado}
                  </span>
                </td>

                <td>
                  <div className="buttons">
                    <button
                      onClick={() =>
                        simularCompra(
                          c.id
                        )
                      }
                    >
                      Compra
                    </button>

                    <button
                      onClick={() =>
                        cambiarEstado(
                          c.id
                        )
                      }
                    >
                      Estado
                    </button>

                    <select
                      value={
                        c.etiqueta
                      }
                      onChange={(
                        e
                      ) =>
                        cambiarEtiqueta(
                          c.id,
                          e.target
                            .value
                        )
                      }
                    >
                      <option>
                        Nuevo
                      </option>

                      <option>
                        Interesado
                      </option>

                      <option>
                        Pagó
                      </option>
                    </select>

                    <button
                      className="danger"
                      onClick={() =>
                        eliminarCliente(
                          c.id
                        )
                      }
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div
          className="modalOverlay"
          onClick={() =>
            setModal(false)
          }
        >
          <div
            className="modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >
            <h2>
              Nuevo cliente
            </h2>

            <input
              placeholder="Nombre"
              value={
                nuevoCliente.nombre
              }
              onChange={(e) =>
                setNuevoCliente(
                  (
                    prev
                  ) => ({
                    ...prev,
                    nombre:
                      e.target
                        .value,
                  })
                )
              }
            />

            <input
              placeholder="Número"
              value={
                nuevoCliente.numero
              }
              onChange={(e) =>
                setNuevoCliente(
                  (
                    prev
                  ) => ({
                    ...prev,
                    numero:
                      e.target
                        .value,
                  })
                )
              }
            />

            <input
              placeholder="País"
              value={
                nuevoCliente.pais
              }
              onChange={(e) =>
                setNuevoCliente(
                  (
                    prev
                  ) => ({
                    ...prev,
                    pais:
                      e.target
                        .value,
                  })
                )
              }
            />

            <select
              value={
                nuevoCliente.etiqueta
              }
              onChange={(e) =>
                setNuevoCliente(
                  (
                    prev
                  ) => ({
                    ...prev,
                    etiqueta:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option>
                Nuevo
              </option>

              <option>
                Interesado
              </option>

              <option>
                Pagó
              </option>
            </select>

            <textarea
              placeholder="Notas"
              value={
                nuevoCliente.notas
              }
              onChange={(e) =>
                setNuevoCliente(
                  (
                    prev
                  ) => ({
                    ...prev,
                    notas:
                      e.target
                        .value,
                  })
                )
              }
            />

            <button
              className="primary full"
              onClick={
                crearCliente
              }
            >
              Crear cliente
            </button>

            <button
              className="secondary full"
              onClick={() =>
                setModal(false)
              }
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = `
.clientesPage {
  min-height:100%;
}

.top {
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:22px;
  gap:20px;
}

.top h1 {
  margin:0;
  font-size:34px;
}

.top p {
  margin:6px 0 0;
  color:#94a3b8;
}

.topActions {
  display:flex;
  gap:12px;
}

.topActions input {
  width:280px;
  height:46px;
  border:none;
  border-radius:15px;
  background:#111827;
  color:white;
  padding:0 14px;
}

.primary,
.secondary {
  border:none;
  height:46px;
  border-radius:15px;
  padding:0 18px;
  cursor:pointer;
  font-weight:900;
}

.primary {
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
}

.secondary {
  background:#111827;
  color:white;
}

.stats {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:18px;
  margin-bottom:20px;
}

.stat {
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:22px;
  padding:20px;
}

.stat span {
  display:block;
  color:#94a3b8;
  margin-bottom:10px;
}

.stat strong {
  font-size:32px;
}

.tableWrap {
  overflow:auto;
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:24px;
}

table {
  width:100%;
  border-collapse:collapse;
}

thead {
  background:#111827;
}

th {
  text-align:left;
  padding:18px;
  color:#94a3b8;
  font-size:13px;
}

td {
  padding:18px;
  border-top:1px solid rgba(148,163,184,.08);
}

.userCell {
  display:flex;
  align-items:center;
  gap:12px;
}

.avatar {
  width:44px;
  height:44px;
  border-radius:50%;
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
}

.userCell p {
  margin:4px 0 0;
  color:#94a3b8;
  font-size:13px;
}

.tag,
.estado {
  display:inline-flex;
  padding:5px 10px;
  border-radius:999px;
  font-size:12px;
  font-weight:900;
}

.tag.nuevo {
  background:rgba(6,182,212,.15);
  color:#67e8f9;
}

.tag.interesado {
  background:rgba(234,179,8,.15);
  color:#fde68a;
}

.tag.pagó {
  background:rgba(34,197,94,.15);
  color:#86efac;
}

.estado.activo {
  background:rgba(34,197,94,.15);
  color:#86efac;
}

.estado.inactivo {
  background:rgba(239,68,68,.15);
  color:#fecaca;
}

.buttons {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}

.buttons button,
.buttons select {
  height:38px;
  border:none;
  border-radius:12px;
  background:#111827;
  color:white;
  padding:0 12px;
  cursor:pointer;
}

.buttons .danger {
  background:rgba(127,29,29,.8);
  color:#fecaca;
}

.modalOverlay {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.68);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:100;
}

.modal {
  width:390px;
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:24px;
  padding:22px;
}

.modal h2 {
  margin:0 0 16px;
}

.modal input,
.modal select,
.modal textarea {
  width:100%;
  border:none;
  border-radius:14px;
  background:#111827;
  color:white;
  padding:14px;
  margin-bottom:12px;
}

.modal textarea {
  min-height:120px;
  resize:vertical;
}

.full {
  width:100%;
  margin-bottom:10px;
}

.toast {
  position:fixed;
  top:18px;
  right:24px;
  background:linear-gradient(135deg,#22c55e,#06b6d4);
  color:#052e16;
  font-weight:900;
  border-radius:16px;
  padding:13px 18px;
  z-index:500;
  box-shadow:0 15px 50px rgba(0,0,0,.35);
}

@media (max-width: 950px) {
  .stats {
    grid-template-columns:1fr;
  }

  .top {
    flex-direction:column;
    align-items:flex-start;
  }

  .topActions {
    width:100%;
  }

  .topActions input {
    flex:1;
    width:auto;
  }
}
`;