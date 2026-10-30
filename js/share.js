// Pictures of a scorecard or arrow plot, drawn on a canvas so they can be shared or saved.

import { ROUNDS, roundStats, sortArrows, labelClass, hasX, isPractice } from './rules.js';
import { singleSpotSVG, markerSVG, plotted, groupCentre, centreSVG, describeOffset } from './face.js';

// Pictures always use the light theme, so they look the same wherever they're opened.
const INK = '#15202b', MUTED = '#5f6b78', LINE = '#d5dbe2', BAND = '#e8ecf1', PAPER = '#ffffff';
const CHIP = {
  'z-gold': ['#ffe047', '#1d1d1f'], 'z-red': ['#e8343c', '#ffffff'], 'z-blue': ['#14a0d8', '#ffffff'],
  'z-black': ['#1d1d1f', '#ffffff'], 'z-white': ['#ffffff', '#1d1d1f'], 'z-miss': ['#8a939d', '#ffffff'],
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// An image can't see the page's stylesheet, so the plot's colours are repeated here.
const PLOT_STYLE = '<style>.boss{fill:#d9d4c7}.mk circle{fill:rgba(20,38,59,.6);stroke:#fff;stroke-width:.06}' +
  '.centre{stroke:#00c853;stroke-width:.35;stroke-linecap:round;fill:none}</style>';

// Every plotted arrow on one spot, with a cross at the group's centre.
export function plotSVG(face, arrows, attrs = '') {
  const dots = plotted(arrows).map(a => markerSVG(face, a, { cls: 'mk dot', r: 0.45, single: true })).join('');
  return singleSpotSVG(face, dots + centreSVG(groupCentre(arrows)), attrs);
}

async function svgImage(svg) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  try { await img.decode(); } finally { URL.revokeObjectURL(url); }
  return img;
}

const plotImage = (face, arrows, size) =>
  svgImage(plotSVG(face, arrows, `width="${size}" height="${size}"`).replace(/<\/svg>$/, PLOT_STYLE + '</svg>'));

