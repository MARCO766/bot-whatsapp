const axios = require("axios");

const TOKEN = process.env.TOKEN;
const PHONE_ID = process.env.PHONE_ID;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function enviarTextoWhatsApp(numero, texto, opciones = {}) {
  try {

    let tokenEnviar = TOKEN;
    let phoneIdEnviar = PHONE_ID;

    if (opciones.usuarioId) {

      const responseConexion = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const conexion = responseConexion.data?.[0];

      if (conexion) {
        tokenEnviar = conexion.token;
        phoneIdEnviar = conexion.phone_id;
      }
    }

    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      {
        messaging_product: "whatsapp",
        to: numero,
        text: {
          body: texto
        }
      },
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json"
        }
      }
    );

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        imagen_url: null
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    console.log("ERROR ENVIANDO WHATSAPP:", error.response?.data || error.message);
  }
}

module.exports = {
  enviarTextoWhatsApp,
  enviarMediaWhatsApp
};

async function enviarMediaWhatsApp(numero, tipo, mediaUrl, caption = "", opciones = {}) {
  try {
    console.log("📤 INTENTANDO ENVIAR MEDIA");
    console.log("TIPO:", tipo);
    console.log("URL:", mediaUrl);
    console.log("NUMERO:", numero);
    console.log("USUARIO:", opciones.usuarioId);

    let tokenEnviar = TOKEN;
    let phoneIdEnviar = PHONE_ID;

    if (opciones.usuarioId) {
      const responseConexion = await axios.get(
        `${SUPABASE_URL}/rest/v1/conexiones_whatsapp?usuario_id=eq.${opciones.usuarioId}&activo=eq.true&select=*`,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const conexion = responseConexion.data?.[0];

      if (conexion) {
        tokenEnviar = conexion.token;
        phoneIdEnviar = conexion.phone_id;
      }
    }

    const payload = {
      messaging_product: "whatsapp",
      to: numero,
      type: tipo
    };

    if (tipo === "image") {
      payload.image = {
        link: mediaUrl,
        caption: caption || ""
      };
    }

    if (tipo === "audio") {
      payload.audio = {
        link: mediaUrl
      };
    }

    if (tipo === "video") {
      payload.video = {
        link: mediaUrl,
        caption: caption || ""
      };
    }

    if (tipo === "document") {
      payload.document = {
        link: mediaUrl,
        caption: caption || "",
        filename: "documento.pdf"
      };
    }

    const respuestaMeta = await axios.post(
      `https://graph.facebook.com/v19.0/${phoneIdEnviar}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${tokenEnviar}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ MEDIA ENVIADA CORRECTAMENTE:");
    console.log(respuestaMeta.data);

    await axios.post(
      `${SUPABASE_URL}/rest/v1/mensajes`,
      {
        cliente_numero: numero,
        usuario_id: opciones.usuarioId || null,
        direccion: "saliente",
        tipo: tipo,
        contenido: caption || mediaUrl,
        imagen_url: mediaUrl
      },
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    console.log("❌ ERROR ENVIANDO MEDIA WHATSAPP:");
    console.log(error.response?.status);
    console.log(JSON.stringify(error.response?.data || error.message, null, 2));
  }
}