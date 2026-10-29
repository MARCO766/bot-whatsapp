/**
 * FASE 3 — Elegibilidad por Ad ID (routing) + excepción CTWA primer_mensaje.
 * Ejecutar: node scripts/test-flow-ad-id-routing.js
 *
 * Cubre isFlowCompatibleWithAdId, flowHasExplicitAdIdMatch,
 * evaluateCtwaPrimerMensajeException + simulación estática del orden
 * match → (excepción CTWA) → Ad ID → country.
 */
const {
  normalizeAdId,
  normalizeMetaAdsForRead,
  isFlowCompatibleWithAdId,
  flowHasExplicitAdIdMatch,
} = require("../services/flowMetaAdsMeta");
const fs = require("fs");
const path = require("path");
const {
  evaluateCtwaPrimerMensajeException,
  clasificarLecturaSesion,
  sesionEsDeEstaEntrada,
} = require("../services/ctwaPrimerMensajeException");
const { sesionBloqueaReingreso } = require("../services/firstMessageService");
const {
  matchActivador,
  sortActivadores,
  TIPOS,
} = require("../services/activadorUtils");
const {
  isContactCompatibleWithFlowCountry,
  countryAll,
  findByCode,
  MODE_SPECIFIC,
} = require("../services/flowCountryMeta");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
function check(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log("OK:", name);
}

const CTWA = "120251260803260234";
const OTHER = "999999999999999999";
const LONG_ID = "120251260803260234120251260803260234";
const AD_111 = "111";
const AD_222 = "222";
const FLOW_1 = "flow-1";
const FLOW_2 = "flow-2";

// --- 1. ad_ids ausente + ctwaAdId → true ---
check(
  "1. meta_ads undefined + ctwaAdId → true",
  isFlowCompatibleWithAdId(undefined, CTWA) === true
);
check(
  "1. meta_ads null + ctwaAdId → true",
  isFlowCompatibleWithAdId(null, CTWA) === true
);

// --- 2. ad_ids vacío + ctwaAdId → true ---
check(
  "2. ad_ids [] + ctwaAdId → true",
  isFlowCompatibleWithAdId({ ad_ids: [] }, CTWA) === true
);
check(
  "2. ad_ids ausente en objeto + ctwaAdId → true",
  isFlowCompatibleWithAdId({}, CTWA) === true
);

// --- 3. match → true ---
check(
  "3. ad_ids con match → true",
  isFlowCompatibleWithAdId({ ad_ids: [CTWA] }, CTWA) === true
);

// --- 4. sin match → false ---
check(
  "4. ad_ids sin match → false",
  isFlowCompatibleWithAdId({ ad_ids: [OTHER] }, CTWA) === false
);

// --- 5. restringido + ctwaAdId undefined → false ---
check(
  "5. ad_ids configurado + ctwaAdId undefined → false",
  isFlowCompatibleWithAdId({ ad_ids: ["123"] }, undefined) === false
);
check(
  "5. ad_ids configurado + ctwaAdId null → false",
  isFlowCompatibleWithAdId({ ad_ids: ["123"] }, null) === false
);
check(
  "5. ad_ids configurado + ctwaAdId '' → false",
  isFlowCompatibleWithAdId({ ad_ids: ["123"] }, "") === false
);

// --- 6. varios IDs + match segundo ---
check(
  "6. match con segundo ID → true",
  isFlowCompatibleWithAdId({ ad_ids: [OTHER, CTWA, "111"] }, CTWA) === true
);

// --- 7. duplicados ---
check(
  "7. duplicados en lista → normalize correcto + match",
  (() => {
    const n = normalizeMetaAdsForRead({
      ad_ids: [CTWA, CTWA, ` ${CTWA} `],
    });
    return (
      n.ad_ids.length === 1 &&
      n.ad_ids[0] === CTWA &&
      isFlowCompatibleWithAdId({ ad_ids: [CTWA, CTWA] }, CTWA) === true
    );
  })()
);

// --- 8. espacios ---
check(
  "8. IDs con espacios → normalización",
  isFlowCompatibleWithAdId({ ad_ids: [`  ${CTWA}  `] }, ` ${CTWA} `) === true
);

// --- 9. letras → no coincidencia inválida ---
check(
  "9. letras en ad_ids se descartan → sin restricción efectiva",
  isFlowCompatibleWithAdId({ ad_ids: ["abc", "12x"] }, CTWA) === true
);
check(
  "9. ctwaAdId con letras + restricción real → false",
  isFlowCompatibleWithAdId({ ad_ids: [CTWA] }, "12a34") === false
);
check("9. normalizeAdId('12a') → null", normalizeAdId("12a") === null);

