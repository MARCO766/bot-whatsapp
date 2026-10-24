/**
 * Indicador oficial Cloud API — sin llamadas reales.
 * Ejecutar: node tests/whatsappTypingIndicator.test.js
 */
const assert = require("assert");
const {
  intentarEnviarIndicadorEscritura,
  GRAPH_VERSION,
} = require("../services/whatsappTypingIndicatorService");

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

async function testDesactivadoNoLlamaApi() {
  let called = 0;
  const axios = {
    post: async () => {
      called += 1;
      return { data: { success: true } };
    },
  };
  const r = await intentarEnviarIndicadorEscritura(
    {
      habilitado: false,
      messageId: "wamid.ABC",
      token: "tok",
      phoneId: "phone1",
    },
    { axios }
  );
  assert.strictEqual(r.skipped, "disabled");
  assert.strictEqual(called, 0);
  ok("indicador OFF → no llama a Graph");
}

async function testSinWamidNoLlama() {
  let called = 0;
  const axios = {
    post: async () => {
      called += 1;
      return { data: { success: true } };
    },
  };
  const r = await intentarEnviarIndicadorEscritura(
    {
      habilitado: true,
      messageId: "",
      token: "tok",
      phoneId: "phone1",
    },
    { axios }
  );
  assert.strictEqual(r.skipped, "no_message_id");
  assert.strictEqual(called, 0);
  ok("sin wamid → no petición");
}

async function testPayloadCorrecto() {
  let captured = null;
  const axios = {
    post: async (url, body, config) => {
      captured = { url, body, config };
      return { data: { success: true } };
    },
  };
  const r = await intentarEnviarIndicadorEscritura(
    {
      habilitado: true,
      messageId: "wamid.TEST123",
      token: "EAA_SECRET",
      phoneId: "106540352242922",
    },
    { axios }
  );
  assert.strictEqual(r.ok, true);
  assert.ok(captured.url.includes(`graph.facebook.com/${GRAPH_VERSION}/106540352242922/messages`));
  assert.deepStrictEqual(captured.body, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "wamid.TEST123",
    typing_indicator: { type: "text" },
  });
  assert.ok(String(captured.config.headers.Authorization).includes("EAA_SECRET"));
  ok("ON + datos válidos → wamid y phone_id correctos");
}

async function testErrorNoLanza() {
  const axios = {
    post: async () => {
      const err = new Error("timeout");
      err.code = "ECONNABORTED";
      throw err;
    },
  };
  const r = await intentarEnviarIndicadorEscritura(
    {
      habilitado: true,
      messageId: "wamid.X",
      token: "tok",
      phoneId: "p1",
    },
    { axios }
  );
  assert.strictEqual(r.error, true);
  assert.strictEqual(r.ok, false);
  ok("error/timeout Meta → no lanza; ok:false");
}

async function testResuelveConexion() {
  let captured = null;
  const axios = {
    post: async (url, body) => {
      captured = { url, body };
      return { data: { success: true } };
    },
  };
  const getConexionPorId = async (uid, cid) => {
    assert.strictEqual(uid, "u1");
    assert.strictEqual(cid, "c1");
    return { token: "TOK_CONN", phone_id: "PHONE_CONN" };
  };
  await intentarEnviarIndicadorEscritura(
    {
      habilitado: true,
      messageId: "wamid.Y",
      usuarioId: "u1",
      conexionWhatsappId: "c1",
    },
    { axios, getConexionPorId }
  );
  assert.ok(captured.url.includes("PHONE_CONN"));
  assert.strictEqual(captured.body.message_id, "wamid.Y");
  ok("credenciales desde conexión correcta");
}

async function testDosConexionesIndependientes() {
  const phones = [];
  const axios = {
    post: async (url) => {
      phones.push(url);
      return { data: { success: true } };
    },
  };
  await intentarEnviarIndicadorEscritura(
    { habilitado: true, messageId: "wamid.1", token: "t", phoneId: "A" },
    { axios }
  );
  await intentarEnviarIndicadorEscritura(
    { habilitado: true, messageId: "wamid.2", token: "t", phoneId: "B" },
    { axios }
  );
  assert.ok(phones[0].includes("/A/messages"));
  assert.ok(phones[1].includes("/B/messages"));
  ok("dos conexiones usan phone_id distintos");
}

(async () => {
  await testDesactivadoNoLlamaApi();
  await testSinWamidNoLlama();
  await testPayloadCorrecto();
  await testErrorNoLanza();
  await testResuelveConexion();
  await testDosConexionesIndependientes();
  console.log(`\n${passed} tests OK`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
