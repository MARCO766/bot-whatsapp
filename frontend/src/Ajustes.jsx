import React, { useEffect, useState } from "react";

const STORAGE_KEY = "macbot_settings";

const defaultSettings = {
  nombreCRM: "MacBot CRM",
  sonido: true,
  animaciones: true,
  modoOscuro: true,
  notificaciones: true,
  autoResponder: true,
  idioma: "Español",
  color: "#22c55e",
  mensajeBienvenida:
    "Hola 👋 gracias por escribirnos.",
};

export default function Ajustes() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem(
      STORAGE_KEY
    );

    return saved
      ? JSON.parse(saved)
      : defaultSettings;
  });

  const [toast, setToast] =
    useState("");

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );
  }, [settings]);

  function showToast(text) {
    setToast(text);

    setTimeout(() => {
      setToast("");
    }, 2200);
  }

  function toggle(key) {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

    showToast(
      "Configuración actualizada"
    );
  }

  function resetAll() {
    const ok = confirm(
      "¿Resetear configuraciones?"
    );

    if (!ok) return;

    setSettings(defaultSettings);

    localStorage.removeItem(
      STORAGE_KEY
    );

    showToast(
      "Configuración reiniciada"
    );
  }

  return (
    <div className="settingsPage">
      <style>{styles}</style>

      {toast && (
        <div className="toast">
          {toast}
        </div>
      )}

      <div className="top">
        <div>
          <h1>Ajustes</h1>

          <p>
            Configuración general
            del CRM y experiencia
            visual.
          </p>
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <h2>
            Información general
          </h2>

          <div className="field">
            <label>
              Nombre del CRM
            </label>

            <input
              value={
                settings.nombreCRM
              }
              onChange={(e) =>
                setSettings(
                  (
                    prev
                  ) => ({
                    ...prev,
                    nombreCRM:
                      e.target
                        .value,
                  })
                )
              }
            />
          </div>

          <div className="field">
            <label>
              Idioma
            </label>

            <select
              value={
                settings.idioma
              }
              onChange={(e) =>
                setSettings(
                  (
                    prev
                  ) => ({
                    ...prev,
                    idioma:
                      e.target
                        .value,
                  })
                )
              }
            >
              <option>
                Español
              </option>

              <option>
                English
              </option>

              <option>
                Português
              </option>
            </select>
          </div>

          <div className="field">
            <label>
              Color principal
            </label>

            <input
              type="color"
              value={
                settings.color
              }
              onChange={(e) =>
                setSettings(
                  (
                    prev
                  ) => ({
                    ...prev,
                    color:
                      e.target
                        .value,
                  })
                )
              }
            />
          </div>
        </section>

        <section className="card">
          <h2>
            Sistema
          </h2>

          <div className="switchRow">
            <div>
              <strong>
                Sonidos
              </strong>

              <p>
                Reproducir sonidos
                en mensajes.
              </p>
            </div>

            <button
              className={
                settings.sonido
                  ? "switch active"
                  : "switch"
              }
              onClick={() =>
                toggle(
                  "sonido"
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="switchRow">
            <div>
              <strong>
                Animaciones
              </strong>

              <p>
                Efectos y
                transiciones.
              </p>
            </div>

            <button
              className={
                settings.animaciones
                  ? "switch active"
                  : "switch"
              }
              onClick={() =>
                toggle(
                  "animaciones"
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="switchRow">
            <div>
              <strong>
                Notificaciones
              </strong>

              <p>
                Mostrar alertas.
              </p>
            </div>

            <button
              className={
                settings.notificaciones
                  ? "switch active"
                  : "switch"
              }
              onClick={() =>
                toggle(
                  "notificaciones"
                )
              }
            >
              <span />
            </button>
          </div>

          <div className="switchRow">
            <div>
              <strong>
                Auto responder
              </strong>

              <p>
                Respuesta automática
                del bot.
              </p>
            </div>

            <button
              className={
                settings.autoResponder
                  ? "switch active"
                  : "switch"
              }
              onClick={() =>
                toggle(
                  "autoResponder"
                )
              }
            >
              <span />
            </button>
          </div>
        </section>

        <section className="card full">
          <h2>
            Mensaje de bienvenida
          </h2>

          <textarea
            value={
              settings.mensajeBienvenida
            }
            onChange={(e) =>
              setSettings(
                (
                  prev
                ) => ({
                  ...prev,
                  mensajeBienvenida:
                    e.target
                      .value,
                })
              )
            }
          />

          <button
            className="primary"
            onClick={() =>
              showToast(
                "Mensaje guardado"
              )
            }
          >
            Guardar mensaje
          </button>
        </section>

        <section className="card full">
          <h2>
            Zona peligrosa
          </h2>

          <p>
            Resetear ajustes y
            configuraciones del
            CRM.
          </p>

          <button
            className="danger"
            onClick={resetAll}
          >
            Resetear ajustes
          </button>
        </section>
      </div>
    </div>
  );
}

const styles = `
.settingsPage {
  min-height:100%;
}

.top {
  margin-bottom:22px;
}

.top h1 {
  margin:0;
  font-size:34px;
}

.top p {
  margin:6px 0 0;
  color:#94a3b8;
}

.grid {
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:20px;
}

.card {
  background:#0f172a;
  border:1px solid rgba(148,163,184,.15);
  border-radius:24px;
  padding:22px;
}

.card.full {
  grid-column:1 / -1;
}

.card h2 {
  margin:0 0 18px;
}

.field {
  margin-bottom:18px;
}

.field label {
  display:block;
  margin-bottom:8px;
  color:#94a3b8;
  font-size:13px;
}

.field input,
.field select,
textarea {
  width:100%;
  border:none;
  border-radius:14px;
  background:#111827;
  color:white;
  padding:14px;
}

input[type="color"] {
  height:60px;
  padding:8px;
}

textarea {
  min-height:160px;
  resize:vertical;
  margin-bottom:14px;
}

.switchRow {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:20px;
  padding:18px 0;
  border-bottom:1px solid rgba(148,163,184,.08);
}

.switchRow:last-child {
  border-bottom:none;
}

.switchRow strong {
  display:block;
}

.switchRow p {
  margin:6px 0 0;
  color:#94a3b8;
  font-size:13px;
}

.switch {
  width:62px;
  height:34px;
  border:none;
  border-radius:999px;
  background:#1e293b;
  position:relative;
  cursor:pointer;
  transition:.2s;
}

.switch span {
  width:26px;
  height:26px;
  border-radius:50%;
  background:white;
  position:absolute;
  top:4px;
  left:4px;
  transition:.2s;
}

.switch.active {
  background:linear-gradient(135deg,#22c55e,#06b6d4);
}

.switch.active span {
  left:32px;
}

.primary,
.danger {
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

.danger {
  background:rgba(127,29,29,.85);
  color:#fecaca;
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

@media (max-width: 850px) {
  .grid {
    grid-template-columns:1fr;
  }
}
`;