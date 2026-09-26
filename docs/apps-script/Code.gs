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
 *     código | nombre | acompañantes_permitidos | tipo_invitacion |
 *     abierto_en | ultima_apertura | aperturas
 *     (tipo_invitacion: "completa" = ceremonia + recepción, o
 *     "ceremonia" = solo ceremonia — deja la celda vacía y cuenta como
 *     "completa")
 *     (las tres últimas se llenan solas cuando el invitado abre su link:
 *     ustedes solo ponen el encabezado y no las tocan más)
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
// Primera de las 3 columnas de seguimiento en Invitados (E, F y G):
// abierto_en | ultima_apertura | aperturas.
var APERTURA_COL = 5;
var APORTE_COLUMNAS = ["regalo_id", "nombre", "monto", "mensaje", "comprobante_url", "fecha"];
// Id reservado para el aviso "Ya transferí" de la mesa de regalos: alguien
// avisa que depositó por Yape o transferencia, sin que corresponda a
// ningún regalo de la lista.
var APORTE_DEPOSITO = "deposito";

// Topes a lo que puede escribir un invitado. El frontend ya comprime las
// capturas a 1000px (~100-300 KB), así que el tope de la imagen solo
// frena envíos anómalos que llenarían el Drive.
var MAX_NOMBRE = 120;
var MAX_MENSAJE = 1000;
var MAX_COMPROBANTE_B64 = 6 * 1024 * 1024;

