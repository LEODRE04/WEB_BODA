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

  rsvp: {
    deadlineISO: "2026-11-30",
    deadlineLabel: "30 de noviembre de 2026",
    editUntilLabel: "20 de diciembre",
    whatsapp: null, // ej. "51987654321" (sin '+' ni espacios) — se arma el link solo
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
