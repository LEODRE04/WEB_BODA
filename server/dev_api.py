#!/usr/bin/env python3
"""
Servidor de desarrollo local: sirve el sitio estático (igual que
`python3 -m http.server`) y además simula el backend del RSVP y de la
Lista de regalos en /api/rsvp, con la MISMA forma de datos que va a tener
el Google Apps Script real (ver docs/RSVP-BACKEND.md, docs/REGALOS-BACKEND.md
y docs/apps-script/Code.gs).

Es solo para probar el flujo completo (código de invitado -> precarga ->
confirmar -> editar; elegir un regalo -> subir constancia -> ver el
avance) en tu máquina, antes de desplegar el backend real. No se usa en
producción (GitHub Pages es estático, no corre Python).

Uso:
    cd boda-andre-krisli
    python3 server/dev_api.py [puerto]   # default 5177
"""
import base64
import json
import re
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
GUESTS_FILE_TEST = ROOT / "server" / "invitados.json"
GUESTS_FILE_REAL = ROOT / "server" / "invitados.real.json"  # no está en git — ver .gitignore
RESPONSES_FILE = ROOT / "server" / "respuestas.local.json"
GIFTS_FILE = ROOT / "server" / "regalos.json"
CONTRIBUTIONS_FILE = ROOT / "server" / "aportes.local.json"
APERTURAS_FILE = ROOT / "server" / "aperturas.local.json"  # no está en git — ver .gitignore
# Igual que APORTE_DEPOSITO en docs/apps-script/Code.gs.
APORTE_DEPOSITO = "deposito"
COMPROBANTES_DIR = ROOT / "server" / "comprobantes.local"  # no está en git — ver .gitignore

_lock = threading.Lock()


def load_guests():
    # La lista de prueba va siempre (los códigos de la documentación, como
    # familia-garcia, tienen que funcionar), y si existe invitados.real.json
    # (generado localmente, nunca commiteado) se suma encima.
    guests = {}
    for guests_file in (GUESTS_FILE_TEST, GUESTS_FILE_REAL):
        if guests_file.exists():
            data = json.loads(guests_file.read_text(encoding="utf-8"))
            guests.update({g["codigo"]: g for g in data["invitados"]})
    return guests


def normalizar_codigo(v):
    # Igual que normalizarCodigo en Code.gs.
    return re.sub(r"""[.,;:!?)\]}'"»”]+$""", "", str(v or "").strip().lower())


def load_responses():
    if not RESPONSES_FILE.exists():
        return []
    return json.loads(RESPONSES_FILE.read_text(encoding="utf-8") or "[]")


def save_responses(rows):
    RESPONSES_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def load_aperturas():
    if not APERTURAS_FILE.exists():
        return {}
    return json.loads(APERTURAS_FILE.read_text(encoding="utf-8"))


def registrar_apertura(codigo):
    """Espejo de registrarApertura() en docs/apps-script/Code.gs.

    El sitio llama a este GET en cada carga con ?codigo= (para saber el
    nombre y los pases), así que la apertura se anota acá y el frontend
    no cambia nada. En producción esto son 3 columnas de la pestaña
    Invitados; en local, un JSON que no se sube a git.
    """
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        with _lock:
            datos = load_aperturas()
            fila = datos.get(codigo) or {"abierto_en": ahora, "aperturas": 0}
            fila["ultima_apertura"] = ahora
            fila["aperturas"] = int(fila.get("aperturas", 0)) + 1
            datos[codigo] = fila
            APERTURAS_FILE.write_text(
                json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8"
            )
    except OSError:
        # Telemetría: se pierde el dato, no la invitación. Mismo criterio
        # que el try/catch de registrarApertura() en Code.gs.
        pass


def load_gifts():
    if not GIFTS_FILE.exists():
        return []
    return json.loads(GIFTS_FILE.read_text(encoding="utf-8") or "[]")


def load_contributions():
    if not CONTRIBUTIONS_FILE.exists():
        return []
    return json.loads(CONTRIBUTIONS_FILE.read_text(encoding="utf-8") or "[]")


def save_contributions(rows):
    CONTRIBUTIONS_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


# — panel de administración (espejo de handleAdmin en Code.gs) —
# Claves de prueba fijas; en producción viven en Propiedades del script.
ADMIN_CLAVES = {"prueba-andre": "André", "prueba-krisli": "Krisli"}
ADMIN_EXTRA_FILE = ROOT / "server" / "admin_invitados.local.json"  # telefono/mesa por código
MESAS_FILE = ROOT / "server" / "mesas.local.json"
HISTORIAL_FILE = ROOT / "server" / "historial.local.json"


