/**
 * Proceso hijo de la prueba de wamid.
 * Solo acepta una URL local ya validada por el padre.
 */
const { describir, conectar, cargarPg } = require("./limpiezaMediaPgLocal");
const { clasificarFalloClaim } = require("../../services/webhookInboundClaim");
const { statusHttpEntrante } = require("../../services/limpiezaMedia/limpiezaMediaEntrante");

function decision(resultado) {
  if (resultado.incierto) {
    return { status: statusHttpEntrante(resultado), bot: false };
  }
  if (resultado.duplicate) {
    return { status: statusHttpEntrante({ duplicado: true, guardado: false }), bot: false };
  }
  if (resultado.claimed === true && resultado.guardado === true) {
    return { status: 200, bot: true };
  }
  return { status: statusHttpEntrante(resultado), bot: false };
}

async function insertar(client, wamid) {
  try {
    const res = await client.query(
      `insert into public.mensajes
         (whatsapp_message_id, cliente_numero, usuario_id, direccion, contenido)
       values ($1, $2, $3, 'entrante', 'hola')
       returning id`,
      [wamid, "591", "u"]
    );
    return {
      claimed: true,
      duplicate: false,
      incierto: false,
      confirmado: true,
      guardado: true,
      id: res.rows[0].id,
    };
  } catch (error) {
    const sintetico = new Error(error.message);
    sintetico.code = error.code;
    if (error.code === "23505") {
      sintetico.response = { status: 409, data: { code: "23505", message: error.message } };
    }
    return clasificarFalloClaim(sintetico);
  }
}

async function reclamar(mensaje) {
  describir(mensaje.pgUrl);
  const pg = cargarPg();
  const client = await conectar(pg, mensaje.pgUrl);
  try {
    if (mensaje.modo === "incierto-tras-insert") {
      const guardado = await insertar(client, mensaje.wamid);
      if (!guardado.claimed) return { ...guardado, ...decision(guardado), pid: process.pid };
      return {
        claimed: true,
        duplicate: false,
        incierto: true,
        confirmado: false,
        guardado: null,
        reason: "claim_incierto",
        fase: "insert",
        recuperacion: false,
        ...decision({ incierto: true, guardado: null }),
        pid: process.pid,
      };
    }
    const resultado = await insertar(client, mensaje.wamid);
    return { ...resultado, ...decision(resultado), pid: process.pid };
  } finally {
    await client.end();
  }
}

process.on("message", (mensaje) => {
  reclamar(mensaje)
    .then((informe) => process.send(informe))
    .catch((error) => process.send({ error: error.message, pid: process.pid }));
});
