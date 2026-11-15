// Scoring from a photo of the target: lining each spot up with the photo, and finding it automatically.
// Face positions are in centimetres (as in face.js); photo positions are in the photo's pixels.
//
// Each spot in the photo is { x, y, L }: its centre, and the 2×2 map L that turns centimetres from
// that centre into photo pixels. Spots are fitted one by one, because a photo taken at an angle
// makes nearer spots look bigger than farther ones.

import { geometry } from './face.js';

// How far out each spot's edge handle sits: the edge of the blue on a full face (12cm), and the
// edge of a triple spot (10cm).
export const edgeCm = face => (face === 'triple40' ? 10 : 12);

// Centimetres from the spot's centre to the photo, and back.
export const spotToPhoto = (s, u, v) => ({ x: s.x + s.L[0][0] * u + s.L[0][1] * v, y: s.y + s.L[1][0] * u + s.L[1][1] * v });
export function photoToSpot(s, pt) {
  const [[a, b], [c, d]] = s.L;
  const det = a * d - b * c, x = pt.x - s.x, y = pt.y - s.y;
  return { x: (d * x - b * y) / det, y: (-c * x + a * y) / det };
}

// A first guess when the target can't be found: the face across the middle of the photo.
export function defaultSpots(face, w, h) {
  const scale = face === 'triple40' ? Math.min((h * 0.8) / 68, (w * 0.8) / 24) : (w * 0.7) / 40;
  return geometry(face).spots.map(p => ({ x: w / 2 + p.x * scale, y: h / 2 + p.y * scale, L: [[scale, 0], [0, scale]] }));
}

// The handles for lining up the spots: each spot's centre and right edge, and on a full face its top
// edge too, for photos taken at a slant. A triple spot's spots are small, so they get two handles each.
export function handlesFor(face, spots) {
  const R = edgeCm(face);
  return spots.flatMap((s, i) => [
    { spot: i, kind: 'centre', ...spotToPhoto(s, 0, 0) },
    { spot: i, kind: 'right', ...spotToPhoto(s, R, 0) },
    ...(face === 'triple40' ? [] : [{ spot: i, kind: 'top', ...spotToPhoto(s, 0, -R) }]),
  ]);
}

// Moves a handle to `pt`. The centre moves the whole spot. On a full face the right and top handles
// set the spot's width and height directions separately; on a triple spot the edge handle turns and
// resizes the spot, keeping its shape.
export function moveHandle(face, spots, h, pt) {
  const s = spots[h.spot];
  const R = edgeCm(face);
  if (h.kind === 'centre') {
    s.x = pt.x;
    s.y = pt.y;
  } else if (h.kind === 'top') {
    s.L = [[s.L[0][0], -(pt.x - s.x) / R], [s.L[1][0], -(pt.y - s.y) / R]];
  } else if (face === 'triple40') {
    const old = spotToPhoto(s, R, 0);
    const a0 = Math.atan2(old.y - s.y, old.x - s.x), a1 = Math.atan2(pt.y - s.y, pt.x - s.x);
    const k = Math.hypot(pt.x - s.x, pt.y - s.y) / Math.hypot(old.x - s.x, old.y - s.y);
    const cs = Math.cos(a1 - a0) * k, sn = Math.sin(a1 - a0) * k;
    const [[a, b], [c, d]] = s.L;
    s.L = [[cs * a - sn * c, cs * b - sn * d], [sn * a + cs * c, sn * b + cs * d]];
  } else {
    s.L = [[(pt.x - s.x) / R, s.L[0][1]], [(pt.y - s.y) / R, s.L[1][1]]];
  }
}

// Which spot a photo position belongs to, and where it is on that spot in centimetres.
export function locate(spots, pt) {
  let best = null;
  spots.forEach((s, i) => {
    const p = photoToSpot(s, pt);
    const d = Math.hypot(p.x, p.y);
    if (!best || d < best.d) best = { s: i, x: p.x, y: p.y, d };
  });
  return best;
}

// ---------- finding the target ----------

const GOLD = 1, RED = 2, BLUE = 3, DARK = 4, WHITE = 5;
const DETECT_PX = 800;

// Sorts each pixel into gold, red or blue by its hue, or for greys, dark (the black ring, holes,
// shadows) or white (the paper). Anything else is left as none.
function classify(data) {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0; i < out.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 90) { out[i] = DARK; continue; }
    if (max - min < 0.4 * max) {
      // The black ring often looks mid grey with shine on it, and the paper is always far brighter.
      if (max < 160) out[i] = DARK;
      else if (min > 165 && max - min < 0.2 * max) out[i] = WHITE;
      continue;
    }
    const d = max - min;
    let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    if (hue >= 38 && hue <= 72 && max > 140) out[i] = GOLD;
    else if (hue <= 16 || hue >= 335) out[i] = RED;
    else if (hue >= 185 && hue <= 235) out[i] = BLUE;
  }
  return out;
}

