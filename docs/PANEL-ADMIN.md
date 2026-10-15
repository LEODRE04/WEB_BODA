# Panel de administración

`admin.html` (https://leodre04.github.io/WEB_BODA/admin.html) es el panel
de André y Krisli: resumen y avance, lista de invitados, plano de mesas,
lista de entrada, regalos e historial de cambios. Lee y escribe la misma
hoja de Google que la invitación. No tiene enlaces desde la invitación y
no se indexa; sin una clave válida el backend no devuelve ningún dato.

## Puesta en marcha (una sola vez)

1. **Actualizar el backend.** Copia `docs/apps-script/Code.gs` entero en el
   Apps Script de la hoja (Extensiones > Apps Script) y despliega una
   **nueva versión** (Desplegar > Gestionar implementaciones > lápiz >
   Nueva versión). Google pedirá autorizar el envío de correos: es para el
   aviso cuando alguien cambia su respuesta de "sí" a "no".
2. **Recargar la hoja.** Aparece un menú nuevo, **Boda**.
3. **Boda > Preparar el panel.** Agrega lo que falte: en Invitados las
   columnas `grupo`, `prioridad`, `telefono` y `mesa`; en Aportes la
   columna `estado`; y las pestañas `Mesas` e `Historial`. Lo que ya existe
   no se toca.
4. **Boda > Crear claves del panel.** Muestra una clave para André y otra
   para Krisli. Cópienlas en un lugar seguro: no se vuelven a mostrar. Si
   alguna se filtra, vuelvan a crear claves (las anteriores dejan de
   funcionar).
5. **Llenar los teléfonos** en la columna `telefono` (9 dígitos o con 51
   adelante). Con eso, "Recordar por WhatsApp" abre directo el chat.

## Antes de enviar las invitaciones

- **Boda > Agregar sufijo aleatorio a los códigos.** Cambia cada código de
  `andre-leon` a `andre-leon-k7q2`, para que nadie pueda adivinar el link
  de otro invitado. Solo corre una vez. Los links de la hoja se actualizan
  solos.
- **Boda > Borrar datos de prueba.** Vacía Respuestas, Aportes e Historial
  y las aperturas de Invitados. Conserva invitados, regalos y mesas.

## Qué hace cada sección

- **Resumen:** respondieron, vienen (y cuántos a la recepción), no asisten,
  sin abrir, días al cierre, sentados en mesa, regalos; avance por grupo
  (toca un grupo para ver sus invitados) y respuestas por día.
- **Invitados:** búsqueda y filtros (grupo, estado, tipo, mesa). Por cada
  uno: cuándo abrió el link, su respuesta, mesa, copiar link, recordar por
  WhatsApp y cargar una respuesta a mano (queda en el Historial con quién
  la cargó).
- **Mesas:** plano con mesas redondas o rectangulares, cada una con su
  capacidad. Se arrastran a su lugar. Para sentar a alguien: arrastra su
  nombre a la mesa, o toca "Sentar" y luego la mesa. Los puntos alrededor
  son los asientos (llenos = ocupados); la mesa se pone roja si se pasa de
  su capacidad. Quien todavía no responde ocupa provisionalmente todos sus
  pases; quien dijo que no, ninguno.
- **Entrada:** confirmados en orden alfabético con personas, mesa y grupo.
  Se descarga para Excel o se imprime con una casilla por invitado.
  También se puede descargar la lista completa de invitados.
- **Regalos:** avance por regalo y cada aporte con su mensaje y constancia.
  "Marcar duplicado" lo deja de contar sin borrar la fila.
- **Historial:** respuestas y cambios de invitados y del panel. Un cambio de
  "sí" a "no" aparece resaltado.

## Desarrollo local

`python3 server/dev_api.py` sirve el sitio y una API de prueba en
http://localhost:5177. Para usar el panel contra ella, apunta
`window.WEDDING.rsvp.apiUrl` a `http://localhost:5177/api/rsvp` (por
ejemplo en una copia temporal de `admin.html`) y entra con la clave
`prueba-andre` o `prueba-krisli`. Los datos de prueba quedan en
`server/*.local.json`, que no se suben a git.
