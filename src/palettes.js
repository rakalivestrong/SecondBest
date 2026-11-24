/**
 * Botanical color palettes and procedural ASCII character selection.
 */

export const ASCII_RAMP = ' .,:;!|+~=*#%@';
export const ASCII_CODES = Array.from(ASCII_RAMP, (ch) => ch.charCodeAt(0));

// Material tags stored in the ASCII cell buffer
export const MAT_EMPTY = 0;
export const MAT_STEM = 1;
export const MAT_LEAF = 2;
export const MAT_PETAL = 3;
export const MAT_THROAT = 4;
export const MAT_ANTHER = 5;

/**
 * Multi-stop botanical palettes for lily varieties.
 * Each stop is [r, g, b].
 */
export const LILY_PALETTES = {
  crimson: {
    throat: [78, 6, 22],
    shadow: [148, 12, 40],
    mid: [216, 22, 58],
    bright: [248, 68, 98],
    edge: [255, 174, 192],
    spot: [54, 4, 16],
    anther: [248, 172, 38],
    filament: [232, 118, 134],
    glow: [228, 32, 68],
  },
  red: {
    throat: [94, 8, 12],
    shadow: [176, 18, 26],
    mid: [238, 40, 44],
    bright: [255, 96, 76],
    edge: [255, 198, 172],
    spot: [68, 6, 10],
    anther: [255, 202, 54],
    filament: [244, 146, 124],
    glow: [246, 52, 42],
  },
  magenta: {
    throat: [86, 6, 52],
    shadow: [164, 16, 94],
    mid: [228, 30, 136],
    bright: [252, 106, 186],
    edge: [255, 224, 242],
    spot: [72, 4, 36],
    anther: [245, 148, 34],
    filament: [246, 168, 208],
    glow: [238, 46, 150],
  },
  pink: {
    throat: [134, 26, 70],
    shadow: [204, 72, 126],
    mid: [248, 122, 176],
    bright: [255, 180, 214],
    edge: [255, 240, 248],
    spot: [152, 34, 84],
    anther: [248, 182, 56],
    filament: [255, 212, 228],
    glow: [250, 128, 184],
  },
  orange: {
    throat: [110, 26, 4],
    shadow: [196, 58, 10],
    mid: [250, 98, 20],
    bright: [255, 158, 52],
    edge: [255, 226, 148],
    spot: [84, 18, 6],
    anther: [216, 68, 16],
    filament: [255, 190, 108],
    glow: [255, 118, 26],
  },
  yellow: {
    throat: [108, 64, 4],
    shadow: [196, 134, 14],
    mid: [244, 192, 26],
    bright: [255, 226, 82],
    edge: [255, 250, 186],
    spot: [132, 62, 6],
    anther: [228, 96, 18],
    filament: [246, 232, 132],
    glow: [250, 204, 42],
  },
  white: {
    throat: [96, 138, 42],
    shadow: [148, 162, 172],
    mid: [216, 224, 232],
    bright: [244, 248, 252],
    edge: [255, 255, 255],
    spot: null,
    anther: [244, 142, 26],
    filament: [216, 234, 196],
    glow: [220, 238, 214],
  },
};

export const FOLIAGE_PALETTE = {
  stemDark: [18, 72, 34],
  stemMid: [44, 152, 66],
  stemBright: [110, 212, 92],
  leafDeep: [14, 62, 28],
  leafShadow: [24, 108, 46],
  leafMid: [42, 166, 70],
  leafBright: [98, 212, 94],
  leafEdge: [168, 240, 138],
};

/**
 * Linearly interpolate between two RGB triples.
 * @param {number[]} c0
 * @param {number[]} c1
 * @param {number} t
 * @returns {[number, number, number]}
 */
export function mixRgb(c0, c1, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    (c0[0] + (c1[0] - c0[0]) * k) | 0,
    (c0[1] + (c1[1] - c0[1]) * k) | 0,
    (c0[2] + (c1[2] - c0[2]) * k) | 0,
  ];
}

/**
 * Multi-stop color gradient for a lily petal.
 * @param {typeof LILY_PALETTES.crimson} pal
 * @param {number} u Normalized longitudinal distance (0 = center throat, 1 = tip)
 * @param {number} shade Lighting intensity [0..1]
 * @param {number} edge Edge proximity [0..1]
 * @returns {[number, number, number]}
 */
