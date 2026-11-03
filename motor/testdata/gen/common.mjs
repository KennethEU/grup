// Fælles hjælpere til testgeneratoren.
//
// Generatoren laver kontrakt-input (version 2) på samme måde som appen ville:
// fraværende og låste elever er taget ud af students, aftalerne er renset, og
// kun de kolonner, en regel bruger, er med.

import { validateInput } from '../../judge/validate.mjs';

export const TOPIC_POOL = ['Klima', 'EU', 'Medier', 'Migration', 'Energi', 'Demokrati'];

// Budgettet, som appen sender det (kontrakt 2.2).
export function budgetFor(studentCount) {
  return {
    maxSeconds: studentCount > 100 ? 30 : 10,
    maxAttempts: 20,
    minAttempts: studentCount > 60 ? 2 : 3,
  };
}

// Laver det færdige input ud fra en hel klasse og en "dannelse".
// klass: { rows: [{ _rowId, ...kolonner }] } (alle elever, også fraværende)
// setup: { rules, columnOrders, absent, locked, together, avoid, size, topics,
//          view, matrix, seed }
export function buildInput(klass, setup) {
  const absent = new Set(setup.absent || []);
  const locked = (setup.locked || []).map((group) => ({
    ...group,
    members: group.members.filter((id) => !absent.has(id)),
  }));
  const lockedIds = new Set(locked.flatMap((g) => g.members));
  const rules = setup.rules || [];
  const usedColumns = [...new Set(rules.map((r) => r.column))];
  const students = klass.rows
    .filter((row) => !absent.has(row._rowId) && !lockedIds.has(row._rowId))
    .map((row) => {
      const out = { _rowId: row._rowId };
      for (const column of usedColumns) out[column] = row[column] ?? '';
      return out;
    });
  const present = new Set(students.map((s) => s._rowId));

  const together = cleanTogether(setup.together || [], absent, present, lockedIds);
  const avoid = (setup.avoid || [])
    .map((list) => [...new Set(list)].filter((id) => present.has(id)))
    .filter((list) => list.length >= 2);

  const orderColumns = new Set(rules.filter((r) => ['balance', 'minimizediff', 'group_sort'].includes(r.type)).map((r) => r.column));
  const columnOrders = {};
  for (const [column, order] of Object.entries(setup.columnOrders || {})) {
    if (orderColumns.has(column)) columnOrders[column] = order;
  }

  const input = {
    contractVersion: 2,
    view: setup.view || 'home',
    students,
    rules: rules.map((r) => ({ ...r })),
    columnOrders,
    agreements: { together: setup.view === 'matrix' ? [] : together, avoid },
    lockedGroups: locked,
    size: setup.size,
    topics: setup.view === 'matrix' ? [] : setup.topics || [],
    matrix: setup.view === 'matrix' ? setup.matrix : null,
    budget: budgetFor(students.length),
    seed: setup.seed ?? null,
  };
  return input;
}

// Skal sammen som appen sender dem: fraværende ud, lister der deler en elev
// lagt sammen, låste elever bliver stående, blokke med kun låste sendes ikke.
function cleanTogether(lists, absent, present, lockedIds) {
  const blocks = [];
  for (const list of lists) {
    let members = [...new Set(list.filter((id) => !absent.has(id) && (present.has(id) || lockedIds.has(id))))];
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].some((id) => members.includes(id))) {
        members = [...new Set([...blocks[i], ...members])];
        blocks.splice(i, 1);
      }
    }
    blocks.push(members);
  }
  return blocks.filter((b) => b.length >= 2 && !b.every((id) => lockedIds.has(id)));
}

// Kaster en fejl, hvis inputtet ikke følger kontrakten (så generatoren aldrig
// skriver et ugyldigt input).
export function assertValid(input, label) {
  const errors = validateInput(input);
  if (errors.length) throw new Error(`Ugyldigt input (${label}):\n  ${errors.join('\n  ')}`);
  return input;
}
