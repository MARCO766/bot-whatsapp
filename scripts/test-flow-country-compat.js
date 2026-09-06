/**
 * FASE 2.1 — Pruebas aisladas: isContactCompatibleWithFlowCountry
 * Ejecutar: node scripts/test-flow-country-compat.js
 *
 * No toca runtime de mensajes / activadores / lifecycle.
 */
const {
  MODE_ALL,
  MODE_SPECIFIC,
  countryAll,
  findByCode,
  normalizeCountryForRead,
  isContactCompatibleWithFlowCountry,
  isSharedDialPrefixDigits,
  findLongestCatalogPrefixMatch,
} = require("../services/flowCountryMeta");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function countrySpecific(code) {
  const found = findByCode(code);
  assert(found, `catálogo debe tener ${code}`);
  return {
    mode: MODE_SPECIFIC,
    name: found.name,
    code: found.code,
    prefix: found.prefix,
  };
}

let passed = 0;
function check(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log("OK:", name);
}

// --- all / ausente ---
check(
  "all + cualquier número → true",
  isContactCompatibleWithFlowCountry("59171234567", countryAll()) === true
);
check(
  "all (mode) + número → true",
  isContactCompatibleWithFlowCountry("56912345678", { mode: MODE_ALL }) === true
);
check(
  "country null → true",
  isContactCompatibleWithFlowCountry("56912345678", null) === true
);
check(
  "country undefined → true",
  isContactCompatibleWithFlowCountry("56912345678", undefined) === true
);
check(
  "country ausente vía normalizeCountryForRead(null) → true",
  isContactCompatibleWithFlowCountry("5215512345678", normalizeCountryForRead(null)) ===
    true
);

// --- Chile / Bolivia / México / Argentina ---
const chile = countrySpecific("CL");
const bolivia = countrySpecific("BO");
const mexico = countrySpecific("MX");
const argentina = countrySpecific("AR");

check(
  "Chile +56 + número chileno → true",
  isContactCompatibleWithFlowCountry("56912345678", chile) === true
);
check(
  "Chile +56 + Bolivia 591 → false",
  isContactCompatibleWithFlowCountry("59171234567", chile) === false
);
check(
  "Bolivia +591 + número boliviano → true",
  isContactCompatibleWithFlowCountry("59171234567", bolivia) === true
);
check(
  "México +52 + número mexicano → true",
  isContactCompatibleWithFlowCountry("5215512345678", mexico) === true
);
check(
  "Argentina +54 + número argentino → true",
  isContactCompatibleWithFlowCountry("5491112345678", argentina) === true
);

// --- normalización + vs sin + ---
check(
  "prefijo país con + vs número sin +: mismo resultado (CL)",
  isContactCompatibleWithFlowCountry("56912345678", chile) ===
    isContactCompatibleWithFlowCountry("+56912345678", chile)
);
check(
  "número con + y sin + equivalentes (BO)",
  isContactCompatibleWithFlowCountry("+59171234567", bolivia) === true &&
    isContactCompatibleWithFlowCountry("59171234567", bolivia) === true
);
check(
  "prefix mentiroso en payload se ignora (CL con prefix +591) → usa catálogo",
  isContactCompatibleWithFlowCountry("56912345678", {
    mode: MODE_SPECIFIC,
    code: "CL",
    name: "Chile",
    prefix: "+591",
  }) === true
);
check(
  "prefix mentiroso no hace matchear Bolivia como Chile",
  isContactCompatibleWithFlowCountry("59171234567", {
    mode: MODE_SPECIFIC,
    code: "CL",
    name: "Chile",
    prefix: "+591",
  }) === false
);

// --- vacío / malformado ---
check(
  "número vacío → false (specific)",
  isContactCompatibleWithFlowCountry("", chile) === false
);
check(
  "número null → false (specific)",
  isContactCompatibleWithFlowCountry(null, chile) === false
);
check(
  "número solo símbolos → false",
  isContactCompatibleWithFlowCountry("+", chile) === false
);
check(
  "número demasiado corto sin prefijo de catálogo → false",
  isContactCompatibleWithFlowCountry("12", chile) === false
);

// --- país inexistente ---
check(
  "país específico inexistente → false",
  isContactCompatibleWithFlowCountry("56912345678", {
    mode: MODE_SPECIFIC,
    code: "ZZ",
    name: "Inventado",
    prefix: "+999",
  }) === false
);
check(
  "specific sin code → false",
  isContactCompatibleWithFlowCountry("56912345678", {
    mode: MODE_SPECIFIC,
  }) === false
);

// --- longest-prefix: 591 no es Chile ---
check(
  "longest-prefix: 591… no matchea +56 Chile",
  findLongestCatalogPrefixMatch("59171234567")?.prefixDigits === "591"
);
check(
  "México no matchea número argentino",
  isContactCompatibleWithFlowCountry("5491112345678", mexico) === false
);

// --- prefijos compartidos (+1, +590): no afirmar ---
assert(isSharedDialPrefixDigits("1") === true, "+1 debe ser compartido en catálogo");
assert(isSharedDialPrefixDigits("590") === true, "+590 debe ser compartido");
assert(isSharedDialPrefixDigits("56") === false, "+56 Chile debe ser único");

const us = countrySpecific("US");
const ca = countrySpecific("CA");
const gp = countrySpecific("GP");

check(
  "+1 US: número NANP → false (prefijo compartido, no afirmar)",
  isContactCompatibleWithFlowCountry("15551234567", us) === false
);
check(
  "+1 CA: mismo número → false (no afirmar Canadá)",
  isContactCompatibleWithFlowCountry("15551234567", ca) === false
);
check(
  "+590 GP: número +590 → false (compartido GP/BL/MF)",
  isContactCompatibleWithFlowCountry("590690123456", gp) === false
);

console.log("");
console.log(`PASS ${passed} checks`);
console.log("FASE 2.1 helper OK — runtime no cableado");
