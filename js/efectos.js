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
  // Cuatro variantes, para que no sea una nube uniforme de un solo tono:
  // salvia medio, verde hondo, arena y pétalo blanco con borde verde.
  var VARIANTES = ["ep-salvia", "ep-hondo", "ep-arena", "ep-blanco", "ep-salvia", "ep-hondo"];
  function petalo(c, css) {
    var p = document.createElement("span");
    p.className = "efecto-petalo " + VARIANTES[(Math.random() * VARIANTES.length) | 0];
    Object.keys(css).forEach(function (k) { p.style.setProperty(k, css[k]); });
    c.appendChild(p);
  }

  // Ráfaga desde (x, y) en la pantalla (al abrir el sobre): un abanico
  // amplio hacia arriba que después cae sobre la invitación que aparece,
  // durante unos 3 s. Pétalos grandes y de varios tonos: con los verdes
  // más claros y 1 s de duración se perdían contra el fondo.
  function rafaga(x, y, cantidad) {
    if (quieto) return;
    var c = capa(document.body, "efecto-fija");
    var ancho = window.innerWidth, alto = window.innerHeight;
    var n = cantidad || (ancho < 640 ? 46 : 70);
    for (var i = 0; i < n; i++) {
      var ang = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
      var dist = rnd(ancho * 0.25, ancho * 0.6);
      petalo(c, {
        left: x + "px", top: y + "px",
        "--dx": (Math.cos(ang) * dist).toFixed(0) + "px",
        "--dy": (Math.sin(ang) * rnd(alto * 0.25, alto * 0.45)).toFixed(0) + "px",
        "--caida": rnd(alto * 0.55, alto * 0.95).toFixed(0) + "px",
        "--giro": rnd(-720, 720).toFixed(0) + "deg",
        "--tam": rnd(14, 26).toFixed(1) + "px",
        "--dur": rnd(2.4, 3.6).toFixed(2) + "s",
        "--retraso": rnd(0, .35).toFixed(2) + "s",
      });
    }
    setTimeout(function () { c.remove(); }, 4400);
  }

  // — cañón de confeti (al abrir el sobre) —
  // Dos cañones desde las esquinas de abajo disparan hacia arriba y hacia
  // el centro, y medio segundo después cae confeti desde arriba a todo lo
  // ancho: llena la pantalla entera, no un punto en el centro. Cada pieza
  // tiene dos capas: la de afuera hace la trayectoria (CSS, subir y caer)
  // y la de adentro gira en 3D, que es lo que hace que parezca papel.
  var COLORES_CONFETI = ["cf-salvia", "cf-hondo", "cf-oscuro", "cf-arena", "cf-arena-osc", "cf-blanco", "cf-claro"];
  function pieza(c, css, forma, extra) {
    var p = document.createElement("span");
    p.className = "efecto-confeti" + (extra ? " " + extra : "");
    Object.keys(css).forEach(function (k) { p.style.setProperty(k, css[k]); });
    var q = document.createElement("span");
    q.className = "cf-papel " + forma + " " + COLORES_CONFETI[(Math.random() * COLORES_CONFETI.length) | 0];
    q.style.setProperty("--giro-dur", rnd(0.45, 1.1).toFixed(2) + "s");
    q.style.setProperty("--eje", rnd(-1, 1).toFixed(2) + "," + rnd(0.3, 1).toFixed(2) + "," + rnd(-0.5, 0.5).toFixed(2));
    p.appendChild(q);
    c.appendChild(p);
  }
  function forma() {
    var r = Math.random();
    return r < 0.6 ? "cf-tira" : r < 0.85 ? "cf-cuadro" : "cf-circulo";
  }
  function confeti() {
    if (quieto) return;
    var c = capa(document.body, "efecto-fija");
    var ancho = window.innerWidth, alto = window.innerHeight;
    var porCanon = ancho < 640 ? 55 : 85;
    // los dos cañones, desde fuera de las esquinas inferiores
    // Cada pieza apunta a un punto al azar a lo ancho de TODA la pantalla
    // (su punto más alto), no a un rango fijo de distancia: con distancias
    // fijas las dos ráfagas se cruzaban en el centro y se amontonaban ahí.
    [[-10, 1], [ancho + 10, -1]].forEach(function (o) {
      for (var i = 0; i < porCanon; i++) {
        var subida = rnd(alto * 0.3, alto * 0.95);
        var destino = rnd(ancho * 0.03, ancho * 0.97);   // x del punto más alto
        var dx = (destino - o[0]) / 0.7;                  // la cima está al 70% del dx
        pieza(c, {
          left: o[0] + "px", top: (alto + 10) + "px",
          "--dx": dx.toFixed(0) + "px",
          "--dy": (-subida).toFixed(0) + "px",
          "--caida": (subida + rnd(40, 160)).toFixed(0) + "px",
          "--dur": rnd(2.6, 3.8).toFixed(2) + "s",
          "--retraso": rnd(0, 0.25).toFixed(2) + "s",
        }, forma());
      }
    });
    // la lluvia desde arriba, pareja a todo lo ancho
    var lluviaN = ancho < 640 ? 45 : 70;
    for (var j = 0; j < lluviaN; j++) {
      pieza(c, {
        left: rnd(0, 100).toFixed(1) + "%", top: "-20px",
        "--dx": rnd(-60, 60).toFixed(0) + "px",
        "--dy": "0px",
        "--caida": (alto + 60) + "px",
        "--dur": rnd(2.8, 4.2).toFixed(2) + "s",
        "--retraso": rnd(0.4, 1.4).toFixed(2) + "s",
      }, forma(), "cf-cae");
    }
    setTimeout(function () { c.remove(); }, 6200);
  }

  // Lluvia sobre toda la pantalla, por delante de todo (también de un
  // diálogo abierto): pétalos que caen desde arriba balanceándose.
  function lluvia(cantidad, duracionMax) {
    if (quieto) return;
    var c = capa(document.body, "efecto-fija efecto-encima");
    var n = cantidad || 22;
    var alto = window.innerHeight;
    for (var i = 0; i < n; i++) {
      petalo(c, {
        left: rnd(0, 100).toFixed(1) + "%", top: "-30px",
        "--dx": rnd(-80, 80).toFixed(0) + "px",
        "--dy": "0px",
        "--caida": (alto + 60) + "px",
        "--giro": rnd(-480, 480).toFixed(0) + "deg",
        "--tam": rnd(13, 22).toFixed(1) + "px",
        "--dur": rnd(2.6, 3.8).toFixed(2) + "s",
        "--retraso": rnd(0, duracionMax || 1.2).toFixed(2) + "s",
      });
    }
    setTimeout(function () { c.remove(); }, 5600);
  }

  // Estallido desde las esquinas de un elemento (al confirmar que vas): el
  // ramo de la esquina de la tarjeta "suelta" los pétalos, que cruzan por
  // delante y caen; después sigue una lluvia breve.
  function celebrar(el) {
    if (quieto || !el) return;
    var r = el.getBoundingClientRect();
    var c = capa(document.body, "efecto-fija efecto-encima");
    var alto = window.innerHeight;
    [[r.left + 30, r.top + 20, 1], [r.right - 20, r.top + 10, -1]].forEach(function (o, k) {
      var n = k === 0 ? 30 : 18;   // más desde el ramo de la izquierda
      for (var i = 0; i < n; i++) {
        var ang = rnd(-Math.PI * 0.85, -Math.PI * 0.15);
        var dist = rnd(90, r.width * 0.9);
        petalo(c, {
          left: o[0] + "px", top: o[1] + "px",
          "--dx": (Math.abs(Math.cos(ang)) * dist * o[2]).toFixed(0) + "px",
          "--dy": (Math.sin(ang) * rnd(80, 200)).toFixed(0) + "px",
          "--caida": rnd(alto * 0.5, alto * 0.85).toFixed(0) + "px",
          "--giro": rnd(-600, 600).toFixed(0) + "deg",
          "--tam": rnd(13, 24).toFixed(1) + "px",
          "--dur": rnd(2.2, 3.2).toFixed(2) + "s",
          "--retraso": rnd(0, .25).toFixed(2) + "s",
        });
      }
    });
    setTimeout(function () { c.remove(); }, 4000);
    setTimeout(function () { lluvia(18, 1.4); }, 500);
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

  // — skeleton de una foto —
  // Mientras la <img> baja, su recuadro muestra un brillo que pasa (clase
  // is-cargando, ver "skeletons de carga" en site.css); al terminar —bien
  // o mal— se quita. Si ya estaba en caché ni se llega a ver.
  function esperarFoto(img, recuadro) {
    if (!img || !recuadro) return;
    if (img.complete && img.naturalWidth > 0) return;
    recuadro.classList.add("is-cargando");
    function listo() { recuadro.classList.remove("is-cargando"); }
    img.addEventListener("load", listo, { once: true });
    img.addEventListener("error", listo, { once: true });
  }

  window.Efectos = {
    esperarFoto: esperarFoto,
    rafaga: rafaga,
    lluvia: lluvia,
    celebrar: celebrar,
    confeti: confeti,
    sonido: { desbloquear: desbloquear, roce: roce, papel: papel },
    revelar: revelar,
    musica: { marcar: marcarMusica, estado: estadoMusica, continuar: continuarMusica },
  };
})();
