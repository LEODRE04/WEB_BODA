// efectos.js — detalles que se sienten: pétalos, sonidos de papel, secciones
// que aparecen al bajar y música que sigue entre páginas. Lo usan
// index.html (site.js, sello-raspable.js) y regalos.html (regalos.js).
//
// Todo es opcional: si algo no está soportado o el invitado pidió "reducir
// movimiento", cada función simplemente no hace nada y la página funciona
// igual que antes.
(function () {
  "use strict";

  var quieto = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  // — pétalos —
  // Los mismos pétalos salvia que caen por la página (.petal), en dos
  // formas: una ráfaga que sale de un punto (al abrir el sobre) y una
  // lluvia breve que cae desde arriba (al confirmar que vas).
  function capa(host, clase) {
    var c = document.createElement("div");
    c.className = "efecto-capa " + (clase || "");
    c.setAttribute("aria-hidden", "true");
    host.appendChild(c);
    return c;
  }
  function petalo(c, css) {
    var p = document.createElement("span");
    p.className = "efecto-petalo";
    Object.keys(css).forEach(function (k) { p.style.setProperty(k, css[k]); });
    c.appendChild(p);
  }

  // Ráfaga desde (x, y) en la pantalla: salen hacia afuera y hacia arriba,
  // giran y caen, en poco más de un segundo.
  function rafaga(x, y, cantidad) {
    if (quieto) return;
    var c = capa(document.body, "efecto-fija");
    var n = cantidad || (window.innerWidth < 640 ? 22 : 32);
    for (var i = 0; i < n; i++) {
      var ang = rnd(-Math.PI, 0);          // hacia arriba, en abanico
      var dist = rnd(120, Math.max(220, window.innerWidth * 0.45));
      petalo(c, {
        left: x + "px", top: y + "px",
        "--dx": (Math.cos(ang) * dist).toFixed(0) + "px",
        "--dy": (Math.sin(ang) * dist * 0.8).toFixed(0) + "px",
        "--caida": rnd(160, 320).toFixed(0) + "px",
        "--giro": rnd(-540, 540).toFixed(0) + "deg",
        "--tam": rnd(9, 17).toFixed(1) + "px",
        "--dur": rnd(1.2, 1.9).toFixed(2) + "s",
        "--retraso": rnd(0, .15).toFixed(2) + "s",
      });
    }
    setTimeout(function () { c.remove(); }, 2400);
  }

  // Lluvia breve sobre un elemento (el fondo de un diálogo, por ejemplo).
  function lluvia(host, cantidad) {
    if (quieto || !host) return;
    var c = capa(host, "efecto-lluvia");
    var n = cantidad || 26;
    for (var i = 0; i < n; i++) {
      petalo(c, {
        left: rnd(0, 100).toFixed(1) + "%", top: "-24px",
        "--dx": rnd(-60, 60).toFixed(0) + "px",
        "--dy": "0px",
        "--caida": (window.innerHeight + 40) + "px",
        "--giro": rnd(-360, 360).toFixed(0) + "deg",
        "--tam": rnd(9, 16).toFixed(1) + "px",
        "--dur": rnd(1.8, 2.8).toFixed(2) + "s",
        "--retraso": rnd(0, .8).toFixed(2) + "s",
      });
    }
    setTimeout(function () { c.remove(); }, 4000);
  }

  // — sonidos de papel —
  // Generados con Web Audio (ruido filtrado), sin archivos: un roce corto
  // mientras se raspa el lacre y el crujido del papel al abrir el sobre.
  // Muy bajos a propósito: acompañan, no se imponen. El contexto de audio
  // solo se puede crear después de un toque, así que se "desbloquea" en el
  // primer toque sobre el sello. En iPhone con el interruptor de silencio
  // puesto no suenan, y está bien que así sea.
  var ctx = null;
  function desbloquear() {
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) { ctx = null; }
  }
  function ruido(duracion, frecuencia, q, volumen, barrido) {
    if (!ctx) return;
    try {
      var len = Math.floor(ctx.sampleRate * duracion);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.value = frecuencia;
      filtro.Q.value = q;
      var t = ctx.currentTime;
      if (barrido) filtro.frequency.exponentialRampToValueAtTime(barrido, t + duracion);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(volumen, t + Math.min(0.02, duracion / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      src.connect(filtro); filtro.connect(g); g.connect(ctx.destination);
      src.start(t); src.stop(t + duracion + 0.02);
    } catch (e) {}
  }
  var ultimoRoce = 0;
  function roce() {
    var ahora = Date.now();
    if (ahora - ultimoRoce < 70) return;   // no más de ~14 por segundo
    ultimoRoce = ahora;
    ruido(0.07, rnd(2600, 3800), 1.1, 0.05);
  }
  function papel() {
    ruido(0.22, 1800, 0.8, 0.07, 700);
    setTimeout(function () { ruido(0.35, 1200, 0.7, 0.05, 400); }, 160);
  }

  // — secciones que aparecen al bajar —
  // Cada bloque entra con un desvanecimiento hacia arriba la primera vez
  // que llega a la pantalla. La clase que los oculta la pone este código
  // (no el HTML), así que sin JS o sin IntersectionObserver todo se ve
  // normal desde el principio.
  function revelar(selector) {
    if (quieto || !("IntersectionObserver" in window)) return;
    var els = document.querySelectorAll(selector);
    if (!els.length) return;
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { el.classList.add("revelar"); io.observe(el); });
  }

  // — música que sigue entre páginas —
  // index.html y regalos.html son páginas distintas, así que al cambiar de
  // una a otra el audio se corta. Se recuerda en la sesión si estaba
  // sonando ("on") o si el invitado la pausó ("off"), y la página nueva la
  // retoma (desde el principio de la canción: no hace falta el segundo
  // exacto). Si el navegador no deja sonar sin un toque, arranca con el
  // primer toque o tecla del invitado en la página.
  var CLAVE = "musica_estado";
  function marcarMusica(sonando) {
    try { sessionStorage.setItem(CLAVE, sonando ? "on" : "off"); } catch (e) {}
  }
  function estadoMusica() {
    try { return sessionStorage.getItem(CLAVE); } catch (e) { return null; }
  }
  // Intenta retomar; alSonar se llama cuando de verdad empieza.
  function continuarMusica(audio, alSonar) {
    if (!audio || estadoMusica() !== "on") return false;
    var intentar = function () {
      return audio.play().then(function () { if (alSonar) alSonar(); });
    };
    intentar().catch(function () {
      var alPrimerToque = function (e) {
        quitar();
        // Si el primer toque es sobre el propio botón de música, que lo
        // maneje el botón: si no, sonaría y se pausaría en el mismo toque.
        if (e && e.target && e.target.closest && e.target.closest(".music-toggle")) return;
        if (estadoMusica() === "on") intentar().catch(function () {});
      };
      var quitar = function () {
        ["pointerdown", "keydown", "touchstart"].forEach(function (t) {
          document.removeEventListener(t, alPrimerToque, true);
        });
      };
      ["pointerdown", "keydown", "touchstart"].forEach(function (t) {
        document.addEventListener(t, alPrimerToque, true);
      });
    });
    return true;
  }

  window.Efectos = {
    rafaga: rafaga,
    lluvia: lluvia,
    sonido: { desbloquear: desbloquear, roce: roce, papel: papel },
    revelar: revelar,
    musica: { marcar: marcarMusica, estado: estadoMusica, continuar: continuarMusica },
  };
})();