// Inyección de fórmulas: en Sheets, un texto que empieza con = + - @ se
// guarda como FÓRMULA, no como texto. Un "mensaje para los novios" como
// =IMPORTXML("https://...";...) se ejecutaría al abrir la hoja y podría
// sacar datos hacia afuera. El apóstrofo inicial fuerza texto literal
// (no se ve en la celda). Solo se aplica a strings: los números
// (num_asistentes, monto) se escriben tal cual.
function celda(v, max) {
  if (typeof v !== "string") return v == null ? "" : v;
  var s = v.trim();
  if (max && s.length > max) s = s.slice(0, max);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

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
// Cómo se muestran las fechas que escribe el script (Respuestas y
// Aportes): solo el día. El valor guardado sigue siendo una fecha
// completa, así que se puede ordenar y filtrar.
var FORMATO_FECHA = "dd/mm/yyyy";
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

    registrarApertura(codigo);

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
    // Solo "si" o "no". Antes se guardaba lo que llegara, y el frontend
    // usa este valor dentro de un selector CSS al volver a cargar la
    // invitación: un valor raro (con comillas) rompía la página de ese
    // invitado.
    var asistencia = String(data.asistencia).trim();
    if (asistencia !== "si" && asistencia !== "no") {
      return jsonOut({ error: "respuesta de asistencia no válida" });
    }

    var codigo = String(data.codigo || "").trim();
    var nombre = String(data.nombre).trim().slice(0, MAX_NOMBRE);
    var num = parseInt(data.num_asistentes, 10);
    if (codigo) {
      var guest = findGuest(codigo);
      if (!guest) return jsonOut({ error: "código de invitado no reconocido" });
      // num_asistentes es de solo lectura en el formulario — esto es más una
      // red de seguridad que una validación real, por si alguien lo edita a
      // mano en el navegador.
      var esperado = 1 + guest.acompanantes_permitidos;
      if (isNaN(num) || num < 0) num = asistencia === "si" ? esperado : 0;
      if (num > esperado) {
        return jsonOut({ error: "supera los asistentes de tu invitación (" + esperado + ")" });
      }
      // Con código, el nombre es el de la hoja de Invitados, no el que
      // mande el navegador.
      nombre = String(guest.nombre).trim();
    } else {
      if (isNaN(num) || num < 0) num = asistencia === "si" ? 1 : 0;
      if (num > 10) num = 10;
    }

    // Se arma la fila con los campos permitidos y nada más: antes se
    // copiaba el objeto del navegador entero, y con él las fechas
    // enviado_en/actualizado_en, que cualquiera podía falsear.
    upsertRespuesta(codigo, {
      codigo: codigo,
      nombre: nombre,
      num_asistentes: num,
      asistencia: asistencia,
    });
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

// — "¿ya abrió el link?" —
// El sitio llama a este mismo endpoint en CADA carga con ?codigo= (para
// saber el nombre y cuántos pases tiene), así que la apertura se anota
// acá y el frontend no cambia ni una línea: no hay pedido extra ni
// píxel de rastreo.
//
// Escribe 3 columnas en Invitados: abierto_en (la primera vez, nunca se
// pisa — es la que dice "ya lo vio"), ultima_apertura y aperturas.
//
// Todo va dentro de try/catch a propósito: esto es telemetría, y si
// falla (faltan las columnas, se acabó la cuota de escritura del día)
// el invitado TIENE que ver su invitación igual. Nunca puede tumbar el
// doGet.
//
// Sin LockService, al revés que upsertRespuesta: dos invitados distintos
// escriben filas distintas y no se estorban. El único choque posible es
// el mismo código abriendo dos veces en el mismo instante, y ahí lo peor
// que pasa es que se pierda un +1 del contador — no vale la pena
// serializar todas las cargas de página por eso.
function registrarApertura(codigo) {
  try {
    var sheet = requireSheet(SHEET_INVITADOS);
    // Hoja todavía sin las columnas nuevas: no es un error, simplemente
    // aún no las agregaron. Se sale en silencio.
    if (sheet.getMaxColumns() < APERTURA_COL + 2) return;
    var fila = buscarFilaPorClave(sheet, codigo);
    if (!fila) return;
    var rango = sheet.getRange(fila, APERTURA_COL, 1, 3);
    var v = rango.getValues()[0];
    var ahora = new Date();
    rango.setValues([[v[0] || ahora, ahora, Number(v[2] || 0) + 1]]);
  } catch (err) {
    // Telemetría: se pierde el dato, no la invitación.
  }
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
    var existing = findRespuestaExistente(sheet, codigo, data.nombre);

    var row = RESPUESTA_COLUMNAS.map(function (col) { return celda(data[col], MAX_NOMBRE); });
    // Un Date y no un texto ISO: antes se guardaba "2026-09-26T18:04:11Z",
    // que la hoja trata como texto (no se puede ordenar ni filtrar por
    // fecha) y que además está en UTC, cinco horas adelantado a Lima.
    var ahora = new Date();
    row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = ahora;

    var fila;
    if (existing) {
      row[RESPUESTA_COLUMNAS.indexOf("enviado_en")] = existing.data.enviado_en; // conserva la fecha original
      row[RESPUESTA_COLUMNAS.indexOf("actualizado_en")] = ahora;
      fila = existing.rowIndex;
      sheet.getRange(fila, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      fila = sheet.getLastRow();
    }
    // Solo la fecha, sin hora: es lo que les sirve para leer la hoja.
    sheet.getRange(fila, RESPUESTA_COLUMNAS.indexOf("enviado_en") + 1, 1, 2).setNumberFormat(FORMATO_FECHA);
  } finally {
    lock.releaseLock();
  }
}

// Con código, busca por código (columna A). Sin código, busca por nombre
// (columna B) pero SOLO entre las filas que tampoco tienen código. Antes
// buscaba por nombre en todas: alguien sin link podía pisar la respuesta
// de un invitado real con solo escribir su nombre en el formulario.
function findRespuestaExistente(sheet, codigo, nombre) {
  if (codigo) {
    var fila = buscarFilaPorClave(sheet, codigo);
    return fila ? leerRespuestaEnFila(sheet, fila) : null;
  }
  var ultimaFila = sheet.getLastRow();
  if (ultimaFila < 2) return null;
  var ab = sheet.getRange(2, 1, ultimaFila - 1, 2).getValues();
  for (var i = 0; i < ab.length; i++) {
    if (!String(ab[i][0]).trim() && String(ab[i][1]).trim() === nombre) {
      return leerRespuestaEnFila(sheet, i + 2);
    }
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

  // La captura ya viene comprimida desde el frontend; algo de este tamaño
  // no la manda la página, y sin tope se podría llenar el Drive.
  var b64 = String(data.comprobante_base64 || "");
  if (b64.length > MAX_COMPROBANTE_B64) return jsonOut({ error: "la imagen es demasiado pesada" });
  if (b64 && b64.indexOf("data:") === 0 && b64.indexOf("data:image/") !== 0) {
    return jsonOut({ error: "la constancia tiene que ser una imagen" });
  }

  // El aviso de depósito no va contra un regalo de la lista y no pide
  // nada al invitado: el nombre sale de su ?codigo= (vacío si entró sin
  // link) y no hay monto. Por eso se salta las tres validaciones de
  // abajo. Se guarda en la misma hoja de Aportes para que la pareja los
  // vea todos juntos; como ningún regalo usa este id, no altera el
  // "recaudado" de nadie.
  var esDeposito = regaloId === APORTE_DEPOSITO;
  if (!esDeposito) {
    if (!nombre) return jsonOut({ error: "falta el nombre" });
    if (!monto || monto <= 0) return jsonOut({ error: "el monto tiene que ser mayor a 0" });
    if (!existeRegalo(regaloId)) return jsonOut({ error: "ese regalo ya no existe" });
  }

  // Subir la captura a Drive es lo más lento de todo el request (varios
  // segundos con una foto de celular), así que se hace FUERA del lock —
  // si no, dos personas aportando a la vez se quedarían esperando una a
  // la otra sin necesidad.
  var comprobanteUrl = "";
  if (b64) {
    try {
      comprobanteUrl = guardarComprobante(b64, data.comprobante_nombre, nombre.slice(0, MAX_NOMBRE));
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
    var hojaAportes = requireSheet(SHEET_APORTES);
    hojaAportes.appendRow([
      celda(regaloId),
      celda(nombre, MAX_NOMBRE),
      esDeposito ? 0 : monto,
      celda(String(data.mensaje || ""), MAX_MENSAJE),
      comprobanteUrl,
      new Date(), // fecha real, no texto ISO (ver upsertRespuesta)
    ]);
    hojaAportes.getRange(hojaAportes.getLastRow(), APORTE_COLUMNAS.length).setNumberFormat(FORMATO_FECHA);
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
  var blob = Utilities.newBlob(bytes, "image/jpeg", String(nombreArchivo || "comprobante").slice(0, 80) + ".jpg");
  var folder = getOrCreateCarpetaComprobantes();
  var file = folder.createFile(blob);
  file.setName((nombreAportante || "Sin nombre") + " — " + file.getName());
  // Antes cada captura quedaba "cualquiera con el enlace puede ver": son
  // constancias bancarias (nombre, banco, parte del número de cuenta). El
  // archivo hereda los permisos de la carpeta, que se comparte solo con
  // quienes ya pueden editar la hoja (ver asegurarCarpetaPrivada).
  return file.getUrl();
}

function getOrCreateCarpetaComprobantes() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty("carpeta_comprobantes_id");
  if (folderId) {
    try {
      var existente = DriveApp.getFolderById(folderId);
      asegurarCarpetaPrivada(existente, props);
      return existente;
    } catch (err) {
      // La carpeta se borró o ya no es accesible — se crea otra abajo.
    }
  }
  var folder = DriveApp.createFolder(CARPETA_COMPROBANTES);
  props.setProperty("carpeta_comprobantes_id", folder.getId());
  asegurarCarpetaPrivada(folder, props);
  return folder;
}

// Una sola vez por carpeta: la comparte con los editores de la hoja (así
// la pareja puede abrir las constancias desde cualquiera de sus cuentas)
// y le quita el acceso público a las capturas que se subieron antes de
// este cambio, que quedaban abiertas a cualquiera con el enlace.
function asegurarCarpetaPrivada(folder, props) {
  var marca = "carpeta_privada_" + folder.getId();
  if (props.getProperty(marca)) return;
  try {
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  } catch (err) {}
  try {
    SpreadsheetApp.getActiveSpreadsheet().getEditors().forEach(function (u) {
      try { folder.addViewer(u); } catch (e) {} // el dueño ya tiene acceso
    });
  } catch (err) {}
  var archivos = folder.getFiles();
  while (archivos.hasNext()) {
    try { archivos.next().setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) {}
  }
  props.setProperty(marca, "1");
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}


// ══ prepararHoja — se corre UNA vez, a mano, desde el editor ══════════
// Extensiones > Apps Script > elegir "prepararHoja" arriba > Ejecutar.
// No hace falta volver a desplegar para esto. Se puede correr de nuevo
// sin problema: rehace lo mismo, no duplica nada.
//
// Hace cuatro cosas:
//   1. Pone la zona horaria de la hoja en Lima, para que las fechas no
//      salgan corridas un día cuando alguien responde de noche.
//   2. Convierte a fecha real las fechas viejas que quedaron como texto
//      ISO en Respuestas y Aportes (las de antes de este cambio).
//   3. Agrega a Invitados dos columnas calculadas, "estado" y
//      "recordatorio" (ver columnasDeSeguimiento).
//   4. Crea (o rehace) la pestaña "Resumen" con los totales.
//
// Todo son fórmulas de la hoja, no valores: se actualizan solas con cada
// respuesta nueva, sin volver a correr nada.
var SHEET_RESUMEN = "Resumen";
var URL_INVITACION = "https://leodre04.github.io/WEB_BODA/";

function prepararHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone("America/Lima");

  convertirFechasTexto(requireSheet(SHEET_RESPUESTAS), [5, 6]);
  var aportes = getSheet(SHEET_APORTES);
  if (aportes) convertirFechasTexto(aportes, [APORTE_COLUMNAS.length]);

  columnasDeSeguimiento(requireSheet(SHEET_INVITADOS));
  hojaResumen(ss);
}

function convertirFechasTexto(sheet, columnas) {
  var ultima = sheet.getLastRow();
  if (ultima < 2) return;
  columnas.forEach(function (col) {
    var rango = sheet.getRange(2, col, ultima - 1, 1);
    var v = rango.getValues().map(function (r) {
      var x = r[0];
      if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x)) {
        var d = new Date(x);
        if (!isNaN(d.getTime())) return [d];
      }
      return [x];
    });
    rango.setValues(v);
    rango.setNumberFormat(FORMATO_FECHA);
  });
}

