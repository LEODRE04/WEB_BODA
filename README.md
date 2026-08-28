# Boda André & Krisli — prototipo web

Sitio de invitación de boda, en HTML/CSS/JS puro (sin build step). Es la
versión 3 del diseño trabajado en Claude Design (opción **3a** — "estilo
editorial de invitación"), llevada a una página funcional: cuenta regresiva
real, formulario de confirmación (RSVP) que valida y guarda respuestas,
copiar-al-portapapeles para Yape/cuenta bancaria, y diseño responsive
(la maqueta original solo cubría escritorio).

Diseño original: <https://claude.ai/design/p/55459373-7343-4ae2-afbe-6d9a74702b3e>

## Estructura

```
index.html          página completa (una sola página, con anclas por sección)
css/tokens.css       design system "Organic" (colores, tipografías, componentes)
css/site.css         maquetación de la invitación + responsive
js/config.js         TODOS los datos editables: nombres, fecha, cuentas, WhatsApp, apiUrl…
js/site.js           interactividad: nav móvil, cuenta regresiva, copiar, RSVP con backend
img/                 fotos de la pareja
server/dev_api.py    backend de PRUEBA para desarrollo local (ver docs/RSVP-BACKEND.md)
server/invitados.json lista de invitados de prueba que usa server/dev_api.py
docs/FOTOS.md        cómo poner/reemplazar fotos
docs/RSVP-BACKEND.md cómo funciona el RSVP con backend (fase 3) y cómo desplegar el real
docs/apps-script/Code.gs  backend real (Google Apps Script), listo para desplegar
```

## Cómo editar el contenido

Casi todo lo que cambia entre invitación e invitación está en
**`js/config.js`**: fecha y hora, lugar, fecha límite de RSVP, número de
Yape/Plin, cuenta bancaria, WhatsApp de contacto, link a lista de regalos.
Edítalo ahí — no hace falta tocar el HTML para esos datos.

Para textos más largos (bienvenida, itinerario, preguntas frecuentes,
código de vestimenta) edita directamente `index.html`; son secciones claras
y comentadas por bloque.

## Cómo correrlo en local

Para ver solo el diseño (sin RSVP funcional de verdad):

```bash
cd boda-andre-krisli
python3 -m http.server 5173
# abre http://localhost:5173
```

Para probar el RSVP completo (con lista de invitados, límite de
acompañantes, editar respuesta), usa el servidor con la API de prueba en
vez del anterior — ver `docs/RSVP-BACKEND.md`:

```bash
python3 server/dev_api.py
# abre http://localhost:5177/index.html?codigo=familia-garcia
```

## Estado del prototipo (fases)

- ✅ **Fase 1 — local (este entregable):** diseño 3a convertido en página
  real, responsive, con cuenta regresiva, copiar-al-portapapeles y RSVP
  funcional guardando en `localStorage` del navegador.
- ⏭️ **Fase 2 — GitHub:** subir este proyecto a un repositorio (ver abajo)
  y, si se quiere, publicarlo gratis con GitHub Pages mientras no haya
  backend.
- 🔧 **Fase 3 — RSVP con backend real (en curso):** el formulario ya habla
  con una API de verdad (lista de invitados, límite de acompañantes,
  editar respuesta) — probada en local con datos de prueba
  (`server/dev_api.py`). Falta cargar la lista real de invitados y
  desplegar el backend real (Google Apps Script, código ya listo en
  `docs/apps-script/Code.gs`) — ver `docs/RSVP-BACKEND.md`. Mientras tanto,
  en el sitio publicado el formulario sigue guardando en `localStorage`
  automáticamente, sin romperse.

## Subir a GitHub

```bash
cd boda-andre-krisli
git init
git add .
git commit -m "Prototipo v3: invitación editorial funcional"
git branch -M main
git remote add origin <URL_DE_TU_REPO_VACIO_EN_GITHUB>
git push -u origin main
```

Con GitHub Pages activado (Settings → Pages → Deploy from branch → `main`)
el sitio queda accesible públicamente sin backend ni costo, listo para
compartir con los invitados mientras se decide/implementa la fase 3.
