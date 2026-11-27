/* Entre dos bocados: lógica de la página. */
(function () {
  "use strict";

  const CFG = window.EDB_CONFIG;
  const almacen = window.EDB_DATOS.crearAlmacen();
  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  const estado = {
    resenas: [],
    filtros: { texto: "", categorias: new Set(), estilos: new Set(), precio: "", notaMin: 0, volver: false, orden: "recientes" },
    activa: null, // id de la reseña abierta en detalle
    editando: null, // reseña que se edita en el formulario
  };

  /* ---------- Utilidades ---------- */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const fmtNota = (n) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 }));

  function urlSegura(u) {
    if (typeof u !== "string") return "";
    if (/^https:\/\//i.test(u) || /^data:image\//i.test(u) || /^blob:/i.test(u)) return u;
    return "";
  }

  function promedio(r) {
    const notas = (r.opiniones || []).map((o) => o && o.nota).filter((n) => n != null && !isNaN(n));
    if (!notas.length) return null;
    return Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10;
  }

  function claseNota(n) {
    if (n == null) return "medio";
    if (n >= 8) return "bien";
    if (n < 6) return "mal";
    return "medio";
  }

  function precioTexto(p) {
    if (!p) return "";
    return `<span class="precio" aria-label="Precio ${p} de 4">${"$".repeat(p)}<span>${"$".repeat(4 - p)}</span></span>`;
  }

  function fechaTexto(f) {
    if (!f) return "";
    const d = new Date(f + "T12:00:00");
    if (isNaN(d)) return "";
    return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
  }

  function normalizar(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function iniciales(nombre) {
    return String(nombre || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  }

  let temporizadorTostada;
  function tostada(msg) {
    const t = $("#tostada");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(temporizadorTostada);
    temporizadorTostada = setTimeout(() => (t.hidden = true), 3200);
  }

  const ICONO_CERRAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* ---------- Mapa principal ---------- */
  const oscuro = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  function capaBase() {
    return L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/rastertiles/${oscuro ? "dark_all" : "voyager"}/{z}/{x}/{y}{r}.png`,
      {
        maxZoom: 19,
        subdomains: "abcd",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    );
  }

  const mapa = L.map("mapa", { zoomControl: true, scrollWheelZoom: true }).setView(CFG.centroMapa, CFG.zoomInicial);
  capaBase().addTo(mapa);
  const capaPines = L.layerGroup().addTo(mapa);
  const pines = new Map();

  function iconoPin(r, activo) {
    const n = promedio(r);
    return L.divIcon({
      className: "pin-icono",
      html: `<div class="pin pin--${claseNota(n)}${activo ? " activo" : ""}"><span>${fmtNota(n)}</span></div>`,
      iconSize: [38, 38],
      iconAnchor: [5, 40],
      popupAnchor: [14, -36],
    });
  }

  function popupHtml(r) {
    return `<div class="popup"><b>${esc(r.nombre)}</b><p>${esc(r.categoria)}${r.estilos && r.estilos.length ? " · " + esc(r.estilos.join(", ")) : ""}</p>
      <button class="btn btn--chico" type="button" data-abrir="${esc(r.id)}">Ver reseña</button></div>`;
  }

  function dibujarPines(lista, ajustar) {
    capaPines.clearLayers();
    pines.clear();
    lista.forEach((r) => {
      if (r.lat == null || r.lng == null) return;
      const m = L.marker([r.lat, r.lng], { icon: iconoPin(r), title: r.nombre, riseOnHover: true });
      m.bindPopup(popupHtml(r));
      m.on("click", () => resaltar(r.id, false));
      m.addTo(capaPines);
      pines.set(r.id, m);
    });
    if (ajustar) encuadrar(lista);
  }

  function encuadrar(lista) {
    const puntos = lista.filter((r) => r.lat != null).map((r) => [r.lat, r.lng]);
    if (puntos.length === 1) mapa.setView(puntos[0], 15);
    else if (puntos.length > 1) mapa.fitBounds(puntos, { padding: [40, 40], maxZoom: 15 });
  }

  let idResaltado = null;
  function resaltar(id, moverMapa) {
    if (idResaltado && pines.has(idResaltado)) {
      const ant = estado.resenas.find((x) => x.id === idResaltado);
      if (ant) pines.get(idResaltado).setIcon(iconoPin(ant, false));
    }
    $$(".tarjeta.activa").forEach((t) => t.classList.remove("activa"));
    idResaltado = id;
    if (!id) return;
    const r = estado.resenas.find((x) => x.id === id);
    const m = pines.get(id);
    if (r && m) {
      m.setIcon(iconoPin(r, true));
      m.setZIndexOffset(1000);
      if (moverMapa) mapa.panTo(m.getLatLng());
    }
    const t = $(`.tarjeta[data-id="${CSS.escape(id)}"]`);
    if (t) t.classList.add("activa");
  }

  // Leaflet frena la propagación de clics dentro de los popups: escuchamos en captura.
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-abrir]");
    if (b) abrirDetalle(b.getAttribute("data-abrir"));
  }, true);

  /* ---------- Filtros ---------- */
  function contar(campo) {
    const c = new Map();
    estado.resenas.forEach((r) => {
      const valores = campo === "estilos" ? r.estilos || [] : [r.categoria];
      valores.forEach((v) => v && c.set(v, (c.get(v) || 0) + 1));
    });
    return c;
  }

  function dibujarChips() {
    const pintar = (cont, opciones, conteo, seleccion, tipo) => {
      // Primero las opciones con reseñas, después el resto de la configuración.
      const usados = opciones.filter((o) => conteo.get(o));
      const extra = Array.from(conteo.keys()).filter((o) => !opciones.includes(o));
      const todas = [...usados, ...extra];
      cont.innerHTML =
        `<button class="chip" type="button" data-tipo="${tipo}" data-valor="" aria-pressed="${seleccion.size === 0}">Todas</button>` +
        todas
          .map(
            (o) => `<button class="chip" type="button" data-tipo="${tipo}" data-valor="${esc(o)}" aria-pressed="${seleccion.has(o)}">${esc(o)} <small>${conteo.get(o) || 0}</small></button>`
          )
          .join("");
    };
    pintar($("#chips-categorias"), CFG.categorias, contar("categoria"), estado.filtros.categorias, "categorias");
    pintar($("#chips-estilos"), CFG.estilos, contar("estilos"), estado.filtros.estilos, "estilos");
  }

  function alTocarChip(e) {
    const b = e.target.closest(".chip");
    if (!b) return;
    const set = estado.filtros[b.dataset.tipo];
    const v = b.dataset.valor;
    if (!v) set.clear();
    else if (set.has(v)) set.delete(v);
    else set.add(v);
    dibujarChips();
    aplicar(true);
  }
  $("#chips-categorias").addEventListener("click", alTocarChip);
  $("#chips-estilos").addEventListener("click", alTocarChip);

  $("#buscar").addEventListener("input", (e) => {
    estado.filtros.texto = e.target.value;
    aplicar(false);
  });
  $("#filtro-precio").addEventListener("change", (e) => { estado.filtros.precio = e.target.value; aplicar(true); });
  $("#filtro-nota").addEventListener("change", (e) => { estado.filtros.notaMin = Number(e.target.value); aplicar(true); });
  $("#filtro-orden").addEventListener("change", (e) => { estado.filtros.orden = e.target.value; aplicar(false); });
  $("#filtro-volver").addEventListener("change", (e) => { estado.filtros.volver = e.target.checked; aplicar(true); });

  $("#btn-mas-filtros").addEventListener("click", (e) => {
    const panel = $("#mas-filtros");
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });

  $("#btn-limpiar").addEventListener("click", () => {
    const f = estado.filtros;
    f.texto = ""; f.categorias.clear(); f.estilos.clear(); f.precio = ""; f.notaMin = 0; f.volver = false; f.orden = "recientes";
    $("#buscar").value = "";
    $("#filtro-precio").value = "";
    $("#filtro-nota").value = "0";
    $("#filtro-orden").value = "recientes";
    $("#filtro-volver").checked = false;
    dibujarChips();
    aplicar(true);
  });

  function filtrar() {
    const f = estado.filtros;
    const q = normalizar(f.texto.trim());
    let lista = estado.resenas.filter((r) => {
      if (f.categorias.size && !f.categorias.has(r.categoria)) return false;
      if (f.estilos.size && !(r.estilos || []).some((s) => f.estilos.has(s))) return false;
      if (f.precio && String(r.precio) !== f.precio) return false;
      if (f.notaMin && (promedio(r) || 0) < f.notaMin) return false;
      if (f.volver && !r.volveriamos) return false;
      if (q) {
        const texto = normalizar(
          [r.nombre, r.categoria, (r.estilos || []).join(" "), r.direccion, r.pedimos, r.imperdible,
            ...(r.opiniones || []).map((o) => o && o.texto)].join(" ")
        );
        if (!texto.includes(q)) return false;
      }
      return true;
    });
    const orden = {
      recientes: (a, b) => String(b.fechaVisita || b.creadoEn || "").localeCompare(String(a.fechaVisita || a.creadoEn || "")),
      nota: (a, b) => (promedio(b) || 0) - (promedio(a) || 0),
      precio: (a, b) => (a.precio || 9) - (b.precio || 9),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
    }[f.orden];
    return lista.sort(orden);
  }

  function contadorFiltros() {
    const f = estado.filtros;
    const n = (f.precio ? 1 : 0) + (f.notaMin ? 1 : 0) + (f.volver ? 1 : 0) + (f.orden !== "recientes" ? 1 : 0);
    const c = $("#contador-filtros");
    c.textContent = n;
    c.hidden = n === 0;
  }

  /* ---------- Tarjetas ---------- */
  function tarjetaHtml(r) {
    const n = promedio(r);
    const foto = urlSegura((r.fotos || [])[0]);
    const frase = (r.opiniones || []).map((o) => o && o.texto).find(Boolean) || "";
    const meta = [esc(r.categoria), esc((r.estilos || []).join(", ")), esc(r.direccion)].filter(Boolean);
    const duo = (r.opiniones || [])
      .map((o, i) => (o && o.nota != null ? `<span title="${esc(CFG.autores[i])}">${esc(iniciales(CFG.autores[i]))} <b>${fmtNota(o.nota)}</b></span>` : ""))
      .join("");
    return `<article class="tarjeta" data-id="${esc(r.id)}" tabindex="0" role="button" aria-label="Ver reseña de ${esc(r.nombre)}">
      <div class="tarjeta__foto">
        ${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : `<div class="tarjeta__sinfoto"><img src="img/logo.svg" alt=""></div>`}
        ${r.ejemplo ? '<span class="tarjeta__sello">Ejemplo</span>' : ""}
        <span class="tarjeta__nota nota nota--${claseNota(n)}" aria-label="Nota ${fmtNota(n)} de 10">${fmtNota(n)}</span>
      </div>
      <div class="tarjeta__cuerpo">
        <h3 class="tarjeta__nombre">${esc(r.nombre)}</h3>
        <p class="tarjeta__meta">${meta.map((m) => `<span>${m}</span>`).join("")}</p>
        ${frase ? `<p class="tarjeta__frase">“${esc(frase)}”</p>` : ""}
        <div class="tarjeta__pie">
          <span class="duo">${duo}</span>
          <span>${precioTexto(r.precio)}</span>
        </div>
      </div>
    </article>`;
  }

  function aplicar(ajustarMapa) {
    const lista = filtrar();
    $("#tarjetas").innerHTML = lista.map(tarjetaHtml).join("");
    const total = estado.resenas.length;
    $("#resumen").textContent = total === 0 ? "" : lista.length === total ? `${total} ${total === 1 ? "lugar" : "lugares"}` : `${lista.length} de ${total} lugares`;
    const vacio = $("#vacio");
    vacio.hidden = lista.length > 0;
    if (total === 0) {
      $("#vacio-titulo").textContent = "Todavía no hay reseñas";
      $("#vacio-texto").textContent = almacen.puedeEditar()
        ? "Toquen “Nueva reseña” para cargar el primer lugar."
        : "Muy pronto vamos a publicar el primer lugar.";
    } else {
      $("#vacio-titulo").textContent = "Nada por acá";
      $("#vacio-texto").textContent = "Ningún lugar coincide con esos filtros.";
    }
    dibujarPines(lista, ajustarMapa);
    contadorFiltros();
    if (estado.activa) resaltar(estado.activa, false);
  }

  function cifras() {
    const r = estado.resenas;
    $("#cifra-lugares").textContent = r.length;
    const notas = r.map(promedio).filter((n) => n != null);
    $("#cifra-promedio").textContent = notas.length ? fmtNota(notas.reduce((a, b) => a + b, 0) / notas.length) : "–";
    $("#cifra-volver").textContent = r.length ? Math.round((r.filter((x) => x.volveriamos).length / r.length) * 100) + "%" : "–";
  }

  $("#tarjetas").addEventListener("click", (e) => {
    const t = e.target.closest(".tarjeta");
    if (t) abrirDetalle(t.dataset.id);
  });
  $("#tarjetas").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const t = e.target.closest(".tarjeta");
    if (t) { e.preventDefault(); abrirDetalle(t.dataset.id); }
  });
  $("#tarjetas").addEventListener("mouseover", (e) => {
    const t = e.target.closest(".tarjeta");
    if (t && t.dataset.id !== idResaltado) resaltar(t.dataset.id, false);
  });

  /* ---------- Vista lista / mapa (celular) ---------- */
  function cambiarVista(v) {
    $("#principal").dataset.vista = v;
    $$(".conmutador button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === v)));
    if (v === "mapa") setTimeout(() => {
      mapa.invalidateSize();
      encuadrar(filtrar());
      $(".mapa-contenedor").scrollIntoView({ block: "start" });
    }, 0);
  }
  $$(".conmutador button").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.vista)));
  window.addEventListener("resize", () => mapa.invalidateSize());

  /* ---------- Diálogos ---------- */
  function abrirDialogo(d) {
    if (!d.open) d.showModal();
  }
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target.closest("[data-cerrar]")) d.close();
      else if (e.target === d) d.close(); // clic en el fondo
    });
  });

  /* ---------- Detalle ---------- */
  function abrirDetalle(id, sinHash) {
    const r = estado.resenas.find((x) => x.id === id);
    if (!r) return;
    estado.activa = id;
    resaltar(id, true);
    const n = promedio(r);
    const fotos = (r.fotos || []).map(urlSegura).filter(Boolean);
    const galeria = fotos.length
      ? `<div class="galeria__pista" id="galeria">${fotos.map((f, i) => `<img src="${esc(f)}" alt="Foto ${i + 1} de ${esc(r.nombre)}">`).join("")}</div>
         ${fotos.length > 1 ? `<button class="galeria__flecha galeria__flecha--izq" type="button" data-galeria="-1" aria-label="Foto anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
         <button class="galeria__flecha galeria__flecha--der" type="button" data-galeria="1" aria-label="Foto siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
         <div class="galeria__puntos">${fotos.map((_, i) => `<span${i === 0 ? ' class="activo"' : ""}></span>`).join("")}</div>` : ""}`
      : `<div class="galeria__sinfoto"><img src="img/logo.svg" alt=""></div>`;

    const opiniones = (r.opiniones || [])
      .map((o, i) => {
        if (!o || (o.nota == null && !o.texto)) return "";
        return `<div class="opinion">
          <div class="opinion__cabecera"><span class="opinion__autor">${esc(CFG.autores[i] || "")}</span>
          <span class="opinion__nota">${fmtNota(o.nota)}<small>/10</small></span></div>
          ${o.texto ? `<p>${esc(o.texto)}</p>` : ""}
        </div>`;
      })
      .join("");

    const datos = [
      ["Qué pedimos", r.pedimos],
      ["El imperdible", r.imperdible],
      ["Fuimos el", fechaTexto(r.fechaVisita)],
      ["Dirección", r.direccion],
    ].filter(([, v]) => v);

    const comoLlegar = r.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}` : "";

    $("#detalle").innerHTML = `
      <div class="galeria">
        <button class="btn-icono detalle__cerrar" type="button" data-cerrar aria-label="Cerrar">${ICONO_CERRAR}</button>
        ${galeria}
      </div>
      <div class="detalle__contenido">
        <div class="detalle__titulo">
          <div>
            <h2 id="det-nombre">${esc(r.nombre)}</h2>
            <p class="detalle__meta"><span>${esc(r.categoria)}</span>${r.precio ? `<span>${precioTexto(r.precio)}</span>` : ""}
              <span class="etiqueta-volver${r.volveriamos ? "" : " etiqueta-volver--no"}">${r.volveriamos ? "✓ Volveríamos" : "No volveríamos"}</span>
              ${r.ejemplo ? "<span>Reseña de ejemplo</span>" : ""}</p>
            ${r.estilos && r.estilos.length ? `<div class="detalle__estilos">${r.estilos.map((s) => `<span class="etiqueta">${esc(s)}</span>`).join("")}</div>` : ""}
          </div>
          <div class="nota-grande__caja">
            <span class="nota nota--grande nota--${claseNota(n)}">${fmtNota(n)}</span>
            <small>Promedio</small>
          </div>
        </div>
        ${opiniones ? `<div class="opiniones">${opiniones}</div>` : ""}
        ${datos.length ? `<dl class="datos">${datos.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        <div class="detalle__acciones">
          ${comoLlegar ? `<a class="btn btn--primario" href="${esc(comoLlegar)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>Cómo llegar</a>` : ""}
          <button class="btn btn--contorno" type="button" id="btn-compartir">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>Compartir</button>
          ${almacen.puedeEditar() ? `<span class="empujar">
            <button class="btn btn--fantasma" type="button" id="btn-editar">Editar</button>
            <button class="btn btn--fantasma" type="button" id="btn-borrar" style="color:var(--mal)">Borrar</button></span>` : ""}
        </div>
      </div>`;

    const pista = $("#galeria");
    if (pista && fotos.length > 1) {
      pista.addEventListener("scroll", () => {
        const i = Math.round(pista.scrollLeft / pista.clientWidth);
        $$(".galeria__puntos span").forEach((s, j) => s.classList.toggle("activo", i === j));
      }, { passive: true });
    }
    $$("[data-galeria]").forEach((b) =>
      b.addEventListener("click", () => pista.scrollBy({ left: pista.clientWidth * Number(b.dataset.galeria), behavior: "smooth" }))
    );
    $("#btn-compartir").addEventListener("click", () => compartir(r));
    const be = $("#btn-editar");
    if (be) be.addEventListener("click", () => { $("#dlg-detalle").close(); abrirFormulario(r); });
    const bb = $("#btn-borrar");
    if (bb) bb.addEventListener("click", () => pedirBorrado(r));

    if (!sinHash && location.hash !== "#r-" + id) history.replaceState(null, "", "#r-" + id);
    abrirDialogo($("#dlg-detalle"));
    $("#detalle").scrollTop = 0;
  }

  $("#dlg-detalle").addEventListener("close", () => {
    estado.activa = null;
    if (location.hash.startsWith("#r-")) history.replaceState(null, "", location.pathname + location.search);
  });

  async function compartir(r) {
    const url = location.href.split("#")[0] + "#r-" + r.id;
    const texto = `${r.nombre}: ${fmtNota(promedio(r))}/10 en Entre dos bocados`;
    if (navigator.share) {
      try { await navigator.share({ title: r.nombre, text: texto, url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      tostada("Enlace copiado");
    } catch (e) {
      tostada(url);
    }
  }

  function abrirDesdeHash() {
    const m = location.hash.match(/^#r-(.+)$/);
    if (m) abrirDetalle(decodeURIComponent(m[1]), true);
  }
  window.addEventListener("hashchange", abrirDesdeHash);

  /* ---------- Borrar ---------- */
  let aBorrar = null;
  function pedirBorrado(r) {
    aBorrar = r;
    $("#borrar-texto").textContent = `Se borra “${r.nombre}” con sus fotos. No se puede deshacer.`;
    abrirDialogo($("#dlg-borrar"));
  }
  $("#btn-confirmar-borrar").addEventListener("click", async (e) => {
    if (!aBorrar) return;
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await almacen.borrar(aBorrar.id, aBorrar.fotos);
      $("#dlg-borrar").close();
      $("#dlg-detalle").close();
      tostada("Reseña borrada");
      await cargar(false);
    } catch (err) {
      tostada(err.message);
    } finally {
      b.disabled = false;
      aBorrar = null;
    }
  });

  /* ---------- Formulario ---------- */
  const form = $("#form-resena");
  let miniMapa = null;
  let pinNuevo = null;
  let ubicacion = null; // {lat, lng}
  let fotosForm = []; // [{url, archivo?, previa}]
  let precioForm = null;
  let estilosForm = new Set();

  function prepararFormularioFijo() {
    $("#f-categoria").innerHTML = '<option value="">Elegir…</option>' + CFG.categorias.map((c) => `<option>${esc(c)}</option>`).join("");
    $("#f-precio").innerHTML = [1, 2, 3, 4]
      .map((p) => `<button type="button" role="radio" aria-checked="false" data-precio="${p}" aria-label="Precio ${p} de 4">${"$".repeat(p)}</button>`)
      .join("");
    $("#f-precio").addEventListener("click", (e) => {
      const b = e.target.closest("[data-precio]");
      if (!b) return;
      const p = Number(b.dataset.precio);
      precioForm = precioForm === p ? null : p;
      pintarPrecio();
    });
    $("#f-estilos").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const v = b.dataset.valor;
      if (estilosForm.has(v)) estilosForm.delete(v); else estilosForm.add(v);
      b.setAttribute("aria-pressed", String(estilosForm.has(v)));
    });
    $("#f-opiniones").innerHTML = CFG.autores
      .map(
        (a, i) => `<div class="opinion-form">
          <strong>${esc(a)}</strong>
          <div class="campo">
            <span id="f-nota-${i}-tit">Nota</span>
            <div class="deslizador">
              <input type="range" id="f-nota-${i}" min="1" max="10" step="0.5" value="7" aria-labelledby="f-nota-${i}-tit">
              <output for="f-nota-${i}" id="f-nota-${i}-valor">7</output>
            </div>
          </div>
          <label class="campo">
            <span>Opinión</span>
            <textarea id="f-opinion-${i}" rows="3" maxlength="1500" placeholder="¿Qué te pareció?"></textarea>
          </label>
        </div>`
      )
      .join("");
    CFG.autores.forEach((_, i) => {
      $("#f-nota-" + i).addEventListener("input", (e) => ($("#f-nota-" + i + "-valor").textContent = fmtNota(e.target.value)));
    });
  }

  function pintarPrecio() {
    $$("#f-precio button").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.precio) === precioForm)));
  }

  function pintarEstilosForm() {
    const extra = Array.from(estilosForm).filter((s) => !CFG.estilos.includes(s));
    $("#f-estilos").innerHTML = [...CFG.estilos, ...extra]
      .map((s) => `<button class="chip" type="button" data-valor="${esc(s)}" aria-pressed="${estilosForm.has(s)}">${esc(s)}</button>`)
      .join("");
  }

  function asegurarMiniMapa() {
    if (miniMapa) return;
    miniMapa = L.map("mini-mapa", { scrollWheelZoom: false }).setView(mapa.getCenter(), Math.max(mapa.getZoom(), 13));
    capaBase().addTo(miniMapa);
    miniMapa.on("click", (e) => ponerPin(e.latlng.lat, e.latlng.lng, true));
  }

  function ponerPin(lat, lng, buscarDireccion) {
    ubicacion = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    if (!pinNuevo) {
      pinNuevo = L.marker([lat, lng], {
        draggable: true,
        icon: L.divIcon({ className: "pin-icono", html: '<div class="pin pin--nueva"><span>+</span></div>', iconSize: [38, 38], iconAnchor: [5, 40] }),
      }).addTo(miniMapa);
      pinNuevo.on("dragend", () => {
        const p = pinNuevo.getLatLng();
        ponerPin(p.lat, p.lng, false);
      });
    } else {
      pinNuevo.setLatLng([lat, lng]);
    }
    const ayuda = $("#ayuda-pin");
    ayuda.textContent = "Lugar marcado. Pueden arrastrar el pin para ajustarlo.";
    ayuda.className = "ayuda ayuda--ok";
    if (buscarDireccion && !$("#f-direccion").value.trim()) direccionInversa(lat, lng);
  }

  async function direccionInversa(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=es`);
      if (!res.ok) return;
      const d = await res.json();
      const a = d.address || {};
      const calle = [a.road, a.house_number].filter(Boolean).join(" ");
      const zona = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || "";
      const texto = [calle, zona].filter(Boolean).join(", ");
      if (texto && !$("#f-direccion").value.trim()) $("#f-direccion").value = texto;
    } catch (e) { /* sin conexión: no pasa nada */ }
  }

  async function buscarDireccion() {
    const q = $("#f-direccion").value.trim();
    const lista = $("#sugerencias");
    if (!q) { $("#f-direccion").focus(); return; }
    const b = $("#btn-buscar-dir");
    b.disabled = true;
    try {
      const c = mapa.getCenter();
      const caja = [c.lng - 1, c.lat + 1, c.lng + 1, c.lat - 1].join(",");
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&viewbox=${caja}&q=${encodeURIComponent(q)}`);
      const datos = res.ok ? await res.json() : [];
      if (!datos.length) {
        lista.innerHTML = `<li><button type="button" disabled>No encontramos esa dirección. Marquen el lugar tocando el mapa.</button></li>`;
      } else {
        lista.innerHTML = datos
          .map((d) => `<li><button type="button" data-lat="${esc(d.lat)}" data-lng="${esc(d.lon)}">${esc(d.display_name)}</button></li>`)
          .join("");
      }
      lista.hidden = false;
    } catch (e) {
      lista.innerHTML = `<li><button type="button" disabled>No pudimos buscar ahora. Marquen el lugar tocando el mapa.</button></li>`;
      lista.hidden = false;
    } finally {
      b.disabled = false;
    }
  }
  $("#btn-buscar-dir").addEventListener("click", buscarDireccion);
  $("#f-direccion").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); buscarDireccion(); }
  });
  $("#sugerencias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-lat]");
    if (!b) return;
    const lat = Number(b.dataset.lat), lng = Number(b.dataset.lng);
    miniMapa.setView([lat, lng], 17);
    ponerPin(lat, lng, false);
    $("#sugerencias").hidden = true;
  });

  $("#btn-mi-ubicacion").addEventListener("click", () => {
    const ayuda = $("#ayuda-pin");
    if (!navigator.geolocation) {
      ayuda.textContent = "Este navegador no comparte la ubicación. Marquen el lugar tocando el mapa.";
      ayuda.className = "ayuda ayuda--error";
      return;
    }
    ayuda.textContent = "Buscando dónde están…";
    ayuda.className = "ayuda";
    navigator.geolocation.getCurrentPosition(
      (p) => {
        miniMapa.setView([p.coords.latitude, p.coords.longitude], 17);
        ponerPin(p.coords.latitude, p.coords.longitude, true);
      },
      () => {
        ayuda.textContent = "No pudimos obtener la ubicación. Revisen el permiso del navegador o toquen el mapa.";
        ayuda.className = "ayuda ayuda--error";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  /* Fotos del formulario */
  function pintarFotos() {
    $("#f-fotos-previa").innerHTML = fotosForm
      .map(
        (f, i) => `<figure><img src="${esc(f.previa)}" alt="Foto ${i + 1}">
          ${i === 0 ? "<figcaption>Portada</figcaption>" : ""}
          <button type="button" data-quitar="${i}" aria-label="Quitar foto ${i + 1}">${ICONO_CERRAR}</button></figure>`
      )
      .join("");
  }
  $("#f-fotos").addEventListener("change", (e) => {
    Array.from(e.target.files || []).forEach((archivo) => {
      if (!archivo.type.startsWith("image/")) return;
      fotosForm.push({ archivo, previa: URL.createObjectURL(archivo) });
    });
    e.target.value = "";
    pintarFotos();
  });
  $("#f-fotos-previa").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    const [quitada] = fotosForm.splice(Number(b.dataset.quitar), 1);
    if (quitada && quitada.archivo) URL.revokeObjectURL(quitada.previa);
    pintarFotos();
  });

  function abrirFormulario(r) {
    estado.editando = r || null;
    form.reset();
    $("#form-error").hidden = true;
    $("#sugerencias").hidden = true;
    $$("[aria-invalid]", form).forEach((el) => el.removeAttribute("aria-invalid"));
    $("#form-titulo").textContent = r ? "Editar reseña" : "Nueva reseña";
    $("#btn-guardar").textContent = r ? "Guardar cambios" : "Publicar reseña";

    $("#f-nombre").value = r ? r.nombre : "";
    const cat = $("#f-categoria");
    if (r && r.categoria && !CFG.categorias.includes(r.categoria)) {
      cat.insertAdjacentHTML("beforeend", `<option>${esc(r.categoria)}</option>`);
    }
    cat.value = r ? r.categoria : "";
    precioForm = r ? r.precio || null : null;
    pintarPrecio();
    estilosForm = new Set(r ? r.estilos || [] : []);
    pintarEstilosForm();
    $("#f-direccion").value = r ? r.direccion || "" : "";
    $("#f-fecha").value = r ? r.fechaVisita || "" : new Date().toISOString().slice(0, 10);
    $("#f-pedimos").value = r ? r.pedimos || "" : "";
    $("#f-imperdible").value = r ? r.imperdible || "" : "";
    $("#f-volver").checked = r ? !!r.volveriamos : true;
    CFG.autores.forEach((_, i) => {
      const o = (r && r.opiniones && r.opiniones[i]) || {};
      const nota = o.nota != null ? o.nota : 7;
      $("#f-nota-" + i).value = nota;
      $("#f-nota-" + i + "-valor").textContent = fmtNota(nota);
      $("#f-opinion-" + i).value = o.texto || "";
    });
    fotosForm = (r ? r.fotos || [] : []).map((url) => ({ url, previa: urlSegura(url) }));
    pintarFotos();

    abrirDialogo($("#dlg-form"));
    asegurarMiniMapa();
    setTimeout(() => {
      miniMapa.invalidateSize();
      if (pinNuevo) { miniMapa.removeLayer(pinNuevo); pinNuevo = null; }
      ubicacion = null;
      const ayuda = $("#ayuda-pin");
      ayuda.textContent = "Toquen el mapa para marcar el lugar. Pueden arrastrar el pin para ajustarlo.";
      ayuda.className = "ayuda";
      if (r && r.lat != null) {
        miniMapa.setView([r.lat, r.lng], 16);
        ponerPin(r.lat, r.lng, false);
      } else {
        miniMapa.setView(mapa.getCenter(), Math.max(mapa.getZoom(), 13));
      }
    }, 30);
  }

  function errorForm(msg, campo) {
    const e = $("#form-error");
    e.textContent = msg;
    e.hidden = false;
    if (campo) {
      campo.setAttribute("aria-invalid", "true");
      campo.focus();
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#form-error").hidden = true;
    $$("[aria-invalid]", form).forEach((el) => el.removeAttribute("aria-invalid"));
    const nombre = $("#f-nombre").value.trim();
    const categoria = $("#f-categoria").value;
    if (!nombre) return errorForm("Falta el nombre del lugar.", $("#f-nombre"));
    if (!categoria) return errorForm("Elijan una categoría.", $("#f-categoria"));
    if (!ubicacion) {
      $("#mini-mapa").scrollIntoView({ behavior: "smooth", block: "center" });
      const ayuda = $("#ayuda-pin");
      ayuda.textContent = "Falta marcar el lugar en el mapa: búsquenlo por dirección o toquen el mapa.";
      ayuda.className = "ayuda ayuda--error";
      return errorForm("Falta marcar el lugar en el mapa.");
    }

    const boton = $("#btn-guardar");
    const textoBoton = boton.textContent;
    boton.disabled = true;
    try {
      const fotos = [];
      for (let i = 0; i < fotosForm.length; i++) {
        const f = fotosForm[i];
        if (f.url) { fotos.push(f.url); continue; }
        boton.textContent = `Subiendo foto ${i + 1} de ${fotosForm.length}…`;
        f.url = await almacen.subirFoto(f.archivo);
        fotos.push(f.url);
      }
      boton.textContent = "Guardando…";
      const base = estado.editando || {};
      const resena = {
        ...base,
        nombre,
        categoria,
        estilos: Array.from(estilosForm),
        direccion: $("#f-direccion").value.trim(),
        lat: ubicacion.lat,
        lng: ubicacion.lng,
        precio: precioForm,
        fechaVisita: $("#f-fecha").value || null,
        pedimos: $("#f-pedimos").value.trim(),
        imperdible: $("#f-imperdible").value.trim(),
        opiniones: CFG.autores.map((_, i) => ({
          nota: Number($("#f-nota-" + i).value),
          texto: $("#f-opinion-" + i).value.trim(),
        })),
        volveriamos: $("#f-volver").checked,
        fotos,
      };
      // Fotos que se quitaron al editar: se borran del almacenamiento.
      const quitadas = (base.fotos || []).filter((u) => !fotos.includes(u));
      const guardada = await almacen.guardar(resena);
      for (const u of quitadas) await almacen.borrarFoto(u);
      $("#dlg-form").close();
      tostada(estado.editando ? "Cambios guardados" : "Reseña publicada");
      await cargar(false);
      abrirDetalle(guardada.id);
    } catch (err) {
      errorForm(err.message || "No se pudo guardar. Prueben de nuevo.");
    } finally {
      boton.disabled = false;
      boton.textContent = textoBoton;
    }
  });

  /* ---------- Sesión ---------- */
  function pintarSesion() {
    const puede = almacen.puedeEditar();
    $("#btn-nueva").hidden = !puede;
    $("#btn-ingresar").hidden = almacen.modo !== "nube" || puede;
    $("#btn-salir").hidden = almacen.modo !== "nube" || !puede;
    $("#aviso-prueba").hidden = almacen.modo !== "prueba";
    $("#btn-quitar-ejemplos").hidden = !estado.resenas.some((r) => r.ejemplo);
  }

  $("#btn-nueva").addEventListener("click", () => abrirFormulario(null));
  $("#btn-ingresar").addEventListener("click", () => {
    $("#ing-error").hidden = true;
    abrirDialogo($("#dlg-ingresar"));
  });
  $("#btn-salir").addEventListener("click", async () => {
    await almacen.salir();
    tostada("Sesión cerrada");
  });
  $("#form-ingresar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#ing-error");
    err.hidden = true;
    try {
      await almacen.ingresar($("#ing-email").value.trim(), $("#ing-clave").value);
      $("#dlg-ingresar").close();
      $("#ing-clave").value = "";
      tostada("¡Hola! Ya pueden publicar reseñas");
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
  $("#btn-quitar-ejemplos").addEventListener("click", async () => {
    await almacen.borrarEjemplos();
    tostada("Ejemplos quitados");
    await cargar(true);
  });
  almacen.alCambiarSesion(() => { pintarSesion(); aplicar(false); });

  // Atajo secreto para ingresar si ocultan el botón: agregar #ingresar a la dirección.
  if (location.hash === "#ingresar" && almacen.modo === "nube") {
    setTimeout(() => $("#btn-ingresar").click(), 300);
  }

  /* ---------- Carga ---------- */
  async function cargar(ajustar) {
    try {
      estado.resenas = await almacen.listar();
    } catch (e) {
      estado.resenas = [];
      tostada(e.message);
    }
    cifras();
    dibujarChips();
    pintarSesion();
    aplicar(ajustar);
  }

  async function iniciar() {
    prepararFormularioFijo();
    try {
      await almacen.iniciar();
    } catch (e) {
      tostada("No pudimos conectar con la base de datos.");
    }
    await cargar(true);
    abrirDesdeHash();
  }

  iniciar();
})();
