import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "macbot_panel_conexiones";

const defaultConnections = {
  numero: "",
  token: "",
  phoneId: "",
  pixel: "",
  capi: "",
};

export default function Panel({ cambiarVista }) {
  const [connections, setConnections] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultConnections;
  });

  const [showToken, setShowToken] = useState(false);
  const [showCapi, setShowCapi] = useState(false);
  const [toast, setToast] = useState("");
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  }, [connections]);

  useEffect(() => {
    const timer = setInterval(() => {
      setPulse((prev) => prev + 1);
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 2200);
  }

  function updateField(key, value) {
    setConnections((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function saveConnections() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
    showToast("Conexiones guardadas correctamente");
  }

  function resetConnections() {
    const ok = confirm("¿Borrar todos los datos de conexión?");
    if (!ok) return;

    setConnections(defaultConnections);
    localStorage.removeItem(STORAGE_KEY);
    showToast("Conexiones reiniciadas");
  }

  const status = useMemo(() => {
    const total = Object.values(connections).length;
    const filled = Object.values(connections).filter((v) => String(v).trim()).length;
    const percent = Math.round((filled / total) * 100);

    return {
      total,
      filled,
      percent,
      ready: filled === total,
    };
  }, [connections]);

  const steps = [
    {
      title: "Número WhatsApp",
      desc: "Número conectado al cliente",
      done: !!connections.numero,
    },
    {
      title: "Token",
      desc: "Permiso para enviar mensajes",
      done: !!connections.token,
    },
    {
      title: "Phone ID",
      desc: "ID del número en Meta",
      done: !!connections.phoneId,
    },
    {
      title: "Pixel Meta",
      desc: "Medición de eventos web",
      done: !!connections.pixel,
    },
    {
      title: "CAPI Eventos",
      desc: "Eventos servidor a Meta",
      done: !!connections.capi,
    },
  ];

  return (
    <div className="panelUltra">
      <style>{styles}</style>

      {toast && <div className="toast">{toast}</div>}

      <section className="hero">
        <div className="heroGlow" />

        <div className="heroInfo">
          <span className="eyebrow">Centro de conexiones</span>

          <h1>Conecta cada cliente a su WhatsApp, Pixel y CAPI</h1>

          <p>
            Aquí tus clientes pondrán sus datos principales para que el CRM pueda
            enviar mensajes, medir eventos y preparar la conexión real con server.js.
          </p>

          <div className="heroActions">
            <button onClick={saveConnections}>Guardar conexiones</button>
            <button className="soft" onClick={() => cambiarVista("inbox")}>
              Ir a bandeja
            </button>
          </div>
        </div>

        <div className="statusOrb">
          <div className="orbRing" key={pulse} />
          <strong>{status.percent}%</strong>
          <span>{status.ready ? "Listo" : "Faltan datos"}</span>
        </div>
      </section>

      <section className="quickGrid">
        <div className="quickCard green">
          <span>Estado</span>
          <strong>{status.ready ? "Conectado" : "Pendiente"}</strong>
          <p>{status.filled} de {status.total} campos completos</p>
        </div>

        <div className="quickCard cyan">
          <span>WhatsApp</span>
          <strong>{connections.numero ? "Preparado" : "Sin número"}</strong>
          <p>Número + Phone ID</p>
        </div>

        <div className="quickCard purple">
          <span>Meta Ads</span>
          <strong>{connections.pixel && connections.capi ? "Eventos OK" : "Falta tracking"}</strong>
          <p>Pixel + CAPI</p>
        </div>
      </section>

      <section className="mainGrid">
        <div className="connectionCard">
          <div className="cardTop">
            <div>
              <h2>Datos de conexión del cliente</h2>
              <p>Solo lo importante para conectar WhatsApp Cloud API y eventos Meta.</p>
            </div>

            <div className={`mainStatus ${status.ready ? "ready" : ""}`}>
              <span />
              {status.ready ? "Completo" : "Incompleto"}
            </div>
          </div>

          <div className="formGrid">
            <div className="field">
              <label>Número de WhatsApp</label>
              <input
                placeholder="Ej: 59170000000"
                value={connections.numero}
                onChange={(e) => updateField("numero", e.target.value)}
              />
              <small>Número que usará el cliente para responder desde el CRM.</small>
            </div>

            <div className="field">
              <label>Phone ID</label>
              <input
                placeholder="Ej: 123456789012345"
                value={connections.phoneId}
                onChange={(e) => updateField("phoneId", e.target.value)}
              />
              <small>ID del número de WhatsApp en Meta Developers.</small>
            </div>

            <div className="field full">
              <label>Token de Meta</label>
              <div className="secretInput">
                <input
                  type={showToken ? "text" : "password"}
                  placeholder="Pega aquí el token"
                  value={connections.token}
                  onChange={(e) => updateField("token", e.target.value)}
                />
                <button onClick={() => setShowToken(!showToken)}>
                  {showToken ? "Ocultar" : "Ver"}
                </button>
              </div>
              <small>Se usará después en server.js para enviar mensajes reales.</small>
            </div>

            <div className="field">
              <label>Pixel de Meta</label>
              <input
                placeholder="Ej: 123456789000000"
                value={connections.pixel}
                onChange={(e) => updateField("pixel", e.target.value)}
              />
              <small>Para medir eventos de Meta Ads.</small>
            </div>

            <div className="field">
              <label>CAPI Eventos</label>
              <div className="secretInput">
                <input
                  type={showCapi ? "text" : "password"}
                  placeholder="Token CAPI / Access token"
                  value={connections.capi}
                  onChange={(e) => updateField("capi", e.target.value)}
                />
                <button onClick={() => setShowCapi(!showCapi)}>
                  {showCapi ? "Ocultar" : "Ver"}
                </button>
              </div>
              <small>Para enviar eventos del servidor a Meta.</small>
            </div>
          </div>

          <div className="buttonRow">
            <button className="primary" onClick={saveConnections}>
              Guardar datos
            </button>

            <button className="secondary" onClick={resetConnections}>
              Limpiar
            </button>

            <button className="secondary" onClick={() => cambiarVista("ajustes")}>
              Ajustes
            </button>
          </div>
        </div>

        <div className="sideStack">
          <div className="progressCard">
            <h2>Progreso de conexión</h2>

            <div className="bigProgress">
              <div style={{ width: `${status.percent}%` }} />
            </div>

            <strong>{status.percent}% configurado</strong>
            <p>Cuando esté al 100%, el cliente estará listo para conectar con el backend.</p>
          </div>

          <div className="stepsCard">
            <h2>Checklist</h2>

            {steps.map((step, index) => (
              <div className="step" key={step.title}>
                <div className={`stepIcon ${step.done ? "done" : ""}`}>
                  {step.done ? "✓" : index + 1}
                </div>

                <div>
                  <strong>{step.title}</strong>
                  <p>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="warningCard">
            <span>Importante</span>
            <p>
              Este panel guarda los datos en el navegador por ahora. Después lo
              conectaremos a server.js, Supabase y Railway para guardar datos reales.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles = `
.panelUltra {
  min-height: 100%;
  position: relative;
}

.toast {
  position: fixed;
  top: 22px;
  right: 24px;
  z-index: 1000;
  padding: 14px 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
  font-weight: 1000;
  box-shadow: 0 20px 60px rgba(6, 182, 212, .3);
  animation: toastIn .25s ease both;
}

.hero {
  min-height: 250px;
  border-radius: 36px;
  padding: 32px;
  margin-bottom: 18px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, .18);
  background:
    radial-gradient(circle at 82% 20%, rgba(34, 211, 238, .28), transparent 30%),
    radial-gradient(circle at 20% 85%, rgba(168, 85, 247, .18), transparent 32%),
    linear-gradient(135deg, rgba(34, 197, 94, .18), rgba(15, 23, 42, .78) 48%, rgba(6, 182, 212, .14));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  animation: fadeUp .35s ease both;
}

.heroGlow {
  position: absolute;
  width: 420px;
  height: 420px;
  right: -150px;
  bottom: -210px;
  border-radius: 50%;
  background: conic-gradient(from 180deg, #22c55e, #06b6d4, #a855f7, #f97316, #22c55e);
  filter: blur(48px);
  opacity: .18;
  animation: rotateGlow 9s linear infinite;
}

.heroInfo {
  position: relative;
  z-index: 2;
  max-width: 820px;
}

.eyebrow {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: 2.5px;
}

.hero h1 {
  margin: 12px 0 12px;
  font-size: 44px;
  line-height: 1.02;
  letter-spacing: -1.4px;
}

.hero p {
  margin: 0;
  color: #b6c4d8;
  font-size: 15px;
  line-height: 1.55;
}

.heroActions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.heroActions button,
.primary,
.secondary {
  height: 48px;
  border: 0;
  border-radius: 16px;
  padding: 0 18px;
  cursor: pointer;
  font-weight: 1000;
  transition: .2s ease;
}

.heroActions button,
.primary {
  color: #031827;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  box-shadow: 0 16px 45px rgba(6, 182, 212, .22);
}

.heroActions .soft,
.secondary {
  color: white;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(148,163,184,.15);
  box-shadow: none;
}

.heroActions button:hover,
.primary:hover,
.secondary:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.statusOrb {
  position: relative;
  z-index: 2;
  width: 170px;
  height: 170px;
  min-width: 170px;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,.04) 58%),
    linear-gradient(135deg, rgba(34,197,94,.22), rgba(6,182,212,.18));
  border: 1px solid rgba(255,255,255,.16);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 25px 90px rgba(6,182,212,.16);
}

.orbRing {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid rgba(34,211,238,.5);
  animation: ringPulse 1.8s ease-out;
}

.statusOrb strong {
  font-size: 42px;
  letter-spacing: -1.5px;
}

.statusOrb span {
  color: #b6c4d8;
  font-weight: 800;
}

.quickGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-bottom: 18px;
}

.quickCard {
  min-height: 125px;
  border-radius: 28px;
  padding: 20px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(148,163,184,.15);
  background: rgba(15,23,42,.72);
  animation: fadeUp .35s ease both;
}

.quickCard:nth-child(2) {
  animation-delay: .05s;
}

.quickCard:nth-child(3) {
  animation-delay: .1s;
}

.quickCard::after {
  content: "";
  position: absolute;
  width: 160px;
  height: 160px;
  right: -70px;
  top: -70px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
}

.quickCard.green {
  background: linear-gradient(135deg, rgba(34,197,94,.24), rgba(15,23,42,.75));
}

.quickCard.cyan {
  background: linear-gradient(135deg, rgba(6,182,212,.24), rgba(15,23,42,.75));
}

.quickCard.purple {
  background: linear-gradient(135deg, rgba(168,85,247,.24), rgba(15,23,42,.75));
}

.quickCard span {
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 1000;
  text-transform: uppercase;
}

.quickCard strong {
  display: block;
  margin-top: 12px;
  font-size: 27px;
}

.quickCard p {
  margin: 8px 0 0;
  color: #94a3b8;
}

.mainGrid {
  display: grid;
  grid-template-columns: 1.35fr .65fr;
  gap: 18px;
}

.connectionCard,
.progressCard,
.stepsCard,
.warningCard {
  border-radius: 30px;
  background: rgba(15,23,42,.74);
  border: 1px solid rgba(148,163,184,.15);
  box-shadow: 0 25px 80px rgba(0,0,0,.18);
  animation: fadeUp .35s ease both;
}

.connectionCard {
  padding: 24px;
}

.cardTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.cardTop h2,
.progressCard h2,
.stepsCard h2 {
  margin: 0;
}

.cardTop p {
  margin: 7px 0 0;
  color: #94a3b8;
}

.mainStatus {
  height: 38px;
  border-radius: 999px;
  padding: 0 13px;
  background: rgba(249,115,22,.14);
  color: #fdba74;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 1000;
  white-space: nowrap;
}

.mainStatus.ready {
  background: rgba(34,197,94,.15);
  color: #86efac;
}

.mainStatus span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 12px currentColor;
  animation: livePulse 1.2s infinite;
}

.formGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}

.field.full {
  grid-column: 1 / -1;
}

.field label {
  display: block;
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 1000;
  margin-bottom: 8px;
}

.field input {
  width: 100%;
  height: 52px;
  border: 1px solid rgba(148,163,184,.13);
  border-radius: 17px;
  background: rgba(255,255,255,.06);
  color: white;
  outline: none;
  padding: 0 15px;
  font-weight: 800;
  transition: .2s;
}

.field input:focus {
  border-color: rgba(34,211,238,.55);
  box-shadow: 0 0 0 4px rgba(6,182,212,.08);
}

.field small {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.45;
}

.secretInput {
  display: flex;
  gap: 9px;
}

.secretInput input {
  flex: 1;
}

.secretInput button {
  width: 88px;
  border: 0;
  border-radius: 17px;
  background: rgba(6,182,212,.14);
  color: #67e8f9;
  cursor: pointer;
  font-weight: 1000;
}

.buttonRow {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 22px;
}

.sideStack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.progressCard,
.stepsCard,
.warningCard {
  padding: 20px;
}

.bigProgress {
  height: 16px;
  background: rgba(255,255,255,.08);
  border-radius: 999px;
  overflow: hidden;
  margin: 18px 0 14px;
}

.bigProgress div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #06b6d4, #a855f7);
  animation: growBar .8s ease both;
}

.progressCard strong {
  font-size: 24px;
}

.progressCard p,
.warningCard p {
  color: #94a3b8;
  line-height: 1.5;
}

.step {
  display: flex;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid rgba(148,163,184,.08);
}

.step:last-child {
  border-bottom: 0;
}

.stepIcon {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: 13px;
  background: rgba(255,255,255,.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 1000;
  color: #94a3b8;
}

.stepIcon.done {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
}

.step strong {
  display: block;
}

.step p {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.warningCard {
  background:
    radial-gradient(circle at 90% 10%, rgba(249,115,22,.18), transparent 36%),
    rgba(15,23,42,.74);
}

.warningCard span {
  color: #fdba74;
  font-weight: 1000;
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 2px;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes rotateGlow {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ringPulse {
  0% {
    transform: scale(.92);
    opacity: .8;
  }

  100% {
    transform: scale(1.18);
    opacity: 0;
  }
}

@keyframes livePulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.45);
    opacity: .55;
  }
}

@keyframes growBar {
  from {
    width: 0;
  }
}

@media (max-width: 1150px) {
  .mainGrid {
    grid-template-columns: 1fr;
  }

  .quickGrid {
    grid-template-columns: 1fr;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .statusOrb {
    align-self: center;
  }
}

@media (max-width: 760px) {
  .hero h1 {
    font-size: 32px;
  }

  .formGrid {
    grid-template-columns: 1fr;
  }

  .field.full {
    grid-column: auto;
  }

  .heroActions,
  .buttonRow {
    flex-direction: column;
    width: 100%;
  }

  .heroActions button,
  .buttonRow button {
    width: 100%;
  }

  .cardTop {
    flex-direction: column;
    align-items: flex-start;
  }

  .secretInput {
    flex-direction: column;
  }

  .secretInput button {
    width: 100%;
    height: 44px;
  }
}
`;