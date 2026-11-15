// Archery GB indoor classifications, from Archery GB's indoor classification tables (Table 28).

import { roundStats } from './rules.js';

// Lowest class first. Archer and Bowman classes are claimed from rounds totalling a set number of
// arrows at that level; Master Bowman classes also need record status competitions.
export const CLASSES = [
  { code: 'IA3', name: 'Indoor Archer 3rd Class', tier: 'archer' },
  { code: 'IA2', name: 'Indoor Archer 2nd Class', tier: 'archer' },
  { code: 'IA1', name: 'Indoor Archer 1st Class', tier: 'archer' },
  { code: 'IB3', name: 'Indoor Bowman 3rd Class', tier: 'bowman' },
  { code: 'IB2', name: 'Indoor Bowman 2nd Class', tier: 'bowman' },
  { code: 'IB1', name: 'Indoor Bowman 1st Class', tier: 'bowman' },
  { code: 'IMB', name: 'Indoor Master Bowman', tier: 'master' },
  { code: 'IGMB', name: 'Indoor Grand Master Bowman', tier: 'master' },
];

// Arrows needed at a class to claim it: 10 dozen for Archer classes, 15 dozen for Bowman and above.
export const CLAIM_ARROWS = { archer: 120, bowman: 180, master: 180 };

export const AGE_GROUPS = {
  adult: 'Adult', '50+': '50+', u21: 'Under 21', u18: 'Under 18', u16: 'Under 16', u15: 'Under 15', u14: 'Under 14', u12: 'Under 12',
};
export const GENDERS = { men: "Men's", women: "Women's" };

