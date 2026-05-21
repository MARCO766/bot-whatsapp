const axios = require("axios");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function aplicarEtiquetaCliente(numero, etiqueta, usuarioId) {
  if (!numero || !etiqueta || !usuarioId) return;

  const etiquetaLimpia = String(etiqueta).trim();
  if (!etiquetaLimpia) return;

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  try {
    await axios.delete(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas?cliente_numero=eq.${encodeURIComponent(numero)}&usuario_id=eq.${usuarioId}`,
      { headers }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/clientes_etiquetas`,
      {
        cliente_numero: numero,
        etiqueta: etiquetaLimpia,
        usuario_id: usuarioId,
      },
      { headers }
    );
  } catch (err) {
    console.log(
      "[REMARKETING] Error aplicando etiqueta:",
      err.response?.data || err.message
    );
  }
}

module.exports = {
  aplicarEtiquetaCliente,
};
