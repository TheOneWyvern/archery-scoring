// Scoring from a photo of the target: lining each spot up with the photo, and finding it automatically.
// Face positions are in centimetres (as in face.js); photo positions are in the photo's pixels.
//
// Each spot in the photo is { H }: a perspective map, the 3×3 matrix that turns centimetres from the
// spot's centre into photo pixels. A photo taken at an angle makes the near side of the face look
// bigger than the far side. That squashes each ring into an oval and moves the smaller rings
// slightly towards the far side, and the map follows both. Spots are fitted one by one, as nearer
// spots look bigger too.

import { geometry } from './face.js';

// How far out each spot's edge handles sit: the edge of the blue on a full face (12cm), and the
// edge of a triple spot (10cm).
export const edgeCm = face => (face === 'triple40' ? 10 : 12);

const apply = (H, u, v) => {
  const w = H[2][0] * u + H[2][1] * v + H[2][2];
  return { x: (H[0][0] * u + H[0][1] * v + H[0][2]) / w, y: (H[1][0] * u + H[1][1] * v + H[1][2]) / w };
};

function invert3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}

const mul3 = (a, b) => a.map(row => b[0].map((_, j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
// The same map with its bottom-right entry 1, which is how it's kept.
const tidy = H => H.map(row => row.map(v => v / H[2][2]));

// Centimetres from the spot's centre to the photo, and back.
export const spotToPhoto = (s, u, v) => apply(s.H, u, v);
export const photoToSpot = (s, pt) => apply(invert3(s.H), pt.x, pt.y);

// A spot seen straight on (no perspective), centred at (x, y), with L the 2×2 map from cm to pixels.
export const flatSpot = (x, y, L) => ({ H: [[L[0][0], L[0][1], x], [L[1][0], L[1][1], y], [0, 0, 1]] });

// A spot moved by (dx, dy) pixels, and a spot with its pixels scaled by f.
const shifted = (s, dx, dy) => ({ H: [s.H[0].map((v, j) => v + dx * s.H[2][j]), s.H[1].map((v, j) => v + dy * s.H[2][j]), s.H[2].slice()] });
const scaled = (s, f) => ({ H: [s.H[0].map(v => v * f), s.H[1].map(v => v * f), s.H[2].slice()] });

// Pixels per cm around the spot's centre.
export function spotScale(s) {
  const H = tidy(s.H), x = H[0][2], y = H[1][2];
  const j00 = H[0][0] - x * H[2][0], j01 = H[0][1] - x * H[2][1], j10 = H[1][0] - y * H[2][0], j11 = H[1][1] - y * H[2][1];
  return Math.sqrt(Math.abs(j00 * j11 - j01 * j10));
}

// An SVG path along the ring r cm out on a spot.
export function ringPath(s, r, steps = 96) {
  let d = '';
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const p = spotToPhoto(s, r * Math.cos(t), r * Math.sin(t));
    d += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return `${d}Z`;
}

// A spot with photo positions as fractions of the photo's width and height, to keep with a round,
// and back again. Spots kept before perspective ({ x, y, L } in fractions of the width) still read.
export function spotToFractions(s, w, h) {
  return { H: tidy([s.H[0].map(v => v / w), s.H[1].map(v => v / h), s.H[2]]).map(row => row.map(v => +v.toPrecision(6))) };
}
export function spotFromFractions(s, w, h) {
  if (s.L) return flatSpot(s.x * w, s.y * w, s.L.map(row => row.map(v => v * w)));
  return { H: [s.H[0].map(v => v * w), s.H[1].map(v => v * h), s.H[2].slice()] };
}

// A first guess when the target can't be found: the face across the middle of the photo.
export function defaultSpots(face, w, h) {
  const scale = face === 'triple40' ? Math.min((h * 0.8) / 68, (w * 0.8) / 24) : (w * 0.7) / 40;
  return geometry(face).spots.map(p => flatSpot(w / 2 + p.x * scale, h / 2 + p.y * scale, [[scale, 0], [0, scale]]));
}

// The four edge handles of a spot: where its edge ring (edgeCm) crosses the left-right and up-down
// lines through its centre, in cm.
const SIDES = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1] };

// The handles for lining up the spots: each spot's centre, and its edge ring at the right, left, top
// and bottom. R picks a different ring for the edge handles (dev/ring-checker.html marks each one).
export function handlesFor(face, spots, R = edgeCm(face)) {
  return spots.flatMap((s, i) => [
    { spot: i, kind: 'centre', ...spotToPhoto(s, 0, 0) },
    ...Object.entries(SIDES).map(([kind, [u, v]]) => ({ spot: i, kind, ...spotToPhoto(s, u * R, v * R) })),
  ]);
}

// The perspective map taking four face points (cm) to four photo points, or null if there isn't one.
function fromPoints(src, dst) {
  const M = [], V = [];
  src.forEach((p, i) => {
    const q = dst[i];
    M.push([p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x]);
    V.push(q.x);
    M.push([0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y]);
    V.push(q.y);
  });
  const h = solveLinear(M, V);
  return h && { H: [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]] };
}

