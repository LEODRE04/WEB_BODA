/* — idioma: español o inglés —
   La invitación está escrita en español (el HTML y los textos de los
   scripts son la fuente). Este archivo, cargado en el <head> antes que
   todo, decide el idioma y, si es inglés, traduce la página por su cuenta:

   Cuál idioma:
     1. ?lang=en o ?lang=es en el link (manda; y queda guardado),
     2. lo que el invitado eligió antes con el botón ES | EN,
     3. el idioma del celular: el primero de sus preferencias que sea
        español o inglés. Si no tiene ninguno de los dos: español para
        portugués, italiano, catalán y gallego; inglés para el resto
        (p. ej. alemán), que es el que más probablemente entienda.

   Cómo traduce: un diccionario español → inglés (EN, más abajo) con el
   texto exacto de cada frase, más unos patrones (PATRONES) para las
   frases que los scripts arman con nombres, números o fechas. Un
   MutationObserver mira todo lo que se escribe en la página —lo del HTML
   mientras se lee y lo que los scripts ponen después (errores, modales,
   la lista de regalos)— y lo reemplaza antes de que se pinte. Así
   site.js y regalos.js siguen escritos en español y no hubo que tocarlos.

   OJO al cambiar un texto en el HTML o en un script: si no se cambia
   también acá, en inglés se queda en español (no se rompe nada, solo no
   se traduce). Lo mismo con los regalos de la hoja de cálculo: sus
   nombres y descripciones están al final del diccionario; un regalo
   nuevo sale en español hasta agregarlo acá. */
