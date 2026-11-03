// Hjælpere til testene: små input og svar, der er nemme at skrive i hånden.

// Et input (kontrakt v2) med fornuftige standardværdier.
// students: { id: { kolonne: værdi } } eller en liste af id'er.
export function makeInput(options = {}) {
  const studentsSpec = options.students || {};
  const students = Array.isArray(studentsSpec)
    ? studentsSpec.map((id) => ({ _rowId: id }))
    : Object.entries(studentsSpec).map(([id, columns]) => ({ _rowId: id, ...columns }));
  return {
    contractVersion: 2,
    view: options.view || 'home',
    students,
    rules: options.rules || [],
    columnOrders: options.columnOrders || {},
    agreements: { together: options.together || [], avoid: options.avoid || [] },
    lockedGroups: options.locked || [],
    size: options.size || { mode: 'perGroup', target: 4, adjust: 'plus' },
    topics: options.topics || [],
    matrix: options.matrix || null,
    budget: { maxSeconds: 10, maxAttempts: 20, minAttempts: 3 },
    seed: 1,
  };
}

// Et svar med status "ok". groups: [[id, …], …]; topics: emne pr. gruppe.
export function makeAnswer(groups, topics = [], lockedTopics = {}) {
  return {
    contractVersion: 2,
    status: 'ok',
    groups: groups.map((members, i) => ({ members, topic: topics[i] ?? null })),
    lockedTopics,
    messages: [],
    rules: [],
    playback: null,
    stats: { attempts: 1, seconds: 0 },
  };
}

// En klasse på n elever med id'erne s1 … sn og kolonner fra en funktion.
export function studentsOf(n, columns) {
  const result = {};
  for (let i = 1; i <= n; i++) result[`s${i}`] = columns(i);
  return result;
}

export const ids = (...numbers) => numbers.map((n) => `s${n}`);

// Tallene i karakteren for en regel (efter regelnummer).
export function ruleValue(grade, index) {
  return grade.rules.find((r) => r.rule === index).value;
}

export function failureChecks(grade) {
  return grade.failures.map((f) => f.check);
}
