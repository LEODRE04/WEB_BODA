# Fotos

`img/p1.jpg`…`p4.jpg` son 4 fotos de la sesión de pedida de la pareja
(carpeta `Fotos de Pedida` del usuario), redimensionadas para web con
`sips` (macOS): 1280px de ancho máx., calidad ~55% — quedan entre 300-390KB
cada una, livianas para cargar desde el celular de un invitado.

- `p1.jpg` — sección "Bienvenida"
- `p2.jpg` — sección de confirmación (RSVP)
- `p3.jpg` — portada
- `p4.jpg` — galería

## Si quieres cambiarlas

Reemplaza el archivo correspondiente en `img/` manteniendo el mismo nombre
— el placeholder ("Foto — coloca img/pX.jpg") solo aparece si el archivo
falta o no carga, así que no hay que tocar el HTML.

Para comprimir una foto nueva de cámara (varios MB) a un tamaño razonable
para web, en Terminal (macOS, sin instalar nada):

```bash
sips -Z 1280 -s format jpeg -s formatOptions 55 "original.jpg" --out img/p1.jpg
```

`-Z 1280` limita el lado más largo a 1280px; `formatOptions 55` es la
calidad JPEG (0-100). Para la galería (`#galeria`) se puede agregar más
fotos directamente en el HTML siguiendo el mismo patrón `<div class="photo">`.
