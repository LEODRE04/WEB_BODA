// site.js — interactividad del prototipo v3 (sin build step, JS plano).
// FASE 1 (actual): todo corre en el navegador, el RSVP se guarda en
// localStorage para poder revisar respuestas desde la consola mientras no
// hay backend.
// FASE 3 (próxima): reemplazar submitRSVP() por una llamada fetch() a la API
// real. El resto del formulario (validación, mensajes, UI) no debería
// necesitar cambios — ver docs/RSVP-BACKEND.md.

(function () {
  "use strict";
  var W = window.WEDDING || {};

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
    initRsvpForm();
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

  // — enlaces que dependen de datos "por confirmar" en config.js —
  function initDynamicLinks() {
    document.querySelectorAll("[aria-disabled='true']").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (el.getAttribute("aria-disabled") === "true") e.preventDefault();
      });
    });
    document.querySelectorAll("[data-maps-url]").forEach(function (maps) {
      if (W.venue && W.venue.mapsUrl) {
        maps.href = W.venue.mapsUrl;
        maps.removeAttribute("aria-disabled");
      }
    });
    var embed = document.querySelector("[data-maps-embed]");
    if (embed && W.venue && W.venue.mapEmbedSrc) {
      var iframe = document.createElement("iframe");
      iframe.src = W.venue.mapEmbedSrc;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      embed.innerHTML = "";
      embed.appendChild(iframe);
    }
    var wa = document.querySelector("[data-whatsapp]");
    if (wa && W.rsvp && W.rsvp.whatsapp) {
      wa.href = "https://wa.me/" + W.rsvp.whatsapp;
      wa.hidden = false;
      var pending = document.querySelector("[data-whatsapp-pending]");
      if (pending) pending.hidden = true;
    }
  }

  // — formulario de confirmación —
  function initRsvpForm() {
    var form = document.querySelector("#rsvp-form");
    if (!form) return;

    // Precarga el nombre si llega por link personalizado: pagina.html?invitado=Lucía%20Fernández
    var params = new URLSearchParams(window.location.search);
    var invitado = params.get("invitado");
    if (invitado) {
      var nameInput = form.querySelector('[name="nombre"]');
      if (nameInput) nameInput.value = invitado;
    }

    var addCompanionBtn = form.querySelector("#rsvp-add-companion");
    var companionsWrap = form.querySelector("#rsvp-companions");
    var companionCount = 0;
    var MAX_COMPANIONS = 2;

    if (addCompanionBtn) {
      addCompanionBtn.addEventListener("click", function () {
        if (companionCount >= MAX_COMPANIONS) return;
        companionCount++;
        var card = document.createElement("div");
        card.className = "companion-card";
        card.innerHTML =
          '<div style="font-size:12px;color:rgba(32,30,29,.7);margin-bottom:8px">Acompañante ' +
          companionCount +
          '</div><div class="row">' +
          '<input class="input" name="acompanante_' + companionCount + '_nombre" placeholder="Nombre completo">' +
          '<select class="input" name="acompanante_' + companionCount + '_menu">' +
          "<option>Carne</option><option>Pescado</option><option>Vegetariano</option><option>Sin gluten</option>" +
          "</select></div>";
        companionsWrap.appendChild(card);
        if (companionCount >= MAX_COMPANIONS) addCompanionBtn.disabled = true;
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      data.enviado_en = new Date().toISOString();

      var errorEl = form.querySelector(".rsvp-error");
      if (!data.nombre || !data.contacto || !data.asistencia) {
        if (errorEl) {
          errorEl.textContent = "Completa nombre, contacto y si podrás asistir.";
          errorEl.hidden = false;
        }
        return;
      }
      if (errorEl) errorEl.hidden = true;

      submitRSVP(data)
        .then(function () {
          var success = form.querySelector(".rsvp-success");
          if (success) success.classList.add("show");
          form.reset();
          companionsWrap.innerHTML = "";
          companionCount = 0;
          if (addCompanionBtn) addCompanionBtn.disabled = false;
        })
        .catch(function (err) {
          if (errorEl) {
            errorEl.textContent = "No se pudo enviar tu confirmación. Intenta de nuevo.";
            errorEl.hidden = false;
          }
          console.error("RSVP error:", err);
        });
    });
  }

  // Punto único de integración con el backend (fase 3).
  // Hoy: guarda en localStorage para poder inspeccionar respuestas en dev.
  // Mañana: cambia el cuerpo de esta función por, por ejemplo:
  //   return fetch("/api/rsvp", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify(data),
  //   }).then(function (r) {
  //     if (!r.ok) throw new Error("HTTP " + r.status);
  //   });
  function submitRSVP(data) {
    return new Promise(function (resolve) {
      var key = "rsvp_responses";
      var list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(data);
      localStorage.setItem(key, JSON.stringify(list));
      console.info("RSVP guardado localmente (sin backend todavía):", data);
      resolve();
    });
  }

  // Expuesto para poder inspeccionar/objetar respuestas guardadas desde la consola:
  // window.__rsvpResponses() mientras no hay panel de administración.
  window.__rsvpResponses = function () {
    return JSON.parse(localStorage.getItem("rsvp_responses") || "[]");
  };
})();
