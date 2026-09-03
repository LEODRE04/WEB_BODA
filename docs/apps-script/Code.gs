/**
 * Backend real del RSVP y de la Lista de regalos — vive dentro del Google
 * Sheet (Extensiones > Apps Script), no necesita hosting aparte. Mismo
 * contrato que server/dev_api.py (el mock que se usa en desarrollo
 * local), así que cambiar de uno a otro es solo cambiar rsvp.apiUrl en
 * js/config.js — nada del frontend tiene que cambiar.
 *
 * Espera un Google Sheet con estas pestañas:
 *
 *   Invitados   (una fila por invitado, la cargan ustedes a mano)
 *     código | nombre | acompañantes_permitidos | tipo_invitacion
 *     (tipo_invitacion: "completa" = ceremonia + recepción, o
 *     "ceremonia" = solo ceremonia — deja la celda vacía y cuenta como
 *     "completa")
 *
 *   Respuestas  (se llena sola cuando alguien confirma)
 *     codigo | nombre | num_asistentes | asistencia | enviado_en | actualizado_en
 *     (formulario simplificado: nombre y num_asistentes ya vienen fijados
 *     por la invitación, la única decisión real del invitado es asistencia)
 *
 *   Regalos     (una fila por regalo, la cargan ustedes a mano — ver
 *               docs/REGALOS-BACKEND.md)
 *     id | nombre | descripcion | foto_url | precio
 *
 *   Aportes     (se llena sola cuando alguien aporta a un regalo)
 *     regalo_id | nombre | monto | mensaje | comprobante_url | fecha
 *     (el "recaudado" de cada regalo se calcula sumando estas filas, no
 *     se guarda por separado — así nunca queda desincronizado)
 *
 * Deploy: Extensiones > Apps Script > pega este archivo > Desplegar >
 * Nueva implementación > tipo "Aplicación web" > Ejecutar como "Yo" >
 * Quién tiene acceso "Cualquier usuario" > Desplegar. Copia la URL que
 * termina en /exec y ponla en js/config.js como rsvp.apiUrl. Si ya
 * tenías una implementación (por el RSVP), no hace falta crear una
 * nueva: "Gestionar implementaciones" > lápiz de editar > "Nueva
 * versión" > Desplegar — la URL /exec no cambia.
 */

var SHEET_INVITADOS = "Invitados";
var SHEET_RESPUESTAS = "Respuestas";
var SHEET_REGALOS = "Regalos";
var SHEET_APORTES = "Aportes";

var RESPUESTA_COLUMNAS = ["codigo", "nombre", "num_asistentes", "asistencia", "enviado_en", "actualizado_en"];
var APORTE_COLUMNAS = ["regalo_id", "nombre", "monto", "mensaje", "comprobante_url", "fecha"];

// Carpeta de Drive donde se guardan las capturas de las transferencias.
// Se crea sola la primera vez (no hay que crearla a mano) y queda
// guardada en Propiedades del script para no tener que buscarla cada
// vez ni arriesgarse a crear una carpeta nueva por cada aporte.
var CARPETA_COMPROBANTES = "Comprobantes de regalos — boda";

// Nota: ContentService no permite devolver códigos de estado HTTP propios
// (Apps Script Web Apps siempre responden 200). Por eso el frontend
// (submitRSVP en js/site.js) decide éxito/error mirando el campo "error"
// del JSON, no el status HTTP — funciona igual contra este backend real
// que contra server/dev_api.py.
//
// Justamente por eso TODO tiene que devolver JSON sí o sí: si acá se
// escapa una excepción, Apps Script responde una página HTML de error, el
// frontend no la puede parsear y (antes de esta versión) la trataba como
// "backend caído" — guardando la confirmación solo en el navegador del
// invitado, sin que nadie se enterara. De ahí los try/catch de doGet y
// doPost: cualquier fallo inesperado sale igual como {"error": "..."}.

