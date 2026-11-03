// Grænsen for Balancér (engine/bounds.js) og budgettet uden frø.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBounds } from '../engine/bounds.js';
import { makeContext, measureBalance } from '../engine/rules.js';
import { run } from '../engine/engine.js';

const load = (file) => JSON.parse(readFileSync(file, 'utf8'));

// Som Kenneths klasse: Fordel Køn og Balancér Niveau (Lav/Middel/Høj). 23
// elever har et niveau (summen 47), én har intet; 6 grupper på 4.
function niveauInput() {
  const input = load('testdata/saet-1/010-rigtig-realistisk-seks-regler.json');
  input.rules = [
    { type: 'distribute', column: 'Køn' },
    { type: 'balance', column: 'Niveau' },
  ];
  input.columnOrders = { ...(input.columnOrders || {}), Niveau: ['Lav', 'Middel', 'Høj'] };
  return input;
}

test('Balancér: grænsen viser, at én gruppe må ligge uden for de 5 %', async () => {
  const input = niveauInput();
  const task = buildTask(input);
  const bound = computeBounds(task, computeLayout(task)).get(1);
  assert.equal(bound.minBad, 1);
  assert.ok(Math.abs(bound.value - 0.42391304) < 1e-6, String(bound.value));

  // Motoren når grænsen i første forsøg, stopper og siger "kunne ikke undgås".
  const answer = await run({ ...input, seed: null, budget: { maxSeconds: 10, maxAttempts: 20 } }, {});
  assert.equal(answer.stats.attempts, 1);
  const note = answer.messages.find((m) => m.code === 'rule-not-met' && m.rule === 1);
  assert.equal(note.unavoidable, true);
  assert.equal(note.likelyBest, false);
  assert.match(note.text, /kunne ikke undgås/);
});

// Facit og den nuværende motors svar. Svar med andre gruppestørrelser end
// opdelingens springes over (fx 274 og 107, hvor den nuværende motor laver
// for mange grupper): de er ikke gyldige delinger.
test('Balancér: grænsen er aldrig over det, gyldige svar faktisk når (sæt 1 og 2)', () => {
  let checked = 0;
  for (const [set, dirs] of [
    ['testdata/saet-1', ['testdata/saet-1-facit', 'testdata/saet-1-nuvaerende']],
    ['testdata/saet-2', ['testdata/saet-2-facit', 'testdata/saet-2-nuvaerende']],
  ]) {
    for (const file of readdirSync(set).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
      const input = load(join(set, file));
      const task = buildTask(input);
      const layout = computeLayout(task);
      if (checkFeasibility(task, layout).reasons.length || !layout.total) continue;
      const bounds = computeBounds(task, layout);
      for (const dir of dirs) {
        if (!bounds.size || !existsSync(join(dir, file))) continue;
        const answer = load(join(dir, file));
        if (!answer.groups) continue;
        const groups = answer.groups.map((g) => (g.members || g).map((id) => task.indexOf.get(id)).filter((s) => s !== undefined));
        const sizes = (list) => list.slice().sort((a, b) => a - b).join(',');
        if (sizes(groups.map((m) => m.length)) !== sizes(layout.groups.map((g) => g.size))) continue;
        const ctx = makeContext(task, groups, groups.map((m) => (m.length ? task.poolOf[m[0]] : 0)));
        for (const [index, bound] of bounds) {
          if (task.rules[index].type !== 'balance') continue;
          const m = measureBalance(ctx, task.rules[index]);
          assert.ok(m.value >= bound.value - 1e-7, `${file} regel ${index}: ${m.value} < ${bound.value}`);
          assert.ok(m.groups.filter((g) => g.met === false).length >= bound.minBad, `${file} regel ${index}: minBad`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100, `kun ${checked} tjekket`);
});

test('uden frø: mindst maxAttempts forsøg (medmindre alt er ved det bedst mulige), og flere, når det stadig bliver bedre', async () => {
  const input = load('testdata/saet-1/116-tilfaeldig-12.json');
  const texts = [];
  const answer = await run(
    { ...input, seed: null, budget: { maxSeconds: 10, maxAttempts: 20, minAttempts: 3 } },
    { onProgress: (p) => texts.push(p.progress.text) },
  );
  assert.equal(answer.status, 'ok');
  assert.ok(answer.stats.attempts >= 20, `kun ${answer.stats.attempts} forsøg`);
  assert.ok(!texts.some((t) => t.includes('af højst')), 'uden frø er der intet "højst"');
  // Hver "ikke opfyldt"-besked siger enten "kunne ikke undgås", "nok det
  // bedste" eller "Prøv at danne igen", og felterne passer til teksten.
  for (const m of answer.messages.filter((x) => x.code === 'rule-not-met')) {
    assert.equal(typeof m.likelyBest, 'boolean');
    assert.ok(!(m.unavoidable && m.likelyBest));
    if (m.unavoidable) assert.match(m.text, /kunne ikke undgås/);
    else if (m.likelyBest) assert.match(m.text, /nok det bedste/);
    else assert.match(m.text, /Prøv at danne igen/);
  }
});

test('med frø: højst maxAttempts forsøg, som før', async () => {
  const input = load('testdata/saet-1/116-tilfaeldig-12.json');
  const answer = await run({ ...input, seed: 3, budget: { maxSeconds: 2, maxAttempts: 4, minAttempts: 2 } }, {});
  assert.ok(answer.stats.attempts <= 4);
});
