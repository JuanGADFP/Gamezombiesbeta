'use strict';

(function () {
  const canvas = document.getElementById('game');
  Input.init(canvas);
  const game = new Game(canvas);
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
