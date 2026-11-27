# Entre dos bocados

Sitio de reseñas para los lugares donde salimos a comer en pareja. Cada lugar lleva:

- un **pin en el mapa** con la nota promedio (verde ≥ 8, mostaza 6–8, rojo < 6),
- **fotos** (la primera es la portada),
- la **nota y la opinión de cada uno**, qué pedimos, el plato imperdible y si volveríamos,
- **categoría** (restaurante, bodegón, café, bar…), **estilos de comida** (italiana, japonesa, pizza…) y precio.

Quien visita el sitio puede buscar y **filtrar por categoría, estilo, precio, nota mínima y "volveríamos"**,
ver todo en lista o en el mapa, abrir "Cómo llegar" en Google Maps y compartir el enlace de una reseña.
Funciona en celular (lista y mapa se alternan con el botón de abajo) y en PC (lista y mapa lado a lado).

## Probarlo ya

Abran `index.html` en el navegador, o sirvan la carpeta:

```bash
cd entre-dos-bocados
python3 -m http.server 8000
# y abran http://localhost:8000
```

Sin configurar nada, el sitio arranca en **modo prueba**: muestra 6 reseñas de *ejemplo* (lugares inventados)
y lo que agreguen se guarda **solo en ese navegador**. Sirve para jugar con el diseño, pero nadie más lo ve.

## Publicarlo para que lo vea todo el mundo

Hacen falta dos cosas gratis: **Supabase** (guarda las reseñas y las fotos) y un **hosting** para la página.

### 1. Base de datos y fotos (Supabase, ~10 minutos)

1. Creen una cuenta en <https://supabase.com> y un proyecto nuevo (plan Free).
2. En **SQL Editor → New query**, peguen todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y toquen **Run**.
   Eso crea la tabla `resenas` y la carpeta pública `fotos`, con permisos para que
   cualquiera pueda **leer** pero solo ustedes puedan **escribir**.
3. En **Authentication → Users → Add user → Create new user**, creen un usuario para cada uno
   (email + contraseña, marquen *Auto Confirm User*).
4. En **Authentication → Sign In / Providers**, **desactiven "Allow new users to sign up"**,
   así nadie más puede crearse una cuenta y escribir reseñas.
5. En **Project Settings → API** (o *Data API*) copien la **Project URL** y la clave **anon / public**.
6. Péguenlas en [`js/config.js`](js/config.js):

   ```js
   supabaseUrl: "https://xxxxxxxx.supabase.co",
   supabaseAnonKey: "eyJhbGciOi...",
   ```

   La clave *anon* es pública por diseño (los permisos los controla la base de datos), así que no pasa
   nada si queda en el código. **Nunca** pongan la clave *service_role*.

Al recargar la página aparece el botón **Ingresar**. Con su email y contraseña se habilita
**Nueva reseña**, y cada reseña tiene **Editar** y **Borrar**. Los visitantes solo ven.

### 2. Subir la página (elijan una)

- **GitHub Pages**: en el repositorio, *Settings → Pages → Deploy from a branch*, rama `main`, carpeta `/ (root)`.
  El sitio queda en `https://<usuario>.github.io/<repo>/entre-dos-bocados/`.
  (Si prefieren una dirección propia, muevan esta carpeta a un repositorio nuevo llamado, por ejemplo, `entre-dos-bocados`.)
- **Netlify**: <https://app.netlify.com/drop> y arrastren la carpeta `entre-dos-bocados`. Listo.

## Personalizar

Todo lo editable está en [`js/config.js`](js/config.js):

- `autores`: sus nombres, tal como aparecen en cada opinión (por defecto "Primer bocado" y "Segundo bocado").
- `centroMapa` y `zoomInicial`: dónde arranca el mapa cuando todavía no hay reseñas.
- `categorias` y `estilos`: las opciones de los filtros y del formulario.

## Cómo cargar una reseña

1. **Nueva reseña** → nombre, categoría, precio y estilos.
2. **Ubicación**: escriban la dirección y toquen *Buscar*, toquen el mapa o usen *Usar mi ubicación*
   (ideal si la cargan estando en el lugar). El pin se puede arrastrar.
3. Fecha, qué pidieron, el imperdible, la **nota de cada uno** (1 a 10, de a medio punto) y sus opiniones.
4. **Fotos**: pueden elegir varias desde la galería o la cámara del celular; se achican solas antes de subirse.

## Detalles técnicos

- HTML, CSS y JavaScript sin compilación. [Leaflet 1.9.4](https://leafletjs.com) y
  [supabase-js 2.45.4](https://github.com/supabase/supabase-js) van incluidos en `lib/`.
- Mapa: teselas de © OpenStreetMap / © CARTO (versión oscura si el teléfono está en modo oscuro).
  Búsqueda de direcciones: Nominatim de OpenStreetMap.
- Enlaces directos a una reseña: `…/index.html#r-<id>`.
- Atajo para ingresar: agregar `#ingresar` al final de la dirección.

```
entre-dos-bocados/
├── index.html
├── css/styles.css
├── js/config.js      ← lo que se edita
├── js/data.js        ← guardado (modo prueba o Supabase)
├── js/app.js         ← mapa, filtros, formulario
├── js/ejemplos.js    ← reseñas de ejemplo del modo prueba
├── img/logo.svg
├── lib/              ← Leaflet y Supabase
└── supabase/schema.sql
```
