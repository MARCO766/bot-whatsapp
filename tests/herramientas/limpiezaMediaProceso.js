/**
 * Arranca un proceso Node aparte para las pruebas de limpieza.
 * El hijo no hereda SUPABASE_URL ni la URL de producción.
 */
const { fork } = require("child_process");
const path = require("path");
const { entornoSeguro } = require("./limpiezaMediaPgLocal");

const TRABAJADOR = path.join(__dirname, "limpiezaMediaProcesoWorker.js");

function abrirTrabajador() {
  const child = fork(TRABAJADOR, [], {
    env: entornoSeguro(),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let salida = "";
  child.stdout.on("data", (chunk) => {
    salida += chunk;
  });
  child.stderr.on("data", (chunk) => {
    salida += chunk;
  });
  const pendientes = [];
  const esperas = [];
  function entregar(mensaje) {
    const espera = esperas.shift();
    if (espera) espera(mensaje);
    else pendientes.push(mensaje);
  }
  child.on("message", entregar);
  child.on("exit", (code, signal) => {
    entregar({ fin: true, terminado: true, code, signal, salida });
  });
  return {
    child,
    texto: () => salida,
    siguiente(ms = 20000) {
      if (pendientes.length) return Promise.resolve(pendientes.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`El proceso no respondió. ${salida}`));
        }, ms);
        esperas.push((mensaje) => {
          clearTimeout(timer);
          resolve(mensaje);
        });
      });
    },
    matar() {
      return new Promise((resolve) => {
        if (child.exitCode != null || child.signalCode != null) {
          resolve();
          return;
        }
        const timer = setTimeout(resolve, 4000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    },
  };
}

module.exports = {
  abrirTrabajador,
};
