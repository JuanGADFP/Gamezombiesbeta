# Zona Muerta — supervivencia zombi (beta)

Juego de supervivencia para PC en **3D con cámara alta** (estilo *How to Survive*), ambientado en una
**ciudad en pleno apocalipsis**. El objetivo es aguantar vivo el mayor tiempo posible mientras los ataques zombis se vuelven más duros.

## Cómo jugar

No hace falta instalar nada: **abre `index.html` con Chrome, Edge o Firefox** (doble clic).
Funciona sin conexión: el motor 3D (Three.js) va incluido en `lib/`.

Si el juego va lento en tu PC, abre la pausa (`Esc`) y cambia **Gráficos** a *Baja* (quita las sombras y baja la resolución interna).

Si el navegador bloquea algo al abrirlo como archivo, puedes servirlo en local:

```bash
python -m http.server 8000
# y abre http://localhost:8000
```

### Controles

| Tecla | Acción |
|---|---|
| `WASD` / flechas | Moverse |
| Ratón | Apuntar (la linterna sigue al ratón) |
| Clic izquierdo | Atacar / disparar (mantener pulsado) |
| `Shift` | Correr (gasta estamina) |
| `Espacio` | Rodar, eres invulnerable durante la rodada (gasta estamina) |
| `R` | Recargar |
| `1`-`4` / rueda | Cambiar arma · `Q` arma anterior |
| `Z` | Acercar / alejar la cámara (3 niveles) |
| `Esc` / `P` | Pausa · `M` silencio |

## Aspecto visual

- Render 3D con luces y sombras en tiempo real, niebla de polvo, ceniza cayendo y corrección de color cinematográfica.
- Ciudad generada al azar en cada partida: edificios de 2 a 6 plantas con ventanas rotas, tapiadas o quemadas,
  tiendas con persianas y grafitis, ruinas derrumbadas con escombros, aparcamientos con coches calcinados,
  plazas con árboles secos y campamentos abandonados, todo rodeado por un muro de cuarentena.
- Calles con asfalto agrietado, manchas de sangre y aceite, cráteres, barricadas de hormigón, autobuses, coches
  de policía, taxis y furgonetas, muchos de ellos ardiendo.
- Empiezas en un puesto militar abandonado en el centro (sacos terreros, camiones, focos).
- De noche solo ves lo que alumbran tu linterna, los fuegos, los fogonazos y las pocas farolas que aún parpadean.
  Los ojos de los zombis brillan en la oscuridad.
- Los edificios se vuelven transparentes cuando te tapan.
- **Zombis detallados**: cuerpo articulado (codos, rodillas, mandíbula que muerde, manos en garra), cara con
  cuencas, nariz, orejas y dientes, heridas, sangre, venas y moratones. Ropa variada (camiseta, oficinista con
  corbata, sudadera, policía, bata de hospital, obrero con chaleco reflectante, torso con costillas a la vista)
  con jirones colgando; a algunos les falta un brazo. Animaciones de cojera, brazos estirados o colgando,
  retroceso al recibir golpes y caída al morir.
- **Bestiario** en el menú principal: cada tipo de zombi de cerca, girando, con sus datos y variantes al azar.
- Todas las texturas y modelos se generan por código, sin archivos de arte externos.

## Sistemas

- **Vida**: si llega a 0 termina la partida. Se recupera con botiquines, al amanecer, con los suministros y con mejoras.
- **Estamina**: la gastan correr, rodar y el machete. Si se vacía quedas **agotado**: no puedes correr ni rodar, te mueves más lento y el machete pega la mitad hasta recuperar el 35 %.
- **Niveles**: los zombis sueltan cristales azules de experiencia. Al subir de nivel eliges 1 de 3 mejoras (vida, estamina, daño, cadencia, recarga, velocidad, regeneración, armadura, críticos, imán, robo de vida, munición...).
- **Armas**: machete (infinito), pistola, escopeta y rifle. Las dos últimas aparecen en los **suministros aéreos** (sigue la flecha amarilla).
- **Ciclo día/noche**: cada día dura 4 minutos. De noche solo ves lo que alumbra tu linterna, y los zombis aparecen más rápido, tienen más vida y van más deprisa.

## Dificultad progresiva

La lleva el "director" (`js/director.js`), y todo crece con el tiempo de partida:

- Frecuencia de aparición, cantidad máxima de zombis vivos y tamaño de los grupos.
- Vida, daño y velocidad de cada zombi.
- **Hordas** cada 2 minutos (la primera al 1:30), con aviso previo, y una más al caer cada noche.
- Nuevos tipos de zombi:

| Tipo | Aparece | Comportamiento |
|---|---|---|
| Caminante | 0:00 | Lento, básico |
| Corredor | 1:00 | Rápido y frágil |
| Escupidor | 2:30 | Mantiene la distancia y lanza ácido |
| Bruto | 3:30 | Muy resistente, pega fuerte, apenas retrocede |
| Hinchado | 5:00 | Explota al acercarse o morir (también daña a otros zombis) |

Todos los valores de balance están en **`js/config.js`**.

## Estructura del código

```
index.html        Página y menús
css/style.css     Estilos de los menús
js/config.js      Balance: jugador, armas, zombis, mejoras, dificultad
lib/three.min.js  Motor 3D Three.js r158 (licencia MIT, ver lib/three.LICENSE)
js/utils.js       Utilidades y rejilla espacial
js/input.js       Teclado y ratón
js/audio.js       Efectos de sonido sintetizados (WebAudio, sin archivos)
js/textures.js    Texturas procedurales: asfalto, fachadas, persianas, óxido, sangre...
js/zombiemodel.js Modelos de zombi esculpidos por código, variantes de ropa y animación (instancias)
js/world.js       Ciudad procedural (calles, edificios, ruinas, coches...) + pathfinding por campo de flujo
js/player.js      Jugador: movimiento, estamina, armas, niveles
js/entities.js    Zombis, proyectiles, objetos y partículas
js/director.js    Dificultad, hordas y suministros
js/renderer.js    Escena 3D: cámara, luces día/noche, edificios, zombis animados, efectos
js/hud.js         Barras, armas, minimapa y mensajes
js/ui.js          Menús HTML (inicio, pausa, nivel, muerte)
js/game.js        Bucle principal y estado de la partida
js/main.js        Arranque
```

Para depurar, el objeto `game` está disponible en la consola del navegador (por ejemplo `game.player.addXp(100)` o `game.time = 300`).

## Ideas para siguientes versiones

- Empaquetar como ejecutable de escritorio (Electron o Tauri).
- Modelos 3D y animaciones profesionales (por ejemplo, packs CC0) y sonidos grabados en lugar de los generados.
- Entrar en edificios, lluvia, post-procesado (oclusión ambiental, bloom).
- Crafteo y barricadas, más armas, jefes, modo cooperativo local.
