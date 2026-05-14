import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "macbot_campaigns";

const initialCampaigns = [
  {
    id: "c1",
    nombre: "Papercraft WhatsApp",
    plataforma: "Meta Ads",
    estado: "Activa",
    presupuesto: 39,
    gastado: 18,
    leads: 74,
    ventas: 11,
    ctr: 2.7,
    roas: 2.4,
  },

  {
    id: "c2",
    nombre: "Remarketing 23h",
    plataforma: "Meta Ads",
    estado: "Pausada",
    presupuesto: 19,
    gastado: 7,
    leads: 22,
    ventas: 5,
    ctr: 4.1,
    roas: 3.7,
  },
];

export default function Campañas() {
  const [campaigns, setCampaigns] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    return saved
      ? JSON.parse(saved)
      : initialCampaigns;
  });

  const [modal, setModal] = useState(false);

  const [search, setSearch] = useState("");

  const [newCampaign, setNewCampaign] =
    useState({
      nombre: "",
      plataforma: "Meta Ads",
      presupuesto: "",
    });

  const [toast, setToast] = useState("");

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(campaigns)
    );
  }, [campaigns]);

  function showToast(text) {
    setToast(text);

    setTimeout(() => {
      setToast("");
    }, 2200);
  }

  function crearCampaña() {
    if (
      !newCampaign.nombre.trim()
    )
      return;

    const nueva = {
      id: Date.now().toString(),
      nombre: newCampaign.nombre,
      plataforma:
        newCampaign.plataforma,
      estado: "Activa",
      presupuesto:
        Number(
          newCampaign.presupuesto
        ) || 0,
      gastado: 0,
      leads: 0,
      ventas: 0,
      ctr: 0,
      roas: 0,
    };

    setCampaigns((prev) => [
      nueva,
      ...prev,
    ]);

    setNewCampaign({
      nombre: "",
      plataforma: "Meta Ads",
      presupuesto: "",
    });

    setModal(false);

    showToast(
      "Campaña creada"
    );
  }

  function eliminarCampaña(id) {
    const ok = confirm(
      "¿Eliminar campaña?"
    );

    if (!ok) return;

    setCampaigns((prev) =>
      prev.filter(
        (c) => c.id !== id
      )
    );

    showToast(
      "Campaña eliminada"
    );
  }

  function toggleEstado(id) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              estado:
                c.estado ===
                "Activa"
                  ? "Pausada"
                  : "Activa",
            }
          : c
      )
    );

    showToast(
      "Estado actualizado"
    );
  }

  function duplicar(id) {
    const original =
      campaigns.find(
        (c) => c.id === id
      );

    if (!original) return;

    const copia = {
      ...original,
      id: Date.now().toString(),
      nombre:
        original.nombre +
        " copia",
    };

    setCampaigns((prev) => [
      copia,
      ...prev,
    ]);

    showToast(
      "Campaña duplicada"
    );
  }

  function simularResultados(
    id
  ) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              leads:
                c.leads +
                Math.floor(
                  Math.random() * 8
                ),

              ventas:
                c.ventas +
                Math.floor(
                  Math.random() * 2
                ),

              gastado:
                c.gastado +
                Math.floor(
                  Math.random() * 6
                ),

              ctr:
                (
                  c.ctr +
                  Math.random()
                ).toFixed(1),

              roas:
                (
                  c.roas +
                  Math.random()
                ).toFixed(1),
            }
          : c
      )
    );

    showToast(
      "Resultados simulados"
    );
  }

  const filtered = useMemo(() => {
    return campaigns.filter(
      (c) =>
        c.nombre
          .toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||
        c.plataforma
          .toLowerCase()
          .includes(
            search.toLowerCase()
          )
    );
  }, [campaigns, search]);

  const resumen = useMemo(() => {
    const leads =
      campaigns.reduce(
        (acc, c) =>
          acc + c.leads,
        0
      );

    const ventas =
      campaigns.reduce(
        (acc, c) =>
          acc + c.ventas,
        0
      );

    const gastado =
      campaigns.reduce(
        (acc, c) =>
          acc + c.gastado,
        0
      );

    return {
      leads,
      ventas,
      gastado,
    };
  }, [campaigns]);

  return (
    <div className="campaignsPage">
      <style>{styles}</style>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

      <div className="top">
        <div>
          <h1>Campañas</h1>

          <p>
            Control visual de
            campañas Meta Ads,
            WhatsApp y funnels.
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
            + Nueva campaña
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Leads</span>

          <strong>
            {resumen.leads}
          </strong>
        </div>

        <div className="stat">
          <span>Ventas</span>

          <strong>
            {resumen.ventas}
          </strong>
        </div>

        <div className="stat">
          <span>Gastado</span>

          <strong>
            Bs {resumen.gastado}
          </strong>
        </div>
      </div>

      <div className="grid">
        {filtered.map((camp) => (
          <div
            key={camp.id}
            className="card"
          >
            <div className="cardTop">
              <div>
                <h2>
                  {camp.nombre}
                </h2>

                <p>
                  {
                    camp.plataforma
                  }
                </p>
              </div>

              <div
                className={`estado ${camp.estado.toLowerCase()}`}
              >
                {camp.estado}
              </div>
            </div>

            <div className="metrics">
              <div>
                <span>
                  Presupuesto
                </span>

                <strong>
                  Bs{" "}
                  {
                    camp.presupuesto
                  }
                </strong>
              </div>

              <div>
                <span>
                  Gastado
                </span>

                <strong>
                  Bs{" "}
                  {camp.gastado}
                </strong>
              </div>

              <div>
                <span>
                  Leads
                </span>

                <strong>
                  {camp.leads}
                </strong>
              </div>

              <div>
                <span>
                  Ventas
                </span>

                <strong>
                  {camp.ventas}
                </strong>
              </div>

              <div>
                <span>
                  CTR
                </span>

                <strong>
                  {camp.ctr}%
                </strong>
              </div>

              <div>
                <span>
                  ROAS
                </span>

                <strong>
                  {camp.roas}
                </strong>
              </div>
            </div>

            <div className="progressWrap">
              <div className="progressTop">
                <span>
                  Rendimiento
                </span>

                <span>
                  {Math.min(
                    100,
                    camp.roas * 20
                  )}
                  %
                </span>
              </div>

              <div className="progress">
                <div
                  className="fill"
                  style={{
                    width: `${Math.min(
                      100,
                      camp.roas * 20
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="buttons">
              <button
                onClick={() =>
                  toggleEstado(
                    camp.id
                  )
                }
              >
                {camp.estado ===
                "Activa"
                  ? "Pausar"
                  : "Activar"}
              </button>

              <button
                onClick={() =>
                  duplicar(camp.id)
                }
              >
                Duplicar
              </button>

              <button
                onClick={() =>
                  simularResultados(
                    camp.id
                  )
                }
              >
                Simular
              </button>

              <button
                className="danger"
                onClick={() =>
                  eliminarCampaña(
                    camp.id
                  )
                }
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
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
              Nueva campaña
            </h2>

            <input
              placeholder="Nombre"
              value={
                newCampaign.nombre
              }
              onChange={(e) =>
                setNewCampaign(
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

            <select
              value={
                newCampaign.plataforma
              }
              onChange={(e) =>
                setNewCampaign(
                  (
                    prev
                  ) => ({
                    ...prev,
                    plataforma:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option>
                Meta Ads
              </option>

              <option>
                TikTok Ads
              </option>

              <option>
                Google Ads
              </option>
            </select>

            <input
              type="number"
              placeholder="Presupuesto"
              value={
                newCampaign.presupuesto
              }
              onChange={(e) =>
                setNewCampaign(
                  (
                    prev
                  ) => ({
                    ...prev,
                    presupuesto:
                      e.target
                        .value,
                  })
                )
              }
            />

            <button
              className="primary full"
              onClick={
                crearCampaña
              }
            >
              Crear campaña
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
.campaignsPage {
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

.grid {
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:18px;
}

.card {
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:24px;
  padding:22px;
  overflow:hidden;
  position:relative;
}

.card::after {
  content:"";
  width:180px;
  height:180px;
  border-radius:50%;
  background:rgba(255,255,255,.03);
  position:absolute;
  right:-60px;
  bottom:-60px;
}

.cardTop {
  display:flex;
  justify-content:space-between;
  gap:20px;
  margin-bottom:22px;
}

.cardTop h2 {
  margin:0;
  font-size:22px;
}

.cardTop p {
  margin:6px 0 0;
  color:#94a3b8;
}

.estado {
  height:34px;
  display:flex;
  align-items:center;
  padding:0 12px;
  border-radius:999px;
  font-size:12px;
  font-weight:900;
}

.estado.activa {
  background:rgba(34,197,94,.15);
  color:#86efac;
}

.estado.pausada {
  background:rgba(249,115,22,.15);
  color:#fdba74;
}

.metrics {
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:16px;
  margin-bottom:22px;
}

.metrics span {
  display:block;
  color:#94a3b8;
  font-size:12px;
  margin-bottom:5px;
}

.metrics strong {
  font-size:20px;
}

.progressWrap {
  margin-bottom:20px;
}

.progressTop {
  display:flex;
  justify-content:space-between;
  margin-bottom:8px;
  font-size:13px;
}

.progress {
  height:12px;
  border-radius:999px;
  background:#111827;
  overflow:hidden;
}

.fill {
  height:100%;
  border-radius:inherit;
  background:linear-gradient(90deg,#22c55e,#06b6d4);
}

.buttons {
  display:flex;
  flex-wrap:wrap;
  gap:10px;
}

.buttons button {
  flex:1;
  min-width:100px;
  height:42px;
  border:none;
  border-radius:13px;
  background:#111827;
  color:white;
  cursor:pointer;
  font-weight:800;
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
.modal select {
  width:100%;
  height:48px;
  border:none;
  border-radius:14px;
  background:#111827;
  color:white;
  padding:0 14px;
  margin-bottom:12px;
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
  .grid {
    grid-template-columns:1fr;
  }

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

@media (max-width: 650px) {
  .metrics {
    grid-template-columns:repeat(2,1fr);
  }

  .buttons {
    flex-direction:column;
  }
}
`;