// --- 10. Ad ID muy largo como string ---
check(
  "10. Ad ID largo permanece string y matchea",
  (() => {
    const id = normalizeAdId(LONG_ID);
    return (
      typeof id === "string" &&
      id === LONG_ID &&
      isFlowCompatibleWithAdId({ ad_ids: [LONG_ID] }, LONG_ID) === true
    );
  })()
);

// --- 11. Ad ID ok + país incompatible → Ad ID pasa, country rechaza ---
check(
  "11. Ad ID match + country incompatible",
  (() => {
    const chile = findByCode("CL");
    assert(chile, "catálogo CL");
    const country = {
      mode: MODE_SPECIFIC,
      code: chile.code,
      name: chile.name,
      prefix: chile.prefix,
    };
    const adOk = isFlowCompatibleWithAdId({ ad_ids: [CTWA] }, CTWA);
    const countryOk = isContactCompatibleWithFlowCountry(
      "59171234567", // Bolivia vs Chile
      country
    );
    return adOk === true && countryOk === false;
  })()
);

// --- 12. legacy sin meta_ads ---
check(
  "12. legacy sin meta_ads + undefined ctwa → true",
  isFlowCompatibleWithAdId(undefined, undefined) === true
);
check(
  "12. legacy sin meta_ads + country all sigue ok",
  isContactCompatibleWithFlowCountry("56912345678", countryAll()) === true &&
    isFlowCompatibleWithAdId(undefined, CTWA) === true
);

// --- Hard-match (excepción): distinto de legacy-open ---
check(
  "HM. ad_ids [] + ctwa → hard-match false (compat true)",
  flowHasExplicitAdIdMatch({ ad_ids: [] }, CTWA) === false &&
    isFlowCompatibleWithAdId({ ad_ids: [] }, CTWA) === true
);
check(
  "HM. meta_ads ausente + ctwa → hard-match false",
  flowHasExplicitAdIdMatch(undefined, CTWA) === false
);
check(
  "HM. ad_ids con match → true",
  flowHasExplicitAdIdMatch({ ad_ids: [AD_222] }, AD_222) === true
);
check(
  "HM. ad_ids sin match → false",
  flowHasExplicitAdIdMatch({ ad_ids: [AD_222] }, "999") === false
);
check(
  "HM. sin ctwa → false",
  flowHasExplicitAdIdMatch({ ad_ids: [AD_222] }, undefined) === false
);

// --- Casos A–G (simulación estática del filtro de elegibilidad) ---
function evaluateCandidate({ matched, metaAds, ctwaAdId, contactNumero, country }) {
  if (!matched) return { ok: false, stage: "match" };
  if (!isFlowCompatibleWithAdId(metaAds, ctwaAdId)) {
    return { ok: false, stage: "ad_id" };
  }
  if (contactNumero != null && String(contactNumero).trim() !== "") {
    if (!isContactCompatibleWithFlowCountry(contactNumero, country)) {
      return { ok: false, stage: "country" };
    }
  }
  return { ok: true, stage: "selected" };
}

/**
 * Simula el gate de excepción + filtros posteriores (sin I/O).
 * matchNormal = resultado de matchActivador; si false, se evalúa excepción.
 */
function evaluateWithCtwaException({
  tipoActivador,
  esPrimerMensaje,
  ctwaAdId,
  metaAds,
  candidateFlowId,
  activeSessionFlowId,
  contactNumero,
  country,
  matchNormal,
  sesionReciente = null,
  claveEntrada = null,
  lecturaSesion = null,
}) {
  let matched = Boolean(matchNormal);
  if (!matched) {
    const ex = evaluateCtwaPrimerMensajeException({
      tipoActivador,
      esPrimerMensaje,
      ctwaAdId,
      metaAds,
      candidateFlowId,
      activeSessionFlowId,
      sesionReciente,
      claveEntrada,
      lecturaSesion,
    });
    if (!ex.allow) return { ok: false, stage: "match", reason: ex.reason };
    matched = true;
  }
  return evaluateCandidate({
    matched,
    metaAds,
    ctwaAdId,
    contactNumero,
    country,
  });
}