const toPNG = canvas => new Promise((resolve, reject) =>
  canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png'));

export async function plotPNG(face, arrows, size = 1080) {
  const img = await plotImage(face, arrows, size);
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  canvas.getContext('2d').drawImage(img, 0, 0, size, size);
  return toPNG(canvas);
}

const W = 1080, PAD = 60, CHIP_W = 64, CHIP_H = 44, GAP = 8, COL_END = 90, COL_NUM = 120, PLOT = 640;

// Draws one line of text. With `max`, the text shrinks until it fits that width.
function text(ctx, s, x, y, { size = 28, weight = 400, color = INK, align = 'left', max = Infinity } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (size > 16 && ctx.measureText(s).width > max) ctx.font = `${weight} ${size -= 2}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

function chip(ctx, v, x, y) {
  const [bg, fg] = CHIP[labelClass(v)];
  ctx.beginPath();
  ctx.roundRect(x, y, CHIP_W, CHIP_H, 10);
  ctx.fillStyle = bg;
  ctx.fill();
  if (bg === '#ffffff') { ctx.strokeStyle = '#b9c1ca'; ctx.lineWidth = 2; ctx.stroke(); }
  text(ctx, v, x + CHIP_W / 2, y + CHIP_H / 2 + 1, { size: 24, weight: 800, color: fg, align: 'center' });
}

// The whole scorecard as one tall picture: heading lines, totals, every end, and the arrow plot.
export async function scorecardPNG(round, { heading, lines = [] }) {
  const st = roundStats(round);
  const practice = isPractice(round);
  const perHalf = practice ? Infinity : ROUNDS[round.type].ends / ROUNDS[round.type].halves;
  const arrowsX = PAD + COL_END;
  const perLine = Math.max(1, Math.floor((W - PAD * 2 - COL_END - COL_NUM * 2 + GAP) / (CHIP_W + GAP)));
  const arrows = round.ends.flat();
  const plot = plotted(arrows).length ? await plotImage(round.face, arrows, PLOT * 2) : null;
  const summary = practice
    ? [`${st.pct}%`, `${st.arrows} arrows`, `${st.avg.toFixed(2)} avg`]
    : [`${st.tens}×10`, ...(hasX(round.bow) ? [`${st.xs}X`] : []), `${st.misses} misses`, `${st.avg.toFixed(2)} avg`];

  // Drawn twice: once to measure the height, then for real on a canvas that size.
  const draw = ctx => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, ctx.canvas.height);
    let y = PAD;
    text(ctx, heading, PAD, y + 24, { size: 44, weight: 800, max: W - PAD * 2 });
    y += 64;
    for (const line of lines) { text(ctx, line, PAD, y + 18, { size: 28, color: MUTED, max: W - PAD * 2 }); y += 42; }
    y += 24;
    const w = text(ctx, String(st.total), PAD, y + 60, { size: 120, weight: 800 });
    text(ctx, ` / ${st.maxScore}`, PAD + w, y + 74, { size: 44, color: MUTED });
    y += 130;
    text(ctx, summary.join('  ·  '), PAD, y + 18, { size: 30, color: MUTED });
    y += 70;

    const numX = W - PAD - COL_NUM - 16, runX = W - PAD - 16;
    const band = (h, labels) => {
      ctx.fillStyle = BAND;
      ctx.fillRect(PAD, y, W - PAD * 2, h);
      for (const [s, x, opts] of labels) text(ctx, s, x, y + h / 2, opts);
      y += h;
    };
    const head = { size: 22, weight: 700, color: MUTED };
    band(50, [['END', PAD + COL_END / 2, { ...head, align: 'center' }], ['ARROWS', arrowsX, head],
      ['END', numX, { ...head, align: 'right' }], ['TOTAL', runX, { ...head, align: 'right' }]]);
    round.ends.forEach((end, i) => {
      if (!end.length) return;
      const rows = Math.ceil(end.length / perLine);
      const h = rows * (CHIP_H + GAP) - GAP + 16;
      ctx.fillStyle = LINE;
      ctx.fillRect(PAD, y, W - PAD * 2, 2);
      text(ctx, String(i + 1), PAD + COL_END / 2, y + h / 2, { color: MUTED, align: 'center' });
      sortArrows(end).forEach((a, k) =>
        chip(ctx, a.v, arrowsX + (k % perLine) * (CHIP_W + GAP), y + 8 + Math.floor(k / perLine) * (CHIP_H + GAP)));
      text(ctx, String(st.endTotals[i]), numX, y + h / 2, { weight: 700, align: 'right' });
      text(ctx, String(st.running[i]), runX, y + h / 2, { color: MUTED, align: 'right' });
      y += h;
      if ((i + 1) % perHalf === 0) {
        const half = (i + 1) / perHalf;
        band(48, [[`Half ${half}`, numX, { weight: 700, align: 'right' }],
          [String(st.halfTotals[half - 1]), runX, { weight: 700, align: 'right' }]]);
      }
    });
    y += 40;

    if (plot) {
      ctx.drawImage(plot, (W - PLOT) / 2, y, PLOT, PLOT);
      y += PLOT + 32;
      text(ctx, describeOffset(groupCentre(arrows)), W / 2, y, { size: 26, color: MUTED, align: 'center' });
      y += 40;
    }
    text(ctx, 'Archery Scoring', W / 2, y + 20, { size: 22, color: MUTED, align: 'center' });
    return y + 40 + PAD;
  };

  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: 1 });
  canvas.height = draw(canvas.getContext('2d'));
  draw(canvas.getContext('2d'));
  return toPNG(canvas);
}

// Opens the phone's share menu with the file, or downloads it where files can't be shared.
// Returns false if it was downloaded instead.
export async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    return true;
  }
  saveFile(blob, name);
  return false;
}

export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const canShareFiles = () =>
  !!navigator.canShare?.({ files: [new File([''], 'plot.png', { type: 'image/png' })] });
