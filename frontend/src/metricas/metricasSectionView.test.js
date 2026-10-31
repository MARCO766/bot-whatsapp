import assert from "node:assert/strict";
import test from "node:test";
import { metricasSectionView } from "./metricasSectionView.js";

test("primera apertura sin datos muestra esqueleto de la sección", () => {
  assert.equal(
    metricasSectionView({ hasData: false, pending: true, error: null }),
    "loading"
  );
});

test("la serie no dice sin actividad mientras sigue pendiente", () => {
  assert.notEqual(
    metricasSectionView({ hasData: false, pending: true, error: null }),
    "idle"
  );
});

test("una actualización con datos previos no vuelve al esqueleto", () => {
  assert.equal(
    metricasSectionView({ hasData: true, pending: true, error: null }),
    "updating"
  );
});

test("el resumen listo se publica aunque otra sección siga pendiente", () => {
  assert.equal(
    metricasSectionView({ hasData: true, pending: false, error: null }),
    "ready"
  );
  assert.equal(
    metricasSectionView({ hasData: false, pending: true, error: null }),
    "loading"
  );
});

test("un error opcional sin datos no deja la sección cargando", () => {
  assert.equal(
    metricasSectionView({ hasData: false, pending: false, error: "No se pudo cargar la serie" }),
    "error"
  );
});

test("un error de recarga conserva los datos ya pintados", () => {
  assert.equal(
    metricasSectionView({ hasData: true, pending: false, error: "timeout" }),
    "ready"
  );
});

test("al terminar sin datos ni error no queda un indicador de carga", () => {
  assert.equal(
    metricasSectionView({ hasData: false, pending: false, error: null }),
    "idle"
  );
});
