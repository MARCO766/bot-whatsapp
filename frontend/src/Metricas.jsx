import React, { useEffect, useMemo, useState } from "react";

const campaignsData = [
  {
    id: "papercraft",
    nombre: "Papercraft WhatsApp",
    objetivo: "Mensajes",
    estado: "Activa",
    presupuesto: 39,
    gastado: 118,
    leads: 742,
    conversaciones: 514,
    ventas: 91,
    ingresos: 3549,
    ctr: 2.7,
    cpc: 0.34,
    cpm: 11.8,
    costoConversacion: 1.82,
    roas: 3.8,
    cierre: 17.7,
    frecuencia: 1.9,
    respuesta: 42,
  },
  {
    id: "remarketing",
    nombre: "Remarketing 23h",
    objetivo: "Ventas",
    estado: "Activa",
    presupuesto: 19,
    gastado: 64,
    leads: 228,
    conversaciones: 184,
    ventas: 42,
    ingresos: 1638,
    ctr: 4.1,
    cpc: 0.22,
    cpm: 9.4,
    costoConversacion: 1.12,
    roas: 5.2,
    cierre: 22.8,
    frecuencia: 2.4,
    respuesta: 31,
  },
  {
    id: "amigurumis",
    nombre: "Amigurumis México",
    objetivo: "Conversiones",
    estado: "Aprendizaje",
    presupuesto: 55,
    gastado: 182,
    leads: 381,
    conversaciones: 276,
    ventas: 38,
    ingresos: 1482,
    ctr: 1.9,
    cpc: 0.51,
    cpm: 15.2,
    costoConversacion: 2.18,
    roas: 2.6,
    cierre: 13.7,
    frecuencia: 2.8,
    respuesta: 58,
  },
];