var LOCK_ESPERA_MS = 15000;
var CACHE_REGALOS_SEG = 30;

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if ((params.tipo || "") === "regalos") {
      return jsonOut({ regalos: listRegalosCacheado() });
    }

    var codigo = (params.codigo || "").trim();
    if (!codigo) return jsonOut({ error: "falta 'codigo'" });

    var guest = findGuest(codigo);
    if (!guest) return jsonOut({ found: false });

    var respuesta = findRespuesta(codigo);
    return jsonOut({
      found: true,
      nombre: guest.nombre,
      acompanantes_permitidos: guest.acompanantes_permitidos,
      tipo_invitacion: guest.tipo_invitacion,
      respuesta: respuesta ? respuesta.data : null,
    });
  } catch (err) {
    return errorReintentable(err);
  }
}

function doPost(e) {
  try {
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ error: "JSON inválido" });
    }

    if (data.tipo === "aporte") return handleAporte(data);

    // Se valida ANTES de tocar la hoja: si falta algo, no gastamos una
    // lectura de Invitados para nada.
    if (!data.nombre || !data.asistencia) {
      return jsonOut({ error: "faltan campos requeridos" });
    }

    var codigo = (data.codigo || "").trim();
    if (codigo) {
      var guest = findGuest(codigo);
      if (!guest) return jsonOut({ error: "código de invitado no reconocido" });
      // num_asistentes es de solo lectura en el formulario — esto es más una
      // red de seguridad que una validación real, por si alguien lo edita a
      // mano en el navegador.
      var esperado = 1 + guest.acompanantes_permitidos;
      if (Number(data.num_asistentes || esperado) > esperado) {
        return jsonOut({ error: "supera los asistentes de tu invitación (" + esperado + ")" });
      }
    }

    upsertRespuesta(codigo, data);
    return jsonOut({ ok: true });
  } catch (err) {
    return errorReintentable(err);
  }
}

// — helpers —

// Cualquier excepción inesperada (hoja renombrada, lock que expiró por
// contención, cuota de Apps Script) se devuelve como error REINTENTABLE:
// no es culpa del invitado ni de sus datos, así que el frontend lo trata
// como un problema de conexión — guarda la respuesta y la reenvía sola
// más tarde — en vez de descartarla como haría con "código inválido".
function errorReintentable(err) {
  // El detalle técnico queda en el log del script (Ejecuciones, en el
  // editor de Apps Script); al invitado se le devuelve algo accionable.
  try { console.error(err && err.stack ? err.stack : err); } catch (e) {}
  return jsonOut({
    error: "No pudimos guardar tu respuesta en este momento. Lo reintentamos solos en un minuto.",
    reintentable: true,
  });
}

// Igual que getSheet pero falla con un mensaje claro en vez de devolver
// null y reventar más adelante con "cannot call getDataRange of null".
function requireSheet(name) {
  var sheet = getSheet(name);
  if (!sheet) throw new Error('Falta la pestaña "' + name + '" en la hoja de cálculo.');
  return sheet;
}

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

// Lee SOLO la columna A (la de claves) para ubicar la fila. Antes se
// traía la hoja entera con getDataRange().getValues() y se recorría en
// memoria; con 200 invitados eso son ~800 celdas por request en vez de
// ~200, y el traslado de celdas es lo que domina el tiempo de respuesta
// de Apps Script. Devuelve el número de fila (1-indexado) o 0.
function buscarFilaPorClave(sheet, clave) {
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return 0; // solo encabezados (o vacía)
  var claves = sheet.getRange(2, 1, ultimaFila - 1, 1).getValues();
  for (var i = 0; i < claves.length; i++) {
    if (String(claves[i][0]).trim() === clave) return i + 2; // +2: fila 1 = encabezados
  }
  return 0;
}

