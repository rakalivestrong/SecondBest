/**
 * Procedural 3D Lily Geometry & ASCII Surface Rasterizer.
 * Generates each lily mathematically in 3D space using parametric petal surfaces,
 * outer/inner whorl alternation, cup-to-recurve unfolding, botanical spots,
 * 6 curved stamens with pollen anthers, central pistil, and sepal bud ribs.
 */

import {
  FOLIAGE_PALETTE,
  LILY_PALETTES,
  MAT_ANTHER,
  MAT_PETAL,
  MAT_STEM,
  MAT_THROAT,
  mixRgb,
  samplePetalColor,
  selectAsciiCode,
} from './palettes.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Deterministic spatial hash in [0..1] for organic lily speckles.
 */
function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Build an orthonormal 3D basis [right, up, forward] for a flower head
 * oriented by yaw, pitch, and roll.
 */
function buildBasis(yaw, pitch, roll) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const fx = -sy * cp;
  const fy = sp;
  const fz = -cy * cp;

  const rx = cy;
  const ry = 0;
  const rz = -sy;

  let ux = fy * rz - fz * ry;
  let uy = fz * rx - fx * rz;
  let uz = fx * ry - fy * rx;

  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  const right = [
    rx * cr + ux * sr,
    ry * cr + uy * sr,
    rz * cr + uz * sr,
  ];
  const up = [
    ux * cr - rx * sr,
    uy * cr - ry * sr,
    uz * cr - rz * sr,
  ];
  const forward = [fx, fy, fz];

  return { right, up, forward };
}

/**
 * Render one complete 3D lily (closed bud, unfolding trumpet, or full bloom)
 * into the ASCII engine buffer.
 */