def _load_json(path, vacio):
    if not path.exists():
        return vacio
    return json.loads(path.read_text(encoding="utf-8") or json.dumps(vacio))


def _save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def registrar_historial(quien, codigo, nombre, accion, antes, despues):
    h = _load_json(HISTORIAL_FILE, [])
    h.append({"fecha": datetime.now(timezone.utc).isoformat(), "quien": quien, "codigo": codigo,
              "nombre": nombre, "accion": accion, "antes": antes, "despues": despues})
    _save_json(HISTORIAL_FILE, h)


def texto_respuesta(r):
    if not r:
        return "sin respuesta"
    if r.get("asistencia") == "si":
        return "sí (%s)" % int(float(r.get("num_asistentes") or 0))
    return "no" if r.get("asistencia") == "no" else "sin respuesta"


def admin_datos(quien):
    extra = _load_json(ADMIN_EXTRA_FILE, {})
    aperturas = load_aperturas()
    respuestas = {r.get("codigo"): r for r in load_responses() if r.get("codigo")}
    invitados = []
    for codigo, g in load_guests().items():
        a = aperturas.get(codigo, {})
        r = respuestas.get(codigo)
        e = extra.get(codigo, {})
        invitados.append({
            "codigo": codigo, "nombre": g["nombre"], "pases": 1 + int(g.get("acompanantes_permitidos", 0)),
            "tipo": g.get("tipo_invitacion", "completa"), "grupo": g.get("grupo", ""),
            "prioridad": "" if g.get("prioridad") is None else str(g.get("prioridad")),
            "telefono": e.get("telefono", ""), "mesa": e.get("mesa", ""),
            "abierto_en": a.get("abierto_en", ""), "ultima_apertura": a.get("ultima_apertura", ""),
            "aperturas": int(a.get("aperturas", 0)),
            "respuesta": {"asistencia": r.get("asistencia", ""), "num_asistentes": int(float(r.get("num_asistentes") or 0)),
                          "enviado_en": r.get("enviado_en", ""), "actualizado_en": r.get("actualizado_en", "")} if r else None,
        })
    aportes = [dict(c, fila=i + 2, estado=c.get("estado", "")) for i, c in enumerate(load_contributions())]
    return {"quien": quien, "invitados": invitados, "mesas": _load_json(MESAS_FILE, []),
            "regalos": gifts_with_totals(), "aportes": aportes,
            "historial": list(reversed(_load_json(HISTORIAL_FILE, [])))[:300],
            "cierre": "2026-11-07T05:00:00.000Z", "urlInvitacion": "http://localhost:5177/"}