function findGuest(codigo) {
  var sheet = requireSheet(SHEET_INVITADOS);
  var fila = buscarFilaPorClave(sheet, codigo);
  if (!fila) return null;
  var v = sheet.getRange(fila, 1, 1, 4).getValues()[0];
  return {
    codigo: v[0],
    nombre: v[1],
    acompanantes_permitidos: Number(v[2] || 0),
    tipo_invitacion: String(v[3] || "completa").trim() || "completa",
  };
}

function findRespuesta(codigo) {
  var sheet = requireSheet(SHEET_RESPUESTAS);
  var fila = buscarFilaPorClave(sheet, codigo);
  if (!fila) return null;
  return leerRespuestaEnFila(sheet, fila);
}

function leerRespuestaEnFila(sheet, fila) {
  var v = sheet.getRange(fila, 1, 1, RESPUESTA_COLUMNAS.length).getValues()[0];
  var data = {};
  RESPUESTA_COLUMNAS.forEach(function (col, j) { data[col] = v[j]; });
  return { rowIndex: fila, data: data };
}

// El upsert es leer-y-después-escribir, así que dos invitados confirmando
// en el mismo segundo (muy probable apenas se reparten los links) podían
// leer los dos "no existe" y terminar en dos filas duplicadas para la
// misma persona. Apps Script sí corre requests en paralelo, así que hace
// falta el lock explícito — server/dev_api.py ya usaba uno equivalente.
function upsertRespuesta(codigo, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_ESPERA_MS);
  try {
    var sheet = requireSheet(SHEET_RESPUESTAS);
    var key = codigo || data.nombre;
    var existing = key ? findRespuestaByKey(sheet, key) : null;

    var row = RESPUESTA_COLUMNAS.map(function (col) { return data[col] || ""; });
    var ahora = new Date().toISOString();
    if (!data.enviado_en) row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = ahora;

    if (existing) {
      row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = existing.data.enviado_en; // conserva la fecha original
      row[RESPUESTA_COLUMNAS.indexOf("actualizado_en")] = ahora;
      sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

// Busca por código (columna A) y, si no aparece, por nombre (columna B) —
// para las confirmaciones sin ?codigo=. Dos lecturas de una columna en vez
// de una de la hoja entera.
function findRespuestaByKey(sheet, key) {
  var fila = buscarFilaPorClave(sheet, key);
  if (fila) return leerRespuestaEnFila(sheet, fila);

  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return null;
  var nombres = sheet.getRange(2, 2, ultimaFila - 1, 1).getValues();
  for (var i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim() === key) return leerRespuestaEnFila(sheet, i + 2);
  }
  return null;
}

// — lista de regalos —

// La lista de regalos es, de lejos, lo más pedido del sitio (se carga
// entera cada vez que alguien abre regalos.html) y es idéntica para
// todos, así que se cachea unos segundos. El cache se invalida solo al
// registrar un aporte, así que el avance nunca se ve viejo después de
// aportar — que es el único momento donde la frescura importa de verdad.
function listRegalosCacheado() {
  var cache = CacheService.getScriptCache();
  try {
    var hit = cache.get("regalos");
    if (hit) return JSON.parse(hit);
  } catch (err) {
    // Cache caído o JSON corrupto: se sigue de largo y se lee la hoja.
  }
  var regalos = listRegalos();
  try {
    cache.put("regalos", JSON.stringify(regalos), CACHE_REGALOS_SEG);
  } catch (err) {
    // Si no se pudo cachear (p. ej. supera el límite de tamaño), da igual.
  }
  return regalos;
}

function invalidarCacheRegalos() {
  try { CacheService.getScriptCache().remove("regalos"); } catch (err) {}
}

function listRegalos() {
  var sheet = getSheet(SHEET_REGALOS);
  if (!sheet) return [];
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return [];

  // Solo las 5 columnas del contrato (id..precio), no getDataRange(): si
  // alguien deja notas en una columna F de la hoja, no viajan por la red.
  var rows = sheet.getRange(2, 1, ultimaFila - 1, 5).getValues();
  var aportes = sumAportesPorRegalo();

  var regalos = [];
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][0]).trim();
    if (!id) continue;
    regalos.push({
      id: id,
      nombre: rows[i][1],
      descripcion: rows[i][2],
      foto_url: rows[i][3],
      precio: Number(rows[i][4] || 0),
      recaudado: aportes[id] || 0,
    });
  }
  return regalos;
}

