/**
 * Conexión de prueba, solo a PostgreSQL local.
 * No lee SUPABASE_URL ni aplica nada en un host remoto.
 */
const path = require("path");
const firmas = require("./limpiezaMediaFirmas");

const SECRETOS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DIRECT_URL",
  "PGHOST",
  "PGPASSWORD",
];

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);
const URL_LOCAL = "postgres://postgres@127.0.0.1:5432/postgres";

function cortarProduccion() {
  for (const clave of SECRETOS) delete process.env[clave];
  process.env.LIMPIEZA_MEDIA_ACTIVA = "false";
}

function entornoSeguro() {
  const env = { ...process.env };
  for (const clave of SECRETOS) delete env[clave];
  delete env.LIMPIEZA_MEDIA_PG_URL;
  env.LIMPIEZA_MEDIA_ACTIVA = "false";
  return env;
}

function cargarPg() {
  try {
    return require("pg");
  } catch (error) {
    return require(path.join(__dirname, "node_modules/pg"));
  }
}

function identificar(nombre) {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) {
    throw new Error("Identificador rechazado para la base de prueba");
  }
  return nombre;
}

function describir(url) {
  if (/supabase\.co|supabase\.in|supabase\.com|pooler\.supabase/i.test(url)) {
    const error = new Error("La URL menciona un host de Supabase. No se conectó.");
    error.code = "NO_LOCAL";
    throw error;
  }
  let parsed;
  try {
    parsed = new URL(String(url).replace(/^postgres(ql)?:/i, "http:"));
  } catch (error) {
    const fallo = new Error("No se pudo leer el host. No se conectó.");
    fallo.code = "NO_LOCAL";
    throw fallo;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!HOSTS_LOCALES.has(host)) {
    const error = new Error(`El host ${host || "(vacío)"} no es localhost ni 127.0.0.1. No se conectó.`);
    error.code = "NO_LOCAL";
    throw error;
  }
  const puerto = parsed.port || "5432";
  if (puerto !== "5432") {
    const error = new Error(`El puerto ${puerto} no es 5432. No se conectó.`);
    error.code = "NO_LOCAL";
    throw error;
  }
  return { host, puerto, url: String(url) };
}

function conBase(url, base) {
  const parsed = new URL(String(url).replace(/^postgres(ql)?:/i, "http:"));
  parsed.pathname = `/${identificar(base)}`;
  const protocolo = /^postgresql:/i.test(url) ? "postgresql:" : "postgres:";
  return parsed.toString().replace(/^http:/i, protocolo);
}

function sinEjecutar(motivo) {
  return { ejecutable: false, motivo };
}

async function conectar(pg, url) {
  describir(url);
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 1500,
    application_name: "macbot-limpieza-prueba",
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("set statement_timeout = '15s'");
    await client.query("set lock_timeout = '5s'");
  } catch (error) {
    const message = error && error.message;
    const code = error && error.code;
    try { await client.end(); } catch (cierre) { /* no quedó una sesión abierta */ }
    if (error && !error.message) error.message = message || code || "conexión rechazada";
    throw error;
  }
  return client;
}

