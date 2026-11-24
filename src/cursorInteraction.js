/**
 * Interactive Cursor & Touch Spring Physics.
 * Tracks pointer proximity and drives smooth spring-damper reactions on
 * stems, flower heads, and leaves, recovering naturally when cursor leaves.
 */

export class CursorInteraction {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} flowerCount
   */
  constructor(canvas, flowerCount) {
    this.canvas = canvas;
    this.active = false;
    this.x = -9999;
    this.y = -9999;
    this.prevX = -9999;
    this.prevY = -9999;
    this.vx = 0;
    this.vy = 0;
    this.lastMoveTime = 0;

    /** @type {Array<{dx: number, dy: number, vx: number, vy: number, tiltX: number, tiltY: number}>} */
    this.flowerSprings = Array.from({ length: flowerCount }, () => ({
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      tiltX: 0,
      tiltY: 0,
    }));

    /** @type {Array<{x: number, y: number, radius: number, id: number}>} */
    this.flowerTargets = Array.from({ length: flowerCount }, (_, id) => ({
      x: 0,
      y: 0,
      radius: 80,
      id,
    }));

    /** @type {((flowerIndex: number) => void) | null} */
    this.onFlowerTap = null;

    this._bindEvents();
  }

  _bindEvents() {
    const updatePos = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const nx = clientX - rect.left;
      const ny = clientY - rect.top;

      if (!this.active) {
        this.prevX = nx;
        this.prevY = ny;
      } else {
        this.prevX = this.x;
        this.prevY = this.y;
      }

      this.x = nx;
      this.y = ny;
      this.vx = Math.max(-45, Math.min(45, (this.x - this.prevX) * 0.7));
      this.vy = Math.max(-45, Math.min(45, (this.y - this.prevY) * 0.7));
      this.active = true;
      this.lastMoveTime = performance.now();
    };

    window.addEventListener('mousemove', (e) => {
      updatePos(e.clientX, e.clientY);
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      this.active = false;
    }, { passive: true });

    this.canvas.addEventListener('pointerdown', (e) => {
      updatePos(e.clientX, e.clientY);
      this._handleTap(this.x, this.y);
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        updatePos(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updatePos(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      this.active = false;
    }, { passive: true });
  }

  /**
   * Apply a gentle spring impulse when a flower or bud is clicked/tapped.
   * @param {number} px
   * @param {number} py
   */
  _handleTap(px, py) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < this.flowerTargets.length; i++) {
      const t = this.flowerTargets[i];
      const dx = t.x - px;
      const dy = t.y - py;
      const d = Math.hypot(dx, dy);
      if (d < t.radius * 1.15 && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const s = this.flowerSprings[bestIdx];
      const t = this.flowerTargets[bestIdx];
      const dx = t.x - px;
      const dy = t.y - py;
      const len = Math.max(1, Math.hypot(dx, dy));
      s.vx += (dx / len) * 140;
      s.vy += (dy / len) * 90 + 35;

      if (this.onFlowerTap) {
        this.onFlowerTap(bestIdx);
      }
    }
  }

  /**
   * Update target coordinates of each flower head for next frame proximity calculations.
   * @param {number} index
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  setFlowerTarget(index, x, y, radius) {
    const t = this.flowerTargets[index];
    if (t) {
      t.x = x;
      t.y = y;
      t.radius = radius;
    }
  }

  /**
   * Step spring-damper physics for all flowers.
   * @param {number} dt
   * @param {number} bouquetScale
   */
  update(dt, bouquetScale) {
    const clampedDt = Math.min(dt, 0.04);
    this.vx *= Math.pow(0.05, clampedDt);
    this.vy *= Math.pow(0.05, clampedDt);

    const influenceRadius = Math.max(140, bouquetScale * 0.34);
    const stiffness = 24;
    const damping = 5.4;
    const maxOffset = Math.max(24, bouquetScale * 0.075);

    for (let i = 0; i < this.flowerSprings.length; i++) {
      const s = this.flowerSprings[i];
      const target = this.flowerTargets[i];

      let targetDx = 0;
      let targetDy = 0;

      if (this.active) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < influenceRadius) {
          const norm = 1 - dist / influenceRadius;
          const falloff = norm * norm * (3 - 2 * norm); // smoothstep

          // Gentle radial parting + subtle velocity entrainment
          const safeDist = Math.max(18, dist);
          const pushMag = falloff * maxOffset;
          targetDx = (dx / safeDist) * pushMag + this.vx * falloff * 0.48;
          targetDy = (dy / safeDist) * pushMag * 0.65 + this.vy * falloff * 0.35;
        }
      }

      // Spring force toward target displacement
      const ax = (targetDx - s.dx) * stiffness - s.vx * damping;
      const ay = (targetDy - s.dy) * stiffness - s.vy * damping;

      s.vx += ax * clampedDt;
      s.vy += ay * clampedDt;
      s.dx += s.vx * clampedDt;
      s.dy += s.vy * clampedDt;

      // Soft clamp to avoid bouquet distortion
      const mag = Math.hypot(s.dx, s.dy);
      if (mag > maxOffset * 1.35) {
        const scale = (maxOffset * 1.35) / mag;
        s.dx *= scale;
        s.dy *= scale;
      }

      // Smooth rotational tilt response
      const desiredTiltX = s.dx / maxOffset;
      const desiredTiltY = s.dy / maxOffset;
      s.tiltX += (desiredTiltX - s.tiltX) * Math.min(1, clampedDt * 8);
      s.tiltY += (desiredTiltY - s.tiltY) * Math.min(1, clampedDt * 8);
    }
  }

  /**
   * Compute subtle proximity deflection for an individual leaf tip.
   * @param {number} lx
   * @param {number} ly
   * @param {number} bouquetScale
   * @returns {{ dx: number, dy: number }}
   */
  sampleLeafDeflection(lx, ly, bouquetScale) {
    if (!this.active) return { dx: 0, dy: 0 };
    const radius = Math.max(95, bouquetScale * 0.22);
    const dx = lx - this.x;
    const dy = ly - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= radius) return { dx: 0, dy: 0 };

    const norm = 1 - dist / radius;
    const ease = norm * norm;
    const safeDist = Math.max(14, dist);
    const maxShift = Math.max(14, bouquetScale * 0.042);

    return {
      dx: (dx / safeDist) * ease * maxShift + this.vx * ease * 0.25,
      dy: (dy / safeDist) * ease * maxShift * 0.7 + this.vy * ease * 0.2,
    };
  }
}
