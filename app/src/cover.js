// Neon Coast Cover Studio — the cover engine: draws the multi-panel poster, the colour
// grade, the grain and vignette, and the title block onto any canvas. Every draw is a pure
// function of the state and the loaded photos, so the same state always draws the same art.

import { LAYOUTS, GRADES, SIZES } from './state.js';

/** The white gutter between panels, as a fraction of the cover's short side. */
const GUTTER = 0.012;

/** A tiny deterministic PRNG (mulberry32) so the grain is identical on every draw. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One shared grain tile, built once from a fixed seed. */
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(160, 160);
  const rand = mulberry32(20261119);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/** Panel rectangles in pixels for a layout, with gutters cut between neighbours. */
export function layoutRects(layoutKey, w, h) {
  const g = Math.max(2, Math.round(Math.min(w, h) * GUTTER));
  return LAYOUTS[layoutKey].panels.map(([fx, fy, fw, fh]) => {
    const x = fx * w + (fx > 0 ? g / 2 : 0);
    const y = fy * h + (fy > 0 ? g / 2 : 0);
    const rw = fw * w - (fx > 0 ? g / 2 : 0) - (fx + fw < 1 ? g / 2 : 0);
    const rh = fh * h - (fy > 0 ? g / 2 : 0) - (fy + fh < 1 ? g / 2 : 0);
    return { x, y, w: rw, h: rh };
  });
}

/**
 * Draws one photo into a panel rect, cover-fit, at the panel's zoom with its pan offset.
 * `ox`/`oy` are fractions of the panel's width/height, so a crop survives any export size.
 * While a panel is unpanned, the photo's focus point (its subject's face) is centred in
 * the panel instead of the photo's middle, so wide panels never crop a face off.
 */
export function drawPanelPhoto(ctx, img, rect, panel) {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * panel.zoom;
  const pw = img.naturalWidth * scale;
  const ph = img.naturalHeight * scale;
  let dx = rect.x + (rect.w - pw) / 2 + panel.ox * rect.w;
  let dy = rect.y + (rect.h - ph) / 2 + panel.oy * rect.h;
  const focus = img._focus;
  if (focus && panel.ox === 0 && panel.oy === 0) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (pw > rect.w) dx = clamp(rect.x + rect.w / 2 - focus.x * pw, rect.x + rect.w - pw, rect.x);
    if (ph > rect.h) dy = clamp(rect.y + rect.h / 2 - focus.y * ph, rect.y + rect.h - ph, rect.y);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, pw, ph);
  ctx.restore();
}