export default function Metricas() {
  const [campaignId, setCampaignId] = useState("papercraft");
  const [livePulse, setLivePulse] = useState(false);
  const [periodo, setPeriodo] = useState("Hoy");

  useEffect(() => {
    const timer = setInterval(() => {
      setLivePulse((p) => !p);
    }, 1600);

    return () => clearInterval(timer);
  }, []);

  const campaign = useMemo(() => {
    return campaignsData.find((c) => c.id === campaignId) || campaignsData[0];
  }, [campaignId]);

  const score = useMemo(() => {
    let puntos = 0;

    if (campaign.ctr >= 2) puntos += 25;
    if (campaign.roas >= 3) puntos += 30;
    if (campaign.costoConversacion <= 2) puntos += 25;
    if (campaign.cierre >= 15) puntos += 20;

    return puntos;
  }, [campaign]);

  const estadoTexto =
    score >= 80 ? "Excelente" : score >= 60 ? "Buena" : score >= 40 ? "Regular" : "Revisar";

  const mainCards = [
    {
      titulo: "Leads",
      valor: campaign.leads,
      detalle: "Personas que dejaron señal",
      icono: "⚡",
      color: "green",
      cambio: "+18%",
    },
    {
      titulo: "Conversaciones",
      valor: campaign.conversaciones,
      detalle: "Chats generados por anuncios",
      icono: "💬",
      color: "cyan",
      cambio: "+9%",
    },
    {
      titulo: "Ventas",
      valor: campaign.ventas,
      detalle: "Compras atribuidas",
      icono: "💎",
      color: "purple",
      cambio: "+21%",
    },
    {
      titulo: "Ingresos",
      valor: `Bs ${campaign.ingresos}`,
      detalle: "Dinero generado",
      icono: "🚀",
      color: "orange",
      cambio: "+34%",
    },
  ];

  const performanceCards = [
    {
      titulo: "ROAS",
      valor: campaign.roas,
      ayuda: "Por cada Bs 1 invertido",
      estado: campaign.roas >= 3 ? "Rentable" : "Bajo",
      color: campaign.roas >= 3 ? "good" : "warning",
    },
    {
      titulo: "CTR",
      valor: `${campaign.ctr}%`,
      ayuda: "Qué tanto llama la atención",
      estado: campaign.ctr >= 2 ? "Bueno" : "Mejorar creativo",
      color: campaign.ctr >= 2 ? "good" : "warning",
    },
    {
      titulo: "Costo conversación",
      valor: `Bs ${campaign.costoConversacion}`,
      ayuda: "Costo por chat iniciado",
      estado: campaign.costoConversacion <= 2 ? "Barato" : "Caro",
      color: campaign.costoConversacion <= 2 ? "good" : "danger",
    },
    {
      titulo: "Tasa de cierre",
      valor: `${campaign.cierre}%`,
      ayuda: "Ventas / conversaciones",
      estado: campaign.cierre >= 15 ? "Fuerte" : "Débil",
      color: campaign.cierre >= 15 ? "good" : "warning",
    },
  ];

  const funnel = [
    { nombre: "Impresiones", valor: 100, cantidad: "24.800", color: "blue" },
    { nombre: "Clicks", valor: 72, cantidad: "1.920", color: "cyan" },
    { nombre: "Conversaciones", valor: 46, cantidad: campaign.conversaciones, color: "green" },
    { nombre: "Ventas", valor: 18, cantidad: campaign.ventas, color: "purple" },
  ];

  const diagnostico = [
    campaign.ctr >= 2
      ? "El anuncio llama la atención correctamente."
      : "El CTR está bajo: prueba otro gancho, imagen o video.",
    campaign.costoConversacion <= 2
      ? "El costo por conversación está saludable."
      : "El costo por conversación está alto: revisa segmentación o creativo.",
    campaign.roas >= 3
      ? "La campaña está recuperando inversión con margen."
      : "El ROAS aún necesita mejorar antes de escalar.",
    campaign.cierre >= 15
      ? "El equipo o bot está cerrando bien por WhatsApp."
      : "La tasa de cierre puede mejorar con mejores seguimientos.",
  ];

  return (
    <div className="metricasMeta">
      <style>{styles}</style>

      <section className="hero">
        <div>
          <span className="eyebrow">Meta Ads Intelligence</span>
          <h1>Métricas claras para saber si la campaña va bien</h1>
          <p>
            Selecciona una campaña y mira lo más importante: leads, conversaciones,
            ventas, ingresos, ROAS, CTR, costo por conversación y cierre.
          </p>
        </div>

        <div className="heroScore">
          <div className={`scoreRing ${livePulse ? "pulse" : ""}`}>
            <strong>{score}</strong>
            <span>/100</span>
          </div>
          <b>{estadoTexto}</b>
          <small>Salud de campaña</small>
        </div>
      </section>

      <section className="controlBar">
        <div className="selectorBox">
          <label>Campaña</label>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaignsData.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="periodos">
          {["Hoy", "7 días", "30 días"].map((p) => (
            <button
              key={p}
              className={periodo === p ? "active" : ""}
              onClick={() => setPeriodo(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="campaignStatus">
          <span className={campaign.estado.toLowerCase()} />
          <div>
            <strong>{campaign.estado}</strong>
            <small>{campaign.objetivo}</small>
          </div>
        </div>
      </section>

      <section className="mainGrid">
        {mainCards.map((card, i) => (
          <div
            className={`mainCard ${card.color}`}
            key={card.titulo}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="shine" />
            <div className="cardTop">
              <div className="icon">{card.icono}</div>
              <span>{card.cambio}</span>
            </div>
            <h2>{card.valor}</h2>
            <strong>{card.titulo}</strong>
            <p>{card.detalle}</p>
          </div>
        ))}
      </section>

      <section className="bodyGrid">
        <div className="leftColumn">
          <div className="panelCard">
            <div className="panelTop">
              <div>
                <h2>Indicadores clave</h2>
                <p>Lo que el cliente debe entender rápido.</p>
              </div>
              <button>Actualizar</button>
            </div>

            <div className="performanceGrid">
              {performanceCards.map((item) => (
                <div className="performanceCard" key={item.titulo}>
                  <div>
                    <span>{item.titulo}</span>
                    <h3>{item.valor}</h3>
                    <p>{item.ayuda}</p>
                  </div>

                  <b className={item.color}>{item.estado}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="panelCard">
            <div className="panelTop">
              <div>
                <h2>Embudo de campaña</h2>
                <p>De impresión a venta.</p>
              </div>
            </div>

            <div className="funnel">
              {funnel.map((f) => (
                <div className="funnelRow" key={f.nombre}>
                  <div className="funnelName">
                    <strong>{f.nombre}</strong>
                    <span>{f.cantidad}</span>
                  </div>

                  <div className="funnelBar">
                    <div className={f.color} style={{ width: `${f.valor}%` }} />
                  </div>

                  <b>{f.valor}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rightColumn">
          <div className="panelCard moneyCard">
            <span className="eyebrow">Inversión</span>
            <h2>Bs {campaign.gastado}</h2>
            <p>Gastado de un presupuesto de Bs {campaign.presupuesto} diario.</p>

            <div className="budgetBar">
              <div style={{ width: `${Math.min(100, (campaign.gastado / 220) * 100)}%` }} />
            </div>

            <div className="moneyList">
              <div>
                <span>CPC</span>
                <strong>Bs {campaign.cpc}</strong>
              </div>
              <div>
                <span>CPM</span>
                <strong>Bs {campaign.cpm}</strong>
              </div>
              <div>
                <span>Frecuencia</span>
                <strong>{campaign.frecuencia}</strong>
              </div>
            </div>
          </div>

          <div className="panelCard">
            <h2>Diagnóstico rápido</h2>

            <div className="diagnostico">
              {diagnostico.map((d, i) => (
                <div className="diagItem" key={i}>
                  <span>✓</span>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="panelCard recommendation">
            <span className="eyebrow">Recomendación</span>
            <h2>{score >= 80 ? "Puedes escalar con cuidado" : "Optimiza antes de escalar"}</h2>
            <p>
              {score >= 80
                ? "Duplica presupuesto gradualmente o crea una copia con nuevas creatividades."
                : "Primero mejora creativo, respuesta por WhatsApp y seguimiento antes de subir presupuesto."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles = `
.metricasMeta {
  min-height: 100%;
  color: #e5e7eb;
}

.hero {
  min-height: 230px;
  border-radius: 34px;
  padding: 30px;
  margin-bottom: 18px;
  background:
    radial-gradient(circle at 88% 18%, rgba(34,211,238,.28), transparent 28%),
    radial-gradient(circle at 15% 90%, rgba(168,85,247,.18), transparent 30%),
    linear-gradient(135deg, rgba(15,23,42,.86), rgba(6,182,212,.16));
  border: 1px solid rgba(148,163,184,.16);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  overflow: hidden;
  position: relative;
  animation: fadeUp .35s ease both;
}

.hero::after {
  content: "";
  width: 360px;
  height: 360px;
  border-radius: 50%;
  position: absolute;
  right: -130px;
  bottom: -170px;
  background: conic-gradient(from 180deg, #22c55e, #06b6d4, #a855f7, #f97316, #22c55e);
  filter: blur(45px);
  opacity: .16;
  animation: rotateGlow 9s linear infinite;
}

.eyebrow {
  color: #67e8f9;
  font-size: 12px;
  font-weight: 1000;
  letter-spacing: 2.4px;
  text-transform: uppercase;
}

.hero h1 {
  margin: 12px 0 12px;
  font-size: 42px;
  line-height: 1.02;
  letter-spacing: -1.2px;
  max-width: 850px;
}

.hero p {
  margin: 0;
  color: #b6c4d8;
  max-width: 760px;
  line-height: 1.55;
}

.heroScore {
  width: 180px;
  min-width: 180px;
  height: 180px;
  border-radius: 34px;
  background: rgba(255,255,255,.065);
  border: 1px solid rgba(255,255,255,.13);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  z-index: 2;
}

.scoreRing {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 3px solid rgba(34,211,238,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 35px rgba(34,211,238,.12);
}

.scoreRing.pulse {
  animation: pulse .9s ease;
}

.scoreRing strong {
  font-size: 34px;
}

.scoreRing span {
  color: #94a3b8;
  font-size: 13px;
}

.heroScore b {
  color: #86efac;
  font-size: 18px;
}

.heroScore small {
  color: #94a3b8;
}

.controlBar {
  border-radius: 26px;
  padding: 16px;
  margin-bottom: 18px;
  background: rgba(15,23,42,.72);
  border: 1px solid rgba(148,163,184,.14);
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 14px;
  align-items: center;
  animation: fadeUp .35s ease both;
}

.selectorBox label {
  display: block;
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 7px;
  font-weight: 900;
}

.selectorBox select {
  width: 100%;
  height: 48px;
  border: 1px solid rgba(148,163,184,.14);
  border-radius: 17px;
  background: rgba(255,255,255,.07);
  color: white;
  padding: 0 14px;
  outline: none;
  font-weight: 900;
}

.periodos {
  display: flex;
  gap: 8px;
}

.periodos button {
  height: 42px;
  border: 0;
  border-radius: 14px;
  padding: 0 14px;
  color: white;
  background: rgba(255,255,255,.08);
  cursor: pointer;
  font-weight: 900;
}

.periodos button.active {
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
}

.campaignStatus {
  height: 52px;
  border-radius: 18px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255,255,255,.06);
}

.campaignStatus span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #f97316;
  box-shadow: 0 0 13px #f97316;
}

.campaignStatus span.activa {
  background: #22c55e;
  box-shadow: 0 0 13px #22c55e;
}

.campaignStatus strong {
  display: block;
}

.campaignStatus small {
  color: #94a3b8;
}

.mainGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 18px;
}

.mainCard {
  min-height: 170px;
  border-radius: 28px;
  padding: 20px;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(148,163,184,.14);
  background: rgba(15,23,42,.72);
  animation: fadeUp .35s ease both;
  transition: .2s;
}

.mainCard:hover {
  transform: translateY(-4px);
}

.mainCard.green { background: linear-gradient(135deg, rgba(34,197,94,.24), rgba(15,23,42,.78)); }
.mainCard.cyan { background: linear-gradient(135deg, rgba(6,182,212,.24), rgba(15,23,42,.78)); }
.mainCard.purple { background: linear-gradient(135deg, rgba(168,85,247,.24), rgba(15,23,42,.78)); }
.mainCard.orange { background: linear-gradient(135deg, rgba(249,115,22,.24), rgba(15,23,42,.78)); }

.shine {
  position: absolute;
  inset: -80px;
  background: linear-gradient(120deg, transparent 35%, rgba(255,255,255,.12), transparent 65%);
  transform: translateX(-70%);
  animation: shine 5s infinite;
}

.cardTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.icon {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  background: rgba(255,255,255,.09);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 21px;
}

.cardTop span {
  color: #86efac;
  background: rgba(34,197,94,.14);
  padding: 6px 9px;
  border-radius: 999px;
  font-weight: 1000;
  font-size: 12px;
}

.mainCard h2 {
  margin: 20px 0 8px;
  font-size: 34px;
}

.mainCard strong {
  display: block;
}

.mainCard p {
  margin: 6px 0 0;
  color: #94a3b8;
}

.bodyGrid {
  display: grid;
  grid-template-columns: 1.25fr .75fr;
  gap: 18px;
}

.leftColumn,
.rightColumn {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panelCard {
  border-radius: 28px;
  padding: 20px;
  background: rgba(15,23,42,.72);
  border: 1px solid rgba(148,163,184,.14);
  box-shadow: 0 22px 70px rgba(0,0,0,.16);
  animation: fadeUp .35s ease both;
}

.panelTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.panelTop h2,
.panelCard h2 {
  margin: 0;
}

.panelTop p {
  margin: 6px 0 0;
  color: #94a3b8;
}

.panelTop button {
  height: 42px;
  border: 0;
  border-radius: 14px;
  padding: 0 14px;
  background: rgba(255,255,255,.08);
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.performanceGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.performanceCard {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255,255,255,.045);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.performanceCard span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 900;
}

.performanceCard h3 {
  margin: 8px 0 4px;
  font-size: 28px;
}

.performanceCard p {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.performanceCard b {
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  font-size: 12px;
}

.good {
  background: rgba(34,197,94,.15);
  color: #86efac;
}

.warning {
  background: rgba(249,115,22,.16);
  color: #fdba74;
}

.danger {
  background: rgba(239,68,68,.16);
  color: #fca5a5;
}

.funnel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.funnelRow {
  display: grid;
  grid-template-columns: 170px 1fr 48px;
  gap: 14px;
  align-items: center;
}

.funnelName strong {
  display: block;
}

.funnelName span {
  color: #94a3b8;
  font-size: 13px;
}

.funnelBar {
  height: 14px;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
  overflow: hidden;
}

.funnelBar div {
  height: 100%;
  border-radius: inherit;
  animation: growBar .8s ease both;
}

.funnelBar .blue { background: linear-gradient(90deg, #3b82f6, #06b6d4); }
.funnelBar .cyan { background: linear-gradient(90deg, #06b6d4, #22c55e); }
.funnelBar .green { background: linear-gradient(90deg, #22c55e, #84cc16); }
.funnelBar .purple { background: linear-gradient(90deg, #a855f7, #ec4899); }

.moneyCard {
  background:
    radial-gradient(circle at 85% 12%, rgba(34,211,238,.16), transparent 32%),
    rgba(15,23,42,.72);
}

.moneyCard h2 {
  font-size: 38px;
  margin: 10px 0 6px;
}

.moneyCard p {
  color: #94a3b8;
  line-height: 1.5;
}

.budgetBar {
  height: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255,255,255,.08);
  margin: 18px 0;
}

.budgetBar div {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #06b6d4, #a855f7);
  border-radius: inherit;
}

.moneyList {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 11px;
}

.moneyList div {
  padding: 12px;
  border-radius: 16px;
  background: rgba(255,255,255,.045);
}

.moneyList span {
  display: block;
  color: #94a3b8;
  font-size: 12px;
}

.moneyList strong {
  display: block;
  margin-top: 6px;
}

.diagnostico {
  margin-top: 15px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.diagItem {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255,255,255,.045);
}

.diagItem span {
  width: 26px;
  height: 26px;
  min-width: 26px;
  border-radius: 10px;
  background: linear-gradient(135deg, #22c55e, #06b6d4);
  color: #031827;
  font-weight: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.diagItem p {
  margin: 0;
  color: #cbd5e1;
  line-height: 1.45;
}

.recommendation {
  background:
    radial-gradient(circle at 80% 12%, rgba(168,85,247,.18), transparent 32%),
    linear-gradient(135deg, rgba(34,197,94,.1), rgba(15,23,42,.75));
}

.recommendation h2 {
  margin: 12px 0 8px;
  font-size: 26px;
}

.recommendation p {
  color: #b6c4d8;
  line-height: 1.55;
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

@keyframes shine {
  0% {
    transform: translateX(-70%);
  }

  45%,100% {
    transform: translateX(70%);
  }
}

@keyframes rotateGlow {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.06);
  }
}

@keyframes growBar {
  from {
    width: 0;
  }
}

@media (max-width: 1200px) {
  .mainGrid {
    grid-template-columns: repeat(2, 1fr);
  }

  .bodyGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .heroScore {
    width: 100%;
    min-width: 100%;
  }

  .controlBar {
    grid-template-columns: 1fr;
  }

  .periodos {
    flex-wrap: wrap;
  }

  .mainGrid,
  .performanceGrid,
  .moneyList {
    grid-template-columns: 1fr;
  }

  .funnelRow {
    grid-template-columns: 1fr;
  }

  .hero h1 {
    font-size: 32px;
  }
}
`;