const USUARIO_A = "11111111-1111-4111-8111-111111111111";
const USUARIO_B = "22222222-2222-4222-8222-222222222222";
const CONN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NUM_A = "5491110000001";
const NUM_B = "5491110000002";
const CLAVE_A = {
  usuarioId: USUARIO_A,
  clienteNumero: NUM_A,
  conexionWhatsappId: CONN_A,
};
const EXPIRA_FUTURO = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const EXPIRA_PASADO = new Date(Date.now() - 60 * 1000).toISOString();

function sesionEntradaA(status, expiresAt, extra = {}) {
  return {
    usuario_id: USUARIO_A,
    cliente_numero: NUM_A,
    conexion_whatsapp_id: CONN_A,
    flujo_id: FLOW_1,
    status,
    expires_at: expiresAt,
    ...extra,
  };
}

check(
  "A) CTWA + Ad ID coincide → elegible",
  evaluateCandidate({
    matched: true,
    metaAds: { ad_ids: [CTWA] },
    ctwaAdId: CTWA,
    contactNumero: null,
  }).ok === true
);

check(
  "B) CTWA + Ad ID NO coincide → continue (ad_id)",
  (() => {
    const r = evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: [OTHER] },
      ctwaAdId: CTWA,
      contactNumero: null,
    });
    return r.ok === false && r.stage === "ad_id";
  })()
);

check(
  "C) flujo con Ad IDs + sin referral → no elegible",
  (() => {
    const r = evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: ["123"] },
      ctwaAdId: undefined,
      contactNumero: null,
    });
    return r.ok === false && r.stage === "ad_id";
  })()
);

check(
  "D) flujo sin Ad IDs → sin filtro",
  evaluateCandidate({
    matched: true,
    metaAds: undefined,
    ctwaAdId: CTWA,
    contactNumero: null,
  }).ok === true &&
    evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: [] },
      ctwaAdId: undefined,
      contactNumero: null,
    }).ok === true
);

check(
  "E) mismo Ad ID varios flujos — gana el primero en orden (sin re-sort)",
  (() => {
    const candidates = [
      { id: "c1", matched: true, metaAds: { ad_ids: [OTHER] } },
      { id: "c2", matched: true, metaAds: { ad_ids: [CTWA] } },
      { id: "c3", matched: true, metaAds: { ad_ids: [CTWA] } },
    ];
    let winner = null;
    for (const c of candidates) {
      const r = evaluateCandidate({
        matched: c.matched,
        metaAds: c.metaAds,
        ctwaAdId: CTWA,
        contactNumero: null,
      });
      if (r.ok) {
        winner = c.id;
        break; // primer válido — no reordenar
      }
    }
    return winner === "c2";
  })()
);

check(
  "F) Ad ID ok + país no → continue country",
  (() => {
    const chile = findByCode("CL");
    const r = evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: [CTWA] },
      ctwaAdId: CTWA,
      contactNumero: "59171234567",
      country: {
        mode: MODE_SPECIFIC,
        code: chile.code,
        name: chile.name,
        prefix: chile.prefix,
      },
    });
    return r.ok === false && r.stage === "country";
  })()
);

check(
  "G) activador no coincide → no llega a Ad ID",
  (() => {
    const r = evaluateCandidate({
      matched: false,
      metaAds: { ad_ids: [CTWA] },
      ctwaAdId: CTWA,
      contactNumero: null,
    });
    return r.ok === false && r.stage === "match";
  })()
);

// ========== Excepción CTWA primer_mensaje (casos 1–12) ==========

check(
  "EX1. sesión A active vigente + anuncio B → no interrumpe",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: NUM_A,
      sesionReciente: sesionEntradaA("active", EXPIRA_FUTURO),
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "sesion_vigente_bloquea_reingreso";
  })()
);

check(
  "EX2. sesión A active vigente + anuncio de otro flujo → no interrumpe",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: NUM_A,
      sesionReciente: sesionEntradaA("active", EXPIRA_FUTURO, {
        flujo_id: FLOW_1,
      }),
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "sesion_vigente_bloquea_reingreso";
  })()
);

check(
  "EX3. sesión A vigente + sin referral → NO excepción",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: undefined,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: NUM_A,
      sesionReciente: sesionEntradaA("active", EXPIRA_FUTURO),
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "no_ctwa_ad_id";
  })()
);

check(
  "EX4. ACTIVE + Ad no coincidente → NO excepción",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: "999",
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: null,
    });
    return r.ok === false && r.reason === "no_explicit_ad_match";
  })()
);

check(
  "EX5. ACTIVE + Flujo2 ad_ids=[] → NO excepción",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: null,
    });
    return r.ok === false && r.reason === "no_explicit_ad_match";
  })()
);

