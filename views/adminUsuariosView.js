const { escapeHtml } = require("../routes/authPageLayout");
const { pageTitle } = require("../routes/pageTitles");

function renderAdminUsuariosPage({ adminEmail }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle("Usuarios")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body.mb-admin{
  font-family:"Inter",system-ui,sans-serif;
  background:#060a10;
  color:#e2e8f0;
}
.mb-admin__bg{
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse 50% 40% at 10% 20%, rgba(57,255,20,.08), transparent 55%),
    radial-gradient(ellipse 45% 35% at 90% 80%, rgba(139,92,246,.06), transparent 50%),
    #060a10;
}
.mb-admin__wrap{position:relative;z-index:1;max-width:1400px;margin:0 auto;padding:24px 20px 48px}
.mb-admin__header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:28px}
.mb-admin__title{margin:0;font-size:1.5rem;font-weight:700;letter-spacing:-.02em}
.mb-admin__title span{color:#39ff14}
.mb-admin__sub{margin:6px 0 0;font-size:.875rem;color:#94a3b8}
.mb-admin__badge-admin{
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 12px;border-radius:999px;
  background:rgba(57,255,20,.12);border:1px solid rgba(57,255,20,.35);
  color:#39ff14;font-size:.75rem;font-weight:600;
}
.mb-admin__section-title{margin:0 0 12px;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
.mb-admin__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:18px}
.mb-admin__card{
  padding:14px 16px;border-radius:16px;
  background:rgba(15,23,42,.5);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border:1px solid rgba(148,163,184,.12);
  box-shadow:0 8px 32px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.04);
  transition:border-color .2s,transform .2s;
}
.mb-admin__card:hover{border-color:rgba(57,255,20,.25);transform:translateY(-1px)}
.mb-admin__card-icon{font-size:1.1rem;margin-bottom:6px;line-height:1}
.mb-admin__card-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;font-weight:500}
.mb-admin__card-value{font-size:1.45rem;font-weight:700;margin-top:6px;letter-spacing:-.02em}
.mb-admin__card--activos .mb-admin__card-value{color:#4ade80}
.mb-admin__card--suspendidos .mb-admin__card-value{color:#f87171}
.mb-admin__card--free{border-color:rgba(100,116,139,.25)}
.mb-admin__card--free .mb-admin__card-value{color:#cbd5e1}
.mb-admin__card--macbot{border-color:rgba(34,197,94,.22)}
.mb-admin__card--macbot .mb-admin__card-value{color:#86efac}
.mb-admin__card--agency{border-color:rgba(57,255,20,.22)}
.mb-admin__card--agency .mb-admin__card-value{color:#39ff14}
.mb-admin__card--wa .mb-admin__card-value{color:#38bdf8}
.mb-admin__card--ct .mb-admin__card-value{color:#fbbf24}
.mb-admin__card--fl .mb-admin__card-value{color:#a78bfa}
.mb-admin__card--conv .mb-admin__card-value{color:#34d399}
.mb-admin__dashboard{margin-bottom:28px}
.mb-admin__table-section-title{margin:0 0 14px;font-size:1rem;font-weight:600;color:#f1f5f9}
.mb-admin__toolbar{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;align-items:center}
.mb-admin__search{
  flex:1;min-width:200px;padding:10px 14px;border-radius:10px;
  border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:.9rem;
}
.mb-admin__search:focus{outline:none;border-color:#39ff14;box-shadow:0 0 0 2px rgba(57,255,20,.2)}
.mb-admin__filter{padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#f1f5f9}
.mb-admin__table-wrap{
  overflow-x:auto;border-radius:14px;
  border:1px solid rgba(51,65,85,.7);
  background:rgba(15,23,42,.55);
}
table.mb-admin__table{width:100%;border-collapse:collapse;font-size:.8125rem}
.mb-admin__table th{
  text-align:left;padding:12px 14px;
  background:rgba(30,41,59,.8);color:#94a3b8;font-weight:600;
  border-bottom:1px solid #334155;white-space:nowrap;
}
.mb-admin__table td{padding:12px 14px;border-bottom:1px solid rgba(51,65,85,.4);vertical-align:middle}
.mb-admin__table tr:last-child td{border-bottom:none}
.mb-admin__table tr:hover td{background:rgba(30,41,59,.35)}
.mb-admin__email{font-family:"JetBrains Mono",monospace;font-size:.78rem;color:#cbd5e1}
.mb-plan{
  display:inline-block;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:600;text-transform:uppercase;
}
.mb-plan--free{background:rgba(100,116,139,.25);color:#cbd5e1}
.mb-plan--starter{background:rgba(34,211,238,.15);color:#22d3ee}
.mb-plan--pro{background:rgba(167,139,250,.2);color:#a78bfa}
.mb-plan--macbot{background:rgba(34,197,94,.18);color:#86efac}
.mb-plan--agency{background:rgba(57,255,20,.15);color:#39ff14}
.mb-admin__select,.mb-admin__date{
  padding:6px 8px;border-radius:8px;border:1px solid #475569;
  background:#0f172a;color:#f1f5f9;font-size:.75rem;max-width:120px;
}
.mb-admin__date{max-width:150px}
.mb-admin__lim{font-family:"JetBrains Mono",monospace;font-size:.75rem;color:#94a3b8}
.mb-admin__lim--inf{color:#39ff14}
.mb-admin__btn{
  padding:6px 12px;border-radius:8px;border:none;cursor:pointer;
  font-size:.75rem;font-weight:600;font-family:inherit;
}
.mb-admin__btn--save{background:#39ff14;color:#0a0f14}
.mb-admin__btn--save:hover{filter:brightness(1.08)}
.mb-admin__btn--save:disabled{opacity:.5;cursor:not-allowed}
.mb-admin__btn--ghost{background:rgba(148,163,184,.12);color:#cbd5e1;border:1px solid rgba(148,163,184,.28)}
.mb-admin__btn--ghost:hover{border-color:rgba(57,255,20,.35);color:#f1f5f9}
.mb-admin__btn--block{background:rgba(34,197,94,.16);color:#86efac;border:1px solid rgba(34,197,94,.35);margin:0 6px 8px 0}
.mb-admin__btn--block:hover{filter:brightness(1.08)}
.mb-admin__btn--block:disabled{opacity:.5;cursor:not-allowed}
.mb-admin__contactos-row td{background:rgba(8,15,28,.92)!important;padding:0;border-bottom:1px solid rgba(51,65,85,.7)}
.mb-admin__contactos-panel{padding:16px 18px 20px}
.mb-admin__contactos-title{margin:0 0 10px;font-size:.95rem;font-weight:700;color:#f1f5f9}
.mb-admin__contactos-stats{display:flex;flex-wrap:wrap;gap:16px;margin:0 0 14px;font-size:.85rem;color:#cbd5e1}
.mb-admin__contactos-stats strong{color:#f8fafc}
.mb-admin__contactos-note{margin:0 0 14px;font-size:.75rem;color:#64748b;line-height:1.45}
.mb-admin__contactos-sub{margin:14px 0 8px;font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.mb-admin__hist{width:100%;border-collapse:collapse;font-size:.78rem}
.mb-admin__hist th{text-align:left;padding:8px 10px;color:#94a3b8;border-bottom:1px solid #334155;font-weight:600}
.mb-admin__hist td{padding:8px 10px;border-bottom:1px solid rgba(51,65,85,.35);color:#e2e8f0}
.mb-admin__hist-empty{color:#64748b;font-size:.8rem;padding:8px 0}
.mb-admin__btn--toggle{background:rgba(239,68,68,.2);color:#fca5a5;border:1px solid rgba(239,68,68,.4)}
.mb-admin__btn--toggle.is-active{background:rgba(57,255,20,.15);color:#86efac;border-color:rgba(57,255,20,.35)}
.mb-admin__btn--toggle:disabled{opacity:.35;cursor:not-allowed}
.mb-admin__btn-wrap{display:inline-block;vertical-align:middle}
.mb-admin__btn-wrap[title]{cursor:not-allowed}
.mb-admin__badge-principal{
  display:inline-block;margin-left:8px;padding:3px 10px;border-radius:999px;
  font-size:.65rem;font-weight:700;letter-spacing:.03em;
  background:rgba(57,255,20,.22);color:#39ff14;
  border:1px solid rgba(57,255,20,.55);
  box-shadow:0 0 14px rgba(57,255,20,.28);
  white-space:nowrap;
}
.mb-admin__activo{font-size:.75rem}
.mb-admin__activo--si{color:#4ade80}
.mb-admin__activo--no{color:#f87171}
.mb-admin__toast{
  position:fixed;bottom:24px;right:24px;padding:12px 18px;border-radius:10px;
  background:#1e293b;border:1px solid #39ff14;color:#f1f5f9;font-size:.875rem;
  opacity:0;transform:translateY(8px);transition:.25s;pointer-events:none;z-index:200;
}
.mb-admin__toast.is-visible{opacity:1;transform:none}
.mb-admin__loading{padding:48px;text-align:center;color:#64748b}
.mb-admin__empty{padding:32px;text-align:center;color:#64748b}
.mb-admin__logout{color:#94a3b8;font-size:.8rem;text-decoration:none}
.mb-admin__logout:hover{color:#39ff14}
.mb-admin__logs{
  margin-top:32px;padding:20px;border-radius:16px;
  background:rgba(15,23,42,.45);backdrop-filter:blur(14px);
  border:1px solid rgba(148,163,184,.12);
  box-shadow:0 8px 32px rgba(0,0,0,.22);
}
.mb-admin__logs-title{margin:0 0 14px;font-size:1rem;font-weight:600;color:#f1f5f9}
.mb-admin__logs-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mb-admin__log-item{
  display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 12px;
  padding:10px 12px;border-radius:10px;
  background:rgba(30,41,59,.4);border:1px solid rgba(51,65,85,.35);
  font-size:.8125rem;
}
.mb-admin__log-fecha{font-family:"JetBrains Mono",monospace;font-size:.72rem;color:#64748b;min-width:120px}
.mb-admin__log-resumen{flex:1;min-width:200px;color:#e2e8f0;line-height:1.45}
.mb-admin__log-meta{font-size:.72rem;color:#94a3b8}
.mb-admin__log-badge{
  display:inline-block;padding:2px 8px;border-radius:999px;
  font-size:.65rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;
}
.mb-admin__log-badge--cambio_plan{background:rgba(167,139,250,.2);color:#c4b5fd}
.mb-admin__log-badge--cambio_estado_plan{background:rgba(34,211,238,.15);color:#67e8f9}
.mb-admin__log-badge--activar_usuario{background:rgba(57,255,20,.15);color:#86efac}
.mb-admin__log-badge--suspender_usuario{background:rgba(239,68,68,.2);color:#fca5a5}
.mb-admin__log-badge--acreditar_bloque_contactos{background:rgba(34,197,94,.18);color:#86efac}
.mb-admin__log-badge--cambio_limites_usuario{background:rgba(251,191,36,.18);color:#fcd34d}
.mb-admin__limites-row td{background:rgba(8,15,28,.88)!important;padding:0;border-bottom:1px solid rgba(51,65,85,.7)}
.mb-admin__limites-panel{padding:16px 18px 20px}
.mb-admin__limites-title{margin:0 0 12px;font-size:.95rem;font-weight:700;color:#f1f5f9}
.mb-admin__limites-form{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:flex-end;margin-bottom:12px}
.mb-admin__limites-field{display:flex;flex-direction:column;gap:4px;min-width:120px}
.mb-admin__limites-field label{font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8}
.mb-admin__limites-input{
  padding:8px 10px;border-radius:8px;border:1px solid #475569;
  background:#0f172a;color:#f1f5f9;font-size:.85rem;font-family:"JetBrains Mono",monospace;max-width:140px;
}
.mb-admin__limites-input:focus{outline:none;border-color:#39ff14;box-shadow:0 0 0 2px rgba(57,255,20,.2)}
.mb-admin__limites-hint{margin:0 0 10px;font-size:.75rem;color:#64748b;line-height:1.45}
.mb-admin__limites-ok{margin:8px 0 0;font-size:.78rem;color:#86efac}
.mb-admin__limites-err{margin:8px 0 0;font-size:.78rem;color:#fca5a5}
.mb-admin__logs-empty,.mb-admin__logs-loading{color:#64748b;font-size:.875rem;padding:12px 0}
</style>
</head>
<body class="mb-admin">
<div class="mb-admin__bg" aria-hidden="true"></div>
<div class="mb-admin__wrap">
  <header class="mb-admin__header">
    <div>
      <h1 class="mb-admin__title">MacBot <span>Admin</span></h1>
      <p class="mb-admin__sub">Gestión de usuarios y planes · ${escapeHtml(adminEmail)}</p>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
      <span class="mb-admin__badge-admin">🔒 Panel privado</span>
      <a href="/logout" class="mb-admin__logout">Cerrar sesión</a>
    </div>
  </header>

  <section class="mb-admin__dashboard" id="dashboard" aria-label="Métricas SaaS">
    <h2 class="mb-admin__section-title">Resumen de cuentas</h2>
    <div class="mb-admin__cards">
      <div class="mb-admin__card"><div class="mb-admin__card-icon">👥</div><div class="mb-admin__card-label">Usuarios totales</div><div class="mb-admin__card-value" data-metric="usuarios_total">—</div></div>
      <div class="mb-admin__card mb-admin__card--activos"><div class="mb-admin__card-icon">🟢</div><div class="mb-admin__card-label">Activos</div><div class="mb-admin__card-value" data-metric="usuarios_activos">—</div></div>
      <div class="mb-admin__card mb-admin__card--suspendidos"><div class="mb-admin__card-icon">🔴</div><div class="mb-admin__card-label">Suspendidos</div><div class="mb-admin__card-value" data-metric="usuarios_suspendidos">—</div></div>
      <div class="mb-admin__card mb-admin__card--free"><div class="mb-admin__card-icon">🆓</div><div class="mb-admin__card-label">Free</div><div class="mb-admin__card-value" data-metric="plan_free">—</div></div>
      <div class="mb-admin__card mb-admin__card--macbot"><div class="mb-admin__card-icon">🤖</div><div class="mb-admin__card-label">MacBot</div><div class="mb-admin__card-value" data-metric="plan_macbot">—</div></div>
      <div class="mb-admin__card mb-admin__card--agency"><div class="mb-admin__card-icon">🏢</div><div class="mb-admin__card-label">Agency</div><div class="mb-admin__card-value" data-metric="plan_agency">—</div></div>
    </div>
    <h2 class="mb-admin__section-title">Uso de la plataforma</h2>
    <div class="mb-admin__cards">
      <div class="mb-admin__card mb-admin__card--wa"><div class="mb-admin__card-icon">📱</div><div class="mb-admin__card-label">WhatsApps conectados</div><div class="mb-admin__card-value" data-metric="whatsapp_conectados">—</div></div>
      <div class="mb-admin__card mb-admin__card--ct"><div class="mb-admin__card-icon">👤</div><div class="mb-admin__card-label">Contactos totales</div><div class="mb-admin__card-value" data-metric="contactos_totales">—</div></div>
      <div class="mb-admin__card mb-admin__card--fl"><div class="mb-admin__card-icon">🔄</div><div class="mb-admin__card-label">Flujos totales</div><div class="mb-admin__card-value" data-metric="flujos_totales">—</div></div>
      <div class="mb-admin__card mb-admin__card--conv"><div class="mb-admin__card-icon">💰</div><div class="mb-admin__card-label">Conversiones registradas</div><div class="mb-admin__card-value" data-metric="conversiones_totales">—</div></div>
    </div>
  </section>

  <h2 class="mb-admin__table-section-title">Usuarios</h2>
  <div class="mb-admin__toolbar">
    <input type="search" class="mb-admin__search" id="search" placeholder="Buscar por email…" autocomplete="off">
    <select class="mb-admin__filter" id="filterPlan">
      <option value="">Todos los planes</option>
      <option value="free">Free</option>
      <option value="macbot">MacBot</option>
      <option value="agency">Agency</option>
    </select>
  </div>

  <div class="mb-admin__table-wrap">
    <div class="mb-admin__loading" id="loading">Cargando usuarios…</div>
    <table class="mb-admin__table" id="table" hidden>
      <thead>
        <tr>
          <th>Email</th>
          <th>Nombre</th>
          <th>Plan</th>
          <th>Estado plan</th>
          <th>Activo</th>
          <th>WA</th>
          <th>Contactos</th>
          <th>Flujos</th>
          <th>Vencimiento</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div class="mb-admin__empty" id="empty" hidden>Sin resultados</div>
  </div>

  <section class="mb-admin__logs" id="logsSection" aria-label="Historial reciente">
    <h2 class="mb-admin__logs-title">Historial reciente</h2>
    <div class="mb-admin__logs-loading" id="logsLoading">Cargando historial…</div>
    <ul class="mb-admin__logs-list" id="logsList" hidden></ul>
    <div class="mb-admin__logs-empty" id="logsEmpty" hidden>Sin acciones registradas aún.</div>
  </section>
</div>
<div class="mb-admin__toast" id="toast" role="status"></div>
<script>
(function(){
  const PLANES = ["free","macbot","agency"];
  const ESTADOS = ["activo","trial","vencido","suspendido"];
  let usuarios = [];
  let filtered = [];

  const $loading = document.getElementById("loading");
  const $table = document.getElementById("table");
  const $tbody = document.getElementById("tbody");
  const $empty = document.getElementById("empty");
  const $search = document.getElementById("search");
  const $filterPlan = document.getElementById("filterPlan");
  const $toast = document.getElementById("toast");
  const $logsLoading = document.getElementById("logsLoading");
  const $logsList = document.getElementById("logsList");
  const $logsEmpty = document.getElementById("logsEmpty");

  const PLAN_LABELS = {
    free: "Free",
    macbot: "MacBot",
    agency: "Agency",
  };

  function toast(msg, isErr){
    $toast.textContent = msg;
    $toast.style.borderColor = isErr ? "#ef4444" : "#39ff14";
    $toast.classList.add("is-visible");
    clearTimeout($toast._t);
    $toast._t = setTimeout(() => $toast.classList.remove("is-visible"), 3200);
  }

  function fmtLim(n){
    if (n === -1 || n === null) return '<span class="mb-admin__lim mb-admin__lim--inf">∞</span>';
    return '<span class="mb-admin__lim">' + n + '</span>';
  }

  function fmtDate(iso){
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es", { day:"2-digit", month:"short", year:"numeric" });
    } catch { return "—"; }
  }

  function planBadgeKey(plan){
    const key = String(plan || "").toLowerCase();
    if (key === "starter" || key === "pro" || key === "macbot") return "macbot";
    if (key === "agency") return "agency";
    return "free";
  }

  function planBadge(plan){
    const badgeKey = planBadgeKey(plan);
    return '<span class="mb-plan mb-plan--' + badgeKey + '">' + planLabel(plan) + '</span>';
  }

  function adminDisplayName(email){
    if (!email) return "Admin";
    const local = String(email).split("@")[0];
    return local.charAt(0).toUpperCase() + local.slice(1);
  }

  function planLabel(p){
    const key = String(p || "").toLowerCase();
    if (key === "starter" || key === "pro") return PLAN_LABELS.macbot;
    return PLAN_LABELS[key] || (p ? String(p) : "—");
  }

  function accionLabel(accion){
    const labels = {
      cambio_plan: "Cambio plan",
      cambio_estado_plan: "Estado plan",
      activar_usuario: "Activación",
      suspender_usuario: "Suspensión",
      acreditar_bloque_contactos: "Bloque contactos",
      cambio_limites_usuario: "Límites usuario"
    };
    return labels[accion] || accion;
  }

  function formatLogResumen(log){
    const admin = adminDisplayName(log.admin_email);
    const target = log.usuario_afectado_email || "usuario";
    const d = log.detalle || {};
    switch (log.accion) {
      case "cambio_plan":
        return admin + " cambió " + target + " de " + planLabel(d.plan_anterior) + " a " + planLabel(d.plan_nuevo) + ".";
      case "cambio_estado_plan":
        return admin + " cambió el estado de plan de " + target + " de " + (d.estado_plan_anterior || "—") + " a " + (d.estado_plan_nuevo || "—") + ".";
      case "activar_usuario":
        return admin + " activó la cuenta de " + target + ".";
      case "suspender_usuario":
        return admin + " suspendió la cuenta de " + target + ".";
      case "acreditar_bloque_contactos":
        return admin + " acreditó " + (d.sku === "blk_2000" ? "+2.000" : "+1.000") + " contactos a " + target + ".";
      case "cambio_limites_usuario":
        return admin + " cambió límites de " + target + ": " +
          (d.max_whatsapp_anterior ?? "—") + "/" + (d.max_contactos_anterior ?? "—") + "/" + (d.max_flujos_anterior ?? "—") +
          " → " +
          (d.max_whatsapp_nuevo ?? "—") + "/" + (d.max_contactos_nuevo ?? "—") + "/" + (d.max_flujos_nuevo ?? "—") + ".";
      default:
        return admin + " realizó " + (log.accion || "acción") + " sobre " + target + ".";
    }
  }

  function formatLogFecha(iso){
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("es", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch { return "—"; }
  }

  function renderLogs(logs){
    $logsLoading.hidden = true;
    if (!logs || logs.length === 0) {
      $logsList.hidden = true;
      $logsEmpty.hidden = false;
      return;
    }
    $logsEmpty.hidden = true;
    $logsList.hidden = false;
    $logsList.innerHTML = logs.map(function(log){
      const badgeCls = "mb-admin__log-badge mb-admin__log-badge--" + (log.accion || "").replace(/[^a-z_]/g, "");
      return '<li class="mb-admin__log-item">' +
        '<span class="mb-admin__log-fecha">' + escapeHtml(formatLogFecha(log.creado_en)) + '</span>' +
        '<span class="' + badgeCls + '">' + escapeHtml(accionLabel(log.accion)) + '</span>' +
        '<span class="mb-admin__log-resumen">' + escapeHtml(formatLogResumen(log)) + '</span>' +
        '<span class="mb-admin__log-meta">' + escapeHtml(log.admin_email || "") + '</span>' +
      '</li>';
    }).join("");
  }

  async function reloadLogs(){
    try {
      $logsLoading.hidden = false;
      $logsLoading.textContent = "Cargando historial…";
      $logsList.hidden = true;
      $logsEmpty.hidden = true;
      const res = await fetch("/api/admin/logs?limit=50", { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error " + res.status);
      renderLogs(data.logs || []);
    } catch (e) {
      $logsLoading.textContent = "No se pudo cargar el historial.";
      console.error(e);
    }
  }

  function fmtNum(n){
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString("es");
  }

  function updateResumenCards(resumen){
    if (!resumen) return;
    const map = {
      usuarios_total: resumen.usuarios_total,
      usuarios_activos: resumen.usuarios_activos,
      usuarios_suspendidos: resumen.usuarios_suspendidos,
      plan_free: resumen.planes?.free,
      plan_macbot: resumen.planes?.macbot,
      plan_agency: resumen.planes?.agency,
      whatsapp_conectados: resumen.uso?.whatsapp_conectados,
      contactos_totales: resumen.uso?.contactos_totales,
      flujos_totales: resumen.uso?.flujos_totales,
      conversiones_totales: resumen.uso?.conversiones_totales,
    };
    document.querySelectorAll("[data-metric]").forEach(function(el){
      const key = el.getAttribute("data-metric");
      el.textContent = fmtNum(map[key]);
    });
  }

  function planCoincideFiltro(u, planF) {
    if (!planF) return true;
    const canon = String(u.plan || "").toLowerCase();
    const almacenado = String(u.plan_almacenado || "").toLowerCase();
    if (planF === "macbot") {
      return canon === "macbot" || almacenado === "starter" || almacenado === "pro" || almacenado === "macbot";
    }
    return canon === planF || almacenado === planF;
  }

  function applyFilters(){
    const q = ($search.value || "").trim().toLowerCase();
    const planF = $filterPlan.value;
    filtered = usuarios.filter(u => {
      if (planF && !planCoincideFiltro(u, planF)) return false;
      if (q && !(u.email || "").toLowerCase().includes(q)) return false;
      return true;
    });
    renderRows();
  }

  function esMacbotEditable(u){
    return String(u.plan || "").toLowerCase() === "macbot";
  }

  function limiteInputValue(n){
    if (n === null || n === undefined || n === -1) return "";
    const x = Number(n);
    return Number.isFinite(x) ? String(x) : "";
  }

  function rowHtml(u){
    const venceVal = u.fecha_vencimiento ? u.fecha_vencimiento.slice(0, 16) : "";
    const planOpts = PLANES.map(p => '<option value="'+p+'"'+(p===u.plan?' selected':'')+'>'+(PLAN_LABELS[p]||p)+'</option>').join("");
    const estOpts = ESTADOS.map(e => '<option value="'+e+'"'+(e===u.estado_plan?' selected':'')+'>'+e+'</option>').join("");
    const activoCls = u.activo ? "mb-admin__activo--si" : "mb-admin__activo--no";
    const activoTxt = u.activo ? "Sí" : "No";
    const toggleLabel = u.activo ? "Suspender" : "Activar";
    const toggleCls = u.activo ? "" : " is-active";
    const protegido = Boolean(u.admin_protegido);
    const suspendBloqueado = protegido && u.activo;
    const toggleDisabled = suspendBloqueado ? " disabled" : "";
    const toggleBtn =
      '<button type="button" class="mb-admin__btn mb-admin__btn--toggle'+toggleCls+'" data-action="toggle"'+toggleDisabled+'>'+toggleLabel+'</button>';
    const toggleHtml = suspendBloqueado
      ? '<span class="mb-admin__btn-wrap" title="Cuenta administradora protegida">'+toggleBtn+'</span>'
      : toggleBtn;
    const badgePrincipal = protegido
      ? ' <span class="mb-admin__badge-principal">🛡️ ADMIN PRINCIPAL</span>'
      : "";
    const limitesBtn = esMacbotEditable(u)
      ? ' <button type="button" class="mb-admin__btn mb-admin__btn--ghost" data-action="limites">Límites</button>'
      : "";
    const limitesRow = esMacbotEditable(u)
      ? '<tr class="mb-admin__limites-row" data-limites-for="'+escapeHtml(String(u.id))+'" hidden>' +
          '<td colspan="10"><div class="mb-admin__limites-panel" data-limites-panel>Cargando…</div></td>' +
        '</tr>'
      : "";
    return '<tr data-id="'+escapeHtml(String(u.id))+'"'+(protegido?' data-protegido="1"':'')+'>' +
      '<td class="mb-admin__email">'+escapeHtml(u.email)+badgePrincipal+'</td>' +
      '<td>'+escapeHtml(u.nombre)+'</td>' +
      '<td>'+planBadge(u.plan)+' <select class="mb-admin__select" data-field="plan">'+planOpts+'</select></td>' +
      '<td><select class="mb-admin__select" data-field="estado_plan">'+estOpts+'</select></td>' +
      '<td class="mb-admin__activo '+activoCls+'" data-activo-cell>'+activoTxt+'</td>' +
      '<td data-wa>'+fmtLim(u.max_whatsapp)+'</td>' +
      '<td data-ct>'+fmtLim(u.max_contactos)+'</td>' +
      '<td data-fl>'+fmtLim(u.max_flujos)+'</td>' +
      '<td><input type="datetime-local" class="mb-admin__date" data-field="fecha_vencimiento" value="'+venceVal+'"></td>' +
      '<td style="white-space:nowrap">' +
        '<button type="button" class="mb-admin__btn mb-admin__btn--save" data-action="save">Guardar</button> ' +
        toggleHtml +
        ' <button type="button" class="mb-admin__btn mb-admin__btn--ghost" data-action="contactos">Contactos</button>' +
        limitesBtn +
      '</td></tr>' +
      '<tr class="mb-admin__contactos-row" data-contactos-for="'+escapeHtml(String(u.id))+'" hidden>' +
        '<td colspan="10"><div class="mb-admin__contactos-panel" data-contactos-panel>Cargando…</div></td>' +
      '</tr>' +
      limitesRow;
  }

  function escapeHtml(s){
    return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function renderRows(){
    $tbody.innerHTML = filtered.map(rowHtml).join("");
    $loading.hidden = true;
    $table.hidden = filtered.length === 0;
    $empty.hidden = filtered.length > 0;
    bindRowActions();
  }

  function sameId(a, b){
    return String(a ?? "").trim() === String(b ?? "").trim();
  }

  function patchUsuario(id, data){
    const uid = String(id ?? "").trim();
    return fetch("/api/admin/usuarios/" + encodeURIComponent(uid) + "/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        plan: data.plan,
        estado_plan: data.estado_plan,
        fecha_vencimiento: data.fecha_vencimiento
      })
    }).then(async function(r){
      const body = await r.json();
      return { status: r.status, body };
    });
  }

  function patchEstado(id, activo){
    return fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ activo })
    }).then(r => r.json().then(j => ({ status: r.status, body: j })));
  }

  function patchEstado(id, activo){
    return fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/estado", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ activo })
    }).then(r => r.json().then(j => ({ status: r.status, body: j })));
  }

  function patchLimites(id, limites){
    return fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/limites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(limites)
    }).then(async function(r){
      const body = await r.json();
      return { status: r.status, body };
    });
  }

  function parseLimiteInput(raw, label){
    const s = String(raw ?? "").trim();
    if (!s) return { error: label + " es obligatorio" };
    if (!/^\\d+$/.test(s)) return { error: label + " debe ser un entero >= 0" };
    return { value: parseInt(s, 10) };
  }

  function findContactosRow(id){
    return $tbody.querySelector('tr.mb-admin__contactos-row[data-contactos-for="'+String(id).trim()+'"]');
  }

  function findLimitesRow(id){
    return $tbody.querySelector('tr.mb-admin__limites-row[data-limites-for="'+String(id).trim()+'"]');
  }

  function renderLimitesPanel(panel, u, bloquesData){
    const bloques = bloquesData && Number.isFinite(Number(bloquesData.capacidad_comprada))
      ? Number(bloquesData.capacidad_comprada)
      : 0;
    const base = Number(u.max_contactos);
    const baseOk = Number.isFinite(base) && base >= 0;
    let hint = '<p class="mb-admin__limites-hint">Edita la capacidad base de contactos. Los bloques pagados son independientes y se suman en runtime.</p>';
    if (baseOk && bloques > 0) {
      hint +=
        '<p class="mb-admin__limites-hint">Contactos base: <strong>' + fmtNum(base) + '</strong> · ' +
        'Bloques pagados: <strong>+' + fmtNum(bloques) + '</strong> · ' +
        'Capacidad efectiva: <strong>' + fmtNum(base + bloques) + '</strong></p>';
    }

    panel.innerHTML =
      '<h3 class="mb-admin__limites-title">Límites personalizados</h3>' +
      hint +
      '<form class="mb-admin__limites-form" data-limites-form novalidate>' +
        '<div class="mb-admin__limites-field">' +
          '<label for="lim-wa-'+escapeHtml(String(u.id))+'">APIs WhatsApp</label>' +
          '<input type="number" min="0" step="1" class="mb-admin__limites-input" id="lim-wa-'+escapeHtml(String(u.id))+'" data-limite="max_whatsapp" value="'+escapeHtml(limiteInputValue(u.max_whatsapp))+'">' +
        '</div>' +
        '<div class="mb-admin__limites-field">' +
          '<label for="lim-ct-'+escapeHtml(String(u.id))+'">Contactos base</label>' +
          '<input type="number" min="0" step="1" class="mb-admin__limites-input" id="lim-ct-'+escapeHtml(String(u.id))+'" data-limite="max_contactos" value="'+escapeHtml(limiteInputValue(u.max_contactos))+'">' +
        '</div>' +
        '<div class="mb-admin__limites-field">' +
          '<label for="lim-fl-'+escapeHtml(String(u.id))+'">Flujos</label>' +
          '<input type="number" min="0" step="1" class="mb-admin__limites-input" id="lim-fl-'+escapeHtml(String(u.id))+'" data-limite="max_flujos" value="'+escapeHtml(limiteInputValue(u.max_flujos))+'">' +
        '</div>' +
        '<button type="submit" class="mb-admin__btn mb-admin__btn--save">Guardar límites</button>' +
      '</form>' +
      '<p class="mb-admin__limites-err" data-limites-err hidden></p>' +
      '<p class="mb-admin__limites-ok" data-limites-ok hidden></p>';
  }

  async function loadLimitesPanel(id, panel){
    const u = usuarios.find(function(x){ return sameId(x.id, id); });
    if (!u) throw new Error("Usuario no encontrado");
    panel.innerHTML = "Cargando…";
    let bloquesData = null;
    try {
      const res = await fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/contactos-bloques", {
        credentials: "same-origin"
      });
      const data = await res.json();
      if (res.ok && data.ok) bloquesData = data;
    } catch (e) {
      console.warn("limites panel bloques", e);
    }
    renderLimitesPanel(panel, u, bloquesData);
  }

  function mergeUsuario(updated){
    const i = usuarios.findIndex(u => sameId(u.id, updated.id));
    if (i >= 0) usuarios[i] = updated;
    applyFilters();
  }

  async function reloadUsuarios(){
    const res = await fetch("/api/admin/usuarios", { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Error " + res.status);
    }
    usuarios = data.usuarios || [];
    updateResumenCards(data.resumen);
    applyFilters();
    await reloadLogs();
  }

  function fmtBloqueCantidad(n){
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return "+" + x.toLocaleString("es-BO");
  }

  function fmtPrecioUsd(n){
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return "$" + x;
  }

  function labelEstadoBloque(estado){
    const map = { pendiente: "Pendiente", pagado: "Pagado", anulado: "Anulado", reembolsado: "Reembolsado" };
    return map[estado] || estado || "—";
  }

  function labelOrigenBloque(origen){
    const map = { admin: "Admin", checkout: "Checkout", migracion_legacy: "Migración" };
    return map[origen] || origen || "—";
  }

  function fmtDateBloque(iso){
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-BO", { day:"2-digit", month:"2-digit", year:"numeric" });
    } catch { return "—"; }
  }

  function renderContactosPanel(panel, data){
    const puede = Boolean(data.puede_acreditar);
    const baseIlimitada = data.max_contactos_actual == null || data.max_contactos_actual === -1;
    const capacidadBaseLabel = baseIlimitada ? "∞" : fmtNum(data.max_contactos_actual);
    const capacidadBloquesLabel = fmtNum(data.capacidad_comprada);
    const limiteEfectivoLabel = baseIlimitada
      ? "∞"
      : fmtNum((Number(data.max_contactos_actual) || 0) + (Number(data.capacidad_comprada) || 0));
    const stats =
      '<div class="mb-admin__contactos-stats">' +
        '<span>Capacidad base: <strong>' + capacidadBaseLabel + '</strong></span>' +
        '<span>Capacidad por bloques: <strong>' + capacidadBloquesLabel + '</strong></span>' +
        '<span>Límite efectivo actual: <strong>' + limiteEfectivoLabel + '</strong></span>' +
      '</div>' +
      '<p class="mb-admin__contactos-note">La acreditación registra el bloque y aumenta el límite efectivo. No modifica max_contactos.</p>';

    let acciones = "";
    if (puede) {
      acciones =
        '<h4 class="mb-admin__contactos-sub">Agregar bloque de contactos</h4>' +
        '<button type="button" class="mb-admin__btn mb-admin__btn--block" data-acreditar-sku="blk_1000">+1.000 contactos — $12</button>' +
        '<button type="button" class="mb-admin__btn mb-admin__btn--block" data-acreditar-sku="blk_2000">+2.000 contactos — $20</button>';
    } else if (data.plan === "agency") {
      acciones = '<p class="mb-admin__contactos-note">Agency no usa bloques de contactos.</p>';
    } else {
      acciones = '<p class="mb-admin__contactos-note">El plan Free no puede recibir bloques de contactos.</p>';
    }

    if (data.tabla_disponible === false) {
      acciones += '<p class="mb-admin__contactos-note">La tabla macbot_contactos_bloques aún no está migrada.</p>';
    }

    const bloques = data.bloques || [];
    let hist = '<h4 class="mb-admin__contactos-sub">Historial</h4>';
    if (bloques.length === 0) {
      hist += '<div class="mb-admin__hist-empty">Sin bloques registrados.</div>';
    } else {
      hist += '<table class="mb-admin__hist"><thead><tr><th>Fecha</th><th>Bloque</th><th>Precio</th><th>Estado</th><th>Origen</th></tr></thead><tbody>' +
        bloques.map(function(b){
          return '<tr>' +
            '<td>' + escapeHtml(fmtDateBloque(b.paid_at || b.created_at)) + '</td>' +
            '<td>' + escapeHtml(fmtBloqueCantidad(b.cantidad)) + '</td>' +
            '<td>' + escapeHtml(fmtPrecioUsd(b.precio_usd)) + '</td>' +
            '<td>' + escapeHtml(labelEstadoBloque(b.estado)) + '</td>' +
            '<td>' + escapeHtml(labelOrigenBloque(b.origen)) + '</td>' +
          '</tr>';
        }).join("") +
      '</tbody></table>';
    }

    panel.innerHTML =
      '<h3 class="mb-admin__contactos-title">Contactos</h3>' +
      stats + acciones + hist;
  }

  async function loadContactosPanel(id, panel){
    panel.innerHTML = "Cargando…";
    const res = await fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/contactos-bloques", {
      credentials: "same-origin"
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Error " + res.status);
    renderContactosPanel(panel, data);
  }

  function bindRowActions(){
    $tbody.querySelectorAll("tr[data-id]").forEach(tr => {
      const id = String(tr.getAttribute("data-id") || "").trim();
      const saveBtn = tr.querySelector('[data-action="save"]');
      const toggleBtn = tr.querySelector('[data-action="toggle"]');
      if (!saveBtn || !toggleBtn) return;
      saveBtn.addEventListener("click", async function(){
        const btn = this;
        btn.disabled = true;
        const plan = tr.querySelector('[data-field="plan"]').value;
        const estado_plan = tr.querySelector('[data-field="estado_plan"]').value;
        const rawDate = tr.querySelector('[data-field="fecha_vencimiento"]').value;
        const fecha_vencimiento = rawDate ? new Date(rawDate).toISOString() : null;
        if (!id) {
          toast("ID de usuario inválido", true);
          btn.disabled = false;
          return;
        }
        try {
          const { status, body } = await patchUsuario(id, { plan, estado_plan, fecha_vencimiento });
          if (!body.ok) throw new Error(body.error || "Error " + status);
          await reloadUsuarios();
          toast("Plan actualizado");
        } catch (e) {
          toast(e.message || "Error al guardar", true);
        } finally {
          btn.disabled = false;
        }
      });
      toggleBtn.addEventListener("click", async function(){
        const btn = this;
        if (btn.disabled) return;
        const u = usuarios.find(x => sameId(x.id, id));
        if (!u) return;
        if (u.admin_protegido && u.activo) {
          toast("Cuenta administradora protegida", true);
          return;
        }
        const nuevo = !u.activo;
        if (!nuevo && !confirm("¿Suspender cuenta de " + u.email + "?")) return;
        btn.disabled = true;
        try {
          const { status, body } = await patchEstado(id, nuevo);
          if (!body.ok) {
            if (body.code === "ADMIN_PROTECTED") {
              throw new Error(body.error || "Cuenta administradora protegida");
            }
            throw new Error(body.error || "Error " + status);
          }
          await reloadUsuarios();
          toast(nuevo ? "Cuenta activada" : "Cuenta suspendida");
        } catch (e) {
          toast(e.message || "Error", true);
        } finally {
          btn.disabled = false;
        }
      });
      const contactosBtn = tr.querySelector('[data-action="contactos"]');
      if (contactosBtn) {
        contactosBtn.addEventListener("click", async function(){
          const detail = findContactosRow(id);
          if (!detail) return;
          const opening = detail.hidden;
          detail.hidden = !opening;
          if (!opening) return;
          const panel = detail.querySelector("[data-contactos-panel]");
          if (!panel) return;
          try {
            await loadContactosPanel(id, panel);
          } catch (e) {
            panel.textContent = e.message || "No se pudo cargar contactos";
            toast(e.message || "Error al cargar contactos", true);
          }
        });
      }
      const limitesBtn = tr.querySelector('[data-action="limites"]');
      if (limitesBtn) {
        limitesBtn.addEventListener("click", async function(){
          const detail = findLimitesRow(id);
          if (!detail) return;
          const opening = detail.hidden;
          detail.hidden = !opening;
          if (!opening) return;
          const panel = detail.querySelector("[data-limites-panel]");
          if (!panel) return;
          try {
            await loadLimitesPanel(id, panel);
          } catch (e) {
            panel.textContent = e.message || "No se pudo cargar límites";
            toast(e.message || "Error al cargar límites", true);
          }
        });
      }
    });
  }

  $tbody.addEventListener("submit", async function(e){
    const form = e.target.closest("[data-limites-form]");
    if (!form || !$tbody.contains(form)) return;
    e.preventDefault();
    const detail = form.closest("tr.mb-admin__limites-row");
    const id = detail ? String(detail.getAttribute("data-limites-for") || "").trim() : "";
    if (!id) return;

    const errEl = detail.querySelector("[data-limites-err]");
    const okEl = detail.querySelector("[data-limites-ok]");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    if (okEl) { okEl.hidden = true; okEl.textContent = ""; }

    const wa = parseLimiteInput(form.querySelector('[data-limite="max_whatsapp"]')?.value, "APIs WhatsApp");
    if (wa.error) {
      if (errEl) { errEl.textContent = wa.error; errEl.hidden = false; }
      return;
    }
    const ct = parseLimiteInput(form.querySelector('[data-limite="max_contactos"]')?.value, "Contactos");
    if (ct.error) {
      if (errEl) { errEl.textContent = ct.error; errEl.hidden = false; }
      return;
    }
    const fl = parseLimiteInput(form.querySelector('[data-limite="max_flujos"]')?.value, "Flujos");
    if (fl.error) {
      if (errEl) { errEl.textContent = fl.error; errEl.hidden = false; }
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const { status, body } = await patchLimites(id, {
        max_whatsapp: wa.value,
        max_contactos: ct.value,
        max_flujos: fl.value
      });
      if (!body.ok) throw new Error(body.error || "Error " + status);
      mergeUsuario(body.usuario);
      if (okEl) {
        okEl.textContent = "✓ Límites actualizados correctamente";
        okEl.hidden = false;
      }
      toast("✓ Límites actualizados correctamente");
      await reloadLogs();
    } catch (err) {
      const msg = err.message || "No se pudieron guardar los límites";
      if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
      toast(msg, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  async function load(){
    try {
      $loading.hidden = false;
      $loading.textContent = "Cargando usuarios…";
      await reloadUsuarios();
      $loading.hidden = true;
    } catch (e) {
      $loading.textContent = "Error: " + (e.message || "no se pudo cargar");
      toast(e.message, true);
    }
  }

  $search.addEventListener("input", applyFilters);
  $filterPlan.addEventListener("change", applyFilters);
  $tbody.addEventListener("click", async function(e){
    const btn = e.target.closest("[data-acreditar-sku]");
    if (!btn || !$tbody.contains(btn)) return;
    const sku = btn.getAttribute("data-acreditar-sku");
    const detail = btn.closest("tr.mb-admin__contactos-row");
    const id = detail ? String(detail.getAttribute("data-contactos-for") || "").trim() : "";
    const u = usuarios.find(x => sameId(x.id, id));
    if (!id || !u) return;
    const label = sku === "blk_2000" ? "+2.000 contactos ($20 USD)" : "+1.000 contactos ($12 USD)";
    if (!confirm("¿Acreditar " + label + " a " + u.email + "?\\n\\nSe registrará como pagado. No modifica max_contactos.")) return;
    btn.disabled = true;
    try {
      const res = await fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/contactos-bloques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ sku })
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "Error " + res.status);
      const panel = detail.querySelector("[data-contactos-panel]");
      if (panel) await loadContactosPanel(id, panel);
      toast("Bloque acreditado");
      await reloadLogs();
    } catch (err) {
      toast(err.message || "No se pudo acreditar", true);
    } finally {
      btn.disabled = false;
    }
  });
  load();
})();
</script>
</body>
</html>`;
}

module.exports = { renderAdminUsuariosPage };