// "estado" (H) y "recordatorio" (I), justo después de las tres de
// apertura (E-G). Cada una es UNA fórmula en la fila del encabezado que
// se extiende sola a todas las filas, así que un invitado que agreguen
// más tarde ya sale con su estado sin copiar nada.
//
//   estado:       Confirmó / No asiste / Leído / Sin abrir
//                 (Leído = abrió el link pero todavía no respondió)
//   recordatorio: solo para "Sin abrir" y "Leído", un enlace que abre
//                 WhatsApp con el mensaje ya escrito, con su nombre y su
//                 link personal. La hoja no tiene teléfonos, así que
//                 WhatsApp pregunta a qué contacto mandarlo.
//
// Las fórmulas se escriben con la sintaxis en inglés (comas), que es la
// que acepta setFormula sin importar el idioma de la hoja.
function columnasDeSeguimiento(sheet) {
  var colEstado = APERTURA_COL + 3;     // H
  var colRecordatorio = colEstado + 1;  // I
  // Si en H o I ya hay algo que no es nuestro (notas, teléfonos…), se
  // para acá en vez de borrarlo.
  var encabezados = sheet.getMaxColumns() >= colRecordatorio
    ? sheet.getRange(1, colEstado, 1, 2).getValues()[0] : ["", ""];
  var libres = (encabezados[0] === "" || encabezados[0] === "estado") &&
    (encabezados[1] === "" || encabezados[1] === "recordatorio");
  if (!libres) {
    throw new Error("Las columnas H e I de Invitados ya tienen datos. Muévanlos a otra columna y vuelvan a correr prepararHoja.");
  }
  if (sheet.getMaxColumns() < colRecordatorio) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), colRecordatorio - sheet.getMaxColumns());
  }
  // Las fórmulas necesitan las filas de abajo vacías para extenderse.
  var ultima = Math.max(sheet.getMaxRows(), 2);
  sheet.getRange(2, colEstado, ultima - 1, 2).clearContent();

  var asistencia = 'IFERROR(VLOOKUP(A2:A, {Respuestas!A2:A, Respuestas!D2:D}, 2, FALSE), "")';
  sheet.getRange(1, colEstado).setFormula(
    '=ARRAYFORMULA({"estado"; IF(A2:A = "", "", ' +
      'IF(' + asistencia + ' = "si", "Confirmó", ' +
      'IF(' + asistencia + ' = "no", "No asiste", ' +
      'IF(E2:E <> "", "Leído", "Sin abrir"))))})'
  );

  var mensaje = '"Hola " & B2:B & ", te recordamos confirmar tu asistencia a nuestra boda antes del 30 de octubre. ' +
    'Aquí está tu invitación: ' + URL_INVITACION + '?codigo=" & A2:A & " — André y Krisli"';
  sheet.getRange(1, colRecordatorio).setFormula(
    '=ARRAYFORMULA({"recordatorio"; IF((H2:H = "Sin abrir") + (H2:H = "Leído"), ' +
      'HYPERLINK("https://wa.me/?text=" & ENCODEURL(' + mensaje + '), "Enviar recordatorio"), "")})'
  );
  sheet.getRange(1, colEstado, 1, 2).setFontWeight("bold");
}

