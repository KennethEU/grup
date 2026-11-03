// Test af dommeren på de genererede testklasser og af selve generatoren.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge } from '../judge.mjs';
import { buildTask } from '../task.mjs';
import { expectedLayout } from '../sizes.mjs';
import { randomGroupings } from '../rank.mjs';
import { expectedTopics } from '../topics.mjs';
import { validateInput } from '../validate.mjs';
import { makePlanted } from '../../testdata/gen/planted.mjs';
import { makeRandomInput } from '../../testdata/gen/random-class.mjs';
import { buildSet, SET_NAME } from '../../testdata/gen/build-set.mjs';
import { seedFromText } from '../random.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SET_DIR = join(ROOT, 'testdata', SET_NAME);
// De faste sæt. Sæt 2 er lavet med andre frø, så motoren ikke er indstillet efter det.
const SETS = ['saet-1', 'saet-2'];

function allZero(grade) {
  const problems = [];
  if (grade.failures.length) problems.push(...grade.failures.map((f) => f.text));
  for (const r of grade.rules) if (Math.abs(r.value) > 1e-12) problems.push(`${r.name} på "${r.column}" = ${r.value}`);
  if (grade.avoid.value !== 0) problems.push(`Undgå = ${grade.avoid.value}`);
  for (const v of grade.precedence.vector) if (Math.abs(v) > 1e-12) problems.push(`række ${grade.precedence.vector}`);
  return problems;
}

test('plantede klasser: den plantede deling giver 0 overalt (200 frø)', () => {
  for (let i = 0; i < 200; i++) {
    const { input, answer } = makePlanted(seedFromText(`test:plantet:${i}`));
    const problems = allZero(judge(input, answer, { samples: 5 }));
    assert.deepEqual(problems, [], `frø ${i}`);
  }
});

for (const set of SETS) {
  test(`plantede klasser i ${set}: facit giver 0 overalt`, () => {
    const setDir = join(ROOT, 'testdata', set);
    const facitDir = join(ROOT, 'testdata', `${set}-facit`);
    const files = readdirSync(facitDir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 48);
    for (const file of files) {
      const input = JSON.parse(readFileSync(join(setDir, file), 'utf8'));
      const answer = JSON.parse(readFileSync(join(facitDir, file), 'utf8'));
      assert.deepEqual(allZero(judge(input, answer, { samples: 5 })), [], file);
    }
  });
}

test('plantede klasser: en ødelagt plantet deling giver mere end 0', () => {
  let caught = 0;
  for (let i = 0; i < 50; i++) {
    const { input, answer } = makePlanted(seedFromText(`test:plantet:${i}`));
    if (answer.groups.length < 2) continue;
    // Byt to elever mellem to grupper.
    const broken = structuredClone(answer);
    const [a, b] = broken.groups;
    [a.members[0], b.members[0]] = [b.members[0], a.members[0]];
    const grade = judge(input, broken, { samples: 5 });
    if (allZero(grade).length) caught++;
  }
  assert.ok(caught >= 35, `kun ${caught} af 50 ødelagte delinger blev opdaget`);
});

test('bedst mulige er en nedre grænse: intet svar kommer under den', () => {
  for (let i = 0; i < 60; i++) {
    const input = makeRandomInput(seedFromText(`test:grænse:${i}`));
    const task = buildTask(input);
    const layout = expectedLayout(task);
    if (layout.total <= 0) continue;
    for (const groups of randomGroupings(task, layout, 5, i)) {
      const grade = judge(input, { status: 'ok', groups: groups.map((members) => ({ members, topic: null })) }, { samples: 3 });
      for (const r of grade.rules) if (r.best !== null) assert.ok(r.value >= r.best - 1e-9, `${i}: ${r.name} ${r.value} < ${r.best}`);
      assert.ok(grade.avoid.value >= grade.avoid.best);
      if (grade.matrixSources) assert.ok(grade.matrixSources.value >= grade.matrixSources.best);
    }
  }
});

