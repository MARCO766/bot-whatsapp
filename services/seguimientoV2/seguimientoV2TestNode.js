const NODO_SEGUIMIENTO_V2_TEST_ID = "nodo_seguimiento_v2_test";
const FLUJO_SEGUIMIENTO_V2_TEST_ID = "flujo_seguimiento_v2_test";
const ACTIVADOR_SEGUIMIENTO_V2_TEST_FRASE = "testsegv2";

function normalizarConexionTestId(conexionWhatsappId) {
  return String(conexionWhatsappId || "").trim().toLowerCase();
}

function obtenerConexionTestA() {
  return process.env.TEST_V2_CONEXION_A || process.env.VALIDAR_V2_CONEXION_A || null;
}

function obtenerConexionTestB() {
  return process.env.TEST_V2_CONEXION_B || process.env.VALIDAR_V2_CONEXION_B || null;
}

function resolverVarianteTestV2(conexionWhatsappId) {
  const id = normalizarConexionTestId(conexionWhatsappId);
  if (!id) return null;

  const conexionA = obtenerConexionTestA();
  const conexionB = obtenerConexionTestB();

  if (conexionA && id === normalizarConexionTestId(conexionA)) return "A";
  if (conexionB && id === normalizarConexionTestId(conexionB)) return "B";
  return null;
}

function contenidoPasoTestV2(pasoIndex, variante) {
  const pasoNum = pasoIndex + 1;
  return `SEGUIMIENTO V2 ${pasoNum}${variante}`;
}

function aplicarVariantePasosTest(pasos, conexionWhatsappId) {
  const variante = resolverVarianteTestV2(conexionWhatsappId);
  if (!variante || !Array.isArray(pasos)) return pasos;

  return pasos.map((paso, index) => ({
    ...paso,
    contenido: contenidoPasoTestV2(index, variante),
  }));
}

function configSeguimientoV2Test() {
  return {
    version: 1,
    pasos: [
      {
        pasoId: "1",
        delay: { valor: 30, unidad: "segundos" },
        tipo: "texto",
        contenido: "SEGUIMIENTO V2 1",
      },
      {
        pasoId: "2",
        delay: { valor: 60, unidad: "segundos" },
        tipo: "texto",
        contenido: "SEGUIMIENTO V2 2",
      },
    ],
  };
}

function crearNodoSeguimientoV2Test(overrides = {}) {
  const config = configSeguimientoV2Test();
  const json = JSON.stringify(config);

  const { id, data: dataOverrides, ...restOverrides } = overrides;

  return {
    id: id || NODO_SEGUIMIENTO_V2_TEST_ID,
    className: "follow-node-v2 node-seguimiento-v2-test",
    type: "seguimiento_crm_v2",
    data: {
      type: "seguimiento_crm_v2",
      label: "Seguimiento CRM V2 Test",
      version: 1,
      pasos: config.pasos,
      seguimientoV2Test: true,
      ...dataOverrides,
    },
    html: `
      <div class="follow-header-v2"><span>Seguimiento CRM V2</span></div>
      <textarea class="seguimiento-v2-data" style="display:none;">${json}</textarea>
    `,
    ...restOverrides,
  };
}

function esNodoSeguimientoV2Test(nodo) {
  if (!nodo) return false;
  return (
    nodo.id === NODO_SEGUIMIENTO_V2_TEST_ID ||
    nodo.data?.seguimientoV2Test === true ||
    String(nodo.className || "").includes("node-seguimiento-v2-test")
  );
}

module.exports = {
  NODO_SEGUIMIENTO_V2_TEST_ID,
  FLUJO_SEGUIMIENTO_V2_TEST_ID,
  ACTIVADOR_SEGUIMIENTO_V2_TEST_FRASE,
  configSeguimientoV2Test,
  crearNodoSeguimientoV2Test,
  esNodoSeguimientoV2Test,
  resolverVarianteTestV2,
  contenidoPasoTestV2,
  aplicarVariantePasosTest,
  obtenerConexionTestA,
  obtenerConexionTestB,
};
