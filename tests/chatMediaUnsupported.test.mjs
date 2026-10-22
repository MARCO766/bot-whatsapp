/**
 * Fallback UI Bandeja para tipo unsupported / contenido vacío.
 * Ejecutar: node tests/chatMediaUnsupported.test.mjs
 */
import assert from "assert";
import { visibleCaption } from "../frontend/src/utils/chatMedia.js";
import { formatPreview } from "../frontend/src/utils/chatFormat.js";

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function testUnsupportedVacioMuestraEtiqueta() {
  const caption = visibleCaption(
    { tipo: "unsupported", contenido: "" },
    null
  );
  assert.strictEqual(caption, "Mensaje no soportado por WhatsApp");
  ok("visibleCaption: unsupported vacío → etiqueta clara");
}

function testUnsupportedConEtiquetaGuardada() {
  const caption = visibleCaption(
    {
      tipo: "unsupported",
      contenido: "Mensaje no soportado (reacción)",
    },
    null
  );
  assert.strictEqual(caption, "Mensaje no soportado (reacción)");
  ok("visibleCaption: conserva contenido etiquetado del webhook");
}

function testTextoNormalSinCambio() {
  const caption = visibleCaption(
    { tipo: "texto", contenido: "Hola cliente" },
    null
  );
  assert.strictEqual(caption, "Hola cliente");
  ok("visibleCaption: texto normal intacto");
}

function testImagenPlaceholderOculto() {
  const caption = visibleCaption(
    { tipo: "image", contenido: "imagen" },
    "image"
  );
  assert.strictEqual(caption, null);
  ok("visibleCaption: placeholder imagen sigue oculto");
}

function testFormatPreviewUnsupported() {
  assert.strictEqual(formatPreview("unsupported"), "Mensaje no soportado");
  assert.strictEqual(formatPreview("audio"), "🎧 Audio");
  assert.ok(formatPreview("Hola mundo").startsWith("Hola"));
  ok("formatPreview: unsupported, audio y texto");
}

testUnsupportedVacioMuestraEtiqueta();
testUnsupportedConEtiquetaGuardada();
testTextoNormalSinCambio();
testImagenPlaceholderOculto();
testFormatPreviewUnsupported();

console.log(`\n${passed} tests OK`);
