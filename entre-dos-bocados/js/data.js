/*
 * Capa de datos. Hay dos "almacenes" con la misma interfaz:
 *  - AlmacenLocal: modo prueba, guarda todo en este navegador (localStorage).
 *  - AlmacenNube: Supabase, compartido con todo el que visite el sitio.
 */
(function () {
  "use strict";

  const CFG = window.EDB_CONFIG;
  const CLAVE_LOCAL = "edb-resenas-v1";

  function nuevoId() {
    if (window.crypto && crypto.randomUUID) {
      try { return crypto.randomUUID(); } catch (e) { /* contexto no seguro */ }
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* Achica una foto en el navegador antes de guardarla. */
  function achicarFoto(archivo, ladoMax, calidad) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala);
        const h = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo procesar la foto."));
        }, "image/jpeg", calidad);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Ese archivo no parece una imagen."));
      };
      img.src = url;
    });
  }

  function blobADataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  /* ---------- Modo prueba (este navegador) ---------- */
  class AlmacenLocal {
    constructor() {
      this.modo = "prueba";
      this._escuchas = [];
    }

    async iniciar() {}

    _leer() {
      try {
        const crudo = localStorage.getItem(CLAVE_LOCAL);
        if (crudo) return JSON.parse(crudo);
      } catch (e) { /* almacenamiento bloqueado */ }
      return (window.EDB_EJEMPLOS || []).map((r) => ({ ...r }));
    }

    _escribir(lista) {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
      } catch (e) {
        throw new Error(
          "El navegador no tiene más espacio para fotos en modo prueba. Conecten Supabase (ver README) o quiten alguna foto."
        );
      }
    }

    async listar() { return this._leer(); }

    async guardar(resena) {
      const lista = this._leer();
      const r = { ...resena };
      if (!r.id) { r.id = nuevoId(); r.creadoEn = new Date().toISOString(); }
      const i = lista.findIndex((x) => x.id === r.id);
      if (i >= 0) lista[i] = r; else lista.unshift(r);
      this._escribir(lista);
      return r;
    }

    async borrar(id) {
      this._escribir(this._leer().filter((r) => r.id !== id));
    }

    async borrarEjemplos() {
      this._escribir(this._leer().filter((r) => !r.ejemplo));
    }

    async subirFoto(archivo) {
      const blob = await achicarFoto(archivo, 900, 0.7);
      return blobADataUrl(blob);
    }

    async borrarFoto() {}

    puedeEditar() { return true; }
    usuario() { return null; }
    async ingresar() {}
    async salir() {}
    alCambiarSesion(fn) { this._escuchas.push(fn); }
  }

  /* ---------- Supabase (compartido) ---------- */
  const BUCKET = "fotos";

  function aFila(r) {
    const op = r.opiniones || [{}, {}];
    return {
      id: r.id,
      nombre: r.nombre,
      categoria: r.categoria,
      estilos: r.estilos || [],
      direccion: r.direccion || null,
      lat: r.lat,
      lng: r.lng,
      precio: r.precio || null,
      fecha_visita: r.fechaVisita || null,
      pedimos: r.pedimos || null,
      imperdible: r.imperdible || null,
      nota_1: op[0] && op[0].nota != null ? op[0].nota : null,
      opinion_1: (op[0] && op[0].texto) || null,
      nota_2: op[1] && op[1].nota != null ? op[1].nota : null,
      opinion_2: (op[1] && op[1].texto) || null,
      volveriamos: r.volveriamos,
      fotos: r.fotos || [],
    };
  }

  function deFila(f) {
    return {
      id: f.id,
      creadoEn: f.created_at,
      nombre: f.nombre,
      categoria: f.categoria,
      estilos: f.estilos || [],
      direccion: f.direccion || "",
      lat: f.lat,
      lng: f.lng,
      precio: f.precio,
      fechaVisita: f.fecha_visita,
      pedimos: f.pedimos || "",
      imperdible: f.imperdible || "",
      opiniones: [
        { nota: f.nota_1 != null ? Number(f.nota_1) : null, texto: f.opinion_1 || "" },
        { nota: f.nota_2 != null ? Number(f.nota_2) : null, texto: f.opinion_2 || "" },
      ],
      volveriamos: f.volveriamos,
      fotos: f.fotos || [],
    };
  }

  class AlmacenNube {
    constructor(url, clave) {
      this.modo = "nube";
      this.cliente = window.supabase.createClient(url, clave);
      this._sesion = null;
      this._escuchas = [];
    }

    async iniciar() {
      const { data } = await this.cliente.auth.getSession();
      this._sesion = data.session;
      this.cliente.auth.onAuthStateChange((_evento, sesion) => {
        this._sesion = sesion;
        this._escuchas.forEach((fn) => fn());
      });
    }

    async listar() {
      const { data, error } = await this.cliente
        .from("resenas")
        .select("*")
        .order("fecha_visita", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error("No se pudieron cargar las reseñas: " + error.message);
      return data.map(deFila);
    }

    async guardar(resena) {
      const r = { ...resena };
      if (!r.id) r.id = nuevoId();
      const { data, error } = await this.cliente
        .from("resenas")
        .upsert(aFila(r))
        .select()
        .single();
      if (error) throw new Error("No se pudo guardar: " + error.message);
      return deFila(data);
    }

    async borrar(id, fotos) {
      const { error } = await this.cliente.from("resenas").delete().eq("id", id);
      if (error) throw new Error("No se pudo borrar: " + error.message);
      for (const url of fotos || []) await this.borrarFoto(url);
    }

    async borrarEjemplos() {}

    async subirFoto(archivo) {
      const blob = await achicarFoto(archivo, 1600, 0.82);
      const ruta = nuevoId() + ".jpg";
      const { error } = await this.cliente.storage
        .from(BUCKET)
        .upload(ruta, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error("No se pudo subir la foto: " + error.message);
      return this.cliente.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
    }

    async borrarFoto(url) {
      const marca = "/object/public/" + BUCKET + "/";
      const i = typeof url === "string" ? url.indexOf(marca) : -1;
      if (i < 0) return;
      try {
        await this.cliente.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marca.length))]);
      } catch (e) { /* si falla, queda un archivo huérfano: no es grave */ }
    }

    puedeEditar() { return !!this._sesion; }
    usuario() { return this._sesion ? this._sesion.user : null; }

    async ingresar(email, clave) {
      const { error } = await this.cliente.auth.signInWithPassword({ email, password: clave });
      if (error) throw new Error("No pudimos ingresar: revisen el email y la contraseña.");
    }

    async salir() { await this.cliente.auth.signOut(); }
    alCambiarSesion(fn) { this._escuchas.push(fn); }
  }

  function crearAlmacen() {
    if (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) {
      return new AlmacenNube(CFG.supabaseUrl, CFG.supabaseAnonKey);
    }
    return new AlmacenLocal();
  }

  window.EDB_DATOS = { crearAlmacen };
})();
