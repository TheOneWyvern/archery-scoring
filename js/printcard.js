// The scorecard laid out like a paper Archery GB / World Archery score sheet, for printing or saving as a PDF.
// Each line holds two ends, followed by hits, 10s, Xs and the running total, with signature lines at the bottom.
// It is only shown when printing.

import { ROUNDS, BOWS, FACES, roundSpec, roundStats, sortArrows, hasX, isPractice } from './rules.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Hits, 10s (X counts as a 10) and Xs for a set of arrows.
function counts(arrows) {
  let hits = 0, tens = 0, xs = 0, total = 0;
  for (const a of arrows) {
    if (a.v === 'M') continue;
    hits++;
    if (a.v === 'X') { xs++; tens++; total += 10; } else {
      if (a.v === '10') tens++;
      total += Number(a.v);
    }
  }
  return { hits, tens, xs, total };
}

const field = (label, value) => `<div class="pc-field"><span>${esc(label)}</span><b>${esc(value) || '&nbsp;'}</b></div>`;

// info: { archer, category, date, location, classification }
export function printCardHTML(round, info) {
  const practice = isPractice(round);
  const tpl = roundSpec(round);
  const st = roundStats(round);
  const showX = hasX(round.bow);
  const per = practice ? Math.max(1, ...round.ends.map(e => e.length)) : tpl.arrowsPerEnd;
  const ends = practice ? round.ends.filter(e => e.length) : round.ends;
  const endCount = practice ? ends.length : tpl.ends;
  const perHalf = practice ? endCount : tpl.ends / tpl.halves;
  const halves = practice ? 1 : tpl.halves;
  // Practice ends can be long, so they get one end per line; otherwise two, as on a paper sheet.
  const perLine = practice || per > 6 ? 1 : 2;
  const xCell = v => (showX ? `<td class="pc-n">${v}</td>` : '');

  let running = 0;
  const tables = [];
  for (let h = 0; h < halves; h++) {
    let rows = '';
    const halfArrows = [];
    for (let i = h * perHalf; i < (h + 1) * perHalf; i += perLine) {
      let cells = '';
      const lineArrows = [];
      for (let j = i; j < i + perLine; j++) {
        if (j >= (h + 1) * perHalf) {
          cells += '<td class="pc-a"></td>'.repeat(per) + '<td class="pc-et"></td>';
          continue;
        }
        const end = ends[j] || [];
        const sorted = sortArrows(end);
        cells += Array.from({ length: per }, (_, k) => `<td class="pc-a">${sorted[k] ? esc(sorted[k].v) : ''}</td>`).join('');
        cells += `<td class="pc-et">${end.length ? counts(end).total : ''}</td>`;
        lineArrows.push(...end);
      }
      const shot = lineArrows.length > 0;
      const c = counts(lineArrows);
      running += c.total;
      halfArrows.push(...lineArrows);
      rows += `<tr>${cells}<td class="pc-n">${shot ? c.hits : ''}</td><td class="pc-n">${shot ? c.tens : ''}</td>${shot ? xCell(c.xs) : xCell('')}<td class="pc-rt">${shot ? running : ''}</td></tr>`;
    }
    const hc = counts(halfArrows);
    const head = Array.from({ length: perLine }, () =>
      Array.from({ length: per }, (_, k) => `<th>${k + 1}</th>`).join('') + '<th>E/T</th>').join('');
    const label = halves > 1 ? `Half ${h + 1} score` : 'Score';
    tables.push(`
      <table class="pc-table">
        <thead><tr>${head}<th>Hits</th><th>10s</th>${showX ? '<th>Xs</th>' : ''}<th>R/T</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td class="pc-label" colspan="${perLine * (per + 1)}">${label}</td>
          <td class="pc-n">${hc.hits}</td><td class="pc-n">${hc.tens}</td>${xCell(hc.xs)}<td class="pc-rt">${hc.total}</td></tr></tfoot>
      </table>`);
  }

  const all = counts(round.ends.flat());
  const roundName = practice ? `Practice${tpl.arrowsPerEnd ? `, ${tpl.arrowsPerEnd} arrows per end` : ''}` : ROUNDS[round.type].name;

  return `
    <section class="print-card" aria-hidden="true">
      <h1>Score sheet</h1>
      <div class="pc-head">
        ${field('Archer', info.archer)}
        ${field('Date', info.date)}
        ${field('Round', roundName)}
        ${field('Bow', BOWS[round.bow])}
        ${field('Target face', FACES[round.face])}
        ${field('Category', info.category)}
        ${field('Venue', info.location)}
        ${field('Target no.', '')}
      </div>
      ${tables.join('')}
      <table class="pc-table pc-totals">
        <thead><tr><th>Hits</th><th>10s</th>${showX ? '<th>Xs</th>' : ''}<th>Total</th></tr></thead>
        <tbody><tr><td>${all.hits}</td><td>${all.tens}</td>${showX ? `<td>${all.xs}</td>` : ''}<td class="pc-grand">${st.total}</td></tr></tbody>
      </table>
      ${info.classification ? `<p class="pc-note">Classification reached: ${esc(info.classification)}</p>` : ''}
      ${round.finishedAt ? '' : '<p class="pc-note">Round not finished.</p>'}
      <div class="pc-sign">
        <div><span></span>Archer's signature</div>
        <div><span></span>Scorer's signature</div>
      </div>
      <p class="pc-foot">Arrows are listed highest first. Printed from Archery Scoring.</p>
    </section>`;
}
