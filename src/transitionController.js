/**
 * Cinematic 3D-to-ASCII Dissolve Transition Controller.
 *
 * Sequence on "ENTER THE GARDEN ↗":
 * 1. Editorial text fades gracefully while WebGL camera approaches the giant 3D flower
 *    and its iridescent petals expand outward toward the viewer.
 * 2. Sampled 3D world-space petal & pearl positions erupt into thousands of colored
 *    ASCII characters swirling across the screen as the 3D view dissolves to #030303.
 * 3. The preserved ASCII lily bouquet emerges and sprouts/blooms naturally.
 */

const FALLBACK_CHARS = '.,:;!|+~=*#%@';
const FALLBACK_COLORS = [
  [248, 221, 229],
  [233, 225, 245],
  [255, 132, 192],
  [255, 181, 160],
  [255, 247, 251],
];

export class TransitionController {
  /**
   * @param {import('./flowerDimensionScene.js').FlowerDimensionScene} dimension
   * @param {import('./bouquetExperience.js').BouquetExperience} bouquet
   */
  constructor(dimension, bouquet) {
    this.dimension = dimension;
    this.bouquet = bouquet;
    this.bouquetView = document.getElementById('bouquet-view');
    this.canvas = /** @type {HTMLCanvasElement | null} */ (
      document.getElementById('transition-canvas')
    );
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.isTransitioning = false;
    this.particles = [];
    this.particleRaf = 0;
    this.choreoRaf = 0;
    this.lastParticleTime = 0;

    /** @type {number[]} */
    this._timers = [];

    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  _resizeCanvas() {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _clearAll() {
    for (const id of this._timers) {
      window.clearTimeout(id);
    }
    this._timers.length = 0;
    if (this.choreoRaf) {
      window.cancelAnimationFrame(this.choreoRaf);
      this.choreoRaf = 0;
    }
  }

  /**
   * Spawn colored ASCII dissolve particles either directly from projected 3D flower
   * geometry points or ambient swirl fallback.
   * @param {Array<{ x: number, y: number, r: number, g: number, b: number, char: string }>} sampledPoints
   * @param {number} extraAmbient
   * @param {number} durationSec
   * @param {'burst' | 'gentle'} mode
   */
  _spawnAsciiCloud(sampledPoints, extraAmbient, durationSec, mode = 'burst') {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w * 0.5;
    const cy = h * 0.5;

    this.particles = [];

    for (let i = 0; i < sampledPoints.length; i++) {
      const pt = sampledPoints[i];
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
      const speed =
        mode === 'burst'
          ? 70 + Math.random() * 230
          : 20 + Math.random() * 65;

      this.particles.push({
        x: pt.x + (Math.random() - 0.5) * 8,
        y: pt.y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (mode === 'burst' ? 18 : 26),
        swirl: (Math.random() - 0.5) * (mode === 'burst' ? 1.8 : 0.7),
        size: 10 + Math.random() * 8,
        char: pt.char,
        rgb: `${pt.r}, ${pt.g}, ${pt.b}`,
        life: 0,
        maxLife: durationSec * (0.62 + Math.random() * 0.45),
        delay: Math.random() * (mode === 'burst' ? 0.28 : 0.35),
        phase: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < extraAmbient; i++) {
      const col = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
      const x = Math.random() * w;
      const y = h * (0.12 + Math.random() * 0.8);
      const angle = Math.atan2(y - cy, x - cx);
      const speed = mode === 'burst' ? 45 + Math.random() * 140 : 18 + Math.random() * 45;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 30,
        vy: Math.sin(angle) * speed - 24,
        swirl: (Math.random() - 0.5) * 1.4,
        size: 10 + Math.random() * 6,
        char: FALLBACK_CHARS[Math.floor(Math.random() * FALLBACK_CHARS.length)],
        rgb: `${col[0]}, ${col[1]}, ${col[2]}`,
        life: 0,
        maxLife: durationSec * (0.58 + Math.random() * 0.48),
        delay: Math.random() * 0.38,
        phase: Math.random() * Math.PI * 2,
      });
    }

    this._ensureParticleLoop();
  }

  _ensureParticleLoop() {
    if (this.particleRaf) return;
    this.lastParticleTime = performance.now();

    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastParticleTime) / 1000));
      this.lastParticleTime = now;
      const alive = this._renderParticles(dt);
      if (alive) {
        this.particleRaf = window.requestAnimationFrame(tick);
      } else {
        this.particleRaf = 0;
        if (this.ctx) {
          this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
      }
    };

