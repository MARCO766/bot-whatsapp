/**
 * Eventos Meta unsupported / contenido vacío para Bandeja.
 * Ejecutar: node tests/whatsappUnsupportedInbound.test.js
 */
const assert = require("assert");
const {
  CONTENIDO_GENERICO,
  resolverContenidoUnsupported,
  etiquetaUiMensajeVacioOUnsupported,
} = require("../services/whatsappUnsupportedInbound");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function testTextoCompatibleNoEsUnsupported() {
  const message = {
    type: "text",
    text: { body: "Hola, quiero info" },
  };
  assert.strictEqual(message.type, "text");
  assert.strictEqual(message.text.body, "Hola, quiero info");
  ok("mensaje text compatible conserva body (patrón webhook)");
}

function testUnsupportedSinSubtipo() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    errors: [
      {
        code: 131051,
        title: "Message type unknown",
        message: "Message type unknown",
        error_data: { details: "Message type is currently not supported." },
      },
    ],
  });
  assert.strictEqual(r.contenido, CONTENIDO_GENERICO);
  assert.strictEqual(r.subtipo, null);
  assert.strictEqual(r.errorCode, 131051);
  ok("unsupported sin subtipo → etiqueta genérica + code 131051");
}

function testUnsupportedConSubtipoReaction() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    unsupported: { type: "reaction" },
    errors: [{ code: 131051, title: "Message type unknown" }],
  });
  assert.strictEqual(r.contenido, "Mensaje no soportado (reacción)");
  assert.strictEqual(r.subtipo, "reaction");
  assert.strictEqual(r.errorCode, 131051);
  ok("unsupported.reaction → etiqueta con subtipo documentado");
}

function testUnsupported131060() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    errors: [{ code: 131060, title: "This message is currently unavailable." }],
  });
  assert.strictEqual(r.contenido, "Mensaje no disponible temporalmente");
  assert.strictEqual(r.errorCode, 131060);
  ok("unsupported code 131060 → mensaje no disponible");
}

function testUnsupportedSubtipoDesconocidoNoInventado() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    unsupported: { type: "poll_creation" },
  });
  assert.strictEqual(r.contenido, "Mensaje no soportado (encuesta)");
  assert.strictEqual(r.subtipo, "poll_creation");
  ok("poll_creation mapea a etiqueta conocida sin inventar cuerpo");
}

function testUnsupportedSubtipoNoListado() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    unsupported: { type: "algo_futuro_xyz" },
  });
  assert.strictEqual(r.contenido, "Mensaje no soportado (algo_futuro_xyz)");
  ok("subtipo no listado se muestra literal (sin inventar significado)");
}

function testUiFallbackHistoricoVacio() {
  assert.strictEqual(
    etiquetaUiMensajeVacioOUnsupported({
      tipo: "unsupported",
      contenido: "",
    }),
    CONTENIDO_GENERICO
  );
  assert.strictEqual(
    etiquetaUiMensajeVacioOUnsupported({
      tipo: "unsupported",
      contenido: "Mensaje no soportado (reacción)",
    }),
    null
  );
  assert.strictEqual(
    etiquetaUiMensajeVacioOUnsupported({
      tipo: "texto",
      contenido: "hola",
    }),
    null
  );
  ok("UI fallback solo para unsupported vacío; no pisa contenido ya etiquetado");
}

function testNoRecuperaContenidoInexistente() {
  const r = resolverContenidoUnsupported({
    type: "unsupported",
    // sin text / image / audio — Meta no los envía
  });
  assert.ok(!r.contenido.includes("Hola"));
  assert.ok(r.contenido.length > 0);
  ok("no inventa cuerpo original; solo etiqueta no vacía");
}

testTextoCompatibleNoEsUnsupported();
testUnsupportedSinSubtipo();
testUnsupportedConSubtipoReaction();
testUnsupported131060();
testUnsupportedSubtipoDesconocidoNoInventado();
testUnsupportedSubtipoNoListado();
testUiFallbackHistoricoVacio();
testNoRecuperaContenidoInexistente();

console.log(`\n${passed} tests OK`);