function hojaResumen(ss) {
  var sheet = ss.getSheetByName(SHEET_RESUMEN) || ss.insertSheet(SHEET_RESUMEN, 0);
  sheet.clear();
  var filas = [
    ["Confirmaciones", ""],
    ["Invitaciones enviadas", '=COUNTA(Invitados!A2:A)'],
    ["Pases en total", '=COUNTA(Invitados!A2:A) + SUM(Invitados!C2:C)'],
    ["Confirmaron", '=COUNTIF(Invitados!H2:H, "Confirmó")'],
    ["No asisten", '=COUNTIF(Invitados!H2:H, "No asiste")'],
    ["Leyeron y no respondieron", '=COUNTIF(Invitados!H2:H, "Leído")'],
    ["Sin abrir el link", '=COUNTIF(Invitados!H2:H, "Sin abrir")'],
    ["Respondieron (%)", '=IFERROR((B4 + B5) / B2, 0)'],
    ["Personas que vienen", '=SUMIF(Respuestas!D2:D, "si", Respuestas!C2:C)'],
    ["Días para el cierre (30 oct)", '=MAX(0, DATE(2026, 10, 30) - TODAY())'],
    ["", ""],
    ["Regalos", ""],
    ["Aportado a regalos (S/)", '=SUMIF(Aportes!A2:A, "<>deposito", Aportes!C2:C)'],
    ["Aportes a regalos", '=COUNTIFS(Aportes!A2:A, "<>deposito", Aportes!A2:A, "<>")'],
    ["Avisos de «Ya transferí»", '=COUNTIF(Aportes!A2:A, "deposito")'],
  ];
  // Etiquetas con setValues y cálculos con setFormulas: así las fórmulas
  // entran como fórmulas y no dependen de cómo interprete el texto la hoja.
  sheet.getRange(1, 1, filas.length, 1).setValues(filas.map(function (f) { return [f[0]]; }));
  sheet.getRange(1, 2, filas.length, 1).setFormulas(filas.map(function (f) { return [f[1]]; }));
  sheet.getRange("B8").setNumberFormat("0%");
  sheet.getRange("B13").setNumberFormat("#,##0");
  [1, 12].forEach(function (f) { sheet.getRange(f, 1).setFontWeight("bold").setFontSize(12); });
  sheet.setColumnWidth(1, 240);
  sheet.setColumnWidth(2, 110);
  sheet.getRange(1, 2, filas.length, 1).setHorizontalAlignment("right");
}
