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
COMPROBANTES_DIR = ROOT / "server" / "comprobantes.local"  # no está en git — ver .gitignore

_lock = threading.Lock()


def load_guests():
    # Si existe invitados.real.json (generado localmente, nunca commiteado)
    # se usa esa; si no, la lista de prueba de siempre.
    guests_file = GUESTS_FILE_REAL if GUESTS_FILE_REAL.exists() else GUESTS_FILE_TEST
    data = json.loads(guests_file.read_text(encoding="utf-8"))
    return {g["codigo"]: g for g in data["invitados"]}


def load_responses():
    if not RESPONSES_FILE.exists():
        return []
    return json.loads(RESPONSES_FILE.read_text(encoding="utf-8") or "[]")


def save_responses(rows):
    RESPONSES_FILE.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


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


def gifts_with_totals():
    totals = {}
    for c in load_contributions():
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
        codigo = (qs.get("codigo") or [""])[0].strip()
        if not codigo:
            return self._json(400, {"error": "falta 'codigo'"})

        guests = load_guests()
        guest = guests.get(codigo)
        if not guest:
            return self._json(200, {"found": False})

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

        codigo = (data.get("codigo") or "").strip()
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

        with _lock:
            rows = load_responses()
            key = codigo or data.get("nombre")
            idx = next((i for i, r in enumerate(rows) if (r.get("codigo") or r.get("nombre")) == key), None)
            if idx is not None:
                # Reemplaza la fila entera (no la mezcla): si algún campo ya
                # no viaja, debe desaparecer, no quedarse con el valor viejo.
                data["enviado_en"] = rows[idx].get("enviado_en", data.get("enviado_en"))
                data["actualizado_en"] = datetime.now(timezone.utc).isoformat()
                rows[idx] = data
            else:
                rows.append(data)
            save_responses(rows)

        return self._json(200, {"ok": True})

    def _handle_aporte(self, data):
        regalo_id = str(data.get("regalo_id") or "").strip()
        nombre = str(data.get("nombre") or "").strip()
        try:
            monto = float(data.get("monto"))
        except (TypeError, ValueError):
            monto = 0

        if not regalo_id:
            return self._json(400, {"error": "falta el regalo"})
        if not nombre:
            return self._json(400, {"error": "falta el nombre"})
        if monto <= 0:
            return self._json(400, {"error": "el monto tiene que ser mayor a 0"})

        gift_ids = {g["id"] for g in load_gifts()}
        if regalo_id not in gift_ids:
            return self._json(400, {"error": "ese regalo ya no existe"})

        comprobante_url = ""
        b64 = data.get("comprobante_base64")
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