export function renderLilyFlower(
  engine,
  flowerSpec,
  bloomCtrl,
  flowerIdx,
  tipInfo,
  spring,
  scale,
  time
) {
  const state = bloomCtrl.states[flowerIdx];
  if (state.budScale <= 0.03) return;

  const pal = LILY_PALETTES[flowerSpec.color] || LILY_PALETTES.crimson;
  const openAvg = state.openAmount;
  const budScale = state.budScale;

  // Original Turn 1 proportions with clean separation between neighboring blooms
  const petalLen = scale * 0.165 * flowerSpec.size * budScale;
  const petalMaxHalfW = petalLen * 0.285;

  // Combine static botanical orientation with stem sway & cursor spring tilt
  const dynamicYaw =
    flowerSpec.yaw +
    tipInfo.swayX * 0.08 +
    spring.tiltX * 0.22 +
    tipInfo.tangentX * 0.14;
  const dynamicPitch =
    flowerSpec.pitch +
    spring.tiltY * 0.18 +
    (tipInfo.tangentY + 1) * 0.12;

  const { right, up, forward } = buildBasis(dynamicYaw, dynamicPitch, flowerSpec.roll);

  const hx = tipInfo.tipX;
  const hy = tipInfo.tipY;
  const hz = tipInfo.tipZ;

  // Subtle restrained center glow
  const glowIntensity = 0.28 + 0.56 * openAvg;
  engine.addGlowLight(
    hx + forward[0] * petalLen * 0.15,
    hy + forward[1] * petalLen * 0.15,
    pal.glow[0],
    pal.glow[1],
    pal.glow[2],
    petalLen * (0.85 + 0.45 * openAvg),
    glowIntensity * budScale
  );

  // Small green receptacle / calyx base at stem tip
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > 1) continue;
      const gx = hx - forward[0] * 4 + dc * engine.cellW * 0.6;
      const gy = hy - forward[1] * 4 + dr * engine.cellH * 0.6;
      engine.plotPixel(
        gx,
        gy,
        hz + 3,
        FOLIAGE_PALETTE.leafShadow[0],
        FOLIAGE_PALETTE.leafShadow[1],
        FOLIAGE_PALETTE.leafShadow[2],
        42 // '*'
      );
    }
  }

  const Nu = Math.max(22, Math.ceil(petalLen / (engine.cellW * 0.42)));
  const Nv = Math.max(9, Math.ceil(petalMaxHalfW / (engine.cellW * 0.42)));

  const lx = -0.38;
  const ly = -0.55;
  const lz = -0.74;

  const petalCount = flowerSpec.petalCount;

  // 1. Render each individual lily petal (outer & inner whorl)
  for (let p = 0; p < petalCount; p++) {
    const pOpen = bloomCtrl.getPetalOpen(flowerIdx, p);
    const isOuter = p % 2 === 0;

    const lenVar = 0.94 + ((p * 7 + flowerIdx * 3) % 5) * 0.03;
    const widVar = isOuter ? 0.92 : 1.06;
    const whorlZ = isOuter ? -0.035 : 0.02;

    const theta = (p / petalCount) * Math.PI * 2 + (isOuter ? 0 : 0.04);
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    const radX = cosT * right[0] + sinT * up[0];
    const radY = cosT * right[1] + sinT * up[1];
    const radZ = cosT * right[2] + sinT * up[2];

    const tanX = -sinT * right[0] + cosT * up[0];
    const tanY = -sinT * right[1] + cosT * up[1];
    const tanZ = -sinT * right[2] + cosT * up[2];

    const pFlutter =
      Math.sin(time * 2.2 + flowerSpec.windPhase + p * 1.15) *
      0.065 *
      petalLen *
      pOpen;

    const L = petalLen * (0.64 + 0.36 * pOpen) * lenVar;
    const W = petalMaxHalfW * (0.42 + 0.58 * pOpen) * widVar;

    for (let iu = 0; iu <= Nu; iu++) {
      const u = iu / Nu;

      const budRad = L * 0.23 * Math.sin(Math.PI * Math.pow(u, 0.78));
      const budFwd = L * (0.04 + 0.96 * u);

      const openRad =
        L *
        (0.13 * u +
          0.82 * Math.sin(u * Math.PI * 0.52) +
          0.08 * u * u);
      const recurve = Math.pow(Math.max(0, u - 0.44) / 0.56, 1.85);
      const openFwd = L * (0.48 * Math.sin(u * Math.PI * 0.74) - 0.36 * recurve);

      const radDist = budRad + (openRad - budRad) * pOpen;
      const fwdDist =
        budFwd +
        (openFwd - budFwd) * pOpen +
        whorlZ * L +
        pFlutter * Math.pow(u, 1.6);

      const lance = Math.sin(Math.PI * Math.pow(u, 0.66));
      const halfW = W * (0.11 + 0.89 * Math.pow(Math.max(0, lance), 0.80));

      const tiltMix = 0.25 + 0.75 * pOpen;
      const baseNx = forward[0] * tiltMix + radX * (1 - tiltMix * 0.4);
      const baseNy = forward[1] * tiltMix + radY * (1 - tiltMix * 0.4);
      const baseNz = forward[2] * tiltMix + radZ * (1 - tiltMix * 0.4);

      for (let iv = -Nv; iv <= Nv; iv++) {
        const v = iv / Nv;
        const absV = Math.abs(v);

        const cup = (1 - v * v) * 0.085 * L * Math.sin(Math.PI * u) * (0.35 + 0.65 * pOpen);
        const ruffle = Math.sin(u * 14 + p * 1.7) * 0.022 * L * v * v * pOpen;

        const px = hx + radX * radDist + forward[0] * (fwdDist - cup + ruffle) + tanX * (v * halfW);
        const py = hy + radY * radDist + forward[1] * (fwdDist - cup + ruffle) + tanY * (v * halfW);
        const pz = hz + radZ * radDist + forward[2] * (fwdDist - cup + ruffle) + tanZ * (v * halfW);

        const nX = baseNx + tanX * (v * 0.35);
        const nY = baseNy + tanY * (v * 0.35);
        const nZ = baseNz + tanZ * (v * 0.35);
        const nLen = Math.hypot(nX, nY, nZ) || 1;
        const dotL = (nX * lx + nY * ly + nZ * lz) / nLen;

        const throatAO = 0.42 + 0.58 * clamp(u / 0.30, 0, 1);
        const rimGlow = Math.pow(absV, 2.2) * 0.28 + Math.pow(u, 3.0) * 0.16;
        const shade = clamp((0.52 + 0.48 * dotL) * throatAO + rimGlow, 0.08, 1.0);

        const veinWave = 0.5 + 0.5 * Math.cos(v * Math.PI * 5.0);
        const midCrease = Math.max(0, 1 - absV * 5.5);

        let rgb = samplePetalColor(pal, u, shade, absV);

        if (pOpen < 0.34 && isOuter && u < 0.68) {
          const greenMix = (1 - pOpen / 0.34) * (1 - u / 0.68) * (0.45 + 0.55 * midCrease);
          rgb = mixRgb(rgb, FOLIAGE_PALETTE.leafMid, greenMix * 0.72);
        }

        if (flowerSpec.hasSpots && pal.spot && pOpen > 0.22 && u > 0.15 && u < 0.58 && absV < 0.62) {
          const su = Math.floor(u * 26);
          const sv = Math.floor((v + 1) * 10);
          if (hash2(su + p * 31, sv + flowerIdx * 17) > 0.84) {
            rgb = mixRgb(rgb, pal.spot, 0.82);
          }
        }

        const col = (px / engine.cellW) | 0;
        const row = (py / engine.cellH) | 0;
        const shimmer = Math.sin(col * 0.27 + row * 0.21 + time * 2.1 + flowerSpec.windPhase);

        const mat = u < 0.16 ? MAT_THROAT : MAT_PETAL;
        const charCode = selectAsciiCode(
          mat,
          shade,
          absV,
          u,
          veinWave * 0.55 + midCrease * 0.45,
          shimmer,
          0
        );

        const lumFlux = 0.94 + shimmer * 0.06;
        engine.plotCell(
          col,
          row,
          pz,
          clamp((rgb[0] * lumFlux) | 0, 0, 255),
          clamp((rgb[1] * lumFlux) | 0, 0, 255),
          clamp((rgb[2] * lumFlux) | 0, 0, 255),
          charCode
        );
      }
    }
  }

  // 2. Render 6 curved stamens + golden/rust pollen anthers + central pistil when open
  if (openAvg > 0.24) {
    const stamenGrow = clamp((openAvg - 0.24) / 0.65, 0, 1);
    const stamenLen = petalLen * 0.66 * stamenGrow;
    const stamenSteps = Math.max(8, Math.ceil(stamenLen / (engine.cellW * 0.45)));

    for (let s = 0; s < 6; s++) {
      const ang = (s / 6) * Math.PI * 2 + 0.52;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const dirX = cs * right[0] + sn * up[0];
      const dirY = cs * right[1] + sn * up[1];
      const dirZ = cs * right[2] + sn * up[2];

      const spread = 0.34 * stamenLen;
      const sway = Math.sin(time * 2.5 + s + flowerSpec.windPhase) * 2.2 * stamenGrow;

      let prevX = hx;
      let prevY = hy;

      for (let k = 1; k <= stamenSteps; k++) {
        const t = k / stamenSteps;
        const archOut = Math.sin(t * Math.PI * 0.65) * spread + sway * t;
        const archFwd = t * stamenLen * 0.88;

        const sx = hx + dirX * archOut + forward[0] * archFwd;
        const sy = hy + dirY * archOut + forward[1] * archFwd;
        const sz = hz + dirZ * archOut + forward[2] * archFwd - 3.2;

        const dx = sx - prevX;
        const dy = sy - prevY;
        const slope = Math.abs(dy) > 0.01 ? dx / dy : 0;
        prevX = sx;
        prevY = sy;

        if (k >= stamenSteps - 1) {
          const antherOffsets = [
            [0, 0],
            [engine.cellW * 0.45, 0],
            [-engine.cellW * 0.45, 0],
          ];
          for (let a = 0; a < antherOffsets.length; a++) {
            const ax = sx + antherOffsets[a][0];
            const ay = sy + antherOffsets[a][1];
            const col = (ax / engine.cellW) | 0;
            const row = (ay / engine.cellH) | 0;
            const shim = Math.sin(col * 0.4 + time * 2.8);
            const code = selectAsciiCode(MAT_ANTHER, 0.85 - a * 0.15, 0, 0, 0, shim, 0);
            engine.plotCell(col, row, sz - 1.5, pal.anther[0], pal.anther[1], pal.anther[2], code);
          }
        } else {
          const filRgb = mixRgb(pal.throat, pal.filament, t);
          const col = (sx / engine.cellW) | 0;
          const row = (sy / engine.cellH) | 0;
          const fCode = selectAsciiCode(MAT_STEM, 0.65, 0, t, 0, 0, slope);
          engine.plotCell(col, row, sz, filRgb[0], filRgb[1], filRgb[2], fCode);
        }
      }
    }

    const pistilLen = stamenLen * 1.12;
    const pSteps = Math.max(6, Math.ceil(pistilLen / (engine.cellW * 0.5)));
    for (let k = 1; k <= pSteps; k++) {
      const t = k / pSteps;
      const px = hx + forward[0] * (t * pistilLen);
      const py = hy + forward[1] * (t * pistilLen) + t * t * 3;
      const pz = hz + forward[2] * (t * pistilLen) - 2.5;
      const isStigma = k === pSteps;
      const pRgb = isStigma
        ? mixRgb(pal.filament, [255, 250, 210], 0.5)
        : mixRgb(FOLIAGE_PALETTE.leafMid, pal.filament, t * 0.7);
      engine.plotPixel(px, py, pz, pRgb[0], pRgb[1], pRgb[2], isStigma ? 42 : 124);
    }
  }
}
