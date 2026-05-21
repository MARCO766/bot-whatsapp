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


PERSONAJES_DBZ = ["goku", "vegeta", "kid buu", "buu", "dragon ball", "dbz"]
PERSONAJES_PALABRAS = [
    "goku",
    "vegeta",
    "buu",
    "personaje",
    "personajes",
    "muestra",
    "muestras",
    "dragon",
    "papel",
    "figura",
]


def _texto_producto_completo(product: ProductDataIn) -> str:
    return " ".join(
        [
            _campo_producto(product, "includes"),
            _campo_producto(product, "faq"),
            _campo_producto(product, "description"),
            _campo_producto(product, "bonuses"),
        ]
    ).lower()


def _es_incluye_completo(texto: str) -> bool:
    return any(
        k in texto
        for k in [
            "que incluye",
            "que trae",
            "todo incluye",
            "todo trae",
            "que viene",
            "listado",
            "todo el pack",
            "que contiene",
            "incluye todo",
        ]
    )


def _es_confianza(texto: str) -> bool:
    return any(
        k in texto
        for k in [
            "estafa",
            "fraude",
            "engano",
            "desconfianza",
            "desconfio",
            "miedo",
            "confiable",
            "no confio",
            "duda en pagar",
            "duda al pagar",
            "desconfiar",
            "no es estafa",
            "es seguro",
            "seguro pagar",
            "confianza en pagar",
            "miedo a pagar",
        ]
    )


def _es_metodos_pago(texto: str) -> bool:
    if any(
        k in texto
        for k in [
            "como se paga",
            "como pago",
            "formas de pago",
            "forma de pago",
            "medios de pago",
            "medio de pago",
            "metodo de pago",
            "metodos de pago",
            "puedo pagar",
            "como pagar",
            "como puedo pagar",
        ]
    ):
        return True
    if "quiero" in texto and ("qr" in texto or "deposito" in texto):
        return False
    return (
        texto.strip() in ("pago", "pagos", "pagar")
        or (" pago" in f" {texto}" and "precio" not in texto and "bono" not in texto)
    )


def _es_bonos_lista(texto: str) -> bool:
    return any(
        k in texto
        for k in [
            "cuales son los bonos",
            "cuales son los bono",
            "que bonos trae",
            "que bonos incluye",
            "lista de bonos",
            "cuales bonos",
            "nombres de los bonos",
            "que bonos son",
            "cuales bono",
        ]
    )


def _es_bonos_confirmacion(texto: str) -> bool:
    if _es_bonos_lista(texto):
        return False
    return any(
        k in texto
        for k in [
            "bonos llegan",
            "llegan igual",
            "vienen los bonos",
            "bonos incluidos",
            "incluye bonos",
            "incluyen bonos",
            "que bonos llega",
            "viene con bonos",
            "trae bonos",
            "bonos vienen",
        ]
    ) or (
        "bono" in texto
        and any(k in texto for k in ["llegan", "vienen", "igual", "incluido", "incluye", "viene"])
    )