// Solves the square linear system m·x = v (Gaussian elimination). Null if it has no single answer.
function solveLinear(m, v) {
  const n = v.length;
  const a = m.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

// The colour edges every spot has, from the middle out, and how far out each is in cm: gold to red,
// red to blue, then on a full face blue to the black ring and black to the white ring, or on a triple
// spot blue to the white paper.
export const ringEdges = face => [
  { from: GOLD, to: RED, r: 4, name: 'gold/red' },
  { from: RED, to: BLUE, r: 8, name: 'red/blue' },
  ...(face === 'triple40'
    ? [{ from: BLUE, to: WHITE, r: 10, name: 'blue/white' }]
    : [{ from: BLUE, to: DARK, r: 12, name: 'blue/black' }, { from: DARK, to: WHITE, r: 16, name: 'black/white' }]),
];

// Points where one ring's colour changes to the next, traced along rays from the gold's middle.
// A change only counts when it's clean: the new colour starts within a few pixels of where the old one
// was last seen, and carries on for a few pixels, so printed lines and small marks don't count. Where
// an edge is blocked (by an arrow, a hole or the sticky note) the ray moves on to the next edge.
// Each point goes where the new colour starts. Smaller edges are kept on fewer rays, in step with
// their size, so their points aren't crowded together.
function findEdges(p, cls, w, h, face) {
  const edges = ringEdges(face);
  const GAP = 3, RUN = 3, N = 180;
  const gold = Math.max(p.rx, p.ry);
  const outer = edges[edges.length - 1].r;
  const far = gold * (outer / 4) * 1.4;
  const every = edges.map(e => Math.max(1, Math.round(outer / e.r)));
  const pts = [];
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2, dx = Math.cos(t), dy = Math.sin(t);
    const at = r => {
      const x = Math.round(p.cx + r * dx), y = Math.round(p.cy + r * dy);
      return x < 0 || y < 0 || x >= w || y >= h ? -1 : cls[y * w + x];
    };
    let e = 0, lastFrom = -1;
    for (let r = gold * 0.4; r <= far && e < edges.length; r += 0.5) {
      const c = at(r);
      if (c < 0) break;
      const edge = edges[e];
      if (c === edge.from) { lastFrom = r; continue; }
      if (lastFrom < 0) continue;
      if (r - lastFrom > GAP) {
        // Something's in the way of this edge: look for the next one instead.
        e++;
        lastFrom = -1;
        continue;
      }
      if (c !== edge.to) continue;
      let run = true;
      for (let s = 0.5; s <= RUN; s += 0.5) if (at(r + s) !== edge.to) { run = false; break; }
      if (!run) continue;
      if (k % every[e] === 0) pts.push({ x: p.cx + r * dx, y: p.cy + r * dy, r: edge.r });
      e++;
      lastFrom = r;
    }
  }
  return pts;
}

// Fits rings of known sizes (each point's r, in cm) that share one centre and one shape:
// (p − c)ᵀ·S·(p − c) = r². Written out that's a·x² + 2b·xy + d·y² + u·x + v·y + w = r², which is
// linear in a, b, d, u, v and w, so it's solved by least squares. Returns the centre and L = S^(-1/2),
// which turns cm from the centre into photo pixels, or null if the points don't make rings.
function fitRings(pts) {
  if (pts.length < 12) return null;
  // Points are taken relative to their mean, which keeps the sums well behaved.
  const mx = pts.reduce((s, q) => s + q.x, 0) / pts.length, my = pts.reduce((s, q) => s + q.y, 0) / pts.length;
  const M = Array.from({ length: 6 }, () => new Array(6).fill(0)), V = new Array(6).fill(0);
  for (const q of pts) {
    const x = q.x - mx, y = q.y - my;
    // Each point is weighted by 1 / 2r, so a miss on any ring counts about the same in cm.
    const wt = 1 / (2 * q.r);
    const row = [x * x, 2 * x * y, y * y, x, y, 1].map(v => v * wt), rhs = q.r * q.r * wt;
    for (let i = 0; i < 6; i++) { V[i] += row[i] * rhs; for (let j = 0; j < 6; j++) M[i][j] += row[i] * row[j]; }
  }
  const s = solveLinear(M, V);
  if (!s) return null;
  const [a, b, d, u, v] = s;
  if (a <= 0 || a * d - b * b <= 0) return null;
  // The centre is where the gradient is zero.
  const c = solveLinear([[2 * a, 2 * b], [2 * b, 2 * d]], [-u, -v]);
  if (!c) return null;
  // L = S^(-1/2), from the eigenvalues and eigenvectors of the 2×2 symmetric matrix S.
  const tr = a + d, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (a * d - b * b)));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  if (l2 <= 0) return null;
  const ang = Math.abs(b) < 1e-12 ? (a >= d ? 0 : Math.PI / 2) : Math.atan2(l1 - a, b);
  const cs = Math.cos(ang), sn = Math.sin(ang), s1 = 1 / Math.sqrt(l1), s2 = 1 / Math.sqrt(l2);
  const L = [[cs * cs * s1 + sn * sn * s2, cs * sn * (s1 - s2)], [cs * sn * (s1 - s2), sn * sn * s1 + cs * cs * s2]];
  return { x: c[0] + mx, y: c[1] + my, L };
}

