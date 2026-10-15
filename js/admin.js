// admin.js — panel de administración de la boda (admin.html).
//
// Lee y escribe la misma hoja de Google que la invitación, a través del
// Apps Script (ver "PANEL DE ADMINISTRACIÓN" en docs/apps-script/Code.gs).
// Todo va por POST con la clave de quien entra; sin clave válida el
// backend no devuelve nada. Para desarrollar: server/dev_api.py con las
// claves prueba-andre / prueba-krisli.
(function () {
  "use strict";

  var W = window.WEDDING || {};
  var API = (W.rsvp && W.rsvp.apiUrl) || "";
  var CLAVE_KEY = "boda_admin_clave";
  var VISTA_KEY = "boda_admin_vista";

  var estado = {
    clave: leer(CLAVE_KEY),
    datos: null,
    vista: leer(VISTA_KEY) || "resumen",
    filtros: { q: "", grupo: "", estado: "", tipo: "", mesa: "" },
    mesaSel: null,       // id de la mesa abierta en el plano
    elegido: null,       // código del invitado "en la mano" para soltar en una mesa
    editando: null,      // código con el formulario de respuesta abierto
  };

  // ————— utilidades —————
  function leer(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function guardar(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function soles(n) { return "S/ " + Math.round(Number(n) || 0).toLocaleString("es-PE"); }
  function fechaCorta(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "America/Lima" }) + " " +
      d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", timeZone: "America/Lima" });
  }
  function diaLima(iso) { return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" }); }
  function toast(msg, error) {
    var t = $("#adm-toast");
    t.textContent = msg;
    t.classList.toggle("is-error", !!error);
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function sync(txt) { $("#adm-sync").textContent = txt || ""; }

  function api(accion, extra) {
    var body = { tipo: "admin", clave: estado.clave, accion: accion };
    for (var k in extra || {}) body[k] = extra[k];
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // sin preflight CORS, igual que el RSVP
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.noAutorizado) { salir("Tu clave ya no es válida. Vuelve a ingresarla."); throw new Error("no autorizado"); }
      if (res && res.error) throw new Error(res.error);
      return res;
    });
  }

  // ————— datos derivados —————
  // estado de cada invitado: confirmado / rechazado / leido / sin_abrir
  function estadoDe(g) {
    if (g.respuesta && g.respuesta.asistencia === "si") return "confirmado";
    if (g.respuesta && g.respuesta.asistencia === "no") return "rechazado";
    return g.aperturas > 0 ? "leido" : "sin_abrir";
  }
  var ESTADOS = {
    confirmado: { txt: "Confirmó", cls: "ok" },
    rechazado: { txt: "No asiste", cls: "no" },
    leido: { txt: "Leyó, sin responder", cls: "leido" },
    sin_abrir: { txt: "Sin abrir", cls: "nada" },
  };
  // Lugares que ocupa en una mesa: lo confirmado si respondió que sí;
  // todos sus pases si aún no responde (reserva provisional); 0 si no viene.
  function asientosDe(g) {
    var e = estadoDe(g);
    if (e === "confirmado") return g.respuesta.num_asistentes || 1;
    if (e === "rechazado") return 0;
    return g.pases;
  }
  function mesaPorId(id) { return (estado.datos.mesas || []).filter(function (m) { return m.id === id; })[0] || null; }
  function nombreMesa(id) { var m = mesaPorId(id); return m ? m.nombre : ""; }
  function ocupadosEn(idMesa) {
    return estado.datos.invitados.filter(function (g) { return g.mesa === idMesa; })
      .reduce(function (s, g) { return s + asientosDe(g); }, 0);
  }
  function linkDe(g) {
    var base = estado.datos.urlInvitacion || (location.origin + location.pathname.replace(/[^/]*$/, ""));
    return base.replace(/\/?$/, "/") + "?codigo=" + encodeURIComponent(g.codigo);
  }
  function whatsappDe(g) {
    var texto = "Hola " + g.nombre + ", te recordamos confirmar tu asistencia a nuestra boda. Aquí está tu invitación: " +
      linkDe(g) + " — André y Krisli";
    var tel = (g.telefono || "").replace(/\D/g, "");
    if (tel && tel.length === 9) tel = "51" + tel; // celular peruano sin código de país
    return "https://wa.me/" + (tel || "") + "?text=" + encodeURIComponent(texto);
  }
  function grupos() {
    var vistos = {};
    estado.datos.invitados.forEach(function (g) { if (g.grupo) vistos[g.grupo] = true; });
    return Object.keys(vistos).sort();
  }

  // ————— ingreso —————
  function mostrarLogin(msg) {
    $("#adm-app").hidden = true;
    $("#adm-login").hidden = false;
    var err = $("#adm-login-error");
    err.textContent = msg || "";
    err.hidden = !msg;
    setTimeout(function () { $("#adm-clave").focus(); }, 50);
  }
  function salir(msg) {
    estado.clave = "";
    estado.datos = null;
    guardar(CLAVE_KEY, "");
    mostrarLogin(msg);
  }
  $("#adm-login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#adm-login-btn");
    estado.clave = $("#adm-clave").value.trim();
    btn.disabled = true;
    btn.textContent = "Entrando…";
    cargar().then(function () {
      guardar(CLAVE_KEY, estado.clave);
      $("#adm-clave").value = "";
    }).catch(function (err) {
      if (err.message !== "no autorizado") mostrarLogin("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = "Entrar";
    });
  });
  $("#adm-salir").addEventListener("click", function () { salir(); });
  $("#adm-refrescar").addEventListener("click", function () { cargar(); });

  function cargar() {
    sync("Cargando…");
    return api("datos").then(function (d) {
      estado.datos = d;
      $("#adm-login").hidden = true;
      $("#adm-app").hidden = false;
      $("#adm-quien").textContent = "Hola, " + d.quien;
      medirHeader();
      sync("Actualizado " + new Date().toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" }));
      render();
    }).catch(function (err) {
      sync("");
      if (err.message !== "no autorizado" && estado.datos) toast("No se pudo actualizar: " + err.message, true);
      throw err;
    });
  }

  // ————— navegación —————
  $("#adm-tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-vista]");
    if (!b) return;
    estado.vista = b.getAttribute("data-vista");
    guardar(VISTA_KEY, estado.vista);
    render();
    $("#adm-vista").focus({ preventScroll: true });
  });

  function render() {
    if (!estado.datos) return;
    [].forEach.call(document.querySelectorAll("#adm-tabs [data-vista]"), function (b) {
      var activo = b.getAttribute("data-vista") === estado.vista;
      b.setAttribute("aria-selected", activo ? "true" : "false");
      b.classList.toggle("is-activo", activo);
    });
    var vistas = { resumen: vistaResumen, invitados: vistaInvitados, mesas: vistaMesas, entrada: vistaEntrada, regalos: vistaRegalos, historial: vistaHistorial };
    (vistas[estado.vista] || vistaResumen)($("#adm-vista"));
  }

  // ————— RESUMEN —————
  function vistaResumen(el) {
    var inv = estado.datos.invitados;
    var c = { confirmado: 0, rechazado: 0, leido: 0, sin_abrir: 0 };
    var personas = 0, personasRecepcion = 0, pasesTotales = 0;
    inv.forEach(function (g) {
      var e = estadoDe(g);
      c[e]++;
      pasesTotales += g.pases;
      if (e === "confirmado") {
        personas += g.respuesta.num_asistentes || 1;
        if (g.tipo !== "ceremonia") personasRecepcion += g.respuesta.num_asistentes || 1;
      }
    });
    var total = inv.length || 1;
    var respondieron = c.confirmado + c.rechazado;
    var dias = Math.max(0, Math.ceil((new Date(estado.datos.cierre).getTime() - Date.now()) / 86400000));
    var asignados = inv.filter(function (g) { return g.mesa && estadoDe(g) === "confirmado"; })
      .reduce(function (s, g) { return s + asientosDe(g); }, 0);
    var aportado = estado.datos.aportes.filter(function (a) { return a.estado !== "duplicado"; })
      .reduce(function (s, a) { return s + a.monto; }, 0);

    var kpis = [
      ["Invitaciones", inv.length, pasesTotales + " pases en total"],
      ["Respondieron", Math.round(respondieron / total * 100) + "%", respondieron + " de " + inv.length],
      ["Vienen", personas, personasRecepcion + " a la recepción"],
      ["No asisten", c.rechazado, "invitaciones"],
      ["Sin responder", c.leido + c.sin_abrir, c.sin_abrir + " ni abrieron el link"],
      ["Cierre RSVP", dias + (dias === 1 ? " día" : " días"), "7 de noviembre"],
      ["Sentados", asignados + "/" + personas, "confirmados con mesa"],
      ["Regalos", soles(aportado), estado.datos.aportes.length + " aportes"],
    ];

    var porGrupo = grupos().map(function (gr) {
      var del = inv.filter(function (g) { return g.grupo === gr; });
      var k = { confirmado: 0, rechazado: 0, leido: 0, sin_abrir: 0 };
      del.forEach(function (g) { k[estadoDe(g)]++; });
      return { grupo: gr, total: del.length, k: k };
    });

    // respuestas por día, últimos 21 días
    var conteo = {};
    inv.forEach(function (g) { if (g.respuesta && g.respuesta.enviado_en) { var d = diaLima(g.respuesta.enviado_en); conteo[d] = (conteo[d] || 0) + 1; } });
    var dias21 = [];
    for (var i = 20; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
      dias21.push({ d: d, n: conteo[d] || 0 });
    }
    var maxN = Math.max(1, Math.max.apply(null, dias21.map(function (x) { return x.n; })));

    function barra(k, tot) {
      return '<div class="adm-barra" role="img" aria-label="' + k.confirmado + ' confirmaron, ' + k.rechazado + ' no asisten, ' + k.leido + ' leyeron, ' + k.sin_abrir + ' sin abrir">' +
        ["confirmado", "rechazado", "leido", "sin_abrir"].map(function (e) {
          return k[e] ? '<span class="is-' + ESTADOS[e].cls + '" style="flex:' + k[e] + '"></span>' : "";
        }).join("") + '</div>';
    }

    el.innerHTML =
      '<section class="adm-kpis">' + kpis.map(function (k) {
        return '<div class="adm-kpi"><span>' + esc(k[0]) + '</span><strong>' + esc(k[1]) + '</strong><small>' + esc(k[2]) + '</small></div>';
      }).join("") + '</section>' +
      '<section class="adm-card"><h2>Avance general</h2>' + barra(c, total) +
        '<ul class="adm-leyenda">' + ["confirmado", "rechazado", "leido", "sin_abrir"].map(function (e) {
          return '<li><i class="is-' + ESTADOS[e].cls + '"></i>' + ESTADOS[e].txt + ' <b>' + c[e] + '</b></li>';
        }).join("") + '</ul></section>' +
      '<section class="adm-card"><h2>Por grupo</h2>' + (porGrupo.length ? '<div class="adm-grupos">' + porGrupo.map(function (p) {
        var resp = p.k.confirmado + p.k.rechazado;
        return '<button type="button" class="adm-grupo" data-grupo="' + esc(p.grupo) + '"><span class="adm-grupo-nombre">' + esc(p.grupo) + '</span>' +
          '<span class="adm-grupo-num">' + resp + '/' + p.total + ' respondieron</span>' + barra(p.k, p.total) + '</button>';
      }).join("") + '</div>' : '<p class="adm-vacio">Agrega la columna "grupo" en la hoja de Invitados para ver el avance por grupo.</p>') + '</section>' +
      '<section class="adm-card"><h2>Respuestas por día <small>últimos 21 días</small></h2><div class="adm-dias">' +
        dias21.map(function (x) {
          return '<div class="adm-dia" title="' + x.d + ': ' + x.n + '"><span style="height:' + (x.n / maxN * 100) + '%"></span><small>' + x.d.slice(8) + '</small></div>';
        }).join("") + '</div></section>';

    [].forEach.call(el.querySelectorAll("[data-grupo]"), function (b) {
      b.addEventListener("click", function () {
        estado.filtros = { q: "", grupo: b.getAttribute("data-grupo"), estado: "", tipo: "", mesa: "" };
        estado.vista = "invitados";
        guardar(VISTA_KEY, "invitados");
        render();
      });
    });
  }

  // ————— INVITADOS —————
  function filtrados() {
    var f = estado.filtros, q = f.q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return estado.datos.invitados.filter(function (g) {
      if (q && (g.nombre + " " + g.codigo).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").indexOf(q) === -1) return false;
      if (f.grupo && g.grupo !== f.grupo) return false;
      if (f.estado && estadoDe(g) !== f.estado) return false;
      if (f.tipo && g.tipo !== f.tipo) return false;
      if (f.mesa === "sin" && g.mesa) return false;
      if (f.mesa === "con" && !g.mesa) return false;
      return true;
    }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });
  }

  function opciones(lista, actual, todos) {
    return '<option value="">' + esc(todos) + '</option>' + lista.map(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(v) + '"' + (v === actual ? " selected" : "") + '>' + esc(t) + '</option>';
    }).join("");
  }

  function vistaInvitados(el) {
    var f = estado.filtros;
    el.innerHTML =
      '<div class="adm-filtros">' +
        '<input type="search" id="f-q" placeholder="Buscar por nombre" value="' + esc(f.q) + '" aria-label="Buscar invitado">' +
        '<select id="f-grupo" aria-label="Grupo">' + opciones(grupos(), f.grupo, "Todos los grupos") + '</select>' +
        '<select id="f-estado" aria-label="Estado">' + opciones(Object.keys(ESTADOS).map(function (k) { return [k, ESTADOS[k].txt]; }), f.estado, "Todos los estados") + '</select>' +
        '<select id="f-tipo" aria-label="Tipo de invitación">' + opciones([["completa", "Ceremonia y recepción"], ["ceremonia", "Solo ceremonia"]], f.tipo, "Todo tipo") + '</select>' +
        '<select id="f-mesa" aria-label="Mesa">' + opciones([["sin", "Sin mesa"], ["con", "Con mesa"]], f.mesa, "Con y sin mesa") + '</select>' +
      '</div>' +
      '<p class="adm-cuenta" id="inv-cuenta"></p>' +
      '<div class="adm-lista" id="inv-lista"></div>';

    ["q", "grupo", "estado", "tipo", "mesa"].forEach(function (k) {
      var input = $("#f-" + k, el);
      input.addEventListener(k === "q" ? "input" : "change", function () { f[k] = input.value; pintarLista(); });
    });
    pintarLista();

    function pintarLista() {
      var lista = filtrados();
      var personas = lista.reduce(function (s, g) { return s + asientosDe(g); }, 0);
      $("#inv-cuenta", el).textContent = lista.length + (lista.length === 1 ? " invitación" : " invitaciones") + " · " + personas + " lugares";
      var mesas = estado.datos.mesas.map(function (m) { return [m.id, m.nombre]; });
      $("#inv-lista", el).innerHTML = lista.length ? lista.map(function (g) {
        var e = estadoDe(g), r = g.respuesta;
        var editando = estado.editando === g.codigo;
        return '<article class="adm-inv" data-codigo="' + esc(g.codigo) + '">' +
          '<div class="adm-inv-main">' +
            '<div class="adm-inv-nombre">' + esc(g.nombre) + '</div>' +
            '<div class="adm-inv-meta">' + esc([g.grupo, g.tipo === "ceremonia" ? "Solo ceremonia" : "Ceremonia y recepción", g.pases + (g.pases === 1 ? " pase" : " pases")].filter(String).join(" · ")) + '</div>' +
            '<div class="adm-inv-meta">' + (g.aperturas ? "Abrió " + g.aperturas + (g.aperturas === 1 ? " vez" : " veces") + " · última " + esc(fechaCorta(g.ultima_apertura)) : "No abrió el link") +
              (r && r.enviado_en ? " · respondió " + esc(fechaCorta(r.actualizado_en || r.enviado_en)) : "") + '</div>' +
          '</div>' +
          '<span class="adm-chip is-' + ESTADOS[e].cls + '">' + ESTADOS[e].txt + (e === "confirmado" ? " · " + r.num_asistentes : "") + '</span>' +
          '<label class="adm-inv-mesa"><span>Mesa</span><select data-accion="mesa"' + (e === "rechazado" ? " disabled" : "") + '>' + opciones(mesas, g.mesa, "Sin mesa") + '</select></label>' +
          '<div class="adm-inv-acciones">' +
            '<button type="button" class="adm-btn adm-btn-mini" data-accion="copiar">Copiar link</button>' +
            (e !== "confirmado" && e !== "rechazado" ? '<a class="adm-btn adm-btn-mini" target="_blank" rel="noopener" href="' + esc(whatsappDe(g)) + '">Recordar por WhatsApp</a>' : "") +
            '<button type="button" class="adm-btn adm-btn-mini" data-accion="editar" aria-expanded="' + editando + '">Cargar respuesta</button>' +
          '</div>' +
          (editando ? formRespuesta(g) : "") +
        '</article>';
      }).join("") : '<p class="adm-vacio">No hay invitados con esos filtros.</p>';
    }

    function formRespuesta(g) {
      var r = g.respuesta || {};
      var nums = [];
      for (var i = 1; i <= g.pases; i++) nums.push([String(i), String(i)]);
      return '<form class="adm-form-resp" data-accion="guardar-resp">' +
        '<label><input type="radio" name="asis" value="si"' + (r.asistencia === "si" ? " checked" : "") + '> Sí asiste</label>' +
        '<label><input type="radio" name="asis" value="no"' + (r.asistencia === "no" ? " checked" : "") + '> No asiste</label>' +
        '<label>Personas <select name="num">' + nums.map(function (n) { return '<option' + (String(r.num_asistentes || g.pases) === n[0] ? " selected" : "") + '>' + n[0] + '</option>'; }).join("") + '</select></label>' +
        '<button type="submit" class="adm-btn adm-btn-primary adm-btn-mini">Guardar</button>' +
        '<button type="button" class="adm-btn adm-btn-mini" data-accion="cancelar">Cancelar</button>' +
      '</form>';
    }

    var lista = $("#inv-lista", el);
    lista.addEventListener("click", function (e) {
      var art = e.target.closest("[data-codigo]");
      var b = e.target.closest("[data-accion]");
      if (!art || !b) return;
      var g = invitado(art.getAttribute("data-codigo"));
      var accion = b.getAttribute("data-accion");
      if (accion === "copiar") {
        copiar(linkDe(g));
      } else if (accion === "editar") {
        estado.editando = estado.editando === g.codigo ? null : g.codigo;
        pintarLista();
      } else if (accion === "cancelar") {
        estado.editando = null;
        pintarLista();
      }
    });
    lista.addEventListener("change", function (e) {
      var sel = e.target.closest('select[data-accion="mesa"]');
      if (!sel) return;
      var g = invitado(sel.closest("[data-codigo]").getAttribute("data-codigo"));
      asignarMesa(g, sel.value);
    });
    lista.addEventListener("submit", function (e) {
      var form = e.target.closest('[data-accion="guardar-resp"]');
      if (!form) return;
      e.preventDefault();
      var g = invitado(form.closest("[data-codigo]").getAttribute("data-codigo"));
      var asis = form.querySelector('input[name="asis"]:checked');
      if (!asis) { toast("Elige si asiste o no.", true); return; }
      var num = asis.value === "no" ? 0 : Number(form.querySelector('select[name="num"]').value);
      sync("Guardando…");
      api("guardarRespuesta", { codigo: g.codigo, asistencia: asis.value, num_asistentes: num }).then(function () {
        g.respuesta = { asistencia: asis.value, num_asistentes: num, enviado_en: (g.respuesta && g.respuesta.enviado_en) || new Date().toISOString(), actualizado_en: new Date().toISOString() };
        estado.editando = null;
        toast("Respuesta de " + g.nombre + " guardada.");
        sync("Guardado");
        pintarLista();
      }).catch(function (err) { sync(""); toast("No se pudo guardar: " + err.message, true); });
    });
  }

  function invitado(codigo) { return estado.datos.invitados.filter(function (g) { return g.codigo === codigo; })[0]; }

  function copiar(texto) {
    (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(function () {
      toast("Link copiado.");
    }).catch(function () { window.prompt("Copia el link:", texto); });
  }

  function asignarMesa(g, idMesa) {
    var antes = g.mesa;
    g.mesa = idMesa;
    sync("Guardando…");
    if (estado.vista === "mesas") render();
    return api("asignarMesa", { codigo: g.codigo, mesa: idMesa }).then(function () {
      sync("Guardado");
    }).catch(function (err) {
      g.mesa = antes;
      sync("");
      toast("No se pudo asignar la mesa: " + err.message, true);
      render();
    });
  }

  // ————— MESAS —————
  // Plano de 1000 × 650 (coordenadas guardadas en la hoja). En pantallas
  // angostas se desplaza horizontalmente.
  var PLANO_W = 1000, PLANO_H = 650;
  function tamMesa(m) {
    if (m.forma === "rectangular") return { w: Math.max(110, 50 + m.capacidad * 11), h: 70 };
    var d = Math.max(80, 50 + m.capacidad * 5);
    return { w: d, h: d };
  }

  var guardarMesasTimer = null;
  function guardarMesas() {
    sync("Guardando…");
    clearTimeout(guardarMesasTimer);
    guardarMesasTimer = setTimeout(function () {
      api("guardarMesas", { mesas: estado.datos.mesas }).then(function () { sync("Guardado"); })
        .catch(function (err) { sync(""); toast("No se pudo guardar el plano: " + err.message, true); });
    }, 600);
  }

  function vistaMesas(el) {
    var mesas = estado.datos.mesas;
    var sinMesa = estado.datos.invitados.filter(function (g) { return !g.mesa && estadoDe(g) !== "rechazado"; })
      .sort(function (a, b) {
        var ea = estadoDe(a) === "confirmado" ? 0 : 1, eb = estadoDe(b) === "confirmado" ? 0 : 1;
        return ea - eb || a.nombre.localeCompare(b.nombre, "es");
      });
    var capacidad = mesas.reduce(function (s, m) { return s + m.capacidad; }, 0);
    var sentados = estado.datos.invitados.filter(function (g) { return g.mesa; }).reduce(function (s, g) { return s + asientosDe(g); }, 0);
    var sel = estado.mesaSel ? mesaPorId(estado.mesaSel) : null;

    el.innerHTML =
      '<div class="adm-mesas-barra">' +
        '<p><b>' + mesas.length + '</b> mesas · <b>' + sentados + '</b>/' + capacidad + ' lugares ocupados · <b>' + sinMesa.length + '</b> invitaciones sin mesa</p>' +
        '<button type="button" class="adm-btn adm-btn-primary" id="mesa-nueva">+ Agregar mesa</button>' +
      '</div>' +
      (estado.elegido ? '<p class="adm-aviso">Toca una mesa para sentar a <b>' + esc(invitado(estado.elegido).nombre) + '</b>. <button type="button" class="adm-link" id="soltar">Cancelar</button></p>' : "") +
      '<div class="adm-mesas-layout">' +
        '<div class="adm-plano-wrap"><div class="adm-plano" id="plano" style="width:' + PLANO_W + 'px;height:' + PLANO_H + 'px">' +
          (mesas.length ? mesas.map(dibujoMesa).join("") : '<p class="adm-plano-vacio">Agrega la primera mesa y arrástrala a su lugar.</p>') +
        '</div></div>' +
        '<aside class="adm-mesas-lado">' + (sel ? panelMesa(sel) : panelSinMesa(sinMesa)) + '</aside>' +
      '</div>';

    $("#mesa-nueva", el).addEventListener("click", function () {
      var n = mesas.length + 1;
      var m = { id: "m" + Date.now().toString(36), nombre: "Mesa " + n, forma: "redonda", capacidad: 10,
        x: 120 + ((n - 1) % 6) * 150, y: 110 + Math.floor((n - 1) / 6) * 170 % (PLANO_H - 150) };
      mesas.push(m);
      estado.mesaSel = m.id;
      guardarMesas();
      render();
    });
    var soltar = $("#soltar", el);
    if (soltar) soltar.addEventListener("click", function () { estado.elegido = null; render(); });

    ajustarEscala(el);
    activarPlano($("#plano", el));
    activarLado($(".adm-mesas-lado", el));
  }

  // El plano mide 1000 × 650 y se achica para entrar entero en su espacio
  // (nunca se agranda). En celular se queda en un mínimo legible y se
  // desplaza de lado.
  var escala = 1;
  function ajustarEscala(el) {
    var wrap = $(".adm-plano-wrap", el), plano = $("#plano", el);
    if (!wrap || !plano) return;
    escala = Math.max(0.55, Math.min(1, wrap.clientWidth / PLANO_W));
    // zoom (no transform): achica también el espacio que ocupa, así no
    // queda una barra de desplazamiento hacia un hueco vacío.
    plano.style.zoom = escala;
  }
  // Las pestañas se pegan justo debajo del encabezado, que en celular
  // puede ocupar una o dos líneas.
  function medirHeader() {
    var h = $(".adm-header");
    if (h && h.offsetHeight) document.documentElement.style.setProperty("--alto-header", h.offsetHeight + "px");
  }
  window.addEventListener("resize", function () {
    medirHeader();
    if (estado.vista === "mesas") ajustarEscala($("#adm-vista"));
  });

  function dibujoMesa(m) {
    var t = tamMesa(m), ocup = ocupadosEn(m.id);
    var invs = estado.datos.invitados.filter(function (g) { return g.mesa === m.id; });
    var estadoMesa = ocup > m.capacidad ? "is-excedida" : ocup === m.capacidad ? "is-llena" : "";
    // puntos de los asientos alrededor (llenos = ocupados)
    var puntos = "";
    for (var i = 0; i < m.capacidad; i++) {
      var px, py;
      if (m.forma === "rectangular") {
        var porLado = Math.ceil(m.capacidad / 2), lado = i < porLado ? 0 : 1, j = lado ? i - porLado : i;
        var cuantos = lado ? m.capacidad - porLado : porLado;
        px = (j + 1) / (cuantos + 1) * 100;
        py = lado ? 100 + 16 / t.h * 100 : -16 / t.h * 100;
      } else {
        var ang = (i / m.capacidad) * Math.PI * 2 - Math.PI / 2;
        px = 50 + Math.cos(ang) * (50 + 12 / t.w * 100);
        py = 50 + Math.sin(ang) * (50 + 12 / t.h * 100);
      }
      puntos += '<i class="adm-asiento' + (i < ocup ? " is-ocupado" : "") + '" style="left:' + px.toFixed(1) + '%;top:' + py.toFixed(1) + '%"></i>';
    }
    var nombres = invs.slice(0, 6).map(function (g) { return esc(g.nombre.split(" ").slice(0, 2).join(" ")) + (asientosDe(g) > 1 ? " ×" + asientosDe(g) : ""); });
    if (invs.length > 6) nombres.push("+" + (invs.length - 6) + " más");
    return '<div class="adm-mesa ' + (m.forma === "rectangular" ? "is-rect " : "") + estadoMesa + (estado.mesaSel === m.id ? " is-sel" : "") + '" data-mesa="' + esc(m.id) + '" ' +
      'style="left:' + m.x + 'px;top:' + m.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px" tabindex="0" role="button" aria-label="' + esc(m.nombre) + ', ' + ocup + ' de ' + m.capacidad + ' lugares">' +
      puntos +
      '<span class="adm-mesa-nombre">' + esc(m.nombre) + '</span><span class="adm-mesa-cap">' + ocup + '/' + m.capacidad + '</span>' +
      (nombres.length ? '<span class="adm-mesa-gente">' + nombres.join("<br>") + '</span>' : "") +
    '</div>';
  }

  function activarPlano(plano) {
    if (!plano) return;
    var arr = null;
    plano.addEventListener("pointerdown", function (e) {
      var nodo = e.target.closest("[data-mesa]");
      if (!nodo) return;
      var m = mesaPorId(nodo.getAttribute("data-mesa"));
      arr = { nodo: nodo, m: m, x0: e.clientX, y0: e.clientY, mx: m.x, my: m.y, movio: false };
      nodo.setPointerCapture(e.pointerId);
    });
    plano.addEventListener("pointermove", function (e) {
      if (!arr) return;
      var dx = (e.clientX - arr.x0) / escala, dy = (e.clientY - arr.y0) / escala;
      if (!arr.movio && Math.abs(dx) + Math.abs(dy) < 5) return;
      arr.movio = true;
      var t = tamMesa(arr.m);
      arr.m.x = Math.max(t.w / 2 + 14, Math.min(PLANO_W - t.w / 2 - 14, arr.mx + dx));
      arr.m.y = Math.max(t.h / 2 + 18, Math.min(PLANO_H - t.h / 2 - 18, arr.my + dy));
      arr.nodo.style.left = arr.m.x + "px";
      arr.nodo.style.top = arr.m.y + "px";
    });
    function soltar() {
      if (!arr) return;
      var a = arr;
      arr = null;
      if (a.movio) { guardarMesas(); return; }
      // un toque (sin arrastrar): sentar al elegido o abrir la mesa
      if (estado.elegido) {
        var g = invitado(estado.elegido);
        estado.elegido = null;
        estado.mesaSel = a.m.id;
        asignarMesa(g, a.m.id).then(render);
        render();
      } else {
        estado.mesaSel = estado.mesaSel === a.m.id ? null : a.m.id;
        render();
      }
    }
    plano.addEventListener("pointerup", soltar);
    plano.addEventListener("pointercancel", function () { arr = null; });
    plano.addEventListener("keydown", function (e) {
      var nodo = e.target.closest("[data-mesa]");
      if (nodo && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        estado.mesaSel = nodo.getAttribute("data-mesa");
        render();
      }
    });
    // arrastrar un invitado desde la lista (computadora)
    plano.addEventListener("dragover", function (e) { if (e.target.closest("[data-mesa]")) e.preventDefault(); });
    plano.addEventListener("drop", function (e) {
      var nodo = e.target.closest("[data-mesa]");
      var codigo = e.dataTransfer.getData("text/plain");
      if (!nodo || !codigo) return;
      e.preventDefault();
      estado.elegido = null;
      asignarMesa(invitado(codigo), nodo.getAttribute("data-mesa")).then(render);
    });
  }

  function chipInvitado(g, quitar) {
    var e = estadoDe(g);
    return '<li class="adm-persona" draggable="' + (!quitar) + '" data-codigo="' + esc(g.codigo) + '">' +
      '<span><b>' + esc(g.nombre) + '</b><small>' + esc([g.grupo, asientosDe(g) + (asientosDe(g) === 1 ? " lugar" : " lugares"),
        e === "confirmado" ? "" : "sin confirmar"].filter(String).join(" · ")) + '</small></span>' +
      (quitar ? '<button type="button" class="adm-link" data-accion="quitar">Quitar</button>'
              : '<button type="button" class="adm-link" data-accion="elegir">' + (estado.elegido === g.codigo ? "Elegido" : "Sentar") + '</button>') +
    '</li>';
  }

  function panelSinMesa(lista) {
    return '<h2>Sin mesa</h2><p class="adm-nota">Arrastra un nombre a una mesa, o toca "Sentar" y luego la mesa.</p>' +
      (lista.length ? '<ul class="adm-personas">' + lista.map(function (g) { return chipInvitado(g, false); }).join("") + '</ul>'
                    : '<p class="adm-vacio">Todos tienen mesa.</p>');
  }

  function panelMesa(m) {
    var invs = estado.datos.invitados.filter(function (g) { return g.mesa === m.id; });
    var ocup = ocupadosEn(m.id);
    return '<div class="adm-mesa-edicion">' +
      '<button type="button" class="adm-link" data-accion="cerrar-mesa">← Ver invitados sin mesa</button>' +
      '<label>Nombre <input data-campo="nombre" value="' + esc(m.nombre) + '" maxlength="60"></label>' +
      '<div class="adm-fila">' +
        '<label>Forma <select data-campo="forma"><option value="redonda"' + (m.forma !== "rectangular" ? " selected" : "") + '>Redonda</option><option value="rectangular"' + (m.forma === "rectangular" ? " selected" : "") + '>Rectangular</option></select></label>' +
        '<label>Lugares <input data-campo="capacidad" type="number" min="1" max="40" value="' + m.capacidad + '"></label>' +
      '</div>' +
      '<p class="' + (ocup > m.capacidad ? "adm-error" : "adm-nota") + '">' + ocup + ' de ' + m.capacidad + ' lugares ocupados' + (ocup > m.capacidad ? " — se pasa de su capacidad" : "") + '</p>' +
      (invs.length ? '<ul class="adm-personas">' + invs.map(function (g) { return chipInvitado(g, true); }).join("") + '</ul>' : '<p class="adm-vacio">Mesa vacía.</p>') +
      '<button type="button" class="adm-btn adm-btn-peligro adm-btn-mini" data-accion="borrar-mesa">Borrar mesa</button>' +
    '</div>';
  }

  function activarLado(lado) {
    lado.addEventListener("dragstart", function (e) {
      var li = e.target.closest("[data-codigo]");
      if (li) e.dataTransfer.setData("text/plain", li.getAttribute("data-codigo"));
    });
    lado.addEventListener("click", function (e) {
      var b = e.target.closest("[data-accion]");
      if (!b) return;
      var accion = b.getAttribute("data-accion");
      var li = b.closest("[data-codigo]");
      var m = estado.mesaSel ? mesaPorId(estado.mesaSel) : null;
      if (accion === "elegir") {
        var c = li.getAttribute("data-codigo");
        estado.elegido = estado.elegido === c ? null : c;
        render();
      } else if (accion === "quitar") {
        asignarMesa(invitado(li.getAttribute("data-codigo")), "").then(render);
        render();
      } else if (accion === "cerrar-mesa") {
        estado.mesaSel = null;
        render();
      } else if (accion === "borrar-mesa" && m) {
        var gente = estado.datos.invitados.filter(function (g) { return g.mesa === m.id; });
        if (!window.confirm("¿Borrar " + m.nombre + "?" + (gente.length ? " " + gente.length + " invitaciones quedarán sin mesa." : ""))) return;
        estado.datos.mesas = estado.datos.mesas.filter(function (x) { return x.id !== m.id; });
        gente.forEach(function (g) { g.mesa = ""; });
        estado.mesaSel = null;
        guardarMesas();
        render();
      }
    });
    lado.addEventListener("change", function (e) {
      var campo = e.target.getAttribute("data-campo");
      var m = estado.mesaSel ? mesaPorId(estado.mesaSel) : null;
      if (!campo || !m) return;
      var v = e.target.value;
      if (campo === "capacidad") v = Math.max(1, Math.min(40, parseInt(v, 10) || m.capacidad));
      m[campo] = v;
      guardarMesas();
      render();
    });
  }

  // ————— ENTRADA —————
  function vistaEntrada(el) {
    var conf = estado.datos.invitados.filter(function (g) { return estadoDe(g) === "confirmado"; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, "es"); });
    var personas = conf.reduce(function (s, g) { return s + g.respuesta.num_asistentes; }, 0);
    el.innerHTML =
      '<div class="adm-mesas-barra no-imprimir">' +
        '<p><b>' + conf.length + '</b> invitaciones confirmadas · <b>' + personas + '</b> personas</p>' +
        '<div class="adm-fila">' +
          '<button type="button" class="adm-btn adm-btn-primary" id="ent-csv">Descargar lista de entrada</button>' +
          '<button type="button" class="adm-btn" id="ent-imprimir">Imprimir</button>' +
          '<button type="button" class="adm-btn adm-btn-ghost" id="ent-todos">Descargar todos los invitados</button>' +
        '</div>' +
      '</div>' +
      '<section class="adm-entrada" id="entrada-lista">' +
        '<h2 class="solo-imprimir">Lista de entrada · Boda de André &amp; Krisli · ' + personas + ' personas</h2>' +
        (conf.length ? '<table><thead><tr><th class="adm-check"></th><th>Nombre</th><th>Personas</th><th>Mesa</th><th>Grupo</th><th>Invitación</th></tr></thead><tbody>' +
          conf.map(function (g) {
            return '<tr><td class="adm-check">☐</td><td>' + esc(g.nombre) + '</td><td>' + g.respuesta.num_asistentes + '</td><td>' + esc(nombreMesa(g.mesa) || "—") + '</td><td>' + esc(g.grupo) + '</td><td>' + (g.tipo === "ceremonia" ? "Solo ceremonia" : "Ceremonia y recepción") + '</td></tr>';
          }).join("") + '</tbody></table>' : '<p class="adm-vacio">Todavía nadie confirmó.</p>') +
      '</section>';

    $("#ent-csv", el).addEventListener("click", function () {
      descargarCsv("Lista-de-entrada.csv", ["Nombre", "Personas", "Mesa", "Grupo", "Invitación", "Llegó"], conf.map(function (g) {
        return [g.nombre, g.respuesta.num_asistentes, nombreMesa(g.mesa), g.grupo, g.tipo === "ceremonia" ? "Solo ceremonia" : "Ceremonia y recepción", ""];
      }));
    });
    $("#ent-todos", el).addEventListener("click", function () {
      descargarCsv("Invitados.csv", ["Nombre", "Código", "Grupo", "Prioridad", "Invitación", "Pases", "Estado", "Personas", "Mesa", "Teléfono", "Aperturas", "Link"],
        estado.datos.invitados.map(function (g) {
          return [g.nombre, g.codigo, g.grupo, g.prioridad, g.tipo, g.pases, ESTADOS[estadoDe(g)].txt,
            estadoDe(g) === "confirmado" ? g.respuesta.num_asistentes : "", nombreMesa(g.mesa), g.telefono, g.aperturas, linkDe(g)];
        }));
    });
    $("#ent-imprimir", el).addEventListener("click", function () { window.print(); });
  }

  // CSV con ";" y BOM: así Excel en español lo abre en columnas y con tildes.
  function descargarCsv(nombre, encabezado, filas) {
    var celda = function (v) { v = String(v == null ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var texto = "﻿" + [encabezado].concat(filas).map(function (f) { return f.map(celda).join(";"); }).join("\r\n");
    var url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ————— REGALOS —————
  function vistaRegalos(el) {
    var d = estado.datos;
    var nombreRegalo = {};
    d.regalos.forEach(function (r) { nombreRegalo[r.id] = r.nombre; });
    var aportes = d.aportes.slice().sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); });
    var total = aportes.filter(function (a) { return a.estado !== "duplicado"; }).reduce(function (s, a) { return s + a.monto; }, 0);
    el.innerHTML =
      '<section class="adm-kpis"><div class="adm-kpi"><span>Aportado</span><strong>' + soles(total) + '</strong><small>sin contar duplicados</small></div>' +
      '<div class="adm-kpi"><span>Aportes</span><strong>' + aportes.length + '</strong><small>' + aportes.filter(function (a) { return a.estado === "duplicado"; }).length + ' marcados duplicados</small></div></section>' +
      '<section class="adm-card"><h2>Avance por regalo</h2><ul class="adm-regalos">' + d.regalos.map(function (r) {
        var pct = r.precio ? Math.min(100, r.recaudado / r.precio * 100) : 0;
        return '<li><span>' + esc(r.nombre) + '</span><span class="adm-regalo-num">' + soles(r.recaudado) + ' / ' + soles(r.precio) + '</span>' +
          '<div class="adm-progreso"><span style="width:' + pct + '%"></span></div></li>';
      }).join("") + '</ul></section>' +
      '<section class="adm-card"><h2>Aportes</h2>' + (aportes.length ? '<ul class="adm-aportes">' + aportes.map(function (a) {
        var dup = a.estado === "duplicado";
        return '<li class="' + (dup ? "is-duplicado" : "") + '" data-fila="' + a.fila + '">' +
          '<div><b>' + esc(a.nombre || "Sin nombre") + '</b> · ' + esc(nombreRegalo[a.regalo_id] || a.regalo_id) + ' · <b>' + soles(a.monto) + '</b>' +
          '<small>' + esc(fechaCorta(a.fecha)) + (dup ? " · marcado duplicado" : "") + '</small>' +
          (a.mensaje ? '<p>"' + esc(a.mensaje) + '"</p>' : "") + '</div>' +
          '<div class="adm-fila">' + (a.comprobante_url ? '<a class="adm-btn adm-btn-mini" target="_blank" rel="noopener" href="' + esc(a.comprobante_url) + '">Ver constancia</a>' : "") +
          '<button type="button" class="adm-btn adm-btn-mini" data-dup="' + (dup ? "" : "duplicado") + '">' + (dup ? "Volver a contar" : "Marcar duplicado") + '</button></div>' +
        '</li>';
      }).join("") + '</ul>' : '<p class="adm-vacio">Todavía no hay aportes.</p>') + '</section>';

    // onclick (no addEventListener): el contenedor se reutiliza entre vistas
    // y así cada render reemplaza el anterior en vez de acumularlos.
    el.onclick = function (e) {
      var b = e.target.closest("[data-dup]");
      if (!b) return;
      var li = b.closest("[data-fila]");
      var fila = Number(li.getAttribute("data-fila"));
      var nuevo = b.getAttribute("data-dup");
      sync("Guardando…");
      api("marcarAporte", { fila: fila, estado: nuevo }).then(function () {
        sync("Guardado");
        return cargar(); // el avance de cada regalo cambia
      }).catch(function (err) { sync(""); toast("No se pudo guardar: " + err.message, true); });
    };
  }

  // ————— HISTORIAL —————
  function vistaHistorial(el) {
    var h = estado.datos.historial;
    el.innerHTML = '<section class="adm-card"><h2>Historial de cambios <small>los últimos 300</small></h2>' +
      (h.length ? '<ul class="adm-historial">' + h.map(function (x) {
        var alerta = x.antes.indexOf("sí") === 0 && x.despues === "no";
        return '<li class="' + (alerta ? "is-alerta" : "") + '"><small>' + esc(fechaCorta(x.fecha)) + ' · ' + esc(x.quien) + '</small>' +
          '<span><b>' + esc(x.nombre || x.codigo) + '</b> ' + esc(x.accion) + (x.antes || x.despues ? ': ' + esc(x.antes) + ' → ' + esc(x.despues) : "") + '</span></li>';
      }).join("") + '</ul>' : '<p class="adm-vacio">Todavía no hay cambios registrados.</p>') + '</section>';
  }

  // ————— arranque —————
  if (!API) {
    mostrarLogin("Falta la dirección del backend (rsvp.apiUrl en js/config.js).");
  } else if (estado.clave) {
    cargar().catch(function (err) {
      if (err.message !== "no autorizado") mostrarLogin("No pudimos conectar. Revisa tu internet e intenta de nuevo.");
    });
  } else {
    mostrarLogin();
  }
  // Al volver a la pestaña, se refresca (otra persona pudo haber cambiado algo).
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && estado.datos && estado.vista !== "mesas") cargar().catch(function () {});
  });
})();
