// site.js — interactividad del prototipo v3 (sin build step, JS plano).
// FASE 3 (en curso): el RSVP habla con W.rsvp.apiUrl (config.js) — en
// desarrollo local es server/dev_api.py con una lista de invitados de
// prueba (server/invitados.json); en producción será el Google Apps
// Script real (ver docs/RSVP-BACKEND.md). Si la API no responde, cae
// solo a guardar en localStorage — no se rompe nada mientras tanto.

(function () {
  "use strict";
  var W = window.WEDDING || {};

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

    // Se resuelve una sola vez el invitado del link (?codigo=...) y se
    // comparte entre el saludo de arriba y el formulario de RSVP, para no
    // consultar la API dos veces.
    var codigo = new URLSearchParams(window.location.search).get("codigo");
    var guestPromise = codigo ? fetchGuest(codigo) : Promise.resolve(null);

    applyInvitationType(guestPromise);
    initGuestGreeting(guestPromise);
    initRsvpForm(codigo, guestPromise);
  }

  // Invitación solo a la ceremonia (tipo_invitacion en la lista de
  // invitados, ver docs/RSVP-BACKEND.md): agrega una clase al <body> que
  // oculta por CSS todo lo marcado [data-reception-only] — itinerario,
  // ubicación de la recepción, y campos del RSVP que no aplican.
  function applyInvitationType(guestPromise) {
    guestPromise.then(function (guest) {
      if (guest && guest.found && guest.tipo_invitacion === "ceremonia") {
        document.body.classList.add("solo-ceremonia");
      }
    });
  }

  // — saludo personalizado arriba de la página, para quien entra con un
  // link de invitado (?codigo=...): nombre + cuántos pases tiene. —
  function initGuestGreeting(guestPromise) {
    var el = document.querySelector("#guest-greeting");
    if (!el) return;
    guestPromise.then(function (guest) {
      if (!guest || !guest.found) return; // sin código, no reconocido, o API no disponible: no se muestra nada
      var passes = 1 + (Number(guest.acompanantes_permitidos) || 0);
      var passLabel = passes === 1 ? "1 pase reservado" : passes + " pases reservados";
      var evento = guest.tipo_invitacion === "ceremonia" ? "la ceremonia" : "la ceremonia y la recepción";
      el.querySelector("[data-guest-text]").textContent =
        "¡Hola, " + guest.nombre + "! Nos encantaría que nos acompañes en " + evento + " — tienes " + passLabel + " para ti.";
      el.hidden = false;
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
  function initCountdown() {
    var els = {
      dias: document.querySelector('[data-countdown="dias"]'),
      horas: document.querySelector('[data-countdown="horas"]'),
      mins: document.querySelector('[data-countdown="mins"]'),
      segs: document.querySelector('[data-countdown="segs"]'),
    };
    if (!els.dias || !W.weddingDateISO) return;
    var target = new Date(W.weddingDateISO).getTime();

    function tick() {
      var diff = Math.max(0, target - Date.now());
      var s = Math.floor(diff / 1000);
      var d = Math.floor(s / 86400);
      s -= d * 86400;
      var h = Math.floor(s / 3600);
      s -= h * 3600;
      var m = Math.floor(s / 60);
      s -= m * 60;
      els.dias.textContent = String(d);
      els.horas.textContent = pad2(h);
      els.mins.textContent = pad2(m);
      els.segs.textContent = pad2(s);
    }
    tick();
    setInterval(tick, 1000);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
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
        iframe.loading = "lazy";
        iframe.referrerPolicy = "no-referrer-when-downgrade";
        embed.innerHTML = "";
        embed.appendChild(iframe);
      }
    });
    var wa = document.querySelector("[data-whatsapp]");
    if (wa && W.rsvp && W.rsvp.whatsapp) {
      var text = W.rsvp.whatsappMessage ? "?text=" + encodeURIComponent(W.rsvp.whatsappMessage) : "";
      wa.href = "https://wa.me/" + W.rsvp.whatsapp + text;
      wa.hidden = false;
      var pending = document.querySelector("[data-whatsapp-pending]");
      if (pending) pending.hidden = true;
    }
  }

  // — formulario de confirmación —
  function initRsvpForm(codigo, guestPromise) {
    var form = document.querySelector("#rsvp-form");
    if (!form) return;

    var addCompanionBtn = form.querySelector("#rsvp-add-companion");
    var companionsWrap = form.querySelector("#rsvp-companions");
    var acompanantesSelect = form.querySelector("#rsvp-acompanantes");
    var codigoInput = form.querySelector("#rsvp-codigo");
    var banner = form.querySelector("#rsvp-guest-banner");
    var submitBtn = form.querySelector("#rsvp-submit");
    var companionCount = 0;
    var MAX_COMPANIONS = 2;

    function setMaxCompanions(max) {
      MAX_COMPANIONS = max;
      var current = acompanantesSelect.value;
      acompanantesSelect.innerHTML = "";
      for (var i = 0; i <= max; i++) {
        var opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = i === 0 ? "Sin acompañantes" : i + (i === 1 ? " acompañante" : " acompañantes");
        acompanantesSelect.appendChild(opt);
      }
      if (Number(current) <= max) acompanantesSelect.value = current;
      addCompanionBtn.disabled = companionCount >= MAX_COMPANIONS;
      var maxLabel = form.querySelector("#rsvp-max-label");
      if (maxLabel) maxLabel.textContent = "máx. " + max;
    }

    function addCompanionCard(prefillNombre, prefillMenu) {
      if (companionCount >= MAX_COMPANIONS) return;
      companionCount++;
      var card = document.createElement("div");
      card.className = "companion-card";
      card.innerHTML =
        '<div style="font-size:12px;color:rgba(32,30,29,.7);margin-bottom:8px">Acompañante ' +
        companionCount +
        '</div><div class="row">' +
        '<input class="input" name="acompanante_' + companionCount + '_nombre" placeholder="Nombre completo">' +
        '<select class="input" name="acompanante_' + companionCount + '_menu" data-reception-only>' +
        "<option>Carne</option><option>Pescado</option><option>Vegetariano</option><option>Sin gluten</option>" +
        "</select></div>";
      companionsWrap.appendChild(card);
      if (prefillNombre) card.querySelector("input").value = prefillNombre;
      if (prefillMenu) card.querySelector("select").value = prefillMenu;
      if (companionCount >= MAX_COMPANIONS) addCompanionBtn.disabled = true;
    }

    if (addCompanionBtn) {
      addCompanionBtn.addEventListener("click", function () {
        addCompanionCard();
      });
    }

    function showBanner(text, isWarning) {
      banner.textContent = text;
      banner.classList.toggle("is-warning", !!isWarning);
      banner.hidden = false;
    }

    // Invitado identificado por link personal: pagina.html?codigo=familia-garcia
    // Precarga nombre, límite real de acompañantes, y si ya había respondido
    // antes, toda su respuesta (para editarla). Si el código no existe, o si
    // la API no responde (todavía no hay backend desplegado), el formulario
    // sigue funcionando abierto, como hasta ahora.
    var params = new URLSearchParams(window.location.search);
    if (codigo) {
      codigoInput.value = codigo;
      guestPromise.then(function (guest) {
        if (!guest) return; // sin respuesta de la API: formulario abierto normal
        if (!guest.found) {
          showBanner("No reconocemos este link de invitación, pero puedes confirmar igual.", true);
          return;
        }
        setMaxCompanions(guest.acompanantes_permitidos);
        form.querySelector('[name="nombre"]').value = guest.nombre;

        if (guest.respuesta) {
          showBanner("Ya habías confirmado como " + guest.nombre + " — puedes actualizar tu respuesta.");
          fillForm(form, guest.respuesta, addCompanionCard);
          submitBtn.textContent = "Actualizar confirmación";
        } else {
          showBanner("Confirmando para: " + guest.nombre);
        }
      });
    } else {
      // Fallback antiguo, sin código: solo escribe el nombre en el campo.
      var invitado = params.get("invitado");
      if (invitado) form.querySelector('[name="nombre"]').value = invitado;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      data.enviado_en = new Date().toISOString();

      // Campos ocultos (menú, alergias, canción) igual viajan en el
      // FormData con su valor por defecto aunque no se vean — se limpian
      // para que la respuesta guardada no traiga datos que no aplican.
      if (document.body.classList.contains("solo-ceremonia")) {
        ["menu", "alergias", "cancion"].forEach(function (k) { delete data[k]; });
        [1, 2].forEach(function (i) { delete data["acompanante_" + i + "_menu"]; });
      }

      var errorEl = form.querySelector(".rsvp-error");
      if (!data.nombre || !data.contacto || !data.asistencia) {
        errorEl.textContent = "Completa nombre, contacto y si podrás asistir.";
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      submitRSVP(data)
        .then(function () {
          var success = form.querySelector(".rsvp-success");
          if (success) success.classList.add("show");
          var keepCodigo = data.codigo;
          form.reset();
          codigoInput.value = keepCodigo || "";
          companionsWrap.innerHTML = "";
          companionCount = 0;
          addCompanionBtn.disabled = false;
        })
        .catch(function (err) {
          errorEl.textContent = err.message || "No se pudo enviar tu confirmación. Intenta de nuevo.";
          errorEl.hidden = false;
          console.error("RSVP error:", err);
        });
    });
  }

  // Rellena el formulario con una respuesta previa (para editarla).
  function fillForm(form, r, addCompanionCard) {
    if (r.contacto) form.querySelector('[name="contacto"]').value = r.contacto;
    if (r.asistencia) {
      var radio = form.querySelector('input[name="asistencia"][value="' + r.asistencia + '"]');
      if (radio) radio.checked = true;
    }
    if (r.num_acompanantes != null) form.querySelector('[name="num_acompanantes"]').value = r.num_acompanantes;
    if (r.menu) form.querySelector('[name="menu"]').value = r.menu;
    if (r.alergias) form.querySelector('[name="alergias"]').value = r.alergias;
    if (r.cancion) form.querySelector('[name="cancion"]').value = r.cancion;
    if (r.mensaje) form.querySelector('[name="mensaje"]').value = r.mensaje;
    [1, 2].forEach(function (i) {
      var nombre = r["acompanante_" + i + "_nombre"];
      if (nombre) addCompanionCard(nombre, r["acompanante_" + i + "_menu"]);
    });
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
