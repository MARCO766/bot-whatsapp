/**
 * Aislamiento: callers que NO deben importar/usar el runtime de timing.
 * Ejecutar: node tests/respuestaTimingIsolation.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertNoTimingRuntime(rel) {
  const src = read(rel);
  assert.ok(
    !src.includes("conexionRespuestaTimingRuntime"),
    `${rel} no debe requerir conexionRespuestaTimingRuntime`
  );
  assert.ok(
    !src.includes("aplicarTimingAntesDeRespuestaAutomatica"),
    `${rel} no debe llamar aplicarTimingAntesDeRespuestaAutomatica`
  );
  assert.ok(
    !src.includes("whatsappTypingIndicatorService"),
    `${rel} no debe requerir whatsappTypingIndicatorService`
  );
  assert.ok(
    !src.includes("aplicarRespuestaTiming"),
    `${rel} no debe pasar aplicarRespuestaTiming`
  );
}

function testWhatsappServiceSinTiming() {
  assertNoTimingRuntime("services/whatsappService.js");
  ok("whatsappService (envío general) sin timing");
}

function testInboxManualSinTiming() {
  // Rutas de respuesta manual típicas
  const flows = read("routes/flows.js");
  assert.ok(!flows.includes("aplicarTimingAntesDeRespuestaAutomatica"));
  assert.ok(!flows.includes("conexionRespuestaTimingRuntime"));
  ok("routes/flows.js (inbox/manual) sin runtime timing");
}

function testSeguimientosSinTiming() {
  assertNoTimingRuntime("services/seguimiento/executeSeguimiento.js");
  const v2 = path.join(ROOT, "services/seguimientoV2/seguimientoV2Sender.js");
  if (fs.existsSync(v2)) {
    const src = fs.readFileSync(v2, "utf8");
    assert.ok(!src.includes("conexionRespuestaTimingRuntime"));
    assert.ok(!src.includes("aplicarTimingAntesDeRespuestaAutomatica"));
  }
  ok("seguimientos programados sin timing");
}

function testRemarketingContenidosSinTiming() {
  const rel = "services/remarketing24h/rm24hContenidos.js";
  if (fs.existsSync(path.join(ROOT, rel))) {
    assertNoTimingRuntime(rel);
  }
  ok("remarketing contenidos programados sin timing");
}

function testFlowServiceGateExplicito() {
  const src = read("services/flowService.js");
  assert.ok(src.includes("aplicarRespuestaTiming === true"));
  assert.ok(src.includes("_respuestaTimingAplicado"));
  assert.ok(src.includes("aplicarTimingAntesDeRespuestaAutomatica"));
  ok("flowService exige flag explícito y un solo disparo");
}

function testWebhookPasaTimingNoDisparaSolo() {
  const src = read("routes/webhook.js");
  assert.ok(src.includes("respuestaTiming"));
  assert.ok(src.includes("readTimingFromRow"));
  assert.ok(src.includes("reclamarMensajeEntrantePorWamid"));
  assert.ok(
    !src.includes("intentarEnviarIndicadorEscritura"),
    "webhook no envía typing directamente"
  );
  assert.ok(
    !src.includes("aplicarTimingAntesDeRespuestaAutomatica"),
    "webhook no aplica demora en la entrada general"
  );
  ok("webhook claim+timing transport; no dispara typing/demora solo");
}

testWhatsappServiceSinTiming();
testInboxManualSinTiming();
testSeguimientosSinTiming();
testRemarketingContenidosSinTiming();
testFlowServiceGateExplicito();
testWebhookPasaTimingNoDisparaSolo();

console.log(`\n${passed} tests OK`);
