// Fra kontraktens input til en "opgave" (specifikation afsnit 3).
//
// Opgaven er klassen gjort klar til motoren: hver elev får et nummer (0, 1, 2
// …), hver regel får sine behandlede værdier (tekst gjort ens, tal læst,
// rangering), og Opdel deler eleverne i puljer. Alle små regler om data bor
// her, så resten af motoren aldrig selv skal tænke på dem.

import { normalizeText, parseNumber, mostFrequentSpellings } from './values.js';

// Regeltyperne i kontrakten og deres danske navne.
export const RULE_NAMES = {
  aggregate: 'Opdel',
  strict_separate: 'Adskil altid',
  separate: 'Adskil',
  cluster: 'Klyng',
  distribute: 'Fordel',
  balance: 'Balancér',
  minimizediff: 'Ensartede',
  group_sort: 'Saml',
};

const NUMERIC_TYPES = new Set(['balance', 'minimizediff', 'group_sort']);

export function buildTask(input) {
  const ids = (input.students || []).map((row) => row._rowId);
  const rows = input.students || [];
  const n = ids.length;
  const indexOf = new Map(ids.map((id, i) => [id, i]));

  const columnOrders = input.columnOrders || {};
  const rules = (input.rules || []).map((rule, index) => prepareRule(rule, index, rows, columnOrders));

  // Puljer: kombinationen af alle Opdel-værdier (spec. 3.5). Puljerne står i
  // den rækkefølge, deres første elev står i klassen.
  const splitRules = rules.filter((rule) => rule.type === 'aggregate');
  const poolOf = new Int32Array(n);
  const pools = [];
  const poolByKey = new Map();
  for (let i = 0; i < n; i++) {
    const parts = splitRules.map((rule) => (rule.textId[i] >= 0 ? rule.valueKeys[rule.textId[i]] : ''));
    const key = JSON.stringify(parts);
    let pool = poolByKey.get(key);
    if (!pool) {
      const values = splitRules.map((rule, r) => (parts[r] === '' ? '' : rule.spellings.get(parts[r]) ?? parts[r]));
      pool = {
        index: pools.length,
        key,
        name: splitRules.length ? values.map((v) => (v === '' ? 'ikke udfyldt' : v)).join(' + ') : null,
        values: splitRules.length ? values : null,
        members: [],
      };
      poolByKey.set(key, pool);
      pools.push(pool);
    }
    poolOf[i] = pool.index;
    pool.members.push(i);
  }

  const locked = (input.lockedGroups || []).map((group) => ({
    id: group.id,
    number: group.number ?? null,
    name: group.name ?? null,
    members: group.members || [],
    topic: group.topic ?? null,
  }));
  const lockedIds = new Set(locked.flatMap((group) => group.members));

  const agreements = input.agreements || {};
  const view = input.view === 'matrix' ? 'matrix' : 'home';
  const task = {
    input,
    view,
    n,
    ids,
    indexOf,
    rules,
    splitRules,
    pools,
    poolOf,
    locked,
    lockedIds,
    // Skal sammen gælder kun stamgrupper (spec. 5).
    together: view === 'home' ? (agreements.together || []).map((list) => list.slice()) : [],
    // Undgå hinanden som elevnumre; kun elever, der er med i dannelsen.
    avoid: (agreements.avoid || [])
      .map((list) => [...new Set(list.filter((id) => indexOf.has(id)).map((id) => indexOf.get(id)))])
      .filter((list) => list.length >= 2),
    avoidIds: agreements.avoid || [],
    topics: input.topics || [],
    size: input.size || { mode: 'perGroup', target: 4, adjust: 'plus' },
    matrix: null,
  };
  if (view === 'matrix' && input.matrix) task.matrix = prepareMatrix(input.matrix, indexOf, n);
  return task;
}

