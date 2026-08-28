# Fase 3 — RSVP con backend

## Estado: backend de prueba funcionando en local, real aún no desplegado

El formulario de `#rsvp` ya habla con una API real (no solo `localStorage`):

- **En desarrollo local** apunta a `server/dev_api.py` — un servidor Python
  (sin dependencias) que sirve el sitio y simula el backend con una lista
  de invitados de prueba en `server/invitados.json`.
- **En producción (GitHub Pages)** todavía no hay backend real desplegado,
  así que `/api/rsvp` da 404 — el formulario lo detecta y cae solo a
  guardar en `localStorage`, exactamente como en la fase 1. Nada se rompe.
- **El backend real** (cuando decidan desplegarlo) es un Google Apps
  Script sobre un Google Sheet — código listo en `docs/apps-script/Code.gs`.

Los tres hablan el mismo "idioma" (mismo formato de JSON), así que pasar de
uno a otro es cambiar una sola línea en `js/config.js` (`rsvp.apiUrl`) —
nada del HTML/CSS ni del formulario cambia.

## Probarlo en tu máquina ahora mismo

```bash
cd boda-andre-krisli
python3 server/dev_api.py       # sirve todo en http://localhost:5177
```

Invitados de prueba ya cargados en `server/invitados.json` — abre en el navegador:

- `http://localhost:5177/index.html?codigo=lucia-fernandez#rsvp` — permite 1 acompañante
- `http://localhost:5177/index.html?codigo=familia-garcia#rsvp` — permite 2
- `http://localhost:5177/index.html?codigo=carlos-mendoza#rsvp` — permite 0
- `http://localhost:5177/index.html?codigo=diego-torres#rsvp` — permite 1
- `http://localhost:5177/index.html#rsvp` (sin código) — formulario abierto, como antes

Confirma una vez, y vuelve a abrir el mismo link: va a mostrar "Ya habías
confirmado..." con todo precargado para editar. Las respuestas quedan en
`server/respuestas.local.json` (no se sube a git — son datos de prueba).
Para ver qué se guardó: `cat server/respuestas.local.json`.

## Cómo funciona el link personalizado por invitado

Cada invitado entra con `tusitio.com/?codigo=SU-CODIGO`. El frontend
(`js/site.js`):

1. Al cargar, si hay `?codigo=`, le pregunta a la API quién es ese código.
2. Si existe: precarga su nombre, limita el selector de acompañantes al
   número real que le corresponde, y si ya había confirmado antes, rellena
   todo el formulario con su respuesta anterior (para editarla).
3. Si el código no existe, o la API no responde: el formulario sigue
   funcionando abierto (nadie se queda sin poder confirmar).

El campo oculto `codigo` viaja con el formulario para que el backend sepa
a qué invitado actualizar.

## Dos tipos de invitación: solo ceremonia, o ceremonia + recepción

La columna `tipo_invitacion` de cada invitado (`"ceremonia"` o
`"completa"`) cambia la página para esa persona:

- **`"completa"`** (o la celda vacía — es el valor por defecto): ve todo,
  igual que ahora.
- **`"ceremonia"`**: no ve el itinerario de la recepción (cóctel, cena,
  baile, cierre), ni el bloque de ubicación de la recepción en "Cuándo y
  dónde", ni los campos de Menú/Alergias/Canción en el RSVP (tampoco el
  menú de sus acompañantes). El saludo de arriba también dice "...en la
  ceremonia" en vez de "...en la ceremonia y la recepción".

Técnicamente: `js/site.js` agrega la clase `solo-ceremonia` al `<body>`
cuando corresponde, y `css/site.css` oculta con esa clase todo lo marcado
`[data-reception-only]` en el HTML — para agregar o quitar algo de la
versión recortada, es agregar o quitar ese atributo en `index.html`, sin
tocar JS.

La recepción es en un **local distinto** a la iglesia (columna nueva en
"Cuándo y dónde") — cuando tengan el lugar confirmado, ponlo en
`js/config.js` en `venueReception.mapSearchQuery`, igual que se hizo con
`venue.mapSearchQuery` para la ceremonia.

## Desplegar el backend real (Google Sheets + Apps Script)

1. Crea un Google Sheet nuevo. Nómbralo como quieras (p.ej. "Boda André y
   Krisli — RSVP").
2. Crea 2 pestañas con estos encabezados exactos en la fila 1:

   **`Invitados`**
   | código | nombre | acompañantes_permitidos | tipo_invitacion |
   |---|---|---|---|
   | familia-garcia | Familia García | 2 | completa |
   | carlos-mendoza | Carlos Mendoza | 0 | ceremonia |

   **`Respuestas`** (se llena sola — solo pon los encabezados)
   | codigo | nombre | contacto | asistencia | num_acompanantes | menu | acompanante_1_nombre | acompanante_1_menu | acompanante_2_nombre | acompanante_2_menu | alergias | cancion | mensaje | enviado_en | actualizado_en |

3. Carga ahí tu lista real de invitados (una fila por invitado/familia, con
   el código que le vas a mandar por WhatsApp).
4. **Extensiones > Apps Script**. Borra el contenido de `Code.gs` y pega el
   de `docs/apps-script/Code.gs` de este proyecto.
5. **Desplegar > Nueva implementación** → tipo **"Aplicación web"** →
   Ejecutar como **"Yo"** → Quién tiene acceso **"Cualquier usuario"** →
   **Desplegar**. Google te va a pedir autorizar el script con tu cuenta
   (una vez).
6. Copia la URL que termina en `/exec`.
7. En `js/config.js`, cambia:
   ```js
   apiUrl: "https://script.google.com/macros/s/AKfycb.../exec",
   ```
8. Commit + push. Ya no hace falta `server/dev_api.py` para producción
   (sigue sirviendo para seguir probando cambios en local).

## Por qué el frontend no mira el código HTTP para saber si hubo error

Google Apps Script **siempre responde HTTP 200**, sin importar si hubo un
error de validación — no hay forma de que devuelva un 400 de verdad. Por
eso `submitRSVP()` en `js/site.js` decide éxito/error mirando el **contenido**
del JSON (`{"error": "..."}` vs `{"ok": true}`), nunca el status HTTP. Esto
funciona igual contra `server/dev_api.py` (que sí puede devolver 400, pero
el frontend lo ignora a propósito) y contra el Apps Script real.

## Por qué el body se manda como `text/plain`

El navegador manda un "preflight" (petición OPTIONS) antes de un POST con
`Content-Type: application/json`, y Apps Script no responde ese preflight
(no tiene `doOptions`), así que la petición fallaría por CORS. Mandándolo
como `text/plain;charset=utf-8` el navegador no manda preflight — el cuerpo
sigue siendo JSON válido y ambos backends lo parsean igual.

## Qué falta para producción real (más allá del deploy)

- **Lista de invitados real** — hoy es de prueba (`server/invitados.json`
  / la tabla de ejemplo de arriba).
- **Protección básica anti-spam** — el Apps Script de este documento no
  tiene rate-limiting. Para una boda (tráfico bajo, con links que solo
  tienen los invitados) es un riesgo aceptable, pero si preocupa, se puede
  agregar un chequeo simple de "no más de N respuestas por minuto" en
  `doPost`.
- **Notificación al confirmar** (opcional) — se puede agregar
  `MailApp.sendEmail(...)` al final de `upsertRespuesta` en el Apps Script
  para recibir un correo cada vez que alguien confirma.
