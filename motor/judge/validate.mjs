// Tjekker, at et input følger kontraktens afsnit 2 (version 2).
// Bruges af testgeneratoren, så alle testklasser er gyldige, og af
// kommandoen, der advarer, hvis et input ikke er det.

const RULE_TYPES = new Set(['distribute', 'separate', 'strict_separate', 'cluster', 'balance', 'minimizediff', 'group_sort', 'aggregate']);
const ORDER_TYPES = new Set(['balance', 'minimizediff', 'group_sort']);

export function validateInput(input) {
  const errors = [];
  const err = (text) => errors.push(text);
  if (!input || typeof input !== 'object') return ['Input er ikke et objekt.'];
  if (input.contractVersion !== 2) err('contractVersion skal være 2.');
  if (!['home', 'matrix'].includes(input.view)) err('view skal være "home" eller "matrix".');
  const students = input.students;
  if (!Array.isArray(students) || students.length === 0) err('students skal være en liste med mindst én elev.');
  if (Array.isArray(students) && students.length > 500) err('Over 500 elever.');
  const ids = new Set();
  const columns = new Set();
  for (const row of students || []) {
    if (typeof row._rowId !== 'string' || row._rowId === '') err('En elev mangler _rowId.');
    if (ids.has(row._rowId)) err(`_rowId "${row._rowId}" står to gange.`);
    ids.add(row._rowId);
    for (const [key, value] of Object.entries(row)) {
      if (key === '_rowId') continue;
      columns.add(key);
      if (typeof value !== 'string') err(`Værdien i "${key}" for ${row._rowId} er ikke tekst.`);
    }
  }
  for (const column of columns) {
    for (const row of students || []) {
      if (!(column in row)) err(`Kolonnen "${column}" mangler hos ${row._rowId}.`);
    }
  }
  const usedColumns = new Set();
  for (const rule of input.rules || []) {
    if (!RULE_TYPES.has(rule.type)) err(`Ukendt regeltype "${rule.type}".`);
    if (!columns.has(rule.column)) err(`Regel-kolonnen "${rule.column}" findes ikke hos eleverne.`);
    usedColumns.add(rule.column);
    const hasValues = rule.type === 'separate' || rule.type === 'strict_separate';
    if (hasValues && (!Array.isArray(rule.values) || rule.values.length === 0)) err(`${rule.type} uden values.`);
    if (!hasValues && rule.values !== undefined) err(`${rule.type} må ikke have values.`);
  }
  for (const column of columns) if (!usedColumns.has(column)) err(`Kolonnen "${column}" bruges ikke af en regel.`);
  const orderColumns = new Set((input.rules || []).filter((r) => ORDER_TYPES.has(r.type)).map((r) => r.column));
  for (const column of Object.keys(input.columnOrders || {})) {
    if (!orderColumns.has(column)) err(`columnOrders for "${column}", som ingen Balancér/Ensartede/Saml bruger.`);
  }
  const lockedMembers = new Set();
  const lockedNumbers = new Set();
  for (const group of input.lockedGroups || []) {
    if (typeof group.id !== 'string') err('En låst gruppe mangler id.');
    if (!Number.isInteger(group.number)) err(`Låst gruppe ${group.id} mangler number.`);
    if (lockedNumbers.has(group.number)) err(`To låste grupper har nummer ${group.number}.`);
    lockedNumbers.add(group.number);
    for (const id of group.members || []) {
      if (ids.has(id)) err(`${id} står både i students og i en låst gruppe.`);
      lockedMembers.add(id);
    }
    if (input.view === 'matrix' && group.topic !== null) err('Låste matrixgrupper har ikke emner.');
  }
  const agreements = input.agreements || {};
  for (const list of agreements.avoid || []) {
    if (list.length < 2) err('En Undgå-aftale har under to elever.');
    for (const id of list) if (!ids.has(id)) err(`Undgå-aftale med ${id}, som ikke er i students.`);
  }
  const inBlock = new Set();
  for (const list of agreements.together || []) {
    if (list.length < 2) err('En Skal sammen-blok har under to elever.');
    if (list.every((id) => lockedMembers.has(id))) err('En Skal sammen-blok, hvor alle er låste, må ikke sendes.');
    for (const id of list) {
      if (!ids.has(id) && !lockedMembers.has(id)) err(`Skal sammen med ${id}, som hverken er fri eller låst.`);
      if (inBlock.has(id)) err(`${id} står i to blokke (de skal være lagt sammen).`);
      inBlock.add(id);
    }
  }
  if (input.view === 'matrix' && (agreements.together || []).length) err('I matrix er together altid tom.');
  const size = input.size || {};
  if (size.mode === 'perGroup') {
    if (!Number.isInteger(size.target) || size.target < 1 || size.target > 999) err('target skal være 1–999.');
    if (!['plus', 'minus'].includes(size.adjust)) err('adjust skal være "plus" eller "minus".');
  } else if (size.mode === 'count') {
    if (!Number.isInteger(size.count) || size.count < 1 || size.count > 999) err('count skal være 1–999.');
    if (size.count <= (input.lockedGroups || []).length) err('count skal være større end antallet af låste grupper.');
  } else if (size.mode === 'full') {
    if (input.view !== 'matrix') err('size "full" kun i matrix.');
  } else err('Ukendt size.mode.');
  if (!Array.isArray(input.topics)) err('topics skal være en liste.');
  if (input.view === 'matrix' && (input.topics || []).length) err('topics er altid tom i matrix.');
  if (input.view === 'matrix') {
    const m = input.matrix;
    if (!m || !['topic', 'homeGroup'].includes(m.source) || !Array.isArray(m.homeGroups)) err('matrix skal have source og homeGroups.');
  } else if (input.matrix !== null && input.matrix !== undefined) err('matrix skal være null for stamgrupper.');
  const budget = input.budget || {};
  for (const key of ['maxSeconds', 'maxAttempts', 'minAttempts']) {
    if (typeof budget[key] !== 'number') err(`budget.${key} mangler.`);
  }
  if (!(input.seed === null || Number.isInteger(input.seed))) err('seed skal være et heltal eller null.');
  return errors;
}
