// regalos.js — página separada de la Mesa de regalos elegible
// (regalos.html). Solo lo que hace falta para esta página: copiar
// número/cuenta, y el flujo de elegir un regalo + aportar. El resto de
// site.js (sobre de apertura, RSVP, música, pétalos…) no aplica acá, así
// que no se carga — mismo contrato de backend, ver
// docs/REGALOS-BACKEND.md.
(function () {
  "use strict";
  var W = window.WEDDING || {};

  ready(init);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function init() {
    var codigo = new URLSearchParams(window.location.search).get("codigo");

    // Si llegó con ?codigo=, se lo lleva de vuelta al volver a la
    // invitación (para no perder el saludo/precarga del RSVP) y se usa
    // para precargar el nombre en "De parte de" más abajo.
    var backLink = document.querySelector("#gift-back-link");
    if (backLink && codigo) backLink.href = "index.html?codigo=" + encodeURIComponent(codigo);

    var guestPromise = codigo ? fetchGuest(codigo) : Promise.resolve(null);

    initCopyButtons();
    initGiftRegistry(guestPromise);
    initGiftIntro();
  }

  // — modal "Cómo funciona la lista": se muestra una vez al entrar; si
  // marcan "No mostrar de nuevo" se recuerda en este dispositivo
  // (localStorage), igual que el toggle de música en site.js. —
  function initGiftIntro() {
    var modal = document.querySelector("#gift-intro");
    if (!modal) return;
    try {
      if (localStorage.getItem("gift_intro_dismissed") === "1") return;
    } catch (e) {
      // localStorage no disponible (modo privado, etc.) — se muestra igual.
    }
    var closeBtn = modal.querySelector("#gift-intro-close");
    var dontShow = modal.querySelector("#gift-intro-dontshow");

    function close() {
      modal.classList.remove("is-open");
      setTimeout(function () { modal.hidden = true; }, 200);
      if (dontShow && dontShow.checked) {
        try { localStorage.setItem("gift_intro_dismissed", "1"); } catch (e) {}
      }
    }

    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add("is-open"); });
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });
  }

  function fetchGuest(codigo) {
    var url = W.rsvp && W.rsvp.apiUrl;
    if (!url) return Promise.resolve(null);
    return fetch(url + "?codigo=" + encodeURIComponent(codigo), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // — copiar Yape / cuentas bancarias (igual que en site.js) —
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

  // Compartidas entre initGiftRegistry (la grilla) e initGiftThanks (el
  // modal de agradecimiento) — ambas necesitan formatear montos y armar
  // la misma barra de avance.
  function money(n) { return "S/ " + Number(n || 0).toFixed(0); }

  // — flujo de dos pantallas en celular (inspirado en un mockup de
  // claude.ai/design): "Continuar" pasa de ver la lista a ver el panel
  // de aporte como si fuera otra pantalla, con "← Volver a la lista"
  // para regresar. En escritorio estas clases no hacen nada (las reglas
  // que las usan viven dentro de un @media en site.css) — ahí la lista
  // y el panel ya se ven uno al lado del otro, sin pasos. —
  function isMobileFlow() {
    return window.matchMedia("(max-width: 720px)").matches;
  }
  function showAportarStep() {
    var section = document.querySelector(".gifts");
    if (section) section.classList.add("step-aportar");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function showListStep() {
    var section = document.querySelector(".gifts");
    if (section) section.classList.remove("step-aportar");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function progressNode(g) {
    var falta = Math.max(0, g.precio - g.recaudado);
    var pct = g.precio > 0 ? Math.min(100, Math.round((g.recaudado / g.precio) * 100)) : 0;
    var wrap = document.createElement("div");
    wrap.className = "gift-progress";
    var bar = document.createElement("div");
    bar.className = "gift-progress-bar";
    var fill = document.createElement("span");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    var label = document.createElement("p");
    label.className = "gift-progress-label";
    label.textContent = falta <= 0
      ? "Ya está completo — ¡gracias!"
      : money(g.recaudado) + " reunidos de " + money(g.precio);
    wrap.appendChild(bar);
    wrap.appendChild(label);
    return wrap;
  }

  // — mesa de regalos elegible: lista con avance + panel para aportar
  // (monto libre o completo) por Yape/transferencia, subiendo la captura
  // como constancia. Ver docs/REGALOS-BACKEND.md para el detalle del
  // backend (misma Apps Script del RSVP). A diferencia de la versión que
  // vivía en index.html, acá si la API no responde se muestra un
  // mensaje (#gift-grid-empty) en vez de ocultarse en silencio — esta
  // página entera es la lista, no tendría sentido dejarla en blanco. —
  function initGiftRegistry(guestPromise) {
    var grid = document.querySelector("#gift-grid");
    var emptyEl = document.querySelector("#gift-grid-empty");
    var panel = document.querySelector("#gift-contribute");
    if (!grid || !panel) return;

    var url = W.rsvp && W.rsvp.apiUrl;

    var pickedNameEl = document.querySelector("#gift-picked-name");
    var pickedProgressEl = document.querySelector("#gift-picked-progress");
    var montoInput = document.querySelector("#gift-monto");
    var montoTagEl = document.querySelector("#gift-monto-tag");
    var montoBubbleEl = document.querySelector("#gift-monto-bubble");
    var montoMarksEl = document.querySelector("#gift-monto-marks");
    var completeHintEl = document.querySelector("#gift-complete-hint");
    var nombreInput = document.querySelector("#gift-nombre");
    var mensajeInput = document.querySelector("#gift-mensaje");
    var fileInput = document.querySelector("#gift-comprobante");
    var uploadLabel = document.querySelector("#gift-upload-label");
    var submitBtn = document.querySelector("#gift-submit");
    var errorEl = document.querySelector("#gift-error");
    var mobileContinueBar = document.querySelector("#gift-mobile-continue");
    var mobileContinueBtn = document.querySelector("#gift-continue-btn");
    var mobileBackBtn = document.querySelector("#gift-mobile-back");
    var thanksModal = initGiftThanks(finishAndReturnToList);

    var regalos = [];
    var seleccionadoId = null;
    var comprobanteDataUrl = null;

    // "← Volver a la lista" (a medio elegir, sin enviar todavía) — el
    // regalo sigue elegido, así que la barra de "Continuar" vuelve a
    // aparecer para retomarlo. No hace nada en escritorio, donde el
    // panel siempre está junto a la lista.
    function returnToList() {
      if (!isMobileFlow()) return;
      panel.hidden = true;
      if (mobileContinueBar && seleccionadoId) mobileContinueBar.hidden = false;
      showListStep();
    }
    if (mobileBackBtn) mobileBackBtn.addEventListener("click", returnToList);

    // "Volver a la lista" del modal de agradecimiento (ya se envió el
    // aporte) — a diferencia del botón de arriba, acá sí deselecciona:
    // no tendría sentido ofrecer "Continuar" para un regalo al que ya
    // se le acaba de aportar.
    function finishAndReturnToList() {
      if (!isMobileFlow()) return;
      seleccionadoId = null;
      renderGrid();
      panel.hidden = true;
      if (mobileContinueBar) mobileContinueBar.hidden = true;
      showListStep();
    }
    if (mobileContinueBtn) {
      mobileContinueBtn.addEventListener("click", function () {
        panel.hidden = false;
        showAportarStep();
      });
    }

    guestPromise.then(function (guest) {
      if (guest && guest.found && guest.nombre && !nombreInput.value) nombreInput.value = guest.nombre;
    });

    function renderGrid() {
      grid.innerHTML = "";

      // El regalo sin completar con más aportado hasta ahora se marca
      // como "el más elegido" — un empujoncito simple, sin más lógica
      // que comparar recaudado entre los que aún no llegan al 100%.
      var destacadoId = null, maxRecaudado = 0;
      regalos.forEach(function (g) {
        var completo = g.precio > 0 && g.recaudado >= g.precio;
        if (!completo && g.recaudado > maxRecaudado) { maxRecaudado = g.recaudado; destacadoId = g.id; }
      });

      regalos.forEach(function (g) {
        var completo = g.precio > 0 && g.recaudado >= g.precio;

        var card = document.createElement("button");
        card.type = "button";
        card.className = "gift-card" + (completo ? " is-funded" : "") + (seleccionadoId === g.id ? " is-selected" : "");
        card.dataset.giftId = g.id;

        if (completo || g.id === destacadoId) {
          var badges = document.createElement("div");
          badges.className = "gift-card-badges";
          var badge = document.createElement("span");
          badge.className = "tag " + (completo ? "tag-accent-2" : "tag-outline");
          badge.textContent = completo ? "✓ Completo" : "El más elegido";
          badges.appendChild(badge);
          card.appendChild(badges);
        }

        var name = document.createElement("div");
        name.className = "gift-card-name";
        name.textContent = g.nombre;
        card.appendChild(name);

        if (g.descripcion) {
          var desc = document.createElement("p");
          desc.className = "gift-card-desc";
          desc.textContent = g.descripcion;
          card.appendChild(desc);
        }

        // Mientras no haya foto real (foto_url vacío en la hoja de
        // cálculo) se muestra un marcador en vez de dejar el hueco vacío
        // — así todas las tarjetas quedan de la misma altura.
        var photoWrap = document.createElement("div");
        if (g.foto_url) {
          photoWrap.className = "gift-card-photo";
          var img = document.createElement("img");
          img.src = g.foto_url;
          img.alt = "";
          photoWrap.appendChild(img);
        } else {
          photoWrap.className = "gift-card-photo is-placeholder";
          var placeholder = document.createElement("span");
          placeholder.textContent = "foto de " + g.nombre;
          photoWrap.appendChild(placeholder);
        }
        card.appendChild(photoWrap);

        var price = document.createElement("div");
        price.className = "gift-card-price";
        price.textContent = money(g.precio);
        card.appendChild(price);

        card.appendChild(progressNode(g));
        card.addEventListener("click", function () { seleccionar(g.id); });
        grid.appendChild(card);
      });
      var hayRegalos = regalos.length > 0;
      grid.hidden = !hayRegalos;
      if (emptyEl) emptyEl.hidden = hayRegalos;
    }

    // Al hacer clic en un regalo ya completo no se abre el panel de
    // aportar (no tendría sentido pedir un monto para algo que ya está
    // pagado) — en su lugar se muestra este aviso pegado a la tarjeta,
    // basado en un mockup de claude.ai/design.
    function cerrarNoDisponible() {
      var previo = document.querySelector("#gift-unavailable");
      if (previo) previo.remove();
    }

    function irAlSiguienteDisponible() {
      var disponible = regalos.filter(function (r) {
        return !(r.precio > 0 && r.recaudado >= r.precio);
      })[0];
      if (!disponible) return;
      var card = grid.querySelector('[data-gift-id="' + disponible.id + '"]');
      if (!card) return;
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("is-flash");
      setTimeout(function () { card.classList.remove("is-flash"); }, 1000);
    }

    function mostrarNoDisponible(g) {
      cerrarNoDisponible();

      var notice = document.createElement("div");
      notice.className = "gift-unavailable";
      notice.id = "gift-unavailable";

      var icon = document.createElement("div");
      icon.className = "gift-unavailable-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

      var body = document.createElement("div");
      body.className = "gift-unavailable-body";

      var h = document.createElement("h4");
      h.textContent = "¡Gracias, pero este ya está completo!";

      var p = document.createElement("p");
      p.textContent = "Otros invitados ya juntaron todo para “" + g.nombre + "”. Si quieres, hay otros regalos esperando por alguien.";

      var actions = document.createElement("div");
      actions.className = "gift-unavailable-actions";

      var verBtn = document.createElement("button");
      verBtn.type = "button";
      verBtn.className = "btn btn-primary";
      verBtn.textContent = "Ver los que faltan";
      verBtn.addEventListener("click", function () {
        cerrarNoDisponible();
        irAlSiguienteDisponible();
      });

      var cerrarBtn = document.createElement("button");
      cerrarBtn.type = "button";
      cerrarBtn.className = "btn btn-ghost";
      cerrarBtn.textContent = "Cerrar";
      cerrarBtn.addEventListener("click", cerrarNoDisponible);

      actions.appendChild(verBtn);
      actions.appendChild(cerrarBtn);

      body.appendChild(h);
      body.appendChild(p);
      body.appendChild(progressNode(g));
      body.appendChild(actions);

      notice.appendChild(icon);
      notice.appendChild(body);

      var card = grid.querySelector('[data-gift-id="' + g.id + '"]');
      if (card) card.insertAdjacentElement("afterend", notice);
      else grid.appendChild(notice);
      notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function seleccionar(id) {
      var g = regalos.filter(function (r) { return r.id === id; })[0];
      if (!g) return;

      var completo = g.precio > 0 && g.recaudado >= g.precio;
      if (completo) {
        mostrarNoDisponible(g);
        return;
      }
      cerrarNoDisponible();

      seleccionadoId = id;
      renderGrid();

      pickedNameEl.textContent = g.nombre;
      pickedProgressEl.innerHTML = "";
      pickedProgressEl.appendChild(progressNode(g));

      var falta = Math.max(1, Math.round(g.precio - g.recaudado));
      initSlider(falta);
      errorEl.hidden = true;
      checkComplete();

      if (isMobileFlow() && mobileContinueBar) {
        // en celular el panel recién se ve al tocar "Continuar" — acá
        // solo se actualiza la barra fija. Antes decía el monto
        // ("Continuar con S/ X"), pero eso se leía como si ese fuera
        // el monto a pagar sí o sí, en vez de solo una sugerencia
        // (el monto real se ajusta en el slider del panel) — ahora
        // solo dice el nombre del regalo elegido.
        panel.hidden = true;
        mobileContinueBtn.textContent = "Continuar con " + g.nombre;
        mobileContinueBar.hidden = false;
      } else {
        panel.hidden = false;
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    // Slider del monto a aportar — inspirado en el "discrete slider" de
    // MUI: arranca en el monto final (lo que falta para completar el
    // regalo) y se puede arrastrar hacia abajo para dar solo una parte.
    // El paso (step) se ajusta según el monto — de a 1 sol para montos
    // chicos, de a 10 para los grandes — así no queda ni muy tosco ni
    // con demasiados pasos para arrastrar.
    function sliderStepFor(max) {
      if (max > 200) return 10;
      if (max > 50) return 5;
      return 1;
    }

    function updateSliderVisual() {
      var min = Number(montoInput.min), max = Number(montoInput.max), val = Number(montoInput.value);
      // Cuando min === max (un regalo ya casi completo, con solo 1 sol de
      // margen) el thumb queda fijo al inicio del riel — el relleno
      // también va a 0% para que coincida, en vez de mostrarse lleno con
      // el thumb en el otro extremo.
      var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      montoInput.style.setProperty("--fill", pct + "%");
      if (montoBubbleEl) {
        montoBubbleEl.textContent = money(val);
        montoBubbleEl.style.left = pct + "%";
      }
    }

    function renderSliderMarks(min, max) {
      if (!montoMarksEl) return;
      montoMarksEl.innerHTML = "";
      var puntos = min === max ? [min] : [min, Math.round((min + max) / 2), max];
      puntos.forEach(function (v) {
        var pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
        var mark = document.createElement("span");
        mark.className = "gift-slider-mark";
        mark.style.left = pct + "%";
        mark.textContent = money(v);
        montoMarksEl.appendChild(mark);
      });
    }

    function initSlider(falta) {
      var min = Math.min(10, falta);
      var max = Math.max(min, falta);
      montoInput.min = min;
      montoInput.max = max;
      montoInput.step = sliderStepFor(max);
      montoInput.value = max; // arranca en el monto final (lo que falta)
      renderSliderMarks(min, max);
      updateSliderVisual();
    }

    // Aviso "con esto completas el regalo" cuando el monto ingresado
    // alcanza o supera lo que falta — basado en un mockup de
    // claude.ai/design.
    function checkComplete() {
      if (!montoTagEl || !completeHintEl) return;
      var g = regalos.filter(function (r) { return r.id === seleccionadoId; })[0];
      if (!g) { montoTagEl.hidden = true; completeHintEl.hidden = true; return; }
      var monto = Number(montoInput.value) || 0;
      var falta = Math.max(0, g.precio - g.recaudado);
      var completa = falta > 0 && monto >= falta;
      montoTagEl.hidden = !completa;
      completeHintEl.hidden = !completa;
    }
    montoInput.addEventListener("input", function () {
      updateSliderVisual();
      checkComplete();
    });

    // De menor a mayor precio — así la lista arranca con lo más
    // accesible de aportar y no depende del orden en que se cargaron
    // en la hoja de cálculo.
    function ordenarPorPrecio(lista) {
      return lista.slice().sort(function (a, b) { return a.precio - b.precio; });
    }

    function cargarRegalos() {
      if (!url) { regalos = []; renderGrid(); return; }
      fetch(url + "?tipo=regalos", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          regalos = ordenarPorPrecio((body && Array.isArray(body.regalos)) ? body.regalos : []);
          renderGrid();
        })
        .catch(function () {
          regalos = [];
          renderGrid();
        });
    }

    // Achica la foto en el propio navegador antes de mandarla — una
    // captura de pantalla de celular puede pesar varios MB; a 1000px de
    // ancho y calidad .72 queda perfectamente legible y mucho más liviana.
    function comprimirImagen(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = reject;
        reader.onload = function () {
          var img = new Image();
          img.onerror = reject;
          img.onload = function () {
            var maxW = 1000;
            var scale = Math.min(1, maxW / img.width);
            var canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.72));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      uploadLabel.textContent = "Cargando…";
      comprimirImagen(file)
        .then(function (dataUrl) {
          comprobanteDataUrl = dataUrl;
          uploadLabel.textContent = "✓ " + file.name;
          uploadLabel.classList.add("has-file");
        })
        .catch(function () {
          comprobanteDataUrl = null;
          uploadLabel.textContent = "No se pudo leer esa imagen, intenta con otra";
        });
    });

    submitBtn.addEventListener("click", function () {
      var monto = Number(montoInput.value);
      var nombre = nombreInput.value.trim();

      if (!seleccionadoId) {
        errorEl.textContent = "Elige un regalo de la lista de arriba.";
        errorEl.hidden = false;
        return;
      }
      if (!nombre) {
        errorEl.textContent = "Escribe tu nombre para que sepamos de parte de quién es.";
        errorEl.hidden = false;
        return;
      }
      if (!monto || monto <= 0) {
        errorEl.textContent = "El monto tiene que ser mayor a 0.";
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;

      var g = regalos.filter(function (r) { return r.id === seleccionadoId; })[0];
      var mensaje = mensajeInput.value.trim();
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // ver docs/RSVP-BACKEND.md: evita el preflight CORS
        body: JSON.stringify({
          tipo: "aporte",
          regalo_id: seleccionadoId,
          nombre: nombre,
          monto: monto,
          mensaje: mensaje,
          comprobante_base64: comprobanteDataUrl || "",
          comprobante_nombre: nombre.replace(/\s+/g, "-").toLowerCase(),
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body && body.error) throw new Error(body.error);
          // Avance optimista (recaudado + este aporte) para el modal de
          // agradecimiento — cargarRegalos() abajo trae el valor real en
          // cuanto responde el backend, pero eso puede tardar un segundo.
          if (thanksModal && g) thanksModal.open(g, monto, mensaje, nombre);
          cargarRegalos(); // refresca el avance para todos los regalos
        })
        .catch(function (err) {
          errorEl.textContent = err.message || "No se pudo enviar tu aporte. Intenta de nuevo.";
          errorEl.hidden = false;
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
        });
    });

    cargarRegalos();
  }

  // — modal de agradecimiento tras avisar la transferencia de un regalo —
  // mismo patrón que el modal de RSVP en site.js (initThanksModal), pero
  // con el detalle del aporte en vez del detalle de la asistencia.
  // onBackToList: además de cerrar el modal, saca del paso "aportar" en
  // celular cuando tocan el botón "Volver a la lista" (no con la X ni
  // con el fondo, por si quieren quedarse revisando el detalle).
  function initGiftThanks(onBackToList) {
    var modal = document.querySelector("#gift-thanks");
    if (!modal) return null;
    var closeBtn = modal.querySelector("#gift-thanks-close");
    var backBtn = modal.querySelector("#gift-thanks-back");
    var rsvpLink = modal.querySelector("#gift-thanks-rsvp");
    var titleEl = modal.querySelector("#gift-thanks-title");
    var regaloEl = modal.querySelector("#gift-thanks-regalo");
    var montoEl = modal.querySelector("#gift-thanks-monto");
    var progressBarEl = modal.querySelector("#gift-thanks-progress-bar");
    var msgEl = modal.querySelector("#gift-thanks-msg");
    var codigo = new URLSearchParams(window.location.search).get("codigo");

    if (rsvpLink && codigo) {
      rsvpLink.href = "index.html?codigo=" + encodeURIComponent(codigo) + "#rsvp";
      rsvpLink.hidden = false;
    }

    function open(g, monto, mensaje, nombre) {
      var firstName = (nombre || "").trim().split(" ")[0];
      titleEl.textContent = firstName ? "Gracias por este regalo, " + firstName : "Gracias por este regalo";
      regaloEl.textContent = g.nombre;
      montoEl.textContent = money(monto);

      var recaudadoOptimista = Math.min(g.precio, g.recaudado + monto);
      progressBarEl.innerHTML = "";
      progressBarEl.appendChild(progressNode({ precio: g.precio, recaudado: recaudadoOptimista }));

      if (mensaje) {
        msgEl.textContent = "«" + mensaje + "»";
        msgEl.hidden = false;
      } else {
        msgEl.hidden = true;
      }

      modal.hidden = false;
      requestAnimationFrame(function () { modal.classList.add("is-open"); });
    }
    function close() {
      modal.classList.remove("is-open");
      setTimeout(function () { modal.hidden = true; }, 200);
    }

    closeBtn.addEventListener("click", close);
    backBtn.addEventListener("click", function () {
      close();
      if (onBackToList) onBackToList();
    });
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });

    return { open: open };
  }
})();
