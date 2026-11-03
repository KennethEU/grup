// "Plantede" klasser: først laves en perfekt gruppedeling, SÅ opfindes data,
// der passer til den. Dommeren skal give 0 på alle regler for den plantede
// deling, så vi ved, at svaret 0 findes.
//
// Alle grupper er lige store (n = k · t), så størrelserne går op. Tal er hele
// eller halve, så snittene kan regnes helt præcist.

import { makeRandom, randomInt, pick, shuffled } from '../../judge/random.mjs';
import { buildInput, assertValid } from './common.mjs';

const ALL_RULES = [
  { type: 'distribute', column: 'Køn' },
  { type: 'separate', column: 'Karakter', values: ['12'] },
  { type: 'strict_separate', column: 'Udfordring', values: ['Ja'] },
  { type: 'cluster', column: 'Sprog' },
  { type: 'balance', column: 'Snit' },
  { type: 'minimizediff', column: 'Niveau' },
  { type: 'group_sort', column: 'Interesse' },
  { type: 'aggregate', column: 'Hold' },
];

// Fordeler t pladser på værdier i klumper på mindst 2 (til Klyng).
function clusteredValues(random, t, values) {
  const result = [];
  let left = t;
  while (left > 0) {
    const size = left <= 3 ? left : 2 + randomInt(random, Math.min(2, left - 3));
    const value = pick(random, values);
    for (let i = 0; i < size; i++) result.push(value);
    left -= size;
  }
  return result;
}

export function makePlanted(seed) {
  const random = makeRandom(seed);
  const t = 3 + randomInt(random, 3); // 3–5 pr. gruppe
  const useSplit = random() < 0.25;
  const poolCount = useSplit ? 2 : 1;
  const groupsPerPool = Array.from({ length: poolCount }, () => 2 + randomInt(random, 5));
  const k = groupsPerPool.reduce((a, b) => a + b, 0);

  // Valg af regler (1–6), Opdel kun hvis der er puljer.
  const candidates = ALL_RULES.filter((r) => r.type !== 'aggregate');
  const rules = shuffled(random, candidates).slice(0, 1 + randomInt(random, 5));
  if (useSplit) rules.splice(randomInt(random, rules.length + 1), 0, ALL_RULES[7]);

  // Samme sammensætning af køn og snit i alle grupper → Fordel og Balancér 0.
  const genderPattern = shuffled(random, Array.from({ length: t }, (_, i) => (i < Math.round(t * (0.3 + random() * 0.4)) ? 'Pige' : 'Dreng')));
  const snitPattern = Array.from({ length: t }, () => String((2 + randomInt(random, 20)) / 2).replace('.', ','));
  const interests = shuffled(random, ['Fodbold', 'Musik', 'Gaming', 'Kunst', 'Dans', 'Film']);

  const rows = [];
  const plantedGroups = [];
  let counter = 0;
  for (let p = 0; p < poolCount; p++) {
    for (let g = 0; g < groupsPerPool[p]; g++) {
      const members = [];
      const languages = clusteredValues(random, t, ['Tysk', 'Fransk', 'Spansk']);
      const level = pick(random, ['Lav', 'Middel', 'Høj']);
      const interest = interests[randomInt(random, Math.min(interests.length, 3))];
      // Højst én "12" og højst én "Ja" pr. gruppe; den første gruppe har altid
      // én af hver, så værdierne findes i klassen (de står i rullelisten).
      const first = p === 0 && g === 0;
      const topGrade = first || random() < 0.6 ? randomInt(random, t) : -1;
      const challenge = first || random() < 0.5 ? randomInt(random, t) : -1;
      for (let i = 0; i < t; i++) {
        const id = `p${seed % 1000}-${++counter}`;
        members.push(id);
        rows.push({
          _rowId: id,
          Køn: genderPattern[i],
          Karakter: i === topGrade ? '12' : pick(random, ['4', '7', '10', '02']),
          Udfordring: i === challenge ? 'Ja' : 'Nej',
          Sprog: languages[i],
          Snit: snitPattern[i],
          Niveau: level,
          Interesse: interest,
          Hold: `Hold ${p + 1}`,
        });
      }
      plantedGroups.push(members);
    }
  }

  // Aftaler, der passer: Undgå på tværs af grupper, Skal sammen inden for én.
  const avoid = [];
  if (random() < 0.5 && k >= 2) {
    const groupsChosen = shuffled(random, plantedGroups).slice(0, Math.min(k, 2 + randomInt(random, 3)));
    avoid.push(groupsChosen.map((members) => pick(random, members)));
  }
  const together = [];
  if (random() < 0.5) {
    const members = pick(random, plantedGroups);
    // Blokken må ikke have to med "12" eller to med "Ja" — det har ingen gruppe.
    together.push(shuffled(random, members).slice(0, 2));
  }
  // Undgå må ikke ramme to i samme blok (de er i forskellige grupper, så det kan ikke ske).

  const klass = { rows: shuffled(random, rows) };
  const input = buildInput(klass, {
    rules,
    columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'] },
    together,
    avoid,
    size: { mode: 'perGroup', target: t, adjust: random() < 0.5 ? 'plus' : 'minus' },
    topics: [],
    seed: randomInt(random, 1000000),
  });
  const answer = {
    contractVersion: 2,
    status: 'ok',
    groups: shuffled(random, plantedGroups).map((members) => ({ members: shuffled(random, members), topic: null })),
    lockedTopics: {},
    messages: [],
    rules: input.rules.map((_, i) => ({ rule: i, met: true })),
    playback: null,
    stats: { attempts: 0, seconds: 0 },
  };
  return { input: assertValid(input, `plantet ${seed}`), answer };
}