def clasificar_consulta_intent(texto: str) -> str:
    """Clasifica la pregunta del lead (solo consulta, no ruta de pago)."""
    if _es_confianza(texto):
        return "confianza"

    if any(k in texto for k in PERSONAJES_PALABRAS) or any(
        k in texto for k in PERSONAJES_DBZ
    ):
        return "personajes"

    if _es_bonos_lista(texto):
        return "bonos_lista"

    if _es_bonos_confirmacion(texto):
        return "bonos_confirmacion"

    if _es_metodos_pago(texto):
        return "metodos_pago"

    if any(
        k in texto
        for k in ["hijo", "hija", "niño", "nina", "edad", "peque", "chico", "chica", "sirve para", "para niños"]
    ):
        return "ninos"

    if any(
        k in texto
        for k in [
            "acceso",
            "accedo",
            "entrega",
            "descarga",
            "descargar",
            "ingreso",
            "como recibo",
            "como es el acceso",
            "como llega",
            "cuando llega",
        ]
    ):
        return "acceso"

    if any(
        k in texto
        for k in ["precio", "cuesta", "sale", "valor", "cuanto vale", "cuanto cuesta", "costo"]
    ) or texto.strip() in ("precio", "costo", "valor"):
        return "precio"

    if any(k in texto for k in ["garantia", "devolucion", "reembolso"]):
        return "garantia"

    if _es_incluye_completo(texto) or (
        "incluye" in texto and any(k in texto for k in ["todo", "pack", "completo"])
    ):
        return "incluye"

    if any(k in texto for k in ["hola", "buenas", "hey", "saludos"]):
        return "saludo"

    if any(k in texto for k in ["sirve", "funciona", "vale la pena", "me conviene", "bueno para"]):
        return "ninos"

    return "general"


def _acortar_sin_puntos(texto: str, max_len: int = 120) -> str:
    t = (texto or "").strip().rstrip(".")
    if len(t) <= max_len:
        return t
    parte = t[:max_len].rsplit(" ", 1)[0]
    return parte if parte else t[:max_len]


