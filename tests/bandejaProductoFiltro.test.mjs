/**
 * Contrato del filtro de producto en la bandeja (consulta, línea y socket).
 * Ejecutar: node tests/bandejaProductoFiltro.test.mjs
 */
import assert from "node:assert/strict";
import {
  listaTrasSocket,
  parametrosConsultaInbox,
  PRODUCTO_TODOS,
  seleccionTrasCambiarLinea,
  socketPuedeInsertarChatNuevo,
} from "../frontend/src/utils/bandejaProductos.js";

const FLUJO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CONN = "11111111-1111-4111-8111-111111111111";
const CONN_B = "22222222-2222-4222-8222-222222222222";

const todos = parametrosConsultaInbox({
  etiquetaFiltro: "",
  conexionWhatsappId: CONN,
  flujoId: PRODUCTO_TODOS,
  limit: 20,
  offset: 0,
});
assert.equal(todos.has("flujo_id"), false);
assert.equal(
  todos.toString(),
  `conexion_whatsapp_id=${CONN}&limit=20&offset=0`
);

const conProducto = parametrosConsultaInbox({
  etiquetaFiltro: "VIP",
  conexionWhatsappId: CONN,
  flujoId: FLUJO,
  limit: 20,
  offset: 40,
});
assert.equal(conProducto.get("flujo_id"), FLUJO);
assert.equal(conProducto.get("etiqueta"), "VIP");
assert.equal(conProducto.get("offset"), "40");

assert.equal(socketPuedeInsertarChatNuevo(""), true);
assert.equal(socketPuedeInsertarChatNuevo("   "), true);
assert.equal(socketPuedeInsertarChatNuevo(FLUJO), false);

const lista = [
  {
    chatKey: `591100::${CONN}`,
    ultimoMensaje: "viejo",
    ultimoMensajeEn: "2026-05-01T00:00:00.000Z",
    noLeidos: 1,
  },
];

const bloqueado = listaTrasSocket(
  lista,
  `591200::${CONN}`,
  "nuevo de otro producto",
  "2026-05-08T00:00:00.000Z",
  FLUJO
);
assert.equal(bloqueado, lista);
assert.equal(bloqueado.length, 1);

const actualizado = listaTrasSocket(
  lista,
  `591100::${CONN}`,
  "sigue en el producto",
  "2026-05-08T00:00:00.000Z",
  FLUJO
);
assert.equal(actualizado.length, 1);
assert.equal(actualizado[0].ultimoMensaje, "sigue en el producto");
assert.equal(actualizado[0].noLeidos, 1);

const insertado = listaTrasSocket(
  lista,
  `591200::${CONN}`,
  "entra en todos",
  "2026-05-08T00:00:00.000Z",
  PRODUCTO_TODOS
);
assert.equal(insertado.length, 2);
assert.equal(insertado[0].chatKey, `591200::${CONN}`);
assert.equal(insertado[1].chatKey, `591100::${CONN}`);

assert.equal(seleccionTrasCambiarLinea(CONN, CONN_B, FLUJO), PRODUCTO_TODOS);
assert.equal(seleccionTrasCambiarLinea(CONN, CONN, FLUJO), FLUJO);

console.log("bandejaProductoFiltro: ok");
