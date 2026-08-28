# Fase 3 — RSVP con backend

Hoy (fase 1: prototipo local) el formulario de `#rsvp` guarda cada respuesta
en `localStorage` del navegador, desde `submitRSVP()` en `js/site.js`. Sirve
para probar el flujo completo (validación, mensaje de éxito, límite de
acompañantes) pero **cada visitante solo ve sus propias respuestas**, y se
pierden si limpia el navegador. No sirve para producción.

Para revisar lo guardado mientras tanto, abre la consola del navegador en la
página y ejecuta:

```js
window.__rsvpResponses()
```

## Qué cambiar cuando haya backend

Todo el frontend ya está preparado para no necesitar más cambios que este:
reemplazar el cuerpo de `submitRSVP(data)` en `js/site.js` por una llamada a
tu API, por ejemplo:

```js
function submitRSVP(data) {
  return fetch("/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  });
}
```

El formulario ya envía un objeto con: `nombre`, `contacto`, `asistencia`
(`"si" | "no"`), `num_acompanantes`, `menu`, `acompanante_1_nombre`,
`acompanante_1_menu`, `acompanante_2_nombre`, `acompanante_2_menu` (si aplica),
`alergias`, `cancion`, `mensaje`, `enviado_en` (ISO timestamp).

## Opciones razonables para el backend (de más simple a más completo)

1. **Formulario a Google Sheets** vía un endpoint tipo
   [SheetDB](https://sheetdb.io) o un Apps Script propio — cero servidor que
   mantener, bueno para una boda.
2. **Serverless** (una función en Vercel/Netlify/Cloudflare Workers) que
   escribe a una base de datos gestionada (Supabase/Postgres, Firebase,
   Turso). Da control total y sigue sin servidor que administrar.
3. **Backend propio** (Node/Express + SQLite o Postgres) si además quieres
   un panel de administración a medida (ver invitados, exportar CSV,
   reenviar links personalizados con `?invitado=Nombre`).

Cualquiera de las tres funciona con el frontend actual sin tocar el HTML/CSS:
solo cambia `submitRSVP()`. Cuando decidan el enfoque, se implementa como
fase 3 sobre este mismo repositorio.
