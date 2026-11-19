/**
 * Backfill M2 de media_cita. Un lote de 20 por vez.
 * Cada llamada confirma y suelta sus bloqueos antes de la siguiente.
 * Sin --confirmar no abre red, no crea el registro y no llama a Supabase.
 *
 * Cuando se autorice el backfill:
 *   node scripts/limpieza-media-backfill-m2.js --confirmar
 *
 * El 18 de noviembre había 385.427 mensajes sin visitar.
 * 385427 / 20 = 19.271 lotes completos y un resto de 7: 19.272 llamadas.
 * El tope es 22.000. Deja margen para filas bloqueadas y corta un bucle.
 *
 * Se detiene con código 0 solo si la última respuesta trae ok, agotado
 * y pendientes 0. Cualquier error, un cuerpo ilegible, pendientes que
 * suben o que bajan menos que procesados, 22.000 llamadas o cinco
 * respuestas seguidas con filas bloqueadas terminan con código 1.
 * Entre esas cinco respuestas espera 5 segundos. No hay sexta llamada.
 * No borra filas ni objetos y no cambia ELIMINACION_REAL_BLOQUEADA.
 */
const fs = require("fs");
const path = require("path");

const RPC = "limpieza_media_backfill_media_cita";
const LOTE = 20;
const PAUSA_LOTE_MS = 1000;
const PAUSA_BLOQUEO_MS = 5000;
const TOPE_BLOQUEOS_SEGUIDOS = 5;
const TOPE_LLAMADAS = 22000;
const TIMEOUT_MS = 30000;

function crearRegistro(opciones) {
  if (typeof opciones.escribirLinea === "function") {
    return { archivo: null, escribir: opciones.escribirLinea };
  }
  const directorio = opciones.directorio || path.join(process.cwd(), "tmp", "backfill-m2");
  let archivo = null;
  return {
    get archivo() {
      return archivo;
    },
    escribir(texto) {
      if (!archivo) {
        fs.mkdirSync(directorio, { recursive: true });
        const marca = new Date().toISOString().replace(/[:.]/g, "-");
        archivo = path.join(directorio, `backfill-m2-${marca}.jsonl`);
      }
      fs.appendFileSync(archivo, `${texto}\n`, "utf8");
    },
  };
}

function filaRpc(data) {
  if (Array.isArray(data)) {
    if (data.length !== 1) return null;
    return filaRpc(data[0]);
  }
  if (!data || typeof data !== "object") return null;
  return data;
}

function validarLote(fila) {
  if (!fila || fila.ok !== true || fila.motivo !== "lote") return "respuesta_invalida";
  if (!Number.isInteger(fila.procesados) || fila.procesados < 0 || fila.procesados > LOTE) {
    return "respuesta_invalida";
  }
  if (!Number.isInteger(fila.actualizados) || fila.actualizados < 0 || fila.actualizados > fila.procesados) {
    return "respuesta_invalida";
  }
  if (!Number.isInteger(fila.pendientes) || fila.pendientes < 0) return "respuesta_invalida";
  if (typeof fila.agotado !== "boolean") return "respuesta_invalida";
  return null;
}

function clasificar(fila, estado, topes) {
  const estructural = validarLote(fila);
  if (estructural) return { paro: estructural, pausa: 0 };
  if (estado.anterior != null) {
    if (fila.pendientes > estado.anterior) return { paro: "pendientes_aumento", pausa: 0 };
    if (estado.anterior - fila.pendientes < fila.procesados) {
      return { paro: "bajada_insuficiente", pausa: 0 };
    }
  }
  estado.anterior = fila.pendientes;
  if (fila.agotado === true) {
    if (fila.pendientes !== 0) return { paro: "agotado_inconsistente", pausa: 0 };
    estado.bloqueos = 0;
    return { paro: "agotado", pausa: 0 };
  }
  if (fila.procesados === 0) {
    estado.bloqueos += 1;
    if (estado.bloqueos >= topes.bloqueos) return { paro: "filas_bloqueadas", pausa: 0 };
    return { paro: null, pausa: topes.pausaBloqueo };
  }
  estado.bloqueos = 0;
  return { paro: null, pausa: topes.pausaLote };
}

function lineaDe(n, duracion, http, fila, paro) {
  const base = fila && typeof fila === "object" && !Array.isArray(fila) ? fila : {};
  return {
    n,
    ts: new Date().toISOString(),
    duracion_ms: duracion,
    http,
    ok: typeof base.ok === "boolean" ? base.ok : null,
    motivo: typeof base.motivo === "string" ? base.motivo : null,
    procesados: Number.isInteger(base.procesados) ? base.procesados : null,
    actualizados: Number.isInteger(base.actualizados) ? base.actualizados : null,
    pendientes: Number.isInteger(base.pendientes) ? base.pendientes : null,
    agotado: typeof base.agotado === "boolean" ? base.agotado : null,
    paro,
  };
}

function esTimeout(error) {
  const codigo = error && error.code;
  if (codigo === "ECONNABORTED" || codigo === "ETIMEDOUT") return true;
  return /timeout/i.test(String((error && error.message) || ""));
}

