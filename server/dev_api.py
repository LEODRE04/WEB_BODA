#!/usr/bin/env python3
"""
Servidor de desarrollo local: sirve el sitio estático (igual que
`python3 -m http.server`) y además simula el backend del RSVP en /api/rsvp,
con la MISMA forma de datos que va a tener el Google Apps Script real
(ver docs/RSVP-BACKEND.md y docs/apps-script/Code.gs).

Es solo para probar el flujo completo (código de invitado -> precarga ->
confirmar -> editar) en tu máquina, antes de desplegar el backend real.
No se usa en producción (GitHub Pages es estático, no corre Python).

Uso:
    cd boda-andre-krisli
    python3 server/dev_api.py [puerto]   # default 5177
"""
import json
import sys
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent.parent
GUESTS_FILE_TEST = ROOT / "server" / "invitados.json"
GUESTS_FILE_REAL = ROOT / "server" / "invitados.real.json"  # no está en git — ver .gitignore
RESPONSES_FILE = ROOT / "server" / "respuestas.local.json"

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

        codigo = (data.get("codigo") or "").strip()
        if codigo:
            guests = load_guests()
            if codigo not in guests:
                return self._json(400, {"error": "código de invitado no reconocido"})
            allowed = guests[codigo]["acompanantes_permitidos"]
            try:
                if int(data.get("num_acompanantes", 0)) > allowed:
                    return self._json(400, {"error": "supera los acompañantes permitidos (%d)" % allowed})
            except (TypeError, ValueError):
                pass

        if not data.get("nombre") or not data.get("contacto") or not data.get("asistencia"):
            return self._json(400, {"error": "faltan campos requeridos"})

        with _lock:
            rows = load_responses()
            key = codigo or data.get("contacto")
            idx = next((i for i, r in enumerate(rows) if (r.get("codigo") or r.get("contacto")) == key), None)
            if idx is not None:
                # Reemplaza la fila entera (no la mezcla): si un campo ya no
                # viaja (p.ej. "menu" para un invitado solo-ceremonia), debe
                # desaparecer, no quedarse con el valor de la vez anterior.
                data["enviado_en"] = rows[idx].get("enviado_en", data.get("enviado_en"))
                data["actualizado_en"] = datetime.now(timezone.utc).isoformat()
                rows[idx] = data
            else:
                rows.append(data)
            save_responses(rows)

        return self._json(200, {"ok": True})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5177
    if not RESPONSES_FILE.exists():
        save_responses([])
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
