"""
MacBot — detector de intención local (solo scoring; Node sigue el flujo).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="MacBot Python IA", version="1.0.0")

CORRECCIONES = {
    "presio": "precio",
    "presios": "precios",
    "kiero": "quiero",
    "qiero": "quiero",
    "depositoo": "deposito",
    "cuantoo": "cuanto",
    "tranferencia": "transferencia",
    "transferecia": "transferencia",
}

ALIAS_PALABRAS = {
    "cuadrito": "qr",
    "cuadro": "qr",
    "codigo": "qr",
    "escanear": "qr",
}


class RouteIn(BaseModel):
    id: str
    name: str
    synonyms: list[str] = Field(default_factory=list)
    priority: int = 50


class DetectIntentRequest(BaseModel):
    message: str = ""
    context: str = ""
    routes: list[RouteIn] = Field(default_factory=list)
    threshold: int = 40


class DetectIntentResponse(BaseModel):
    intent: str = ""
    score: int = 0
    route_id: str | None = None
    matched: bool = False


class ProductDataIn(BaseModel):
    name: str = ""
    description: str = ""
    price: str = ""
    includes: str = ""
    bonuses: str = ""
    guarantee: str = ""
    access: str = ""
    paymentMethods: str = ""
    faq: str = ""


class ChatTurnIn(BaseModel):
    role: str = ""
    text: str = ""


class DetectIntentProRequest(BaseModel):
    message: str = ""
    threshold: int = 40
    routes: list[RouteIn] = Field(default_factory=list)
    productData: ProductDataIn = Field(default_factory=ProductDataIn)
    tone: str = "amable"
    chat_history: list[ChatTurnIn] = Field(default_factory=list)
    fallbackMessage: str = ""
    enabledConversation: bool = True


class DetectIntentProResponse(BaseModel):
    action: str = "reply"
    intent: str = ""
    score: int = 0
    route_id: str | None = None
    reply: str = ""


PROMPT_INTERNO_PRO = (
    "Eres un asesor de ventas premium por WhatsApp. "
    "Suena humano, cercano y natural (2–4 líneas). "
    "Reescribe la info del producto; no copies campos literales. "
    "Usa 1–3 emojis, beneficio + pregunta suave. "
    "Nunca inventes datos fuera del producto. "
    "Rutas/caminos: solo route_id, sin texto."
)


def normalize_text(text: str) -> str:
    s = str(text or "").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(
        r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF]",
        " ",
        s,
        flags=re.UNICODE,
    )
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def corregir_texto(texto_norm: str) -> str:
    if not texto_norm:
        return ""
    partes = []
    for palabra in texto_norm.split():
        p = CORRECCIONES.get(palabra, palabra)
        p = ALIAS_PALABRAS.get(p, p)
        partes.append(p)
    return " ".join(partes)


def score_frase(texto: str, frase: str, nombre_ruta: str) -> int:
    if not frase or not texto:
        return 0
    frase = frase.strip()
    if not frase:
        return 0

    if texto == frase:
        return 60 if frase == normalize_text(nombre_ruta) else 50

    if frase in texto.split() or f" {frase} " in f" {texto} ":
        if frase == normalize_text(nombre_ruta):
            return 60
        return 50

    palabras_frase = frase.split()
    if len(palabras_frase) > 1 and all(p in texto for p in palabras_frase):
        return 45

    for palabra in texto.split():
        if len(palabra) < 3:
            continue
        if palabra in frase or frase in palabra:
            return 20
        if frase.startswith(palabra[:4]) or palabra.startswith(frase[:4]):
            return 20

    return 0


def score_contexto(texto: str, contexto: str) -> int:
    ctx = normalize_text(contexto)
    if not ctx:
        return 0
    bonus = 0
    hints_pago = ["pago", "pagar", "metodo", "forma de pago", "como pago", "prefieres"]
    if any(h in ctx for h in hints_pago):
        if any(w in texto for w in ["qr", "deposito", "banco", "transferencia", "tigo"]):
            bonus += 10
    if normalize_text(ctx) in texto or texto in normalize_text(ctx):
        bonus += 10
    return min(10, bonus)


def score_ruta(texto: str, route: RouteIn, contexto: str) -> int:
    nombre_norm = normalize_text(route.name)
    score = 0

    score = max(score, score_frase(texto, nombre_norm, route.name))

    for syn in route.synonyms:
        syn_norm = normalize_text(syn)
        score = max(score, score_frase(texto, syn_norm, route.name))

    score += score_contexto(texto, contexto)

    prioridad = max(0, min(100, int(route.priority or 0)))
    score += round(prioridad * 0.1)

    return min(100, score)


def detectar_ruta_ganadora(
    message: str, routes: list[RouteIn], threshold: int, context: str = ""
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    normalizado = normalize_text(message)
    corregido = corregir_texto(normalizado)
    ranking: list[dict[str, Any]] = []
    for route in routes:
        if not route.id or not route.name:
            continue
        sc = score_ruta(corregido, route, context)
        ranking.append(
            {
                "id": route.id,
                "name": route.name,
                "score": sc,
                "priority": route.priority,
            }
        )
    ranking.sort(key=lambda x: (-x["score"], -x["priority"]))
    winner = ranking[0] if ranking else None
    if winner and winner["score"] >= threshold:
        return winner, ranking
    return None, ranking


def _campo_producto(product: ProductDataIn, key: str) -> str:
    val = getattr(product, key, "") or ""
    return str(val).strip()


def _apertura_tono(tone: str) -> str:
    t = normalize_text(tone)
    if t == "vendedor":
        return "¡Claro! "
    if t == "premium":
        return ""
    if t == "tecnico":
        return ""
    if t == "agresivo":
        return "¡Mira! "
    return "😊 "


def _pregunta_suave(clave: str, texto: str, nombre: str) -> str:
    t = normalize_text(texto)
    if clave == "precio":
        if any(w in t for w in ["hijo", "niño", "nina", "regalo", "regalar"]):
            return "¿Te ayudo con el acceso cuando quieras?"
        return "¿Es para ti o para regalar?"
    if clave == "incluye":
        return "¿Quieres que te cuente cómo recibirlo?"
    if clave == "pago":
        return "¿Con cuál método te queda más cómodo?"
    if clave == "acceso":
        return "¿Ya tienes claro cómo descargarlo o te guío?"
    if clave == "confianza":
        return "¿Te cuento cómo es el acceso después del pago?"
    if clave == "sirve":
        return "¿Para quién lo estás pensando?"
    if clave == "general":
        return f"¿Qué te gustaría saber de {nombre}?"
    return "¿En qué más te ayudo?"


def _frase_incluye_natural(includes: str, bonuses: str) -> str:
    partes: list[str] = []
    if includes:
        inc = includes.strip().rstrip(".")
        if inc:
            partes.append(f"incluye {inc}")
    if bonuses:
        bon = bonuses.strip().rstrip(".")
        if bon:
            if partes:
                partes.append(f"además {bon}")
            else:
                partes.append(f"trae {bon}")
    if not partes:
        return ""
    return " e ".join(partes)


def _beneficio_desde_descripcion(desc: str) -> str:
    if not desc:
        return ""
    d = desc.strip()
    if len(d) <= 90:
        return f"La verdad {d[0].lower() + d[1:]}" if d else ""
    corto = d.split(".")[0].strip()
    if len(corto) > 100:
        corto = corto[:97] + "..."
    if corto:
        return f"La verdad {corto[0].lower() + corto[1:]}"
    return ""


def _naturalizar_metodos_pago(metodos: str) -> str:
    m = metodos.strip().rstrip(".")
    if not m:
        return ""
    bajo = m.lower()
    if "qr" in bajo and "deposito" in bajo:
        return "puedes pagar por QR o depósito bancario sin problema"
    if "qr" in bajo:
        return "puedes pagar por QR sin problema"
    if "deposito" in bajo or "transferencia" in bajo:
        return "puedes pagar por depósito o transferencia"
    if "tigo" in bajo:
        return "también puedes usar Tigo Money"
    return f"puedes pagar así: {m}"


def _fallback_conversacional(fallback: str) -> str:
    fb = (fallback or "").strip()
    if fb and len(fb.split()) > 3:
        return fb
    return (
        "Cuéntame un poquito más 😊 ¿Te interesa el precio, qué incluye o cómo pagar?"
    )


def _reply_precio(product: ProductDataIn, tone: str, texto: str) -> str | None:
    precio = _campo_producto(product, "price")
    if not precio:
        return None
    nombre = _campo_producto(product, "name") or "este pack"
    inc = _frase_incluye_natural(
        _campo_producto(product, "includes"),
        _campo_producto(product, "bonuses"),
    )
    benef = _beneficio_desde_descripcion(_campo_producto(product, "description"))
    abrir = _apertura_tono(tone)
    cuerpo = f"Cuesta solo {precio}"
    if inc:
        cuerpo += f" e {inc}"
    elif nombre:
        cuerpo += f" por {nombre}"
    if benef:
        cuerpo += f". {benef}"
    pregunta = _pregunta_suave("precio", texto, nombre)
    return f"{abrir}{cuerpo}. {pregunta}"


def _reply_incluye(product: ProductDataIn, tone: str, texto: str) -> str | None:
    inc = _frase_incluye_natural(
        _campo_producto(product, "includes"),
        _campo_producto(product, "bonuses"),
    )
    if not inc:
        return None
    abrir = _apertura_tono(tone) or "Te cuento 😊 "
    benef = _beneficio_desde_descripcion(_campo_producto(product, "description"))
    cuerpo = f"Va bastante completo: {inc.capitalize()}"
    if benef and "verdad" not in benef.lower():
        cuerpo += f". {benef}"
    pregunta = _pregunta_suave("incluye", texto, _campo_producto(product, "name"))
    return f"{abrir}{cuerpo} {pregunta}"


def _reply_confianza(product: ProductDataIn, tone: str, texto: str) -> str:
    abrir = "Te entiendo 😊 " if normalize_text(tone) != "agresivo" else "Tranquilo — "
    acceso = _campo_producto(product, "access")
    garantia = _campo_producto(product, "guarantee")
    cuerpo = (
        "hoy en día uno duda bastante, y es normal. "
        "Es un producto digital y apenas se confirma el pago te enviamos acceso inmediato"
    )
    if acceso:
        cuerpo += f" ({acceso.rstrip('.')})"
    cuerpo += "."
    if garantia:
        cuerpo += f" Además {garantia.rstrip('.')}."
    else:
        cuerpo += " Si necesitas ayuda para descargarlo, te guiamos paso a paso."
    pregunta = _pregunta_suave("confianza", texto, _campo_producto(product, "name"))
    return f"{abrir}{cuerpo} {pregunta}"


def _reply_sirve(product: ProductDataIn, tone: str, texto: str) -> str | None:
    desc = _campo_producto(product, "description")
    nombre = _campo_producto(product, "name") or "este material"
    abrir = _apertura_tono(tone) or "Claro 😊 "
    if any(w in texto for w in ["estafa", "fraude", "engaño", "confianza", "seguro", "real"]):
        return _reply_confianza(product, tone, texto)
    if desc:
        cuerpo = f"Sí, {nombre} está pensado para eso. {desc}"
        if len(cuerpo) > 220:
            cuerpo = f"Sí, encaja muy bien para lo que buscas. {desc.split('.')[0]}."
    else:
        cuerpo = f"Sí, muchos clientes lo usan justo para eso con {nombre}."
    pregunta = _pregunta_suave("sirve", texto, nombre)
    return f"{abrir}{cuerpo} {pregunta}"


def _reply_pago(product: ProductDataIn, tone: str, texto: str) -> str | None:
    metodos = _naturalizar_metodos_pago(_campo_producto(product, "paymentMethods"))
    if not metodos:
        return None
    abrir = _apertura_tono(tone)
    if not abrir.strip():
        abrir = "Sí 😊 "
    acceso = _campo_producto(product, "access")
    cuerpo = f"{metodos.capitalize()}"
    if acceso:
        cuerpo += f". Apenas confirmes el pago {acceso.rstrip('.').lower()}"
    else:
        cuerpo += ". Apenas confirmes el pago te enviamos acceso al toque 🚀"
    pregunta = _pregunta_suave("pago", texto, _campo_producto(product, "name"))
    return f"{abrir}{cuerpo} {pregunta}"


def _reply_acceso(product: ProductDataIn, tone: str, texto: str) -> str | None:
    acceso = _campo_producto(product, "access")
    if not acceso:
        return None
    abrir = _apertura_tono(tone) or "Perfecto 😊 "
    cuerpo = f"El acceso es súper simple: {acceso.rstrip('.')}"
    pregunta = _pregunta_suave("acceso", texto, _campo_producto(product, "name"))
    return f"{abrir}{cuerpo} {pregunta}"


def _reply_garantia(product: ProductDataIn, tone: str, texto: str) -> str | None:
    g = _campo_producto(product, "guarantee")
    if not g:
        return None
    abrir = _apertura_tono(tone) or "Tranquilo 😊 "
    return f"{abrir}Sobre la garantía: {g.rstrip('.')}. ¿Te ayudo con el pago o el acceso?"


def generar_reply_producto(
    message: str,
    product: ProductDataIn,
    tone: str,
    fallback: str,
    chat_history: list[ChatTurnIn],
) -> str:
    texto = corregir_texto(normalize_text(message))
    nombre = _campo_producto(product, "name") or "el producto"
    fb = _fallback_conversacional(fallback)

    if any(
        k in texto
        for k in [
            "estafa",
            "fraude",
            "engaño",
            "estafador",
            "confianza",
            "seguro",
            "legitimo",
            "legal",
            "real es",
        ]
    ):
        return _reply_confianza(product, tone, texto)

    if any(
        k in texto
        for k in ["sirve", "funciona", "vale la pena", "recomiendas", "bueno para", "me conviene"]
    ):
        r = _reply_sirve(product, tone, texto)
        if r:
            return r

    if any(k in texto for k in ["precio", "cuesta", "sale", "valor", "cuanto", "cuánto", "costo"]):
        r = _reply_precio(product, tone, texto)
        if r:
            return r

    if any(k in texto for k in ["incluye", "inclusiones", "que trae", "que lleva", "bono", "bonos", "viene con"]):
        r = _reply_incluye(product, tone, texto)
        if r:
            return r

    if any(k in texto for k in ["garantia", "garantía", "devolucion", "reembolso"]):
        r = _reply_garantia(product, tone, texto)
        if r:
            return r

    if any(k in texto for k in ["acceso", "accedo", "entrega", "recibo", "descarga", "ingreso", "como recibo"]):
        r = _reply_acceso(product, tone, texto)
        if r:
            return r

    if any(
        k in texto
        for k in [
            "pago",
            "pagar",
            "metodo",
            "método",
            "transferencia",
            "deposito",
            "como pago",
            "forma de pago",
        ]
    ) and "qr" not in texto.split() and "quiero" not in texto:
        r = _reply_pago(product, tone, texto)
        if r:
            return r

    if any(k in texto for k in ["mas info", "más info", "informacion", "información", "detalle", "cuentame", "que es"]):
        desc = _campo_producto(product, "description")
        if desc:
            abrir = _apertura_tono(tone) or "Mira 😊 "
            pregunta = _pregunta_suave("general", texto, nombre)
            if len(desc) > 160:
                desc = desc.split(".")[0] + "."
            return f"{abrir}{nombre}: {desc} {pregunta}"

    if any(k in texto for k in ["hola", "buenas", "hey", "saludos", "buen dia"]):
        desc = _campo_producto(product, "description")
        abrir = "Hola 😊 " if normalize_text(tone) != "tecnico" else "Hola, "
        if desc:
            corto = desc.split(".")[0] + "." if "." in desc else desc
            return f"{abrir}qué gusto que escribas. Te cuento: {corto} ¿Qué te gustaría saber primero?"
        return f"{abrir}qué gusto que escribas. ¿Te cuento precio, qué incluye o cómo pagar?"

    faq = _campo_producto(product, "faq")
    if faq and len(texto) > 4:
        for linea in faq.split("\n"):
            ln = normalize_text(linea)
            if ln and any(p in texto for p in ln.split()[:4] if len(p) > 3):
                abrir = _apertura_tono(tone) or "Te leo 😊 "
                return f"{abrir}{linea.strip().rstrip('.')}. ¿Te aclaro algo más?"

    ultimo_bot = ""
    for turn in reversed(chat_history or []):
        if normalize_text(turn.role) in ("assistant", "bot", "ia"):
            ultimo_bot = turn.text or ""
            break
    if ultimo_bot and any(w in normalize_text(ultimo_bot) for w in ["precio", "incluye", "pago"]):
        if any(k in texto for k in ["si", "sí", "ok", "dale", "bueno", "perfecto"]):
            r = _reply_incluye(product, tone, texto) or _reply_acceso(product, tone, texto)
            if r:
                return r

    desc = _campo_producto(product, "description")
    if desc:
        abrir = _apertura_tono(tone) or "Claro 😊 "
        corto = desc.split(".")[0] + "." if "." in desc else desc
        pregunta = _pregunta_suave("general", texto, nombre)
        return f"{abrir}{corto} {pregunta}"

    return fb


@app.get("/health")
def health():
    return {"ok": True, "service": "python-ai"}


@app.post("/detect-intent", response_model=DetectIntentResponse)
def detect_intent(body: DetectIntentRequest) -> DetectIntentResponse:
    message = body.message or ""
    context = body.context or ""
    threshold = max(0, min(100, int(body.threshold or 40)))

    print("📩 mensaje:", message)

    winner, ranking = detectar_ruta_ganadora(message, body.routes, threshold, context)
    print("🎯 ganador:", winner)

    if not winner:
        top = ranking[0] if ranking else None
        return DetectIntentResponse(
            intent=top["name"] if top else "",
            score=top["score"] if top else 0,
            route_id=top["id"] if top else None,
            matched=False,
        )

    return DetectIntentResponse(
        intent=winner["name"],
        score=winner["score"],
        route_id=winner["id"],
        matched=True,
    )


@app.post("/detect-intent-pro", response_model=DetectIntentProResponse)
def detect_intent_pro(body: DetectIntentProRequest) -> DetectIntentProResponse:
    message = body.message or ""
    threshold = max(0, min(100, int(body.threshold or 40)))
    print("🤖 AGENTE IA PRO — mensaje:", message)
    print("📋 prompt interno (fijo):", PROMPT_INTERNO_PRO[:80], "...")

    history_ctx = " ".join(
        (t.text or "") for t in (body.chat_history or [])[-4:]
    )
    winner, ranking = detectar_ruta_ganadora(
        message, body.routes, threshold, history_ctx
    )
    print("🎯 ganador Pro:", winner)

    if winner:
        print("➡️ IA PRO sale por ruta:", winner["id"])
        return DetectIntentProResponse(
            action="route",
            intent=winner["name"],
            score=winner["score"],
            route_id=winner["id"],
            reply="",
        )

    top = ranking[0] if ranking else None
    score_bajo = top["score"] if top else 0

    if not body.enabledConversation:
        fb = (body.fallbackMessage or "").strip() or (
            "No entendí bien 😊 ¿Qué opción prefieres?"
        )
        return DetectIntentProResponse(
            action="reply",
            intent="router",
            score=score_bajo,
            reply=fb,
        )

    reply = generar_reply_producto(
        message,
        body.productData,
        body.tone or "amable",
        body.fallbackMessage or "",
        body.chat_history or [],
    )
    print("💬 IA PRO responde:", reply)
    return DetectIntentProResponse(
        action="reply",
        intent="consulta",
        score=score_bajo,
        reply=reply,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
