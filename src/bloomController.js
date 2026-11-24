/**
 * Asynchronous Bloom Animation Controller.
 * Orchestrates:
 * 1. Staggered upward stem growth from the bottom
 * 2. Bud emergence & gradual swelling at stem tips
 * 3. Per-petal sequential unfolding at randomized intervals
 * 4. Continuous, unpredictable re-blooming cycles so closed buds,
 *    half-opened trumpets, and full lilies coexist organically.
 */

function smoothstep(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function easeOutCubic(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

export class BloomController {
  /**
   * @param {Array<{
   *   stemDelay: number,
   *   stemDuration: number,
   *   initialBudDelay: number,
   *   bloomDuration: number,
   *   holdDuration: number,
   *   restBudDuration: number,
   *   petalCount: number,
   *   stayBudInitially?: boolean
   * }>} flowers
   */
  constructor(flowers) {
    this._flowers = flowers;
    this.elapsed = 0;
    this.states = [];
    this.reset();
  }

  /**
   * Reset all stems and bloom states to t=0 for fresh growth & blooming replay.
   */
  reset() {
    this.elapsed = 0;
    this.states = this._flowers.map((f, idx) => {
      // Deterministic pseudo-random per flower + slight organic variety
      const seed = (idx * 0.61803398875) % 1;
      const petalLags = [];
      for (let p = 0; p < f.petalCount; p++) {
        // Outer whorl (even indices) peels open slightly ahead of inner whorl
        const whorlBias = p % 2 === 0 ? 0.0 : 0.14;
        const jitter = (((idx * 7 + p * 13) % 11) / 11) * 0.12;
        petalLags.push(whorlBias + jitter);
      }

      return {
        stemDelay: f.stemDelay,
        stemDuration: f.stemDuration,
        stemProgress: 0,
        budScale: 0,
        openAmount: 0,
        phase: 'stem_growing', // 'stem_growing' | 'bud' | 'opening' | 'bloomed' | 'closing'
        phaseTimer: 0,
        waitUntilBloom: f.initialBudDelay,
        bloomDuration: f.bloomDuration,
        holdDuration: f.holdDuration,
        closeDuration: 4.8 + seed * 2.6,
        restBudDuration: f.restBudDuration,
        petalLags,
        breathPhase: seed * Math.PI * 2,
      };
    });
  }

  /**
   * Gently coax a tapped bud to begin blooming sooner, or refresh a bloom.
   * @param {number} idx
   */
  nudgeFlower(idx) {
    const s = this.states[idx];
    if (!s) return;
    if (s.phase === 'bud') {
      s.phase = 'opening';
      s.phaseTimer = 0;
    } else if (s.phase === 'closing') {
      s.phase = 'opening';
      s.phaseTimer = s.openAmount * s.bloomDuration;
    }
  }

  /**
   * Advance all flower growth and blooming state machines.
   * @param {number} dt
   */
  update(dt) {
    const step = Math.min(dt, 0.05);
    this.elapsed += step;

    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i];

      // 1. Stem growth from bottom
      const rawStem = (this.elapsed - s.stemDelay) / s.stemDuration;
      s.stemProgress = easeOutCubic(rawStem);

      // 2. Bud emergence near stem tip completion (starts around 65% stem growth)
      const rawBud = (s.stemProgress - 0.62) / 0.38;
      const emergentBud = smoothstep(rawBud);

      if (s.phase === 'stem_growing') {
        s.budScale = emergentBud * 0.72;
        s.openAmount = 0;
        if (s.stemProgress >= 1) {
          s.phase = 'bud';
          s.phaseTimer = 0;
        }
      } else if (s.phase === 'bud') {
        s.phaseTimer += step;
        const swell = smoothstep(Math.min(1, s.phaseTimer / Math.max(1.2, s.waitUntilBloom)));
        s.budScale = 0.72 + 0.28 * swell;
        s.openAmount = 0.015 * swell;

        if (s.phaseTimer >= s.waitUntilBloom) {
          // Keep bouquet organically varied: ensure at least 2 other flowers
          // are currently closed/closing buds before another bud opens
          let closedOthers = 0;
          for (let j = 0; j < this.states.length; j++) {
            if (j !== i && this.states[j].openAmount < 0.22) {
              closedOthers++;
            }
          }
          if (closedOthers >= 2 || this.elapsed < 3.5) {
            s.phase = 'opening';
            s.phaseTimer = 0;
          } else {
            s.waitUntilBloom += 2.2;
          }
        }
      } else if (s.phase === 'opening') {
        s.phaseTimer += step;
        s.budScale = 1;
        const p = Math.min(1, s.phaseTimer / s.bloomDuration);
        s.openAmount = smoothstep(p);

        if (p >= 1) {
          s.phase = 'bloomed';
          s.phaseTimer = 0;
          s.openAmount = 1;
        }
      } else if (s.phase === 'bloomed') {
        s.phaseTimer += step;
        s.budScale = 1;
        // Gentle living breathing motion while fully bloomed
        const breath = Math.sin(this.elapsed * 0.7 + s.breathPhase) * 0.025;
        s.openAmount = 0.975 + breath;

        if (s.phaseTimer >= s.holdDuration) {
          // Keep bouquet lush: ensure at least 6 other flowers remain open before closing
          let openOthers = 0;
          for (let j = 0; j < this.states.length; j++) {
            if (j !== i && this.states[j].openAmount > 0.65) {
              openOthers++;
            }
          }
          if (openOthers >= 7) {
            s.phase = 'closing';
            s.phaseTimer = 0;
          } else {
            s.holdDuration += 3.2;
          }
        }
      } else if (s.phase === 'closing') {
        s.phaseTimer += step;
        const p = Math.min(1, s.phaseTimer / s.closeDuration);
        s.openAmount = 1 - smoothstep(p);
        // Slightly tuck bud size as it prepares for next fresh bloom
        s.budScale = 1 - 0.16 * smoothstep(p);

        if (p >= 1) {
          s.phase = 'bud';
          s.phaseTimer = 0;
          s.openAmount = 0;
          // Randomize next wait interval so blooms remain asynchronous forever
          s.waitUntilBloom = s.restBudDuration * (0.75 + Math.random() * 0.6);
        }
      }
    }
  }

  /**
   * Compute individual petal openness [0..1] for petal p of flower i.
   * @param {number} flowerIdx
   * @param {number} petalIdx
   * @returns {number}
   */
  getPetalOpen(flowerIdx, petalIdx) {
    const s = this.states[flowerIdx];
    const lag = s.petalLags[petalIdx] || 0;
    const shifted = (s.openAmount - lag * 0.55) / (1 - lag * 0.55);
    return smoothstep(shifted);
  }
}
