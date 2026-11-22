'use strict';

(function () {
  const hud = document.getElementById('hud');
  Input.init(hud);
  const game = new Game(document.getElementById('gl'), hud);
  window.game = game; // útil para depurar desde la consola

  window.addEventListener('blur', () => {
    if (game.state === 'playing') game.togglePause();
  });

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    game.update(dt);
    game.render();
    Input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