    this.particleRaf = window.requestAnimationFrame(tick);
  }

  /**
   * @param {number} dt
   * @returns {boolean}
   */
  _renderParticles(dt) {
    const ctx = this.ctx;
    if (!ctx) return false;

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    let anyAlive = false;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Batch-friendly loop (monospace ASCII characters)
    for (let i = 0; i < this.particles.length; i++) {
      const m = this.particles[i];
      if (m.delay > 0) {
        m.delay -= dt;
        anyAlive = true;
        continue;
      }

      m.life += dt;
      if (m.life >= m.maxLife) continue;

      anyAlive = true;
      const p = m.life / m.maxLife;
      const fadeIn = Math.min(1, p * 4.5);
      const fadeOut = Math.pow(Math.max(0, 1 - p), 1.35);
      const alpha = fadeIn * fadeOut * 0.92;

      // Apply graceful vortex curl + outward drift
      const cos = Math.cos(m.swirl * dt);
      const sin = Math.sin(m.swirl * dt);
      const nvx = m.vx * cos - m.vy * sin;
      const nvy = m.vx * sin + m.vy * cos;
      m.vx = nvx * 0.985;
      m.vy = nvy * 0.985;

      m.x += (m.vx + Math.sin(m.life * 3.1 + m.phase) * 14) * dt;
      m.y += (m.vy + Math.cos(m.life * 2.4 + m.phase) * 10) * dt;

      ctx.font = `400 ${m.size.toFixed(0)}px "SFMono-Regular", Menlo, Consolas, monospace`;
      ctx.fillStyle = `rgba(${m.rgb}, ${alpha.toFixed(3)})`;
      ctx.fillText(m.char, m.x, m.y);
    }

    return anyAlive;
  }

  /**
   * Enter the ASCII Lily Garden from The Flower Dimension:
   * 1. Fade UI & dive camera toward the giant 3D flower while petals unfurl
   * 2. Sample 3D petal/pearl world points & burst into colored ASCII characters
   * 3. Fade 3D scene cleanly into #030303 darkness
   * 4. Reveal and sprout the preserved ASCII lily bouquet
   */
  openGarden() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this._clearAll();

    this.dimension.beginLeave();

    const approachDurationMs = 820;
    const startTime = performance.now();
    let burstTriggered = false;

    const stepApproach = (now) => {
      const t = Math.min(1, (now - startTime) / approachDurationMs);
      this.dimension.setTransitionProgress(t);

      // At peak petal expansion, burst thousands of colored ASCII glyphs from 3D petals
      if (!burstTriggered && t >= 0.56) {
        burstTriggered = true;
        const sampled = this.dimension.sampleDissolvePoints(1450);
        this._spawnAsciiCloud(sampled, 420, 1.85, 'burst');
        this.dimension.fadeToDarkness();
      }

      if (t < 1) {
        this.choreoRaf = window.requestAnimationFrame(stepApproach);
      } else {
        this.choreoRaf = 0;
      }
    };

    this.choreoRaf = window.requestAnimationFrame(stepApproach);

    // Reveal dark #030303 ASCII bouquet canvas and begin natural stem growth
    this._timers.push(
      window.setTimeout(() => {
        if (this.bouquetView) {
          this.bouquetView.hidden = false;
          void this.bouquetView.offsetWidth;
          this.bouquetView.classList.add('is-active');
        }
        this.bouquet.replay();
      }, 760)
    );

    // Hide & pause WebGL scene cleanly once dissolve finishes
    this._timers.push(
      window.setTimeout(() => {
        this.dimension.hide();
        this.isTransitioning = false;
      }, 1580)
    );
  }

  /**
   * Replay the blooming sequence inside the ASCII garden.
   */
  replayGarden() {
    if (this.isTransitioning) return;
    this._spawnAsciiCloud([], 90, 1.4, 'gentle');
    this.bouquet.replay();
  }

  /**
   * Return smoothly from the ASCII bouquet back to the 3D Flower Dimension.
   */
  returnToLanding() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this._clearAll();

    this._spawnAsciiCloud([], 140, 1.35, 'gentle');

    if (this.bouquetView) {
      this.bouquetView.classList.remove('is-active');
    }
    this.dimension.show();

    this._timers.push(
      window.setTimeout(() => {
        if (this.bouquetView) {
          this.bouquetView.hidden = true;
        }
        this.bouquet.stop();
        this.isTransitioning = false;
      }, 1050)
    );
  }
}
