// config.js — todos los datos de la boda en un solo lugar.
// Edita este archivo para actualizar textos/fechas/cuentas sin tocar el HTML.
// Los campos marcados pending:true muestran la etiqueta "por confirmar" en la página.
window.WEDDING = {
  couple: { a: "André", b: "Krisli" },

  // ISO 8601 con offset de Lima (UTC-5, sin horario de verano).
  // OJO: es la hora a la que pedimos que lleguen (2:00 p.m.), no la del
  // inicio real de la ceremonia, que a propósito no aparece en ningún
  // lado de la invitación. La cuenta regresiva y el pase usan esta hora.
  weddingDateISO: "2027-01-09T14:00:00-05:00",
  weddingDateLabel: "Sábado 9 de enero de 2027, 2:00 p.m.",
  arrivalLabel: "2:00 p.m.",

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
    // Waze, además de Google Maps: son las dos apps de navegación que más
    // se usan en Lima. navigate=yes abre directo la ruta en el celular.
    get wazeUrl() {
      return "https://waze.com/ul?q=" + encodeURIComponent(this.mapSearchQuery) + "&navigate=yes";
    },
  },

  // Local aparte para la recepción (distinto de la iglesia). Se muestra
  // solo a invitados con tipo_invitacion "completa" — ver js/site.js y
  // docs/RSVP-BACKEND.md. mapSearchQuery en null = mapa/links deshabilitados
  // (el bloque igual se ve, pero como "por confirmar"); en cuanto tengan
  // el local, pon aquí su nombre y dirección tal como harías con `venue`.
  venueReception: {
    mapSearchQuery: "Av. La Molina 1935, La Molina, Lima, Perú",
    get mapEmbedSrc() {
      return this.mapSearchQuery ? "https://www.google.com/maps?q=" + encodeURIComponent(this.mapSearchQuery) + "&output=embed" : null;
    },
    get mapsUrl() {
      return this.mapSearchQuery ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(this.mapSearchQuery) : null;
    },
    get directionsUrl() {
      return this.mapSearchQuery ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(this.mapSearchQuery) : null;
    },
    get wazeUrl() {
      return this.mapSearchQuery ? "https://waze.com/ul?q=" + encodeURIComponent(this.mapSearchQuery) + "&navigate=yes" : null;
    },
  },

  rsvp: {
    deadlineISO: "2026-11-07",
    deadlineLabel: "7 de noviembre de 2026",
    editUntilLabel: "7 de noviembre",
    whatsapp: "51992770777", // sin '+' ni espacios — se arma el link solo
    whatsappMessage: "¡Hola! Tengo una consulta sobre la boda de André y Krisli 💍",

    // Backend real (Google Apps Script, ver docs/RSVP-BACKEND.md) ya
    // desplegado — funciona igual en local y en producción (GitHub Pages).
    apiUrl: "https://script.google.com/macros/s/AKfycbx_mBldIKxpTDNUtRX-de-pOnkgwlM0YNTIvjzEreXGqPIRiOZcATPO7tjZsT_O5hfh/exec",
  },

  // Solo referencia: ningún script lee este bloque. Los datos de pago que
  // ve el invitado están escritos en index.html (mesa de regalos) y en
  // regalos.html (cómo aportar). Si cambian, actualizar los tres lugares.
  gifts: {
    yape: { titular: "André Leon", numero: "992770777" },
    interbank: { titular: "André Leon", soles: "8983225047822", cci: "00389801322504782240" },
    bcp: { titular: "Krisli Heidinger", dolares: "19394831562154", cci: "00219319483156215419" },
  },

  // Lo mismo que dice la sección "Código de vestimenta" de index.html —
  // acá vive aparte porque el pase en PDF (js/pase.js) usa el title como
  // etiqueta corta. Si cambia uno, cambiar el otro.
  dressCode: {
    title: "Semi elegante o elegante",
    description:
      "Queremos que estés cómodo, así que puedes elegir entre un look semi elegante o elegante. Y, con cariño, reservemos el blanco para la novia.",
  },
};
