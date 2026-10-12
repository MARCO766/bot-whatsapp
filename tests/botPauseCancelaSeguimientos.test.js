/**
 * Apagar flujo cancela Seguimiento V2 y el worker V2 respeta la pausa.
 * Ejecutar: node tests/botPauseCancelaSeguimientos.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  cancelarSeguimientosPorBotPause,
  MOTIVO_BOT_PAUSADO_MANUAL,
} = require("../services/conversaciones/cancelarSeguimientosPorBotPause");
const {
  procesarSeguimientoV2Item,
} = require("../services/seguimientoV2/seguimientoV2Worker");
const {
  ESTADOS_SEGUIMIENTO_V2,
  ESTADOS_ACTIVOS_V2,
} = require("../services/seguimientoV2/constants");
const {
  cancelarSeguimientosV2PorResetbot,
} = require("../services/seguimientoV2/seguimientoV2CancelOnResetbot");
const {
  cancelarSeguimientosV2PorRespuesta,
} = require("../services/seguimientoV2/seguimientoV2CancelOnReply");
const { reactivarBotConversacion } = require("../services/conversaciones/botPauseService");

const USUARIO = "user-test-1";
const CLIENTE_A = "5491111111111";
const CLIENTE_B = "5491222222222";
const CONEXION_A = "conn-a";
const CONEXION_B = "conn-b";

let passed = 0;
function ok(name) {
  passed += 1;
  console.log("✅", name);
}

function mockActualizarSiEn(rowRef) {
  return async (id, estado, estadosDesde = [], extra = {}) => {
    const row = rowRef.current;
    if (!row || String(row.id) !== String(id)) return null;
    if (!estadosDesde.includes(row.estado)) return null;
    row.estado = estado;
    if (extra.error_detalle != null) row.error_detalle = extra.error_detalle;
    return { ...row };
  };
}

async function testCancelV2ConTripleta() {
  let argsSeen = null;
  const res = await cancelarSeguimientosPorBotPause({
    usuarioId: USUARIO,
    clienteNumero: CLIENTE_A,
    conexionWhatsappId: CONEXION_A,
    deps: {
      cancelarV2: async (args) => {
        argsSeen = args;
        return { cancelados: 3 };
      },
    },
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.cancelados_v2, 3);
  assert.strictEqual(res.motivo, MOTIVO_BOT_PAUSADO_MANUAL);
  assert.strictEqual(res.cancelados_v1, undefined);
  assert.strictEqual(argsSeen.usuarioId, USUARIO);
  assert.strictEqual(argsSeen.numero, CLIENTE_A);
  assert.strictEqual(argsSeen.conexionWhatsappId, CONEXION_A);
  assert.strictEqual(argsSeen.motivo, MOTIVO_BOT_PAUSADO_MANUAL);
  ok("1. Apagar cancela V2 con tripleta + motivo");
}

async function testOrquestadorSinV1() {
  const src = fs.readFileSync(
    path.join(
      __dirname,
      "../services/conversaciones/cancelarSeguimientosPorBotPause.js"
    ),
    "utf8"
  );
  assert.ok(!/seguimientoRepository|cancelarSeguimientosActivos|cancelarV1/.test(src));
  assert.ok(/cancelarSeguimientosV2PorResetbot/.test(src));
  ok("2. Orquestador no depende de cancelación V1");
}

async function testScopeConexion() {
  const seen = [];
  await cancelarSeguimientosPorBotPause({
    usuarioId: USUARIO,
    clienteNumero: CLIENTE_A,
    conexionWhatsappId: CONEXION_A,
    deps: {
      cancelarV2: async (args) => {
        seen.push(args.conexionWhatsappId);
        return { cancelados: 1 };
      },
    },
  });
  assert.deepStrictEqual(seen, [CONEXION_A]);
  assert.ok(!seen.includes(CONEXION_B));
  ok("3. Aislamiento por conexion_whatsapp_id");
}

async function testScopeOtrosClientes() {
  const seen = [];
  await cancelarSeguimientosPorBotPause({
    usuarioId: USUARIO,
    clienteNumero: CLIENTE_A,
    conexionWhatsappId: CONEXION_A,
    deps: {
      cancelarV2: async (args) => {
        seen.push(args.numero);
        return { cancelados: 1 };
      },
    },
  });
  assert.deepStrictEqual(seen, [CLIENTE_A]);
  assert.ok(!seen.includes(CLIENTE_B));
  ok("4. Aislamiento por cliente_numero");
}

async function testDatosIncompletos() {
  const res = await cancelarSeguimientosPorBotPause({
    usuarioId: USUARIO,
    clienteNumero: CLIENTE_A,
    conexionWhatsappId: "",
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, "datos_incompletos");
  ok("5. Rechaza tripleta incompleta");
}

async function testWorkerV2PausaPreReserva() {
  let reservado = false;
  const rowRef = {
    current: {
      id: "seg-v2-1",
      usuario_id: USUARIO,
      cliente_numero: CLIENTE_A,
      conexion_whatsapp_id: CONEXION_A,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
      campana_id: "camp-1",
      paso_index: 0,
    },
  };

  const res = await procesarSeguimientoV2Item(rowRef.current, {
    deps: {
      estaBotPausado: async () => true,
      reservarParaEnvio: async () => {
        reservado = true;
        return null;
      },
      actualizarEstadoSiEn: mockActualizarSiEn(rowRef),
      enviarSeguimientoV2: async () => {
        throw new Error("no debe enviar");
      },
    },
  });

  assert.strictEqual(res.motivo, "bot_pausado");
  assert.strictEqual(reservado, false);
  assert.strictEqual(rowRef.current.estado, ESTADOS_SEGUIMIENTO_V2.CANCELADO);
  assert.strictEqual(rowRef.current.error_detalle, MOTIVO_BOT_PAUSADO_MANUAL);
  ok("6. Worker V2 detecta pausa antes de reservar");
}

async function testWorkerV2PausaPostReserva() {
  let enviaron = false;
  let checks = 0;
  const rowRef = {
    current: {
      id: "seg-v2-2",
      usuario_id: USUARIO,
      cliente_numero: CLIENTE_A,
      conexion_whatsapp_id: CONEXION_A,
      estado: ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
      campana_id: "camp-2",
      paso_index: 0,
    },
  };

  const res = await procesarSeguimientoV2Item(
    { ...rowRef.current, estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE },
    {
      deps: {
        estaBotPausado: async () => {
          checks += 1;
          return checks >= 2;
        },
        reservarParaEnvio: async () => ({ ...rowRef.current }),
        obtenerPorId: async () => ({ ...rowRef.current }),
        actualizarEstadoSiEn: mockActualizarSiEn(rowRef),
        enviarSeguimientoV2: async () => {
          enviaron = true;
          return { ok: true };
        },
      },
    }
  );

  assert.strictEqual(checks, 2);
  assert.strictEqual(res.motivo, "bot_pausado");
  assert.strictEqual(enviaron, false);
  assert.strictEqual(rowRef.current.estado, ESTADOS_SEGUIMIENTO_V2.CANCELADO);
  ok("7. Worker V2: pausa post-reserva no envía");
}

async function testResumeNoRestaura() {
  const src = fs.readFileSync(
    path.join(__dirname, "../services/conversaciones/botPauseService.js"),
    "utf8"
  );
  assert.ok(typeof reactivarBotConversacion === "function");
  assert.ok(!/seguimientos_programados|seguimientos_v2|cancelarSeguimientos/.test(src));

  const pauseSrc = fs.readFileSync(
    path.join(__dirname, "../routes/inboxApi.js"),
    "utf8"
  );
  const resumeBlock = pauseSrc.slice(
    pauseSrc.indexOf('action === "resume"'),
    pauseSrc.indexOf('action === "pause"')
  );
  assert.ok(!/cancelarSeguimientosPorBotPause/.test(resumeBlock));
  ok("8. Reactivar bot no restaura seguimientos cancelados");
}

async function testRutasExistentesSiguen() {
  assert.strictEqual(typeof cancelarSeguimientosV2PorResetbot, "function");
  assert.strictEqual(typeof cancelarSeguimientosV2PorRespuesta, "function");
  ok("9. cancel-on-reply/resetbot V2 siguen exportados");
}

async function testUpdateCondicionalNoSobrescribeTerminales() {
  for (const terminal of [
    ESTADOS_SEGUIMIENTO_V2.CANCELADO,
    ESTADOS_SEGUIMIENTO_V2.ENVIADO,
    ESTADOS_SEGUIMIENTO_V2.RESPONDIDO,
  ]) {
    const rowRef = {
      current: {
        id: `seg-term-${terminal}`,
        usuario_id: USUARIO,
        cliente_numero: CLIENTE_A,
        conexion_whatsapp_id: CONEXION_A,
        estado: terminal,
      },
    };
    let enviaron = false;
    const res = await procesarSeguimientoV2Item(
      { ...rowRef.current, estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE },
      {
        deps: {
          estaBotPausado: async () => false,
          reservarParaEnvio: async () => ({
            ...rowRef.current,
            estado: ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
          }),
          obtenerPorId: async () => ({ ...rowRef.current }),
          actualizarEstadoSiEn: mockActualizarSiEn(rowRef),
          enviarSeguimientoV2: async () => {
            enviaron = true;
            return { ok: true, metaMessageId: "x" };
          },
        },
      }
    );
    assert.strictEqual(enviaron, false);
    assert.strictEqual(rowRef.current.estado, terminal);
    assert.ok(
      res.motivo === "ya_cancelado_o_respondido" || res.motivo === "bot_pausado"
    );
  }
  ok("10. UPDATE condicional no sobrescribe cancelado/enviado/respondido");
}

async function testNoEnviaSiCanceladoTrasReserva() {
  let enviaron = false;
  const rowRef = {
    current: {
      id: "seg-v2-cancel-race",
      usuario_id: USUARIO,
      cliente_numero: CLIENTE_A,
      conexion_whatsapp_id: CONEXION_A,
      estado: ESTADOS_SEGUIMIENTO_V2.CANCELADO,
      campana_id: "c",
      paso_index: 0,
    },
  };

  const res = await procesarSeguimientoV2Item(
    {
      id: "seg-v2-cancel-race",
      usuario_id: USUARIO,
      cliente_numero: CLIENTE_A,
      conexion_whatsapp_id: CONEXION_A,
      estado: ESTADOS_SEGUIMIENTO_V2.PENDIENTE,
    },
    {
      deps: {
        estaBotPausado: async () => false,
        reservarParaEnvio: async () => ({
          id: "seg-v2-cancel-race",
          estado: ESTADOS_SEGUIMIENTO_V2.PROCESANDO,
        }),
        obtenerPorId: async () => ({ ...rowRef.current }),
        actualizarEstadoSiEn: mockActualizarSiEn(rowRef),
        enviarSeguimientoV2: async () => {
          enviaron = true;
          return { ok: true };
        },
      },
    }
  );

  assert.strictEqual(res.motivo, "ya_cancelado_o_respondido");
  assert.strictEqual(enviaron, false);
  assert.strictEqual(rowRef.current.estado, ESTADOS_SEGUIMIENTO_V2.CANCELADO);
  ok("11. Worker no envía si recheck ve cancelado tras reserva");
}

async function testFalloV2SePropaga() {
  const res = await cancelarSeguimientosPorBotPause({
    usuarioId: USUARIO,
    clienteNumero: CLIENTE_A,
    conexionWhatsappId: CONEXION_A,
    deps: {
      cancelarV2: async () => {
        throw new Error("boom-v2");
      },
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, "cancelacion_v2_fallida");
  assert.strictEqual(res.cancelados_v2, 0);

  const inboxSrc = fs.readFileSync(
    path.join(__dirname, "../routes/inboxApi.js"),
    "utf8"
  );
  const failIdx = inboxSrc.indexOf("pausa_aplicada_cancelacion_seguimientos_fallida");
  assert.ok(failIdx > 0);
  const failBlock = inboxSrc.slice(
    inboxSrc.lastIndexOf("if (!seguimientosCancelados?.ok)", failIdx),
    failIdx + 80
  );
  assert.ok(/conversacionActualizada/.test(failBlock));
  assert.ok(/ok:\s*false/.test(failBlock));
  assert.ok(!/ok:\s*true/.test(failBlock));
  assert.ok(!/cancelados_v1/.test(inboxSrc));
  ok("12. Fallo V2 se propaga; endpoint mantiene error + realtime");
}

async function testActivosV2PendienteYProcesando() {
  assert.ok(ESTADOS_ACTIVOS_V2.includes(ESTADOS_SEGUIMIENTO_V2.PENDIENTE));
  assert.ok(ESTADOS_ACTIVOS_V2.includes(ESTADOS_SEGUIMIENTO_V2.PROCESANDO));
  assert.strictEqual(ESTADOS_ACTIVOS_V2.length, 2);

  const v2Src = fs.readFileSync(
    path.join(
      __dirname,
      "../services/seguimientoV2/seguimientoV2CancelOnResetbot.js"
    ),
    "utf8"
  );
  assert.ok(/listarPendientesPorClaveTriple/.test(v2Src));
  assert.ok(/conexionWhatsappId/.test(v2Src));

  const repoSrc = fs.readFileSync(
    path.join(
      __dirname,
      "../services/seguimientoV2/seguimientoV2Repository.js"
    ),
    "utf8"
  );
  const listarFn = repoSrc.slice(
    repoSrc.indexOf("async function listarPendientesPorClaveTriple"),
    repoSrc.indexOf("async function cancelarCampana")
  );
  assert.ok(/ESTADOS_ACTIVOS_V2/.test(listarFn));
  ok("13. Helper V2 cancela pendiente+procesando por tripleta");
}

async function main() {
  await testCancelV2ConTripleta();
  await testOrquestadorSinV1();
  await testScopeConexion();
  await testScopeOtrosClientes();
  await testDatosIncompletos();
  await testWorkerV2PausaPreReserva();
  await testWorkerV2PausaPostReserva();
  await testResumeNoRestaura();
  await testRutasExistentesSiguen();
  await testUpdateCondicionalNoSobrescribeTerminales();
  await testNoEnviaSiCanceladoTrasReserva();
  await testFalloV2SePropaga();
  await testActivosV2PendienteYProcesando();
  console.log(
    `\nOK botPauseCancelaSeguimientos.test.js — ${passed} assertion groups passed`
  );
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
