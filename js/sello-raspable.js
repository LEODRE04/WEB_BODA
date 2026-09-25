/* ══ Sello raspable ═══════════════════════════════════════
   El invitado raspa el sello de lacre del sobre con el dedo
   (o con el mouse) y, cuando ya lo quitó, el sobre se abre.

   Toma ideas del "Glass bubble" de Bencho (MIT — bencho.dev/
   licence), pero no su shader. El Glass bubble dobla una foto
   bajo una bola de vidrio, y acá no hay nada que doblar: lo que
   hay es una capa que se borra. Así que el raspado es canvas 2D
   — más simple y más seguro en teléfonos viejos que WebGL — y lo
   que se trae del original es lo que sí aplica:

   - LA LUZ. Una sola, arriba a la izquierda (el mismo vector
     L = (-0.55, -0.85) del shader): un filo claro por dentro del
     borde donde mira hacia ella, uno más débil del lado opuesto
     "donde la luz entró y volvió a salir", y una sombra que cae
     un poco por debajo. Es lo que hace que el sello se lea como
     un objeto con volumen y no como un círculo plano.
   - LA MANO. pointer capture, touch-action: none y coordenadas
     leídas del rectángulo real del canvas. El dedo puede salirse
     del sello sin perder el trazo.
   - LA NITIDEZ. dpr con tope en 2: más que eso no se nota y en
     un teléfono de gama alta cuadruplica el trabajo por nada.
   - EL BUCLE QUE SE APAGA. Las migas usan requestAnimationFrame
     solo mientras hay migas en el aire; en reposo el componente
     no tiene nada corriendo.
   - LA QUIETUD. "Reducir movimiento" se lee una vez: sin migas ni
     dedo fantasma, pero raspar sigue funcionando, porque eso no es
     una animación sino lo que hace la mano.

   ── CÓMO SE ABRE ─────────────────────────────────────────
   Al pasar el UMBRAL el anillo se completa y el texto dice
   "suelta". El sobre se abre al LEVANTAR el dedo, no en el
   momento de cruzar la cifra, y es a propósito: la música de
   fondo arranca con la apertura, y iOS solo deja sonar audio
   dentro de un gesto real. Un pointermove no cuenta como gesto;
   un pointerup sí. Además, abrirlo a mitad de un trazo le
   quitaría el sobre de debajo del dedo a quien todavía está
   raspando.

   Se abre haciendo clic en el mismo botón de siempre, así que la
   música, la sesión y la animación del sobre siguen siendo las de
   site.js. Ese botón no desaparece: queda como enlace discreto
   ("¿Prefieres no raspar?") para teclado, lectores de pantalla y
   quien no quiera jugar. Si no hay canvas, no se toca nada y el
   sobre funciona igual que antes. */