function sumAportesPorRegalo() {
  var sheet = getSheet(SHEET_APORTES);
  var totales = {};
  if (!sheet) return totales;
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return totales;

  // Solo regalo_id y monto (columnas A-C): la hoja de aportes crece sin
  // techo y el mensaje/comprobante no se usan para sumar.
  var rows = sheet.getRange(2, 1, ultimaFila - 1, 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i][0]).trim();
    if (!id) continue;
    totales[id] = (totales[id] || 0) + Number(rows[i][2] || 0);
  }
  return totales;
}

// Valida que el regalo exista leyendo SOLO la columna de ids. Antes esto
// llamaba a listRegalos(), que además se traía la hoja de aportes entera
// solo para descartar el resultado.
function existeRegalo(regaloId) {
  var sheet = getSheet(SHEET_REGALOS);
  if (!sheet) return false;
  return buscarFilaPorClave(sheet, regaloId) > 0;
}

function handleAporte(data) {
  var regaloId = String(data.regalo_id || "").trim();
  var monto = Number(data.monto);
  var nombre = String(data.nombre || "").trim();

  if (!regaloId) return jsonOut({ error: "falta el regalo" });
  if (!nombre) return jsonOut({ error: "falta el nombre" });
  if (!monto || monto <= 0) return jsonOut({ error: "el monto tiene que ser mayor a 0" });
  if (!existeRegalo(regaloId)) return jsonOut({ error: "ese regalo ya no existe" });

  // Subir la captura a Drive es lo más lento de todo el request (varios
  // segundos con una foto de celular), así que se hace FUERA del lock —
  // si no, dos personas aportando a la vez se quedarían esperando una a
  // la otra sin necesidad.
  var comprobanteUrl = "";
  if (data.comprobante_base64) {
    try {
      comprobanteUrl = guardarComprobante(data.comprobante_base64, data.comprobante_nombre, nombre);
    } catch (err) {
      // Un problema guardando la captura no debería tumbar todo el
      // aporte — se guarda igual, sin el link, y ya lo piden a mano por
      // WhatsApp si hace falta ver la constancia.
      comprobanteUrl = "";
    }
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_ESPERA_MS);
  try {
    requireSheet(SHEET_APORTES).appendRow([
      regaloId,
      nombre,
      monto,
      String(data.mensaje || ""),
      comprobanteUrl,
      new Date().toISOString(),
    ]);
  } finally {
    lock.releaseLock();
  }

  // Recién aportado: el avance cambió, así que el próximo que abra la
  // lista tiene que ver el número nuevo y no el cacheado.
  invalidarCacheRegalos();
  return jsonOut({ ok: true });
}

function guardarComprobante(base64, nombreArchivo, nombreAportante) {
  // El data URL trae el prefijo "data:image/jpeg;base64," — si viene así,
  // se lo quitamos; si el frontend ya manda solo el base64, esto no hace
  // nada.
  var comma = base64.indexOf(",");
  if (base64.indexOf("base64") !== -1 && comma !== -1) base64 = base64.slice(comma + 1);

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, "image/jpeg", (nombreArchivo || "comprobante") + ".jpg");
  var folder = getOrCreateCarpetaComprobantes();
  var file = folder.createFile(blob);
  file.setName(nombreAportante + " — " + file.getName());
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function getOrCreateCarpetaComprobantes() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("carpeta_comprobantes_id");
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (err) {
      // La carpeta se borró o ya no es accesible — se crea otra abajo.
    }
  }
  var folder = DriveApp.createFolder(CARPETA_COMPROBANTES);
  props.setProperty("carpeta_comprobantes_id", folder.getId());
  return folder;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