check(
  "EX6. palabra_unica → excepción no aplica (match propio)",
  (() => {
    const act = {
      tipo_activador: TIPOS.PALABRA_UNICA,
      frase: "hola",
      coincidencia: "contiene",
    };
    const m = matchActivador("hola mundo", act, { esPrimerMensaje: false });
    const ex = evaluateCtwaPrimerMensajeException({
      tipoActivador: TIPOS.PALABRA_UNICA,
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
    });
    return m.matched === true && ex.allow === false && ex.reason === "not_primer_mensaje";
  })()
);

check(
  "EX7. cualquier_mensaje → excepción no aplica",
  (() => {
    const act = { tipo_activador: TIPOS.CUALQUIER, frase: "*" };
    const m = matchActivador("cualquier texto", act, { esPrimerMensaje: false });
    const ex = evaluateCtwaPrimerMensajeException({
      tipoActivador: TIPOS.CUALQUIER,
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
    });
    return m.matched === true && ex.allow === false;
  })()
);

check(
  "EX8. country incompatible → no entra tras excepción",
  (() => {
    const chile = findByCode("CL");
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      contactNumero: "59171234567",
      country: {
        mode: MODE_SPECIFIC,
        code: chile.code,
        name: chile.name,
        prefix: chile.prefix,
      },
    });
    return r.ok === false && r.stage === "country";
  })()
);

check(
  "EX9. mismo flujo ACTIVE + mismo Ad → NO reinicia",
  (() => {
    const r = evaluateCtwaPrimerMensajeException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_1,
      activeSessionFlowId: FLOW_1,
    });
    return r.allow === false && r.reason === "same_active_flow";
  })()
);

check(
  "EX10. finished con expires_at futuro + anuncio B → no interrumpe",
  (() => {
    const sesion = sesionEntradaA("finished", EXPIRA_FUTURO);
    assert(sesionBloqueaReingreso(sesion) === true, "finished vigente bloquea");
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: null,
      matchNormal: false,
      contactNumero: NUM_A,
      sesionReciente: sesion,
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "sesion_vigente_bloquea_reingreso";
  })()
);

check(
  "EX11. Ad duplicado entre dos flujos → respeta sort (primero gana)",
  (() => {
    const ordenados = sortActivadores([
      {
        id: "a-late",
        flujo_id: "flow-late",
        tipo_activador: TIPOS.PRIMER_MENSAJE,
        prioridad: 0,
        frase: "",
      },
      {
        id: "a-early",
        flujo_id: "flow-early",
        tipo_activador: TIPOS.PRIMER_MENSAJE,
        prioridad: 10,
        frase: "",
      },
    ]);
    assert(ordenados[0].id === "a-early", "sort prioridad");

    let winner = null;
    for (const a of ordenados) {
      const r = evaluateWithCtwaException({
        tipoActivador: TIPOS.PRIMER_MENSAJE,
        esPrimerMensaje: false,
        ctwaAdId: AD_222,
        metaAds: { ad_ids: [AD_222] },
        candidateFlowId: a.flujo_id,
        activeSessionFlowId: FLOW_1,
        matchNormal: false,
        contactNumero: null,
      });
      if (r.ok) {
        winner = a.flujo_id;
        break;
      }
    }
    return winner === "flow-early";
  })()
);

check(
  "EX12. legacy sin Ad IDs + CTWA + sesión vigente → NO excepción",
  (() => {
    const r = evaluateCtwaPrimerMensajeException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: undefined,
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
    });
    return r.allow === false && r.reason === "no_explicit_ad_match";
  })()
);

check(
  "EX. esPrimerMensaje true → no usa excepción (match normal)",
  evaluateCtwaPrimerMensajeException({
    tipoActivador: "primer_mensaje",
    esPrimerMensaje: true,
    ctwaAdId: AD_222,
    metaAds: { ad_ids: [AD_222] },
    candidateFlowId: FLOW_2,
    activeSessionFlowId: FLOW_1,
  }).allow === false
);

check(
  "EX. matchActivador primer_mensaje sigue exigiendo esPrimerMensaje",
  matchActivador("hola", { tipo_activador: TIPOS.PRIMER_MENSAJE }, {
    esPrimerMensaje: false,
  }).matched === false &&
    matchActivador("hola", { tipo_activador: TIPOS.PRIMER_MENSAJE }, {
      esPrimerMensaje: true,
    }).matched === true
);

