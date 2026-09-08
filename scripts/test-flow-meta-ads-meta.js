/**
 * FASE 1 — Pruebas: macbot_meta.meta_ads.ad_ids (persistencia / normalización).
 * Ejecutar: node scripts/test-flow-meta-ads-meta.js
 *
 * No toca runtime de mensajes / activadores / lifecycle / webhook / flowService.
 */
const {
  emptyMetaAds,
  hasPersistedMetaAds,
  normalizeAdId,
  sanitizeAdIdsList,
  normalizeMetaAdsForRead,
  normalizeMetaAdsForWrite,
} = require("../services/flowMetaAdsMeta");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

let passed = 0;
function check(name, cond) {
  assert(cond, name);
  passed += 1;
  console.log("OK:", name);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- 1. Crear flujo sin Ad IDs → válido (ausente / vacío) ---
check(
  "1. meta_ads ausente en read → { ad_ids: [] }",
  deepEqual(normalizeMetaAdsForRead(undefined), { ad_ids: [] })
);
check(
  "1. meta_ads null en read → { ad_ids: [] }",
  deepEqual(normalizeMetaAdsForRead(null), { ad_ids: [] })
);
check(
  "1. write sin Ad IDs (null) → ok vacío",
  (() => {
    const w = normalizeMetaAdsForWrite(null);
    return w.ok && deepEqual(w.value, { ad_ids: [] });
  })()
);
check(
  "1. write { ad_ids: [] } → ok vacío",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: [] });
    return w.ok && deepEqual(w.value, { ad_ids: [] });
  })()
);

// --- 2. Crear con un Ad ID → se guarda ---
check(
  "2. un Ad ID válido se guarda",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: ["120251260803260234"] });
    return w.ok && deepEqual(w.value, { ad_ids: ["120251260803260234"] });
  })()
);

// --- 3. Crear con varios Ad IDs → se guardan ---
check(
  "3. varios Ad IDs se guardan en orden",
  (() => {
    const w = normalizeMetaAdsForWrite({
      ad_ids: ["120251260803260234", "120251260803250234"],
    });
    return (
      w.ok &&
      deepEqual(w.value, {
        ad_ids: ["120251260803260234", "120251260803250234"],
      })
    );
  })()
);

// --- 4. Editar y agregar Ad ID → merge preserva country y demás ---
check(
  "4. hasPersistedMetaAds false en legacy sin meta_ads",
  hasPersistedMetaAds({ country: { mode: "all" }, etiquetas: ["x"] }) === false
);
check(
  "4. hasPersistedMetaAds true cuando existe meta_ads",
  hasPersistedMetaAds({
    country: { mode: "all" },
    meta_ads: { ad_ids: ["1"] },
  }) === true
);
check(
  "4. simulación PATCH merge: country + etiquetas + meta_ads nuevos",
  (() => {
    const rawMeta = {
      country: { mode: "specific", code: "CL", name: "Chile", prefix: "+56" },
      etiquetas: ["vip"],
      campanas: ["c1"],
      estado: "activo",
      carpeta: "ventas_automaticas",
    };
    // Spread preserve (mismo patrón que flujosApi PATCH)
    const nextMeta = { ...rawMeta };
    const adsWrite = normalizeMetaAdsForWrite({
      ad_ids: ["120251260803260234"],
    });
    assert(adsWrite.ok, "write ok");
    nextMeta.meta_ads = adsWrite.value;
    return (
      nextMeta.country?.code === "CL" &&
      deepEqual(nextMeta.etiquetas, ["vip"]) &&
      deepEqual(nextMeta.campanas, ["c1"]) &&
      nextMeta.estado === "activo" &&
      nextMeta.carpeta === "ventas_automaticas" &&
      deepEqual(nextMeta.meta_ads, { ad_ids: ["120251260803260234"] })
    );
  })()
);

// --- 5. Editar y eliminar Ad ID → funciona ---
check(
  "5. eliminar todos los Ad IDs → { ad_ids: [] }",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: [] });
    return w.ok && deepEqual(w.value, emptyMetaAds());
  })()
);
check(
  "5. quitar uno de dos → queda el restante",
  (() => {
    const w = normalizeMetaAdsForWrite({
      ad_ids: ["120251260803250234"],
    });
    return w.ok && deepEqual(w.value, { ad_ids: ["120251260803250234"] });
  })()
);

// --- 6. IDs duplicados → se eliminan (primera ocurrencia gana) ---
check(
  "6. duplicados se eliminan",
  (() => {
    const w = normalizeMetaAdsForWrite({
      ad_ids: ["111", "222", "111", " 222 "],
    });
    return w.ok && deepEqual(w.value, { ad_ids: ["111", "222"] });
  })()
);
check(
  "6. sanitizeAdIdsList dedupe",
  deepEqual(sanitizeAdIdsList(["9", "9", "8", "9"]), ["9", "8"])
);

// --- 7. ID con letras → no se guarda como válido ---
check(
  "7. letras solas → descartadas",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: ["abc", "12a34"] });
    return w.ok && deepEqual(w.value, { ad_ids: [] });
  })()
);
check(
  "7. mezcla válido + letras → solo dígitos",
  (() => {
    const w = normalizeMetaAdsForWrite({
      ad_ids: ["120251260803260234", "abc", "12x"],
    });
    return w.ok && deepEqual(w.value, { ad_ids: ["120251260803260234"] });
  })()
);
check("7. normalizeAdId('12a') → null", normalizeAdId("12a") === null);
check("7. normalizeAdId(' 99 ') → '99'", normalizeAdId(" 99 ") === "99");

// --- 8. Flujo antiguo sin meta_ads → válido ---
check(
  "8. read de flujo legacy sin meta_ads → vacío válido",
  deepEqual(normalizeMetaAdsForRead(undefined), { ad_ids: [] })
);
check(
  "8. PATCH sin patch.meta_ads no inventa clave (hasPersisted=false)",
  (() => {
    const rawMeta = { country: { mode: "all" }, etiquetas: [] };
    const nextMeta = { ...rawMeta };
    if (false /* patch.meta_ads !== undefined */) {
      /* no-op */
    } else if (hasPersistedMetaAds(rawMeta)) {
      nextMeta.meta_ads = normalizeMetaAdsForRead(rawMeta.meta_ads);
    } else {
      delete nextMeta.meta_ads;
    }
    return nextMeta.meta_ads === undefined && nextMeta.country?.mode === "all";
  })()
);

// --- estructura inválida → rechazo ---
check(
  "write array raíz → error",
  (() => {
    const w = normalizeMetaAdsForWrite(["111"]);
    return !w.ok && typeof w.error === "string";
  })()
);
check(
  "write ad_ids no-array → error",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: "111" });
    return !w.ok;
  })()
);

// --- trim ---
check(
  "trim en IDs",
  (() => {
    const w = normalizeMetaAdsForWrite({ ad_ids: ["  123  ", "\t456\n"] });
    return w.ok && deepEqual(w.value, { ad_ids: ["123", "456"] });
  })()
);

console.log(`\nTodas las pruebas OK (${passed})`);