(function () {
  "use strict";

  function guardar(l) { try { localStorage.setItem("idioma", l); } catch (e) {} }
  function detectar() {
    try {
      var q = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
      if (q === "es" || q === "en") { guardar(q); return q; }
    } catch (e) {}
    try {
      var g = localStorage.getItem("idioma");
      if (g === "es" || g === "en") return g;
    } catch (e) {}
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || "es"];
    for (var i = 0; i < prefs.length; i++) {
      var l = String(prefs[i] || "").toLowerCase().slice(0, 2);
      if (l === "es" || l === "en") return l;
    }
    // Portugués, italiano, catalán o gallego: el español se les entiende
    // mejor que el inglés.
    var primera = String(prefs[0] || "").toLowerCase().slice(0, 2);
    if (/^(pt|it|ca|gl)$/.test(primera)) return "es";
    return "en";
  }

  var lang = detectar();
  var html = document.documentElement;
  html.lang = lang;

  // — botón ES | EN — va en la barra de arriba (las dos páginas) y en el
  // sobre de apertura, que tapa la barra hasta que se abre. Cambiar
  // recarga la página: los scripts arman muchos textos al arrancar y así
  // todo sale en el idioma nuevo sin casos especiales. El sobre no se
  // repite al recargar (sessionStorage envelope_opened, ver site.js).
  function cambiar(nuevo) {
    if (nuevo === lang) return;
    guardar(nuevo);
    try {
      var u = new URL(location.href);
      u.searchParams.delete("lang");
      location.replace(u.toString());
    } catch (e) {
      location.reload();
    }
  }
  function crearSelector(extra) {
    var g = document.createElement("div");
    g.className = "lang-switch" + (extra ? " " + extra : "");
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", "Idioma / Language");
    g.setAttribute("data-no-traducir", "");
    [["es", "ES", "Español"], ["en", "EN", "English"]].forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = o[1];
      b.lang = o[0];
      b.title = o[2];
      b.setAttribute("aria-label", o[2]);
      b.setAttribute("aria-pressed", String(o[0] === lang));
      b.addEventListener("click", function () { cambiar(o[0]); });
      g.appendChild(b);
    });
    return g;
  }
  function ponerSelectores() {
    var nav = document.querySelector(".site-nav");
    if (nav && !nav.querySelector(".lang-switch")) {
      var toggle = nav.querySelector(".nav-toggle");
      nav.insertBefore(crearSelector(), toggle || null);
    }
    var gate = document.querySelector("#envelope-gate");
    if (gate && !gate.querySelector(".lang-switch")) gate.appendChild(crearSelector("is-gate"));
  }

  // En español no hay nada que traducir: solo el selector.
  if (lang !== "en") {
    document.addEventListener("DOMContentLoaded", ponerSelectores);
    window.I18N = { lang: lang, locale: "es-PE", tr: function (s) { return s; }, traducir: function () {} };
    return;
  }

  /* ——— diccionario ——— (clave: el texto en español, con los espacios
     colapsados; valor: el inglés) */
  var EN = {
    // carga y sobre
    "Escribiendo tu invitación": "Writing your invitation",
    "Enviándotela con cariño": "Sending it with love",
    "Está tardando un poco más de lo normal; ya casi.": "This is taking a little longer than usual; almost there.",
    "Está tardando un poco más de lo normal; ya casi": "This is taking a little longer than usual; almost there",
    "Te invitamos a:": "You're invited to:",
    "Nuestra Boda": "Our Wedding",
    "Preparando tu invitación": "Preparing your invitation",
    "Preparando tu invitación…": "Preparing your invitation…",
    "Acompáñanos en nuestra boda": "Join us for our wedding",
    "Para": "For",
    "Pases": "Seats",
    "Haz clic y arrastra sobre el sello para abrir tu invitación": "Click and drag over the seal to open your invitation",
    "Raspa el sello con tu dedo para abrir tu invitación": "Scratch the seal with your finger to open your invitation",
    "¿Prefieres no raspar? Ábrela aquí": "Rather not scratch? Open it here",
    "Sigue raspando hasta quitar todo el sello": "Keep scratching until the whole seal is gone",
    "Ya casi, limpia lo que queda del sello": "Almost there, clear what's left of the seal",
    "¡Eso es! Levanta el dedo para abrirla": "That's it! Lift your finger to open it",
    "¡Eso es! Suelta para abrirla": "That's it! Let go to open it",
    "Pausar música": "Pause music",
    "Reanudar música": "Play music",
    // barra de arriba
    "Abrir menú": "Open menu",
    "Fecha": "Date",
    "Lugar": "Venue",
    "Vestimenta": "Dress code",
    "Regalos": "Gifts",
    "P&R": "FAQ",
    "Confirmar asistencia": "RSVP",
    // portada
    "Hola,": "Hello,",
    "Iglesia Vida Nueva Rinconada": "Vida Nueva Rinconada Church",
    "Foto de portada — coloca img/p3.jpg": "Cover photo",
    "Foto — coloca img/p1.jpg": "Photo",
    "André y Krisli": "André and Krisli",
    // reserva la fecha
    "Reserva la fecha": "Save the date",
    "Día": "Day",
    "Hora": "Time",
    "La ceremonia empieza puntual a las": "The ceremony starts promptly at",
    "en la Iglesia Vida Nueva Rinconada, La Molina. Te esperamos desde las": "at Vida Nueva Rinconada Church, La Molina. Doors open at",
    "para acomodarnos con calma.": "so we can all settle in calmly.",
    "días": "days",
    "horas": "hours",
    "min": "min",
    "seg": "sec",
    // bienvenida
    "Bienvenidos a nuestra boda": "Welcome to our wedding",
    "Queremos celebrar contigo": "We want to celebrate with you",
    "Después de siete años juntos llegamos a este día, y no lo imaginamos sin las personas que nos acompañaron en el camino. Nos hará muy felices tenerte con nosotros.":
      "After seven years together we've reached this day, and we can't imagine it without the people who walked alongside us. It would make us so happy to have you there.",
    // cuándo y dónde
    "Cuándo y dónde": "When and where",
    "Los datos que necesitas": "Everything you need to know",
    "Ceremonia": "Ceremony",
    "Recepción": "Reception",
    "Cargando mapa": "Loading map",
    "Abrir en Google Maps": "Open in Google Maps",
    "Abrir en Waze": "Open in Waze",
    "La recepción será después de la ceremonia.": "The reception will follow the ceremony.",
    "Mapa de la ceremonia": "Ceremony map",
    "Mapa de la recepción": "Reception map",
    // mesa de regalos
    "Mesa de regalos": "Gift registry",
    "Tu presencia es el regalo": "Your presence is the gift",
    "Lo más importante para nosotros es compartir este día contigo. Si además quieres acompañarnos con un regalo, un aporte será la forma más práctica de ayudarnos en esta nueva etapa.":
      "What matters most to us is sharing this day with you. If you'd also like to give us a gift, a contribution is the most practical way to help us in this new chapter.",
    "Ver datos para transferir": "See transfer details",
    "Celular": "Mobile number",
    "Cuenta en soles": "Account in soles (PEN)",
    "Cuenta simple": "Cuenta Simple account",
    "Todas a nombre de André Leon.": "All accounts are in the name of André Leon.",
    "Copiar el número de Yape": "Copy the Yape number",
    "Copiar la cuenta BCP en soles": "Copy the BCP account in soles",
    "Copiar el CCI del BCP": "Copy the BCP CCI",
    "Copiar la cuenta simple de Interbank": "Copy the Interbank Cuenta Simple account",
    "Copiar el CCI de Interbank": "Copy the Interbank CCI",
    "Copiado": "Copied",
    "¿Ya nos hiciste un regalo?": "Already sent us a gift?",
    "Nos encantará saberlo. Cuando hayas realizado tu transferencia, avísanos para saber que fue tu regalo y poder agradecértelo personalmente.":
      "We'd love to know. Once you've made your transfer, let us know so we know it was from you and can thank you personally.",
    "Ya transferí — avisar a los novios": "I've sent it — let the couple know",
    "Ya transferí, avisar a los novios": "I've sent it, let the couple know",
    "¡Gracias!": "Thank you!",
    "Le avisaremos a André y Krisli de tu detalle.": "We'll let André and Krisli know about your gift.",
    "Tu nombre": "Your name",
    "obligatorio": "required",
    "opcional": "optional",
    "· opcional": "· optional",
    "Mensaje para los novios": "Message for the couple",
    "Mensaje": "Message",
    "Adjuntar constancia": "Attach receipt",
    "Enviar aviso": "Send notice",
    "Sin el mensaje no podemos enviarlo.": "We can't send it without a message.",
    "Aviso enviado": "Notice sent",
    "Unas palabras para ellos…": "A few words for them…",
    "Escribe tu nombre para que sepan de quién es el regalo.": "Write your name so they know who the gift is from.",
    "Escríbeles un mensaje, aunque sea corto — es lo que les llega.": "Write them a message, even a short one — it's what they'll receive.",
    "No se pudo leer, prueba con otra": "Couldn't read it, try another one",
    "No pudimos enviar tu aviso.": "We couldn't send your notice.",
    "Lista de regalos": "Gift list",
    "Elige un regalo": "Choose a gift",
    "Una selección de regalos pensados para acompañarnos en esta nueva etapa. Cada uno tiene un propósito especial para nuestro hogar y nuestra vida juntos.":
      "A selection of gifts chosen to accompany us in this new chapter. Each one has a special purpose for our home and our life together.",
    "Ver la lista de regalos": "See the gift list",
    // código de vestimenta
    "Código de vestimenta": "Dress code",
    "Semi elegante o elegante": "Semi-formal or formal",
    "Queremos que estés cómodo, así que puedes elegir entre un look semi elegante o elegante.":
      "We want you to be comfortable, so feel free to choose a semi-formal or formal look.",
    "Y, con cariño, reservemos el blanco para la novia.": "And, kindly, let's leave white for the bride.",
    // confirmación
    "Confirmación": "RSVP",
    "¿Nos acompañas?": "Will you join us?",
    "Responde antes del": "Please reply by",
    ". Cada invitación es personal.": ". Each invitation is personal.",
    "¿Dudas?": "Questions?",
    "Escríbenos": "Message us",
    "Escríbenos por WhatsApp": "Message us on WhatsApp",
    "¿Dudas? Muy pronto agregamos un contacto de WhatsApp.": "Questions? We'll add a WhatsApp contact soon.",
    "Nombre y apellido": "Full name",
    "Número de asistentes": "Number of guests",
    "¿Podrás asistir?": "Will you attend?",
    "Sí, ahí estaré": "Yes, I'll be there",
    "No podré ir": "I can't make it",
    "¿Cuántos van?": "How many of you are coming?",
    "Van todos los de tu invitación.": "Everyone on your invitation is coming.",
    "Confirmar": "Confirm",
    "Actualizar": "Update",
    "Enviando…": "Sending…",
    "Cargando…": "Loading…",
    "Puede tardar unos segundos; no cierres la página.": "This may take a few seconds; please don't close the page.",
    "Recibimos tu respuesta. Gracias por confirmar.": "We got your reply. Thank you for confirming.",
    "Confirma desde tu link personal": "Confirm from your personal link",
    "Para confirmar, abre el link que te enviamos por WhatsApp. ¿No lo encuentras? Escríbenos y te lo reenviamos.":
      "To confirm, open the link we sent you on WhatsApp. Can't find it? Message us and we'll send it again.",
    "Pedir mi link por WhatsApp": "Ask for my link on WhatsApp",
    "No reconocemos este link de invitación. Escríbenos por WhatsApp y te enviamos el correcto.":
      "We don't recognize this invitation link. Message us on WhatsApp and we'll send you the right one.",
    "No reconocemos tu link de invitación. Escríbenos por WhatsApp y te enviamos el correcto.":
      "We don't recognize your invitation link. Message us on WhatsApp and we'll send you the right one.",
    "Buscando tu invitación": "Looking up your invitation",
    "Nos falta tu nombre para guardar la confirmación.": "We need your name to save your reply.",
    "Falta decirnos si podrás acompañarnos.": "Please tell us whether you can join us.",
    "No pudimos guardar tu confirmación.": "We couldn't save your reply.",
    "Parece que hay un problema de conexión. Inténtalo nuevamente en unos momentos.":
      "There seems to be a connection problem. Please try again in a moment.",
    "La imagen de la constancia pesa demasiado. Prueba con una captura de pantalla.":
      "The receipt image is too large. Try a screenshot instead.",
    "La constancia tiene que ser una imagen (una foto o una captura de pantalla).":
      "The receipt has to be an image (a photo or a screenshot).",
    "A nombre de": "Name",
    "Asistentes": "Guests",
    "Descargar mi pase": "Download my pass",
    "Editar mi respuesta": "Edit my reply",
    "¿Quieres acompañarnos con un regalo?": "Would you like to give us a gift?",
    "Ver la mesa de regalos": "See the gift registry",
    "Asistencia confirmada": "Attendance confirmed",
    "Respuesta recibida": "Reply received",
    "Respuesta registrada": "Reply recorded",
    "¡Nos vemos ahí!": "See you there!",
    "Te extrañaremos": "We'll miss you",
    "Gracias. Tu lugar ya está guardado.": "Thank you. Your seat is saved.",
    "Gracias por avisarnos. Te tendremos presente ese día.": "Thank you for letting us know. We'll be thinking of you that day.",
    "Nos alegra tenerte aquí": "We're so glad you're coming",
    "Te vamos a extrañar": "We'll miss you",
    "Cerrar": "Close",
    "Cambiar mi respuesta": "Change my reply",
    "Generando…": "Generating…",
    "No pudimos generarlo. Inténtalo de nuevo": "We couldn't generate it. Please try again",
    "Preparando tu pase…": "Preparing your pass…",
    // preguntas
    "Preguntas y respuestas": "Questions and answers",
    "Lo que suelen preguntarnos": "What people usually ask us",
    "¿A qué hora debo llegar?": "What time should I arrive?",
    "Las puertas abren a las 2:30 p.m. y la ceremonia empieza puntual a las 4:00 p.m. Te recomendamos llegar a más tardar a las 3:30 p.m. para ubicarte con calma.":
      "Doors open at 2:30 p.m. and the ceremony starts promptly at 4:00 p.m. We recommend arriving by 3:30 p.m. at the latest so you can find your seat calmly.",
    "¿Puedo llevar niños?": "Can I bring children?",
    "La celebración es solo para adultos, con excepción de los niños que forman parte de la ceremonia.":
      "The celebration is adults only, except for the children who are part of the ceremony.",
    "¿Puedo llevar acompañante?": "Can I bring a plus-one?",
    "Solo si tu invitación lo indica. Al confirmar verás cuántos lugares tienes reservados.":
      "Only if your invitation says so. When you confirm you'll see how many seats are reserved for you.",
    "¿Hasta cuándo puedo confirmar?": "When is the RSVP deadline?",
    "Nos ayudaría mucho en la organización que sea lo antes posible; sin embargo la fecha límite es hasta el 30 de octubre de 2026. Después ya no podremos agregar cubiertos.":
      "It would help our planning a lot if you replied as soon as possible; the deadline, though, is October 30, 2026. After that we won't be able to add more seats.",
    "¿Hay estacionamiento?": "Is there parking?",
    "Sí, alrededor del recinto y contaremos con personal de seguridad.": "Yes, around the venue, and there will be security staff.",
    "¿Dónde dejo mi regalo?": "Where do I leave my gift?",
    "Si quieres hacernos un regalo, lo más práctico para nosotros es un aporte por Yape o transferencia (lo tienes en":
      "If you'd like to give us a gift, the most practical option for us is a contribution by Yape or bank transfer (you'll find it under",
    "). El día de la boda no habrá mesa para regalos físicos.": "). There won't be a table for physical gifts on the wedding day.",
    // oración y pie
    "Un pedido especial": "A special request",
    "Oren por nosotros": "Pray for us",
    "Te pedimos, con mucho cariño, que puedas ir orando por este día tan especial y por la nueva etapa que comenzamos juntos.":
      "We lovingly ask you to keep this special day, and the new chapter we're beginning together, in your prayers.",
    "Con mucho amor,": "With much love,",
    "¿Nos acompañas? ": "Will you join us? ",
    "Invitación de boda de André y Krisli. Ubicación y confirmación de asistencia.": "André and Krisli's wedding invitation. Venue and RSVP.",
    "Invitación de boda de André y Krisli.": "André and Krisli's wedding invitation.",
    "Lista de regalos — André & Krisli": "Gift list — André & Krisli",
    "Elige un regalo para André y Krisli y aporta por Yape o transferencia.": "Choose a gift for André and Krisli and contribute by Yape or bank transfer.",

    // — regalos.html —
    "← Volver a la invitación": "← Back to the invitation",
    "← Volver a la lista": "← Back to the list",
    "Volver a la lista": "Back to the list",
    "Elige el que más te guste": "Choose your favorite",
    "Tu presencia ya es el regalo. Si además quieres darnos algo, armamos esta lista de cosas que de verdad usaremos — puedes aportar completo o una parte.":
      "Your presence is already the gift. If you'd also like to give us something, we put together this list of things we'll really use — you can cover all of it or just a part.",
    "¿Cómo funciona la lista?": "How does the list work?",
    "Cómo funciona la lista": "How the list works",
    "Disponibles": "Available",
    "Completos": "Completed",
    "Todos": "All",
    "Completo": "Completed",
    "Preparando la lista de regalos": "Preparing the gift list",
    "Sigue cargando, gracias por la paciencia": "Still loading, thanks for your patience",
    "Todavía no hay regalos en la lista — vuelve a intentarlo más tarde, o escríbenos por WhatsApp si tienes dudas.":
      "There are no gifts on the list yet — try again later, or message us on WhatsApp if you have questions.",
    "No pudimos cargar la lista de regalos.": "We couldn't load the gift list.",
    "Reintentar": "Try again",
    "Continuar": "Continue",
    "Tu regalo": "Your gift",
    "¿Cuánto quieres aportar?": "How much would you like to contribute?",
    "Montos sugeridos": "Suggested amounts",
    "Otro monto": "Other amount",
    "Con esto completas el regalo. ¡Muchas gracias!": "This completes the gift. Thank you so much!",
    "De parte de": "From",
    "Un mensaje para los novios, si quieres…": "A message for the couple, if you like…",
    "Si alguien más aporta al mismo regalo, se suma — el avance de arriba se actualiza para todos.":
      "If someone else contributes to the same gift, it adds up — the progress above updates for everyone.",
    "Transfiere a cualquiera": "Transfer to any of these",
    "Antes de elegir": "Before you choose",
    "Elige el que más te guste. Todos están disponibles hasta completar su monto y no hay un orden de elección ni un mínimo de aporte.":
      "Choose your favorite. They're all available until their amount is reached, and there's no order to follow or minimum contribution.",
    "Aporta lo que prefieras": "Contribute what you like",
    "No es necesario cubrir el monto completo. Puedes aportar la cantidad que desees.": "You don't need to cover the full amount. You can contribute any amount you wish.",
    "Los novios reciben el aporte": "The couple receives the contribution",
    "El dinero se entrega directamente a André y Krisli, quienes se encargarán de realizar la compra.":
      "The money goes directly to André and Krisli, who will make the purchase.",
    "Deja un mensaje": "Leave a message",
    "Puedes acompañar tu aporte con un mensaje para André y Krisli. Lo recibirán junto con el regalo.":
      "You can add a message for André and Krisli with your contribution. They'll receive it along with the gift.",
    "Gracias por este regalo": "Thank you for this gift",
    "Revisaremos la transferencia y te avisamos.": "We'll check the transfer and let you know.",
    "Mostrar regalos": "Show gifts",
    "No mostrar de nuevo": "Don't show again",
    "Ya está completo — ¡gracias!": "It's complete — thank you!",
    "Este regalo ya está completo": "This gift is already complete",
    "¡Gracias por pensarlo! Todavía quedan otros esperando.": "Thanks for thinking of it! There are others still waiting.",
    "Ver los que faltan": "See the remaining ones",
    "Elige un regalo de la lista de arriba.": "Choose a gift from the list above.",
    "Escribe tu nombre para que sepamos de parte de quién es.": "Write your name so we know who it's from.",
    "El monto tiene que ser mayor a 0.": "The amount has to be greater than 0.",
    "No pudimos enviar tu aporte.": "We couldn't send your contribution.",

    // — el pase (js/pase.js) —
    "Invitación a nombre de": "Invitation for",
    "Invitado": "Guest",
    "Llegada": "Arrival",
    "La ceremonia empieza puntual.": "The ceremony starts promptly.",
    "Blanco reservado para la novia.": "White is reserved for the bride.",
    "Código de pase": "Pass code",
    "Solo de referencia.": "For reference only.",
    "Recomendaciones": "Good to know",
    "Código QR con el link a la invitación": "QR code linking to the invitation",
    "Escanéalo para volver": "Scan it to go back",
    "a tu invitación": "to your invitation",
    "Mesa de regalos y mapa en la invitación web.": "Gift registry and map in the web invitation.",
    "Hay estacionamiento alrededor del recinto, con personal de seguridad.": "There's parking around the venue, with security staff.",
    "Este pase es personal y es válido para la ceremonia.": "This pass is personal and valid for the ceremony.",
    "Este pase es personal y cubre los dos momentos: ceremonia y recepción.": "This pass is personal and covers both the ceremony and the reception.",
    "La Rinconada, La Molina — Lima": "La Rinconada, La Molina — Lima",

    // — regalos de la hoja de cálculo (nombre y descripción) —
    "Set de Cubiertos": "Cutlery set",
    "Para las cenas de los domingos con toda la familia.": "For Sunday dinners with the whole family.",
    "Cafetera": "Coffee maker",
    "Para los postres que André prometió aprender a hacer.": "For the desserts André promised to learn to make.",
    "Juego de ollas": "Cookware set",
    "Para las recetas de siempre que queremos seguir cocinando.": "For the classic recipes we want to keep cooking.",
    "Sillas para el comedor": "Dining chairs",
    "Para recibir a la familia y amigos en casa.": "For welcoming family and friends into our home.",
    "Set de cama": "Bedding set",
    "Para las noches tranquilas en nuestro nuevo hogar.": "For quiet nights in our new home.",
    "Set de vajilla": "Dinnerware set",
    "Para servir cada comida que compartamos en casa.": "For serving every meal we share at home.",
    "Cocina": "Stove",
    "Para preparar juntos muchas comidas por venir.": "For cooking many meals together in the years to come.",
    "Lavadora": "Washing machine",
    "Para hacernos un poco más fácil el día a día.": "To make everyday life a little easier.",
    "Microondas": "Microwave",
    "Para las cenas rápidas de los días más ocupados.": "For quick dinners on the busiest days.",
    "Refrigeradora": "Refrigerator",
    "Para acompañarnos en nuestro día a día durante muchos años.": "To be part of our everyday life for many years.",
    "Sillón": "Sofa",
    "Para nuestras tardes de descanso y películas.": "For our lazy afternoons and movie nights.",
    "Luna de miel": "Honeymoon",
    "Para celebrar juntos el comienzo de esta nueva etapa.": "To celebrate the beginning of this new chapter together.",
  };

  /* ——— fechas ——— "30 de octubre de 2026" → "October 30, 2026",
     "Sábado 9 de enero" → "Saturday, January 9", "p. m." → "p.m." */
  var MESES = { enero: "January", febrero: "February", marzo: "March", abril: "April", mayo: "May", junio: "June",
    julio: "July", agosto: "August", septiembre: "September", setiembre: "September", octubre: "October",
    noviembre: "November", diciembre: "December" };
  var DIAS = { lunes: "Monday", martes: "Tuesday", "miércoles": "Wednesday", jueves: "Thursday", viernes: "Friday",
    "sábado": "Saturday", domingo: "Sunday" };
  var RE_MES = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
  var RE_DIA = "(lunes|martes|miércoles|jueves|viernes|sábado|domingo)";
  function fechas(s) {
    return s
      .replace(new RegExp("(\\d{1,2}) de " + RE_MES + " de (\\d{4})", "gi"), function (_, d, m, y) { return MESES[m.toLowerCase()] + " " + d + ", " + y; })
      .replace(new RegExp("(\\d{1,2}) de " + RE_MES, "gi"), function (_, d, m) { return MESES[m.toLowerCase()] + " " + d; })
      .replace(new RegExp("\\b" + RE_MES + "( \\d{4})", "gi"), function (_, m, y) { return MESES[m.toLowerCase()] + y; })
      .replace(new RegExp(RE_DIA + ",? (?=[A-Z])", "gi"), function (_, d) { return DIAS[d.toLowerCase()] + ", "; })
      .replace(new RegExp("(^|\\s)" + RE_DIA + "(?=$|\\s|,)", "gi"), function (_, a, d) { return a + DIAS[d.toLowerCase()]; })
      .replace(/(\d)\s*p\.\s*m\./g, "$1 p.m.").replace(/(\d)\s*a\.\s*m\./g, "$1 a.m.");
  }
  // Solo fecha y hora, sin otras palabras en español: se traduce entera.
  function soloFecha(s) {
    var t = fechas(s);
    if (t === s) return null;
    var resto = t.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, "")
      .replace(/[ap]\.m\./g, "");
    return /[a-záéíóúñ]/i.test(resto) ? null : t;
  }
  function s_(n, uno, varios) { return n === "1" || n === 1 ? uno : varios; }
  var EVENTO = { "la ceremonia": "the ceremony", "la ceremonia y la recepción": "the ceremony and the reception", "la recepción": "the reception" };
  function nombre(x) { return EN[x] || x; }

  /* ——— frases que los scripts arman con nombres, números y fechas ——— */
  var PATRONES = [
    [/^Estamos muy felices de poder invitarte\. Guardamos (un lugar|(\d+) lugares) pensando en ti, para (.+)\.$/, function (m) {
      return "We're so happy to invite you. We've saved " + (m[2] ? m[2] + " seats" : "a seat") + " for you at " + (EVENTO[m[3]] || m[3]) + "."; }],
    [/^Te esperamos en (.+)\.$/, function (m) { return "We look forward to seeing you at " + (EVENTO[m[1]] || m[1]) + "."; }],
    [/^(\d+) pases? reservados?$/, function (m) { return m[1] + s_(m[1], " seat reserved", " seats reserved"); }],
    [/^(\d+) pases? confirmados?$/, function (m) { return m[1] + s_(m[1], " seat confirmed", " seats confirmed"); }],
    [/^Tu invitación es para (\d+) personas?\.$/, function (m) { return "Your invitation is for " + m[1] + s_(m[1], " person.", " people."); }],
    [/^Tu invitación es para (\d+); confirmas (\d+) personas?\.$/, function (m) {
      return "Your invitation is for " + m[1] + "; you're confirming " + m[2] + s_(m[2], " person.", " people."); }],
    [/^Para: (.+) · (\d+) pases?$/, function (m) { return "For: " + m[1] + " · " + m[2] + s_(m[2], " seat", " seats"); }],
    [/^Gracias, (.+)\. Tu lugar ya está guardado\.$/, function (m) { return "Thank you, " + m[1] + ". Your seat is saved."; }],
    [/^Gracias por avisarnos, (.+)\. Te tendremos presente ese día\.$/, function (m) {
      return "Thank you for letting us know, " + m[1] + ". We'll be thinking of you that day."; }],
    [/^Tu lugar ya está guardado(?:, (.+))?\. Nos vemos el (.+)$/, function (m) {
      return "Your seat is saved" + (m[1] ? ", " + m[1] : "") + ". See you on " + fechas(m[2]); }],
    [/^Gracias por avisarnos(?:, (.+))?\. Te vamos a extrañar ese día, y te agradecemos mucho el cariño de siempre\.$/, function (m) {
      return "Thank you for letting us know" + (m[1] ? ", " + m[1] : "") + ". We'll miss you that day, and we're grateful for your love as always."; }],
    [/^Respondiste el (.+)$/, function (m) { return "You replied on " + fechas(m[1]); }],
    [/^Puedes editar tu respuesta hasta el (.+)\.$/, function (m) { return "You can change your reply until " + fechas(m[1]) + "."; }],
    [/^Si tus planes cambian, (?:puedes avisarnos|avísanos) hasta el (.+)\.$/, function (m) {
      return "If your plans change, let us know by " + fechas(m[1]) + "."; }],
    [/^Hasta el (.+)$/, function (m) { return "By " + fechas(m[1]); }],
    [/^¡Gracias, (.+)!$/, function (m) { return "Thank you, " + m[1] + "!"; }],
    [/^Aviso del (.+)$/, function (m) { return "Notice from " + fechas(m[1]); }],
    [/^Ya se lo hicimos saber a André y Krisli(, con tu constancia adjunta)?\. Gracias de corazón\.$/, function (m) {
      return "We've let André and Krisli know" + (m[1] ? ", with your receipt attached" : "") + ". Thank you from the bottom of our hearts."; }],
    [/^(.+) reunidos de (.+)$/, function (m) { return m[1] + " raised of " + m[2]; }],
    [/^foto de (.+)$/, function (m) { return "photo of " + nombre(m[1]); }],
    [/^Continuar con (.+)$/, function (m) { return "Continue with " + nombre(m[1]); }],
    [/^Gracias por este regalo, (.+)$/, function (m) { return "Thank you for this gift, " + m[1]; }],
    [/^Las puertas abren a las 2:30 p\.m\.; la ceremonia empieza puntual a las (.+)\.$/, function (m) {
      return "Doors open at 2:30 p.m.; the ceremony starts promptly at " + fechas(m[1]) + "."; }],
    [/^André & Krisli — (.+)$/, function (m) { return "André & Krisli — " + fechas(m[1]); }],
  ];

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }
  function traducirTexto(n) {
    if (Object.prototype.hasOwnProperty.call(EN, n)) return EN[n];
    for (var i = 0; i < PATRONES.length; i++) {
      var m = n.match(PATRONES[i][0]);
      if (m) return PATRONES[i][1](m);
    }
    return soloFecha(n);
  }
  function tr(s) {
    if (s == null) return s;
    var n = norm(String(s));
    if (!n) return s;
    var t = traducirTexto(n);
    return t == null ? s : t;
  }

  var SALTAR = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  var ATRIBUTOS = ["aria-label", "placeholder", "title", "alt"];
  function saltar(el) { return !el || SALTAR[el.tagName] || (el.closest && el.closest("[data-no-traducir]")); }
  function nodoTexto(nodo) {
    var v = nodo.nodeValue;
    if (!v || !/[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]/.test(v)) return;
    if (saltar(nodo.parentElement)) return;
    var n = norm(v);
    var t = traducirTexto(n);
    if (t == null || t === n) return;
    var antes = v.match(/^\s*/)[0], despues = v.match(/\s*$/)[0];
    nodo.nodeValue = antes + t + despues;
  }
  function atributos(el) {
    // Acá no se saltan los <textarea>: su texto es lo que escribe el
    // invitado, pero el placeholder sí hay que traducirlo.
    if (!el || (el.closest && el.closest("[data-no-traducir]"))) return;
    for (var i = 0; i < ATRIBUTOS.length; i++) {
      var v = el.getAttribute(ATRIBUTOS[i]);
      if (!v) continue;
      var t = traducirTexto(norm(v));
      if (t != null && t !== v) el.setAttribute(ATRIBUTOS[i], t);
    }
    if (el.tagName === "META") {
      var c = el.getAttribute("content");
      var tc = c && traducirTexto(norm(c));
      if (tc != null && tc !== c) el.setAttribute("content", tc);
    }
  }
  function traducir(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { nodoTexto(raiz); return; }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    var nodo;
    while ((nodo = w.nextNode())) nodoTexto(nodo);
    if (raiz.nodeType === 1) atributos(raiz);
    var els = raiz.querySelectorAll("[aria-label],[placeholder],[title],[alt],meta[content]");
    for (var i = 0; i < els.length; i++) atributos(els[i]);
  }

  // Todo lo que entra o cambia en la página pasa por acá (también lo que
  // el navegador va leyendo del HTML), antes de pintarse.
  new MutationObserver(function (cambios) {
    for (var i = 0; i < cambios.length; i++) {
      var c = cambios[i];
      if (c.type === "characterData") nodoTexto(c.target);
      else if (c.type === "attributes") atributos(c.target);
      else for (var j = 0; j < c.addedNodes.length; j++) traducir(c.addedNodes[j]);
    }
  }).observe(html, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS.concat(["content"]) });

  document.title = tr(document.title);
  // El título puede venir después de este script si cambia el orden del
  // <head>: se repasa al terminar de leer la página.
  document.addEventListener("DOMContentLoaded", function () {
    document.title = tr(document.title);
    traducir(document);
    ponerSelectores();
  });

  window.I18N = { lang: lang, locale: "en-US", tr: tr, traducir: traducir };
})();
