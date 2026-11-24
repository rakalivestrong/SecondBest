/**
 * ASCII Lily Bouquet Experience Controller.
 * Preserves the exact original ASCII bouquet geometry, palettes,
 * blooming lifecycle, wind physics, and cursor spring interaction.
 */

import { AsciiEngine } from './asciiEngine.js';
import { BloomController } from './bloomController.js';
import { createBouquetSpec } from './bouquetLayout.js';
import { CursorInteraction } from './cursorInteraction.js';
import { renderLilyFlower } from './lilyGeometry.js';
import { renderFlowerStemAndLeaves, renderLeaf } from './stemAndLeaf.js';
import { WindSimulation } from './windPhysics.js';

export class BouquetExperience {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new AsciiEngine(canvas);
    const { flowers, basalLeaves } = createBouquetSpec();
    this.flowers = flowers;
    this.basalLeaves = basalLeaves;
    this.bloomCtrl = new BloomController(flowers);
    this.wind = new WindSimulation();
    this.cursor = new CursorInteraction(canvas, flowers.length);

    this.cursor.onFlowerTap = (idx) => {
      this.bloomCtrl.nudgeFlower(idx);
    };

    this.running = false;
    this.rafId = 0;
    this.lastTime = 0;

    this._onResize = () => {
      this.engine.resize();
    };
    window.addEventListener('resize', this._onResize);
    this.engine.resize();

    this._frame = this._frame.bind(this);
  }

  /**
   * Compute responsive bouquet bounding dimensions centered in viewport.
   */
  _getBouquetDims() {
    const bouquetH = Math.min(this.engine.height * 0.88, this.engine.width * 1.48);
    const bouquetW = Math.min(this.engine.width * 0.92, bouquetH * 0.96);
    const scale = Math.min(bouquetW, bouquetH);
    const originX = this.engine.width * 0.5;
    const originY = this.engine.height * 0.5 + bouquetH * 0.475;
    return { originX, originY, bouquetW, bouquetH, scale };
  }

  /**
   * Start or resume the bouquet animation loop.
   */
  start() {
    this.engine.resize();
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._frame);
  }

  /**
   * Pause the bouquet loop while hidden on landing page.
   */
  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /**
   * Reset stem growth and blooming timeline from t=0 and ensure running.
   */
  replay() {
    this.bloomCtrl.reset();
    this.engine.beginFrame();
    this.engine.render();
    if (!this.running) {
      this.start();
    } else {
      this.lastTime = performance.now();
    }
  }

  /**
   * @param {number} now
   */
  _frame(now) {
    if (!this.running) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    const dims = this._getBouquetDims();

    this.wind.update(dt);
    const elapsed = this.bloomCtrl.elapsed;
    this.bloomCtrl.update(dt);
    this.cursor.update(dt, dims.scale);

    this.engine.beginFrame();

    // 1. Render basal & waist-framing foliage leaves
    for (let i = 0; i < this.basalLeaves.length; i++) {
      const bl = this.basalLeaves[i];
      const growRaw = (elapsed - bl.delay) / 1.4;
      if (growRaw <= 0) continue;
      const grow = Math.min(1, growRaw);
      const easeGrow = grow * (2 - grow);

      const leafWind = this.wind.sample(bl.baseNx, bl.baseNy, bl.phase);
      renderLeaf(
        this.engine,
        dims.originX + bl.baseNx * dims.bouquetW,
        dims.originY + bl.baseNy * dims.bouquetH,
        bl.z * dims.scale * 0.45,
        bl.angle,
        bl.length * dims.scale,
        bl.width * dims.scale,
        bl.droop,
        easeGrow,
        leafWind.wx * dims.scale * 0.028,
        leafWind.wy * dims.scale * 0.014,
        this.cursor,
        dims.scale,
        elapsed,
        bl.phase
      );
    }

    // 2. Render each lily's stem, attached leaves, and 3D ASCII flower head
    for (let i = 0; i < this.flowers.length; i++) {
      const f = this.flowers[i];
      const bState = this.bloomCtrl.states[i];
      const spring = this.cursor.flowerSprings[i];

      const tipInfo = renderFlowerStemAndLeaves(
        this.engine,
        f,
        bState,
        spring,
        this.wind,
        this.cursor,
        dims,
        elapsed
      );

      this.cursor.setFlowerTarget(
        i,
        tipInfo.tipX,
        tipInfo.tipY,
        dims.scale * 0.13 * f.size
      );

      renderLilyFlower(
        this.engine,
        f,
        this.bloomCtrl,
        i,
        tipInfo,
        spring,
        dims.scale,
        elapsed
      );
    }

    // 3. Flush ASCII grid & restrained center glows to the canvas
    this.engine.render(elapsed);

    this.rafId = requestAnimationFrame(this._frame);
  }
}
