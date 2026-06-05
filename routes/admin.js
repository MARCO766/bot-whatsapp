const { protegerPanel } = require("../middlewares/auth");
const { esAdminEmail } = require("../middlewares/adminAuth");
const express = require("express");
const router = express.Router();
const { renderAdminPage } = require("../views/adminView");
const { isSeguimientoLegacyEnabled } = require("../config/featureFlags");
const { renderAdminUsuariosPage } = require("../views/adminUsuariosView");
const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

router.get("/admin", protegerPanel, async (req, res) => {
  const esBuilderRequest = req.query.builder && req.query.flujo_id;
  const adminEmail = req.session.usuario.email;

  if (esAdminEmail(adminEmail) && !esBuilderRequest) {
    console.log("[FLOW_BUILDER_REDIRECT_ADMIN]", {
      motivo: "admin_email_panel_usuarios",
      query: req.query,
      email: adminEmail,
    });
    return res.send(
      renderAdminUsuariosPage({
        adminEmail,
      })
    );
  }

  if (esAdminEmail(adminEmail) && esBuilderRequest) {
    console.log("[FLOW_BUILDER_ADMIN_BYPASS]", {
      flujo_id: req.query.flujo_id,
      query: req.query,
      email: adminEmail,
    });
  }

const tab = req.query.tab || "inicio";
const builder = req.query.builder;
const nombreBuilder = req.query.nombre || "";
const flujoId = req.query.flujo_id || "";

let flujosGuardados = [];
let flujoActual = null;
let activadores = [];
let etiquetas = [];
let conexionActiva = null;
try {
  const responseFlujos = await axios.get(
    `${SUPABASE_URL}/rest/v1/flujos_builder?select=id,nombre,creado_en,data,usuario_id&usuario_id=eq.${req.session.usuario.id}&order=creado_en.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  flujosGuardados = responseFlujos.data || [];
} catch(error){
  console.log("ERROR CARGANDO FLUJOS:", error.response?.data || error.message);
}
try {
  const responseActivadores = await axios.get(
    `${SUPABASE_URL}/rest/v1/activadores?select=*&usuario_id=eq.${req.session.usuario.id}&order=creado_en.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  activadores = responseActivadores.data || [];

} catch(error){
  console.log("ERROR CARGANDO ACTIVADORES:", error.response?.data || error.message);
}

try {
  const responseEtiquetas = await axios.get(
    `${SUPABASE_URL}/rest/v1/etiquetas?select=*&usuario_id=eq.${req.session.usuario.id}&order=creado_en.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  etiquetas = responseEtiquetas.data || [];

} catch(error){
  console.log("ERROR CARGANDO ETIQUETAS:", error.response?.data || error.message);
}

try {
  const responseConexionActiva = await axios.get(
    `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${req.session.usuario.id}&activo=eq.true&select=*`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  conexionActiva = responseConexionActiva.data?.[0] || null;

} catch(error){
  console.log("ERROR CARGANDO CONEXION ACTIVA:", error.response?.data || error.message);
}
  if(flujoId){

    flujoActual = flujosGuardados.find(f => f.id === flujoId) || null;
  }


res.send(renderAdminPage({
  tab,
  builder,
  nombreBuilder,
  flujoId,
  flujosGuardados,
  flujoActual,
  activadores,
  etiquetas,
  conexionActiva,
  supabaseUrl: SUPABASE_URL || "",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "",
  seguimientoLegacyEnabled: isSeguimientoLegacyEnabled(),
}));

});

module.exports = router;
