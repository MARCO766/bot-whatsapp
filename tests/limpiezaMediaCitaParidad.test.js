/**
 * Paridad del parser SQL con analizarTextoStorage.
 * Solo corre contra PostgreSQL local. No usa SUPABASE_URL.
 * Sin base local no se ejecuta y no se marca como aprobada.
 *
 * Ejecutar: node tests/limpiezaMediaCitaParidad.test.js
 */
const assert = require("assert");
const { preparar } = require("./herramientas/limpiezaMediaPgLocal");
const reglas = require("../services/limpiezaMedia/reglas");

const URL = "https://proj.supabase.co/storage/v1/object/public/archivos/";
const CLAVE = "archivos/whatsapp/u/nota.ogg";
const MARCADORES = [
  ["object/public", "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/u/nota.ogg"],
  ["object/sign", "https://proj.supabase.co/storage/v1/object/sign/archivos/whatsapp/u/nota.ogg?token=abc"],
  ["object/authenticated", "https://proj.supabase.co/storage/v1/object/authenticated/archivos/whatsapp/u/nota.ogg"],
  ["render/image/public", "https://proj.supabase.co/storage/v1/render/image/public/archivos/whatsapp/u/nota.ogg"],
];

const FRASES = [
  "https://proj.supabase.co/storage/v1/object/sign/archivos/whatsapp/u/nota.ogg?token=abc",
  "https://proj.supabase.co/storage/v1/object/public/archivos/whatsapp/u/nota.ogg",
  "https://proj.supabase.co/storage/v1/render/image/public/archivos/whatsapp/u/nota.ogg",
  "https://proj.supabase.co/storage/v1/render/image/sign/archivos/whatsapp-meta/u/a.jpg?token=1",
  "https://proj.supabase.co/storage/v1/render/image/authenticated/archivos/whatsapp/u/nota.ogg",
  "https://proj.supabase.co/storage/v1/object/authenticated/archivos/whatsapp/u/nota.ogg",
  `${URL}whatsapp%2Fu%2Fnota.ogg`,
  `${URL}whatsapp%252Fu%252Fnota.ogg`,
  "object/public/archivos/whatsapp\\/u\\/flujo.webp",
  'object/public/archivos/whatsapp/u/plantilla.webp&quot;,&quot;tipo&quot;',
  'object/public/archivos/whatsapp/u/nota.ogg"resto',
  "object/public/archivos/whatsapp/u/nota.ogg resto",
  "object/public/archivos/whatsapp/u/nota.ogg\tresto",
  `${URL}whatsapp/../../secreto.jpg`,
  "https://proj.supabase.co/storage/v1/object/public/seguimiento-v2-media/u/a.jpg",
  "https://proj.supabase.co/storage/v1/object/sign/rm24h-media/rm24h/test.jpg?token=1",
  "https://cdn.ejemplo/a.jpg",
  "https://proj.supabase.co/storage/v1/object/public/",
  "xobject/public/archivos/whatsapp/u/nota.ogg",
  "9object/sign/archivos/whatsapp/u/nota.ogg",
  "bobject/authenticated/archivos/whatsapp/u/nota.ogg",
  "arender/image/public/archivos/whatsapp/u/nota.ogg",
  "/object/public/archivos/whatsapp/u/nota.ogg",
  "/object/sign/archivos/whatsapp/u/nota.ogg?token=abc",
  "/object/authenticated/archivos/whatsapp/u/nota.ogg",
  "/render/image/public/archivos/whatsapp/u/nota.ogg",
  "object/public/Archivos/whatsapp/u/Nota.ogg",
  "object/public/ARCHIVOS/WHATSAPP/u/a.jpg",
  `${URL}whatsapp/u/nota.ogg ${URL}whatsapp/u/nota.ogg`,
  `${URL}whatsapp/u/nota.ogg ${URL}whatsapp/../../secreto.jpg`,
  `${URL}whatsapp/u/%ZZ.jpg`,
  `${URL}whatsapp/u/%C3%28.jpg`,
  `${URL}whatsapp/u/%20%ZZ.jpg`,
  `${URL}whatsapp/u/nota-é.ogg`,
  "whatsapp/u/nota.ogg",
  "",
  null,
];

function canon(valor) {
  const objetos = Array.isArray(valor && valor.objetos) ? valor.objetos : [];
  return {
    noVerificable: valor && valor.noVerificable === true,
    objetos: objetos.map((objeto) => ({
      bucket: objeto.bucket,
      path: objeto.path,
      clave: objeto.clave,
    })),
  };
}

function noEjecutada(motivo) {
  console.log(`NO EJECUTADA: paridad del parser en ${FRASES.length} frases. ${motivo}`);
  process.exitCode = 2;
}

async function analizar(client, frase) {
  const res = await client.query(
    "select public.limpieza_media_analizar_storage($1) as fila",
    [frase]
  );
  const fila = res.rows[0].fila;
  return canon(typeof fila === "string" ? JSON.parse(fila) : fila);
}

async function escenario(client) {
  for (const frase of FRASES) {
    const esperado = canon(reglas.analizarTextoStorage(frase));
    const recibido = await analizar(client, frase);
    assert.deepStrictEqual(recibido, esperado, JSON.stringify(frase));
  }
  console.log("ok", `el parser SQL repite a JavaScript en ${FRASES.length} frases`);

  for (const [nombre, frase] of MARCADORES) {
    const javascript = reglas.analizarTextoStorage(frase).objetos.map((objeto) => objeto.clave);
    const sql = (await analizar(client, frase)).objetos.map((objeto) => objeto.clave);
    assert.deepStrictEqual(javascript, [CLAVE], nombre);
    assert.deepStrictEqual(sql, [CLAVE], nombre);
    console.log("ok", `${nombre} => ${CLAVE}`);
  }
  console.log(`${1 + MARCADORES.length} pruebas ok`);
}

async function main() {
  const preparado = await preparar();
  if (!preparado.ejecutable) {
    noEjecutada(preparado.motivo);
    return;
  }
  try {
    await escenario(preparado.client);
  } finally {
    await preparado.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