check(
  "P1. sesión A vigente (expires_at null) + anuncio B → A continúa",
  (() => {
    const sesion = sesionEntradaA("active", null);
    assert(sesionBloqueaReingreso(sesion) === true, "sin expires_at sigue vigente");
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      sesionReciente: sesion,
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "sesion_vigente_bloquea_reingreso";
  })()
);

check(
  "P2. sesión A vigente + anuncio sin referral → A continúa",
  (() => {
    const r = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: "   ",
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      sesionReciente: sesionEntradaA("finished", EXPIRA_FUTURO),
      claveEntrada: CLAVE_A,
    });
    return r.ok === false && r.reason === "no_ctwa_ad_id";
  })()
);

check(
  "P3. sesión A vencida por expires_at + anuncio B → B puede iniciar",
  (() => {
    const activeVencida = sesionEntradaA("active", EXPIRA_PASADO);
    const finishedVencida = sesionEntradaA("finished", EXPIRA_PASADO);
    const expired = sesionEntradaA("expired", EXPIRA_PASADO);
    assert(sesionBloqueaReingreso(activeVencida) === false, "active vencida no bloquea");
    assert(sesionBloqueaReingreso(finishedVencida) === false, "finished vencida no bloquea");
    assert(sesionBloqueaReingreso(expired) === false, "status expired no bloquea");

    const porExcepcion = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: FLOW_1,
      matchNormal: false,
      sesionReciente: activeVencida,
      claveEntrada: CLAVE_A,
    });
    const finishedVencidaEntra = evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: null,
      matchNormal: false,
      sesionReciente: finishedVencida,
      claveEntrada: CLAVE_A,
    });
    const porMatchNormal = evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: [AD_222] },
      ctwaAdId: AD_222,
      contactNumero: null,
    });
    const anuncioDistinto = evaluateCandidate({
      matched: true,
      metaAds: { ad_ids: [AD_111] },
      ctwaAdId: AD_222,
      contactNumero: null,
    });
    return (
      porExcepcion.ok === true &&
      porExcepcion.stage === "selected" &&
      finishedVencidaEntra.ok === true &&
      porMatchNormal.ok === true &&
      anuncioDistinto.ok === false &&
      anuncioDistinto.stage === "ad_id"
    );
  })()
);

check(
  "P4. sin sesión bloqueante + anuncio B → comportamiento normal",
  evaluateWithCtwaException({
    tipoActivador: "primer_mensaje",
    esPrimerMensaje: false,
    ctwaAdId: AD_222,
    metaAds: { ad_ids: [AD_222] },
    candidateFlowId: FLOW_2,
    activeSessionFlowId: null,
    matchNormal: false,
    sesionReciente: null,
    claveEntrada: CLAVE_A,
    lecturaSesion: "ausente",
  }).ok === true &&
    evaluateWithCtwaException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: null,
      matchNormal: false,
      sesionReciente: sesionEntradaA("cancelled", EXPIRA_FUTURO),
      claveEntrada: CLAVE_A,
    }).ok === true
);

check(
  "P5. sesión de otro contacto, conexión o usuario no bloquea",
  (() => {
    const base = sesionEntradaA("active", EXPIRA_FUTURO);
    const casos = [
      { ...base, cliente_numero: NUM_B },
      { ...base, conexion_whatsapp_id: CONN_B },
      { ...base, usuario_id: USUARIO_B },
    ];
    return casos.every((sesion) => {
      assert(
        sesionEsDeEstaEntrada(sesion, CLAVE_A) === false,
        "clave distinta no es esta entrada"
      );
      const r = evaluateWithCtwaException({
        tipoActivador: "primer_mensaje",
        esPrimerMensaje: false,
        ctwaAdId: AD_222,
        metaAds: { ad_ids: [AD_222] },
        candidateFlowId: FLOW_2,
        activeSessionFlowId: null,
        matchNormal: false,
        sesionReciente: sesion,
        claveEntrada: CLAVE_A,
      });
      return r.ok === true;
    });
  })()
);

