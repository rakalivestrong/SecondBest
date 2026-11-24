/**
 * High-performance ASCII Rasterizer & Canvas Rendering Engine.
 * Maintains a responsive character grid with a per-cell Z-buffer,
 * quantized color-bucket batching, and restrained center-glow lighting.
 */

export class AsciiEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = ctx;

    // Quarter-resolution offscreen canvas for restrained floral center highlight
    this.glowCanvas = document.createElement('canvas');
    this.glowCtx = this.glowCanvas.getContext('2d');

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.cols = 0;
    this.rows = 0;
    this.cellW = 7;
    this.cellH = 11;
    this.fontSize = 11;
    this.fontStr = '500 11px "SFMono-Regular", Menlo, Consolas, monospace';

    // Frame buffers
    this.zBuf = new Float32Array(0);
    this.rBuf = new Uint8Array(0);
    this.gBuf = new Uint8Array(0);
    this.bBuf = new Uint8Array(0);
    this.charBuf = new Uint8Array(0);
    this.activeCells = new Int32Array(0);
    this.activeCount = 0;

    /** @type {Array<{x: number, y: number, r: number, g: number, b: number, radius: number, intensity: number}>} */
    this.glowLights = [];

    // Zero-GC color bucket cache
    /** @type {Map<number, string>} */
    this.colorCssCache = new Map();
    /** @type {Map<number, number[]>} */
    this.buckets = new Map();
    /** @type {number[][]} */
    this.bucketPool = [];

    // Pre-cached single character strings by ASCII code
    /** @type {string[]} */
    this.charLookup = new Array(128);
    for (let i = 0; i < 128; i++) {
      this.charLookup[i] = String.fromCharCode(i);
    }

    // Ambient floating background particles
    const pCount = 70;
    this.bgParticles = new Array(pCount);
    for (let i = 0; i < pCount; i++) {
      this.bgParticles[i] = {
        nx: Math.random(),
        ny: Math.random(),
        speedX: (Math.random() - 0.5) * 0.03,
        speedY: -0.02 - Math.random() * 0.03,
        r: 1.5 + Math.random() * 2.8,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1.2 + Math.random() * 2.0,
        color: i % 3 === 0 ? '255, 175, 215' : i % 3 === 1 ? '225, 205, 255' : '255, 235, 245',
      };
    }
  }

  /**
   * Resize canvas and recompute responsive ASCII cell grid.
   */
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    const minDim = Math.min(this.width, this.height);
    if (this.width < 640) {
      this.fontSize = Math.max(7.5, Math.min(9.5, minDim / 48));
    } else if (this.width < 1100) {
      this.fontSize = Math.max(9.0, Math.min(10.8, minDim / 70));
    } else {
      this.fontSize = Math.max(9.8, Math.min(11.4, minDim / 82));
    }

    this.fontStr = `500 ${this.fontSize.toFixed(1)}px "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = this.fontStr;
    const metrics = this.ctx.measureText('M');
    const measuredW = metrics.width || this.fontSize * 0.6;

    this.cellW = Math.max(4.8, measuredW * 1.02);
    this.cellH = Math.max(7.8, this.fontSize * 0.96);

    this.cols = Math.max(20, Math.ceil(this.width / this.cellW));
    this.rows = Math.max(20, Math.ceil(this.height / this.cellH));

    const total = this.cols * this.rows;
    if (this.zBuf.length !== total) {
      this.zBuf = new Float32Array(total);
      this.rBuf = new Uint8Array(total);
      this.gBuf = new Uint8Array(total);
      this.bBuf = new Uint8Array(total);
      this.charBuf = new Uint8Array(total);
      this.activeCells = new Int32Array(total);
    }

    this.glowCanvas.width = Math.max(1, Math.floor(this.width * 0.25));
    this.glowCanvas.height = Math.max(1, Math.floor(this.height * 0.25));
  }

  /**
   * Clear buffers at the start of a frame.
   */
  beginFrame() {
    this.zBuf.fill(1e9);
    this.activeCount = 0;
    this.glowLights.length = 0;
  }

  /**
   * Plot a point in world pixel coordinates into the ASCII grid using Z-buffering.
   */
  plotPixel(px, py, z, r, g, b, charCode) {
    const col = (px / this.cellW) | 0;
    const row = (py / this.cellH) | 0;
    this.plotCell(col, row, z, r, g, b, charCode);
  }

  /**
   * Plot directly by grid column/row.
   */
  plotCell(col, row, z, r, g, b, charCode) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return;
    }
    const idx = row * this.cols + col;
    if (z < this.zBuf[idx]) {
      if (this.zBuf[idx] === 1e9) {
        this.activeCells[this.activeCount++] = idx;
      }
      this.zBuf[idx] = z;
      this.rBuf[idx] = r;
      this.gBuf[idx] = g;
      this.bBuf[idx] = b;
      this.charBuf[idx] = charCode;
    }
  }

  /**
   * Register a subtle ambient glow light at a flower center.
   */
  addGlowLight(x, y, r, g, b, radius, intensity) {
    if (intensity <= 0.01) return;
    this.glowLights.push({ x, y, r, g, b, radius, intensity });
  }

  /**
   * Render gentle glowing ambient fireflies/pollen particles behind ASCII flowers.
   * @param {number} t
   */
  drawBackgroundParticles(t) {
    if (!this.bgParticles) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    for (let i = 0; i < this.bgParticles.length; i++) {
      const p = this.bgParticles[i];
      const x = ((p.nx + p.speedX * t + Math.sin(t * 0.4 + p.phase) * 0.04) % 1 + 1) % 1 * w;
      const y = ((p.ny + p.speedY * t) % 1 + 1) % 1 * h;
      const alpha = Math.max(0.08, 0.22 + 0.38 * Math.sin(t * p.twinkleSpeed + p.phase));

      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color}, ${alpha.toFixed(3)})`;
      ctx.shadowColor = `rgba(${p.color}, 0.6)`;
      ctx.shadowBlur = p.r * 3;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /**
   * Render restrained flower-center highlights, ambient background particles, and crisp ASCII characters.
   * @param {number} [elapsed=0]
   */
  render(elapsed = 0) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Canvas clear
    ctx.clearRect(0, 0, this.width, this.height);

    // Ambient floating starlight / pollen particles behind ASCII bouquet
    this.drawBackgroundParticles(elapsed);

    // Restrained subtle highlights around flower centers (no blur on text)
    if (this.glowLights.length > 0 && this.glowCtx) {
      const gCtx = this.glowCtx;
      const gw = this.glowCanvas.width;
      const gh = this.glowCanvas.height;
      gCtx.clearRect(0, 0, gw, gh);
      gCtx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < this.glowLights.length; i++) {
        const l = this.glowLights[i];
        const gx = l.x * 0.25;
        const gy = l.y * 0.25;
        const gr = Math.max(6, l.radius * 0.22);
        const grad = gCtx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grad.addColorStop(0, `rgba(${l.r}, ${l.g}, ${l.b}, ${(0.14 * l.intensity).toFixed(3)})`);
        grad.addColorStop(0.45, `rgba(${l.r}, ${l.g}, ${l.b}, ${(0.05 * l.intensity).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        gCtx.fillStyle = grad;
        gCtx.beginPath();
        gCtx.arc(gx, gy, gr, 0, Math.PI * 2);
        gCtx.fill();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.glowCanvas, 0, 0, this.width, this.height);
      ctx.restore();
    }

    // Bucket active cells by quantized 18-bit RGB key
    for (const arr of this.buckets.values()) {
      arr.length = 0;
      this.bucketPool.push(arr);
    }
    this.buckets.clear();

    const active = this.activeCells;
    const count = this.activeCount;
    const rBuf = this.rBuf;
    const gBuf = this.gBuf;
    const bBuf = this.bBuf;
    const charBuf = this.charBuf;

    for (let i = 0; i < count; i++) {
      const idx = active[i];
      if (charBuf[idx] === 32) continue;
      const rq = rBuf[idx] & 0xfc;
      const gq = gBuf[idx] & 0xfc;
      const bq = bBuf[idx] & 0xfc;
      const key = (rq << 16) | (gq << 8) | bq;

      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = this.bucketPool.length > 0 ? this.bucketPool.pop() : [];
        this.buckets.set(key, bucket);
      }
      bucket.push(idx);
    }

    ctx.font = this.fontStr;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const cols = this.cols;
    const cw = this.cellW;
    const ch = this.cellH;
    const lookup = this.charLookup;

    for (const [key, indices] of this.buckets) {
      if (indices.length === 0) continue;
      let css = this.colorCssCache.get(key);
      if (!css) {
        const r = (key >> 16) & 0xff;
        const g = (key >> 8) & 0xff;
        const b = key & 0xff;
        css = `rgb(${r},${g},${b})`;
        this.colorCssCache.set(key, css);
      }
      ctx.fillStyle = css;

      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j];
        const col = idx % cols;
        const row = (idx / cols) | 0;
        const code = charBuf[idx];
        ctx.fillText(lookup[code], col * cw, row * ch);
      }
    }
  }
}
