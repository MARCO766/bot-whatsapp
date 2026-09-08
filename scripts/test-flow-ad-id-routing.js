/**
 * FASE 3 — Elegibilidad por Ad ID (routing).
 * Ejecutar: node scripts/test-flow-ad-id-routing.js
 *
 * Cubre isFlowCompatibleWithAdId + simulación estática del orden
 * match → Ad ID → country (sin harness e2e de resolverActivadorEntrante).
 */
const {
  normalizeAdId,
  normalizeMetaAdsForRead,
  isFlowCompatibleWithAdId,
} = require("../services/flowMetaAdsMeta");
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

console.log(`\nTodas las pruebas OK (${passed})`);