// En regel med behandlede værdier:
//   textId[i]   – elevens værdi som nummer (indeks i valueKeys), −1 = tom,
//   marked[i]   – (Adskil og Adskil altid) har eleven en af de valgte værdier,
//   num[i]      – (talregler) elevens tal, NaN = ikke udfyldt for reglen.
function prepareRule(rule, index, rows, columnOrders) {
  const column = rule.column;
  const n = rows.length;
  const cells = rows.map((row) => row[column] ?? '');
  const prepared = {
    index,
    type: rule.type,
    name: RULE_NAMES[rule.type] || rule.type,
    column,
    spellings: mostFrequentSpellings(cells),
    valueKeys: [],
    valueCounts: [],
    textId: new Int32Array(n),
    marked: null,
    selected: null,
    num: null,
    ranked: false,
    hasNumbers: false,
    span: 0,
    mode: null,
  };
  const idOf = new Map();
  for (let i = 0; i < n; i++) {
    const key = normalizeText(cells[i]);
    if (key === null) {
      prepared.textId[i] = -1;
      continue;
    }
    let id = idOf.get(key);
    if (id === undefined) {
      id = prepared.valueKeys.length;
      idOf.set(key, id);
      prepared.valueKeys.push(key);
      prepared.valueCounts.push(0);
    }
    prepared.textId[i] = id;
    prepared.valueCounts[id]++;
  }

  if (rule.type === 'separate' || rule.type === 'strict_separate') {
    prepared.selected = new Set((rule.values || []).map(normalizeText).filter((v) => v !== null));
    prepared.marked = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const t = prepared.textId[i];
      if (t >= 0 && prepared.selected.has(prepared.valueKeys[t])) prepared.marked[i] = 1;
    }
  }

  if (NUMERIC_TYPES.has(rule.type)) {
    prepared.num = new Float64Array(n).fill(NaN);
    const order = columnOrders[column];
    if (Array.isArray(order) && order.length) {
      // Med en rangering: første værdi er 1, næste 2 … Andre værdier er tomme.
      const rank = new Map();
      order.forEach((value, i) => {
        const key = normalizeText(value);
        if (key !== null && !rank.has(key)) rank.set(key, i + 1);
      });
      for (let i = 0; i < n; i++) {
        const t = prepared.textId[i];
        if (t >= 0 && rank.has(prepared.valueKeys[t])) prepared.num[i] = rank.get(prepared.valueKeys[t]);
      }
      prepared.ranked = true;
    } else {
      for (let i = 0; i < n; i++) {
        const v = parseNumber(cells[i]);
        if (v !== null) prepared.num[i] = v;
      }
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = prepared.num[i];
      if (Number.isNaN(v)) continue;
      prepared.hasNumbers = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Spændet regnes over alle frie elever i opgaven, også med Opdel (spec. 6.7).
    prepared.span = prepared.hasNumbers ? max - min : 0;
    if (rule.type === 'group_sort') {
      // Saml: med tal eller rangering en blød Ensartede, ellers værditælling (spec. 6.9).
      prepared.mode = prepared.ranked || prepared.hasNumbers ? 'numeric' : 'text';
    }
  }
  return prepared;
}

// Kilderne til "én fra hver" i matrix (spec. 9.2). sourceOf[i] = kildens
// nummer, eller −1 for en elev, der ikke står i nogen stamgruppe.
function prepareMatrix(matrix, indexOf, n) {
  const sourceOf = new Int32Array(n).fill(-1);
  const sources = [];
  const byKey = new Map();
  const bySource = matrix.source === 'homeGroup' ? 'homeGroup' : 'topic';
  for (const home of matrix.homeGroups || []) {
    let key;
    let label;
    if (bySource === 'homeGroup' || home.topic === null || home.topic === undefined) {
      // En stamgruppe uden emne er sit eget emne.
      key = `home:${home.id}`;
      label = home.id;
    } else {
      key = `topic:${home.topic}`;
      label = home.topic;
    }
    let source = byKey.get(key);
    if (!source) {
      source = { index: sources.length, key, label, members: [] };
      byKey.set(key, source);
      sources.push(source);
    }
    for (const id of home.members || []) {
      const i = indexOf.get(id);
      if (i === undefined || sourceOf[i] !== -1) continue;
      sourceOf[i] = source.index;
      source.members.push(i);
    }
  }
  const outside = [];
  for (let i = 0; i < n; i++) if (sourceOf[i] === -1) outside.push(i);
  return { source: bySource, sourceOf, sources, outside };
}