function terminar(estado, codigo, motivo) {
  return {
    codigo,
    red: estado.red,
    motivo,
    llamadas: estado.llamadas,
    lineas: estado.lineas,
    archivo: estado.registro ? estado.registro.archivo : null,
  };
}

function publicar(estado, linea) {
  estado.lineas.push(linea);
  const texto = JSON.stringify(linea);
  estado.registro.escribir(texto);
  if (typeof estado.salida === "function") estado.salida(texto);
}

async function ejecutarBackfillM2(opciones = {}) {
  if (opciones.confirmar !== true) {
    return {
      codigo: 0,
      red: false,
      motivo: "sin_confirmar",
      llamadas: 0,
      lineas: [],
      archivo: null,
    };
  }

  const url = String(opciones.url || "").replace(/\/+$/, "");
  const key = opciones.key || "";
  if (!url || !key) {
    return {
      codigo: 1,
      red: false,
      motivo: "sin_supabase",
      llamadas: 0,
      lineas: [],
      archivo: null,
    };
  }
  if (!opciones.cliente || typeof opciones.cliente.post !== "function") {
    return {
      codigo: 1,
      red: false,
      motivo: "sin_cliente",
      llamadas: 0,
      lineas: [],
      archivo: null,
    };
  }

  const topeLlamadas = opciones.topeLlamadas || TOPE_LLAMADAS;
  const topes = {
    bloqueos: opciones.topeBloqueos || TOPE_BLOQUEOS_SEGUIDOS,
    pausaLote: opciones.pausaLoteMs == null ? PAUSA_LOTE_MS : opciones.pausaLoteMs,
    pausaBloqueo: opciones.pausaBloqueoMs == null ? PAUSA_BLOQUEO_MS : opciones.pausaBloqueoMs,
  };
  const dormir = typeof opciones.dormir === "function"
    ? opciones.dormir
    : (ms) => new Promise((resolver) => setTimeout(resolver, ms));
  const estado = {
    red: false,
    llamadas: 0,
    lineas: [],
    anterior: null,
    bloqueos: 0,
    registro: crearRegistro(opciones),
    salida: opciones.salida,
  };
  const ahoraMs = typeof opciones.ahoraMs === "function" ? opciones.ahoraMs : () => Date.now();
  const destino = `${url}/rest/v1/rpc/${RPC}`;
  const pedido = {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    timeout: opciones.timeoutMs || TIMEOUT_MS,
  };

  while (estado.llamadas < topeLlamadas) {
    if (Number.isFinite(opciones.venceEn) && ahoraMs() >= opciones.venceEn) {
      return terminar(estado, 0, "ventana_cerrada");
    }
    estado.llamadas += 1;
    estado.red = true;
    const inicio = Date.now();
    let http = null;
    let fila = null;
    let paroRed = null;
    try {
      const res = await opciones.cliente.post(destino, { p_lote: LOTE }, pedido);
      http = Number.isInteger(res && res.status) ? res.status : null;
      if (http == null || http < 200 || http >= 300) {
        paroRed = "error_http";
      } else {
        fila = filaRpc(res && res.data);
      }
    } catch (error) {
      http = Number.isInteger(error && error.response && error.response.status)
        ? error.response.status
        : null;
      paroRed = esTimeout(error) ? "timeout" : "error_http";
    }

    const duracion = Date.now() - inicio;
    let decision;
    if (paroRed) {
      decision = { paro: paroRed, pausa: 0 };
    } else {
      decision = clasificar(fila, estado, topes);
      if (decision.paro == null && estado.llamadas >= topeLlamadas) {
        decision = { paro: "tope_llamadas", pausa: 0 };
      }
    }

    try {
      publicar(estado, lineaDe(estado.llamadas, duracion, http, fila, decision.paro));
    } catch (error) {
      return terminar(estado, 1, "registro_fallo");
    }

    if (decision.paro) {
      return terminar(estado, decision.paro === "agotado" ? 0 : 1, decision.paro);
    }
    await dormir(decision.pausa);
  }

  return terminar(estado, 1, "tope_llamadas");
}

async function main() {
  require("dotenv").config();
  const confirmar = process.argv.includes("--confirmar");
  if (!confirmar) {
    console.log("No se abrió red. El backfill no se ejecutó.");
    console.log("Cuando se autorice:");
    console.log("node scripts/limpieza-media-backfill-m2.js --confirmar");
    process.exit(0);
  }

  const resultado = await ejecutarBackfillM2({
    confirmar: true,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
    cliente: require("axios"),
    salida(texto) {
      console.log(texto);
    },
  });
  if (resultado.archivo) console.error(`Registro: ${resultado.archivo}`);
  if (resultado.motivo === "sin_supabase") {
    console.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY. No se llamó a Supabase.");
  }
  process.exit(resultado.codigo);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  ejecutarBackfillM2,
  RPC,
  LOTE,
  PAUSA_LOTE_MS,
  PAUSA_BLOQUEO_MS,
  TOPE_BLOQUEOS_SEGUIDOS,
  TOPE_LLAMADAS,
  TIMEOUT_MS,
};
