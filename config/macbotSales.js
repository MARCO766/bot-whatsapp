/**
 * Ventas MacBot — número de WhatsApp y catálogo de bloques de contactos.
 *
 * FASE 2.1: compra manual. No hay checkout ni cobro automático.
 * El número vive SOLO aquí. No copiarlo en componentes.
 *
 * Display: +591 76187797
 * Enlace:  https://wa.me/59176187797  (sin +, espacios ni guiones)
 */
const MACBOT_SALES_WHATSAPP = "59176187797";
const MACBOT_SALES_WHATSAPP_URL = `https://wa.me/${MACBOT_SALES_WHATSAPP}`;

const BLOQUES_CONTACTOS = {
  blk_1000: {
    sku: "blk_1000",
    cantidad: 1000,
    precio_usd: 12,
    label: "+1.000 contactos",
    mensaje:
      "Hola, quiero comprar un bloque de 1.000 contactos por $12 para mi cuenta de MacBot.",
  },
  blk_2000: {
    sku: "blk_2000",
    cantidad: 2000,
    precio_usd: 20,
    label: "+2.000 contactos",
    mensaje:
      "Hola, quiero comprar un bloque de 2.000 contactos por $20 para mi cuenta de MacBot.",
  },
};

const SKUS_BLOQUES = Object.freeze(Object.keys(BLOQUES_CONTACTOS));

function obtenerBloqueCatalogo(skuOrCantidad) {
  if (skuOrCantidad && BLOQUES_CONTACTOS[skuOrCantidad]) {
    return BLOQUES_CONTACTOS[skuOrCantidad];
  }
  const n = Number(skuOrCantidad);
  if (Number.isFinite(n)) {
    return Object.values(BLOQUES_CONTACTOS).find((b) => b.cantidad === n) || null;
  }
  return null;
}

function emailSeguroParaMensaje(email) {
  const value = String(email || "").trim();
  if (!value || value.length > 254) return "";
  if (!value.includes("@") || value.includes(" ")) return "";
  if (/password|token|secret|hash/i.test(value)) return "";
  return value;
}

function buildMensajeCompraBloque(sku, email) {
  const bloque = obtenerBloqueCatalogo(sku);
  if (!bloque) return "";
  const correo = emailSeguroParaMensaje(email);
  if (!correo) return bloque.mensaje;
  return `${bloque.mensaje}\nMi correo: ${correo}`;
}

function buildMacbotSalesWhatsappUrl(text) {
  return `${MACBOT_SALES_WHATSAPP_URL}?text=${encodeURIComponent(String(text || ""))}`;
}

function buildWhatsappCompraBloqueUrl(sku, email) {
  const mensaje = buildMensajeCompraBloque(sku, email);
  if (!mensaje) return null;
  return buildMacbotSalesWhatsappUrl(mensaje);
}

module.exports = {
  MACBOT_SALES_WHATSAPP,
  MACBOT_SALES_WHATSAPP_URL,
  BLOQUES_CONTACTOS,
  SKUS_BLOQUES,
  obtenerBloqueCatalogo,
  emailSeguroParaMensaje,
  buildMensajeCompraBloque,
  buildMacbotSalesWhatsappUrl,
  buildWhatsappCompraBloqueUrl,
};
