// Tilfældige testklasser (8–300 elever) med tilfældige opskrifter.
//
// Klasserne har de skævheder, rigtige hold har: skæve fordelinger, tomme
// celler, decimalkomma, stavemåder med store/små bogstaver og mellemrum,
// Lav/Middel/Høj med og uden rangering, sjældne værdier.

import { makeRandom, randomInt, pick, shuffled } from '../../judge/random.mjs';
import { buildInput, assertValid, TOPIC_POOL } from './common.mjs';

const GRADES = ['-3', '00', '02', '4', '7', '10', '12'];
const GRADE_WEIGHTS = [1, 2, 4, 8, 10, 8, 5];
const LEVELS = ['Lav', 'Middel', 'Høj'];

function weighted(random, values, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r < 0) return values[i];
  }
  return values[values.length - 1];
}

// Lidt rod i stavemåden: "pige", "Pige ", " PIGE".
function messy(random, value) {
  const r = random();
  if (r < 0.04) return value.toLowerCase();
  if (r < 0.07) return `${value} `;
  if (r < 0.08) return ` ${value.toUpperCase()}`;
  return value;
}

function studentCount(random) {
  const r = random();
  if (r < 0.6) return 18 + randomInt(random, 15); // 18–32: den typiske klasse
  if (r < 0.75) return 8 + randomInt(random, 10); // 8–17: små hold
  if (r < 0.9) return 33 + randomInt(random, 88); // 33–120
  return 121 + randomInt(random, 180); // 121–300: de største hold
}

// En hel klasse med alle kolonner.
export function makeClass(random, n) {
  const girlShare = 0.25 + random() * 0.55;
  const holdCount = 2 + randomInt(random, 2);
  const interests = shuffled(random, ['Fodbold', 'Musik', 'Gaming', 'Kunst', 'Dans', 'Skak', 'Kor', 'Film', 'Klatring']).slice(0, 3 + randomInt(random, 6));
  const spanishCount = 1 + randomInt(random, 2);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const empty = () => random() < 0.03;
    const gender = random() < 0.03 ? 'Andet' : random() < girlShare ? 'Pige' : 'Dreng';
    const snit = (1 + random() * 11).toFixed(1);
    rows.push({
      _rowId: `r${i + 1}`,
      Køn: empty() ? '' : messy(random, gender),
      Karakter: random() < 0.03 ? 'Fritaget' : empty() ? '' : weighted(random, GRADES, GRADE_WEIGHTS),
      Snit: empty() ? '' : random() < 0.15 ? snit : snit.replace('.', ','),
      Niveau: empty() ? '' : messy(random, weighted(random, LEVELS, [3, 5, 3])),
      Hold: random() < 0.05 ? '' : `2.${'abc'[randomInt(random, holdCount)]}`,
      Sprog: i < spanishCount ? 'Spansk' : random() < 0.55 ? 'Tysk' : 'Fransk',
      Interesse: random() < 0.04 ? '' : messy(random, pick(random, interests)),
      Tidligere: `Gruppe ${1 + randomInt(random, Math.max(2, Math.round(n / 4)))}`,
    });
  }
  return { rows: shuffled(random, rows) };
}

// Kolonner, hver regeltype giver mening på.
const RULE_COLUMNS = {
  distribute: ['Køn', 'Sprog', 'Tidligere', 'Niveau'],
  separate: ['Karakter', 'Niveau', 'Køn'],
  strict_separate: ['Karakter', 'Sprog', 'Niveau'],
  cluster: ['Sprog', 'Interesse'],
  balance: ['Karakter', 'Snit', 'Niveau'],
  minimizediff: ['Snit', 'Niveau', 'Karakter'],
  group_sort: ['Niveau', 'Interesse', 'Snit'],
  aggregate: ['Hold'],
};
const RULE_TYPES = Object.keys(RULE_COLUMNS);
const RULE_WEIGHTS = [30, 15, 8, 10, 12, 8, 7, 10];

function chooseValues(random, klass, column) {
  // Vælg 1–2 værdier, der findes i kolonnen, stavet som de står.
  const present = [...new Set(klass.rows.map((r) => r[column]).filter((v) => v.trim() !== ''))];
  const preferred = { Karakter: ['12', '10'], Niveau: ['Høj', 'Lav'], Køn: ['Andet'], Sprog: ['Spansk'] }[column] || [];
  const candidates = preferred.filter((v) => present.includes(v));
  const pool = candidates.length ? candidates : present;
  const count = Math.min(pool.length, 1 + (random() < 0.3 ? 1 : 0));
  return shuffled(random, pool).slice(0, count);
}

export function makeRecipe(random, klass) {
  const ruleCount = 1 + randomInt(random, 6);
  const rules = [];
  let splits = 0;
  while (rules.length < ruleCount) {
    const type = weighted(random, RULE_TYPES, RULE_WEIGHTS);
    if (type === 'aggregate' && splits >= 1 && random() < 0.7) continue;
    if (type === 'aggregate') splits++;
    const column = pick(random, RULE_COLUMNS[type]);
    const rule = { type, column };
    if (type === 'separate' || type === 'strict_separate') rule.values = chooseValues(random, klass, column);
    rules.push(rule);
  }
  const columnOrders = {};
  if (random() < 0.7) columnOrders.Niveau = LEVELS.slice();
  return { rules, columnOrders };
}

