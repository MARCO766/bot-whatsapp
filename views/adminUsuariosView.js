const { escapeHtml } = require("../routes/authPageLayout");

function renderAdminUsuariosPage({ adminEmail }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MacBot Admin — Usuarios</title>
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
.mb-admin__stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.mb-admin__stat{
  flex:1;min-width:100px;padding:12px 16px;border-radius:12px;
  background:rgba(15,23,42,.7);border:1px solid rgba(51,65,85,.6);
}
.mb-admin__stat-label{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
.mb-admin__stat-value{font-size:1.25rem;font-weight:700;margin-top:4px}
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
.mb-admin__btn--toggle{background:rgba(239,68,68,.2);color:#fca5a5;border:1px solid rgba(239,68,68,.4)}
.mb-admin__btn--toggle.is-active{background:rgba(57,255,20,.15);color:#86efac;border-color:rgba(57,255,20,.35)}
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

  <div class="mb-admin__stats" id="stats">
    <div class="mb-admin__stat"><div class="mb-admin__stat-label">Total</div><div class="mb-admin__stat-value" data-stat="total">—</div></div>
    <div class="mb-admin__stat"><div class="mb-admin__stat-label">Free</div><div class="mb-admin__stat-value" data-stat="free">—</div></div>
    <div class="mb-admin__stat"><div class="mb-admin__stat-label">Starter</div><div class="mb-admin__stat-value" data-stat="starter">—</div></div>
    <div class="mb-admin__stat"><div class="mb-admin__stat-label">Pro</div><div class="mb-admin__stat-value" data-stat="pro">—</div></div>
    <div class="mb-admin__stat"><div class="mb-admin__stat-label">Agency</div><div class="mb-admin__stat-value" data-stat="agency">—</div></div>
  </div>

  <div class="mb-admin__toolbar">
    <input type="search" class="mb-admin__search" id="search" placeholder="Buscar por email…" autocomplete="off">
    <select class="mb-admin__filter" id="filterPlan">
      <option value="">Todos los planes</option>
      <option value="free">Free</option>
      <option value="starter">Starter</option>
      <option value="pro">Pro</option>
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
</div>
<div class="mb-admin__toast" id="toast" role="status"></div>
<script>
(function(){
  const PLANES = ["free","starter","pro","agency"];
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

  function planBadge(plan){
    return '<span class="mb-plan mb-plan--' + plan + '">' + plan + '</span>';
  }

  function updateStats(list){
    const counts = { total: list.length, free:0, starter:0, pro:0, agency:0 };
    list.forEach(u => { if (counts[u.plan] !== undefined) counts[u.plan]++; });
    document.querySelectorAll("[data-stat]").forEach(el => {
      const k = el.getAttribute("data-stat");
      el.textContent = counts[k] !== undefined ? counts[k] : "—";
    });
  }

  function applyFilters(){
    const q = ($search.value || "").trim().toLowerCase();
    const planF = $filterPlan.value;
    filtered = usuarios.filter(u => {
      if (planF && u.plan !== planF) return false;
      if (q && !(u.email || "").toLowerCase().includes(q)) return false;
      return true;
    });
    updateStats(usuarios);
    renderRows();
  }

  function rowHtml(u){
    const venceVal = u.fecha_vencimiento ? u.fecha_vencimiento.slice(0, 16) : "";
    const planOpts = PLANES.map(p => '<option value="'+p+'"'+(p===u.plan?' selected':'')+'>'+p+'</option>').join("");
    const estOpts = ESTADOS.map(e => '<option value="'+e+'"'+(e===u.estado_plan?' selected':'')+'>'+e+'</option>').join("");
    const activoCls = u.activo ? "mb-admin__activo--si" : "mb-admin__activo--no";
    const activoTxt = u.activo ? "Sí" : "No";
    const toggleLabel = u.activo ? "Suspender" : "Activar";
    const toggleCls = u.activo ? "" : " is-active";
    return '<tr data-id="'+u.id+'">' +
      '<td class="mb-admin__email">'+escapeHtml(u.email)+'</td>' +
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
        '<button type="button" class="mb-admin__btn mb-admin__btn--toggle'+toggleCls+'" data-action="toggle">'+toggleLabel+'</button>' +
      '</td></tr>';
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

  function patchUsuario(id, data){
    return fetch("/api/admin/usuarios/" + encodeURIComponent(id) + "/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(data)
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

  function mergeUsuario(updated){
    const i = usuarios.findIndex(u => u.id === updated.id);
    if (i >= 0) usuarios[i] = updated;
    applyFilters();
  }

  function bindRowActions(){
    $tbody.querySelectorAll("tr").forEach(tr => {
      const id = tr.getAttribute("data-id");
      tr.querySelector('[data-action="save"]').addEventListener("click", async function(){
        const btn = this;
        btn.disabled = true;
        const plan = tr.querySelector('[data-field="plan"]').value;
        const estado_plan = tr.querySelector('[data-field="estado_plan"]').value;
        const rawDate = tr.querySelector('[data-field="fecha_vencimiento"]').value;
        const fecha_vencimiento = rawDate ? new Date(rawDate).toISOString() : null;
        try {
          const { status, body } = await patchUsuario(id, { plan, estado_plan, fecha_vencimiento });
          if (!body.ok) throw new Error(body.error || "Error " + status);
          mergeUsuario(body.usuario);
          toast("Plan actualizado: " + body.usuario.email);
        } catch (e) {
          toast(e.message || "Error al guardar", true);
        } finally {
          btn.disabled = false;
        }
      });
      tr.querySelector('[data-action="toggle"]').addEventListener("click", async function(){
        const btn = this;
        const u = usuarios.find(x => x.id === id);
        if (!u) return;
        const nuevo = !u.activo;
        if (!nuevo && !confirm("¿Suspender cuenta de " + u.email + "?")) return;
        btn.disabled = true;
        try {
          const { status, body } = await patchEstado(id, nuevo);
          if (!body.ok) throw new Error(body.error || "Error " + status);
          mergeUsuario(body.usuario);
          toast(nuevo ? "Cuenta activada" : "Cuenta suspendida");
        } catch (e) {
          toast(e.message || "Error", true);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function load(){
    try {
      const res = await fetch("/api/admin/usuarios", { credentials: "same-origin" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error " + res.status);
      usuarios = data.usuarios || [];
      applyFilters();
    } catch (e) {
      $loading.textContent = "Error: " + (e.message || "no se pudo cargar");
      toast(e.message, true);
    }
  }

  $search.addEventListener("input", applyFilters);
  $filterPlan.addEventListener("change", applyFilters);
  load();
})();
</script>
</body>
</html>`;
}

module.exports = { renderAdminUsuariosPage };