def gifts_with_totals():
    totals = {}
    for c in load_contributions():
        if c.get("estado") == "duplicado":
            continue  # igual que sumAportesPorRegalo en Code.gs
        totals[c["regalo_id"]] = totals.get(c["regalo_id"], 0) + float(c.get("monto", 0))
    out = []
    for g in load_gifts():
        out.append(dict(g, recaudado=totals.get(g["id"], 0)))
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("[dev_api]", fmt % args)

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/rsvp":
            qs = parse_qs(parsed.query)
            if (qs.get("tipo") or [""])[0] == "regalos":
                return self._json(200, {"regalos": gifts_with_totals()})
            return self._handle_get_rsvp(parsed)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/rsvp":
            return self._handle_post_rsvp()
        self.send_error(404)

    def _handle_get_rsvp(self, parsed):
        qs = parse_qs(parsed.query)
        codigo = normalizar_codigo((qs.get("codigo") or [""])[0])
        if not codigo:
            return self._json(400, {"error": "falta 'codigo'"})

        guests = load_guests()
        guest = guests.get(codigo)
        if not guest:
            return self._json(200, {"found": False})

        registrar_apertura(codigo)

        with _lock:
            existing = next((r for r in load_responses() if r.get("codigo") == codigo), None)

        return self._json(200, {
            "found": True,
            "nombre": guest["nombre"],
            "acompanantes_permitidos": guest["acompanantes_permitidos"],
            "tipo_invitacion": guest.get("tipo_invitacion", "completa"),
            "respuesta": existing,
        })

    def _handle_post_rsvp(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._json(400, {"error": "JSON inválido"})

        if data.get("tipo") == "aporte":
            return self._handle_aporte(data)
        if data.get("tipo") == "admin":
            return self._handle_admin(data)

        codigo = normalizar_codigo(data.get("codigo"))
        # Igual que Code.gs: sin link personal no se confirma.
        if not codigo:
            return self._json(200, {"error": "Para confirmar necesitas tu link personal de invitación. Escríbenos por WhatsApp y te lo enviamos."})
        if codigo:
            guests = load_guests()
            if codigo not in guests:
                return self._json(400, {"error": "código de invitado no reconocido"})
            # num_asistentes es de solo lectura en el formulario (nombre +
            # cantidad ya vienen fijados por su invitación) — esto es más
            # una red de seguridad que una validación real, por si alguien
            # edita el campo a mano en el navegador.
            esperado = 1 + guests[codigo]["acompanantes_permitidos"]
            try:
                if int(data.get("num_asistentes", esperado)) > esperado:
                    return self._json(400, {"error": "supera los asistentes de tu invitación (%d)" % esperado})
            except (TypeError, ValueError):
                pass

        if not data.get("nombre") or not data.get("asistencia"):
            return self._json(400, {"error": "faltan campos requeridos"})
        # Mismas reglas que doPost en docs/apps-script/Code.gs.
        asistencia = str(data.get("asistencia")).strip()
        if asistencia not in ("si", "no"):
            return self._json(400, {"error": "respuesta de asistencia no válida"})
        nombre = str(data.get("nombre")).strip()[:120]
        try:
            num = int(data.get("num_asistentes"))
        except (TypeError, ValueError):
            num = -1
        if codigo:
            nombre = load_guests()[codigo]["nombre"]
            if num < 0:
                num = (1 + load_guests()[codigo]["acompanantes_permitidos"]) if asistencia == "si" else 0
        elif num < 0:
            num = 1 if asistencia == "si" else 0
        else:
            num = min(num, 10)
        if asistencia == "no":
            num = 0  # igual que Code.gs: quien no viene ocupa 0 lugares
        limpio = {"codigo": codigo, "nombre": nombre, "num_asistentes": str(num), "asistencia": asistencia}
        ahora = datetime.now(timezone.utc).isoformat()

        with _lock:
            rows = load_responses()
            # Sin código solo se reemplazan filas que tampoco tienen código:
            # alguien sin link no puede pisar la respuesta de un invitado.
            if codigo:
                idx = next((i for i, r in enumerate(rows) if r.get("codigo") == codigo), None)
            else:
                idx = next((i for i, r in enumerate(rows) if not r.get("codigo") and r.get("nombre") == nombre), None)
            if idx is not None:
                limpio["enviado_en"] = rows[idx].get("enviado_en", ahora)
                limpio["actualizado_en"] = ahora
                rows[idx] = limpio
            else:
                limpio["enviado_en"] = ahora
                limpio["actualizado_en"] = ""
                rows.append(limpio)
            save_responses(rows)

        return self._json(200, {"ok": True})

    def _handle_admin(self, data):
        quien = ADMIN_CLAVES.get(str(data.get("clave") or ""))
        if not quien:
            return self._json(200, {"error": "clave incorrecta", "noAutorizado": True})
        accion = data.get("accion")
        guests = load_guests()
        with _lock:
            if accion == "datos":
                return self._json(200, admin_datos(quien))
            if accion == "guardarRespuesta":
                codigo = normalizar_codigo(data.get("codigo"))
                g = guests.get(codigo)
                if not g or data.get("asistencia") not in ("si", "no"):
                    return self._json(200, {"error": "datos no válidos"})
                maximo = 1 + int(g.get("acompanantes_permitidos", 0))
                num = 0 if data["asistencia"] == "no" else max(1, min(maximo, int(data.get("num_asistentes") or maximo)))
                rows = load_responses()
                idx = next((i for i, r in enumerate(rows) if r.get("codigo") == codigo), None)
                previa = rows[idx] if idx is not None else None
                ahora = datetime.now(timezone.utc).isoformat()
                nueva = {"codigo": codigo, "nombre": g["nombre"], "num_asistentes": str(num), "asistencia": data["asistencia"],
                         "enviado_en": previa.get("enviado_en", ahora) if previa else ahora, "actualizado_en": ahora if previa else ""}
                if idx is None:
                    rows.append(nueva)
                else:
                    rows[idx] = nueva
                save_responses(rows)
                registrar_historial(quien, codigo, g["nombre"], "cargó la respuesta a mano", texto_respuesta(previa), texto_respuesta(nueva))
                return self._json(200, {"ok": True})
            if accion == "asignarMesa":
                codigo = normalizar_codigo(data.get("codigo"))
                if codigo not in guests:
                    return self._json(200, {"error": "ese invitado no existe"})
                extra = _load_json(ADMIN_EXTRA_FILE, {})
                antes = extra.get(codigo, {}).get("mesa", "")
                extra.setdefault(codigo, {})["mesa"] = str(data.get("mesa") or "")
                _save_json(ADMIN_EXTRA_FILE, extra)
                registrar_historial(quien, codigo, guests[codigo]["nombre"], "asignó mesa", antes or "sin mesa", extra[codigo]["mesa"] or "sin mesa")
                return self._json(200, {"ok": True})
            if accion == "guardarMesas":
                mesas = []
                for m in (data.get("mesas") or [])[:200]:
                    if not str(m.get("id") or "").strip():
                        continue
                    mesas.append({"id": str(m["id"])[:40], "nombre": str(m.get("nombre") or "")[:60],
                                  "forma": "rectangular" if m.get("forma") == "rectangular" else "redonda",
                                  "capacidad": max(1, min(40, int(m.get("capacidad") or 10))),
                                  "x": round(float(m.get("x") or 0)), "y": round(float(m.get("y") or 0))})
                vigentes = {m["id"] for m in mesas}
                extra = _load_json(ADMIN_EXTRA_FILE, {})
                for e in extra.values():
                    if e.get("mesa") and e["mesa"] not in vigentes:
                        e["mesa"] = ""
                _save_json(ADMIN_EXTRA_FILE, extra)
                _save_json(MESAS_FILE, mesas)
                return self._json(200, {"ok": True})
            if accion == "marcarAporte":
                rows = load_contributions()
                i = int(data.get("fila") or 0) - 2
                if i < 0 or i >= len(rows):
                    return self._json(200, {"error": "ese aporte no existe"})
                rows[i]["estado"] = "duplicado" if data.get("estado") == "duplicado" else ""
                save_contributions(rows)
                return self._json(200, {"ok": True})
        return self._json(200, {"error": "acción desconocida"})

    def _handle_aporte(self, data):
        regalo_id = str(data.get("regalo_id") or "").strip()
        nombre = str(data.get("nombre") or "").strip()
        try:
            monto = float(data.get("monto"))
        except (TypeError, ValueError):
            monto = 0

        if not regalo_id:
            return self._json(400, {"error": "falta el regalo"})

        # Mismas validaciones que handleAporte en Code.gs (el aviso de
        # depósito ya no se acepta: es un id que no está en la lista).
        if not nombre:
            return self._json(400, {"error": "falta el nombre"})
        if monto <= 0:
            return self._json(400, {"error": "el monto tiene que ser mayor a 0"})
        precios = {g["id"]: float(g.get("precio") or 0) for g in load_gifts()}
        if regalo_id not in precios:
            return self._json(400, {"error": "ese regalo ya no existe"})
        if precios[regalo_id] > 0 and monto > precios[regalo_id]:
            return self._json(400, {"error": "el aporte no puede ser mayor al precio del regalo (S/ %g)" % precios[regalo_id]})

        comprobante_url = ""
        b64 = data.get("comprobante_base64") or ""
        if len(b64) > 6 * 1024 * 1024:
            return self._json(400, {"error": "la imagen es demasiado pesada"})
        if b64.startswith("data:") and not b64.startswith("data:image/"):
            return self._json(400, {"error": "la constancia tiene que ser una imagen"})
        if b64:
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            try:
                COMPROBANTES_DIR.mkdir(parents=True, exist_ok=True)
                filename = "%s-%s.jpg" % (datetime.now().strftime("%Y%m%d%H%M%S"), uuid.uuid4().hex[:8])
                (COMPROBANTES_DIR / filename).write_bytes(base64.b64decode(b64))
                comprobante_url = "server/comprobantes.local/" + filename
            except Exception:
                # Igual que el Apps Script real: si falla guardar la
                # captura, el aporte se guarda igual, sin el link.
                comprobante_url = ""

        with _lock:
            rows = load_contributions()
            rows.append({
                "regalo_id": regalo_id,
                "nombre": nombre,
                "monto": monto,
                "mensaje": str(data.get("mensaje") or ""),
                "comprobante_url": comprobante_url,
                "fecha": datetime.now(timezone.utc).isoformat(),
            })
            save_contributions(rows)

        return self._json(200, {"ok": True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5177
    if not RESPONSES_FILE.exists():
        save_responses([])
    if not CONTRIBUTIONS_FILE.exists():
        save_contributions([])
    server = ThreadingHTTPServer(("localhost", port), Handler)
    guests = load_guests()
    using_real = GUESTS_FILE_REAL.exists()
    print(f"Sirviendo {ROOT} en http://localhost:{port}  (API mock en /api/rsvp)")
    if using_real:
        print(f"Usando invitados.real.json — {len(guests)} invitados reales (no se sube a git)")
    else:
        print(f"Invitados de prueba: {', '.join(guests.keys())}")
    print("Ctrl+C para detener.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
