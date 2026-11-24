/**
 * Stem and Leaf Geometry & ASCII Rasterizer.
 * Generates organic cubic Bézier stems that sway gently (more at the top than base)
 * and lanceolate lily leaves with central midribs, visible ASCII texture,
 * independent wind lag, and cursor proximity deflection.
 */

import {
  FOLIAGE_PALETTE,
  MAT_LEAF,
  MAT_STEM,
  mixRgb,
  selectAsciiCode,
} from './palettes.js';

function cubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return uuu * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + ttt * p3;
}

/**
 * Render an arching lanceolate lily leaf onto the ASCII grid.
 */
export function renderLeaf(
  engine,
  rootX,
  rootY,
  rootZ,
  baseAngle,
  lengthPx,
  widthPx,
  droop,
  growth,
  windOffsetX,
  windOffsetY,
  cursor,
  bouquetScale,
  time,
  phase
) {
  if (growth <= 0.04) return;

  const actualLen = lengthPx * (0.2 + 0.8 * growth);
  const actualW = widthPx * (0.3 + 0.7 * growth);

  const dirX = Math.cos(baseAngle);
  const dirY = Math.sin(baseAngle);
  const approxTipX = rootX + dirX * actualLen * 0.85;
  const approxTipY = rootY + dirY * actualLen * 0.85 + droop * actualLen * 0.3;
  const cursorDefl = cursor.sampleLeafDeflection(approxTipX, approxTipY, bouquetScale);

  const stepsU = Math.max(18, Math.ceil(actualLen / (engine.cellW * 0.45)));
  const stepsV = Math.max(8, Math.ceil((actualW * 2) / (engine.cellW * 0.45)));

  const perpX = -dirY;
  const perpY = dirX;

  for (let iu = 0; iu <= stepsU; iu++) {
    const u = iu / stepsU;
    const tipInfluence = u * u;
    const swayX = windOffsetX * tipInfluence + cursorDefl.dx * tipInfluence;
    const swayY = windOffsetY * tipInfluence + cursorDefl.dy * tipInfluence;

    const spineX = rootX + dirX * (u * actualLen) + swayX;
    const spineY =
      rootY +
      dirY * (u * actualLen) +
      droop * actualLen * (u * u * 0.62) +
      swayY;
    const spineZ = rootZ + Math.sin(u * Math.PI * 0.75) * (actualLen * 0.14);

    const du = 0.05;
    const uNext = Math.min(1, u + du);
    const nextX = rootX + dirX * (uNext * actualLen) + windOffsetX * uNext * uNext;
    const nextY =
      rootY +
      dirY * (uNext * actualLen) +
      droop * actualLen * (uNext * uNext * 0.62);
    const ddx = nextX - spineX;
    const ddy = nextY - spineY;
    const slopeRatio = Math.abs(ddy) > 0.01 ? ddx / ddy : 0;

    const profile = Math.sin(Math.PI * Math.pow(u, 0.72));
    const halfW = actualW * (0.14 + 0.86 * Math.pow(Math.max(0, profile), 0.78));

    for (let iv = -stepsV; iv <= stepsV; iv++) {
      const v = iv / stepsV;
      const absV = Math.abs(v);

      const px = spineX + perpX * (v * halfW);
      const py = spineY + perpY * (v * halfW);
      const foldZ = (1 - absV) * 5.0;
      const pz = spineZ - foldZ;

      const lightTilt = v * -0.25 + (1 - u) * 0.12 + 0.58;
      const midrib = Math.max(0, 1 - absV * 4.5);
      const shade = Math.min(1, Math.max(0.12, lightTilt - midrib * 0.12 + (1 - absV) * 0.12));

      let rgb;
      if (midrib > 0.55) {
        rgb = mixRgb(FOLIAGE_PALETTE.leafBright, FOLIAGE_PALETTE.leafEdge, (midrib - 0.55) * 1.6);
      } else if (absV > 0.72) {
        rgb = mixRgb(FOLIAGE_PALETTE.leafMid, FOLIAGE_PALETTE.leafEdge, (absV - 0.72) * 2.4 * shade);
      } else if (shade < 0.45) {
        rgb = mixRgb(FOLIAGE_PALETTE.leafDeep, FOLIAGE_PALETTE.leafShadow, shade / 0.45);
      } else {
        rgb = mixRgb(FOLIAGE_PALETTE.leafShadow, FOLIAGE_PALETTE.leafBright, (shade - 0.45) / 0.55);
      }

      const col = (px / engine.cellW) | 0;
      const row = (py / engine.cellH) | 0;
      const shimmer = Math.sin(col * 0.24 + row * 0.19 + time * 1.9 + phase);

      const charCode = selectAsciiCode(
        MAT_LEAF,
        shade,
        absV,
        u,
        midrib,
        shimmer,
        slopeRatio
      );

      const lumBoost = 0.94 + shimmer * 0.06;
      engine.plotCell(
        col,
        row,
        pz,
        Math.min(255, (rgb[0] * lumBoost) | 0),
        Math.min(255, (rgb[1] * lumBoost) | 0),
        Math.min(255, (rgb[2] * lumBoost) | 0),
        charCode
      );
    }
  }
}