// How far a point is from a fit's ring for its edge, in cm.
const offRing = (fit, q) => { const u = photoToSpot(fit, q); return Math.hypot(u.x, u.y) - q.r; };

// Fits the rings, then refits without points that are clearly off (on a hole, an arrow shaft or
// the wrong colour change), tightening each time.
function fitRobust(pts) {
  let use = pts, fit = null;
  for (const limit of [1, 0.4, 0.25]) {
    fit = fitRings(use);
    if (!fit) return null;
    use = pts.filter(q => Math.abs(offRing(fit, q)) < limit);
  }
  fit = fitRings(use);
  return fit && { ...fit, used: new Set(use) };
}

// The spot's middle and shape from its colour edges, falling back to the gold patch alone.
// `note`, if given, records the edge points (marking those left out of the fit) and what was used.
function spotShape(p, cls, w, h, face, note = null) {
  const edge = findEdges(p, cls, w, h, face);
  const fit = fitRobust(edge);
  // Sanity check: the gold is 4cm in radius, so the fitted size should be close to its radius / 4.
  const size = fit && Math.sqrt(Math.abs(fit.L[0][0] * fit.L[1][1] - fit.L[0][1] * fit.L[1][0]));
  const fromGold = (p.rx + p.ry) / 2 / 4;
  const good = fit && size > 0.7 * fromGold && size < 1.4 * fromGold;
  if (note) {
    const counts = ringEdges(face).map(e => `${e.name} ${edge.filter(q => q.r === e.r && fit?.used.has(q)).length}`);
    Object.assign(note, {
      edge: edge.map(q => ({ ...q, used: !!fit?.used.has(q) })),
      from: good ? `rings (${counts.join(', ')})` : fit ? 'gold (ring fit out of range)' : 'gold (too few edge points)',
    });
  }
  if (good) return { cx: fit.x, cy: fit.y, L: fit.L };
  return { cx: p.cx, cy: p.cy, L: [[p.rx / 4, 0], [0, p.ry / 4]] };
}

// Connected patches of gold, with their size and bounding box.
function goldPatches(cls, w, h) {
  const seen = new Uint8Array(cls.length);
  const patches = [];
  const stack = [];
  for (let start = 0; start < cls.length; start++) {
    if (cls[start] !== GOLD || seen[start]) continue;
    let area = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= cls.length || seen[j] || cls[j] !== GOLD) continue;
        if ((j === i - 1 || j === i + 1) && Math.floor(j / w) !== y) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    patches.push({ area, cx: sx / area, cy: sy / area, rx: (x1 - x0 + 1) / 2, ry: (y1 - y0 + 1) / 2 });
  }
  return patches;
}

// A gold spot is round, and ringed by red half again as far out (gold reaches 4cm, red 6 to 8cm).
// That tells it apart from yellow sticky notes and fletchings. Returns why a patch isn't one, or ''.
function notGoldSpot(p, cls, w, h) {
  if (p.area < 120) return 'too small';
  const fill = p.area / (Math.PI * p.rx * p.ry);
  const aspect = p.rx / p.ry;
  if (fill < 0.68 || fill > 1.12) return `not round (fills ${Math.round(fill * 100)}%)`;
  if (aspect < 0.6 || aspect > 1.65) return `too stretched (${aspect.toFixed(2)})`;
  let red = 0;
  const N = 36;
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2;
    const x = Math.round(p.cx + 1.5 * p.rx * Math.cos(t)), y = Math.round(p.cy + 1.5 * p.ry * Math.sin(t));
    if (x >= 0 && y >= 0 && x < w && y < h && cls[y * w + x] === RED) red++;
  }
  return red / N >= 0.45 ? '' : `not ringed by red (${Math.round((red / N) * 100)}%)`;
}

