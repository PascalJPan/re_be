/**
 * Derive a color from squiggle endpoint position using a radial color wheel.
 * Angle from center → hue, distance from center → saturation.
 * @param {Array<{x: number, y: number}>} points - normalized [0,1] squiggle points
 * @returns {string} hex color string like "#ff4422"
 */
export function sampleColor(points) {
  if (!points.length) return '#808080';

  const last = points[points.length - 1];
  const dx = last.x - 0.5;
  const dy = last.y - 0.5;

  const angle = Math.atan2(dy, dx); // radians
  const hue = ((angle * 180 / Math.PI) + 360) % 360;

  const distance = Math.sqrt(dx * dx + dy * dy);
  const saturation = Math.min(distance / 0.5, 1.0); // 0 at center, 1 at edge

  const lightness = 0.5;

  return hslToHex(hue, saturation, lightness);
}

/**
 * Convert HSL values to a hex color string.
 * @param {number} h - hue (0-360)
 * @param {number} s - saturation (0-1)
 * @param {number} l - lightness (0-1)
 * @returns {string} hex color like "#ff4422"
 */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
