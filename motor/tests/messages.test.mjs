// Beskeder og tal i svaret efter Kenneths prøve og kodegennemgangen:
// matrix-kilder, Fordel og dagens test, ugyldigt input, fremgang og
// forsøgets nummer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { run, check } from '../engine/engine.js';

const load = (file) => JSON.parse(readFileSync(file, 'utf8'));

// Matrix med "antal grupper" 6, 28 elever og kun to kilder (emner): Ukraine 12
// og Island 16. "Højst én fra hver kilde" kan ikke holde.
function matrixInput() {
  const students = Array.from({ length: 28 }, (_, i) => ({ _rowId: `e${i}`, Køn: i % 2 ? 'Pige' : 'Dreng' }));
  const ids = students.map((s) => s._rowId);
  return {
    contractVersion: 3,
    view: 'matrix',
    students,
    rules: [{ type: 'distribute', column: 'Køn' }],
    columnOrders: {},
    agreements: { together: [], avoid: [] },
    lockedGroups: [],
    size: { mode: 'count', count: 6 },
    topics: [],
    matrix: {
      source: 'topic',
      homeGroups: [
        { id: 'H1', members: ids.slice(0, 6), topic: 'Ukraine' },
        { id: 'H2', members: ids.slice(6, 12), topic: 'Ukraine' },
        { id: 'H3', members: ids.slice(12, 20), topic: 'Island' },
        { id: 'H4', members: ids.slice(20, 28), topic: 'Island' },
      ],
    },
    budget: { maxSeconds: 2, maxAttempts: 5 },
    seed: 1,
  };
}

test('matrix med færre kilder end pladser: én note (ikke rød), den samme i check og efter kørslen', async () => {
  const input = matrixInput();
  const key = (m) => `${m.code}|${m.rule}|${m.pool}|${m.values.join('/')}`;
  const before = check(input).messages.filter((m) => m.code === 'matrix-sources-spread');
  const answer = await run(input, {});
  const after = answer.messages.filter((m) => m.code === 'matrix-sources-spread');
  assert.equal(before.length, 1);
  assert.deepEqual(after, before);
  assert.equal(before[0].type, 'note');
  assert.match(before[0].text, /2 fra "Ukraine" og 2–3 fra "Island"/);
  assert.equal(key(before[0]), key(after[0]));
  // Ingen røde beskeder og intet om "par" (kilderne er ved det bedst mulige).
  assert.ok(!answer.messages.some((m) => m.type === 'impossible' || / par /.test(m.text)));
});

// Kodegennemgangens fund 1: 5 A og 4 B i grupper på 5 og 4. AAABB + AABB
// består dagens test; AABBB + AAAB har samme retfærdige antal, men ikke.
test('Fordel: motoren vælger en deling, der består dagens test, når den findes', async () => {
  const students = 'AAAAABBBB'.split('').map((v, i) => ({ _rowId: `r${i}`, Køn: v }));
  const base = {
    contractVersion: 3,
    view: 'home',
    students,
    rules: [{ type: 'distribute', column: 'Køn' }],
    columnOrders: {},
    agreements: { together: [], avoid: [] },
    lockedGroups: [],
    size: { mode: 'perGroup', target: 4, adjust: 'plus' },
    topics: [],
    budget: { maxSeconds: 1, maxAttempts: 3 },
  };
  for (let seed = 1; seed <= 20; seed++) {
    const answer = await run({ ...base, seed }, {});
    assert.equal(answer.rules[0].met, true, `frø ${seed}`);
  }
});

test('Fordel: "kunne ikke undgås" kun, når dagens test beviseligt ikke kan bestås', async () => {
  // 7 A og 1 B i to grupper på 4: B kan kun være i én gruppe, så den anden
  // gruppe mangler en værdi (dagens test kan ikke bestås).
  const students = 'AAAAAAAB'.split('').map((v, i) => ({ _rowId: `r${i}`, Køn: v }));
  const answer = await run(
    {
      contractVersion: 3,
      view: 'home',
      students,
      rules: [{ type: 'distribute', column: 'Køn' }],
      columnOrders: {},
      agreements: { together: [], avoid: [] },
      lockedGroups: [],
      size: { mode: 'perGroup', target: 4, adjust: 'plus' },
      topics: [],
      budget: { maxSeconds: 1, maxAttempts: 3 },
      seed: 1,
    },
    {},
  );
  const note = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === 0);
  assert.equal(note.unavoidable, true);
});

test('Fordel: "kunne ikke undgås" i sæt 1 hviler altid på beviset fra bounds.js', async () => {
  const { buildTask } = await import('../engine/task.js');
  const { computeLayout } = await import('../engine/sizes.js');
  const { computeBounds } = await import('../engine/bounds.js');
  const { readdirSync } = await import('node:fs');
  let checked = 0;
  for (const file of readdirSync('testdata/saet-1').filter((f) => f.endsWith('.json') && !f.startsWith('_')).filter((_, i) => i % 5 === 0)) {
    const input = load(`testdata/saet-1/${file}`);
    if (!input.rules.some((r) => r.type === 'distribute')) continue;
    const answer = await run({ ...input, seed: 1, budget: { maxSeconds: 1, maxAttempts: 2, minAttempts: 1 } }, {});
    if (answer.status !== 'ok') continue;
    const task = buildTask(input);
    const bounds = computeBounds(task, computeLayout(task));
    for (const m of answer.messages) {
      if (m.code !== 'rule-not-met' || m.rule === null || input.rules[m.rule].type !== 'distribute' || !m.unavoidable) continue;
      // Beviset gælder beskedens egen pulje (spørgsmål 47).
      const p = m.pool === null ? 0 : task.pools.findIndex((pool) => pool.name === m.pool);
      assert.ok(bounds.get(m.rule)?.pools?.[p], `${file} regel ${m.rule} pulje ${m.pool}`);
      checked++;
    }
  }
  assert.ok(checked > 5, `kun ${checked} tjekket`);
});

