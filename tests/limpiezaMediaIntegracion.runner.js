/**
 * Corre la compatibilidad RPC y las integraciones contra PostgreSQL local.
 * Solo abre postgres://postgres@127.0.0.1:5432/postgres.
 * Rechaza cualquier otro host. No hereda URLs de Supabase ni de producción.
 *
 * Ejecutar: node tests/limpiezaMediaIntegracion.runner.js
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { URL_LOCAL, describir } = require("./herramientas/limpiezaMediaPgLocal");

describir(URL_LOCAL);

const env = { ...process.env };
for (const clave of [
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
]) {
  delete env[clave];
}
env.LIMPIEZA_MEDIA_PG_URL = URL_LOCAL;
env.LIMPIEZA_MEDIA_ACTIVA = "false";

const pruebas = [
  ["compatibilidad RPC", "limpiezaMediaRpcCompat.test.js"],
  ["integración PostgreSQL de la marca", "limpiezaMediaMarcaPg.integracion.test.js"],
  ["dos procesos Node.js", "limpiezaMediaProcesos.integracion.test.js"],
  ["concurrencia de vallas", "limpiezaMediaVallaPg.integracion.test.js"],
  ["permisos y RLS", "limpiezaMediaPermisosPg.integracion.test.js"],
];

const resultados = [];
for (const [nombre, archivo] of pruebas) {
  const corrida = spawnSync(process.execPath, [path.join(__dirname, archivo)], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env,
  });
  const codigo = corrida.status == null ? 1 : corrida.status;
  resultados.push({ nombre, codigo });
}

console.log("\nRESULTADOS");
for (const resultado of resultados) {
  const estado = resultado.codigo === 0 ? "APROBADA" : resultado.codigo === 2 ? "NO EJECUTADA" : "FALLIDA";
  console.log(`${estado}  ${resultado.nombre}`);
}

if (resultados.some((resultado) => resultado.codigo === 1)) process.exitCode = 1;
else if (resultados.some((resultado) => resultado.codigo !== 0)) process.exitCode = 2;
