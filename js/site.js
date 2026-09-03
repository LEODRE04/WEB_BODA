// site.js — interactividad del prototipo v3 (sin build step, JS plano).
// FASE 3 (en curso): el RSVP habla con W.rsvp.apiUrl (config.js) — en
// desarrollo local es server/dev_api.py con una lista de invitados de
// prueba (server/invitados.json); en producción será el Google Apps
// Script real (ver docs/RSVP-BACKEND.md). Si la API no responde, cae
// solo a guardar en localStorage — no se rompe nada mientras tanto.

(function () {
  "use strict";
  var W = window.WEDDING || {};

  // El navegador puede "recordar" el scroll de la visita anterior y
  // restaurarlo solo, incluso con el sobre tapando todo — lo desactivamos
  // para que siempre arranque arriba (además del scrollTo explícito al
  // abrir el sobre, más abajo).
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  // Marca "esto no vino de nuestra API" (p.ej. el 404 HTML de GitHub Pages
  // antes de desplegar el backend real) para distinguirlo de un error de
  // validación real que sí hay que mostrarle al usuario.
  function BackendUnavailable() {}
  BackendUnavailable.prototype = Object.create(Error.prototype);

  ready(init);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function init() {
    initNav();
    initPhotoFallbacks();
    initCountdown();
    initCopyButtons();
    initDynamicLinks();
    initMusicToggle();
    initPetals();
    initSaveDateCalendar();

    // Se resuelve una sola vez el invitado del link (?codigo=...) y se
    // comparte entre el saludo de arriba y el formulario de RSVP, para no
    // consultar la API dos veces.
    var codigo = new URLSearchParams(window.location.search).get("codigo");
    var guestPromise = codigo ? fetchGuest(codigo) : Promise.resolve(null);

    // thanksModal necesita codigo/guestPromise (tipo_invitacion, nombre del
    // invitado) para armar el pase descargable — por eso se crea recién
    // acá, después de tenerlos, y no arriba junto a los demás init*().
    var thanksModal = initThanksModal(codigo, guestPromise);

    applyInvitationType(guestPromise);
    initGuestGreeting(codigo, guestPromise);
    initEnvelopeGate(codigo, guestPromise);
    initRsvpForm(codigo, guestPromise, thanksModal);
    initGiftListLink(codigo);
  }

  // "Agregar al calendario" en "Reserva la fecha": arma un .ics al vuelo
  // (funciona con Apple/Google/Outlook Calendar) en vez de depender de un
  // link a un solo proveedor — no requiere backend ni conexión.
  function initSaveDateCalendar() {
    var btn = document.querySelector("#save-date-calendar");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var start = new Date(W.weddingDateISO);
      if (isNaN(start.getTime())) return;
      var end = new Date(start.getTime() + 5 * 60 * 60 * 1000); // 5h: ceremonia + recepción, aprox.

      function toICSDate(d) {
        return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      }
      function icsEscape(s) {
        return String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
      }

      var nombres = W.couple ? W.couple.a + " & " + W.couple.b : "André & Krisli";
      var lugar = W.venue ? W.venue.name + ", " + W.venue.area : "";
      var ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Boda " + nombres + "//ES",
        "BEGIN:VEVENT",
        "UID:boda-" + start.getTime() + "@leodre04.github.io",
        "DTSTAMP:" + toICSDate(new Date()),
        "DTSTART:" + toICSDate(start),
        "DTEND:" + toICSDate(end),
        "SUMMARY:" + icsEscape("Boda de " + nombres),
        "LOCATION:" + icsEscape(lugar),
        "DESCRIPTION:" + icsEscape("Nos encantaría contar contigo ese día."),
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "Boda-Andre-y-Krisli.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  // La lista de regalos elegible vive en su propia página (regalos.html)
  // — acá solo se le pasa el ?codigo= para que allá precargue el nombre
  // en "De parte de", igual que hace el RSVP.
  function initGiftListLink(codigo) {
    var link = document.querySelector("#gift-list-link");
    if (link && codigo) link.href = "regalos.html?codigo=" + encodeURIComponent(codigo);
  }

  // Invitación solo a la ceremonia (tipo_invitacion en la lista de
  // invitados, ver docs/RSVP-BACKEND.md): agrega una clase al <body> que
  // oculta por CSS todo lo marcado [data-reception-only] — ubicación de
  // la recepción y campos del RSVP que no aplican.
  function applyInvitationType(guestPromise) {
    // Por defecto se asume lo más restrictivo (solo ceremonia): si alguien
    // borra el "?codigo=" del link, escribe uno inventado, o el backend no
    // responde, NO debe ver que existe una recepción. Solo se desbloquea
    // la versión completa cuando el backend CONFIRMA un código válido con
    // tipo_invitacion "completa".
    // (Esto no oculta el HTML del navegador: alguien con las herramientas
    // de desarrollador podría igual ver el contenido marcado
    // [data-reception-only]. Frena el "borro el link y miro", no a alguien
    // que abre el inspector a propósito.)
    document.body.classList.add("solo-ceremonia");
    guestPromise.then(function (guest) {
      if (guest && guest.found && guest.tipo_invitacion !== "ceremonia") {
        document.body.classList.remove("solo-ceremonia");
      }
    });
  }

  // Arma "1 pase reservado" / "3 pases reservados" + "la ceremonia" /
  // "la ceremonia y la recepción" — lo usan el saludo de arriba y el sobre.
  function guestPassInfo(guest) {
    var passes = 1 + (Number(guest.acompanantes_permitidos) || 0);
    return {
      passLabel: passes === 1 ? "1 pase reservado" : passes + " pases reservados",
      evento: guest.tipo_invitacion === "ceremonia" ? "la ceremonia" : "la ceremonia y la recepción",
    };
  }

  // — saludo personalizado arriba de la página, para quien entra con un
  // link de invitado (?codigo=...): nombre + cuántos pases tiene. Mientras
  // se resuelve el fetch (puede tardar 1-2s contra el backend real) se ve
  // un loader en vez de un hueco en blanco — pero solo si hay "codigo" en
  // el link: a un visitante sin código nunca le prometemos algo que no va
  // a llegar. —
  function initGuestGreeting(codigo, guestPromise) {
    var el = document.querySelector("#guest-greeting");
    if (!el) return;
    var loading = el.querySelector("[data-guest-loading]");
    var ready = el.querySelector("[data-guest-ready]");
    if (codigo && loading) {
      el.hidden = false;
      loading.hidden = false;
    }
    guestPromise.then(function (guest) {
      if (loading) loading.hidden = true;
      if (!guest || !guest.found) { el.hidden = true; return; } // no reconocido o API caída: no se muestra nada
      var info = guestPassInfo(guest);
      el.querySelector("[data-guest-text]").textContent =
        "¡Hola, " + guest.nombre + "! Nos encantaría que nos acompañes en " + info.evento + " — tienes " + info.passLabel + " para ti.";
      if (ready) ready.hidden = false;
      el.hidden = false;
    });
  }

  // — sobre de apertura (tema "elegante dorado", ver css/theme-elegante.css):
  // muestra el mismo dato de pases antes de abrir, y anima la apertura. —
  function initEnvelopeGate(codigo, guestPromise) {
    var gate = document.querySelector("#envelope-gate");
    if (!gate) return;

    // Si ya abrió el sobre antes en esta misma sesión del navegador —
    // por ejemplo, volviendo de la lista de regalos (regalos.html) con
    // "← Volver a la invitación" — no lo vuelve a tapar todo: sigue
    // directo a la página ya abierta. sessionStorage a propósito (no
    // localStorage): en una visita nueva de verdad (otro día) sí lo
    // vuelve a ver, es solo para no repetirlo dentro de la misma visita.
    var yaAbrio = false;
    try { yaAbrio = sessionStorage.getItem("envelope_opened") === "1"; } catch (e) {}
    if (yaAbrio) {
      gate.hidden = true;
      // El navegador intenta saltar al #ancla de la URL (p.ej. "#rsvp"
      // al volver desde el modal de agradecimiento de un regalo) antes
      // de que este script corra, pero con el sobre todavía tapando
      // todo ese salto no sirve de nada — hay que repetirlo ya con el
      // sobre afuera. Se repite varias veces porque el layout todavía
      // se sigue moviendo un rato (foto grande cargando, banner de
      // "Hola, {nombre}" que aparece cuando responde la API) — sin esto
      // el salto puede quedar corto si algo de eso corre después.
      // behavior:"instant" a propósito: con el "scroll-behavior: smooth"
      // global (site.css), un scrollIntoView disparado por script (no
      // por un clic real) puede quedarse pegado en 0 sin completar la
      // animación — instantáneo evita ese problema y además no tiene
      // sentido animar un salto que pasa apenas se abre la página.
      if (window.location.hash) {
        var target = document.querySelector(window.location.hash);
        if (target) {
          var irAlAncla = function () { target.scrollIntoView({ block: "start", behavior: "instant" }); };
          irAlAncla();
          setTimeout(irAlAncla, 300);
          setTimeout(irAlAncla, 900);
          window.addEventListener("load", irAlAncla);
        }
      }
      return;
    }

    var guestText = gate.querySelector("#envelope-guest-text");
    var guestLoading = gate.querySelector("#envelope-guest-loading");
    if (codigo && guestLoading) guestLoading.hidden = false;
    guestPromise.then(function (guest) {
      if (guestLoading) guestLoading.hidden = true;
      if (!guest || !guest.found || !guestText) return;
      var info = guestPassInfo(guest);
      guestText.textContent = "Con amor hemos reservado para ti (" + guest.nombre + "): " + info.passLabel + ", para " + info.evento + ".";
      guestText.hidden = false;
    });

    var btn = gate.querySelector("#envelope-open-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (gate.classList.contains("is-opening")) return; // evita doble click
      // Si llegó con un link a una sección (o quedó scrolleado de antes),
      // que al abrir el sobre siempre arranque desde arriba.
      window.scrollTo(0, 0);
      gate.classList.add("is-opening");
      try { sessionStorage.setItem("envelope_opened", "1"); } catch (e) {}
      setTimeout(function () { gate.classList.add("is-open"); }, 650);
      setTimeout(function () { gate.hidden = true; window.scrollTo(0, 0); }, 1300);
    });
  }

  // — nav móvil —
  function initNav() {
    var nav = document.querySelector(".site-nav");
    var toggle = document.querySelector(".nav-toggle");
    if (!nav || !toggle) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // — placeholders de foto: si la <img> real (img/p1.jpg, etc.) carga,
  // se oculta la etiqueta "foto pendiente"; si falla (o no existe todavía),
  // se remueve la imagen rota y se deja el placeholder visible. —
  function initPhotoFallbacks() {
    document.querySelectorAll(".photo img").forEach(function (img) {
      var slot = img.closest(".photo");
      img.addEventListener("load", function () {
        if (slot) slot.classList.add("has-img");
      });
      img.addEventListener("error", function () {
        img.remove();
      });
      if (img.complete && img.naturalWidth > 0 && slot) {
        slot.classList.add("has-img");
      }
    });
  }

  // — cuenta regresiva —
  // Actualiza TODAS las apariciones de cada unidad (hay un countdown en la
  // portada y otro en el pie de página, ambos con los mismos data-countdown).
  function initCountdown() {
    var els = {
      dias: document.querySelectorAll('[data-countdown="dias"]'),
      horas: document.querySelectorAll('[data-countdown="horas"]'),
      mins: document.querySelectorAll('[data-countdown="mins"]'),
      segs: document.querySelectorAll('[data-countdown="segs"]'),
    };
    if (!els.dias.length || !W.weddingDateISO) return;
    var target = new Date(W.weddingDateISO).getTime();

    // Pequeño "tick" (rebote) cada vez que el número realmente cambia —
    // se ve en las dos apariciones (portada y pie de página).
    function setAll(nodeList, text) {
      nodeList.forEach(function (el) {
        if (el.textContent === text) return;
        el.textContent = text;
        el.classList.remove("tick");
        void el.offsetWidth; // fuerza reflow para poder repetir la animación
        el.classList.add("tick");
      });
    }

    function tick() {
      var diff = Math.max(0, target - Date.now());
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400);
      s -= d * 86400;
      var h = Math.floor(s / 3600);
      s -= h * 3600;
      var m = Math.floor(s / 60);
      s -= m * 60;
      setAll(els.dias, String(d));
      setAll(els.horas, pad2(h));
      setAll(els.mins, pad2(m));
      setAll(els.segs, pad2(s));
    }
    tick();
    setInterval(tick, 1000);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // — pétalos cayendo (decorativo): la forma y la caída están en CSS
  // (.petal, @keyframes petal-fall en site.css) — acá solo se generan N
  // pétalos con tamaño/velocidad/balanceo al azar (para que no caigan
  // todos idénticos, se vería mecánico) y se reparten por el ancho de la
  // pantalla. Respeta "menos movimiento": si el visitante lo prefiere, ni
  // siquiera se generan (además el CSS los oculta por si acaso). —
  function initPetals() {
    var container = document.querySelector(".petals");
    if (!container) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var count = window.innerWidth < 640 ? 8 : 14;
    for (var i = 0; i < count; i++) {
      var petal = document.createElement("span");
      petal.className = "petal";
      var size = 8 + Math.random() * 10; // 8-18px
      var duration = 11 + Math.random() * 9; // 11-20s: caída lenta y pareja
      var sway = 20 + Math.random() * 45; // 20-65px de balanceo
      var opacity = 0.5 + Math.random() * 0.35;
      petal.style.left = (Math.random() * 100).toFixed(1) + "%";
      petal.style.setProperty("--size", size.toFixed(1) + "px");
      petal.style.setProperty("--duration", duration.toFixed(1) + "s");
      // delay negativo: arranca a mitad de camino de su propia animación,
      // así no caen todos juntos desde arriba al cargar la página.
      petal.style.setProperty("--delay", (-Math.random() * duration).toFixed(1) + "s");
      petal.style.setProperty("--sway", sway.toFixed(0) + "px");
      petal.style.setProperty("--opacity", opacity.toFixed(2));
      container.appendChild(petal);
    }
  }

  // — música de fondo (tema "elegante dorado"): arranca al abrir el sobre
  // (ese clic cuenta como interacción real del usuario, así que el
  // navegador sí permite reproducir sonido ahí) y queda un botón flotante
  // para pausar/reanudar. Si no existe #bg-music (tema apagado), no hace
  // nada. —
  function initMusicToggle() {
    var audio = document.querySelector("#bg-music");
    var btn = document.querySelector("#music-toggle");
    if (!audio || !btn) return;

    var iconPlaying = btn.querySelector(".icon-playing");
    var iconPaused = btn.querySelector(".icon-paused");
    var label = btn.querySelector("#music-toggle-text");

    var revealTimer = null;
    function revealBriefly() {
      // Muestra la pastilla con el texto un momento sola (sin necesitar
      // :hover) — en el celular no existe el hover que la revela, así que
      // sin esto el botón nunca explica qué hace al tocarlo. Se dispara
      // acá mismo (cada cambio de estado: al aparecer y en cada toque).
      btn.classList.add("is-revealed");
      clearTimeout(revealTimer);
      revealTimer = setTimeout(function () { btn.classList.remove("is-revealed"); }, 1800);
    }

    function setPlayingUI(isPlaying) {
      // .hidden (la propiedad, no el atributo) no existe en elementos SVG,
      // así que asignarla no hacía nada — el ícono nunca cambiaba. Se
      // alterna el atributo "hidden" directamente, que sí funciona en
      // cualquier elemento vía la regla [hidden]{display:none} del navegador.
      iconPlaying.toggleAttribute("hidden", !isPlaying);
      iconPaused.toggleAttribute("hidden", isPlaying);
      var text = isPlaying ? "Pausar música" : "Reanudar música";
      btn.setAttribute("aria-pressed", String(isPlaying));
      btn.setAttribute("aria-label", text);
      if (label) label.textContent = text;
      revealBriefly();
    }

    btn.addEventListener("click", function () {
      if (audio.paused) {
        audio.play().then(function () { setPlayingUI(true); }).catch(function () {});
      } else {
        audio.pause();
        setPlayingUI(false);
      }
    });

    var gate = document.querySelector("#envelope-gate");
    var openBtn = gate && gate.querySelector("#envelope-open-btn");
    if (openBtn) {
      openBtn.addEventListener("click", function () {
        btn.hidden = false;
        audio.play().then(function () { setPlayingUI(true); }).catch(function () { setPlayingUI(false); });
      });
    }

    // Pausa sola al salir de la pestaña (cambiar de pestaña, minimizar) o del
    // navegador (cambiar de app con el navegador de fondo), y reanuda al
    // volver — pero solo si fue ella la que pausó; si el invitado la pausó
    // a mano con el botón, se queda pausada aunque vuelva a la pestaña.
    var pausedAutomatically = false;
    function handleAutoPause(shouldPause) {
      if (shouldPause) {
        if (!audio.paused) {
          audio.pause();
          pausedAutomatically = true;
          setPlayingUI(false);
        }
      } else if (pausedAutomatically) {
        pausedAutomatically = false;
        audio.play().then(function () { setPlayingUI(true); }).catch(function () {});
      }
    }
    document.addEventListener("visibilitychange", function () { handleAutoPause(document.hidden); });
    window.addEventListener("blur", function () { handleAutoPause(true); });
    window.addEventListener("focus", function () { handleAutoPause(false); });
  }

  // — copiar Yape / cuentas bancarias —
  function initCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        copyText(text).then(function (ok) {
          var row = btn.closest(".money-row");
          var original = btn.textContent;
          btn.textContent = ok ? "Copiado" : "No se pudo";
          if (row) row.classList.toggle("copied", ok);
          setTimeout(function () {
            btn.textContent = original;
            if (row) row.classList.remove("copied");
          }, 1500);
        });
      });
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return false; }
      );
    }
    // Fallback para contextos sin Clipboard API (http:// en LAN, navegadores viejos).
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return Promise.resolve(ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  // Ceremonia y recepción son dos lugares distintos con su propia config
  // (W.venue / W.venueReception) — este helper elige cuál según el
  // atributo data-maps-url="ceremonia"|"recepcion" (etc.) de cada elemento.
  function venueConfigFor(key) {
    return key === "recepcion" ? W.venueReception : W.venue;
  }

  // — enlaces que dependen de datos "por confirmar" en config.js —
  function initDynamicLinks() {
    document.querySelectorAll("[aria-disabled='true']").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (el.getAttribute("aria-disabled") === "true") e.preventDefault();
      });
    });
    document.querySelectorAll("[data-maps-url]").forEach(function (maps) {
      var v = venueConfigFor(maps.getAttribute("data-maps-url"));
      if (v && v.mapsUrl) {
        maps.href = v.mapsUrl;
        maps.removeAttribute("aria-disabled");
      }
    });
    document.querySelectorAll("[data-directions-url]").forEach(function (dir) {
      var v = venueConfigFor(dir.getAttribute("data-directions-url"));
      if (v && (v.directionsUrl || v.mapsUrl)) {
        dir.href = v.directionsUrl || v.mapsUrl;
        dir.removeAttribute("aria-disabled");
      }
    });
    document.querySelectorAll("[data-maps-embed]").forEach(function (embed) {
      var v = venueConfigFor(embed.getAttribute("data-maps-embed"));
      if (v && v.mapEmbedSrc) {
        var iframe = document.createElement("iframe");
        iframe.src = v.mapEmbedSrc;
        // Sin loading="lazy" a propósito: esta página solo tiene 1-2 mapas
        // (no una lista larga), así que no hay nada que ganar retrasando la
        // carga — y sí se pierde, porque "lazy" espera a que el mapa esté
        // cerca de la pantalla para recién pedirlo, entonces se ve cargar
        // en vivo justo cuando el invitado llega a esa sección. Con carga
        // eager (default) el mapa ya pidió sus tiles desde que abrió la
        // página, y para cuando el invitado baja hasta acá ya está listo.
        iframe.referrerPolicy = "no-referrer-when-downgrade";
        embed.innerHTML = "";
        embed.appendChild(iframe);
      }
    });
    // querySelectorAll (no solo el primero): el botón de WhatsApp aparece
    // más de una vez — junto al RSVP y de nuevo en el modal de agradecimiento.
    var waButtons = document.querySelectorAll("[data-whatsapp]");
    if (waButtons.length && W.rsvp && W.rsvp.whatsapp) {
      var text = W.rsvp.whatsappMessage ? "?text=" + encodeURIComponent(W.rsvp.whatsappMessage) : "";
      var href = "https://wa.me/" + W.rsvp.whatsapp + text;
      waButtons.forEach(function (wa) {
        wa.href = href;
        wa.hidden = false;
      });
      var pending = document.querySelector("[data-whatsapp-pending]");
      if (pending) pending.hidden = true;
    }
  }

  // — modal de agradecimiento al confirmar el RSVP (sí / no asiste) —
  // Mensaje personalizado con el nombre y el número de asistentes que
  // acaba de escribir en el formulario, y un resumen (cuándo/dónde) con
  // los datos de config.js — así no queda un texto genérico igual para
  // todos. Basado en un mockup revisado en claude.ai/design.
  function initThanksModal(codigo, guestPromise) {
    var modal = document.querySelector("#rsvp-thanks");
    if (!modal) return null;
    var W = window.WEDDING || {};
    var closeBtn = modal.querySelector("#rsvp-thanks-close");
    var msgYes = modal.querySelector("#rsvp-thanks-msg-yes");
    var msgNo = modal.querySelector("#rsvp-thanks-msg-no");
    var countEl = modal.querySelector("#rsvp-thanks-count");
    var whenEl = modal.querySelector("#rsvp-thanks-when");
    var whereEl = modal.querySelector("#rsvp-thanks-where");
    var noteEl = modal.querySelector("#rsvp-thanks-note");
    var paseBtn = modal.querySelector("#rsvp-thanks-pase");
    var editUntil = (W.rsvp && W.rsvp.editUntilLabel) || "la fecha límite";

    // tipo_invitacion no viene en el POST del formulario (solo nombre,
    // num_asistentes, asistencia) — se saca del mismo guestPromise que ya
    // usa el resto de la página, resuelto una sola vez.
    var tipoInvitacion = "completa";
    guestPromise.then(function (guest) {
      if (guest && guest.found) tipoInvitacion = guest.tipo_invitacion || "completa";
    });

    var lastInfo = null;
    if (paseBtn) {
      paseBtn.addEventListener("click", function () {
        if (!lastInfo || !window.WeddingPase) return;
        window.WeddingPase.descargar({
          nombre: lastInfo.nombre,
          numAsistentes: parseInt(lastInfo.num_asistentes, 10) || 1,
          tipoInvitacion: tipoInvitacion,
          codigo: codigo,
        }, paseBtn);
      });
    }

    function open(attending, info) {
      info = info || {};
      lastInfo = info;
      var nombre = (info.nombre || "").trim().split(" ")[0]; // solo el primer nombre, más cercano
      var asistentes = parseInt(info.num_asistentes, 10) || 1;

      modal.querySelectorAll("[data-thanks-attending]").forEach(function (el) { el.hidden = !attending; });
      modal.querySelectorAll("[data-thanks-declined]").forEach(function (el) { el.hidden = attending; });

      if (attending) {
        msgYes.textContent = (nombre ? "Gracias por decir que sí, " + nombre + ". " : "Gracias por decir que sí. ") +
          "Saber que vas a estar con nosotros ese día nos hace muy felices — ya tienes tu lugar reservado.";
        countEl.textContent = asistentes === 1 ? "1 persona" : asistentes + " personas";
        whenEl.textContent = W.weddingDateLabel || "";
        whereEl.textContent = (W.venue && W.venue.name) || "";
        noteEl.textContent = "Te esperamos con muchas ganas. Puedes editar tu respuesta hasta el " + editUntil + ".";
      } else {
        msgNo.textContent = (nombre ? "Gracias por avisarnos, " + nombre + ". " : "Gracias por avisarnos. ") +
          "Te vamos a extrañar ese día, pero entendemos y agradecemos mucho que te hayas tomado el tiempo de contarnos.";
        noteEl.textContent = "Si tus planes cambian, puedes avisarnos hasta el " + editUntil + ".";
      }

      modal.hidden = false;
      requestAnimationFrame(function () { modal.classList.add("is-open"); });
    }
    function close() {
      modal.classList.remove("is-open");
      setTimeout(function () { modal.hidden = true; }, 200);
    }

    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    return { open: open };
  }

  // — formulario de confirmación —
  function initRsvpForm(codigo, guestPromise, thanksModal) {
    var form = document.querySelector("#rsvp-form");
    if (!form) return;

    var nombreInput = form.querySelector('[name="nombre"]');
    var asistentesInput = form.querySelector('[name="num_asistentes"]');
    var codigoInput = form.querySelector("#rsvp-codigo");
    var banner = form.querySelector("#rsvp-guest-banner");
    var submitBtn = form.querySelector("#rsvp-submit");
    var savedState = initRsvpSavedState(form, codigo, guestPromise);

    function showBanner(text, isWarning) {
      banner.textContent = text;
      banner.classList.toggle("is-warning", !!isWarning);
      banner.hidden = false;
    }

    // Invitado identificado por link personal: pagina.html?codigo=familia-garcia
    // Precarga nombre y número de asistentes (fijos — ver más abajo por
    // qué), y si ya había respondido antes, si va o no (para editarla). Si
    // el código no existe, o si la API no responde (todavía no hay backend
    // desplegado), el formulario sigue funcionando abierto, como antes.
    if (codigo) {
      codigoInput.value = codigo;
      guestPromise.then(function (guest) {
        if (!guest) return; // sin respuesta de la API: formulario abierto normal
        if (!guest.found) {
          showBanner("No reconocemos este link de invitación, pero puedes confirmar igual.", true);
          return;
        }
        nombreInput.value = guest.nombre;
        nombreInput.readOnly = true;
        asistentesInput.value = 1 + (Number(guest.acompanantes_permitidos) || 0);

        if (guest.respuesta) {
          if (guest.respuesta.asistencia) {
            var radio = form.querySelector('input[name="asistencia"][value="' + guest.respuesta.asistencia + '"]');
            if (radio) radio.checked = true;
          }
          submitBtn.textContent = "Actualizar";
          // Ya respondió antes: se muestra el resumen guardado en vez del
          // formulario (basado en un mockup de claude.ai/design) — "Editar
          // mi respuesta" en ese resumen vuelve a mostrar el formulario.
          if (savedState) savedState.show(guest.respuesta);
        } else {
          showBanner("Confirmando para: " + guest.nombre);
        }
      });
    }
    // Sin código: el formulario queda abierto y editable, como antes
    // (nombre y número de asistentes normales, sin precargar).

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      data.enviado_en = new Date().toISOString();

      var errorEl = form.querySelector(".rsvp-error");
      if (!data.nombre || !data.asistencia) {
        errorEl.textContent = "Completa tu nombre y si podrás asistir.";
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      // Estado de envío: con el backend real la respuesta puede tardar
      // uno o dos segundos — sin esto, nada indica que el clic funcionó y
      // invita a apretar "Confirmar" de nuevo.
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";

      submitRSVP(data)
        .then(function () {
          var success = form.querySelector(".rsvp-success");
          if (success) success.classList.add("show");
          if (thanksModal) thanksModal.open(data.asistencia === "si", data);
          if (savedState) savedState.show(data);
          submitBtn.textContent = originalLabel;
        })
        .catch(function (err) {
          errorEl.textContent = err.message || "No se pudo enviar tu confirmación. Intenta de nuevo.";
          errorEl.hidden = false;
          console.error("RSVP error:", err);
          submitBtn.textContent = originalLabel;
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }

  // — estado guardado del RSVP: una vez que el invitado ya respondió, el
  // formulario se reemplaza por este resumen (con botón para editar hasta
  // la fecha de W.rsvp.editUntilLabel) en vez de quedar siempre visible. Basado en un
  // mockup de claude.ai/design, adaptado a los datos reales que guardamos
  // (sin menú/acompañante por nombre/canción, que ese mockup sí traía). —
  function initRsvpSavedState(form, codigo, guestPromise) {
    var block = document.querySelector("#rsvp-saved");
    if (!block) return null;
    var W = window.WEDDING || {};
    var titleEl = document.querySelector("#rsvp-title");
    var ledeEl = document.querySelector("#rsvp-lede");
    var iconEl = block.querySelector("#rsvp-saved-icon");
    var cardTitleEl = block.querySelector("#rsvp-saved-title");
    var dateEl = block.querySelector("#rsvp-saved-date");
    var tagEl = block.querySelector("#rsvp-saved-tag");
    var nombreEl = block.querySelector("#rsvp-saved-nombre");
    var asistentesWrap = block.querySelector("#rsvp-saved-asistentes-wrap");
    var asistentesEl = block.querySelector("#rsvp-saved-asistentes");
    var paseBtn = block.querySelector("#rsvp-saved-pase");
    var editBtn = block.querySelector("#rsvp-saved-edit");
    var noteEl = block.querySelector("#rsvp-saved-note");
    var editUntil = (W.rsvp && W.rsvp.editUntilLabel) || "la fecha límite";

    var tipoInvitacion = "completa";
    guestPromise.then(function (guest) {
      if (guest && guest.found) tipoInvitacion = guest.tipo_invitacion || "completa";
    });

    var lastData = null;
    if (paseBtn) {
      paseBtn.addEventListener("click", function () {
        if (!lastData || !window.WeddingPase) return;
        window.WeddingPase.descargar({
          nombre: lastData.nombre,
          numAsistentes: parseInt(lastData.num_asistentes, 10) || 1,
          tipoInvitacion: tipoInvitacion,
          codigo: codigo,
        }, paseBtn);
      });
    }

    var originalTitle = titleEl ? titleEl.textContent : "";
    var originalLede = ledeEl ? ledeEl.innerHTML : "";

    var ICON_CHECK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    var ICON_HEART = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10.2-9.1C.4 9.7 0 8.4 0 7.1 0 3.9 2.5 1.5 5.6 1.5c1.9 0 3.6.9 4.9 2.4C11.8 2.4 13.5 1.5 15.4 1.5c3.1 0 5.6 2.4 5.6 5.6 0 1.3-.4 2.6-1.8 4.8C16.5 16.4 9 21 9 21"/></svg>';

    function formatDateEs(iso) {
      if (!iso) return "";
      try {
        return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
      } catch (e) {
        return "";
      }
    }

    function show(data) {
      data = data || {};
      lastData = data;
      var attending = data.asistencia === "si";
      var nombre = (data.nombre || "").trim();
      var firstName = nombre.split(" ")[0];
      var asistentes = parseInt(data.num_asistentes, 10) || 1;

      if (titleEl) titleEl.textContent = attending ? "Nos alegra tenerte aquí" : "Te vamos a extrañar";
      if (ledeEl) {
        ledeEl.textContent = attending
          ? (firstName ? "Tu lugar ya está guardado, " + firstName + ". " : "Tu lugar ya está guardado. ") +
            "Nos vemos el " + (W.weddingDateLabel || "pronto") + ""
          : (firstName ? "Gracias por avisarnos, " + firstName + ". " : "Gracias por avisarnos. ") +
            "Te vamos a extrañar ese día, y te agradecemos mucho el cariño de siempre.";
      }

      iconEl.innerHTML = attending ? ICON_CHECK : ICON_HEART;
      iconEl.classList.toggle("sage", !attending);
      cardTitleEl.textContent = attending ? "Asistencia confirmada" : "Respuesta registrada";
      dateEl.textContent = "Respondiste el " + formatDateEs(data.actualizado_en || data.enviado_en);
      tagEl.textContent = attending ? "Sí, ahí estaré" : "No podré ir";
      tagEl.className = "tag " + (attending ? "tag-accent" : "tag-accent-2");
      nombreEl.textContent = nombre;
      asistentesWrap.hidden = !attending;
      if (attending) asistentesEl.textContent = asistentes === 1 ? "1 persona" : asistentes + " personas";
      if (paseBtn) paseBtn.hidden = !attending;
      noteEl.textContent = attending
        ? "Puedes editar tu respuesta hasta el " + editUntil + "."
        : "Si tus planes cambian, puedes avisarnos hasta el " + editUntil + ".";

      form.hidden = true;
      block.hidden = false;
    }

    function hide() {
      block.hidden = true;
      form.hidden = false;
      if (titleEl) titleEl.textContent = originalTitle;
      if (ledeEl) ledeEl.innerHTML = originalLede;
    }

    if (editBtn) editBtn.addEventListener("click", hide);

    return { show: show, hide: hide };
  }

  // Busca a un invitado por su código (?codigo=...). Devuelve null si la API
  // no está disponible todavía (formulario sigue abierto, sin restricciones).
  function fetchGuest(codigo) {
    var url = W.rsvp && W.rsvp.apiUrl;
    if (!url) return Promise.resolve(null);
    return fetch(url + "?codigo=" + encodeURIComponent(codigo), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Punto único de integración con el backend (fase 3). Intenta mandar la
  // confirmación a W.rsvp.apiUrl. El éxito/error se decide por el CONTENIDO
  // del JSON (campo "error"), no por el código HTTP: Google Apps Script
  // (el backend real, ver docs/RSVP-BACKEND.md) siempre responde 200 así
  // que el status por sí solo no sirve para distinguir nada.
  // - Si la API respondió con {"error": "..."} -> es un error de validación
  //   real (código inválido, supera acompañantes permitidos) y se muestra.
  // - Si la respuesta no es JSON (p.ej. el 404 HTML de GitHub Pages porque
  //   el backend real aún no está desplegado) o falla la red -> cae a
  //   guardar en localStorage, sin romper nada.
  function submitRSVP(data) {
    var url = W.rsvp && W.rsvp.apiUrl;
    if (!url) return saveLocal(data);

    return fetch(url, {
      method: "POST",
      // "text/plain" a propósito (no "application/json"): así el navegador
      // no manda un preflight CORS, que Google Apps Script no responde bien.
      // El cuerpo sigue siendo JSON válido; ambos backends (mock local y
      // Apps Script) lo leen igual sin mirar este header.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
    }).then(function (r) {
      return r.json().then(
        function (body) {
          if (body && body.error) throw new Error(body.error);
        },
        function () {
          throw new BackendUnavailable(); // la respuesta no era JSON
        }
      );
    }).catch(function (err) {
      if (err instanceof TypeError || err instanceof BackendUnavailable) {
        console.warn("No se pudo contactar al backend (¿aún no desplegado?), guardando localmente:", err);
        return saveLocal(data);
      }
      throw err;
    });
  }

  function saveLocal(data) {
    return new Promise(function (resolve) {
      var key = "rsvp_responses";
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(data);
      localStorage.setItem(key, JSON.stringify(list));
      console.info("RSVP guardado localmente (sin backend):", data);
      resolve();
    });
  }

  // Expuesto para poder inspeccionar/objetar respuestas guardadas desde la consola:
  // window.__rsvpResponses() mientras no hay panel de administración.
  window.__rsvpResponses = function () {
    return JSON.parse(localStorage.getItem("rsvp_responses") || "[]");
  };
})();
