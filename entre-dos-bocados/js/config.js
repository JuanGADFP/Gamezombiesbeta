/*
 * Configuración de "Entre dos bocados".
 * Es el único archivo que necesitan editar para personalizar el sitio.
 */
window.EDB_CONFIG = {
  // Nombres de quienes escriben las reseñas (aparecen en cada opinión).
  autores: ["Primer bocado", "Segundo bocado"],

  // Punto donde arranca el mapa si todavía no hay reseñas: [latitud, longitud] y zoom.
  centroMapa: [-34.6037, -58.3816],
  zoomInicial: 12,

  // Conexión con Supabase (base de datos + fotos en la nube).
  // Mientras estén vacíos, el sitio funciona en "modo prueba": guarda todo
  // solo en este navegador y muestra reseñas de ejemplo.
  // Ver README.md para obtener estos dos valores.
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Tipos de lugar (categorías). Pueden agregar, quitar o renombrar.
  categorias: [
    "Restaurante",
    "Bodegón",
    "Parrilla",
    "Café",
    "Bar",
    "Cervecería",
    "Heladería",
    "Panadería",
    "Puesto callejero",
    "Delivery",
  ],

  // Estilos de comida.
  estilos: [
    "Argentina",
    "Italiana",
    "Pizza",
    "Hamburguesas",
    "Japonesa",
    "China",
    "Coreana",
    "Peruana",
    "Mexicana",
    "Árabe",
    "Española",
    "Vegetariana",
    "Vegana",
    "Mariscos",
    "Brunch",
    "Dulce",
    "Fusión",
  ],
};