export function samplePetalColor(pal, u, shade, edge) {
  let r;
  let g;
  let b;

  if (u < 0.24) {
    const t = u / 0.24;
    [r, g, b] = mixRgb(pal.throat, pal.shadow, t);
  } else if (u < 0.56) {
    const t = (u - 0.24) / 0.32;
    [r, g, b] = mixRgb(pal.shadow, pal.mid, t);
  } else if (u < 0.84) {
    const t = (u - 0.56) / 0.28;
    [r, g, b] = mixRgb(pal.mid, pal.bright, t);
  } else {
    const t = (u - 0.84) / 0.16;
    [r, g, b] = mixRgb(pal.bright, pal.edge, t);
  }

  // Boost along illuminated lateral margins for crisp petal separation
  if (edge > 0.55) {
    const rim = ((edge - 0.55) / 0.45) * (0.35 + 0.55 * shade);
    [r, g, b] = mixRgb([r, g, b], pal.edge, rim * 0.72);
  }

  // Apply shading modulation without crushing rich colors to gray
  const lumScale = 0.54 + 0.56 * shade;
  return [
    Math.min(255, Math.max(0, (r * lumScale) | 0)),
    Math.min(255, Math.max(0, (g * lumScale) | 0)),
    Math.min(255, Math.max(0, (b * lumScale) | 0)),
  ];
}

const PETAL_EDGE_CODES = [46, 44, 58, 59, 126]; // . , : ; ~
const PETAL_BODY_CODES = [46, 44, 58, 59, 126, 43, 61, 42, 35, 37, 64]; // . , : ; ~ + = * # % @

/**
 * Choose an ASCII character code based on geometry, shading, edge proximity,
 * center distance, and subtle spatio-temporal shimmer.
 *
 * @param {number} mat
 * @param {number} shade [0..1]
 * @param {number} edge [0..1] (1 = outer rim)
 * @param {number} u [0..1] (0 = flower center, 1 = petal tip)
 * @param {number} vein [0..1] (petal striation texture)
 * @param {number} shimmer [-1..1]
 * @param {number} slopeRatio dx/dy for directional stem/vein glyphs
 * @returns {number} charCode
 */
export function selectAsciiCode(mat, shade, edge, u, vein, shimmer, slopeRatio) {
  if (mat === MAT_STEM) {
    if (slopeRatio < -0.32) return 47; // '/'
    if (slopeRatio > 0.32) return 92; // '\'
    if (shade > 0.68) return 124; // '|'
    if (shade > 0.42) return 33; // '!'
    return 58; // ':'
  }

  if (mat === MAT_ANTHER) {
    if (shade > 0.72) return 64; // '@'
    if (shade > 0.48) return 35; // '#'
    if (shade > 0.25) return 37; // '%'
    return 42; // '*'
  }

  if (mat === MAT_THROAT) {
    const idx = Math.min(10, Math.max(7, Math.round(8.5 + (1 - shade) * 2 + shimmer * 0.45)));
    return PETAL_BODY_CODES[idx];
  }

  if (mat === MAT_LEAF) {
    if (edge > 0.80) {
      return shimmer > 0 ? 58 : 46; // ':' or '.'
    }
    if (vein > 0.82) {
      if (slopeRatio < -0.28) return 47; // '/'
      if (slopeRatio > 0.28) return 92; // '\'
      return 126; // '~'
    }
    const density = 9.0 - shade * 4.2 + shimmer * 0.45;
    const idx = Math.min(9, Math.max(2, Math.round(density)));
    return PETAL_BODY_CODES[idx];
  }

  // MAT_PETAL
  // Illuminated petal edges -> delicate lighter glyphs (.,:;~)
  if (edge > 0.72 || (u > 0.88 && shade > 0.46)) {
    const edgeLight = (1 - edge) * 2.8 + (1 - shade) * 1.8 + shimmer * 0.5;
    const idx = Math.min(4, Math.max(0, Math.round(edgeLight)));
    return PETAL_EDGE_CODES[idx];
  }

  // Near flower center (u < 0.28) or deep petal shadows -> denser glyphs (=*#%@)
  const centerWeight = Math.max(0, 1 - u / 0.32);
  const shadowWeight = 1 - shade;
  const densityScore =
    3.6 +
    centerWeight * 4.2 +
    shadowWeight * 3.4 +
    vein * 1.2 +
    shimmer * 0.5;

  const idx = Math.min(10, Math.max(1, Math.round(densityScore)));
  return PETAL_BODY_CODES[idx];
}