// Minimum WA 18m score for each class above, by bow, then men's or women's tables, then age group.
// The same scores apply on the full face and the triple spot.
const WA18 = {
  recurve: {
    men: {
      'adult': [272, 347, 413, 466, 506, 537, 560, 578],
      '50+': [206, 282, 357, 421, 472, 511, 540, 563],
      'u21': [206, 282, 357, 421, 472, 511, 540, 563],
      'u18': [149, 216, 292, 366, 429, 477, 515, 544],
      'u16': [104, 157, 226, 302, 375, 436, 483, 519],
      'u15': [71, 110, 166, 236, 313, 384, 443, 488],
      'u14': [47, 75, 117, 174, 246, 323, 393, 450],
      'u12': [31, 50, 80, 123, 183, 256, 333, 401],
    },
    women: {
      'adult': [221, 297, 371, 432, 480, 517, 545, 567],
      '50+': [162, 231, 308, 380, 439, 486, 521, 549],
      'u21': [162, 231, 308, 380, 439, 486, 521, 549],
      'u18': [113, 170, 241, 318, 389, 446, 491, 525],
      'u16': [77, 120, 179, 251, 328, 397, 453, 496],
      'u15': [71, 110, 166, 236, 313, 384, 443, 488],
      'u14': [47, 75, 117, 174, 246, 323, 393, 450],
      'u12': [31, 50, 80, 123, 183, 256, 333, 401],
    },
  },
  compound: {
    men: {
      'adult': [403, 458, 498, 527, 546, 560, 571, 583],
      '50+': [350, 418, 469, 507, 533, 550, 563, 574],
      'u21': [350, 418, 469, 507, 533, 550, 563, 574],
      'u18': [291, 369, 432, 480, 514, 538, 553, 565],
      'u16': [230, 311, 386, 446, 490, 521, 542, 557],
      'u15': [174, 250, 331, 403, 458, 498, 527, 546],
      'u14': [127, 192, 270, 350, 418, 469, 507, 533],
      'u12': [90, 141, 210, 291, 369, 432, 480, 514],
    },
    women: {
      'adult': [369, 432, 480, 514, 538, 553, 565, 577],
      '50+': [311, 386, 446, 490, 521, 542, 557, 568],
      'u21': [311, 386, 446, 490, 521, 542, 557, 568],
      'u18': [250, 331, 403, 458, 498, 527, 546, 560],
      'u16': [192, 270, 350, 418, 469, 507, 533, 550],
      'u15': [174, 250, 331, 403, 458, 498, 527, 546],
      'u14': [127, 192, 270, 350, 418, 469, 507, 533],
      'u12': [90, 141, 210, 291, 369, 432, 480, 514],
    },
  },
  barebow: {
    men: {
      'adult': [221, 282, 343, 397, 443, 480, 511, 535],
      '50+': [170, 226, 287, 347, 401, 446, 483, 513],
      'u21': [170, 226, 287, 347, 401, 446, 483, 513],
      'u18': [127, 174, 231, 292, 352, 405, 450, 486],
      'u16': [93, 130, 179, 236, 297, 357, 409, 453],
      'u15': [66, 95, 134, 183, 241, 302, 362, 413],
      'u14': [47, 68, 98, 138, 188, 246, 308, 366],
      'u12': [33, 49, 71, 101, 142, 192, 251, 313],
    },
    women: {
      'adult': [170, 226, 287, 347, 401, 446, 483, 513],
      '50+': [127, 174, 231, 292, 352, 405, 450, 486],
      'u21': [127, 174, 231, 292, 352, 405, 450, 486],
      'u18': [93, 130, 179, 236, 297, 357, 409, 453],
      'u16': [66, 95, 134, 183, 241, 302, 362, 413],
      'u15': [66, 95, 134, 183, 241, 302, 362, 413],
      'u14': [47, 68, 98, 138, 188, 246, 308, 366],
      'u12': [33, 49, 71, 101, 142, 192, 251, 313],
    },
  },
  longbow: {
    men: {
      'adult': [66, 98, 142, 197, 261, 328, 389, 439],
      '50+': [46, 68, 101, 145, 202, 266, 333, 393],
      'u21': [46, 68, 101, 145, 202, 266, 333, 393],
      'u18': [31, 47, 71, 104, 149, 206, 272, 338],
      'u16': [21, 32, 49, 73, 107, 153, 211, 277],
      'u15': [14, 22, 33, 50, 75, 110, 157, 216],
      'u14': [10, 15, 22, 34, 52, 77, 113, 162],
      'u12': [7, 11, 15, 23, 35, 53, 80, 117],
    },
    women: {
      'adult': [43, 64, 95, 138, 192, 256, 323, 384],
      '50+': [29, 44, 66, 98, 142, 197, 261, 328],
      'u21': [29, 44, 66, 98, 142, 197, 261, 328],
      'u18': [20, 30, 46, 68, 101, 145, 202, 266],
      'u16': [13, 21, 31, 47, 71, 104, 149, 206],
      'u15': [13, 21, 31, 47, 71, 104, 149, 206],
      'u14': [10, 15, 22, 34, 52, 77, 113, 162],
      'u12': [7, 11, 15, 23, 35, 53, 80, 117],
    },
  },
};

// Bows without tables of their own use another bow's, for now.
const SAME_AS = { flatbow: 'barebow', traditional: 'barebow', horsebow: 'barebow' };
const tableFor = round => WA18[SAME_AS[round.bow] || round.bow];

export const hasClassTable = (round) => round.type === 'wa18' && !!tableFor(round);

// The class a complete WA 18m round reaches, and how many more points the next class needs.
// Null when the round doesn't qualify or the archer's age group and category aren't known.
export function classify(round, profile) {
  if (!hasClassTable(round) || !profile?.age || !profile?.gender) return null;
  const mins = tableFor(round)[profile.gender]?.[profile.age];
  const st = roundStats(round);
  if (!mins || !st.complete) return null;
  let i = -1;
  while (i + 1 < mins.length && st.total >= mins[i + 1]) i++;
  return {
    index: i,
    reached: CLASSES[i] || null,
    next: CLASSES[i + 1] || null,
    short: i + 1 < mins.length ? mins[i + 1] - st.total : 0,
  };
}