/**
 * Compute deformed stem path, draw the stem onto the ASCII engine,
 * draw its attached leaves, and return the exact tip coordinates + tangent.
 */
export function renderFlowerStemAndLeaves(
  engine,
  flowerSpec,
  bloomState,
  spring,
  wind,
  cursor,
  dims,
  time
) {
  const { originX, originY, bouquetW, bouquetH, scale } = dims;
  const progress = bloomState.stemProgress;

  const baseX = originX + flowerSpec.baseNx * bouquetW;
  const baseY = originY;
  const baseZ = flowerSpec.nz * scale * 0.25;

  const waistX = originX + flowerSpec.waistNx * bouquetW;
  const waistY = originY - bouquetH * 0.22;

  const targetHeadX = originX + flowerSpec.nx * bouquetW;
  const targetHeadY = originY + flowerSpec.ny * bouquetH;
  const targetHeadZ = flowerSpec.nz * scale * 0.55;

  const ctrl1X = waistX + (baseX - waistX) * -0.4;
  const ctrl1Y = originY - bouquetH * 0.14;
  const ctrl2X = waistX + (targetHeadX - waistX) * 0.42;
  const ctrl2Y = waistY - (waistY - targetHeadY) * 0.55;

  const windSample = wind.sample(flowerSpec.nx, flowerSpec.ny, flowerSpec.windPhase);
  const windAmp = scale * 0.038;

  const evalStem = (t) => {
    const rawX = cubicBezier(baseX, ctrl1X, ctrl2X, targetHeadX, t);
    const rawY = cubicBezier(baseY, ctrl1Y, ctrl2Y, targetHeadY, t);
    const rawZ = baseZ + (targetHeadZ - baseZ) * Math.pow(t, 1.15);

    const flex = Math.pow(t, 1.65);
    const wx = windSample.wx * windAmp * flex;
    const wy = windSample.wy * windAmp * 0.45 * flex;

    const sx = spring.dx * flex;
    const sy = spring.dy * flex;

    return {
      x: rawX + wx + sx,
      y: rawY + wy + sy,
      z: rawZ,
    };
  };

  if (progress <= 0.01) {
    const p = evalStem(0);
    return { tipX: p.x, tipY: p.y, tipZ: p.z, tangentX: 0, tangentY: -1, swayX: 0 };
  }

  const totalLenEstimate = Math.hypot(targetHeadX - baseX, targetHeadY - baseY) * progress;
  const steps = Math.max(24, Math.ceil(totalLenEstimate / (engine.cellH * 0.38)));

  let prev = evalStem(0);
  let tip = prev;
  let prevTip = prev;

  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * progress;
    const curr = evalStem(t);
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const slopeRatio = Math.abs(dy) > 0.01 ? dx / dy : 0;

    const thickness = t < 0.45 ? 1 : 0;
    const col = (curr.x / engine.cellW) | 0;
    const row = (curr.y / engine.cellH) | 0;
    const shimmer = Math.sin(col * 0.3 + row * 0.2 + time * 1.6);

    const charMain = selectAsciiCode(MAT_STEM, 0.72, 0, t, 0, shimmer, slopeRatio);
    const mainRgb = mixRgb(FOLIAGE_PALETTE.stemMid, FOLIAGE_PALETTE.stemBright, 0.35 + 0.35 * t);
    engine.plotCell(col, row, curr.z, mainRgb[0], mainRgb[1], mainRgb[2], charMain);

    if (thickness > 0) {
      const charShadow = selectAsciiCode(MAT_STEM, 0.32, 0, t, 0, shimmer, slopeRatio);
      const shadowRgb = mixRgb(FOLIAGE_PALETTE.stemDark, FOLIAGE_PALETTE.stemMid, 0.5);
      engine.plotCell(col + 1, row, curr.z + 0.8, shadowRgb[0], shadowRgb[1], shadowRgb[2], charShadow);
    }

    prevTip = prev;
    prev = curr;
    tip = curr;
  }

  if (flowerSpec.leaves) {
    for (let li = 0; li < flowerSpec.leaves.length; li++) {
      const lf = flowerSpec.leaves[li];
      if (progress > lf.t) {
        const leafGrow = Math.min(1, (progress - lf.t) / 0.28);
        const anchor = evalStem(lf.t);
        const leafWind = wind.sample(flowerSpec.nx, -lf.t, lf.phase);
        const baseAngle = -Math.PI * 0.5 + lf.angleOffset;

        renderLeaf(
          engine,
          anchor.x,
          anchor.y,
          anchor.z - 1.5,
          baseAngle,
          lf.length * scale,
          lf.width * scale,
          lf.droop,
          leafGrow,
          leafWind.wx * scale * 0.024,
          leafWind.wy * scale * 0.014,
          cursor,
          scale,
          time,
          lf.phase
        );
      }
    }
  }

  const tdx = tip.x - prevTip.x;
  const tdy = tip.y - prevTip.y;
  const tLen = Math.max(0.001, Math.hypot(tdx, tdy));

  return {
    tipX: tip.x,
    tipY: tip.y,
    tipZ: tip.z,
    tangentX: tdx / tLen,
    tangentY: tdy / tLen,
    swayX: windSample.wx,
  };
}
