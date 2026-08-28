# Fotos

El diseño aprobado (opción **3a**, turno 3 del proyecto en Claude Design) usa
cuatro fotos de la pareja: `p1`, `p2`, `p3` y `p4`. Ese proyecto las tiene en
`img/p1.png`…`p4.png`, pero son archivos de más de 256 KB y la herramienta de
sincronización con Claude Design solo puede traer archivos de hasta 256 KB, así
que no se pudieron descargar completas — por eso el prototipo se entrega con
placeholders (un fondo a rayas con una etiqueta) en su lugar, para no commitear
imágenes corruptas.

## Cómo poner las fotos reales

1. Abre el proyecto en Claude Design: <https://claude.ai/design/p/55459373-7343-4ae2-afbe-6d9a74702b3e>
2. Descarga (o exporta) las imágenes `p1.png`, `p2.png`, `p3.png`, `p4.png`
   — o directamente tus fotos originales de la pareja.
3. Guárdalas en `img/` de este proyecto **con estos nombres exactos**:
   - `img/p1.jpg` (o `.png`) — bienvenida
   - `img/p2.jpg` — sección de confirmación (RSVP)
   - `img/p3.jpg` — portada
   - `img/p4.jpg` — galería
   - Si usas `.png` en vez de `.jpg`, actualiza el atributo `src` en
     `index.html` (búscalo, son 6 apariciones).

En cuanto el archivo existe y carga correctamente, el placeholder ("Foto —
coloca img/pX.jpg") desaparece solo — no hay que tocar nada más en el HTML ni
en el CSS (ver `initPhotoFallbacks()` en `js/site.js`).

También existen en el proyecto de diseño fotos reales ya subidas
(`img/pareja-1.jpg`…`pareja-4.jpg`, `uploads/photos-*.jpg`) que puedes usar
para ampliar la galería más adelante.
