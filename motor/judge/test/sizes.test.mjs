// Test af regnereglen for gruppestørrelser (spec. afsnit 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitEven, groupsForTarget, allocateGroups, isBalancedAllocation, expectedLayout } from '../sizes.mjs';
import { buildTask } from '../task.mjs';
import { makeInput, studentsOf } from './helpers.mjs';

const sizesFor = (n, target, adjust) => splitEven(n, groupsForTarget(n, target, adjust));

test('eksemplerne fra spec. 4.1 (4 pr. gruppe)', () => {
  assert.deepEqual(sizesFor(26, 4, 'plus'), [5, 5, 4, 4, 4, 4]);
  assert.deepEqual(sizesFor(26, 4, 'minus'), [4, 4, 4, 4, 4, 3, 3]);
  assert.deepEqual(sizesFor(5, 4, 'plus'), [5]);
  assert.deepEqual(sizesFor(5, 4, 'minus'), [3, 2]);
});

test('"+1" giver målet eller én over, "-1" målet eller under', () => {
  for (let n = 1; n <= 300; n++) {
    for (const t of [2, 3, 4, 5, 6]) {
      const plus = sizesFor(n, t, 'plus');
      const minus = sizesFor(n, t, 'minus');
      assert.equal(plus.reduce((a, b) => a + b, 0), n);
      assert.equal(minus.reduce((a, b) => a + b, 0), n);
      // "+1": aldrig mere end én over målet. (Lægges en gruppe til, kan nogle
      // komme under: 5 elever, 3 pr. gruppe → 3 og 2.)
      if (n >= t) assert.ok(Math.max(...plus) <= t + 1, `plus ${n}/${t}: ${plus}`);
      if (n >= t && n % t <= Math.floor(n / t)) assert.ok(Math.min(...plus) >= t, `plus ${n}/${t}: ${plus}`);
      assert.ok(Math.max(...minus) <= t, `minus ${n}/${t}: ${minus}`);
      assert.ok(Math.max(...plus) - Math.min(...plus) <= 1);
    }
  }
});

test('grupper mellem puljer: så ens som muligt, hver pulje mindst én', () => {
  assert.deepEqual(allocateGroups([12, 4], 4), [3, 1]);
  assert.deepEqual(allocateGroups([10, 10, 10], 2), [1, 1, 1]);
  assert.ok(isBalancedAllocation([12, 4], [3, 1]));
  assert.ok(!isBalancedAllocation([12, 4], [2, 2]));
  assert.ok(isBalancedAllocation([6, 6], [2, 1]) && isBalancedAllocation([6, 6], [1, 2]));
});