function sizeSetting(random, n, lockedCount) {
  if (random() < 0.7) {
    const target = n < 12 ? 2 + randomInt(random, 2) : weighted(random, [2, 3, 4, 5, 6], [1, 4, 6, 3, 1]);
    return { mode: 'perGroup', target, adjust: random() < 0.5 ? 'plus' : 'minus' };
  }
  const max = Math.max(lockedCount + 1, Math.floor(n / 2));
  return { mode: 'count', count: lockedCount + 1 + randomInt(random, Math.max(1, max - lockedCount)) };
}

function randomSubset(random, ids, min, max) {
  const count = min + randomInt(random, max - min + 1);
  return shuffled(random, ids).slice(0, Math.min(count, ids.length));
}

// Ét tilfældigt stamgruppe- eller matrix-input.
export function makeRandomInput(seed, options = {}) {
  const random = makeRandom(seed);
  const n = options.students ?? studentCount(random);
  const klass = makeClass(random, n);
  const { rules, columnOrders } = makeRecipe(random, klass);
  const allIds = klass.rows.map((r) => r._rowId);

  const absent = random() < 0.6 ? randomSubset(random, allIds, 0, Math.max(1, Math.floor(n * 0.1))) : [];
  const presentIds = allIds.filter((id) => !absent.includes(id));
  const matrix = options.matrix ?? random() < 0.12;

  if (matrix) return makeMatrixInput(random, klass, rules, columnOrders, absent, presentIds, seed);

  const topics = random() < 0.4 ? TOPIC_POOL.slice(0, 2 + randomInt(random, 4)) : [];
  const locked = [];
  if (random() < 0.3 && presentIds.length >= 10) {
    const lockedCount = 1 + randomInt(random, 2);
    let free = shuffled(random, presentIds);
    const numbers = shuffled(random, [1, 2, 3, 4, 5]).slice(0, lockedCount);
    for (let i = 0; i < lockedCount; i++) {
      const size = 2 + randomInt(random, 3);
      const members = free.slice(0, size);
      free = free.slice(size);
      const topic = topics.length ? (random() < 0.8 ? pick(random, topics) : 'Gammelt emne') : null;
      locked.push({ id: `L${i + 1}`, number: numbers[i], name: `Gruppe ${numbers[i]}`, members, topic });
    }
  }
  const lockedIds = new Set(locked.flatMap((g) => g.members));
  const freeIds = presentIds.filter((id) => !lockedIds.has(id));
  if (freeIds.length === 0) return makeRandomInput(seed + 1, options);

  const together = [];
  const blockCount = random() < 0.5 ? randomInt(random, 4) : 0;
  for (let i = 0; i < blockCount; i++) {
    // Oftest frie elever; nogle gange en fraværende eller låst (som i virkeligheden).
    const source = random() < 0.1 ? allIds : freeIds;
    together.push(randomSubset(random, source, 2, 3));
  }
  const avoid = [];
  const avoidCount = random() < 0.5 ? randomInt(random, 4) : 0;
  for (let i = 0; i < avoidCount; i++) avoid.push(randomSubset(random, random() < 0.1 ? allIds : freeIds, 2, 4));

  const input = buildInput(klass, {
    rules,
    columnOrders,
    absent,
    locked,
    together,
    avoid,
    size: sizeSetting(random, freeIds.length, locked.length),
    topics,
    seed: randomInt(random, 1000000),
  });
  return assertValid(input, `tilfældig ${seed}`);
}

// Matrix: stamgrupperne er dannet før; matrixgrupperne dannes på tværs af dem.
function makeMatrixInput(random, klass, rules, columnOrders, absent, presentIds, seed) {
  const allIds = klass.rows.map((r) => r._rowId);
  const homeSize = 3 + randomInt(random, 3);
  const ordered = shuffled(random, allIds);
  const homeGroups = [];
  const topics = TOPIC_POOL.slice(0, 3 + randomInt(random, 3));
  for (let i = 0; i * homeSize < ordered.length; i++) {
    const members = ordered.slice(i * homeSize, (i + 1) * homeSize).filter((id) => !absent.includes(id));
    homeGroups.push({ id: `S${i + 1}`, members, topic: random() < 0.05 ? null : topics[i % topics.length] });
  }
  // En sjælden gang: en elev, der ikke står i nogen stamgruppe.
  if (random() < 0.05 && homeGroups.length > 1) homeGroups[homeGroups.length - 1].members.pop();

  const locked = [];
  if (random() < 0.1 && presentIds.length > 12) {
    const members = shuffled(random, presentIds).slice(0, 3);
    locked.push({ id: 'M1', number: 1, name: 'Gruppe 1', members, topic: null });
  }
  const lockedIds = new Set(locked.flatMap((g) => g.members));
  const freeIds = presentIds.filter((id) => !lockedIds.has(id));
  const avoid = random() < 0.3 ? [randomSubset(random, freeIds, 2, 3)] : [];
  const full = random() < 0.6;
  const size = full ? { mode: 'full' } : sizeSetting(random, freeIds.length, locked.length);
  const input = buildInput(klass, {
    rules: rules.filter((r) => r.type !== 'aggregate' || !full),
    columnOrders,
    absent,
    locked,
    avoid,
    size,
    view: 'matrix',
    matrix: { source: random() < 0.6 ? 'topic' : 'homeGroup', homeGroups },
    seed: randomInt(random, 1000000),
  });
  return assertValid(input, `matrix ${seed}`);
}