def _limpiar_reply(reply: str) -> str:
    s = str(reply or "")
    s = re.sub(r"\.{2,}", "", s)
    s = re.sub(r"\betc\.?\b", "", s, flags=re.I)
    s = re.sub(r"\sy más\b", "", s, flags=re.I)
    s = re.sub(r"\bmás información\b", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    return s


CARITAS_ROTACION = ["🙂", "😊", "😄", "😌", "🤩", "🥹"]

EMOJI_OPCIONES_INTENT: dict[str, list[str]] = {
    "precio": ["🙂"],
    "metodos_pago": ["😊"],
    "bonos_lista": ["😄"],
    "bonos_confirmacion": ["😄"],
    "confianza": ["🥹", "🙂", "😌"],
    "personajes": ["🤩"],
    "ninos": ["😊"],
    "acceso": ["😌"],
    "saludo": ["😄"],
    "incluye": ["😄"],
    "garantia": ["🙂", "😌"],
    "general": ["🙂"],
}


def _emoji_en_historial(chat_history: list[ChatTurnIn]) -> str:
    for turn in reversed(chat_history or []):
        if normalize_text(turn.role) in ("assistant", "bot", "ia"):
            texto = turn.text or ""
            for e in CARITAS_ROTACION:
                if e in texto:
                    return e
    return ""


def _seleccionar_emoji(intent: str, chat_history: list[ChatTurnIn]) -> str:
    opciones = EMOJI_OPCIONES_INTENT.get(intent, ["🙂"])
    prev = _emoji_en_historial(chat_history)
    for e in opciones:
        if e != prev:
            return e
    if prev in CARITAS_ROTACION:
        idx = (CARITAS_ROTACION.index(prev) + 1) % len(CARITAS_ROTACION)
        return CARITAS_ROTACION[idx]
    return opciones[0]


def _finalizar_reply(msg: str, emoji: str) -> str:
    limpio = _limpiar_reply(msg)
    if emoji and emoji not in limpio:
        return _limpiar_reply(f"{limpio} {emoji}")
    return limpio


def _personajes_detectados(texto: str, product: ProductDataIn) -> list[str]:
    corpus = _texto_producto_completo(product)
    nombres = []
    mapa = [
        ("goku", "Goku"),
        ("vegeta", "Vegeta"),
        ("kid buu", "Kid Buu"),
        ("buu", "Kid Buu"),
    ]
    vistos: set[str] = set()
    for key, label in mapa:
        if (key in texto or key in corpus) and label not in vistos:
            nombres.append(label)
            vistos.add(label)
    return nombres


def _metodos_pago_literal(product: ProductDataIn) -> str:
    raw = _campo_producto(product, "paymentMethods").lower()
    partes: list[str] = []
    if "qr" in raw:
        partes.append("QR")
    if "deposito" in raw or "depósito" in raw or "banco" in raw:
        partes.append("depósito bancario")
    if "transferencia" in raw:
        partes.append("transferencia")
    if "tigo" in raw:
        partes.append("Tigo Money")
    if len(partes) >= 2:
        return f"{partes[0]} o {partes[1]}"
    if partes:
        return partes[0]
    return "QR o depósito bancario"


def _bonos_lista_texto(product: ProductDataIn, emoji: str) -> str:
    bon = _campo_producto(product, "bonuses")
    if bon:
        limpio = bon.replace("\n", ", ").strip().rstrip(".")
        if len(limpio) <= 160:
            return _limpiar_reply(f"Trae varios bonos {emoji} como {limpio}")
    return _limpiar_reply(
        f"Trae varios bonos {emoji} como abecedario 3D, lámparas origami "
        "y personajes gigantes como Goku y Vegeta"
    )


def _resumen_precio_incluye(includes: str, bonuses: str) -> str:
    """Una línea corta para precio, sin volcar todo el catálogo."""
    partes: list[str] = []
    inc = (includes or "").lower()
    if "plantilla" in inc:
        m = re.search(r"\d[\d.]*\s*plantillas?", inc)
        if m:
            partes.append(f"las {m.group()}")
        else:
            partes.append("las plantillas")
    if bonuses or "bono" in inc:
        partes.append("los 6 bonos gratis" if "6" in (bonuses or inc) else "los bonos incluidos")
    if not partes:
        return ""
    if len(partes) == 1:
        return f"Incluye {partes[0]}."
    return f"Incluye {partes[0]} y {partes[1]}."


def _naturalizar_metodos_pago(metodos: str) -> str:
    m = metodos.strip().rstrip(".")
    if not m:
        return ""
    bajo = m.lower()
    if "qr" in bajo and "deposito" in bajo:
        return "puedes pagar por QR o depósito"
    if "qr" in bajo:
        return "puedes pagar por QR"
    if "deposito" in bajo or "transferencia" in bajo:
        return "puedes pagar por depósito o transferencia"
    if "tigo" in bajo:
        return "también aceptamos Tigo Money"
    return _acortar_sin_puntos(f"puedes pagar con {m}", 60)


def _fallback_corto(fallback: str, emoji: str) -> str:
    fb = (fallback or "").strip()
    if fb and len(fb) < 100 and "pack digital ideal" not in fb.lower():
        return _limpiar_reply(fb)
    return _finalizar_reply(
        "No te entendí muy bien ¿quieres saber precio, bonos o formas de pago?",
        emoji,
    )


def _resumen_precio_corto(includes: str, bonuses: str) -> str:
    inc = (includes or "").lower()
    m = re.search(r"\d[\d.]*\s*plantillas?", inc)
    plantillas = m.group() if m else "las plantillas"
    bonos = "los 6 bonos gratis" if "6" in (bonuses or inc) else "los bonos"
    return f"incluye {plantillas} y {bonos}"


def generar_reply_por_intent(
    consulta_intent: str,
    product: ProductDataIn,
    tone: str,
    texto: str,
    fallback: str,
    chat_history: list[ChatTurnIn],
) -> str:
    del tone
    emoji = _seleccionar_emoji(consulta_intent, chat_history)
    print("😀 emoji seleccionado:", emoji)
    fb = _fallback_corto(fallback, emoji)

    if consulta_intent == "confianza":
        reply = _limpiar_reply(
            f"Te entiendo {emoji} hoy en día uno tiene dudas. "
            "Apenas confirmas el pago te enviamos acceso y si necesitas ayuda te guiamos"
        )

    elif consulta_intent == "personajes":
        chars = _personajes_detectados(texto, product)
        if chars:
            lista = ", ".join(chars[:-1]) + " y " + chars[-1] if len(chars) > 1 else chars[0]
            reply = _limpiar_reply(f"Sí {emoji} incluye {lista} para armar en papel")
        else:
            reply = _limpiar_reply(
                f"Sí {emoji} incluye Goku, Vegeta y Kid Buu para armar en papel"
            )

    elif consulta_intent == "bonos_lista":
        reply = _bonos_lista_texto(product, emoji)

    elif consulta_intent == "bonos_confirmacion":
        reply = _limpiar_reply(
            f"Sí {emoji} los bonos vienen incluidos sin costo extra. "
            "Llegan junto con el acceso al pack"
        )

    elif consulta_intent == "metodos_pago":
        met = _metodos_pago_literal(product)
        if "formas de pago" in texto or texto.strip() in ("pago", "pagos"):
            reply = _limpiar_reply(
                f"Tenemos pago por {met} {emoji} ¿cuál prefieres usar?"
            )
        else:
            reply = _limpiar_reply(
                f"Puedes pagar por {met} {emoji} eliges el método que te quede más cómodo"
            )

    elif consulta_intent == "ninos":
        reply = _limpiar_reply(
            f"Sí {emoji} es ideal para niños porque los mantiene entretenidos "
            "y usando su creatividad"
        )

    elif consulta_intent == "acceso":
        acc = _campo_producto(product, "access")
        if acc and len(acc) <= 100:
            reply = _limpiar_reply(
                f"El acceso es inmediato {emoji} apenas confirmas el pago "
                f"{_acortar_sin_puntos(acc, 80)}"
            )
        else:
            reply = _limpiar_reply(
                f"El acceso es inmediato {emoji} apenas confirmas el pago te enviamos todo"
            )

    elif consulta_intent == "precio":
        precio = _campo_producto(product, "price")
        if not precio:
            reply = fb
        else:
            det = _resumen_precio_corto(
                _campo_producto(product, "includes"),
                _campo_producto(product, "bonuses"),
            )
            reply = _limpiar_reply(f"Está en {precio} {emoji} {det}")

    elif consulta_intent == "garantia":
        g = _campo_producto(product, "guarantee")
        reply = (
            _limpiar_reply(f"Tranquilo {emoji} {_acortar_sin_puntos(g, 100)}")
            if g
            else fb
        )

    elif consulta_intent == "incluye":
        inc = _campo_producto(product, "includes")
        bon = _campo_producto(product, "bonuses")
        if inc:
            cuerpo = _acortar_sin_puntos(inc, 120)
            if bon:
                cuerpo += f" y {_acortar_sin_puntos(bon, 60)}"
            reply = _limpiar_reply(f"Incluye {cuerpo} {emoji}")
        else:
            reply = fb

    elif consulta_intent == "saludo":
        reply = _limpiar_reply(
            f"Hola {emoji} dime ¿quieres saber precio, bonos o formas de pago?"
        )

    else:
        faq = _campo_producto(product, "faq")
        reply = fb
        if faq and len(texto) > 4:
            for linea in faq.split("\n"):
                ln = normalize_text(linea)
                if ln and any(p in texto for p in ln.split()[:4] if len(p) > 3):
                    reply = _limpiar_reply(
                        f"Sí {emoji} {_acortar_sin_puntos(linea.strip(), 120)}"
                    )
                    break

    reply = _limpiar_reply(reply)
    print("💬 reply limpio:", reply)
    return reply


def generar_reply_producto(
    message: str,
    product: ProductDataIn,
    tone: str,
    fallback: str,
    chat_history: list[ChatTurnIn],
) -> str:
    del tone
    texto = corregir_texto(normalize_text(message))
    consulta_intent = clasificar_consulta_intent(texto)
    print("🧠 IA PRO intención detectada:", consulta_intent)
    return generar_reply_por_intent(
        consulta_intent, product, tone, texto, fallback, chat_history
    )


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
