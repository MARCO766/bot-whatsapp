/**
 * Dry-run de limpieza de multimedia. Solo lee. No borra objetos ni filas.
 * Uso: node scripts/limpieza-media-dry-run.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const reglas = require("../services/limpiezaMedia/reglas");
const {
  crearEstado,
  ejecutarLimpiezaMedia,
} = require("../services/limpiezaMedia/limpiezaMediaService");

function headers() {
  return {
    apikey: process.env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

async function listarPagina(bucket, prefix, offset) {
  const res = await axios.post(
    `${process.env.SUPABASE_URL}/storage/v1/object/list/${bucket}`,
    {
      prefix,
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    },
    { headers: headers(), timeout: 20000 }
  );
  return Array.isArray(res.data) ? res.data : [];
}

async function inventariarOriginales() {
  const carpetas = [""];
  const visitadas = new Set([""]);
  const objetos = [];
  let indice = 0;
  while (indice < carpetas.length) {
    let prefix = carpetas[indice];
    let offset = 0;
    for (;;) {
      let items = await listarPagina(reglas.BUCKET_ORIGINAL_SEGUIMIENTO, prefix, offset);
      if (items.length === 0 && offset === 0 && prefix && !prefix.endsWith("/")) {
        const alterna = await listarPagina(
          reglas.BUCKET_ORIGINAL_SEGUIMIENTO,
          `${prefix}/`,
          0
        );
        if (alterna.length > 0) {
          prefix = `${prefix}/`;
          carpetas[indice] = prefix;
          items = alterna;
        }
      }
      for (const item of items) {
        const nombre = String(item?.name || "").replace(/^\/+/, "");
        if (!nombre || nombre.includes("..")) continue;
        const base = String(prefix || "").replace(/\/+$/, "");
        const ruta = base ? `${base}/${nombre}` : nombre;
        if (reglas.esCarpetaStorage(item)) {
          if (!visitadas.has(ruta)) {
            visitadas.add(ruta);
            carpetas.push(ruta);
          }
          continue;
        }
        const size = Number(item?.metadata?.size);
        objetos.push({
          clave: `${reglas.BUCKET_ORIGINAL_SEGUIMIENTO}/${ruta}`,
          bytes: Number.isFinite(size) && size > 0 ? size : 0,
        });
      }
      if (items.length < 100) break;
      offset += items.length;
    }
    indice += 1;
  }
  return objetos;
}

function recontar(objetos) {
  const porMotivo = {};
  const coberturaSegv2 = {
    revisadas: 0,
    candidatos: 0,
    protegidos: 0,
    ambiguos: 0,
    bytesCandidatos: 0,
  };
  let candidatos = 0;
  let protegidos = 0;
  let ambiguos = 0;
  let bytesLiberables = 0;
  let originales = 0;
  for (const objeto of objetos) {
    porMotivo[objeto.motivo] = (porMotivo[objeto.motivo] || 0) + 1;
    if (objeto.categoria === "candidato") {
      candidatos += 1;
      bytesLiberables += objeto.bytes || 0;
    } else if (objeto.categoria === "protegido") {
      protegidos += 1;
    } else {
      ambiguos += 1;
    }
    if (objeto.motivo === "original_seguimiento_v2") originales += 1;
    if (objeto.segv2) {
      coberturaSegv2.revisadas += 1;
      if (objeto.categoria === "candidato") {
        coberturaSegv2.candidatos += 1;
        coberturaSegv2.bytesCandidatos += objeto.bytes || 0;
      } else if (objeto.categoria === "protegido") coberturaSegv2.protegidos += 1;
      else coberturaSegv2.ambiguos += 1;
    }
  }
  return {
    objetosRevisados: objetos.length,
    candidatos,
    protegidos,
    ambiguos,
    bytesLiberables,
    porMotivo,
    coberturaSegv2,
    originalesSeguimientoV2: originales,
  };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase no configurado");
  }
  const estado = crearEstado();
  let anterior = "";
  let result = null;
  for (let vuelta = 0; vuelta < 8000; vuelta += 1) {
    result = await ejecutarLimpiezaMedia({
      env: { ...process.env, LIMPIEZA_MEDIA_ACTIVA: "true" },
      estado,
      informe: true,
      maxMs: 45000,
      maxPaginas: 25,
      pageSize: 1000,
    });
    const marca = [
      result.fase,
      estado.fuenteIndex,
      estado.offset,
      estado.carpetaIndex,
      estado.listadoOffset,
      result.paginasEnEstaPasada,
    ].join(":");
    console.log("[DRY_RUN]", {
      vuelta,
      fase: result.fase,
      completo: result.completo,
      proteccionIncompleta: result.proteccionIncompleta,
      fuenteIlegible: result.fuenteIlegible,
      paginas: result.paginasEnEstaPasada,
      objetosRevisados: result.objetosRevisados,
      candidatos: result.candidatos,
    });
    if (result.completo || result.proteccionIncompleta) break;
    if (marca === anterior) throw new Error("La pasada no avanzó");
    anterior = marca;
  }

  const originales = await inventariarOriginales();
  const porClave = new Map(result.informe.objetos.map((objeto) => [objeto.clave, objeto]));
  for (const original of originales) {
    const previo = porClave.get(original.clave);
    if (previo) {
      previo.bytes = original.bytes;
      continue;
    }
    porClave.set(original.clave, {
      clave: original.clave,
      bytes: original.bytes,
      motivo: "original_seguimiento_v2",
      motivoTexto: reglas.MOTIVOS.original_seguimiento_v2,
      categoria: "protegido",
      segv2: false,
    });
  }

  const objetos = [...porClave.values()].sort((a, b) => {
    if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
    return a.clave.localeCompare(b.clave);
  });
  const totales = recontar(objetos);
  const informe = {
    modo: "dry-run",
    eliminacionReal: "bloqueada",
    generadoEn: new Date().toISOString(),
    dias: reglas.DIAS_INACTIVIDAD,
    completo: result.completo,
    proteccionIncompleta: result.proteccionIncompleta,
    fuenteIlegible: result.fuenteIlegible,
    fuentesOmitidas: result.fuentesOmitidas,
    hilosConEntrante: result.hilosConEntrante,
    hilosInactivos: result.hilosInactivos,
    referenciasSinObjeto: result.excluidos ? result.excluidos.objeto_ausente : null,
    ...totales,
    objetos,
  };
  if (!result.completo) {
    informe.candidatos = 0;
    informe.bytesLiberables = 0;
    informe.nota =
      "La protección quedó incompleta. No se propone ninguna eliminación.";
  }

  const destino = path.join(__dirname, "..", "tmp", "limpieza-media-dry-run.json");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(informe, null, 2));
  console.log("[DRY_RUN_RESUMEN]", {
    archivo: destino,
    objetosRevisados: informe.objetosRevisados,
    candidatos: informe.candidatos,
    protegidos: informe.protegidos,
    ambiguos: informe.ambiguos,
    bytesLiberables: informe.bytesLiberables,
    originalesSeguimientoV2: informe.originalesSeguimientoV2,
    coberturaSegv2: informe.coberturaSegv2,
    porMotivo: informe.porMotivo,
    completo: informe.completo,
    proteccionIncompleta: informe.proteccionIncompleta,
    fuenteIlegible: informe.fuenteIlegible,
  });
}

main().catch((error) => {
  console.error("[DRY_RUN_ERROR]", error.response?.data || error.message);
  process.exit(1);
});
