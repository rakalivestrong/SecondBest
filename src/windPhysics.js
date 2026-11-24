/**
 * Natural Wind Physics Simulation.
 * Multi-layered smooth sine waves with spatial phase offsets and gentle gusts
 * so stems sway more near the top, leaves lag independently, and petals flutter.
 */

export class WindSimulation {
  constructor() {
    this.time = 0;
  }

  /**
   * Advance wind clock.
   * @param {number} dt Seconds elapsed
   */
  update(dt) {
    this.time += dt;
  }

  /**
   * Sample smooth wind vector at normalized bouquet coordinate (nx, ny).
   * @param {number} nx Normalized X (-0.5..0.5)
   * @param {number} ny Normalized Y (-1..0)
   * @param {number} phaseOffset Individual plant/leaf phase offset
   * @returns {{ wx: number, wy: number, gust: number }}
   */
  sample(nx, ny, phaseOffset = 0) {
    const t = this.time;

    // Slow primary breeze + harmonic secondary sway + traveling spatial gust
    const primary = Math.sin(t * 0.62 + phaseOffset * 0.7 + nx * 1.4);
    const secondary = Math.sin(t * 1.38 + phaseOffset * 1.3 - ny * 1.8) * 0.42;
    const micro = Math.sin(t * 2.45 + phaseOffset * 2.1 + nx * 3.1) * 0.16;

    // Gentle asymmetric breeze envelope (drifting slightly right and back)
    const gust = 0.5 + 0.5 * Math.sin(t * 0.34 - nx * 1.2 + phaseOffset * 0.4);
    const wx = (primary * 0.65 + secondary + micro) * (0.75 + 0.45 * gust);
    const wy = Math.cos(t * 0.95 + phaseOffset + nx * 1.9) * 0.24;

    return { wx, wy, gust };
  }
}
