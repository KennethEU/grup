// Fra kontraktens input til en "opgave" (specifikation afsnit 3).
//
// Opgaven samler alt, dommeren skal bruge for at måle: eleverne, reglerne med
// deres behandlede værdier, puljerne fra Opdel, aftalerne, de låste grupper og
// (i matrix) kilderne. Dommeren og senere motoren bruger samme opgave, så de
// ikke kan være uenige om, hvad en celle betyder.

import { normalizeText, parseNumber, mostFrequentSpellings } from './values.mjs';

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

const NUMERIC_TYPES = new Set(['balance', 'minimizediff']);

export function buildTask(input) {
  const students = new Map();
  const ids = [];
  for (const row of input.students || []) {
    students.set(row._rowId, row);
    ids.push(row._rowId);
  }

  const columnOrders = input.columnOrders || {};
  const rules = (input.rules || []).map((rule, index) =>
    prepareRule(rule, index, ids, students, columnOrders),
  );

  // Puljer: kombinationen af alle Opdel-værdier (spec. 3.5).
  const splitRules = rules.filter((rule) => rule.type === 'aggregate');
  const poolKeyOf = new Map();
  const pools = new Map();
  for (const id of ids) {
    const parts = splitRules.map((rule) => rule.textOf.get(id) ?? '');
    const key = JSON.stringify(parts);
    poolKeyOf.set(id, key);
    if (!pools.has(key)) {
      const display = splitRules.map((rule, i) =>
        parts[i] === '' ? 'ikke udfyldt' : rule.spellings.get(parts[i]) ?? parts[i],
      );
      pools.set(key, {
        key,
        name: splitRules.length ? display.join(' + ') : null,
        ids: [],
      });
    }
    pools.get(key).ids.push(id);
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
  const task = {
    input,
    view: input.view === 'matrix' ? 'matrix' : 'home',
    ids,
    students,
    rules,
    splitRules,
    pools,
    poolKeyOf,
    locked,
    lockedIds,
    together: agreements.together || [],
    avoid: agreements.avoid || [],
    topics: input.topics || [],
    size: input.size || { mode: 'perGroup', target: 4, adjust: 'plus' },
    matrix: null,
  };
  if (task.view === 'matrix' && input.matrix) task.matrix = prepareMatrix(input.matrix, ids);
  return task;
}

function prepareRule(rule, index, ids, students, columnOrders) {
  const column = rule.column;
  const cells = ids.map((id) => students.get(id)?.[column] ?? '');
  const prepared = {
    index,
    type: rule.type,
    name: RULE_NAMES[rule.type] || rule.type,
    column,
    spellings: mostFrequentSpellings(cells),
    textOf: new Map(),
    numberOf: null,
    values: null,
    mode: null,
    span: null,
  };
  ids.forEach((id, i) => prepared.textOf.set(id, normalizeText(cells[i])));

  if (rule.type === 'separate' || rule.type === 'strict_separate') {
    prepared.values = new Set((rule.values || []).map(normalizeText).filter((v) => v !== null));
  }

  const order = columnOrders[column];
  const usesNumbers = NUMERIC_TYPES.has(rule.type) || rule.type === 'group_sort';
  if (usesNumbers) {
    prepared.numberOf = new Map();
    if (Array.isArray(order) && order.length) {
      // Med en rangering: første værdi er 1, næste 2 … Andre værdier er tomme.
      const rank = new Map();
      order.forEach((value, i) => {
        const key = normalizeText(value);
        if (key !== null && !rank.has(key)) rank.set(key, i + 1);
      });
      ids.forEach((id) => {
        const key = prepared.textOf.get(id);
        prepared.numberOf.set(id, key !== null && rank.has(key) ? rank.get(key) : null);
      });
      prepared.ranked = true;
    } else {
      ids.forEach((id, i) => prepared.numberOf.set(id, parseNumber(cells[i])));
      prepared.ranked = false;
    }
    const numbers = [...prepared.numberOf.values()].filter((v) => v !== null);
    prepared.hasNumbers = numbers.length > 0;
    // Spændet regnes over alle frie elever i opgaven, også med Opdel (spec. 6.7).
    prepared.span = numbers.length ? Math.max(...numbers) - Math.min(...numbers) : 0;
    if (rule.type === 'group_sort') {
      // Saml: med tal eller rangering en blød Ensartede, ellers værditælling (spec. 6.9).
      prepared.mode = prepared.ranked || prepared.hasNumbers ? 'numeric' : 'text';
    }
  }
  return prepared;
}

// Kilderne til "én fra hver" i matrix (spec. 9.2).
function prepareMatrix(matrix, ids) {
  const present = new Set(ids);
  const sourceOf = new Map();
  const sources = new Map();
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
    if (!sources.has(key)) sources.set(key, { key, label, ids: [] });
    for (const id of home.members || []) {
      if (!present.has(id) || sourceOf.has(id)) continue;
      sourceOf.set(id, key);
      sources.get(key).ids.push(id);
    }
  }
  return { source: bySource, sourceOf, sources };
}

// Hjælper: hvilken pulje hører en gruppe til? (Den, flest af medlemmerne er i.)
export function poolOfGroup(task, members) {
  const counts = new Map();
  for (const id of members) {
    const key = task.poolKeyOf.get(id);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}
