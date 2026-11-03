// De "rigtige" testklasser (realistisk_klasse.json og de to CSV-filer) lavet
// om til kontrakt-input med forskellige opskrifter, som en lærer kunne lave.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInput, assertValid, TOPIC_POOL } from './common.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..');

// En lille CSV-læser: komma som skilletegn, anførselstegn omkring felter med komma.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  return data.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
}

// Klassen med _rowId; navnet tages ud (appen sender aldrig navne).
function toClass(records, prefix) {
  return {
    rows: records.map((record, i) => {
      const { Navn, ...rest } = record;
      return { _rowId: `${prefix}${i}`, ...rest };
    }),
  };
}

const LEVELS = ['Lav', 'Middel', 'Høj'];

export function realisticCases() {
  const cases = [];
  const add = (name, description, klass, setup) =>
    cases.push({ name, description, input: assertValid(buildInput(klass, { seed: 7, ...setup }), name) });

  // realistisk_klasse.json med hverdagen ("scenario"): fravær og aftaler.
  const real = JSON.parse(readFileSync(join(DATA, 'realistisk_klasse.json'), 'utf8'));
  const rk = toClass(real.rows, 'k');
  const rid = (n) => `k${n}`;
  const scenario = {
    absent: real.scenario.absent.map(rid),
    together: real.scenario.together.map((list) => list.map(rid)),
    avoid: real.scenario.avoid.map((list) => list.map(rid)),
  };
  const recipes = [
    ['koen', 'Fordel på Køn.', [{ type: 'distribute', column: 'Køn' }], {}],
    ['koen-karakter', 'Fordel på Køn og Balancér på Karakter (med "Fritaget" og tom celle).',
      [{ type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Karakter' }], {}],
    ['niveau-hoej-adskil', 'Adskil "Høj" på Niveau, Fordel Køn, Balancér Snit (decimalkomma).',
      [{ type: 'separate', column: 'Niveau', values: ['Høj'] }, { type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Snit' }], {}],
    ['opdel-emne', 'Opdel på Emne (ulige store emner) og Fordel på Køn.',
      [{ type: 'aggregate', column: 'Emne' }, { type: 'distribute', column: 'Køn' }], {}],
    ['klyng-sprog', 'Klyng på Sprog (kun én har "Spansk") og Fordel på Køn.',
      [{ type: 'cluster', column: 'Sprog' }, { type: 'distribute', column: 'Køn' }], {}],
    ['ensartede-niveau', 'Ensartede på Niveau med rangering (én "høj" med lille h, én tom).',
      [{ type: 'minimizediff', column: 'Niveau' }], { columnOrders: { Niveau: LEVELS } }],
    ['ensartede-niveau-uden-rang', 'Ensartede på Niveau uden rangering (kun tekst → ikke målt).',
      [{ type: 'minimizediff', column: 'Niveau' }], {}],
    ['saml-emne', 'Saml på Emne og Fordel på Køn.',
      [{ type: 'group_sort', column: 'Emne' }, { type: 'distribute', column: 'Køn' }], {}],
    ['adskil-altid-spansk', 'Adskil altid "Spansk", Fordel Køn, Balancér Karakter, Ensartede Snit.',
      [{ type: 'strict_separate', column: 'Sprog', values: ['Spansk'] }, { type: 'distribute', column: 'Køn' },
        { type: 'balance', column: 'Karakter' }, { type: 'minimizediff', column: 'Snit' }], {}],
    ['seks-regler', 'Seks regler på én gang.',
      [{ type: 'distribute', column: 'Køn' }, { type: 'separate', column: 'Karakter', values: ['12'] },
        { type: 'cluster', column: 'Sprog' }, { type: 'balance', column: 'Snit' },
        { type: 'minimizediff', column: 'Niveau' }, { type: 'group_sort', column: 'Emne' }], { columnOrders: { Niveau: LEVELS } }],
  ];
  for (const [name, description, rules, extra] of recipes) {
    add(`realistisk-${name}`, description, rk, { ...scenario, rules, size: { mode: 'perGroup', target: 4, adjust: 'plus' }, ...extra });
  }
  add('realistisk-emner-laast', 'Fordel på Køn med 4 emner, én låst gruppe og "-1".', rk, {
    ...scenario,
    rules: [{ type: 'distribute', column: 'Køn' }],
    topics: TOPIC_POOL.slice(0, 4),
    locked: [{ id: 'L1', number: 3, name: 'Gruppe 3', members: [rid(11), rid(12), rid(13)], topic: 'EU' }],
    size: { mode: 'perGroup', target: 4, adjust: 'minus' },
  });
  add('realistisk-antal-grupper', 'Fordel på Køn og Niveau, "6 grupper".', rk, {
    ...scenario,
    rules: [{ type: 'distribute', column: 'Køn' }, { type: 'distribute', column: 'Niveau' }],
    size: { mode: 'count', count: 6 },
  });
  add('realistisk-uden-fravaer', 'Hele klassen (ingen fraværende), Fordel Køn og Balancér Snit, 3 pr. gruppe.', rk, {
    rules: [{ type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Snit' }],
    size: { mode: 'perGroup', target: 3, adjust: 'plus' },
  });
  add('realistisk-matrix', 'Matrix "Fuld" på tværs af emnerne fra kolonnen Emne.', rk, {
    absent: scenario.absent,
    view: 'matrix',
    rules: [{ type: 'distribute', column: 'Køn' }],
    size: { mode: 'full' },
    matrix: {
      source: 'topic',
      homeGroups: ['Klima', 'Energi', 'Migration', 'Demokrati'].flatMap((topic, t) => {
        const members = real.rows.map((r, i) => (r.Emne === topic ? rid(i) : null)).filter(Boolean);
        return [{ id: `S${t + 1}`, members: members.filter((id) => !scenario.absent.includes(id)), topic }];
      }),
    },
  });

  // elever_29.csv: en pæn klasse.
  const e29 = toClass(parseCsv(readFileSync(join(DATA, 'elever_29.csv'), 'utf8')), 'e');
  add('elever29-koen-karakter', 'Fordel Køn og Balancér Karakter.', e29, {
    rules: [{ type: 'distribute', column: 'Køn' }, { type: 'balance', column: 'Karakter' }],
    size: { mode: 'perGroup', target: 4, adjust: 'plus' },
  });
  add('elever29-aktivitet', 'Ensartede på Aktivitetsniveau (Høj/Middel/Lav med rangering) og Fordel Køn.', e29, {
    rules: [{ type: 'minimizediff', column: 'Aktivitetsniveau' }, { type: 'distribute', column: 'Køn' }],
    columnOrders: { Aktivitetsniveau: LEVELS },
    size: { mode: 'perGroup', target: 4, adjust: 'minus' },
  });
  add('elever29-opdel-emne', 'Opdel på Emne, Fordel på Sprog.', e29, {
    rules: [{ type: 'aggregate', column: 'Emne' }, { type: 'distribute', column: 'Sprog' }],
    size: { mode: 'perGroup', target: 3, adjust: 'plus' },
  });
  add('elever29-tidligere', 'Fordel på Tidligere_gruppe og Køn, med emner.', e29, {
    rules: [{ type: 'distribute', column: 'Tidligere_gruppe' }, { type: 'distribute', column: 'Køn' }],
    topics: ['Liberalisme', 'Socialisme', 'Konservatisme'],
    size: { mode: 'perGroup', target: 4, adjust: 'plus' },
  });
  add('elever29-alder-adskil', 'Adskil alder "18", Klyng på Sprog.', e29, {
    rules: [{ type: 'separate', column: 'Alder', values: ['18'] }, { type: 'cluster', column: 'Sprog' }],
    size: { mode: 'count', count: 7 },
  });

  // fordel_gamle_grupper_16.csv: fem gamle grupperinger, én Fordel pr. kolonne.
  const old = toClass(parseCsv(readFileSync(join(DATA, 'fordel_gamle_grupper_16.csv'), 'utf8')), 'g');
  const oldColumns = Object.keys(old.rows[0]).filter((c) => c !== '_rowId');
  add('gamle-grupper-fem-fordel', 'Fem Fordel-regler på tidligere grupperinger (4 pr. gruppe).', old, {
    rules: oldColumns.map((column) => ({ type: 'distribute', column })),
    size: { mode: 'perGroup', target: 4, adjust: 'plus' },
  });
  add('gamle-grupper-tre-grupper', 'Fem Fordel-regler, "3 grupper".', old, {
    rules: oldColumns.map((column) => ({ type: 'distribute', column })),
    size: { mode: 'count', count: 3 },
  });
  add('gamle-grupper-saml', 'Saml på den nyeste gamle gruppering, Fordel på de andre.', old, {
    rules: [{ type: 'group_sort', column: oldColumns[0] }, ...oldColumns.slice(1).map((column) => ({ type: 'distribute', column }))],
    size: { mode: 'perGroup', target: 4, adjust: 'minus' },
  });
  return cases;
}