async function aplicar(client) {
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin;
      end if;
    end
    $$;
  `);
  for (const { archivo, sql } of firmas.leerSql()) {
    try {
      await client.query(sql);
    } catch (error) {
      throw new Error(`${path.basename(archivo)}: ${error.message}`);
    }
  }
}

function comoJson(valor) {
  if (typeof valor === "string") return JSON.parse(valor);
  return valor;
}

async function llamarSql(client, funciones, nombre, body) {
  const firma = funciones.get(nombre);
  if (!firma || !/^limpieza_media_[a-z0-9_]+$/.test(nombre)) {
    throw new Error(`La prueba no llama funciones fuera de las migraciones: ${nombre}`);
  }
  const valores = firma.parametros.map((parametro) => {
    if (!Object.prototype.hasOwnProperty.call(body, parametro.nombre)) {
      throw new Error(`${nombre} no recibió ${parametro.nombre}, leído de la migración`);
    }
    return body[parametro.nombre];
  });
  const marcas = firma.parametros.map((_, indice) => `$${indice + 1}`).join(", ");
  const res = await client.query(`select public.${identificar(nombre)}(${marcas}) as fila`, valores);
  return comoJson(res.rows[0].fila);
}

function clienteSql(client, funciones) {
  return {
    async post(url, body) {
      const texto = String(url);
      if (texto.includes("/storage/") || texto.includes("/mensajes")) {
        throw new Error("La prueba intentó salir de las funciones SQL");
      }
      const nombre = texto.split("/rpc/")[1];
      return { data: await llamarSql(client, funciones, nombre, body || {}) };
    },
    async delete() {
      throw new Error("Storage real prohibido");
    },
  };
}

function opcionesSql(client, funciones, extra = {}) {
  return {
    permitirRed: true,
    cliente: clienteSql(client, funciones),
    url: "http://127.0.0.1:9",
    key: "prueba-local",
    ...extra,
  };
}

async function preparar() {
  let pg;
  try {
    pg = cargarPg();
  } catch (error) {
    return sinEjecutar("El paquete pg no está instalado en tests/herramientas. No se consultó ninguna base.");
  }

  const pedida = process.env.LIMPIEZA_MEDIA_PG_URL || "";
  const candidatas = [pedida || URL_LOCAL];

  let admin = null;
  let urlAdmin = "";
  const fallos = [];
  for (const candidata of candidatas) {
    let host = "local";
    try {
      host = describir(candidata).host;
      admin = await conectar(pg, candidata);
      urlAdmin = candidata;
      break;
    } catch (error) {
      if (error.code === "NO_LOCAL") return sinEjecutar(error.message);
      const detalle = error.message || error.code || "conexión rechazada";
      fallos.push(`${host}: ${detalle}`);
      if (admin) {
        try { await admin.end(); } catch (cierre) { /* la conexión no llegó a abrirse */ }
        admin = null;
      }
    }
  }
  if (!admin) {
    const origen = pedida
      ? "La URL local no aceptó la conexión."
      : "No se pudo abrir 127.0.0.1:5432.";
    return sinEjecutar(`${origen} ${fallos.join("; ")}. No se consultó producción.`);
  }

  try {
    const yo = await admin.query("select current_user as usuario");
    const usuario = yo.rows[0].usuario;
    if (usuario === "anon" || usuario === "authenticated" || usuario === "service_role") {
      await admin.end();
      return sinEjecutar(`La conexión local entró como ${usuario}. Hace falta el rol que administra la base de prueba.`);
    }

    const nombreBase = `macbot_limpieza_it_${process.pid}_${Date.now()}`;
    let client;
    let url;
    try {
      await admin.query(`create database ${identificar(nombreBase)}`);
      url = conBase(urlAdmin, nombreBase);
      client = await conectar(pg, url);
    } catch (error) {
      try {
        await admin.query(`drop database if exists ${identificar(nombreBase)}`);
      } catch (borrado) { /* la base puede no haber llegado a crearse */ }
      await admin.end();
      throw error;
    }

    try {
      await aplicar(client);
    } catch (error) {
      if (nombreBase) {
        try { await client.end(); } catch (cierre) { /* se cierra al descartar la base */ }
        await admin.query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
          [nombreBase]
        );
        await admin.query(`drop database if exists ${identificar(nombreBase)}`);
        await admin.end();
      } else {
        await admin.end();
      }
      throw error;
    }

    const limpiezas = [];
    return {
      ejecutable: true,
      url,
      client,
      funciones: firmas.leerFunciones(),
      tablas: firmas.leerTablas(),
      ejecucion: firmas.leerEjecucion(),
      rastrear(tarea) {
        limpiezas.push(tarea);
      },
      async otroCliente() {
        return conectar(pg, url);
      },
      async cerrar() {
        for (const tarea of limpiezas) {
          try {
            await tarea(client);
          } catch (error) {
            console.error(error);
          }
        }
        try { await client.end(); } catch (error) { /* ya estaba cerrada */ }
        if (nombreBase) {
          try {
            await admin.query(
              "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
              [nombreBase]
            );
            await admin.query(`drop database if exists ${identificar(nombreBase)}`);
          } finally {
            await admin.end();
          }
        }
      },
    };
  } catch (error) {
    if (error.code === "NO_LOCAL") return sinEjecutar(error.message);
    throw error;
  }
}

module.exports = {
  URL_LOCAL,
  llamarSql,
  cargarPg,
  clienteSql,
  conectar,
  cortarProduccion,
  describir,
  entornoSeguro,
  opcionesSql,
  preparar,
};
