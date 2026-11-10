import assert from "node:assert/strict";
import test from "node:test";
import { ESTADO_SIN_LINEAS, estadoDeLineaWhatsapp } from "./whatsappEstado.js";

test("token y phone id se muestran como API configurada", () => {
  assert.deepEqual(
    estadoDeLineaWhatsapp({
      conectado: true,
      estado: "conectado",
      tiene_token: true,
      phone_id: "123",
      activo: true,
    }),
    { key: "configurada", label: "API configurada" }
  );
  assert.equal(
    estadoDeLineaWhatsapp({ tiene_token: true, phone_id: "999" }).label,
    "API configurada"
  );
  assert.equal(
    estadoDeLineaWhatsapp({
      token_masked: "abcd****wxyz",
      phoneNumberId: "555",
      activo: false,
    }).label,
    "API configurada"
  );
});

test("una línea secundaria con API sigue como configurada", () => {
  assert.equal(
    estadoDeLineaWhatsapp({
      conectado: true,
      tiene_token: true,
      phone_id: "42",
      activo: false,
    }).key,
    "configurada"
  );
});

test("sin token o sin phone id es API sin configurar", () => {
  assert.equal(estadoDeLineaWhatsapp({ estado: "incompleto" }).label, "API sin configurar");
  assert.equal(
    estadoDeLineaWhatsapp({ tiene_token: true, phone_id: "" }).label,
    "API sin configurar"
  );
  assert.equal(
    estadoDeLineaWhatsapp({ tiene_token: false, phone_id: "123" }).label,
    "API sin configurar"
  );
  assert.equal(
    estadoDeLineaWhatsapp({ conectado: true, estado: "conectado" }).label,
    "API sin configurar"
  );
});

test("credenciales presentes no usan la etiqueta de desconexión", () => {
  const estado = estadoDeLineaWhatsapp({
    estado: "desconectado",
    tiene_token: true,
    phone_id: "123",
    conectado: true,
  });
  assert.equal(estado.label, "API configurada");
  assert.equal(estado.label.includes("Desconectado"), false);
  assert.equal(estado.label.includes("Conectado"), false);
});

test("la cuenta sin líneas indica que no hay número configurado", () => {
  assert.deepEqual(ESTADO_SIN_LINEAS, {
    key: "sin-numero",
    label: "Sin número configurado",
  });
});