// Moves a handle to `pt`. The centre moves the whole spot. Each edge handle moves freely: the spot's
// map is worked out from where the four edge handles are, so the others stay where they are, and the
// centre and inner rings follow in perspective.
export function moveHandle(face, spots, h, pt, R = edgeCm(face)) {
  const s = spots[h.spot];
  if (h.kind === 'centre') {
    const c = spotToPhoto(s, 0, 0);
    s.H = shifted(s, pt.x - c.x, pt.y - c.y).H;
    return;
  }
  const sides = Object.entries(SIDES);
  const next = fromPoints(
    sides.map(([, [u, v]]) => ({ x: u * R, y: v * R })),
    sides.map(([kind, [u, v]]) => (kind === h.kind ? pt : spotToPhoto(s, u * R, v * R))),
  );
  // A handle dragged across the others would turn the face inside out, so that move is ignored.
  const inFront = next && [[0, 0], ...sides.map(([, [u, v]]) => [u * R, v * R])]
    .every(([u, v]) => next.H[2][0] * u + next.H[2][1] * v + next.H[2][2] > 0);
  if (inFront) s.H = next.H;
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
// linear in a, b, d, u, v and w, so it's solved by least squares. Returns a spot seen straight on, with
// L = S^(-1/2) turning cm from the centre into photo pixels, or null if the points don't make rings.
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
  return flatSpot(c[0] + mx, c[1] + my, L);
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

// Refines a fit to allow for perspective: finds the map that puts every edge point on its own ring
// as nearly as possible (Levenberg–Marquardt, starting from `spot`). Null if it doesn't improve on it.
function refinePerspective(spot, pts) {
  if (pts.length < 20) return null;
  // Points are taken from the spot's centre and scaled to about ±1, which keeps the numbers well behaved.
  const c = spotToPhoto(spot, 0, 0), S = spotScale(spot) * 10;
  const P = pts.map(q => ({ x: (q.x - c.x) / S, y: (q.y - c.y) / S, r: q.r }));
  const N = [[S, 0, c.x], [0, S, c.y], [0, 0, 1]];
  // The 8 numbers of the map from those scaled points back to the face, in cm.
  const G0 = tidy(mul3(invert3(spot.H), N));
  let g = [G0[0][0], G0[0][1], G0[0][2], G0[1][0], G0[1][1], G0[1][2], G0[2][0], G0[2][1]];
  const off = (g, q) => {
    const w = g[6] * q.x + g[7] * q.y + 1;
    return Math.hypot((g[0] * q.x + g[1] * q.y + g[2]) / w, (g[3] * q.x + g[4] * q.y + g[5]) / w) - q.r;
  };
  const cost = g => P.reduce((t, q) => t + off(g, q) ** 2, 0);
  const start = cost(g);
  let best = start, lambda = 1e-3;
  for (let it = 0; it < 25; it++) {
    const res = P.map(q => off(g, q));
    const J = P.map((q, k) => g.map((_, j) => {
      const g2 = g.slice();
      g2[j] += 1e-6;
      return (off(g2, q) - res[k]) / 1e-6;
    }));
    const A = g.map((_, i) => g.map((_, j) => J.reduce((t, row) => t + row[i] * row[j], 0) * (i === j ? 1 + lambda : 1)));
    const B = g.map((_, i) => -J.reduce((t, row, k) => t + row[i] * res[k], 0));
    const step = solveLinear(A, B);
    if (!step) break;
    const g2 = g.map((v, i) => v + step[i]);
    const c2 = cost(g2);
    if (c2 < best) {
      const small = best - c2 < best * 1e-6;
      g = g2;
      best = c2;
      lambda /= 3;
      if (small) break;
    } else {
      lambda *= 4;
    }
  }
  if (!(best < start)) return null;
  // Undo the scaling, then turn the map round to go from the face to the photo.
  const G = [[g[0], g[1], g[2]], [g[3], g[4], g[5]], [g[6], g[7], 1]];
  return { H: tidy(invert3(mul3(G, invert3(N)))) };
}

// The spot's middle and shape from its colour edges, falling back to the gold patch alone.
// `note`, if given, records the edge points (marking those left out of the fit) and what was used.
function spotShape(p, cls, w, h, face, note = null) {
  const edge = findEdges(p, cls, w, h, face);
  const flat = fitRobust(edge);
  // Sanity check: the gold is 4cm in radius, so the fitted size should be close to its radius / 4.
  const fromGold = (p.rx + p.ry) / 2 / 4;
  const good = flat && spotScale(flat) > 0.7 * fromGold && spotScale(flat) < 1.4 * fromGold;
  let fit = good ? flat : null, used = flat?.used || new Set(), tilted = false;
  if (fit) {
    // Allow for perspective, then refit once more with the points that sit well on those rings.
    let refined = refinePerspective(fit, [...used]);
    if (refined) {
      used = new Set(edge.filter(q => Math.abs(offRing(refined, q)) < 0.25));
      refined = refinePerspective(refined, [...used]) || refined;
      // Perspective only nudges the rings; a big change means the fit went wrong, so it's not used.
      const a = spotToPhoto(fit, 0, 0), b = spotToPhoto(refined, 0, 0);
      const ratio = spotScale(refined) / spotScale(fit);
      if (Math.hypot(a.x - b.x, a.y - b.y) < spotScale(fit) && ratio > 0.85 && ratio < 1.18) {
        fit = refined;
        tilted = true;
      } else {
        used = flat.used;
      }
    }
  }
  if (note) {
    const counts = ringEdges(face).map(e => `${e.name} ${edge.filter(q => q.r === e.r && used.has(q)).length}`);
    Object.assign(note, {
      edge: edge.map(q => ({ ...q, used: used.has(q) })),
      from: fit ? `rings${tilted ? ' in perspective' : ''} (${counts.join(', ')})` : flat ? 'gold (ring fit out of range)' : 'gold (too few edge points)',
    });
  }
  return fit ? { H: fit.H } : flatSpot(p.cx, p.cy, [[p.rx / 4, 0], [0, p.ry / 4]]);
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
    let s = measured[i];
    if (!s) {
      // A guessed spot: the nearest measured one, moved to where this one should be.
      const m = measured[i === 0 ? 1 : i - 1] || measured.find(Boolean);
      const c = spotToPhoto(m, 0, 0);
      s = shifted(m, p.cx - c.x, p.cy - c.y);
    }
    return scaled(s, 1 / k);
  });
}

// The colour classes in a debug report's `cls`.
export const COLOURS = { GOLD, RED, BLUE, DARK, WHITE };