// Picks this archer's spots from the gold spots found, top to bottom: the largest near the middle of
// the photo, or for a triple spot, the best column of three evenly spaced as a triple spot's are.
// Spots that weren't found are guessed from the others (with no area, so they aren't measured).
function pickSpots(found, face, w, h) {
  const centred = s => s.area * (1 - Math.hypot(s.cx - w / 2, s.cy - h / 2) / Math.hypot(w, h));
  const byCentre = [...found].sort((a, b) => centred(b) - centred(a));
  if (face !== 'triple40') return byCentre.length ? [byCentre[0]] : null;
  const guess = (from, dx, dy) => ({ cx: from.cx + dx, cy: from.cy + dy, rx: from.rx, ry: from.ry, area: 0 });
  // A found spot near (x, y), if there is one.
  const near = (x, y, r) => found.find(s => Math.hypot(s.cx - x, s.cy - y) < r);
  // Spot centres are 22cm apart and the gold is 4cm in radius, so neighbours are 5.5 gold radii apart.
  let best = null;
  for (const a of found) {
    for (const b of found) {
      if (b.cy <= a.cy) continue;
      const r = (a.ry + b.ry) / 2;
      if (Math.abs(a.cx - b.cx) > r * 1.5 || Math.max(a.ry, b.ry) / Math.min(a.ry, b.ry) > 1.4) continue;
      const gaps = (b.cy - a.cy) / (5.5 * r);
      const n = Math.round(gaps);
      if ((n !== 1 && n !== 2) || Math.abs(gaps - n) > 0.2) continue;
      let column;
      if (n === 2) {
        // Top and bottom: the middle spot is between them.
        const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
        column = [a, near(mx, my, r * 1.5) || guess(a, mx - a.cx, my - a.cy), b];
      } else {
        // Two neighbours: the third is on whichever side keeps the column nearer the middle of the photo.
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        column = Math.abs(a.cy - h / 2) < Math.abs(b.cy - h / 2) ? [guess(a, -dx, -dy), a, b] : [a, b, guess(b, dx, dy)];
      }
      const score = column.reduce((t, s) => t + (s.area ? centred(s) : 0), 0);
      if (!best || score > best.score) best = { score, column };
    }
  }
  if (best) return best.column;
  // Only one spot found: take it as the middle one.
  const one = byCentre[0];
  return one ? [guess(one, 0, -5.5 * one.ry), one, guess(one, 0, 5.5 * one.ry)] : null;
}

// Looks for the target in the photo drawn on `canvas`. Returns the spots (see the top of this file)
// in the canvas's pixels, top to bottom, or null if no target was found.
// `debug`, if given, is filled in with the working, for checking the finder (dev/ring-checker.html):
// the colour of each pixel at the size it was searched at, each gold patch and why it was or wasn't
// taken as a spot, and each spot's edge points and what it was measured from.
export function findFace(canvas, face, debug = null) {
  const k = Math.min(1, DETECT_PX / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
  const small = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const cls = classify(ctx.getImageData(0, 0, w, h).data);
  const patches = goldPatches(cls, w, h).map(p => ({ ...p, rejected: notGoldSpot(p, cls, w, h) }));
  const picked = pickSpots(patches.filter(p => !p.rejected), face, w, h);
  const notes = (picked || []).map(p => ({ guessed: !p.area }));
  if (debug) {
    // Positions in the working are given in the canvas's pixels, like the spots.
    Object.assign(debug, {
      scale: k, w, h, cls, notes,
      patches: patches.filter(p => p.area >= 20)
        .map(p => ({ x: p.cx / k, y: p.cy / k, rx: p.rx / k, ry: p.ry / k, area: p.area, rejected: p.rejected })),
    });
  }
  if (!picked) return null;
  // Each found spot's centre and shape is measured. Guessed spots take the shape of the nearest
  // measured one.
  const measured = picked.map((p, i) => (p.area ? spotShape(p, cls, w, h, face, notes[i]) : null));
  if (debug) notes.forEach(n => { n.edge = (n.edge || []).map(q => ({ ...q, x: q.x / k, y: q.y / k })); });
  return picked.map((p, i) => {
    const m = measured[i] || measured[i === 0 ? 1 : i - 1] || measured.find(Boolean);
    const cx = measured[i] ? m.cx : p.cx, cy = measured[i] ? m.cy : p.cy;
    return { x: cx / k, y: cy / k, L: m.L.map(row => row.map(v => v / k)) };
  });
}

// The colour classes in a debug report's `cls`.
export const COLOURS = { GOLD, RED, BLUE, DARK, WHITE };
