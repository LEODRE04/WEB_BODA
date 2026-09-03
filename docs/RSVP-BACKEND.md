# RSVP con backend

## Estado: backend real desplegado y en uso

El formulario de `#rsvp` habla con una API real:

- **En producción (GitHub Pages)** apunta al Google Apps Script desplegado
  sobre el Google Sheet de la boda — el código vive en
  `docs/apps-script/Code.gs`.
- **En desarrollo local** se apunta a `server/dev_api.py` — un servidor
  Python (sin dependencias) que sirve el sitio y simula el mismo backend
  con una lista de invitados de prueba en `server/invitados.json`.

Los dos hablan el mismo "idioma" (mismo formato de JSON), así que pasar de
uno a otro es cambiar una sola línea en `js/config.js` (`rsvp.apiUrl`) —
nada del HTML/CSS ni del formulario cambia.

## Qué pasa si falla la conexión al confirmar

Importante, porque acá se juegan respuestas que los novios no pueden
perder. `submitRSVP()` en `js/site.js` distingue tres casos:

| Situación | Qué ve el invitado | Qué pasa por detrás |
|---|---|---|
| Se guardó en la hoja | Modal "¡Nos alegra tenerte aquí!" y el resumen de su respuesta | listo, nada pendiente |
| No hubo conexión, o el backend devolvió `reintentable: true` (lock ocupado, cuota, hoja renombrada), o tardó más de 15s | Aviso de que **no** se pudo guardar, con el formulario intacto para reintentar | la respuesta queda en `localStorage` bajo `rsvp_pendiente` y se reenvía sola en la siguiente visita |
| El backend la rechazó por los datos (código inválido, más asistentes de los permitidos) | El motivo real del rechazo | se descarta el pendiente: reintentar no ayudaría |

La diferencia importa: **antes**, cualquier fallo de red guardaba en
`localStorage` y mostraba igual el modal de confirmación. El invitado se
iba convencido de haber confirmado y los novios nunca se enteraban. Ahora
solo se celebra cuando la respuesta llegó de verdad.

El reenvío automático es seguro porque el `upsert` del backend usa el
código de invitado como clave: reenviar dos veces actualiza la misma fila,
no crea duplicados. **Los aportes de regalos NO se reintentan solos** — ahí
cada envío es un `appendRow` nuevo y un reintento automático duplicaría el
monto; si falla, el invitado ve el error y decide.

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

### Probar con la lista real de invitados (en tu máquina, sin subirla a git)

Si existe `server/invitados.real.json`, `dev_api.py` lo usa en vez de la
lista de prueba — automático, no hay que avisarle nada. Ese archivo (y su
CSV hermano `server/invitados.real.csv`, listo para pegar en el Google
Sheet real) están en `.gitignore` **a propósito**: tienen nombres reales
de personas y este repo es público, así que nunca se suben. Viven solo en
esta máquina hasta que se despliegue el Sheet real (ver más abajo).

## Cómo funciona el link personalizado por invitado

Cada invitado entra con `tusitio.com/?codigo=SU-CODIGO`. El frontend
(`js/site.js`):

1. Al cargar, si hay `?codigo=`, le pregunta a la API quién es ese código.
2. Si existe: precarga su nombre y el número de asistentes (ambos de solo
   lectura), y si ya había confirmado antes, marca su respuesta anterior
   (sí/no) para poder editarla.
3. Si el código no existe, o la API no responde: el formulario sigue
   funcionando abierto (nombre editable, 1 asistente) — nadie se queda sin
   poder confirmar.

El campo oculto `codigo` viaja con el formulario para que el backend sepa
a qué invitado actualizar.

## Dos tipos de invitación: solo ceremonia, o ceremonia + recepción

La columna `tipo_invitacion` de cada invitado (`"ceremonia"` o
`"completa"`) cambia la página para esa persona:

- **`"completa"`** (o la celda vacía — es el valor por defecto en la lista
  de invitados): ve todo.
- **`"ceremonia"`**: no ve el bloque de ubicación de la recepción en
  "Cuándo y dónde". El saludo de arriba también dice "...en la ceremonia"
  en vez de "...en la ceremonia y la recepción".

**Por defecto (medida de seguridad):** la página parte SIEMPRE asumiendo
"solo ceremonia" — `applyInvitationType()` en `js/site.js` agrega la clase
`solo-ceremonia` al `<body>` de entrada, y recién la quita si el backend
confirma un código válido con `tipo_invitacion` "completa". Esto es al
revés de cómo funciona `tipo_invitacion` en la lista (ahí la celda vacía
= completa) a propósito: si alguien borra el `?codigo=` del link, escribe
uno inventado, o el backend no responde, tiene que ver lo mínimo, no lo
máximo. `css/site.css` oculta con esa clase todo lo marcado
`[data-reception-only]` en el HTML — para agregar o quitar algo de la
versión recortada, es agregar o quitar ese atributo en `index.html`, sin
tocar JS.

Esto frena el "borro el código del link para curiosear" — no protege
contra alguien que abre las herramientas de desarrollador del navegador a
propósito (el HTML de la recepción sigue estando en la página, solo
oculto por CSS). Para ese nivel de protección haría falta que el backend
mandara el HTML ya recortado por invitado, que es un cambio de
arquitectura bastante más grande — no debería hacer falta para una web de
boda familiar/de amigos.

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
   | codigo | nombre | num_asistentes | asistencia | enviado_en | actualizado_en |

   Formulario simplificado a propósito: como ya tienen el celular de cada
   invitado (el link se los mandan por WhatsApp), no hace falta pedir
   contacto de nuevo. Nombre y número de asistentes vienen fijados por la
   invitación (de solo lectura en el formulario) — lo único que decide el
   invitado es si va o no. Más rápido de responder, y una fila de
   `Respuestas` más simple de leer.

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
