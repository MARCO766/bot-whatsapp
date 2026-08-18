import React from "react";

/**
 * Compra manual de bloques: abre WhatsApp con mensaje prellenado.
 * No envía el mensaje. No hay checkout ni cobro en MacBot.
 */
export default function ComprarContactosSection({ contactosBloques, limiteContactos }) {
  const puedeComprar = Boolean(contactosBloques?.puede_comprar);
  const opciones = Array.isArray(contactosBloques?.opciones)
    ? contactosBloques.opciones.filter((op) => op?.whatsapp_url)
    : [];

  if (!puedeComprar || opciones.length === 0) return null;

  const capacidad = Number(contactosBloques.capacidad_comprada);
  const mostrarLedger = Number.isFinite(capacidad) && capacidad > 0;
  const limiteNum = Number(limiteContactos);
  const mostrarCapacidadEfectiva = Number.isFinite(limiteNum) && limiteNum >= 0;

  return (
    <div className="miPlanBuyCard miPlanGlass">
      <h3>Comprar más contactos</h3>
      <p>
        Compra única, acumulable y sin vencimiento. Al pulsar Comprar se abre WhatsApp
        con un mensaje listo; tú lo envías. No hay pago automático.
      </p>
      {mostrarLedger && (
        <p className="miPlanLedgerHint">
          Bloques pagados: +{capacidad.toLocaleString("es-BO")}
          {mostrarCapacidadEfectiva ? (
            <span>
              {" "}
              — ya incluidos en tu capacidad de {limiteNum.toLocaleString("es-BO")} contactos.
            </span>
          ) : (
            <span> — se suman a la capacidad de contactos de tu plan.</span>
          )}
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
