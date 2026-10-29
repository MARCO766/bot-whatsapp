/**
 * Chips de producto de la bandeja: visibilidad por línea y normalización de flujos.
 * No llama a la API ni filtra conversaciones.
 * Ejecutar: node tests/bandejaProductosChips.test.mjs
 */
import assert from "node:assert/strict";
import {
  esLineaConcreta,
  normalizarFlujosProducto,
  PRODUCTO_TODOS,
} from "../frontend/src/utils/bandejaProductos.js";

assert.strictEqual(PRODUCTO_TODOS, "");
assert.strictEqual(esLineaConcreta(null), false);
assert.strictEqual(esLineaConcreta(""), false);
assert.strictEqual(esLineaConcreta("  "), false);
assert.strictEqual(esLineaConcreta("__todas__"), false);
assert.strictEqual(esLineaConcreta("linea-1"), true);

const flujos = normalizarFlujosProducto([
  { id: "a", nombre: "VASOS" },
  { id: "a", nombre: "duplicado" },
  { id: "  ", nombre: "sin id" },
  { id: "b", nombre: "  " },
  null,
  { id: "c", nombre: " BUBBLE ARGENTINA " },
]);

assert.deepStrictEqual(flujos, [
  { id: "a", nombre: "VASOS" },
  { id: "b", nombre: "Sin nombre" },
  { id: "c", nombre: "BUBBLE ARGENTINA" },
]);
assert.deepStrictEqual(normalizarFlujosProducto(null), []);
assert.deepStrictEqual(normalizarFlujosProducto({ flows: [] }), []);

console.log("bandejaProductosChips: ok");