(function () {
  "use strict";

  /* Qué parte del lacre hay que quitar: el 90%, que el sello
     quede prácticamente limpio antes de abrirse (pedido de André;
     empezó en la mitad). El riesgo de un número tan alto es que el
     último tramo se vuelva buscar a ciegas manchitas en el borde,
     y por eso el anillo se llena contra ESTA cifra y no contra el
     100%: va diciendo cuánto falta de lo que de verdad hace falta. */
  var UMBRAL = 0.9;
  /* El área que escucha al dedo es más grande que el sello: un
     trazo que empieza justo afuera del borde también cuenta. */
  var MARGEN = 30;
  /* la luz del Glass bubble: arriba a la izquierda */
  var LX = -0.55, LY = -0.85;

  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var quieto = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var tactil = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  function init() {
    var gate = document.querySelector("#envelope-gate");
    if (!gate || gate.hidden) return;
    try { if (sessionStorage.getItem("envelope_opened") === "1") return; } catch (e) {}
    var sobre = gate.querySelector(".envelope");
    var btn = gate.querySelector("#envelope-open-btn");
    var hint = gate.querySelector("#seal-hint");
    if (!sobre || !btn || !hint) return;
    var prueba = document.createElement("canvas");
    if (!prueba.getContext || !prueba.getContext("2d")) return;

    var raiz = document.createElement("div");
    raiz.className = "seal-scratch";
    raiz.setAttribute("aria-hidden", "true");
    raiz.innerHTML =
      '<canvas class="seal-wax"></canvas>' +
      '<svg class="seal-ring"><circle class="seal-ring-track"></circle><circle class="seal-ring-run"></circle></svg>' +
      '<canvas class="seal-fx"></canvas>' +
      '<span class="seal-ghost"></span>';
    sobre.appendChild(raiz);
    sobre.classList.add("has-scratch");

    var cv = raiz.querySelector(".seal-wax");
    var fx = raiz.querySelector(".seal-fx");
    var anillo = raiz.querySelector(".seal-ring");
    var track = raiz.querySelector(".seal-ring-track");
    var run = raiz.querySelector(".seal-ring-run");
    var texto = hint.querySelector(".seal-hint-txt");

    /* El tamaño lo decide el CSS (--seal, más chico en teléfono) y
       se lee acá, para que no haya dos números que mantener
       iguales a mano. */
    var S = raiz.clientWidth;
    var R = (S - MARGEN * 2) / 2;
    var C = S / 2;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    [cv, fx].forEach(function (c) {
      c.width = Math.round(S * dpr);
      c.height = Math.round(S * dpr);
      c.style.width = S + "px";
      c.style.height = S + "px";
    });
    var wax = cv.getContext("2d", { willReadFrequently: true });
    var fxc = fx.getContext("2d");
    wax.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* el anillo de progreso, siete px por fuera del lacre */
    var RA = R + 7;
    var CIRC = 2 * Math.PI * RA;
    anillo.setAttribute("viewBox", "0 0 " + S + " " + S);
    [track, run].forEach(function (c) {
      c.setAttribute("cx", C); c.setAttribute("cy", C); c.setAttribute("r", RA);
    });
    run.style.strokeDasharray = CIRC;
    run.style.strokeDashoffset = CIRC;

    var css = getComputedStyle(document.documentElement);
    var tok = function (n, def) { return (css.getPropertyValue(n) || "").trim() || def; };
    var COL = {
      claro: tok("--color-accent-500", "#7b9370"),
      medio: tok("--color-accent", "#5a7350"),
      hondo: tok("--color-accent-800", "#364c2f"),
      miga: [tok("--color-accent-500", "#7b9370"), tok("--color-accent-600", "#5a7350"), tok("--color-accent-700", "#4a6242")]
    };

    /* ── el borde del lacre ────────────────────────────────
       Un lacre no es un círculo: el borde se derrama un poco al
       estampar. Dos ondas de distinta frecuencia, pequeñas, para
       que se note irregular sin parecer una flor. */
    function contorno(ctx) {
      var n = 48;
      ctx.beginPath();
      for (var i = 0; i <= n; i++) {
        var a = (i / n) * Math.PI * 2;
        var r = R * (1 + 0.035 * Math.sin(a * 7 + 0.6) + 0.018 * Math.sin(a * 13 + 2.1));
        var x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }

    function dibujar() {
      var ctx = wax;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, S, S);

      /* lo que proyecta: suave y un poco por debajo, como la
         sombra del Glass bubble (allí 9px sobre una bola de
         180; acá 4 sobre un sello de 96) */
      ctx.save();
      ctx.shadowColor = "rgba(36, 51, 31, 0.32)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      contorno(ctx);
      /* el cuerpo: más claro donde mira hacia la luz */
      var g = ctx.createRadialGradient(C + LX * R * 0.45, C + LY * R * 0.45, R * 0.1, C, C, R * 1.05);
      g.addColorStop(0, COL.claro);
      g.addColorStop(0.55, COL.medio);
      g.addColorStop(1, COL.hondo);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();

      ctx.save();
      contorno(ctx);
      ctx.clip();

      /* grano: el lacre no es plástico. Puntos claros y oscuros
         casi invisibles, con una semilla fija para que el sello
         sea el mismo en cada visita. */
      var sem = 7;
      var rnd = function () { sem = (sem * 16807) % 2147483647; return sem / 2147483647; };
      for (var i = 0; i < 520; i++) {
        var a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
        ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
        ctx.fillRect(C + Math.cos(a) * d, C + Math.sin(a) * d, 1.2, 1.2);
      }

      /* ── el filo, con la luz del Glass bubble ──────────────
         Una banda fina por dentro del borde, brillante donde
         mira arriba a la izquierda y con un reflejo más débil
         del lado contrario. Se dibuja como un trazo grueso del
         mismo contorno, recortado por dentro, con un degradado
         a lo largo de la dirección de la luz. */
      var lg = ctx.createLinearGradient(C + LX * R, C + LY * R, C - LX * R, C - LY * R);
      lg.addColorStop(0, "rgba(255,255,255,0.55)");
      lg.addColorStop(0.45, "rgba(255,255,255,0)");
      lg.addColorStop(0.8, "rgba(255,255,255,0)");
      lg.addColorStop(1, "rgba(255,255,255,0.16)");
      contorno(ctx);
      ctx.lineWidth = 5;
      ctx.strokeStyle = lg;
      ctx.stroke();

      /* ── el estampado ─────────────────────────────────────
         Un anillo hundido y las iniciales. Hundido quiere decir
         una línea oscura desplazada hacia la sombra y una clara
         hacia la luz: el ojo lo lee como relieve sin necesidad
         de nada más. */
      var ri = R * 0.74;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.arc(C + LX * 0.8, C + LY * 0.8, ri, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(20,30,18,0.45)";
      ctx.beginPath(); ctx.arc(C - LX * 0.8, C - LY * 0.8, ri, 0, Math.PI * 2); ctx.stroke();

      /* Medido, no adivinado: la manuscrita es muy ancha y a
         ojo las iniciales se salían del anillo. Tienen que caber
         en 1.2 radios, que es el ancho útil dentro de él. */
      var fs = R * 0.66;
      var familia = 'px "Parisienne", "Snell Roundhand", cursive';
      ctx.font = fs + familia;
      var ancho = ctx.measureText("A&K").width;
      if (ancho > R * 1.2) { fs *= (R * 1.2) / ancho; ctx.font = fs + familia; }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(20,30,18,0.5)";
      ctx.fillText("A&K", C - LX * 1.1, C + 2 - LY * 1.1);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText("A&K", C, C + 2);
      ctx.restore();
    }

    /* ── cuánto queda ──────────────────────────────────────
       Se cuentan los píxeles del lacre que siguen opacos. La
       sombra nunca pasa de alfa 0.32 (≈ 82 de 255), así que con
       el corte en 110 no cuenta como lacre. Se muestrea uno de
       cada cuatro: sobra para una cifra que se muestra como un
       anillo y no como un número. */
    function opacos() {
      var d = wax.getImageData(0, 0, cv.width, cv.height).data;
      var n = 0;
      for (var i = 3; i < d.length; i += 16) if (d[i] > 110) n++;
      return n;
    }

    var total = 1;
    var progreso = 0;
    var listo = false;
    var hecho = false;

    function medir() {
      progreso = clamp(1 - opacos() / total, 0, 1);
      /* el anillo se llena al llegar al UMBRAL, no al 100%: el
         anillo completo es lo que dice "ya está" */
      run.style.strokeDashoffset = CIRC * (1 - clamp(progreso / UMBRAL, 0, 1));
      if (progreso >= UMBRAL && !listo) {
        listo = true;
        raiz.classList.add("is-ready");
        hint.classList.add("is-ready");
        if (texto) texto.textContent = tactil ? "¡Eso es! Levanta el dedo para abrirla" : "¡Eso es! Suelta para abrirla";
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
      }
    }

    /* ── raspar ────────────────────────────────────────────
       Un trazo de punta redonda entre el punto anterior y el
       nuevo, no un círculo por evento: con un dedo rápido los
       eventos llegan separados y quedarían agujeros en fila. */
    var PINCEL = Math.max(11, R * 0.27);
    function raspar(a, b) {
      wax.save();
      wax.globalCompositeOperation = "destination-out";
      wax.lineCap = "round";
      wax.lineJoin = "round";
      wax.lineWidth = PINCEL * 2;
      wax.beginPath();
      wax.moveTo(a.x, a.y);
      wax.lineTo(b.x, b.y);
      wax.stroke();
      /* un trazo de largo cero no deja marca en todos los
         navegadores; el punto se asegura con un círculo */
      wax.beginPath();
      wax.arc(b.x, b.y, PINCEL, 0, Math.PI * 2);
      wax.fill();
      wax.restore();
    }

    /* ── las migas ─────────────────────────────────────────
       Lo que hace que raspar se sienta como raspar y no como
       borrar: trocitos de lacre que saltan del dedo y caen.
       Solo donde todavía había lacre — raspar el sobre vacío
       no suelta nada. */
    var migas = [];
    var raf = 0;
    function soltarMigas(p, cuantas, fuerza) {
      if (quieto) return;
      for (var i = 0; i < cuantas; i++) {
        migas.push({
          x: p.x + (Math.random() - 0.5) * PINCEL,
          y: p.y + (Math.random() - 0.5) * PINCEL,
          vx: (Math.random() - 0.5) * 2.4 * fuerza,
          vy: (-Math.random() * 1.8 - 0.4) * fuerza,
          r: 0.8 + Math.random() * 1.6,
          c: COL.miga[(Math.random() * COL.miga.length) | 0],
          vida: 1
        });
      }
      if (!raf) raf = requestAnimationFrame(paso);
    }
    var prev = 0;
    function paso(t) {
      /* en sesentavos de segundo, como el resorte del original:
         un cuadro perdido avanza lo mismo que los dos que
         reemplaza */
      var dt = prev ? clamp((t - prev) / 16.67, 0, 2.5) : 1;
      prev = t;
      fxc.clearRect(0, 0, S, S);
      for (var i = migas.length - 1; i >= 0; i--) {
        var m = migas[i];
        m.vy += 0.22 * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.vida -= 0.028 * dt;
        if (m.vida <= 0 || m.y > S) { migas.splice(i, 1); continue; }
        fxc.globalAlpha = clamp(m.vida, 0, 1);
        fxc.fillStyle = m.c;
        fxc.beginPath();
        fxc.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        fxc.fill();
      }
      fxc.globalAlpha = 1;
      if (migas.length) raf = requestAnimationFrame(paso);
      else { raf = 0; prev = 0; }
    }
    function hayLacre(p) {
      var px = wax.getImageData(Math.round(p.x * dpr), Math.round(p.y * dpr), 1, 1).data;
      return px[3] > 110;
    }

    /* ── la mano ─────────────────────────────────────────── */
    var punto = function (e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (S / r.width), y: (e.clientY - r.top) * (S / r.height) };
    };
    var activo = null;
    var recorrido = 0;
    var ultimaMedida = 0;
    var tocado = false;

    cv.addEventListener("pointerdown", function (e) {
      if (hecho || e.button > 0) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* scripted */ }
      activo = punto(e);
      recorrido = 0;
      if (!tocado) { tocado = true; raiz.classList.add("is-touched"); }
      if (hayLacre(activo)) soltarMigas(activo, 3, 1);
      raspar(activo, activo);
    });
    cv.addEventListener("pointermove", function (e) {
      if (!activo || hecho) return;
      var p = punto(e);
      var d = Math.hypot(p.x - activo.x, p.y - activo.y);
      if (d < 1) return;
      var habia = hayLacre(p);
      raspar(activo, p);
      recorrido += d;
      if (habia) soltarMigas(p, Math.min(4, 1 + (d / 8) | 0), 1);
      activo = p;
      var ahora = performance.now();
      if (ahora - ultimaMedida > 90) { ultimaMedida = ahora; medir(); }
    });
    var soltar = function () {
      if (!activo || hecho) return;
      activo = null;
      medir();
      if (listo) return terminar();
      if (recorrido < 6 && progreso < 0.04) {
        /* un toque sin arrastrar: no es raspar. El sello se
           sacude y el texto parpadea, que es cómo se dice
           "así no" sin escribir una palabra más. */
        raiz.classList.remove("is-nudge");
        hint.classList.remove("is-nudge");
        void raiz.offsetWidth;
        raiz.classList.add("is-nudge");
        hint.classList.add("is-nudge");
      } else if (texto && progreso >= 0.04) {
        /* "ya casi" solo cuando es verdad: con el umbral en 90%,
           decirlo al primer trazo sería prometer de más */
        texto.textContent = progreso >= UMBRAL * 0.66
          ? "Ya casi, limpia lo que queda del sello"
          : "Sigue raspando hasta quitar todo el sello";
      }
    };
    cv.addEventListener("pointerup", soltar);
    cv.addEventListener("pointercancel", soltar);

    /* ── el final ────────────────────────────────────────── */
    function terminar() {
      hecho = true;
      /* lo que quedaba de lacre salta de una vez */
      if (!quieto) {
        for (var i = 0; i < 26; i++) {
          var a = Math.random() * Math.PI * 2, d = Math.random() * R;
          soltarMigas({ x: C + Math.cos(a) * d, y: C + Math.sin(a) * d }, 1, 1.6);
        }
      }
      raiz.classList.add("is-broken");
      gate.classList.add("seal-broken");
      if (navigator.vibrate) try { navigator.vibrate([10, 40, 18]); } catch (e) {}
      /* en el mismo pointerup, para que el clic cuente como
         gesto del invitado y la música pueda sonar (ver arriba) */
      btn.click();
    }

    /* el botón de siempre pasa a ser la salida discreta */
    btn.classList.add("envelope-cta-quiet");
    btn.textContent = "¿Prefieres no raspar? Ábrela aquí";
    if (texto) texto.textContent = tactil
      ? "Raspa el sello con tu dedo para abrir tu invitación"
      : "Haz clic y arrastra sobre el sello para abrir tu invitación";
    hint.hidden = false;

    dibujar();
    total = Math.max(1, opacos());
    /* Parisienne puede llegar después del primer dibujo: si
       llega antes de que alguien toque el sello, se redibuja con
       las iniciales en su letra. Después ya no — redibujar
       devolvería el lacre ya raspado. */
    if (document.fonts && document.fonts.load) {
      document.fonts.load('40px "Parisienne"').then(function () {
        if (tocado) return;
        dibujar();
        total = Math.max(1, opacos());
      }).catch(function () {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
