/**
 * Living ASCII Lily Bouquet & The Flower Dimension — Application Entry Point.
 * Wires the Three.js Flower Dimension landing universe, 3D-to-ASCII dissolve
 * transition controller, preserved ASCII lily bouquet, and discreet navigation.
 */

import { BouquetExperience } from './bouquetExperience.js';
import { FlowerDimensionScene } from './flowerDimensionScene.js';
import { MusicPlayer } from './musicPlayer.js';
import { TransitionController } from './transitionController.js';

function init() {
  const dimensionCanvas = /** @type {HTMLCanvasElement | null} */ (
    document.getElementById('dimension-canvas')
  );
  const bouquetCanvas = /** @type {HTMLCanvasElement | null} */ (
    document.getElementById('bouquet-canvas')
  );

  if (!dimensionCanvas || !bouquetCanvas) {
    throw new Error('Missing required canvas elements');
  }

  const bouquet = new BouquetExperience(bouquetCanvas);
  const music = new MusicPlayer();
  let transitionCtrl = /** @type {TransitionController | null} */ (null);

  const dimension = new FlowerDimensionScene(dimensionCanvas, () => {
    transitionCtrl?.openGarden();
    music.play();
  });

  transitionCtrl = new TransitionController(dimension, bouquet);

  const backBtn = document.getElementById('back-to-garden-btn');
  const replayBtn = document.getElementById('replay-bouquet-btn');
  const easterEggBtn = document.getElementById('easter-egg-btn');
  const easterEggPopup = document.getElementById('easter-egg-popup');
  const easterEggClose = document.getElementById('easter-egg-close');

  let closeTimer = 0;

  const openEasterEgg = () => {
    if (!easterEggPopup) return;
    window.clearTimeout(closeTimer);
    easterEggPopup.hidden = false;
    void easterEggPopup.offsetWidth;
    easterEggPopup.classList.add('is-open');
    easterEggBtn?.setAttribute('aria-expanded', 'true');
    easterEggClose?.focus();
  };

  const closeEasterEgg = (restoreFocus = false) => {
    if (!easterEggPopup || easterEggPopup.hidden) return;
    easterEggPopup.classList.remove('is-open');
    easterEggBtn?.setAttribute('aria-expanded', 'false');
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      easterEggPopup.hidden = true;
    }, 390);
    if (restoreFocus) {
      easterEggBtn?.focus();
    }
  };

  easterEggBtn?.addEventListener('click', openEasterEgg);
  easterEggClose?.addEventListener('click', () => closeEasterEgg(true));
  easterEggPopup?.addEventListener('click', (e) => {
    if (e.target === easterEggPopup) {
      closeEasterEgg(true);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && easterEggPopup && !easterEggPopup.hidden) {
      closeEasterEgg(true);
    }
  });

  backBtn?.addEventListener('click', () => {
    closeEasterEgg(false);
    transitionCtrl?.returnToLanding();
  });

  replayBtn?.addEventListener('click', () => {
    transitionCtrl?.replayGarden();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