check(
  "P6. pausa e IA conservan el orden y la pausa no enhebra el Ad ID",
  (() => {
    const flowSrc = fs.readFileSync(
      path.join(__dirname, "../services/flowService.js"),
      "utf8"
    );
    const procAt = flowSrc.indexOf("async function procesarMensajeEntrante(");
    const procEnd = flowSrc.indexOf("\nfunction supabaseHeaders", procAt);
    const proc = flowSrc.slice(procAt, procEnd);
    const iPausa = proc.indexOf("manejarGuardPausaBot");
    const iIa = proc.indexOf("reanudarFlujoIAPendiente");
    const iActivador = proc.lastIndexOf("buscarYEjecutarActivador");

    const pausaAt = flowSrc.indexOf("async function buscarActivadorValido(");
    const pausa = flowSrc.slice(pausaAt, pausaAt + 420);
    const sinAdEnPausa = !pausa.includes("ctwaAdId") && !pausa.includes("esPrimerMensaje");

    const sinReferral = evaluateCtwaPrimerMensajeException({
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: undefined,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: null,
      sesionReciente: null,
      claveEntrada: CLAVE_A,
    });

    return (
      iPausa >= 0 &&
      iIa > iPausa &&
      iActivador > iIa &&
      sinAdEnPausa &&
      sinReferral.allow === false &&
      sinReferral.reason === "no_ctwa_ad_id"
    );
  })()
);

check(
  "P7. lectura ausente, encontrada vigente, encontrada vencida y error no se confunden",
  (() => {
    const vigente = sesionEntradaA("active", EXPIRA_FUTURO);
    const vencida = sesionEntradaA("finished", EXPIRA_PASADO);
    const base = {
      tipoActivador: "primer_mensaje",
      esPrimerMensaje: false,
      ctwaAdId: AD_222,
      metaAds: { ad_ids: [AD_222] },
      candidateFlowId: FLOW_2,
      activeSessionFlowId: null,
      matchNormal: false,
      claveEntrada: CLAVE_A,
    };

    const ausente = clasificarLecturaSesion({ ok: true, sesion: null });
    const encontradaVigente = clasificarLecturaSesion({ ok: true, sesion: vigente });
    const encontradaVencida = clasificarLecturaSesion({ ok: true, sesion: vencida });
    const error = clasificarLecturaSesion({ ok: false });
    const raro = clasificarLecturaSesion({ ok: true, sesion: "x" });

    assert(ausente.lecturaSesion === "ausente", "null confirmado es ausencia");
    assert(encontradaVigente.lecturaSesion === "encontrada", "fila vigente");
    assert(encontradaVencida.lecturaSesion === "encontrada", "fila vencida");
    assert(error.lecturaSesion === "indeterminada", "fallo no es ausencia");
    assert(raro.lecturaSesion === "indeterminada", "valor inválido es indeterminado");
    assert(clasificarLecturaSesion(null).lecturaSesion === "indeterminada", "sin resultado");

    const rAusente = evaluateWithCtwaException({
      ...base,
      sesionReciente: ausente.sesionReciente,
      lecturaSesion: ausente.lecturaSesion,
    });
    const rVigente = evaluateWithCtwaException({
      ...base,
      activeSessionFlowId: FLOW_1,
      sesionReciente: encontradaVigente.sesionReciente,
      lecturaSesion: encontradaVigente.lecturaSesion,
    });
    const rVencida = evaluateWithCtwaException({
      ...base,
      sesionReciente: encontradaVencida.sesionReciente,
      lecturaSesion: encontradaVencida.lecturaSesion,
    });
    const rError = evaluateWithCtwaException({
      ...base,
      sesionReciente: error.sesionReciente,
      lecturaSesion: error.lecturaSesion,
    });
    const rMatchNormal = evaluateWithCtwaException({
      ...base,
      matchNormal: true,
      lecturaSesion: "indeterminada",
    });

    const flowSrc = fs.readFileSync(
      path.join(__dirname, "../services/flowService.js"),
      "utf8"
    );
    const fnAt = flowSrc.indexOf("async function resolveLecturaSesion(");
    const fn = flowSrc.slice(fnAt, fnAt + 1200);
    const catchCierra =
      fn.includes("clasificarLecturaSesion({ ok: false })") &&
      fn.includes("!SUPABASE_URL") &&
      fn.indexOf("!SUPABASE_URL") < fn.indexOf("try {") &&
      !fn.includes("cachedLecturaSesion = null");

    return (
      rAusente.ok === true &&
      rVigente.ok === false &&
      rVigente.reason === "sesion_vigente_bloquea_reingreso" &&
      rVencida.ok === true &&
      rError.ok === false &&
      rError.reason === "lectura_sesion_indeterminada" &&
      rMatchNormal.ok === true &&
      rMatchNormal.stage === "selected" &&
      catchCierra
    );
  })()
);

// AD_111 se usa en P3: un anuncio que no está en la lista no inicia el flujo.
void AD_111;

console.log(`\nTodas las pruebas OK (${passed})`);
