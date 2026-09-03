// pase.js — genera y descarga el "pase de invitación" en PDF, al confirmar
// asistencia (modal de agradecimiento) o al volver a ver la respuesta ya
// guardada. Todo pasa en el navegador: arma una tarjeta oculta con los
// datos del invitado (mismos tokens de color/tipografía del sitio, ver
// css/site.css bajo "pase de invitación"), la convierte a imagen con
// html2canvas y la mete en un PDF de una sola página con jsPDF. Las tres
// librerías (qrcode-generator, html2canvas, jsPDF) viven en js/vendor/ y
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
    "js/vendor/qrcode.min.js",
    "js/vendor/html2canvas-pro.min.js",
    "js/vendor/jspdf.umd.min.js",
  ];
  var vendorPromise = null;

  // Se cargan en orden y una sola vez (clics repetidos reusan la misma
  // promesa) — jsPDF y html2canvas no dependen entre sí, pero mantener el
  // orden fijo evita pedir los tres en paralelo sin necesidad.
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
  function buildRecomendaciones(tipoInvitacion, hora, W) {
    var soloCeremonia = tipoInvitacion === "ceremonia";
    // hora ya viene con su propio "." final (toLocaleTimeString en es-PE
    // da "4:00 p. m.") — se le quita antes de armar la oración para no
    // terminar con dos puntos seguidos ("p. m..").
    var horaSinPunto = hora.replace(/\.+$/, "");
    return [
      "Llega 30 minutos antes; la ceremonia empieza puntual a las " + horaSinPunto + ".",
      "Hay estacionamiento alrededor del recinto, con personal de seguridad.",
      soloCeremonia
        ? "Durante la ceremonia te pedimos guardar el celular."
        : "Durante la ceremonia te pedimos guardar el celular. En la recepción, todas las fotos que quieras.",
      "La celebración es solo para adultos, con excepción de los niños que forman parte de la ceremonia.",
      soloCeremonia
        ? "Este pase es personal y es válido para la ceremonia."
        : "Este pase es personal y cubre los dos momentos: ceremonia y recepción.",
      "Si tus planes cambian, avísanos hasta el " + ((W.rsvp && W.rsvp.editUntilLabel) || "la fecha límite") + ".",
    ];
  }

  function buildNode(opts, W) {
    var start = new Date(W.weddingDateISO);
    var diaSemana = start.toLocaleDateString("es-PE", { weekday: "long", timeZone: "America/Lima" });
    diaSemana = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);
    var dia = pad2(start.getDate());
    var mesAnio = start.toLocaleDateString("es-PE", { month: "long", year: "numeric", timeZone: "America/Lima" });
    mesAnio = mesAnio.charAt(0).toUpperCase() + mesAnio.slice(1);
    var hora = start.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Lima" }).replace(/^0/, "");
    var year = start.getFullYear();
    var pases = opts.numAsistentes || 1;

    var origin = window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
    var inviteUrl = origin + "index.html?codigo=" + encodeURIComponent(opts.codigo || "");

    var wrap = document.createElement("div");
    wrap.className = "pase-card";
    wrap.innerHTML =
      '<div class="pase-kicker">Asistencia confirmada</div>' +
      '<div class="pase-heading">' + escapeHtml(W.couple.a) + ' <span class="pase-amp">&amp;</span> ' + escapeHtml(W.couple.b) + '</div>' +
      '<div class="pase-divider"></div>' +
      '<div class="pase-kicker">Invitación a nombre de</div>' +
      '<div class="pase-nombre">' + escapeHtml(opts.nombre || "Invitado") + '</div>' +
      '<div class="pase-pases"><span>Pases</span><strong>' + pases + '</strong></div>' +
      '<div class="pase-date-block">' +
        '<div class="pase-date-kicker">' + escapeHtml(diaSemana) + '</div>' +
        '<div class="pase-date-row">' +
          '<span class="pase-date-day">' + dia + '</span>' +
          '<span class="pase-date-month">' + escapeHtml(mesAnio) + '</span>' +
        '</div>' +
        '<div class="pase-date-time">' + hora + '</div>' +
        '<div class="pase-date-venue">' + escapeHtml(W.venue.name) + '<br>' + escapeHtml(W.venue.area) + '</div>' +
      '</div>' +
      '<div class="pase-info-row">' +
        '<div class="pase-info-col"><span class="pase-info-label">Llegada</span><strong>2:30 p.m.</strong><p>La ceremonia empieza puntual.</p></div>' +
        '<div class="pase-info-col"><span class="pase-info-label">Vestimenta</span><strong>' + escapeHtml(W.dressCode.title) + '</strong><p>Blanco reservado para la novia.</p></div>' +
        '<div class="pase-info-col"><span class="pase-info-label">Código de pase</span><strong>' + codigoPase(opts.codigo, year) + '</strong><p>Solo de referencia.</p></div>' +
      '</div>' +
      '<div class="pase-divider"></div>' +
      '<div class="pase-bottom">' +
        '<div class="pase-recs">' +
          '<div class="pase-info-label">Recomendaciones</div>' +
          '<ol class="pase-rec-list"></ol>' +
        '</div>' +
        '<div class="pase-qr"><img class="pase-qr-img" alt="Código QR con el link a la invitación"><p>Escanéalo para volver<br>a tu invitación</p></div>' +
      '</div>' +
      '<div class="pase-footer">' +
        '<span>Mesa de regalos y mapa en la invitación web.</span>' +
        '<strong>' + escapeHtml(W.couple.a) + ' &amp; ' + escapeHtml(W.couple.b) + ' · ' + dia + ' · ' + pad2(start.getMonth() + 1) + ' · ' + year + '</strong>' +
      '</div>';

    var recList = wrap.querySelector(".pase-rec-list");
    buildRecomendaciones(opts.tipoInvitacion, hora, W).forEach(function (texto) {
      var li = document.createElement("li");
      li.textContent = texto;
      recList.appendChild(li);
    });

    var qr = window.qrcode(0, "M");
    qr.addData(inviteUrl);
    qr.make();
    wrap.querySelector(".pase-qr-img").src = qr.createDataURL(6, 2);

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
        return new Promise(function (resolve) { setTimeout(resolve, 50); }).then(function () {
          return window.html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        });
      })
      .then(function (canvas) {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF({ unit: "px", format: [canvas.width, canvas.height], hotfixes: ["px_scaling"] });
        doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
        doc.save("Pase-Boda-" + sanitizeFilename(opts.nombre) + ".pdf");
        if (triggerBtn) triggerBtn.textContent = originalLabel;
      })
      .catch(function (err) {
        console.error("No se pudo generar el pase:", err);
        if (host && host.parentNode) host.parentNode.removeChild(host);
        if (triggerBtn) {
          triggerBtn.textContent = "No se pudo, intenta de nuevo";
          setTimeout(function () { triggerBtn.textContent = originalLabel; }, 2500);
        }
      })
      .finally(function () {
        if (triggerBtn) triggerBtn.disabled = false;
      });
  }

  return { descargar: descargar };
})();
