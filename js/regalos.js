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
    var nombreInput = document.querySelector("#gift-nombre");
    var mensajeInput = document.querySelector("#gift-mensaje");
    var fileInput = document.querySelector("#gift-comprobante");
    var uploadLabel = document.querySelector("#gift-upload-label");
    var submitBtn = document.querySelector("#gift-submit");
    var errorEl = document.querySelector("#gift-error");
    var successEl = document.querySelector("#gift-success");

    var regalos = [];
    var seleccionadoId = null;
    var comprobanteDataUrl = null;

    guestPromise.then(function (guest) {
      if (guest && guest.found && guest.nombre && !nombreInput.value) nombreInput.value = guest.nombre;
    });

    function money(n) { return "S/ " + Number(n || 0).toFixed(0); }

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

    function renderGrid() {
      grid.innerHTML = "";
      regalos.forEach(function (g) {
        var completo = g.precio > 0 && g.recaudado >= g.precio;

        var card = document.createElement("button");
        card.type = "button";
        card.className = "gift-card" + (completo ? " is-funded" : "") + (seleccionadoId === g.id ? " is-selected" : "");

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

        if (g.foto_url) {
          var photoWrap = document.createElement("div");
          photoWrap.className = "gift-card-photo";
          var img = document.createElement("img");
          img.src = g.foto_url;
          img.alt = "";
          photoWrap.appendChild(img);
          card.appendChild(photoWrap);
        }

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

    function seleccionar(id) {
      var g = regalos.filter(function (r) { return r.id === id; })[0];
      if (!g) return;
      seleccionadoId = id;
      renderGrid();

      pickedNameEl.textContent = g.nombre;
      pickedProgressEl.innerHTML = "";
      pickedProgressEl.appendChild(progressNode(g));

      var falta = Math.max(1, Math.round(g.precio - g.recaudado));
      montoInput.value = falta;
      errorEl.hidden = true;
      successEl.classList.remove("show");

      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function cargarRegalos() {
      if (!url) { regalos = []; renderGrid(); return; }
      fetch(url + "?tipo=regalos", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          regalos = (body && Array.isArray(body.regalos)) ? body.regalos : [];
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
          mensaje: mensajeInput.value.trim(),
          comprobante_base64: comprobanteDataUrl || "",
          comprobante_nombre: nombre.replace(/\s+/g, "-").toLowerCase(),
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body && body.error) throw new Error(body.error);
          successEl.classList.add("show");
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
})();
