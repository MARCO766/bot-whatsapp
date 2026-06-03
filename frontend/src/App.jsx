import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Bandeja from "./pages/Bandeja";
import { useSocket } from "./context/SocketProvider";
import { useSocketEvent } from "./hooks/useSocketEvent";
import { RT } from "./realtime/events";
import Panel from "./Panel";
import Flujos from "./Flujos";
import Campañas from "./Campañas";
import Clientes from "./Clientes";
import Ajustes from "./Ajustes";
import Metricas from "./Metricas";
import Activadores from "./Activadores";
import Etiquetas from "./Etiquetas";

export default function App() {
  const [vista, setVista] = useState(() => localStorage.getItem("macbot_vista") || "panel");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(new Date());
  const [showActivity, setShowActivity] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(null);
  const [activities, setActivities] = useState([]);
  const vistaRef = useRef(vista);
  const { connected } = useSocket() || {};

  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);

  const pushActivity = useCallback((text, dot = "cyan") => {
    setActivities((prev) => [
      { text, time: "Ahora", dot },
      ...prev.slice(0, 11),
    ]);
  }, []);

  useSocketEvent(RT.NUEVO_MENSAJE, (msg) => {
    const entrante = msg?.direccion !== "saliente";
    if (entrante && vistaRef.current !== "inbox") {
      setInboxUnread((n) => (n == null ? 1 : n + 1));
    }
    const quien = msg?.nombre || msg?.cliente_numero || "WhatsApp";
    pushActivity(
      entrante ? `Nuevo mensaje de ${quien}` : `Mensaje enviado a ${quien}`,
      entrante ? "green" : "cyan"
    );
  });

  useSocketEvent(RT.CLIENTE_ACTUALIZADO, (p) => {
    pushActivity(`Cliente actualizado: ${p?.numero || p?.cliente?.numero || "CRM"}`, "purple");
  });

  useSocketEvent(RT.CONVERSION_REGISTRADA, () => {
    pushActivity("Nueva conversión registrada", "orange");
  });

  useSocketEvent(RT.FLUJO_GUARDADO, (p) => {
    pushActivity(`Flujo guardado: ${p?.nombre || p?.id || ""}`.trim(), "purple");
  });

  useSocketEvent(RT.ACTIVADOR_CREADO, () => {
    pushActivity("Activador creado", "yellow");
  });

  useEffect(() => {
    localStorage.setItem("macbot_vista", vista);
  }, [vista]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const menu = [
    { id: "panel", nombre: "Panel", icono: "🏠", badge: null, color: "cyan" },
    {
      id: "inbox",
      nombre: "Bandeja",
      icono: "💬",
      badge:
        inboxUnread == null
          ? null
          : inboxUnread > 99
            ? "99+"
            : String(inboxUnread),
      color: "green",
    },
    { id: "flujos", nombre: "Flujos", icono: "🧩", badge: null, color: "purple" },
    { id: "activadores", nombre: "Activadores", icono: "⚡", badge: null, color: "yellow" },
    { id: "etiquetas", nombre: "Etiquetas", icono: "🏷️", badge: null, color: "green" },
    {
  id: "metricas",
  nombre: "Metricas",
  icono: "📊",
  badge: connected ? "LIVE" : null,
  color: "cyan",
},
    { id: "campañas", nombre: "Campañas", icono: "📣", badge: null, color: "orange" },
    { id: "clientes", nombre: "Clientes", icono: "👥", badge: null, color: "pink" },
    { id: "ajustes", nombre: "Ajustes", icono: "⚙️", badge: null, color: "blue" },
  ];

  const vistaActual = useMemo(() => menu.find((m) => m.id === vista), [vista, connected, inboxUnread]);

  function renderVista() {
    if (vista === "panel") return <Panel cambiarVista={setVista} />;
    if (vista === "inbox")
      return <Bandeja onUnreadChange={setInboxUnread} />;
    if (vista === "flujos") return <Flujos />;
    if (vista === "activadores") return <Activadores />;
    if (vista === "etiquetas") return <Etiquetas />;
    if (vista === "metricas") return <Metricas />;
    if (vista === "campañas") return <Campañas />;
    if (vista === "clientes") return <Clientes cambiarVista={setVista} />;
    if (vista === "ajustes") return <Ajustes cambiarVista={setVista} />;
    return <Panel cambiarVista={setVista} />;
  }

  return (
    <div className="appShell">
      <style>{styles}</style>

      <div className="noise" />
      <div className="orb orbOne" />
      <div className="orb orbTwo" />
      <div className="orb orbThree" />

      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="brand">
          <div className="logoWrap">
            <div className="logoGlow" />
            <div className="logo">M</div>
          </div>

          {sidebarOpen && (
            <div className="brandText">
              <h2>MacBot</h2>
              <p>Vivid CRM</p>
            </div>
          )}
        </div>

        <button className="collapseBtn" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? "←" : "→"}
        </button>

        <nav>
          {menu.map((item) => (
            <button
              key={item.id}
              className={`navBtn ${vista === item.id ? "active" : ""} ${item.color}`}
              onClick={() => setVista(item.id)}
              title={item.nombre}
            >
              <span className="navAura" />
              <span className="navIcon">{item.icono}</span>

              {sidebarOpen && (
                <>
                  <span className="navText">{item.nombre}</span>
                  {item.badge && <span className="badge">{item.badge}</span>}
                </>
              )}
            </button>
          ))}
        </nav>

        {sidebarOpen && (
          <div className="systemCard">
            <div className="systemTop">
              <span className={`liveDot ${connected ? "" : "offline"}`} />
              <strong>{connected ? "Tiempo real" : "Conectando…"}</strong>
              <small>{connected ? "ON" : "…"}</small>
            </div>

            <p>Sincronización en vivo vía Socket.IO entre pestañas del CRM.</p>

            <div className="energy">
              <div />
            </div>

            <div className="miniSystem">
              <span>Socket</span>
              <b>{connected ? "Online" : "…"}</b>
            </div>

            <div className="miniSystem">
              <span>Bandeja</span>
              <b>{inboxUnread != null && inboxUnread > 0 ? `${inboxUnread} nuevos` : "Al día"}</b>
            </div>
          </div>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="titleArea">
            <div className={`pageIcon ${vistaActual?.color || "cyan"}`}>
              {vistaActual?.icono}
            </div>

            <div>
              <h1>{vistaActual?.nombre || "Panel"}</h1>
              <p>Centro de control premium para WhatsApp CRM.</p>
            </div>
          </div>

          <div className="topCenter">
            <div className="searchBox">
              <span>⌕</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contactos, campañas o flujos..."
              />
            </div>
          </div>

          <div className="topActions">
            <div className="clock">
              <strong>
                {now.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
              </strong>
              <span>{now.toLocaleDateString("es-BO", { day: "2-digit", month: "short" })}</span>
            </div>

            <button className="iconBtn" onClick={() => setShowActivity(!showActivity)}>
              🔔
              <span className="notifDot" />
            </button>

            <button className="glowBtn" onClick={() => setVista("campañas")}>
              + Nueva campaña
            </button>
          </div>
        </header>

        {showActivity && (
          <div className="activityPanel">
            <div className="activityHeader">
              <strong>Actividad en vivo</strong>
              <button onClick={() => setShowActivity(false)}>×</button>
            </div>

            {activities.length === 0 ? (
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
                Los eventos en vivo aparecerán aquí (mensajes, clientes, flujos…).
              </p>
            ) : (
              activities.map((item, i) => (
                <div className="activityItem" key={`${item.text}-${i}`}>
                  <span className={`activityDot ${item.dot}`} />
                  <div>
                    <p>{item.text}</p>
                    <small>{item.time}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <section className="page">
          <div className="pageAnimation" key={vista}>
            {renderVista()}
          </div>
        </section>
      </main>
    </div>
  );
}

const styles = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, Arial, sans-serif;
  background: #050816;
  color: #e5e7eb;
  overflow-x: hidden;
}

button,
input {
  font-family: inherit;
}

.appShell {
  min-height: 100vh;
  display: flex;
  position: relative;
  background:
    linear-gradient(rgba(255,255,255,.026) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.026) 1px, transparent 1px),
    radial-gradient(circle at 20% 0%, rgba(34,211,238,.12), transparent 32%),
    radial-gradient(circle at 100% 20%, rgba(168,85,247,.12), transparent 30%),
    #050816;
  background-size: 42px 42px, 42px 42px, auto, auto, auto;
  overflow: hidden;
}

.noise {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: .06;
  background-image:
    radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
    radial-gradient(circle at 75% 75%, white 1px, transparent 1px);
  background-size: 18px 18px;
  z-index: 0;
}

.orb {
  position: fixed;
  border-radius: 999px;
  filter: blur(70px);
  opacity: .34;
  pointer-events: none;
  animation: orbMove 12s ease-in-out infinite;
  z-index: 0;
}

.orbOne {
  width: 320px;
  height: 320px;
  background: #06b6d4;
  top: -100px;
  left: 220px;
}

.orbTwo {
  width: 360px;
  height: 360px;
  background: #a855f7;
  right: -120px;
  bottom: -120px;
  animation-delay: 2s;
}

.orbThree {
  width: 260px;
  height: 260px;
  background: #22c55e;
  bottom: 22%;
  left: 48%;
  opacity: .18;
  animation-delay: 4s;
}

.sidebar {
  height: 100vh;
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  background: rgba(7, 12, 29, .78);
  backdrop-filter: blur(22px);
  border-right: 1px solid rgba(148, 163, 184, .14);
  box-shadow: 24px 0 80px rgba(0,0,0,.28);
  transition: width .28s ease;
}

.sidebar.open {
  width: 280px;
  min-width: 280px;
}

.sidebar.closed {
  width: 88px;
  min-width: 88px;
}

.brand {
  min-height: 62px;
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.logoWrap {
  width: 56px;
  height: 56px;
  min-width: 56px;
  position: relative;
}

.logoGlow {
  position: absolute;
  inset: -6px;
  border-radius: 20px;
  background: linear-gradient(135deg, #22c55e, #06b6d4, #a855f7, #f97316);
  filter: blur(9px);
  opacity: .55;
  animation: logoBreath 2.8s ease-in-out infinite;
}

.logo {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255,255,255,.22), transparent),
    linear-gradient(135deg, #22c55e, #06b6d4, #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 1000;
  color: white;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
}

.brandText h2 {
  margin: 0;
  font-size: 25px;
  letter-spacing: -.8px;
}

.brandText p {
  margin: 4px 0 0;
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #67e8f9;
  font-weight: 1000;
}

.collapseBtn {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(148,163,184,.16);
  border-radius: 15px;
  background: rgba(255,255,255,.06);
  color: #cbd5e1;
  cursor: pointer;
  margin-bottom: 16px;
  transition: .2s;
}

.collapseBtn:hover {
  transform: translateY(-2px);
  background: rgba(34,211,238,.14);
  color: white;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.navBtn {
  height: 56px;
  border: 0;
  border-radius: 20px;
  background: transparent;
  color: #cbd5e1;
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 0 12px;
  cursor: pointer;
  overflow: hidden;
  font-weight: 900;
  transition: .22s ease;
}

.navAura {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: .22s ease;
}

.navBtn.cyan .navAura { background: linear-gradient(135deg, rgba(34,211,238,.24), transparent); }
.navBtn.green .navAura { background: linear-gradient(135deg, rgba(34,197,94,.24), transparent); }
.navBtn.purple .navAura { background: linear-gradient(135deg, rgba(168,85,247,.24), transparent); }
.navBtn.orange .navAura { background: linear-gradient(135deg, rgba(249,115,22,.24), transparent); }
.navBtn.pink .navAura { background: linear-gradient(135deg, rgba(236,72,153,.24), transparent); }
.navBtn.blue .navAura { background: linear-gradient(135deg, rgba(59,130,246,.24), transparent); }
.navBtn.yellow .navAura { background: linear-gradient(135deg, rgba(250,204,21,.24), transparent); }

.navBtn:hover .navAura,
.navBtn.active .navAura {
  opacity: 1;
}

.navBtn:hover,
.navBtn.active {
  color: white;
  transform: translateX(4px);
  box-shadow: 0 18px 38px rgba(0,0,0,.18);
}

.navIcon {
  position: relative;
  z-index: 2;
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: 15px;
  background: rgba(255,255,255,.085);
  display: flex;
  align-items: center;
  justify-content: center;
}

.navText {
  position: relative;
  z-index: 2;
  flex: 1;
  text-align: left;
}

.badge {
  position: relative;
  z-index: 2;
  height: 24px;
  min-width: 25px;
  border-radius: 999px;
  padding: 0 7px;
  background: linear-gradient(135deg, #ff4fd8, #f97316);
  color: white;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 24px rgba(255,79,216,.28);
}

.systemCard {
  margin-top: auto;
  padding: 16px;
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(34,197,94,.14), rgba(6,182,212,.08)),
    rgba(255,255,255,.04);
  border: 1px solid rgba(34,211,238,.2);
}

.systemTop {
  display: flex;
  align-items: center;
  gap: 9px;
}

.systemTop strong {
  flex: 1;
}

.systemTop small {
  color: #86efac;
  font-weight: 1000;
}

.liveDot {
  width: 10px;
  height: 10px;
  background: #22c55e;
  border-radius: 50%;
  box-shadow: 0 0 16px #22c55e;
  animation: livePulse 1.2s infinite;
}

.systemCard p {
  margin: 11px 0 14px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.45;
}

.energy {
  height: 9px;
  border-radius: 99px;
  overflow: hidden;
  background: rgba(255,255,255,.09);
  margin-bottom: 14px;
}

.energy div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #06b6d4, #a855f7);
  animation: energyFlow 2.8s ease-in-out infinite;
}

.miniSystem {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
  font-size: 12px;
  margin-top: 8px;
}

.miniSystem b {
  color: #e5e7eb;
}

.main {
  position: relative;
  z-index: 2;
  flex: 1;
  min-width: 0;
  padding: 18px;
}

.topbar {
  min-height: 86px;
  border-radius: 30px;
  padding: 16px 18px;
  background: rgba(15, 23, 42, .72);
  border: 1px solid rgba(148, 163, 184, .14);
  backdrop-filter: blur(18px);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  margin-bottom: 16px;
  box-shadow: 0 22px 70px rgba(0,0,0,.20);
}

.titleArea {
  display: flex;
  align-items: center;
  gap: 13px;
}

.pageIcon {
  width: 54px;
  height: 54px;
  border-radius: 19px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 23px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22);
  animation: iconFloat 3s ease-in-out infinite;
}

.pageIcon.cyan { background: linear-gradient(135deg, #06b6d4, #3b82f6); }
.pageIcon.green { background: linear-gradient(135deg, #22c55e, #14b8a6); }
.pageIcon.purple { background: linear-gradient(135deg, #8b5cf6, #ec4899); }
.pageIcon.orange { background: linear-gradient(135deg, #f97316, #facc15); }
.pageIcon.pink { background: linear-gradient(135deg, #ec4899, #a855f7); }
.pageIcon.blue { background: linear-gradient(135deg, #3b82f6, #06b6d4); }
.pageIcon.yellow { background: linear-gradient(135deg, #facc15, #f97316); }

.topbar h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -.8px;
  line-height: 1;
}

.topbar p {
  margin: 8px 0 0;
  color: #94a3b8;
  font-size: 13px;
}

.searchBox {
  height: 48px;
  max-width: 520px;
  margin: auto;
  border-radius: 18px;
  background: rgba(255,255,255,.065);
  border: 1px solid rgba(148,163,184,.13);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}

.searchBox span {
  color: #67e8f9;
  font-weight: 1000;
}

.searchBox input {
  width: 100%;
  border: 0;
  background: transparent;
  color: white;
  outline: 0;
  font-weight: 700;
}

.topActions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.clock {
  min-width: 84px;
  height: 48px;
  border-radius: 18px;
  background: rgba(255,255,255,.065);
  border: 1px solid rgba(148,163,184,.13);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.clock strong {
  font-size: 15px;
}

.clock span {
  color: #94a3b8;
  font-size: 11px;
  text-transform: capitalize;
}

.iconBtn {
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 18px;
  background: rgba(255,255,255,.075);
  color: white;
  position: relative;
  cursor: pointer;
  transition: .2s;
}

.iconBtn:hover {
  transform: translateY(-2px);
  background: rgba(34,211,238,.14);
}

.notifDot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #ff4fd8;
  box-shadow: 0 0 12px #ff4fd8;
}

.glowBtn {
  height: 48px;
  border: 0;
  border-radius: 18px;
  padding: 0 18px;
  color: white;
  font-weight: 1000;
  cursor: pointer;
  background: linear-gradient(135deg, #22c55e, #06b6d4, #8b5cf6);
  box-shadow: 0 16px 42px rgba(6,182,212,.22);
  transition: .2s;
}

.glowBtn:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.activityPanel {
  position: fixed;
  right: 22px;
  top: 110px;
  width: 330px;
  border-radius: 24px;
  background: rgba(15,23,42,.92);
  border: 1px solid rgba(148,163,184,.15);
  backdrop-filter: blur(18px);
  z-index: 20;
  padding: 16px;
  box-shadow: 0 26px 90px rgba(0,0,0,.36);
  animation: slidePanel .22s ease both;
}

.activityHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.activityHeader button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  color: white;
  cursor: pointer;
}

.activityItem {
  display: flex;
  gap: 11px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255,255,255,.045);
  margin-bottom: 10px;
}

.activityDot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
}

.activityDot.green { background: #22c55e; box-shadow: 0 0 12px #22c55e; }
.activityDot.cyan { background: #06b6d4; box-shadow: 0 0 12px #06b6d4; }
.activityDot.purple { background: #a855f7; box-shadow: 0 0 12px #a855f7; }
.activityDot.orange { background: #f97316; box-shadow: 0 0 12px #f97316; }

.activityItem p {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
}

.activityItem small {
  color: #94a3b8;
  font-size: 11px;
}

.quickStats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.quickCard {
  border-radius: 24px;
  background: rgba(15, 23, 42, .68);
  border: 1px solid rgba(148,163,184,.13);
  backdrop-filter: blur(16px);
  padding: 15px;
  display: flex;
  align-items: center;
  gap: 13px;
  position: relative;
  overflow: hidden;
  animation: cardRise .35s ease both;
}

.quickCard::after {
  content: "";
  position: absolute;
  width: 140px;
  height: 140px;
  right: -60px;
  top: -60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34,211,238,.16), transparent 62%);
}

.quickIcon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,.075);
  font-size: 20px;
}

.quickCard span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 800;
}

.quickCard h3 {
  margin: 4px 0 0;
  font-size: 22px;
}

.quickCard b {
  margin-left: auto;
  color: #86efac;
  font-size: 12px;
  background: rgba(34,197,94,.13);
  padding: 6px 9px;
  border-radius: 999px;
}

.pageAnimation {
  animation: pageEnter .28s ease both;
}

@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(14px) scale(.995);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cardRise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slidePanel {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes orbMove {
  0%, 100% {
    transform: translate(0,0) scale(1);
  }
  50% {
    transform: translate(24px,-18px) scale(1.04);
  }
}

@keyframes logoBreath {
  0%, 100% {
    opacity: .45;
    transform: scale(1);
  }
  50% {
    opacity: .85;
    transform: scale(1.06);
  }
}

@keyframes livePulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.55);
    opacity: .5;
  }
}

.liveDot.offline {
  background: #64748b;
  box-shadow: none;
  animation: none;
}

@keyframes energyFlow {
  0%, 100% {
    width: 72%;
  }
  50% {
    width: 94%;
  }
}

@keyframes iconFloat {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@media (max-width: 1200px) {
  .topbar {
    grid-template-columns: 1fr;
  }

  .searchBox {
    max-width: 100%;
    margin: 0;
  }

  .topActions {
    justify-content: space-between;
  }
}

@media (max-width: 950px) {
  .appShell {
    flex-direction: column;
  }

  .sidebar,
  .sidebar.open,
  .sidebar.closed {
    width: 100%;
    min-width: 100%;
    height: auto;
    position: relative;
  }

  .collapseBtn {
    display: none;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
  }

  .quickStats {
    grid-template-columns: 1fr;
  }

  .main {
    padding: 14px;
  }
}

@media (max-width: 560px) {
  nav {
    grid-template-columns: 1fr;
  }

  .topActions {
    flex-direction: column;
    align-items: stretch;
  }

  .glowBtn,
  .clock,
  .iconBtn {
    width: 100%;
  }

  .topbar h1 {
    font-size: 25px;
  }

  .activityPanel {
    left: 14px;
    right: 14px;
    width: auto;
  }
}
`;