/** Lays a grade's tint gradient over a panel rect. */
export function gradePanel(ctx, rect, grade) {
  const tint = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  tint.addColorStop(0, grade.top);
  tint.addColorStop(1, grade.bottom);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = tint;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/** The grain and the vignette that finish every cover. */
export function finishCover(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  const vig = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.45,
    w / 2, h / 2, Math.max(w, h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(10, 4, 20, 0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

/** Fits a one- or two-line title to the width, returning the font size used. */
export function fitTitle(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 16) {
    size -= 2;
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
  }
  return size;
}

/** Splits a title into at most two lines that each fit the width. */
export function wrapTitle(ctx, text, maxWidth, size) {
  ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) { line = next; continue; }
    if (line) lines.push(line);
    line = word;
    if (lines.length === 1) break;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

/** The title block: a scrim, the script subtitle, and the big gradient title. */
export function drawTitleBlock(ctx, w, h, state) {
  const title = state.title.trim().toUpperCase();
  const subtitle = state.subtitle.trim();
  if (!title && !subtitle) return;
  const bandH = h * 0.34;
  const scrim = ctx.createLinearGradient(0, h - bandH, 0, h);
  scrim.addColorStop(0, 'rgba(12, 4, 24, 0)');
  scrim.addColorStop(0.55, 'rgba(12, 4, 24, 0.55)');
  scrim.addColorStop(1, 'rgba(12, 4, 24, 0.82)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, h - bandH, w, bandH);

  const margin = w * 0.055;
  const maxW = w - margin * 2;
  let titleSize = Math.round(h * 0.105);
  if (title) titleSize = fitTitle(ctx, title, maxW, titleSize);
  const lines = title ? wrapTitle(ctx, title, maxW, titleSize) : [];
  const lineH = titleSize * 0.98;
  const subSize = Math.round(h * 0.042);
  let baseline = h - h * 0.045 - (lines.length - 1) * lineH;
  if (!title) baseline = h - h * 0.06;

  if (subtitle) {
    ctx.save();
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(255, 46, 136, 0.9)';
    ctx.shadowBlur = subSize * 0.55;
    ctx.fillStyle = '#ff9ed2';
    const subY = baseline - lines.length * lineH - subSize * 0.55;
    ctx.fillText(subtitle, w / 2, subY);
    ctx.restore();
  }
  if (title) {
    ctx.save();
    ctx.font = `${titleSize}px Anton, 'Arial Narrow', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const grad = ctx.createLinearGradient(0, baseline - lines.length * lineH, 0, baseline);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#ffd76a');
    grad.addColorStop(1, '#ff5e8a');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(20, 4, 32, 0.9)';
    ctx.lineWidth = Math.max(2, titleSize * 0.09);
    ctx.fillStyle = grad;
    lines.forEach((line, i) => {
      const y = baseline - (lines.length - 1 - i) * lineH;
      ctx.strokeText(line, w / 2, y);
      ctx.fillText(line, w / 2, y);
    });
    ctx.restore();
  }
}

/** The heat-meter badge: five stars in a pill, top right. */
export function drawHeatBadge(ctx, w, h, stars) {
  const size = Math.round(Math.min(w, h) * 0.032);
  const pad = size * 0.55;
  const gap = size * 0.18;
  const text = '★'.repeat(Math.max(0, Math.min(5, stars)));
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  const textW = ctx.measureText(text).width;
  const pillW = textW + pad * 2 + gap * 4;
  const pillH = size + pad * 1.1;
  const x = w - pillW - w * 0.03;
  const y = h * 0.03;
  ctx.fillStyle = 'rgba(12, 4, 24, 0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + pad, y + pillH / 2 + 1);
  ctx.restore();
}

/** The white poster frame: a bold outer border and a hairline inner one. */
export function drawPosterFrame(ctx, w, h) {
  const outer = Math.max(4, Math.round(Math.min(w, h) * 0.008));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = outer;
  ctx.strokeRect(outer / 2, outer / 2, w - outer, h - outer);
  const inner = Math.max(2, Math.round(outer * 0.28));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = inner;
  const inset = outer * 2.2;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
}

/**
 * Draws the whole cover onto the canvas at its own pixel size.
 * `photos` maps a panel key ('sample:<id>' or 'upload:<id>') to a loaded image.
 */
export function drawCover(canvas, state, photos) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const grade = GRADES[state.grade];
  ctx.fillStyle = '#160a24';
  ctx.fillRect(0, 0, w, h);
  const rects = layoutRects(state.layout, w, h);
  rects.forEach((rect, i) => {
    const panel = state.panels[i];
    if (!panel) return;
    const img = photos.get(panel.key);
    if (img) {
      ctx.save();
      ctx.filter = grade.filter;
      drawPanelPhoto(ctx, img, rect, panel);
      ctx.restore();
      gradePanel(ctx, rect, grade);
    } else {
      ctx.fillStyle = '#241533';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  });
  drawTitleBlock(ctx, w, h, state);
  drawHeatBadge(ctx, w, h, state.stars);
  finishCover(ctx, w, h);
  drawPosterFrame(ctx, w, h);
}

/**
 * Renders the cover at a post size onto a fresh canvas and hands back a PNG blob.
 * Used by the Export button; the same draw path paints the on-screen preview.
 */
export function exportCover(state, photos, sizeKey) {
  const size = SIZES[sizeKey];
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  drawCover(canvas, state, photos);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve({ blob, w: size.w, h: size.h }), 'image/png');
  });
}

/** Waits until the vendored display fonts are ready to draw with. */
export async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
    ]);
    await document.fonts.ready;
  } catch {
    // A missing font falls back to the sans-serif stack; the cover still draws.
  }
}
