// config.js — todos los datos de la boda en un solo lugar.
// Edita este archivo para actualizar textos/fechas/cuentas sin tocar el HTML.
// Los campos marcados pending:true muestran la etiqueta "por confirmar" en la página.
window.WEDDING = {
  couple: { a: "André", b: "Krisli" },

  // ISO 8601 con offset de Lima (UTC-5, sin horario de verano).
  weddingDateISO: "2027-01-09T16:00:00-05:00",
  weddingDateLabel: "Sábado 9 de enero de 2027, 4:00 p.m.",

  venue: {
    name: "Iglesia Vida Nueva Rinconada",
    area: "La Rinconada, La Molina — Lima",
    addressPending: true,
    // Mapa armado con el nombre del lugar (sin API key) — funciona ya, sin
    // esperar la dirección exacta. Cuando la tengan, lo más preciso es
    // reemplazar mapSearchQuery por la dirección completa, o pegar aquí el
    // <iframe src="..."> que da Google Maps en Compartir > Insertar un mapa.
    mapSearchQuery: "Iglesia Vida Nueva Rinconada, La Molina, Lima, Perú",
    get mapEmbedSrc() {
      return "https://www.google.com/maps?q=" + encodeURIComponent(this.mapSearchQuery) + "&output=embed";
    },
    get mapsUrl() {
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(this.mapSearchQuery);
    },
    get directionsUrl() {
      return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(this.mapSearchQuery);
    },
  },

  // Local aparte para la recepción (distinto de la iglesia). Se muestra
  // solo a invitados con tipo_invitacion "completa" — ver js/site.js y
  // docs/RSVP-BACKEND.md. mapSearchQuery en null = mapa/links deshabilitados
  // (el bloque igual se ve, pero como "por confirmar"); en cuanto tengan
  // el local, pon aquí su nombre y dirección tal como harías con `venue`.
  venueReception: {
    mapSearchQuery: null,
    get mapEmbedSrc() {
      return this.mapSearchQuery ? "https://www.google.com/maps?q=" + encodeURIComponent(this.mapSearchQuery) + "&output=embed" : null;
    },
    get mapsUrl() {
      return this.mapSearchQuery ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(this.mapSearchQuery) : null;
    },
    get directionsUrl() {
      return this.mapSearchQuery ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(this.mapSearchQuery) : null;
    },
  },

  rsvp: {
    deadlineISO: "2026-11-30",
    deadlineLabel: "30 de noviembre de 2026",
    editUntilLabel: "20 de diciembre",
    whatsapp: "51992770777", // sin '+' ni espacios — se arma el link solo
    whatsappMessage: "¡Hola! Tengo una consulta sobre la boda de André y Krisli 💍",

    // Backend del formulario (fase 3). "/api/rsvp" es la ruta que sirve
    // server/dev_api.py en desarrollo local. Cuando esté desplegado el
    // Google Apps Script real (ver docs/RSVP-BACKEND.md), reemplaza esto
    // por esa URL absoluta (https://script.google.com/macros/s/.../exec)
    // y funciona igual en local y en producción.
    // Si la API no responde (por ejemplo en GitHub Pages, antes de
    // desplegar el backend real), el formulario cae solo a guardar en
    // localStorage como hacía antes — no se rompe nada mientras tanto.
    apiUrl: "/api/rsvp",
  },

  gifts: {
    yape: { number: "+51 987 654 321", holder: "Krisli", holderPending: true },
    bank: {
      soles: "191-0000000-0-00",
      cci: "002-191-000000000000-00",
      bankNamePending: true,
    },
    giftListUrl: null,
  },

  dressCode: {
    title: "Formal elegante",
    description:
      "Ellos, terno oscuro y corbata. Ellas, vestido largo o midi. Te pedimos con cariño reservar el blanco para la novia.",
  },
};
