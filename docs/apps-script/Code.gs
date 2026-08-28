/**
 * Backend real del RSVP — vive dentro del Google Sheet (Extensiones > Apps
 * Script), no necesita hosting aparte. Mismo contrato que
 * server/dev_api.py (el mock que se usa en desarrollo local), así que
 * cambiar de uno a otro es solo cambiar rsvp.apiUrl en js/config.js —
 * nada del frontend tiene que cambiar.
 *
 * Espera un Google Sheet con 2 pestañas:
 *
 *   Invitados   (una fila por invitado, la cargan ustedes a mano)
 *     código | nombre | acompañantes_permitidos | tipo_invitacion
 *     (tipo_invitacion: "completa" = ceremonia + recepción, o
 *     "ceremonia" = solo ceremonia — deja la celda vacía y cuenta como
 *     "completa")
 *
 *   Respuestas  (se llena sola cuando alguien confirma)
 *     codigo | nombre | contacto | asistencia | num_acompanantes | menu |
 *     acompanante_1_nombre | acompanante_1_menu |
 *     acompanante_2_nombre | acompanante_2_menu |
 *     alergias | cancion | mensaje | enviado_en | actualizado_en
 *
 * Deploy: Extensiones > Apps Script > pega este archivo > Desplegar >
 * Nueva implementación > tipo "Aplicación web" > Ejecutar como "Yo" >
 * Quién tiene acceso "Cualquier usuario" > Desplegar. Copia la URL que
 * termina en /exec y ponla en js/config.js como rsvp.apiUrl.
 */

var SHEET_INVITADOS = "Invitados";
var SHEET_RESPUESTAS = "Respuestas";

var RESPUESTA_COLUMNAS = [
  "codigo", "nombre", "contacto", "asistencia", "num_acompanantes", "menu",
  "acompanante_1_nombre", "acompanante_1_menu",
  "acompanante_2_nombre", "acompanante_2_menu",
  "alergias", "cancion", "mensaje", "enviado_en", "actualizado_en",
];

// Nota: ContentService no permite devolver códigos de estado HTTP propios
// (Apps Script Web Apps siempre responden 200). Por eso el frontend
// (submitRSVP en js/site.js) decide éxito/error mirando el campo "error"
// del JSON, no el status HTTP — funciona igual contra este backend real
// que contra server/dev_api.py.

function doGet(e) {
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

  var codigo = (data.codigo || "").trim();
  if (codigo) {
    var guest = findGuest(codigo);
    if (!guest) return jsonOut({ error: "código de invitado no reconocido" });
    var numAcomp = Number(data.num_acompanantes || 0);
    if (numAcomp > guest.acompanantes_permitidos) {
      return jsonOut({ error: "supera los acompañantes permitidos (" + guest.acompanantes_permitidos + ")" });
    }
  }

  if (!data.nombre || !data.contacto || !data.asistencia) {
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
  var key = codigo || data.contacto;
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
    if (String(rows[i][0]).trim() === key || String(rows[i][2]).trim() === key) { // codigo o contacto
      var data = {};
      RESPUESTA_COLUMNAS.forEach(function (col, j) { data[col] = rows[i][j]; });
      return { rowIndex: i + 1, data: data };
    }
  }
  return null;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