test('ugyldigt input (ingen elever): unsupported med en grund, ikke "umulig" uden besked', async () => {
  const input = { ...load('testdata/saet-1/010-rigtig-realistisk-seks-regler.json'), students: [], seed: 1 };
  const answer = await run(input, {});
  assert.equal(answer.status, 'unsupported');
  assert.equal(answer.reason.code, 'invalid-input');
  assert.ok(answer.reason.text.length > 0);
  assert.equal(check(input).status, 'unsupported');
});

test('stats: vinderens nummer, antal forsøg og andre lige så gode; fremgang tæller ikke "ikke målt"', async () => {
  const input = { ...load('testdata/saet-1/116-tilfaeldig-12.json'), seed: 2, budget: { maxSeconds: 2, maxAttempts: 8, minAttempts: 2 } };
  let last = null;
  const answer = await run(input, { onProgress: (p) => (last = p.progress) });
  const { attempts, winner, sameAsWinner } = answer.stats;
  assert.ok(Number.isInteger(winner) && winner >= 1 && winner <= attempts);
  assert.ok(Number.isInteger(sameAsWinner) && sameAsWinner >= 0 && sameAsWinner <= attempts - 1);
  const measured = answer.rules.filter((r) => r.met !== null).length;
  assert.equal(last.rulesTotal, measured);
  assert.equal(last.rulesMet, answer.rules.filter((r) => r.met === true).length);
});

// Matrixens beskeder siger "stamgruppe" (eller "emne", når der blandes på emne)
// — aldrig motorens eget ord "kilde", som læreren ikke ser andre steder — og de
// forklarer, hvad læreren kan gøre (Kenneth 4/11 2026).
function unevenMatrix(source, topics, size) {
  const ids = Array.from({ length: 29 }, (_, i) => `r${i}`);
  let at = 0;
  const homeGroups = [5, 5, 5, 7, 7].map((n, i) => {
    const members = ids.slice(at, at + n);
    at += n;
    return { id: `Gruppe ${i + 1}`, members, topic: topics ? topics[i] : null };
  });
  return {
    contractVersion: 3, view: 'matrix', students: ids.map((id) => ({ _rowId: id })), rules: [], columnOrders: {},
    agreements: { together: [], avoid: [] }, lockedGroups: [], size, topics: [],
    matrix: { source, homeGroups }, budget: { maxSeconds: 2, maxAttempts: 3 }, seed: 1,
  };
}

test('matrix "Fuld" med ulige stamgrupper: forklarer reglen og hvad man kan gøre, uden ordet "kilde"', () => {
  const [m] = check(unevenMatrix('homeGroup', null, { mode: 'full' })).messages.filter((x) => x.code === 'matrix-limited-by');
  assert.equal(m.text,
    'Hver matrixgruppe får én elev fra hver stamgruppe. "Gruppe 1", "Gruppe 2" og "Gruppe 3" har kun 5 elever, så der bliver 5 matrixgrupper. ' +
    'Eleverne til overs fra de større stamgrupper fordeles, så nogle matrixgrupper får to fra samme stamgruppe. ' +
    'Vil du have præcis én fra hver, skal stamgrupperne være lige store: dan dem fx igen med et andet antal grupper.');
});

test('matrix blandet på emne: beskederne siger "emne"', () => {
  const [m] = check(unevenMatrix('topic', ['Klima', 'EU', 'Klima', 'Migration', 'EU'], { mode: 'full' }))
    .messages.filter((x) => x.code === 'matrix-limited-by');
  assert.match(m.text, /^Hver matrixgruppe får én elev fra hvert emne\. Emnet "Migration" har kun 7 elever/);
  assert.match(m.text, /skal emnerne være lige store\.$/);
});

test('ingen matrix-besked siger "kilde"', async () => {
  const inputs = [
    unevenMatrix('homeGroup', null, { mode: 'full' }),
    unevenMatrix('homeGroup', null, { mode: 'count', count: 4 }),
    unevenMatrix('topic', ['Klima', 'EU', 'Klima', 'Migration', 'EU'], { mode: 'full' }),
  ];
  const empty = unevenMatrix('homeGroup', null, { mode: 'full' });
  empty.matrix.homeGroups.push({ id: 'Gruppe 6', members: [], topic: null });
  inputs.push(empty);
  for (const input of inputs) {
    const texts = [...check(input).messages, ...((await run(input, {})).messages || [])].map((x) => x.text);
    assert.ok(texts.length > 0);
    for (const t of texts) assert.ok(!/kilde/i.test(t), t);
  }
  const spread = check(inputs[1]).messages.find((x) => x.code === 'matrix-sources-spread');
  assert.match(spread.text, /skal der være mindst 7 matrixgrupper\.$/);
});
