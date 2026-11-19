/**
 * Lee las migraciones y el código Node de la limpieza.
 * No contiene una lista escrita a mano de firmas ni de privilegios.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "../..");
const DIR_SQL = path.join(RAIZ, "supabase/migrations");
const DIR_JS = path.join(RAIZ, "services/limpiezaMedia");

function archivosSql() {
  return fs
    .readdirSync(DIR_SQL)
    .filter((nombre) => nombre.endsWith(".sql") && nombre.includes("limpieza_media"))
    .sort()
    .map((nombre) => path.join(DIR_SQL, nombre));
}

function archivosJs() {
  return fs
    .readdirSync(DIR_JS)
    .filter((nombre) => nombre.endsWith(".js"))
    .sort()
    .map((nombre) => path.join(DIR_JS, nombre));
}

function sqlAplicable(texto) {
  return texto.split(/--\s*Rollback manual/i)[0];
}

function leerSql() {
  return archivosSql().map((archivo) => ({
    archivo,
    sql: sqlAplicable(fs.readFileSync(archivo, "utf8")),
  }));
}

function parametros(lista) {
  return lista
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => {
      const encontrado = parte.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
      if (!encontrado) {
        throw new Error(`No se pudo leer el parámetro SQL "${parte}"`);
      }
      return {
        nombre: encontrado[1],
        tipo: encontrado[2].replace(/\s+/g, " ").trim().toLowerCase(),
      };
    });
}

function leerFunciones() {
  const funciones = new Map();
  for (const { sql } of leerSql()) {
    const firma = /create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*returns/gi;
    let encontrado;
    while ((encontrado = firma.exec(sql))) {
      funciones.set(encontrado[1], {
        nombre: encontrado[1],
        parametros: parametros(encontrado[2]),
      });
    }
  }
  return funciones;
}

function leerTablas() {
  const tablas = new Map();
  for (const { sql } of leerSql()) {
    const crear = /create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)\s*\(/gi;
    let tabla;
    while ((tabla = crear.exec(sql))) {
      if (!tablas.has(tabla[1])) tablas.set(tabla[1], { nombre: tabla[1], rls: false, service: [] });
    }
    const rls = /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security\s*;/gi;
    let marcada;
    while ((marcada = rls.exec(sql))) {
      const actual = tablas.get(marcada[1]);
      if (!actual) throw new Error(`RLS sobre una tabla no creada: ${marcada[1]}`);
      actual.rls = true;
    }
    const grant = /grant\s+((?:select|insert|update|delete|truncate|references|trigger)(?:\s*,\s*(?:select|insert|update|delete|truncate|references|trigger))*)\s+on\s+table\s+public\.([a-z0-9_]+)\s+to\s+([a-z0-9_]+)\s*;/gi;
    let permiso;
    while ((permiso = grant.exec(sql))) {
      const actual = tablas.get(permiso[2]);
      if (!actual) throw new Error(`GRANT sobre una tabla no creada: ${permiso[2]}`);
      if (permiso[3] !== "service_role") {
        throw new Error(`GRANT de tabla a un rol distinto de service_role: ${permiso[3]}`);
      }
      const privilegios = permiso[1].split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
      for (const privilegio of privilegios) {
        if (!actual.service.includes(privilegio)) actual.service.push(privilegio);
      }
    }
  }
  return tablas;
}

function leerEjecucion() {
  const funciones = new Map();
  for (const { sql } of leerSql()) {
    const grant = /grant\s+execute\s+on\s+function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s+to\s+([a-z0-9_]+)\s*;/gi;
    let permiso;
    while ((permiso = grant.exec(sql))) {
      const roles = funciones.get(permiso[1]) || [];
      roles.push(permiso[3]);
      funciones.set(permiso[1], roles);
    }
  }
  return funciones;
}

function clavesIds(src) {
  const bloque = src.match(/function\s+ids\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (!bloque) return [];
  const retorno = bloque[0].match(/return\s*\{([\s\S]*?)\};/);
  if (!retorno) return [];
  return [...retorno[1].matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map((item) => item[1]);
}

function clavesDelArgumento(texto, ids) {
  const limpio = texto.trim();
  if (/^ids\s*\(/.test(limpio)) return [...ids];
  const claves = [];
  const piezas = /\.\.\.\s*ids\s*\(|\b(p_[a-z0-9_]+)\s*:/g;
  let pieza;
  while ((pieza = piezas.exec(limpio))) {
    if (pieza[0].startsWith("...")) claves.push(...ids);
    else claves.push(pieza[1]);
  }
  return claves;
}

function leerLlamadas() {
  const llamadas = new Map();
  const literales = [];
  for (const archivo of archivosJs()) {
    const src = fs.readFileSync(archivo, "utf8");
    const ids = clavesIds(src);
    const patrones = [
      /llamarRpc\s*\(\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*"(limpieza_(?:media|flujo)_[a-z0-9_]+)"\s*,\s*(\{[\s\S]*?\})\s*\)/g,
      /(?<!Rpc)llamar\s*\(\s*[^,]+,\s*"(limpieza_(?:media|flujo)_[a-z0-9_]+)"\s*,\s*(\{[\s\S]*?\}|ids\s*\([^)]*\))\s*\)/g,
      /axios\.post\(\s*`[^`]*\/rpc\/(limpieza_(?:media|flujo)_[a-z0-9_]+)`\s*,\s*(\{[\s\S]*?\})\s*,/g,
      /axios\.post\(\s*["'][^"']*\/rpc\/(limpieza_(?:media|flujo)_[a-z0-9_]+)["']\s*,\s*(\{[\s\S]*?\})\s*,/g,
    ];
    for (const patron of patrones) {
      let encontrado;
      while ((encontrado = patron.exec(src))) {
        const claves = clavesDelArgumento(encontrado[2], ids);
        if (!claves.length) {
          throw new Error(`Node llama a ${encontrado[1]} sin argumentos con nombre`);
        }
        const previa = llamadas.get(encontrado[1]);
        if (previa && previa.join("\0") !== claves.join("\0")) {
          throw new Error(`Node envía ${encontrado[1]} con argumentos distintos en dos llamadas`);
        }
        llamadas.set(encontrado[1], claves);
      }
    }
    for (const literal of src.matchAll(/"(limpieza_(?:media|flujo)_[a-z0-9_]+)"/g)) {
      literales.push({ nombre: literal[1], archivo });
    }
  }
  return { llamadas, literales };
}

function compararLlamadas() {
  const funciones = leerFunciones();
  const tablas = leerTablas();
  const { llamadas, literales } = leerLlamadas();
  const errores = [];

  for (const [nombre, funcion] of funciones) {
    const claves = llamadas.get(nombre);
    const esperadas = funcion.parametros.map((parametro) => parametro.nombre);
    if (!claves) {
      errores.push(`La migración define ${nombre}(${esperadas.join(", ")}) y Node no la llama`);
      continue;
    }
    if (claves.join("\0") !== esperadas.join("\0")) {
      errores.push(`${nombre}: Node envía [${claves.join(", ")}] y SQL declara [${esperadas.join(", ")}]`);
    }
  }

  for (const [nombre, claves] of llamadas) {
    if (!funciones.has(nombre)) {
      errores.push(`Node llama a ${nombre}(${claves.join(", ")}) y esa función no está en las migraciones`);
    }
  }

  for (const literal of literales) {
    const esFuncion = funciones.has(literal.nombre);
    const esTabla = tablas.has(literal.nombre);
    if (!esFuncion && !esTabla) {
      errores.push(`${path.basename(literal.archivo)} cita "${literal.nombre}" y no es una función ni una tabla de las migraciones`);
    }
    if (esFuncion && !llamadas.has(literal.nombre)) {
      errores.push(`${path.basename(literal.archivo)} nombra ${literal.nombre} fuera de una llamada con argumentos`);
    }
  }

  return { funciones, tablas, llamadas, errores };
}

module.exports = {
  DIR_JS,
  DIR_SQL,
  archivosJs,
  archivosSql,
  compararLlamadas,
  leerEjecucion,
  leerFunciones,
  leerLlamadas,
  leerSql,
  leerTablas,
  sqlAplicable,
};