for (const set of SETS) test(`dommeren kan bedømme alle 300 input i ${set} uden at gå i stykker`, () => {
  const setDir = join(ROOT, 'testdata', set);
  const files = readdirSync(setDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  assert.equal(files.length, 300);
  for (const file of files) {
    const input = JSON.parse(readFileSync(join(setDir, file), 'utf8'));
    assert.deepEqual(validateInput(input), [], file);
    const task = buildTask(input);
    const layout = expectedLayout(task);
    const groups = layout.total > 0 ? randomGroupings(task, layout, 1, 1)[0] : [];
    const topics = expectedTopics(task, groups);
    const answer = { status: 'ok', groups: groups.map((members, i) => ({ members, topic: topics.groupTopics[i] })), lockedTopics: topics.lockedTopics };
    const grade = judge(input, answer, { samples: 3 });
    // En tilfældig deling i de rigtige størrelser må kun fejle på det, den
    // ikke tager hensyn til: Skal sammen, stop og matrix-kilderne.
    const unexpected = grade.failures.filter((f) => !['together', 'stop', 'matrix', 'membership'].includes(f.check));
    assert.deepEqual(unexpected, [], file);
  }
});

for (const set of SETS) test(`${set} på disken er præcis det, generatoren laver (kan genskabes)`, () => {
  const entries = buildSet(set);
  assert.equal(entries.length, 300);
  for (const entry of entries) {
    const onDisk = JSON.parse(readFileSync(join(ROOT, 'testdata', set, entry.file), 'utf8'));
    assert.deepEqual(onDisk, entry.input, entry.file);
  }
});

test('sæt 2 har ingen klasser fælles med sæt 1', () => {
  const classes = (set) => new Set(readdirSync(join(ROOT, 'testdata', set)).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => JSON.stringify(JSON.parse(readFileSync(join(ROOT, 'testdata', set, f), 'utf8')).students)));
  const one = classes('saet-1');
  const shared = [...classes('saet-2')].filter((c) => one.has(c));
  assert.equal(shared.length, 0);
});

test('generatoren: samme frø giver samme klasse, og alle er gyldige', () => {
  for (let i = 0; i < 100; i++) {
    const seed = seedFromText(`test:gen:${i}`);
    const a = makeRandomInput(seed);
    assert.deepEqual(a, makeRandomInput(seed));
    assert.deepEqual(validateInput(a), []);
    assert.ok(a.students.length >= 1 && a.students.length <= 300);
  }
});

test('generatoren dækker det, testklasserne skal have', () => {
  const index = JSON.parse(readFileSync(join(SET_DIR, '_index.json'), 'utf8')).entries;
  const inputs = index.map((e) => JSON.parse(readFileSync(join(SET_DIR, e.file), 'utf8')));
  const all = (fn) => inputs.some(fn);
  const cells = (input) => input.students.flatMap((s) => Object.entries(s).filter(([k]) => k !== '_rowId').map(([, v]) => v));
  assert.ok(all((x) => x.students.length >= 250), 'et hold på 250+');
  assert.ok(all((x) => x.students.length <= 10), 'et lille hold');
  assert.ok(all((x) => cells(x).includes('')), 'tomme celler');
  assert.ok(all((x) => cells(x).some((v) => /^\d+,\d+$/.test(v))), 'decimalkomma');
  assert.ok(all((x) => cells(x).some((v) => v !== v.trim())), 'mellemrum i enderne');
  assert.ok(all((x) => x.columnOrders.Niveau) && all((x) => x.rules.some((r) => r.column === 'Niveau') && !x.columnOrders.Niveau), 'Niveau med og uden rangering');
  assert.ok(all((x) => x.agreements.together.length) && all((x) => x.agreements.avoid.length), 'aftaler');
  assert.ok(all((x) => x.lockedGroups.length) && all((x) => x.topics.length), 'låste grupper og emner');
  assert.ok(all((x) => x.view === 'matrix' && x.size.mode === 'full') && all((x) => x.view === 'matrix' && x.size.mode !== 'full'), 'matrix');
  for (const type of ['distribute', 'separate', 'strict_separate', 'cluster', 'balance', 'minimizediff', 'group_sort', 'aggregate']) {
    assert.ok(all((x) => x.rules.some((r) => r.type === type)), type);
  }
  assert.ok(all((x) => x.rules.length === 6) && all((x) => x.rules.length === 1), '1–6 regler');
});
