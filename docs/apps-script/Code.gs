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

function doGet(e) {
  if ((e.parameter.tipo || "") === "regalos") {
    return jsonOut({ regalos: listRegalos() });
  }

  var codigo = (e.parameter.codigo || "").trim();
  if (!codigo) return jsonOut({ error: "falta 'codigo'" });

  var guest = findGuest(codigo);
  if (!guest) return jsonOut({ found: false });

  var respuesta = findRespuestaRow(codigo);
  return jsonOut({
    found: true,
    nombre: guest.nombre,
    acompanantes_permitidos: guest.acompanantes_permitidos,
    tipo_invitacion: guest.tipo_invitacion,
    respuesta: respuesta ? respuesta.data : null,
  });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: "JSON inválido" });
  }

  if (data.tipo === "aporte") return handleAporte(data);

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

  if (!data.nombre || !data.asistencia) {
    return jsonOut({ error: "faltan campos requeridos" });
  }

  upsertRespuesta(codigo, data);
  return jsonOut({ ok: true });
}

// — helpers —

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function findGuest(codigo) {
  var sheet = getSheet(SHEET_INVITADOS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) { // fila 0 = encabezados
    if (String(rows[i][0]).trim() === codigo) {
      return {
        codigo: rows[i][0],
        nombre: rows[i][1],
        acompanantes_permitidos: Number(rows[i][2] || 0),
        tipo_invitacion: String(rows[i][3] || "completa").trim() || "completa",
      };
    }
  }
  return null;
}

function findRespuestaRow(codigo) {
  var sheet = getSheet(SHEET_RESPUESTAS);
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === codigo) {
      var data = {};
      RESPUESTA_COLUMNAS.forEach(function (col, j) { data[col] = rows[i][j]; });
      return { rowIndex: i + 1, data: data }; // +1: getRange es 1-indexado
    }
  }
  return null;
}

function upsertRespuesta(codigo, data) {
  var sheet = getSheet(SHEET_RESPUESTAS);
  var key = codigo || data.nombre;
  var existing = key ? findRespuestaByKey(sheet, key) : null;

  var row = RESPUESTA_COLUMNAS.map(function (col) { return data[col] || ""; });
  if (!data.enviado_en) row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = new Date().toISOString();

  if (existing) {
    row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = existing.data.enviado_en; // conserva la fecha original
    row[RESPUESTA_COLUMNAS.indexOf("actualizado_en")] = new Date().toISOString();
    sheet.getRange(existing.rowIndex, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function findRespuestaByKey(sheet, key) {
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key || String(rows[i][1]).trim() === key) { // codigo o nombre
      var data = {};
      RESPUESTA_COLUMNAS.forEach(function (col, j) { data[col] = rows[i][j]; });
      return { rowIndex: i + 1, data: data };
    }
  }
  return null;
}

// — lista de regalos —

function listRegalos() {
  var sheet = getSheet(SHEET_REGALOS);
  if (!sheet) return [];
  var rows = sheet.getDataRange().getValues();
  var aportes = sumAportesPorRegalo();

  var regalos = [];
  for (var i = 1; i < rows.length; i++) { // fila 0 = encabezados
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
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][0]).trim();
    if (!id) continue;
    totales[id] = (totales[id] || 0) + Number(rows[i][2] || 0);
  }
  return totales;
}

function handleAporte(data) {
  var regaloId = String(data.regalo_id || "").trim();
  var monto = Number(data.monto);
  var nombre = String(data.nombre || "").trim();

  if (!regaloId) return jsonOut({ error: "falta el regalo" });
  if (!nombre) return jsonOut({ error: "falta el nombre" });
  if (!monto || monto <= 0) return jsonOut({ error: "el monto tiene que ser mayor a 0" });

  var regalos = listRegalos();
  if (!regalos.some(function (r) { return r.id === regaloId; })) {
    return jsonOut({ error: "ese regalo ya no existe" });
  }

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

  var sheet = getSheet(SHEET_APORTES);
  sheet.appendRow([
    regaloId,
    nombre,
    monto,
    String(data.mensaje || ""),
    comprobanteUrl,
    new Date().toISOString(),
  ]);

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
