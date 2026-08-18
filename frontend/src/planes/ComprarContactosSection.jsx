import React from "react";

/**
 * Compra manual de bloques: abre WhatsApp con mensaje prellenado.
 * No envía el mensaje. No hay checkout ni cobro en MacBot.
 */
export default function ComprarContactosSection({ contactosBloques }) {
  const puedeComprar = Boolean(contactosBloques?.puede_comprar);
  const opciones = Array.isArray(contactosBloques?.opciones)
    ? contactosBloques.opciones.filter((op) => op?.whatsapp_url)
    : [];

  if (!puedeComprar || opciones.length === 0) return null;

  const capacidad = Number(contactosBloques.capacidad_comprada);
  const mostrarLedger = Number.isFinite(capacidad);

  return (
    <div className="miPlanBuyCard miPlanGlass">
      <h3>Comprar más contactos</h3>
      <p>
        Compra única, acumulable y sin vencimiento. Al pulsar Comprar se abre WhatsApp
        con un mensaje listo; tú lo envías. No hay pago automático.
      </p>
      {mostrarLedger && (
        <p className="miPlanLedgerHint">
          Capacidad registrada por bloques: {capacidad.toLocaleString("es-BO")}
          <span> — informativo; tu límite actual sigue siendo el de Uso de recursos.</span>
        </p>
      )}
      <div className="miPlanBuyGrid">
        {opciones.map((op) => (
          <article className="miPlanBuyOption" key={op.sku}>
            <strong>{op.label}</strong>
            <span className="miPlanBuyPrice">${Number(op.precio_usd)} USD</span>
            <a
              className="miPlanBuyBtn"
              href={op.whatsapp_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Comprar
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}
