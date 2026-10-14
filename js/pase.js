// pase.js — genera y descarga el "pase de invitación" en PDF, al confirmar
// asistencia (modal de agradecimiento) o al volver a ver la respuesta ya
// guardada. Todo pasa en el navegador: arma una tarjeta oculta con los
// datos del invitado (mismos tokens de color/tipografía del sitio, ver
// css/site.css bajo "pase de invitación"), la convierte a imagen con
// html2canvas y la mete en un PDF de una sola página con jsPDF. Las dos
// librerías (html2canvas, jsPDF) viven en js/vendor/ y
// recién se cargan al primer clic — no pesan nada si nadie descarga el
// pase. Basado en un mockup de claude.ai/design ("Pase de invitación"),
// adaptado a los tokens del sitio y a los datos reales del RSVP.
window.WeddingPase = (function () {
  "use strict";

  // OJO: html2canvas-pro, no html2canvas a secas — el original no
  // entiende color-mix() (lo usa medio tokens.css/theme-elegante.css:
  // sombras, --color-divider, textos atenuados) y tira "unsupported
  // color function" apenas intenta capturar la tarjeta. Mismo nombre
  // de función global (window.html2canvas), mismo API — es un
  // reemplazo directo. Ver también el comentario sobre esto en
  // css/site.css, bajo ".pase-card".
  var VENDOR_SCRIPTS = [
    "js/vendor/html2canvas-pro.min.js",
    "js/vendor/jspdf.umd.min.js",
  ];
  var vendorPromise = null;
  var ESCALA = 4;

  // Se cargan en orden y una sola vez (clics repetidos reusan la misma
  // promesa) — jsPDF y html2canvas no dependen entre sí, pero mantener el
  // orden fijo evita pedir los dos en paralelo sin necesidad.
  function loadVendor() {
    if (vendorPromise) return vendorPromise;
    vendorPromise = VENDOR_SCRIPTS.reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = src;
          s.onload = resolve;
          s.onerror = function () { reject(new Error("No se pudo cargar " + src)); };
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return vendorPromise;
  }

  function pad2(n) { return String(n).length < 2 ? "0" + n : String(n); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Código de pase corto y estable por invitado — puramente decorativo
  // (no hay lector ni validación en la puerta), pero sale siempre igual
  // para el mismo invitado.
  function codigoPase(codigo, year) {
    var s = String(codigo || "");
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var n = h % 10000;
    return "AK-" + year + "-" + (n < 1000 ? ("000" + n).slice(-4) : n);
  }

  function sanitizeFilename(s) {
    var clean = String(s || "invitado")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return clean || "invitado";
  }

  // Mismo contenido que las preguntas frecuentes de index.html — evita que
  // el pase diga algo distinto a lo que dice el resto de la invitación.
  function buildRecomendaciones(tipoInvitacion, W) {
    var soloCeremonia = tipoInvitacion === "ceremonia";
    return [
      "Te recomendamos llegar a la iglesia a las " + W.arrivalLabel + " para ubicarte con calma.",
      "Hay estacionamiento alrededor del recinto, con personal de seguridad.",
      "La celebración es solo para adultos, con excepción de los niños que forman parte de la ceremonia.",
      soloCeremonia
        ? "Este pase es personal y es válido para la ceremonia."
        : "Este pase es personal y cubre los dos momentos: ceremonia y recepción.",
      "Si tus planes cambian, avísanos hasta el " + ((W.rsvp && W.rsvp.editUntilLabel) || "la fecha límite") + ".",
    ];
  }

  function buildNode(opts, W) {
    // Idioma de la página (js/i18n.js): en inglés, fechas en inglés y el
    // pase entero traducido antes de convertirlo en PDF.
    var I = window.I18N || { locale: "es-PE", tr: function (x) { return x; }, traducir: function () {} };
    var start = new Date(W.weddingDateISO);
    var diaSemana = start.toLocaleDateString(I.locale, { weekday: "long", timeZone: "America/Lima" });
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
    // Día y año en hora de Lima, igual que el día de la semana y el mes:
    // con getDate() un invitado en Asia u Oceanía veía "10" en vez de "09".
    var enLima = function (campo) {
      var o = { timeZone: "America/Lima" }; o[campo] = "numeric";
      return Number(start.toLocaleDateString("en-US", o));
    };
    var dia = pad2(enLima("day"));
    var mesAnio = start.toLocaleDateString(I.locale, { month: "long", year: "numeric", timeZone: "America/Lima" });
    mesAnio = mesAnio.charAt(0).toUpperCase() + mesAnio.slice(1);
    var year = enLima("year");
    var pases = opts.numAsistentes || 1;

    // Diseño minimalista: papel blanco con un filete fino, los ramos de
    // las esquinas del sitio, la manuscrita solo en los nombres y nada de
    // bloques de color. Sin QR: nadie lo escanea en la puerta.
    var wrap = document.createElement("div");
    wrap.className = "pase-card";
    wrap.innerHTML =
      '<img class="pase-flor pase-flor-izq" src="img/floral-corner.png" alt="">' +
      '<img class="pase-flor pase-flor-der" src="img/floral-corner.png" alt="">' +
      '<div class="pase-kicker">Asistencia confirmada</div>' +
      '<div class="pase-heading">' + escapeHtml(W.couple.a) + ' <span class="pase-amp">&amp;</span> ' + escapeHtml(W.couple.b) + '</div>' +
      '<div class="pase-orn" aria-hidden="true"><span></span>✦<span></span></div>' +
      '<div class="pase-kicker">Invitación a nombre de</div>' +
      '<div class="pase-nombre" data-no-traducir>' + escapeHtml(opts.nombre || "Invitado") + '</div>' +
      '<div class="pase-pases"><span>Pases</span><strong>' + pases + '</strong></div>' +
      '<div class="pase-fecha">' +
        '<span class="pase-fecha-lado">' + escapeHtml(diaSemana) + '</span>' +
        '<span class="pase-fecha-dia">' + dia + '</span>' +
        '<span class="pase-fecha-lado">' + escapeHtml(mesAnio) + '</span>' +
      '</div>' +
      '<div class="pase-lugar">' + escapeHtml(W.venue.name) + '<br>' + escapeHtml(W.venue.area) + '</div>' +
      '<div class="pase-info-row">' +
        '<div class="pase-info-col"><span class="pase-info-label">Llegada</span><strong>' + escapeHtml(W.arrivalLabel) + '</strong></div>' +
        '<div class="pase-info-col"><span class="pase-info-label">Vestimenta</span><strong>' + escapeHtml(W.dressCode.title) + '</strong></div>' +
        '<div class="pase-info-col"><span class="pase-info-label">Código de pase</span><strong>' + codigoPase(opts.codigo, year) + '</strong></div>' +
      '</div>' +
      '<div class="pase-recs">' +
        '<div class="pase-info-label">Recomendaciones</div>' +
        '<ol class="pase-rec-list"></ol>' +
      '</div>' +
      '<div class="pase-footer">Mesa de regalos y mapa en la invitación web.</div>';

    var recList = wrap.querySelector(".pase-rec-list");
    buildRecomendaciones(opts.tipoInvitacion, W).forEach(function (texto) {
      var li = document.createElement("li");
      li.textContent = texto;
      recList.appendChild(li);
    });

    I.traducir(wrap);
    return wrap;
  }

  // opts: { nombre, numAsistentes, tipoInvitacion, codigo }. triggerBtn es
  // opcional — si se pasa, se deshabilita con un texto de "Generando…"
  // mientras se arma el PDF (toma uno o dos segundos, sobre todo la
  // primera vez que carga las librerías).
  function descargar(opts, triggerBtn) {
    var W = window.WEDDING || {};
    if (!W.weddingDateISO || !W.venue) return;
    var originalLabel = triggerBtn ? triggerBtn.textContent : "";
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = "Generando…"; }

    // La pestaña se reserva ACÁ, sincrónicamente dentro del clic: armar el
    // PDF tarda unos segundos y para entonces el navegador ya no considera
    // que haya un gesto del usuario, así que un window.open() posterior lo
    // bloquearía el filtro de pop-ups. Se abre vacía y se le pone el PDF
    // cuando está listo. Si el invitado tiene los pop-ups bloqueados,
    // ventanaPase queda en null y más abajo se cae a la descarga normal.
    var ventanaPase = null;
    try {
      ventanaPase = window.open("", "_blank");
      if (ventanaPase) ventanaPase.document.write("<title>" + (window.I18N ? window.I18N.tr("Preparando tu pase…") : "Preparando tu pase…") + "</title>");
    } catch (e) {
      ventanaPase = null;
    }

    var host = null;
    loadVendor()
      .then(function () {
        return document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      })
      .then(function () {
        var node = buildNode(opts, W);
        host = document.createElement("div");
        // position:fixed + left fuera de pantalla (no display:none, que
        // html2canvas no puede capturar) — se ve renderizado de verdad
        // para la captura, pero ningún invitado lo llega a ver.
        host.style.cssText = "position:fixed;top:0;left:-10000px;z-index:-1;";
        host.appendChild(node);
        document.body.appendChild(host);

        // Un pequeño margen para que el navegador termine de resolver el
        // layout (fuentes ya cargadas por document.fonts.ready). OJO: acá
        // se usaba antes un doble requestAnimationFrame, pero rAF se
        // pausa por completo en pestañas sin foco/en segundo plano — si
        // el invitado cambia de pestaña justo después de tocar el botón,
        // esa promesa nunca se resuelve y el pase queda "Generando…" para
        // siempre. setTimeout sí sigue corriendo en segundo plano.
        // Los ramos tienen que estar cargados antes de capturar, o salen
        // huecos. Si una imagen falla, el pase sale igual sin ella.
        var flores = Array.prototype.map.call(node.querySelectorAll("img"), function (img) {
          return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        });
        return Promise.all(flores).then(function () {
          return new Promise(function (resolve) { setTimeout(resolve, 50); });
        }).then(function () {
          // Escala 4 (antes 2): la tarjeta mide 460px, así que la imagen
          // sale de 1840px de ancho — unos 380 ppp en la hoja, nítida
          // incluso con zoom o impresa.
          return window.html2canvas(node, { scale: ESCALA, backgroundColor: "#ffffff", useCORS: true });
        });
      })
      .then(function (canvas) {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        var jsPDF = window.jspdf.jsPDF;
        // La hoja mide lo que la tarjeta en pantalla (1px = 0,75pt), no lo
        // que la imagen: así el visor la abre a tamaño natural y la imagen
        // de alta resolución queda comprimida dentro, en vez de una hoja
        // gigante que el visor achica.
        var w = canvas.width / ESCALA * 0.75, h = canvas.height / ESCALA * 0.75;
        var doc = new jsPDF({ unit: "pt", format: [w, h], orientation: w > h ? "landscape" : "portrait" });
        doc.addImage(canvas, "PNG", 0, 0, w, h, undefined, "FAST");

        // doc.save() dispara una descarga que en celular (y en Safari) se
        // abre encima de la invitación y el invitado la pierde. Se abre en
        // la pestaña reservada; desde el visor puede guardarlo o
        // compartirlo, y la invitación se queda intacta detrás.
        var nombreArchivo = "Pase-Boda-" + sanitizeFilename(opts.nombre) + ".pdf";
        if (ventanaPase && !ventanaPase.closed) {
          var url = URL.createObjectURL(doc.output("blob"));
          ventanaPase.location.href = url;
          // Revocar después: hacerlo de una cancelaría la carga. Una vez
          // que el visor tiene el documento, revocar ya no le afecta.
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
        } else {
          doc.save(nombreArchivo); // pop-ups bloqueados: descarga de siempre
        }
        if (triggerBtn) triggerBtn.textContent = originalLabel;
      })
      .catch(function (err) {
        console.error("No se pudo generar el pase:", err);
        if (host && host.parentNode) host.parentNode.removeChild(host);
        // Sin esto quedaría una pestaña en blanco abierta al fallar.
        if (ventanaPase && !ventanaPase.closed) ventanaPase.close();
        if (triggerBtn) {
          triggerBtn.textContent = "No pudimos generarlo. Inténtalo de nuevo";
          setTimeout(function () { triggerBtn.textContent = originalLabel; }, 2500);
        }
      })
      .finally(function () {
        if (triggerBtn) triggerBtn.disabled = false;
      });
  }

  return { descargar: descargar };
})();
