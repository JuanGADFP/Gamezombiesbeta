# Zona Muerta — supervivencia zombi (beta)

Juego de supervivencia para PC con vista cenital y cámara alta (estilo *How to Survive*).
El objetivo es aguantar vivo el mayor tiempo posible mientras los ataques zombis se vuelven más duros.

## Cómo jugar

No hace falta instalar nada: **abre `index.html` con Chrome, Edge o Firefox** (doble clic).

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
| `Esc` / `P` | Pausa · `M` silencio |

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
js/utils.js       Utilidades y rejilla espacial
js/input.js       Teclado y ratón
js/audio.js       Efectos de sonido sintetizados (WebAudio, sin archivos)
js/world.js       Mapa procedural (calles, edificios, bosque) + pathfinding por campo de flujo
js/player.js      Jugador: movimiento, estamina, armas, niveles
js/entities.js    Zombis, proyectiles, objetos y partículas
js/director.js    Dificultad, hordas y suministros
js/renderer.js    Dibujo del mundo, iluminación nocturna
js/hud.js         Barras, armas, minimapa y mensajes
js/ui.js          Menús HTML (inicio, pausa, nivel, muerte)
js/game.js        Bucle principal y estado de la partida
js/main.js        Arranque
```

Para depurar, el objeto `game` está disponible en la consola del navegador (por ejemplo `game.player.addXp(100)` o `game.time = 300`).

## Ideas para siguientes versiones

- Empaquetar como ejecutable de escritorio (Electron o Tauri).
- Sprites y sonidos propios en lugar de las figuras y sonidos generados.
- Crafteo y barricadas, más armas, jefes, modo cooperativo local.
