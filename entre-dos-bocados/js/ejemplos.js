/*
 * Reseñas de EJEMPLO para el modo prueba. Son lugares inventados y
 * desaparecen al tocar "Quitar ejemplos" o al conectar Supabase.
 */
(function () {
  "use strict";

  // Ilustración simple de un plato visto desde arriba (no son fotos reales).
  function plato(mesa, comida, detalle, extra) {
    const puntos = [
      [300, 205, 16], [255, 250, 12], [345, 260, 14], [290, 290, 10], [325, 215, 9],
    ]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${detalle}"/>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
      <rect width="600" height="450" fill="${mesa}"/>
      <g opacity=".16" stroke="#000" stroke-width="2">
        <path d="M0 60h600M0 150h600M0 240h600M0 330h600M0 420h600"/>
      </g>
      <ellipse cx="306" cy="252" rx="178" ry="172" fill="#000" opacity=".18"/>
      <circle cx="300" cy="240" r="172" fill="#fbfbf9"/>
      <circle cx="300" cy="240" r="140" fill="none" stroke="#e7e4df" stroke-width="3"/>
      <circle cx="300" cy="245" r="98" fill="${comida}"/>
      ${puntos}
      <rect x="505" y="90" width="12" height="280" rx="6" fill="${extra}"/>
      <rect x="80" y="110" width="10" height="250" rx="5" fill="${extra}"/>
      <path d="M72 110h26v70a13 13 0 0 1-26 0z" fill="${extra}"/>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  window.EDB_EJEMPLOS = [
    {
      id: "ejemplo-1",
      ejemplo: true,
      nombre: "El Mantel a Cuadros",
      categoria: "Bodegón",
      estilos: ["Argentina", "Española"],
      direccion: "Almagro, CABA",
      lat: -34.6097, lng: -58.4207,
      precio: 2,
      fechaVisita: "2026-11-14",
      pedimos: "Milanesa napolitana con fritas y flan mixto.",
      imperdible: "La milanesa: cubre el plato entero.",
      opiniones: [
        { nota: 9, texto: "Porciones gigantes, mozos de toda la vida y el flan casero vale el viaje." },
        { nota: 8, texto: "Ruidoso un sábado a la noche, pero todo sale rápido y caliente. Vamos a volver." },
      ],
      volveriamos: true,
      fotos: [plato("#a8323e", "#d99a3e", "#c0392b", "#9aa0a6")],
    },
    {
      id: "ejemplo-2",
      ejemplo: true,
      nombre: "Nube de Ramen",
      categoria: "Restaurante",
      estilos: ["Japonesa"],
      direccion: "Palermo, CABA",
      lat: -34.5885, lng: -58.4305,
      precio: 3,
      fechaVisita: "2026-11-02",
      pedimos: "Tonkotsu ramen, gyozas y té verde frío.",
      imperdible: "El caldo tonkotsu.",
      opiniones: [
        { nota: 8.5, texto: "Caldo denso y con mucho sabor. Los fideos, al punto." },
        { nota: 7, texto: "Rico, pero esperamos 40 minutos para sentarnos. Mejor ir temprano." },
      ],
      volveriamos: true,
      fotos: [plato("#2f3e46", "#e9c46a", "#f4a261", "#6c757d")],
    },
    {
      id: "ejemplo-3",
      ejemplo: true,
      nombre: "Horno de Barro",
      categoria: "Restaurante",
      estilos: ["Pizza", "Italiana"],
      direccion: "Villa Crespo, CABA",
      lat: -34.599, lng: -58.4389,
      precio: 2,
      fechaVisita: "2026-10-20",
      pedimos: "Pizza de fugazzeta rellena y una de rúcula y crudo.",
      imperdible: "La fugazzeta rellena.",
      opiniones: [
        { nota: 7.5, texto: "Masa finita y crocante, como nos gusta." },
        { nota: 8, texto: "La rúcula y crudo estaba muy bien. Buen precio para lo que es." },
      ],
      volveriamos: true,
      fotos: [plato("#264653", "#f1c27d", "#e76f51", "#8d99ae")],
    },
    {
      id: "ejemplo-4",
      ejemplo: true,
      nombre: "Café Ventanal",
      categoria: "Café",
      estilos: ["Brunch", "Dulce"],
      direccion: "San Telmo, CABA",
      lat: -34.6212, lng: -58.3731,
      precio: 2,
      fechaVisita: "2026-10-05",
      pedimos: "Flat white, tostado de palta y huevo, budín de limón.",
      imperdible: "El budín de limón.",
      opiniones: [
        { nota: 6.5, texto: "Lindo lugar para charlar, el café estaba bien sin más." },
        { nota: 6, texto: "El tostado llegó frío. El budín sí, muy bueno." },
      ],
      volveriamos: false,
      fotos: [plato("#6d4c41", "#d7b77d", "#8bc34a", "#a1887f")],
    },
    {
      id: "ejemplo-5",
      ejemplo: true,
      nombre: "Ceviche del Puerto",
      categoria: "Restaurante",
      estilos: ["Peruana", "Mariscos"],
      direccion: "Belgrano, CABA",
      lat: -34.5627, lng: -58.4565,
      precio: 3,
      fechaVisita: "2026-09-21",
      pedimos: "Ceviche clásico, causa limeña y chicha morada.",
      imperdible: "El ceviche clásico.",
      opiniones: [
        { nota: 9.5, texto: "El mejor ceviche que probamos en mucho tiempo. Leche de tigre perfecta." },
        { nota: 9, texto: "Atención muy cálida. La causa también es para repetir." },
      ],
      volveriamos: true,
      fotos: [plato("#1d3557", "#f1faee", "#e63946", "#a8dadc")],
    },
    {
      id: "ejemplo-6",
      ejemplo: true,
      nombre: "Doble Smash",
      categoria: "Puesto callejero",
      estilos: ["Hamburguesas"],
      direccion: "Caballito, CABA",
      lat: -34.6186, lng: -58.441,
      precio: 1,
      fechaVisita: "2026-09-07",
      pedimos: "Doble cheddar con bacon y papas con cheddar.",
      imperdible: "",
      opiniones: [
        { nota: 5.5, texto: "Mucha grasa y poco sabor. Las papas estaban blandas." },
        { nota: 6, texto: "Barato y rápido, cumple si estás de paso." },
      ],
      volveriamos: false,
      fotos: [plato("#3d405b", "#bc6c25", "#fefae0", "#81b29a")],
    },
  ];
})();
