// Grænsetilfælde: små, håndlavede klasser, hvor svaret ligger lige på kanten.
// Hvert tilfælde har et navn, en beskrivelse og et input (og nogle gange en
// forventning, som testene bruger).

import { buildInput, assertValid } from './common.mjs';

// En klasse på n elever, hvor kolonnerne laves af en funktion af nummeret.
function klass(n, columns) {
  return {
    rows: Array.from({ length: n }, (_, i) => ({ _rowId: `b${i + 1}`, ...columns(i) })),
  };
}

const ids = (...numbers) => numbers.map((n) => `b${n}`);
const perGroup = (target, adjust = 'plus') => ({ mode: 'perGroup', target, adjust });

function caseOf(name, description, k, setup, expect = {}) {
  return { name, description, input: assertValid(buildInput(k, { seed: 1, ...setup }), name), expect };
}

export function boundaryCases() {
  const cases = [];
  const add = (...args) => cases.push(caseOf(...args));

  add('adskil-lige-saa-mange', 'Adskil: præcis så mange med værdien, som der er grupper (4 og 4).',
    klass(16, (i) => ({ Niveau: i < 4 ? 'Høj' : 'Lav' })),
    { rules: [{ type: 'separate', column: 'Niveau', values: ['Høj'] }], size: perGroup(4) },
    { best: { 0: 0 } });
  add('adskil-en-for-mange', 'Adskil: én for mange (5 med værdien, 4 grupper) → mindst 1 par.',
    klass(16, (i) => ({ Niveau: i < 5 ? 'Høj' : 'Lav' })),
    { rules: [{ type: 'separate', column: 'Niveau', values: ['Høj'] }], size: perGroup(4) },
    { best: { 0: 1 } });
  add('adskil-altid-9-i-4', 'Adskil altid: 9 elever i 4 grupper → bedst 3/2/2/2 = 6 par.',
    klass(16, (i) => ({ Sprog: i < 9 ? 'Spansk' : 'Tysk' })),
    { rules: [{ type: 'strict_separate', column: 'Sprog', values: ['Spansk'] }], size: perGroup(4) },
    { best: { 0: 6 } });
  add('adskil-flere-vaerdier', 'Adskil med to valgte værdier ("12" og "10"): højst én med nogen af dem.',
    klass(12, (i) => ({ Karakter: ['12', '10', '7', '4'][i % 4] })),
    { rules: [{ type: 'separate', column: 'Karakter', values: ['12', '10'] }], size: perGroup(4) },
    { best: { 0: 3 } });
  add('blokke-passer-lige', 'Skal sammen: to blokke på 4 i to grupper på 4 (passer lige).',
    klass(8, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], together: [ids(1, 2, 3, 4), ids(5, 6, 7, 8)], size: perGroup(4) },
    { shouldStop: false });
  add('blokke-kan-ikke-pakkes', 'Skal sammen: blokke på 3, 3 og 2 i to grupper på 4 kan ikke pakkes.',
    klass(8, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], together: [ids(1, 2, 3), ids(4, 5, 6), ids(7, 8)], size: perGroup(4) },
    { shouldStop: true, code: 'together-cannot-pack' });
  add('blok-for-stor', 'Skal sammen: en blok på 5, men grupperne har højst 4 pladser.',
    klass(12, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], together: [ids(1, 2, 3, 4, 5)], size: perGroup(4) },
    { shouldStop: true, code: 'together-too-big' });
  add('blok-mod-undgaa', 'Skal sammen og Undgå hinanden på de samme to elever.',
    klass(8, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], together: [ids(1, 2)], avoid: [ids(1, 2)], size: perGroup(4) },
    { shouldStop: true, code: 'together-vs-avoid' });
  add('blok-mod-adskil-altid', 'Skal sammen med to, der begge har en Adskil altid-værdi.',
    klass(8, (i) => ({ Sprog: i < 2 ? 'Spansk' : 'Tysk' })),
    { rules: [{ type: 'strict_separate', column: 'Sprog', values: ['Spansk'] }], together: [ids(1, 2)], size: perGroup(4) },
    { shouldStop: true, code: 'together-vs-separate' });
  add('blok-paa-tvaers-af-laas', 'Skal sammen med én fri og én i en låst gruppe.',
    klass(10, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], together: [ids(1, 9)], locked: [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ids(9, 10), topic: null }], size: perGroup(4) },
    { shouldStop: true, code: 'together-across-lock' });
  add('blok-paa-tvaers-af-opdel', 'Skal sammen med to elever i hver sin Opdel-pulje.',
    klass(8, (i) => ({ Hold: i < 4 ? '2.a' : '2.b' })),
    { rules: [{ type: 'aggregate', column: 'Hold' }], together: [ids(1, 8)], size: perGroup(4) },
    { shouldStop: true, code: 'together-across-pool' });
  add('klyng-mange-enlige', 'Klyng: 10 elever, 8 forskellige værdier, 6 af dem enlige → mindst 6 står alene.',
    klass(10, (i) => ({ Interesse: ['A', 'A', 'B', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][i] })),
    { rules: [{ type: 'cluster', column: 'Interesse' }], size: perGroup(5) },
    { best: { 0: 6 } });
  add('fordel-13-piger-6-grupper', 'Fordel: 13 piger og 13 drenge i 6 grupper (5, 5, 4, 4, 4, 4).',
    klass(26, (i) => ({ Køn: i < 13 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], size: perGroup(4, 'plus') },
    { groups: 6 });
  add('fem-elever-minus', '5 elever, 4 pr. gruppe, "-1" → grupper på 3 og 2.',
    klass(5, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], size: perGroup(4, 'minus') },
    { sizes: [3, 2] });
  add('fem-elever-plus', '5 elever, 4 pr. gruppe, "+1" → én gruppe på 5.',
    klass(5, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], size: perGroup(4, 'plus') },
    { sizes: [5] });
  add('flere-grupper-end-elever', 'Antal grupper 10, men kun 6 elever → 6 grupper på 1.',
    klass(6, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], size: { mode: 'count', count: 10 } },
    { sizes: [1, 1, 1, 1, 1, 1] });
  add('en-elev', 'Kun én elev.',
    klass(1, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], size: perGroup(4) },
    { sizes: [1] });
  add('emner-runder', '24 elever, 4 pr. gruppe "+1" og 5 emner: 6 grupper rundes ned til 5.',
    klass(24, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], topics: ['Klima', 'EU', 'Medier', 'Migration', 'Energi'], size: perGroup(4, 'plus') },
    { groups: 5 });
  add('emner-runder-ikke', '26 elever, 4 pr. gruppe "+1" og 4 emner: 4 grupper ville give 7 → beholder 6.',
    klass(26, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], topics: ['Klima', 'EU', 'Medier', 'Migration'], size: perGroup(4, 'plus') },
    { groups: 6 });
  add('laaste-nummer-2-og-4', 'Låste grupper nr. 2 og 4 med emner; de nye får 1, 3, 5 …',
    klass(20, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' })),
    {
      rules: [{ type: 'distribute', column: 'Køn' }],
      topics: ['Klima', 'EU', 'Medier'],
      locked: [
        { id: 'L2', number: 2, name: 'Gruppe 2', members: ids(17, 18), topic: 'EU' },
        { id: 'L4', number: 4, name: 'Gruppe 4', members: ids(19, 20), topic: 'Gammelt emne' },
      ],
      size: perGroup(4, 'plus'),
    });
  add('opdel-tomme-celler', 'Opdel: tre elever med tom celle bliver deres egen pulje.',
    klass(15, (i) => ({ Hold: i < 3 ? '' : i < 9 ? '2.a' : '2.b' })),
    { rules: [{ type: 'aggregate', column: 'Hold' }], size: perGroup(3) });
  add('to-opdel', 'To Opdel-regler: puljerne er kombinationen.',
    klass(16, (i) => ({ Hold: i < 8 ? '2.a' : '2.b', Valg: i % 2 ? 'Klima' : 'EU' })),
    { rules: [{ type: 'aggregate', column: 'Hold' }, { type: 'aggregate', column: 'Valg' }], size: perGroup(4) });
  add('faerre-grupper-end-puljer', 'Antal grupper 2, men 3 puljer → hver pulje får én.',
    klass(12, (i) => ({ Hold: ['2.a', '2.b', '2.c'][i % 3] })),
    { rules: [{ type: 'aggregate', column: 'Hold' }], size: { mode: 'count', count: 2 } },
    { groups: 3 });
  add('balancer-kun-tekst', 'Balancér på en kolonne helt uden tal og uden rækkefølge → ikke målt.',
    klass(8, (i) => ({ Farve: ['Rød', 'Blå'][i % 2] })),
    { rules: [{ type: 'balance', column: 'Farve' }], size: perGroup(4) },
    { met: { 0: null } });
  add('blandet-kolonne', 'Balancér og Ensartede på en kolonne med tal, "Fritaget" og tomme celler.',
    klass(12, (i) => ({ Karakter: ['12', '7', 'Fritaget', '4', '', '10'][i % 6] })),
    { rules: [{ type: 'balance', column: 'Karakter' }, { type: 'minimizediff', column: 'Karakter' }], size: perGroup(3) });
  add('decimalkomma', 'Ensartede på tal med komma og punktum ("7,5" og "7.5" er det samme).',
    klass(8, (i) => ({ Snit: ['7,5', '7.5', '2', '2,0', '1.000', '12', '11,5', '-3'][i] })),
    { rules: [{ type: 'minimizediff', column: 'Snit' }], size: perGroup(2) });
  add('rangering-og-skrivemaade', 'Ensartede på Lav/Middel/Høj med rangering og rod i skrivemåden.',
    klass(9, (i) => ({ Niveau: ['Lav', 'lav ', 'LAV', 'Middel', ' middel', 'Høj', 'høj', 'Høj', 'Ukendt'][i] })),
    { rules: [{ type: 'minimizediff', column: 'Niveau' }], columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'] }, size: perGroup(3) });
  add('saml-tekst', 'Saml på tekst uden rangering (værditælling).',
    klass(12, (i) => ({ Interesse: ['Fodbold', 'Musik', 'Kunst'][i % 3] })),
    { rules: [{ type: 'group_sort', column: 'Interesse' }], size: perGroup(4) });
  add('saml-blandet', 'Saml på en talkolonne, hvor nogle elever har tekst.',
    klass(12, (i) => ({ Snit: i < 8 ? String(i + 1) : ['Fritaget', 'Syg'][i % 2] })),
    { rules: [{ type: 'group_sort', column: 'Snit' }], size: perGroup(4) });
  add('samme-regel-to-gange', 'Den samme Fordel står to gange.',
    klass(12, (i) => ({ Køn: i % 3 ? 'Pige' : 'Dreng' })),
    { rules: [{ type: 'distribute', column: 'Køn' }, { type: 'distribute', column: 'Køn' }], size: perGroup(4) });
  add('undgaa-for-mange', 'Undgå hinanden med 5 elever og 4 grupper → mindst 1 par.',
    klass(16, () => ({ Køn: 'Pige' })),
    { rules: [{ type: 'distribute', column: 'Køn' }], avoid: [ids(1, 2, 3, 4, 5)], size: perGroup(4) },
    { avoidBest: 1 });

  // Matrix.
  const matrixClass = klass(14, (i) => ({ Køn: i % 2 ? 'Pige' : 'Dreng' }));
  add('matrix-fuld-ulige-kilder', 'Matrix "Fuld" med emner på 5, 5 og 4 elever → 4 matrixgrupper.',
    matrixClass,
    {
      view: 'matrix',
      rules: [{ type: 'distribute', column: 'Køn' }],
      size: { mode: 'full' },
      matrix: {
        source: 'topic',
        homeGroups: [
          { id: 'S1', members: ids(1, 2, 3, 4, 5), topic: 'Klima' },
          { id: 'S2', members: ids(6, 7, 8, 9, 10), topic: 'EU' },
          { id: 'S3', members: ids(11, 12, 13, 14), topic: 'Medier' },
        ],
      },
    },
    { groups: 4 });
  add('matrix-tom-kilde', 'Matrix "Fuld", hvor en stamgruppes elever alle er fraværende.',
    matrixClass,
    {
      view: 'matrix',
      rules: [{ type: 'distribute', column: 'Køn' }],
      absent: ids(13, 14),
      size: { mode: 'full' },
      matrix: {
        source: 'homeGroup',
        homeGroups: [
          { id: 'S1', members: ids(1, 2, 3, 4, 5, 6), topic: 'Klima' },
          { id: 'S2', members: ids(7, 8, 9, 10, 11, 12), topic: 'EU' },
          { id: 'S3', members: [], topic: 'Medier' },
        ],
      },
    },
    { shouldStop: true, code: 'matrix-empty-source' });
  add('matrix-pr-gruppe', 'Matrix med 3 pr. gruppe: "højst én fra hver stamgruppe" er et tungt hensyn.',
    matrixClass,
    {
      view: 'matrix',
      rules: [],
      size: perGroup(3),
      matrix: {
        source: 'homeGroup',
        homeGroups: [
          { id: 'S1', members: ids(1, 2, 3, 4, 5), topic: null },
          { id: 'S2', members: ids(6, 7, 8, 9, 10), topic: null },
          { id: 'S3', members: ids(11, 12, 13, 14), topic: null },
        ],
      },
    });
  return cases;
}
