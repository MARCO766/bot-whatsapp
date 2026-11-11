import assert from "node:assert/strict";
import test from "node:test";
import { CONEXION_TODAS } from "../utils/conexionesInbox.js";
import {
  flujoPermitido,
  flujosDeConexion,
  ingresosAgrupadosPorMoneda,
} from "./filtrosMetricas.js";

const flujos = [
  { id: "f1", nombre: "Papel", conexion_whatsapp_id: "c1" },
  { id: "f2", nombre: "Amigurumi", conexion_whatsapp_id: "c2" },
  { id: "f3", nombre: "Sin línea", conexion_whatsapp_id: null },
];

test("Todas las líneas no ofrece flujos individuales", () => {
  assert.deepEqual(flujosDeConexion(flujos, CONEXION_TODAS), []);
  assert.equal(flujoPermitido(flujos, CONEXION_TODAS, "f1"), "");
});

test("una línea solo muestra sus flujos", () => {
  assert.deepEqual(
    flujosDeConexion(flujos, "c1").map((flujo) => flujo.id),
    ["f1"]
  );
  assert.equal(flujoPermitido(flujos, "c2", "f1"), "");
  assert.equal(flujoPermitido(flujos, "c1", "f1"), "f1");
});

test("un flujo sin conexión no se asigna a una línea", () => {
  assert.equal(flujoPermitido(flujos, "c1", "f3"), "");
  assert.equal(flujosDeConexion(flujos, "c1").some((flujo) => flujo.id === "f3"), false);
});

test("los ingresos de todas las líneas quedan separados por moneda", () => {
  const grupos = ingresosAgrupadosPorMoneda({
    CLP: 4000,
    usd: 12.5,
    ARS: 80,
    BOB: 150.125,
    EUR: 3,
  });

  assert.deepEqual(
    grupos.map((fila) => fila.moneda),
    ["BOB", "USD", "ARS", "CLP", "EUR"]
  );
  assert.equal(grupos.find((fila) => fila.moneda === "BOB").monto, 150.13);
  assert.equal(grupos.find((fila) => fila.moneda === "USD").monto, 12.5);
  const sumaMezclada = grupos.reduce((total, fila) => total + fila.monto, 0);
  assert.notEqual(sumaMezclada, grupos[0].monto);
});

test("una venta sin moneda no se suma dentro de otra moneda", () => {
  const grupos = ingresosAgrupadosPorMoneda({
    "": 20,
    "  ": 5,
    BOB: 10,
    USD: 4,
  });

  assert.deepEqual(
    grupos.map((fila) => [fila.moneda, fila.monto]),
    [
      ["BOB", 10],
      ["USD", 4],
    ]
  );
});

test("la misma moneda solo se agrupa consigo misma", () => {
  const grupos = ingresosAgrupadosPorMoneda({ usd: 1, USD: 2, BOB: 7 });
  assert.deepEqual(grupos, [
    { moneda: "BOB", monto: 7 },
    { moneda: "USD", monto: 3 },
  ]);
});
