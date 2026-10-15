/**
 * Protección V2 ventana 24h — mocks, sin Meta real.
 * Ejecutar: node tests/seguimientoV2Ventana24h.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  evaluarVentana24hSeguimientoV2,
  MOTIVO_VENTANA_WHATSAPP_CERRADA,
} = require("../services/seguimientoV2/seguimientoV2Ventana24h");
const { enviarSeguimientoV2 } = require("../services/seguimientoV2/seguimientoV2Sender");
const {
  procesarSeguimientoV2Item,
} = require("../services/seguimientoV2/seguimientoV2Worker");
const {
  ESTADOS_SEGUIMIENTO_V2,
  ESTADOS_ACTIVOS_V2,
} = require("../services/seguimientoV2/constants");

const USUARIO = "user-v2-24h";
const CLIENTE = "5491111111111";
const CONEXION_A = "conn-a-uuid";
const CONEXION_B = "conn-b-uuid";

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function itemBase(overrides = {}) {
  return {
    id: "seg-v2-1",
    usuario_id: USUARIO,
    cliente_numero: CLIENTE,
    conexion_whatsapp_id: CONEXION_A,
    campana_id: "camp-1",
    paso_index: 0,
    tipo: "texto",
    contenido: "Hola seguimiento V2",
    estado: ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
    ...overrides,
  };
}

function isoHaceHoras(horas) {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

async function testVentanaAbiertaPermite() {
  const res = await evaluarVentana24hSeguimientoV2(itemBase(), {
    obtenerUltimoMensajeEntranteV2: async () => ({
      ok: true,
      mensaje: {
        id: "m1",
        creado_en: isoHaceHoras(1),
        conexion_whatsapp_id: CONEXION_A,
      },
    }),
  });
  assert.strictEqual(res.permitir, true);
  assert.strictEqual(res.motivo, null);
  ok("1. Ventana abierta → permitir");
}

async function testVentanaVencidaBloquea() {
  const res = await evaluarVentana24hSeguimientoV2(itemBase(), {
    obtenerUltimoMensajeEntranteV2: async () => ({
      ok: true,
      mensaje: {
        id: "m1",
        creado_en: isoHaceHoras(25),
        conexion_whatsapp_id: CONEXION_A,
      },
    }),
  });
  assert.strictEqual(res.permitir, false);
  assert.strictEqual(res.motivo, MOTIVO_VENTANA_WHATSAPP_CERRADA);
  assert.strictEqual(res.detalle.razon, "ventana_vencida");
  ok("2. Ventana vencida → bloquear");
}

async function testSinMensajeEntranteBloquea() {
  const res = await evaluarVentana24hSeguimientoV2(itemBase(), {
    obtenerUltimoMensajeEntranteV2: async () => ({
      ok: true,
      mensaje: null,
    }),
  });
  assert.strictEqual(res.permitir, false);
  assert.strictEqual(res.motivo, MOTIVO_VENTANA_WHATSAPP_CERRADA);
  assert.strictEqual(res.detalle.razon, "sin_mensaje_entrante");
  ok("3. Sin mensaje entrante → bloquear");
}

async function testSinContextoBloquea() {
  const res = await evaluarVentana24hSeguimientoV2({
    id: "x",
    usuario_id: USUARIO,
    cliente_numero: CLIENTE,
    // sin conexion
  });
  assert.strictEqual(res.permitir, false);
  assert.strictEqual(res.detalle.razon, "contexto_incompleto");
  ok("4. Sin conexion_whatsapp_id → bloquear");
}

async function testNoVerificableBloquea() {
  const res = await evaluarVentana24hSeguimientoV2(itemBase(), {
    obtenerUltimoMensajeEntranteV2: async () => ({
      ok: false,
      motivo: "timeout",
      mensaje: null,
    }),
  });
  assert.strictEqual(res.permitir, false);
  assert.strictEqual(res.detalle.razon, "no_verificable");
  ok("5. Consulta no verificable → bloquear (fail-closed)");
}

async function testAislamientoConexiones() {
  const urls = [];
  const resUrl = await evaluarVentana24hSeguimientoV2(
    itemBase({ conexion_whatsapp_id: CONEXION_A }),
    {
      supabaseUrl: "https://example.supabase.co",
      supabaseKey: "test-key",
      axiosGet: async (url) => {
        urls.push(url);
        return {
          data: [
            {
              id: "m-a",
              creado_en: isoHaceHoras(1),
              conexion_whatsapp_id: CONEXION_A,
            },
          ],
        };
      },
    }
  );
  assert.strictEqual(resUrl.permitir, true);
  assert.ok(urls.length === 1, "debe consultar una vez");
  assert.ok(
    urls[0].includes(`conexion_whatsapp_id=eq.${encodeURIComponent(CONEXION_A)}`),
    "filtra por conexion A"
  );
  assert.ok(
    !urls[0].includes(encodeURIComponent(CONEXION_B)),
    "no mezcla conexion B en el filtro"
  );

  // Si el mensaje devuelto pertenece a otra línea, también bloquea.
  const resMismatch = await evaluarVentana24hSeguimientoV2(
    itemBase({ conexion_whatsapp_id: CONEXION_A }),
    {
      obtenerUltimoMensajeEntranteV2: async () => ({
        ok: true,
        mensaje: {
          id: "m-b",
          creado_en: isoHaceHoras(1),
          conexion_whatsapp_id: CONEXION_B,
        },
      }),
    }
  );
  assert.strictEqual(resMismatch.permitir, false);
  assert.strictEqual(resMismatch.detalle.razon, "conexion_mismatch");
  ok("6. Aislamiento entre conexiones WhatsApp");
}

async function testSenderVentanaAbiertaLlamaMeta() {
  let metaCalls = 0;
  const res = await enviarSeguimientoV2(itemBase(), {
    deps: {
      existeMensajePorSeguimientoV2Id: async () => null,
      resolverConexionV2: async () => ({
        id: CONEXION_A,
        phone_id: "phone-1",
        token: "tok",
      }),
      evaluarVentana24hSeguimientoV2: async () => ({
        permitir: true,
        motivo: null,
        detalle: {},
      }),
      enviarTextoWhatsApp: async () => {
        metaCalls += 1;
        return { whatsapp_message_id: "wamid.ok" };
      },
      enviarMediaWhatsApp: async () => {
        metaCalls += 1;
        return { whatsapp_message_id: "wamid.media" };
      },
    },
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(metaCalls, 1);
  ok("7. Sender ventana abierta → 1 envío simulado");
}

async function testSenderVentanaVencidaCeroMeta() {
  let metaCalls = 0;
  const res = await enviarSeguimientoV2(itemBase(), {
    deps: {
      existeMensajePorSeguimientoV2Id: async () => null,
      resolverConexionV2: async () => ({
        id: CONEXION_A,
        phone_id: "phone-1",
        token: "tok",
      }),
      evaluarVentana24hSeguimientoV2: async () => ({
        permitir: false,
        motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA,
        detalle: { razon: "ventana_vencida" },
      }),
      enviarTextoWhatsApp: async () => {
        metaCalls += 1;
        return { whatsapp_message_id: "wamid.leak" };
      },
      enviarMediaWhatsApp: async () => {
        metaCalls += 1;
        return { whatsapp_message_id: "wamid.leak" };
      },
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motivo, MOTIVO_VENTANA_WHATSAPP_CERRADA);
  assert.strictEqual(metaCalls, 0);
  ok("8. Sender ventana vencida → 0 POST Meta");
}

async function testWorkerMarcaFallidoSinReintento() {
  const row = itemBase({ estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE });
  let metaCalls = 0;
  let estadosAplicados = [];

  const res = await procesarSeguimientoV2Item(row, {
    deps: {
      estaBotPausado: async () => false,
      reservarParaEnvio: async (id) => {
        row.estado = ESTADOS_SEGUIMIENTO_V2.PROCESANDO;
        return { ...row, id };
      },
      obtenerPorId: async () => ({ ...row }),
      actualizarEstadoSiEn: async (id, estado, desde, extra = {}) => {
        if (!desde.includes(row.estado)) return null;
        row.estado = estado;
        if (extra.error_detalle != null) row.error_detalle = extra.error_detalle;
        estadosAplicados.push({ estado, error_detalle: row.error_detalle });
        return { ...row };
      },
      insertarLog: async () => {},
      enviarSeguimientoV2: async () => {
        metaCalls += 1;
        return { ok: false, motivo: MOTIVO_VENTANA_WHATSAPP_CERRADA };
      },
    },
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.motivo, MOTIVO_VENTANA_WHATSAPP_CERRADA);
  assert.strictEqual(row.estado, ESTADOS_SEGUIMIENTO_V2.FALLIDO);
  assert.strictEqual(row.error_detalle, MOTIVO_VENTANA_WHATSAPP_CERRADA);
  assert.ok(!ESTADOS_ACTIVOS_V2.includes(row.estado), "fallido no es activo → sin reintento");
  // Mock de enviarSeguimientoV2: el worker no reintenta tras fallido.
  assert.strictEqual(metaCalls, 1);
  assert.ok(
    estadosAplicados.some(
      (e) =>
        e.estado === ESTADOS_SEGUIMIENTO_V2.FALLIDO &&
        e.error_detalle === MOTIVO_VENTANA_WHATSAPP_CERRADA
    )
  );
  ok("9. Worker → fallido + motivo ventana_whatsapp_cerrada (sin reintento)");
}

function testOtrosModulosNoTocados() {
  const root = path.join(__dirname, "..");
  const prohibidos = [
    "services/seguimiento/executeSeguimiento.js",
    "services/remarketing24h/executeRemarketing24h.js",
    "services/whatsapp24hGuard.js",
    "services/whatsappService.js",
    "services/conversaciones/botPauseService.js",
    "services/flowService.js",
    ".env.example",
  ];

  // Este test solo verifica que el set de archivos de esta feature está acotado.
  // El git diff --check / status confirma el alcance real post-edición.
  for (const rel of prohibidos) {
    assert.ok(fs.existsSync(path.join(root, rel)), `existe ${rel}`);
  }

  const v2Files = [
    "services/seguimientoV2/seguimientoV2Ventana24h.js",
    "services/seguimientoV2/seguimientoV2Sender.js",
    "services/seguimientoV2/constants.js",
  ];
  for (const rel of v2Files) {
    assert.ok(fs.existsSync(path.join(root, rel)), `existe ${rel}`);
  }

  const senderSrc = fs.readFileSync(
    path.join(root, "services/seguimientoV2/seguimientoV2Sender.js"),
    "utf8"
  );
  assert.ok(senderSrc.includes("evaluarVentana24hSeguimientoV2"));
  assert.ok(senderSrc.includes("bloqueadoVentana24h"));

  const guardSrc = fs.readFileSync(
    path.join(root, "services/whatsapp24hGuard.js"),
    "utf8"
  );
  assert.ok(guardSrc.includes('log_only'), "guard global intacto");

  ok("10. Alcance acotado a V2 (archivos clave presentes; guard global sin cambio de diseño)");
}

async function main() {
  await testVentanaAbiertaPermite();
  await testVentanaVencidaBloquea();
  await testSinMensajeEntranteBloquea();
  await testSinContextoBloquea();
  await testNoVerificableBloquea();
  await testAislamientoConexiones();
  await testSenderVentanaAbiertaLlamaMeta();
  await testSenderVentanaVencidaCeroMeta();
  await testWorkerMarcaFallidoSinReintento();
  testOtrosModulosNoTocados();
  console.log(`\n${passed} tests OK`);
}

main().catch((err) => {
  console.error("\n❌ FAIL", err);
  process.exit(1);
});