test('antal grupper: de låste tæller med, og aldrig flere grupper end elever', () => {
  const locked = [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2'], topic: null }];
  const task = buildTask(makeInput({ students: studentsOf(12, () => ({})), locked, size: { mode: 'count', count: 4 } }));
  assert.equal(expectedLayout(task).total, 3);
  const many = buildTask(makeInput({ students: studentsOf(6, () => ({})), size: { mode: 'count', count: 10 } }));
  assert.deepEqual(expectedLayout(many).pools[0].sizes, [1, 1, 1, 1, 1, 1]);
});

test('emner runder det samlede antal (spec. 4.4)', () => {
  const round = (n, topics, adjust = 'plus') =>
    expectedLayout(buildTask(makeInput({ students: studentsOf(n, () => ({})), topics: ['A', 'B', 'C', 'D', 'E'].slice(0, topics), size: { mode: 'perGroup', target: 4, adjust } }))).total;
  assert.equal(round(24, 5), 5); // 6 → 5, grupperne bliver højst 5
  assert.equal(round(26, 4), 6); // 4 grupper ville give 7 → beholder 6
  assert.equal(round(26, 4, 'minus'), 8); // 7 → 8 (grupper på 3 og 4)
  assert.equal(round(26, 1), 6); // ét emne runder ikke
});

test('emner: låste grupper tæller med i det, der rundes', () => {
  const locked = [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2', 'x3', 'x4'], topic: 'A' }];
  // 20 frie, 4 pr. gruppe "+1" → 5 nye + 1 låst = 6 → rundes til 6 (3 emner): ingen ændring.
  const task = buildTask(makeInput({ students: studentsOf(20, () => ({})), locked, topics: ['A', 'B', 'C'], size: { mode: 'perGroup', target: 4, adjust: 'plus' } }));
  assert.equal(expectedLayout(task).total, 5);
  // 4 emner: 6 → 4 i alt → 3 nye á 6–7 elever: for store → beholder 5.
  const task4 = buildTask(makeInput({ students: studentsOf(20, () => ({})), locked, topics: ['A', 'B', 'C', 'D'], size: { mode: 'perGroup', target: 4, adjust: 'plus' } }));
  assert.equal(expectedLayout(task4).total, 5);
  // 4 emner med "-1": 5 nye + 1 = 6 → 8 i alt → 7 nye á 2–3: for små (mål 4, højst én under) → beholder 5.
  const task4m = buildTask(makeInput({ students: studentsOf(20, () => ({})), locked, topics: ['A', 'B', 'C', 'D'], size: { mode: 'perGroup', target: 4, adjust: 'minus' } }));
  assert.equal(expectedLayout(task4m).total, 5);
});

test('emner: rundingen sker på låste + nye', () => {
  const locked = [{ id: 'L1', number: 1, name: 'Gruppe 1', members: ['x1', 'x2', 'x3', 'x4'], topic: 'A' }];
  // 24 frie, 4 pr. gruppe "+1" → 6 nye + 1 låst = 7 → rundes ned til 6 (3 emner) → 5 nye á 4–5.
  const task = buildTask(makeInput({ students: studentsOf(24, () => ({})), locked, topics: ['A', 'B', 'C'], size: { mode: 'perGroup', target: 4, adjust: 'plus' } }));
  assert.equal(expectedLayout(task).total, 5);
});

test('Opdel med "elever pr. gruppe": hver pulje regner for sig', () => {
  const students = studentsOf(14, (i) => ({ Hold: i <= 9 ? 'a' : 'b' }));
  const task = buildTask(makeInput({ students, rules: [{ type: 'aggregate', column: 'Hold' }], size: { mode: 'perGroup', target: 4, adjust: 'plus' } }));
  const layout = expectedLayout(task);
  assert.deepEqual(layout.pools.map((p) => p.sizes), [[5, 4], [5]]);
});

test('matrix "Fuld": antal grupper = den mindste kilde', () => {
  const task = buildTask(makeInput({
    view: 'matrix',
    students: studentsOf(14, () => ({})),
    size: { mode: 'full' },
    matrix: { source: 'homeGroup', homeGroups: [
      { id: 'S1', members: ['s1', 's2', 's3', 's4', 's5'], topic: null },
      { id: 'S2', members: ['s6', 's7', 's8', 's9', 's10'], topic: null },
      { id: 'S3', members: ['s11', 's12', 's13', 's14'], topic: null },
    ] },
  }));
  const layout = expectedLayout(task);
  assert.equal(layout.total, 4);
  assert.deepEqual(layout.pools[0].sizes, [4, 4, 3, 3]);
});

test('puljer ved lighed: den største pulje vinder, så den, der optræder først (svar6 37)', () => {
  assert.deepEqual(allocateGroups([6, 6], 3), [2, 1]);
  assert.deepEqual(allocateGroups([4, 8], 4), [1, 3]); // 4/1 = 8/2: den største pulje (8) får gruppen
  assert.deepEqual(allocateGroups([8, 4], 4), [3, 1]);
  assert.ok(isBalancedAllocation([4, 8], [2, 2])); // lige godt, men ikke efter reglen
});

test('emner og Opdel: hver pulje regner for sig, og rundingen kræver, at alle puljer holder størrelsen (svar7 40)', () => {
  // Som 207 i sæt 1: 7 og 8 elever, 2 pr. gruppe "+1", 5 emner. Pr. pulje 3 + 4 = 7.
  // Ned til 5 ville give grupper på 4 i den ene pulje (to over målet) → ingen runding.
  const students = studentsOf(15, (i) => ({ Hold: i <= 7 ? 'a' : 'b' }));
  const task = buildTask(makeInput({ students, rules: [{ type: 'aggregate', column: 'Hold' }], topics: ['A', 'B', 'C', 'D', 'E'], size: { mode: 'perGroup', target: 2, adjust: 'plus' } }));
  const layout = expectedLayout(task);
  assert.equal(layout.total, 7);
  assert.deepEqual(layout.pools.map((p) => p.groups), [3, 4]);
});

test('"-1" med færre grupper end emner: hvert emne får én gruppe (svar7 41)', () => {
  // Som 164 i sæt 1: 21 elever, 6 pr. gruppe "-1" → 4 grupper; 5 emner → 5 grupper på 4–5.
  const task = buildTask(makeInput({ students: studentsOf(21, () => ({})), topics: ['A', 'B', 'C', 'D', 'E'], size: { mode: 'perGroup', target: 6, adjust: 'minus' } }));
  assert.deepEqual(expectedLayout(task).pools[0].sizes, [5, 4, 4, 4, 4]);
  // Med flere grupper end emner gælder grænsen "højst én under" stadig: 26 elever,
  // 4 pr. gruppe "-1" → 7; op til 9 (3 emner) ville give grupper på 2 → ingen runding.
  const other = buildTask(makeInput({ students: studentsOf(26, () => ({})), topics: ['A', 'B', 'C'], size: { mode: 'perGroup', target: 4, adjust: 'minus' } }));
  assert.equal(expectedLayout(other).total, 7);
  // "+1" har ingen undtagelse: 8 elever, 4 pr. gruppe, 3 emner → 2 grupper.
  const plus = buildTask(makeInput({ students: studentsOf(8, () => ({})), topics: ['A', 'B', 'C'], size: { mode: 'perGroup', target: 4, adjust: 'plus' } }));
  assert.equal(expectedLayout(plus).total, 2);
});
