const NODO_SEGUIMIENTO_V2_TEST_ID = "nodo_seguimiento_v2_test";
const FLUJO_SEGUIMIENTO_V2_TEST_ID = "flujo_seguimiento_v2_test";
const ACTIVADOR_SEGUIMIENTO_V2_TEST_FRASE = "testsegv2";

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
};
