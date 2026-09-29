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

  // — modal "Cómo funciona la lista": se muestra la primera vez y nunca
  // más en este dispositivo (localStorage). Antes solo se recordaba si
  // marcaban "No mostrar de nuevo", y casi nadie lo marca: salía en cada
  // visita, tapando la lista que venían a ver. —
  function initGiftIntro() {
    var modal = document.querySelector("#gift-intro");
    if (!modal) return;
    var closeBtn = modal.querySelector("#gift-intro-close");

    function close() {
      modal.classList.remove("is-open");
      setTimeout(function () { modal.hidden = true; }, 200);
      try { localStorage.setItem("gift_intro_dismissed", "1"); } catch (e) {}
    }

    // "¿Cómo funciona la lista?" la vuelve a abrir cuando se quiera.
    var howto = document.querySelector("#gift-howto-link");
    if (howto) howto.addEventListener("click", function () { abrirDialogo(modal); });

    var yaVisto = false;
    try { yaVisto = localStorage.getItem("gift_intro_dismissed") === "1"; } catch (e) {
      // localStorage no disponible (modo privado, etc.) — se muestra igual.
    }
    if (!yaVisto) abrirDialogo(modal);
    closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) close();
    });
  }

  // Copia local del helper de js/site.js (esta página no carga site.js).
  // El setTimeout no es redundante con el requestAnimationFrame: rAF se
  // pausa en pestañas en segundo plano, y sin la clase "is-open" el
  // backdrop queda invisible (opacity:0) pero igual position:fixed sobre
  // toda la pantalla, tragándose los clics.
  function abrirDialogo(modal) {
    modal.hidden = false;
    var mostrar = function () { modal.classList.add("is-open"); };
    requestAnimationFrame(mostrar);
    setTimeout(mostrar, 50);
    // El foco pasa al botón principal del diálogo: con teclado o lector de
    // pantalla, antes se quedaba detrás, en la página tapada.
    var principal = modal.querySelector(".dialog-actions .btn-primary") || modal.querySelector("button");
    if (principal) setTimeout(function () { try { principal.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }

  // Sin timeout, un backend colgado deja "Enviando…" para siempre.
  // Apps Script arranca en frío: la PRIMERA petición después de un rato
  // sin uso levanta el contenedor y abre la hoja, y puede tardar 20-40s
  // (medido: 1.7s, 3.6s, 10.7s, 13.3s y hasta 21s en la misma tarde). Con
  // los 15s de antes, esa primera se abortaba y al invitado le salía "no
  // pudimos cargar la lista de regalos" — que es justo lo que pasaba.
  var API_TIMEOUT_MS = 30000;

  // — llevar la pantalla al campo que falta —
  // El aviso de error vive al pie del formulario, así que con el teclado
  // abierto en el celular queda fuera de vista: el invitado tocaba
  // "Confirmar", no pasaba nada visible y volvía a tocar. Esto marca el
  // campo, lo enfoca y lo trae al centro de la pantalla.
  // Va al centro de la pantalla (block: "center") y no arriba: así la
  // barra fija no lo tapa y no hace falta compensar su alto.
  function enfocarCampoFaltante(campo) {
    if (!campo) return;
    var envoltorio = campo.closest(".field") || campo;
    envoltorio.classList.add("is-missing");
    if (campo.setAttribute) campo.setAttribute("aria-invalid", "true");
    try {
      campo.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      campo.scrollIntoView();
    }
    // El foco va después del scroll, y a propósito SIN preventScroll:
    // son dos vías independientes para lo mismo. Si el desplazamiento
    // suave ya dejó el campo centrado, focus() no mueve nada; y si por
    // lo que sea no ocurrió, focus() lo trae a la vista igual. Con
    // preventScroll, un scrollIntoView que falle dejaría al invitado sin
    // ver el campo y sin entender por qué no pasa nada.
    setTimeout(function () { campo.focus(); }, 320);
    var limpiar = function () {
      envoltorio.classList.remove("is-missing");
      campo.removeAttribute("aria-invalid");
      campo.removeEventListener("input", limpiar);
      campo.removeEventListener("change", limpiar);
    };
    campo.addEventListener("input", limpiar);
    campo.addEventListener("change", limpiar);
  }

  function fetchConTimeout(url, options, timeoutMs) {
    options = options || {};
    if (typeof AbortController === "undefined") return fetch(url, options);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || API_TIMEOUT_MS);
    options.signal = ctrl.signal;
    return fetch(url, options).then(
      function (r) { clearTimeout(timer); return r; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  function fetchGuest(codigo) {
    var url = W.rsvp && W.rsvp.apiUrl;
    if (!url) return Promise.resolve(null);
    return fetchConTimeout(url + "?codigo=" + encodeURIComponent(codigo), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // — copiar Yape / cuentas bancarias (igual que en site.js) —
  function initCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        copyText(text).then(function (ok) {
          var row = btn.closest(".pay-row");
          // El botón de las tarjetas de pago es un icono (bloque 3c): si
          // acá se le escribiera textContent se borrarían los dos SVG de
          // adentro y quedaría un círculo vacío para siempre. Ese botón
          // avisa cambiando de icono y de color, vía la clase .copied.
          var esIcono = !!btn.querySelector("svg");
          var original = btn.textContent;
          if (!esIcono) btn.textContent = ok ? "Copiado" : "No se pudo";
          if (row) row.classList.toggle("copied", ok);
          setTimeout(function () {
            if (!esIcono) btn.textContent = original;
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

  // — "puede tardar unos segundos" —
  // Con el backend dormido, un envío puede quedarse varios segundos en
  // "Enviando…" sin ninguna otra señal, y a los 4-5 s la gente vuelve a
  // tocar o cierra la página. Si pasan 4 s, aparece una línea debajo del
  // botón que lo explica. Devuelve la función que la quita.
  function avisoEnvioLento(btn) {
    var nota = null;
    var timer = setTimeout(function () {
      nota = document.createElement("p");
      nota.className = "envio-lento";
      nota.setAttribute("role", "status");
      nota.textContent = "Puede tardar unos segundos; no cierres la página.";
      btn.insertAdjacentElement("afterend", nota);
    }, 4000);
    return function () {
      clearTimeout(timer);
      if (nota) nota.remove();
    };
  }

  // La barra tiene dos tramos: lo verificado por los novios (lleno) y lo
  // avisado pero todavía sin verificar (rayado, "por confirmar"). Solo lo
  // verificado cuenta para "completo" y para cuánto falta: un aviso con un
  // monto inventado ya no deja un regalo como completo para todos. Lo por
  // confirmar se muestra igual, para que nadie aporte dos veces lo mismo
  // sin saber que alguien ya avisó.
  function progressNode(g) {
    var pendiente = Math.max(0, Number(g.pendiente) || 0);
    var falta = Math.max(0, g.precio - g.recaudado);
    var pct = g.precio > 0 ? Math.min(100, Math.round((g.recaudado / g.precio) * 100)) : 0;
    var pctPend = g.precio > 0 ? Math.min(100 - pct, Math.round((pendiente / g.precio) * 100)) : 0;
    var wrap = document.createElement("div");
    wrap.className = "gift-progress";
    var bar = document.createElement("div");
    bar.className = "gift-progress-bar";
    var fill = document.createElement("span");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    if (pctPend > 0 && falta > 0) {
      var pend = document.createElement("span");
      pend.className = "is-pending";
      pend.style.width = pctPend + "%";
      bar.appendChild(pend);
    }
    var label = document.createElement("p");
    label.className = "gift-progress-label";
    label.textContent = falta <= 0
      ? "Ya está completo — ¡gracias!"
      : money(g.recaudado) + " reunidos de " + money(g.precio) +
        (pendiente > 0 ? " · " + money(pendiente) + " por confirmar" : "");
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
    var loadingEl = document.querySelector("#gift-loading");
    var loadingTxt = document.querySelector("#gift-loading-txt");
    var avisosCarga = [];

    // Las tarjetas fantasma solo mientras todavía no hay lista: al
    // refrescar después de un aporte la lista ya está a la vista y no
    // tiene que desaparecer. Si tarda, el texto lo dice, para que no
    // parezca que la página se quedó colgada.
    function mostrarCarga() {
      if (!loadingEl || regalos.length) return;
      loadingEl.hidden = false;
      if (emptyEl) emptyEl.hidden = true;
      if (loadingTxt) loadingTxt.textContent = "Preparando la lista de regalos";
      avisosCarga.forEach(clearTimeout);
      avisosCarga = [
        setTimeout(function () { if (loadingTxt) loadingTxt.textContent = "Está tardando un poco más de lo normal; ya casi"; }, 6000),
        setTimeout(function () { if (loadingTxt) loadingTxt.textContent = "Sigue cargando, gracias por la paciencia"; }, 15000),
      ];
    }
    function ocultarCarga() {
      avisosCarga.forEach(clearTimeout);
      avisosCarga = [];
      if (loadingEl) loadingEl.hidden = true;
    }
    var panel = document.querySelector("#gift-contribute");
    if (!grid || !panel) return;

    var url = W.rsvp && W.rsvp.apiUrl;

    var pickedNameEl = document.querySelector("#gift-picked-name");
    var pickedProgressEl = document.querySelector("#gift-picked-progress");
    var montoNumInput = document.querySelector("#gift-monto-num");
    var montosEl = document.querySelector("#gift-montos");
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
    var errorDeCarga = false; // distingue "lista vacía" de "no cargó" — ver renderGrid

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

    // — filtro Disponibles / Completos / Todos —
    // Con 12 regalos en una columna, la mesa medía unas ocho pantallas de
    // celular, y la mitad eran regalos que ya no se pueden elegir. Arranca
    // en "Disponibles". Si no queda ninguno disponible, muestra todos.
    var filtroEl = document.querySelector("#gift-filter");
    var filtro = "disponibles";
    if (filtroEl) {
      filtroEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-filtro]");
        if (!b) return;
        filtro = b.getAttribute("data-filtro");
        renderGrid();
      });
    }
    function esCompleto(g) { return g.precio > 0 && g.recaudado >= g.precio; }
    function pintarFiltro() {
      if (!filtroEl) return;
      var nComp = regalos.filter(esCompleto).length;
      var nDisp = regalos.length - nComp;
      // Solo con la lista ya cargada: con la lista vacía (mientras carga o
      // si falló) esto cambiaba el filtro a "Todos" para siempre, y tras
      // "Reintentar" los completos volvían a salir primero.
      if (regalos.length) {
        if (!nDisp && filtro === "disponibles") filtro = "todos";
        if (!nComp && filtro === "completos") filtro = "todos";
      }
      // Con un solo tipo, el filtro no filtra nada: se esconde.
      filtroEl.hidden = !(nComp && nDisp);
      filtroEl.querySelectorAll("[data-filtro]").forEach(function (b) {
        var f = b.getAttribute("data-filtro");
        b.setAttribute("aria-pressed", String(f === filtro));
        var n = b.querySelector(".gift-filter-n");
        if (n) n.textContent = f === "disponibles" ? nDisp : nComp;
      });
    }
    function pasaFiltro(g) {
      if (filtro === "todos") return true;
      return filtro === "completos" ? esCompleto(g) : !esCompleto(g);
    }

    function renderGrid() {
      ocultarCarga();
      grid.innerHTML = "";
      pintarFiltro();

      // Antes el regalo sin completar con más aportado se marcaba como
      // "El más elegido". Se quitó a pedido de los novios: la única
      // etiqueta que queda es "Completo".
      regalos.forEach(function (g) {
        var completo = g.precio > 0 && g.recaudado >= g.precio;
        if (!pasaFiltro(g)) return;

        var card = document.createElement("button");
        card.type = "button";
        card.className = "gift-card" + (completo ? " is-funded" : "") + (seleccionadoId === g.id ? " is-selected" : "");
        card.dataset.giftId = g.id;

        if (completo) {
          var badges = document.createElement("div");
          badges.className = "gift-card-badges";
          var badge = document.createElement("span");
          badge.className = "tag tag-accent-2";
          badge.textContent = "✓ Completo";
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
          img.loading = "lazy";
          img.decoding = "async";
          // Las fotos propias (img/regalo-*.jpg) tienen una versión WebP
          // al lado que pesa en total menos de la mitad. La hoja sigue
          // diciendo .jpg — así no hay que tocarla — y el navegador elige:
          // si lee WebP baja esa, si no, el JPG de siempre.
          var webp = /^img\/[^?#]+\.jpe?g$/i.test(g.foto_url) ? g.foto_url.replace(/\.jpe?g$/i, ".webp") : "";
          if (webp) {
            var pic = document.createElement("picture");
            var src = document.createElement("source");
            src.type = "image/webp";
            src.srcset = webp;
            pic.appendChild(src);
            pic.appendChild(img);
            photoWrap.appendChild(pic);
          } else {
            photoWrap.appendChild(img);
          }
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
      if (!emptyEl) return;
      emptyEl.hidden = hayRegalos;
      if (hayRegalos) return;

      // Sin regalos puede significar dos cosas muy distintas y antes las
      // dos decían "todavía no hay regalos": si en realidad se cayó la
      // conexión, eso manda al invitado a irse creyendo que la lista está
      // vacía. Acá se separan, y en el caso de fallo se ofrece reintentar
      // sin recargar la página.
      emptyEl.innerHTML = "";
      if (errorDeCarga) {
        emptyEl.appendChild(document.createTextNode(
          "No pudimos cargar la lista de regalos — puede ser la conexión. "
        ));
        var reintentar = document.createElement("button");
        reintentar.type = "button";
        reintentar.className = "btn btn-ghost";
        reintentar.textContent = "Reintentar";
        reintentar.addEventListener("click", cargarRegalos);
        emptyEl.appendChild(reintentar);
      } else {
        emptyEl.textContent = "Todavía no hay regalos en la lista — vuelve a intentarlo más tarde, " +
          "o escríbenos por WhatsApp si tienes dudas.";
      }
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
      h.textContent = "Este regalo ya está completo";

      var p = document.createElement("p");
      p.textContent = "¡Gracias por pensarlo! Todavía quedan otros esperando.";

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
    // El monto que vale es SIEMPRE el del campo escrito. Las pastillas de
    // montos sugeridos solo lo rellenan, así que quien quiere una cifra
    // exacta ("S/ 137") la escribe y punto.
    function montoActual() {
      var v = Number(montoNumInput.value);
      return isFinite(v) && v > 0 ? v : 0;
    }

    // Los cuatro montos del bloque 13 (S/100, S/200, la mitad y el total)
    // vienen escritos a mano en la maqueta, donde el regalo cuesta S/850 y
    // nadie ha aportado. Acá se calculan sobre lo que FALTA, que es lo
    // único que tiene sentido con regalos a medio completar, y con dos
    // reglas según el tamaño:
    //
    //  - Hasta S/1000 los dos primeros son fijos (100 y 200). Son cifras
    //    que uno reconoce como "un aporte chico" y no cambian de un
    //    regalo a otro.
    //  - De S/1000 para arriba esos fijos se vuelven testimoniales (100
    //    sobre 3000 es un 3%), así que pasan a porcentajes: 10, 25, 50 y
    //    100% de lo que falta.
    //
    // El último SIEMPRE es lo que falta exacto, sin redondear: es el que
    // completa el regalo, y un redondeo lo dejaría a unos soles de la
    // meta. Los intermedios sí se redondean para que no salga "S/ 332.5".
    var MONTOS_FIJOS_HASTA = 1000;

    function montosSugeridos(falta) {
      var candidatos;
      if (falta >= MONTOS_FIJOS_HASTA) {
        candidatos = [
          Math.round(falta * 0.10 / 10) * 10,
          Math.round(falta * 0.25 / 10) * 10,
          Math.round(falta * 0.50 / 10) * 10,
          falta
        ];
      } else {
        candidatos = [100, 200, Math.round(falta / 2 / 5) * 5, falta];
      }
      // Se quitan repetidos y los que superen lo que falta: con S/200
      // restantes, "la mitad" es 100 y ya estaba en la lista. Así, si
      // falta S/50 quedan dos pastillas y no cuatro inventadas.
      var vistos = {}, out = [];
      candidatos.forEach(function (v) {
        if (v > 0 && v <= falta && !vistos[v]) { vistos[v] = true; out.push(v); }
      });
      out.sort(function (a, b) { return a - b; });
      return out;
    }

    function renderMontos(falta) {
      if (!montosEl) return;
      montosEl.innerHTML = "";
      montosSugeridos(falta).forEach(function (v) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "gift-monto-pill";
        b.textContent = money(v);
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          montoNumInput.value = v;
          marcarMontoElegido();
          checkComplete();
        });
        montosEl.appendChild(b);
      });
      marcarMontoElegido();
    }

    // La pastilla se ilumina solo si coincide con lo que dice el campo, así
    // que al escribir un monto propio se apagan todas — sin eso, quedaría
    // una marcada mintiendo sobre lo que se va a aportar.
    function marcarMontoElegido() {
      if (!montosEl) return;
      var actual = montoActual();
      [].forEach.call(montosEl.children, function (b) {
        var coincide = b.textContent === money(actual);
        b.classList.toggle("is-selected", coincide);
        b.setAttribute("aria-pressed", coincide ? "true" : "false");
      });
    }

    function initSlider(falta) {
      var min = Math.min(10, falta);
      var max = Math.max(min, falta);
      montoNumInput.min = min;
      montoNumInput.max = max;
      montoNumInput.value = max; // arranca en lo que falta para completarlo
      renderMontos(max);
    }

    // Aviso "con esto completas el regalo" cuando el monto ingresado
    // alcanza o supera lo que falta.
    function checkComplete() {
      if (!completeHintEl) return;
      var g = regalos.filter(function (r) { return r.id === seleccionadoId; })[0];
      if (!g) { completeHintEl.hidden = true; return; }
      var monto = montoActual();
      var falta = Math.max(0, g.precio - g.recaudado);
      var completa = falta > 0 && monto >= falta;
      completeHintEl.hidden = !completa;
    }

    // Mientras se escribe NO se corrige el valor: si alguien va a poner
    // 150, el primer carácter es "1" y ajustarlo al mínimo en ese instante
    // lo dejaría peleando con el campo.
    montoNumInput.addEventListener("input", function () {
      marcarMontoElegido();
      checkComplete();
    });

    // Al salir del campo (o dar Enter) sí se acomoda dentro del rango.
    montoNumInput.addEventListener("change", function () {
      var min = Number(montoNumInput.min), max = Number(montoNumInput.max);
      var v = montoActual();
      if (!v) v = min;
      montoNumInput.value = Math.min(max, Math.max(min, Math.round(v)));
      marcarMontoElegido();
      checkComplete();
    });

    // Primero lo que todavía se puede regalar, después lo completo; y
    // dentro de cada grupo, de menor a mayor precio. Antes era solo por
    // precio, y como los regalos baratos son los primeros en completarse,
    // la lista arrancaba justo con lo que ya no se podía elegir.
    function ordenarPorPrecio(lista) {
      var completo = function (g) { return g.precio > 0 && g.recaudado >= g.precio ? 1 : 0; };
      return lista.slice().sort(function (a, b) {
        return completo(a) - completo(b) || a.precio - b.precio;
      });
    }

    // Un reintento automático, y solo uno. La causa habitual del fallo es
    // el arranque en frío de Apps Script: la petición que falla es la que
    // despierta el backend, así que la segunda suele volver en 1-3s. Sin
    // esto, el invitado veía el error y tenía que tocar "Reintentar" él
    // mismo para algo que se arregla solo.
    function cargarRegalos(esReintento) {
      if (!url) { errorDeCarga = true; regalos = []; renderGrid(); return; }
      mostrarCarga();
      return fetchConTimeout(url + "?tipo=regalos", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (body) {
          errorDeCarga = false;
          regalos = ordenarPorPrecio((body && Array.isArray(body.regalos)) ? body.regalos : []);
          renderGrid();
        })
        .catch(function (err) {
          if (!esReintento) {
            console.warn("Primer intento fallido, reintentando:", err);
            return cargarRegalos(true);
          }
          console.warn("No se pudo cargar la lista de regalos:", err);
          errorDeCarga = true;
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

    // El botón de adjuntar lleva un clip (SVG) adentro, así que escribirle
    // textContent lo borraría y quedaría una pastilla sin icono. Solo se
    // cambia el <span> del texto.
    var uploadTxt = uploadLabel.querySelector(".gift-upload-txt") || uploadLabel;
    fileInput.addEventListener("change", function () {
      var file = fileInput.files[0];
      if (!file) return;
      uploadTxt.textContent = "Cargando…";
      comprimirImagen(file)
        .then(function (dataUrl) {
          comprobanteDataUrl = dataUrl;
          // El nombre del archivo puede ser larguísimo; se recorta para que
          // la pastilla no se estire a media pantalla.
          var nombre = file.name.length > 22 ? file.name.slice(0, 20) + "…" : file.name;
          uploadTxt.textContent = nombre;
          uploadLabel.classList.add("has-file");
        })
        .catch(function () {
          comprobanteDataUrl = null;
          uploadTxt.textContent = "No se pudo leer, prueba con otra";
          uploadLabel.classList.remove("has-file");
        });
    });

    submitBtn.addEventListener("click", function () {
      var monto = montoActual();
      var nombre = nombreInput.value.trim();

      if (!seleccionadoId) {
        errorEl.textContent = "Elige un regalo de la lista de arriba.";
        errorEl.hidden = false;
        return;
      }
      if (!nombre) {
        errorEl.textContent = "Escribe tu nombre para que sepamos de parte de quién es.";
        errorEl.hidden = false;
        enfocarCampoFaltante(nombreInput);
        return;
      }
      if (!monto || monto <= 0) {
        errorEl.textContent = "El monto tiene que ser mayor a 0.";
        errorEl.hidden = false;
        enfocarCampoFaltante(montoNumInput);
        return;
      }
      errorEl.hidden = true;

      var g = regalos.filter(function (r) { return r.id === seleccionadoId; })[0];
      var mensaje = mensajeInput.value.trim();
      var originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando…";
      var quitarAviso = avisoEnvioLento(submitBtn);

      // Subir la captura puede tardar bastante más que un POST normal, así
      // que este pide más margen que el timeout por defecto.
      fetchConTimeout(url, {
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
      }, 45000)
        .then(function (r) {
          // Si el backend devolvió HTML (una página de error de Apps
          // Script, o el 404 de GitHub Pages), r.json() rompe con un
          // "Unexpected token <" que no le dice nada a nadie. Se traduce
          // acá a algo accionable.
          return r.json().catch(function () {
            throw new Error("El servidor no respondió como esperábamos. Intenta de nuevo en un momento.");
          });
        })
        .then(function (body) {
          if (body && body.error) throw new Error(body.error);
          // Avance optimista (este aporte como "por confirmar") para el
          // modal de agradecimiento — cargarRegalos() abajo trae el valor
          // real en cuanto responde el backend.
          if (thanksModal && g) thanksModal.open(g, monto, mensaje, nombre);
          cargarRegalos(); // refresca el avance para todos los regalos
        })
        .catch(function (err) {
          // Un fallo de red llega como TypeError con el texto del navegador
          // en inglés ("Failed to fetch" en Chrome, "Load failed" en
          // Safari): se traduce a algo que el invitado entienda.
          errorEl.textContent = (err && err.name === "AbortError")
            ? "Se demoró demasiado en responder. Revisa tu conexión y vuelve a intentar."
            : (err instanceof TypeError)
              ? "No pudimos conectarnos. Revisa tu conexión y vuelve a intentar; tu aporte todavía no se envió."
              : (err && err.message) || "No se pudo enviar tu aporte. Intenta de nuevo.";
          errorEl.hidden = false;
        })
        .finally(function () {
          quitarAviso();
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
    var titleEl = modal.querySelector("#gift-thanks-title");

    // Solo el agradecimiento con el nombre. Antes repetía el regalo, el
    // monto, el estado, la barra de avance y el mensaje en recuadros; el
    // avance lo ven igual al volver a la lista.
    function open(g, monto, mensaje, nombre) {
      var firstName = (nombre || "").trim().split(" ")[0];
      titleEl.textContent = firstName ? "Gracias por este regalo, " + firstName : "Gracias por este regalo";
      abrirDialogo(modal);
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
