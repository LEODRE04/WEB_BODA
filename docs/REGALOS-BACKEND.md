# Mesa de regalos elegible (con backend)

Extiende el **mismo** Google Apps Script del RSVP (ver `docs/RSVP-BACKEND.md`)
con dos pestañas nuevas — no hace falta un Sheet ni una implementación
aparte, ni cambiar `rsvp.apiUrl` en `js/config.js`.

## Qué hace

En vez de solo mandar dinero "al aire" por Yape, los invitados eligen un
regalo concreto de una lista (armada por ustedes), aportan por Yape o
transferencia, y suben la captura de la transferencia como constancia. El
avance de cada regalo (cuánto falta) se ve en la propia web y se
actualiza para todos apenas alguien aporta — se puede aportar completo o
por partes entre varios invitados.

**Importante — qué es y qué NO es esto:** la web nunca toca ni retiene
dinero. El pago sigue siendo un Yape/transferencia directo de la persona
a ustedes, exactamente como ya funciona hoy — esto es solo una lista +
un contador de avance + un registro de capturas para que no tengan que
llevar la cuenta a mano. Por eso no hace falta conectar ninguna pasarela
de pago (Mercado Pago, Culqi, etc.): ese nivel de integración es para
negocios que cobran con tarjeta, no para esto.

**Es un sistema de confianza**, igual que el Yape de toda la vida: nada
verifica automáticamente que la transferencia haya pasado de verdad —
la captura queda guardada en Drive para que la miren cuando quieran,
pero nadie las revisa antes de que el aporte "cuente" en la barra de
avance. Para familia/amigos es el mismo nivel de confianza que ya usan
hoy; no es apto para una lista pública abierta a desconocidos.

## Configurar

1. En el **mismo** Google Sheet del RSVP, crea 2 pestañas con estos
   encabezados exactos en la fila 1:

   **`Regalos`** (una fila por regalo — la cargan ustedes a mano)
   | id | nombre | descripcion | foto_url | precio |
   |---|---|---|---|---|
   | vajilla-seis | Vajilla para seis | Para las cenas del domingo | (link a una foto, opcional) | 540 |
   | luna-de-miel | Noche de luna de miel | Un aporte para la primera noche | | 600 |

   - `id`: cualquier texto único, sin espacios (se usa internamente, no lo
     ve el invitado). Si lo cambias o borras una fila, los aportes viejos
     de ese id quedan huérfanos — mejor no reusar ids.
   - `foto_url`: opcional. Sube la foto a Drive (o cualquier hosting de
     imágenes), copia un link público y pégalo acá. Si lo dejas vacío, la
     tarjeta se muestra sin foto.
   - `precio`: solo un número, sin "S/" ni comas.

   **`Aportes`** (se llena sola — solo pon los encabezados)
   | regalo_id | nombre | monto | mensaje | comprobante_url | fecha |

2. **Extensiones > Apps Script** (el mismo proyecto del RSVP) → reemplaza
   todo el contenido de `Code.gs` por el de `docs/apps-script/Code.gs` de
   este repo (ya incluye RSVP + regalos juntos).
3. **Desplegar > Gestionar implementaciones** → ícono de lápiz en tu
   implementación existente → **Nueva versión** → **Desplegar**. La URL
   `/exec` no cambia, así que `js/config.js` sigue igual.
4. Listo — apenas guardes, la sección "Mesa de regalos" de la web
   detecta la lista y se muestra sola (antes de esto, esa parte de la
   sección queda oculta y solo se ve el Yape/transferencia general de
   siempre, sin romper nada).

## Probarlo en tu máquina antes de desplegar nada

```bash
cd boda-andre-krisli
python3 server/dev_api.py       # sirve todo en http://localhost:5177
```

`server/regalos.json` ya trae 5 regalos de ejemplo. Los aportes de
prueba quedan en `server/aportes.local.json` y las capturas "subidas" en
`server/comprobantes.local/` (ninguno de los dos se sube a git). Para
resetear la prueba, borra esos dos y reinicia el servidor.

Como `js/config.js` apunta directo al Apps Script real (no a
`/api/rsvp`), para probar contra `dev_api.py` hay que apuntar
`window.WEDDING.rsvp.apiUrl` a `http://localhost:5177/api/rsvp` — por
ejemplo pegando esto en la consola del navegador antes de recargar:

```js
window.WEDDING.rsvp.apiUrl = "http://localhost:5177/api/rsvp";
```

## Notas técnicas

- La captura se comprime en el propio navegador (máx. 1000px de ancho,
  calidad .72) antes de mandarla — una foto de celular de varios MB
  termina pesando unos cientos de KB, de sobra para que se lea bien y
  liviana para Apps Script.
- Si guardar la captura en Drive falla por lo que sea, el aporte se
  guarda igual (sin el link a la constancia) — no se pierde el aporte
  por un problema con la imagen.
- No hay protección contra que dos personas aporten al mismo regalo en
  el mismo segundo (ambos aportes se guardan, se suman igual) — para el
  tamaño de una lista de invitados de boda es un riesgo aceptable.
