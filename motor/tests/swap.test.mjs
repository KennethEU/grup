// Den hurtige vej til at prøve et bytte (state.js trySwap og modulernes
// after) flytter ingen elever. Den skal give præcis det samme som den gamle
// vej, der flytter eleverne frem og tilbage (tryMoves), for hver regel og i
// hver situation: lige efter opbygningen, efter mange bytninger, og efter
// flytninger, der har ændret gruppernes størrelse.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { computeBaselines } from '../engine/rules.js';
import { Attempt } from '../engine/search.js';
import { makeRandom, randomInt } from '../engine/random.js';

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Bygger et forsøg for et input, eller null, når der ingen grupper dannes.
function attemptFor(input, seed = 1) {
  const task = buildTask(input);
  const layout = computeLayout(task);
  const feas = checkFeasibility(task, layout);
  if (feas.reasons.length || layout.total === 0) return null;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool, 20);
  const attempt = new Attempt(task, layout, feas.blocks, baselines, seed);
  attempt.build();
  return attempt;
}

// Sammenligner de to veje for ét bytte: ændringen pr. trin, og hver regels
// tal for hver af de to grupper.
function checkSwap(attempt, s, t, label) {
  const state = attempt.state;
  const g = state.groupOf[s];
  const h = state.groupOf[t];
  const quick = Float64Array.from(state.trySwap(s, t));
  const slow = Float64Array.from(state.tryMoves([s, h, t, g]));
  quick.forEach((d, l) => {
    const same = state.integerLevel[l] ? d === slow[l] : close(d, slow[l]);
    assert.ok(same, `${label}: trin ${l} (${state.model.levels[l].kind}) giver ${d} uden at flytte, men ${slow[l]} ved at flytte`);
  });
  // Hver regel for sig: after(…) mod at flytte eleverne og læse value(…).
  const mods = state.modules;
  const predicted = mods.map((m) => [m.after(g, s, t), m.after(h, t, s)]);
  state.commitMoves([s, h, t, g]);
  mods.forEach((m, i) => {
    assert.ok(close(predicted[i][0], m.value(g)) && close(predicted[i][1], m.value(h)), `${label}: regel ${m.rule} på trin ${m.level}: after gav ${predicted[i]}, men grupperne blev ${m.value(g)} og ${m.value(h)}`);
  });
  state.commitMoves([s, g, t, h]); // tilbage igen
}

// Et tilfældigt par af enkelte elever i hver sin gruppe i samme pulje, eller null.
function randomPair(attempt, random) {
  const { state, task } = attempt;
  const s = randomInt(random, task.n);
  const t = randomInt(random, task.n);
  const g = state.groupOf[s];
  const h = state.groupOf[t];
  if (g === h || attempt.groupPool[g] !== attempt.groupPool[h]) return null;
  if (attempt.blockOf[s] >= 0 || attempt.blockOf[t] >= 0) return null;
  if (!attempt.swapOk(s, t, g, h)) return null;
  return [s, t];
}

for (const SET of ['testdata/saet-1', 'testdata/saet-2']) {
  test(`et bytte prøvet uden at flytte = et bytte prøvet ved at flytte (${SET})`, () => {
    const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
    let inputs = 0;
    let swaps = 0;
    const kinds = new Set();
    for (const file of files) {
      const attempt = attemptFor(JSON.parse(readFileSync(join(SET, file), 'utf8')));
      if (!attempt) continue;
      inputs++;
      const { state, task } = attempt;
      for (const rule of task.rules) kinds.add(rule.type);
      const random = makeRandom(11);
      for (let k = 0; k < 120; k++) {
        const pair = randomPair(attempt, random);
        if (!pair) continue;
        checkSwap(attempt, pair[0], pair[1], `${file} bytte ${k}`);
        swaps++;
        // Hver tredje gang gøres byttet, så næste prøve står et nyt sted.
        if (k % 3 === 0) attempt.apply([pair[0], state.groupOf[pair[1]], pair[1], state.groupOf[pair[0]]], 'swap', 'worse');
        // Af og til flyttes én elev til en anden gruppe i samme pulje, så
        // størrelserne ændrer sig (Fordel regner med gruppens størrelse).
        if (k % 20 === 10 && !attempt.matrixFull) {
          const x = randomInt(random, task.n);
          const from = state.groupOf[x];
          const groups = attempt.groupsOfPool[attempt.groupPool[from]];
          const to = groups[randomInt(random, groups.length)];
          if (to !== from && attempt.blockOf[x] < 0 && state.size[from] > 1) state.commitMoves([x, to]);
        }
      }
    }
    assert.ok(inputs > 250, `kun ${inputs} input`);
    assert.ok(swaps > 15000, `kun ${swaps} bytninger`);
    // Alle regeltyper har været prøvet.
    for (const type of ['strict_separate', 'separate', 'cluster', 'distribute', 'balance', 'minimizediff', 'group_sort']) assert.ok(kinds.has(type), `${type} mangler`);
  });
}

// En lille klasse, hvor hver regel kan regnes i hånden.
function smallInput(rules, extra = {}) {
  const rows = [
    ['a', 'P', '2', 'Rød'],
    ['b', 'P', '4', 'Rød'],
    ['c', 'D', '7', 'Blå'],
    ['d', 'D', '10', 'Blå'],
    ['e', 'P', '12', 'Grøn'],
    ['f', 'D', '', ''],
  ];
  return {
    contractVersion: 3,
    view: 'home',
    students: rows.map(([id, sex, grade, colour]) => ({ _rowId: id, Køn: sex, Karakter: grade, Farve: colour })),
    rules,
    agreements: { avoid: [], together: [] },
    size: { mode: 'count', count: 2 },
    locked: [],
    topics: [],
    seed: 1,
    budget: { maxSeconds: 2, maxAttempts: 2 },
    ...extra,
  };
}

test('after regnet i hånden: Adskil, Klyng, Balancér og Undgå hinanden', () => {
  const input = smallInput(
    [
      { type: 'separate', column: 'Køn', values: ['P'] },
      { type: 'cluster', column: 'Farve' },
      { type: 'balance', column: 'Karakter' },
    ],
    { agreements: { avoid: [['a', 'b', 'c']], together: [] } },
  );
  const attempt = attemptFor(input);
  const { state, task } = attempt;
  const id = (name) => task.indexOf.get(name);
  // Læg grupperne fast: {a, b, c} og {d, e, f}.
  ['a', 'b', 'c'].forEach((name) => state.commitMoves([id(name), 0]));
  ['d', 'e', 'f'].forEach((name) => state.commitMoves([id(name), 1]));
  state.recompute();
  const byType = (type) => state.modules.find((m) => m.rule !== null && task.rules[m.rule].type === type);
  const avoid = state.modules.find((m) => m.listsOf);
  // Bytter c (D, 7, Blå) med e (P, 12, Grøn): gruppe 0 bliver {a, b, e}.
  const c = id('c');
  const e = id('e');
  // Adskil P: tre piger i gruppe 0 → 3 par; gruppe 1 {d, c, f} → 0 par.
  assert.equal(byType('separate').after(0, c, e), 3);
  assert.equal(byType('separate').after(1, e, c), 0);
  // Klyng Farve: gruppe 0 {Rød, Rød, Grøn} → 1 alene; gruppe 1 {Blå, Blå, –} → 0.
  assert.equal(byType('cluster').after(0, c, e), 1);
  assert.equal(byType('cluster').after(1, e, c), 0);
  // Balancér: snit for alle er (2+4+7+10+12)/5 = 7. Gruppe 0: (2+4+12)/3 = 6 → 1.
  // Gruppe 1: (10+7)/2 = 8,5 → 1,5 (f har intet tal).
  assert.ok(close(byType('balance').after(0, c, e), 1));
  assert.ok(close(byType('balance').after(1, e, c), 1.5));
  // Undgå hinanden {a, b, c}: gruppe 0 har nu kun a og b → 1 par; gruppe 1 har c → 0.
  assert.equal(avoid.after(0, c, e), 1);
  assert.equal(avoid.after(1, e, c), 0);
});

test('søgningen bruger den hurtige vej: samme svar som med den gamle vej (frø)', async () => {
  // Kør nogle forsøg to gange: én gang som nu, og én gang hvor trySwap er
  // byttet ud med den gamle vej. Grupperne skal være de samme.
  const SET = 'testdata/saet-1';
  const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  let compared = 0;
  for (const file of files.filter((_, i) => i % 6 === 0)) {
    const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
    if (input.students.length > 60) continue;
    const quick = attemptFor(input, 5);
    if (!quick) continue;
    const slow = attemptFor(input, 5);
    slow.state.trySwap = function (s, t) {
      return this.tryMoves([s, this.groupOf[t], t, this.groupOf[s]]);
    };
    const all = Array.from({ length: quick.task.n }, (_, i) => i);
    for (const attempt of [quick, slow]) {
      attempt.evaluationLimit = 200000;
      attempt.localSearch(all);
    }
    // Kun input med hele tal sammenlignes gruppe for gruppe: med kommatal
    // samler den gamle vej små regnefejl op, når den flytter frem og tilbage.
    const wholeNumbers = quick.task.rules.every((r) => !r.num || Array.from(r.num).every((x) => Number.isNaN(x) || Number.isInteger(x * 2)));
    if (!wholeNumbers) continue;
    assert.deepEqual(quick.state.groupsAsLists(), slow.state.groupsAsLists(), file);
    compared++;
  }
  assert.ok(compared >= 20, `kun ${compared} sammenlignet`);
});

test('Saml på en talkolonne: en gruppe uden tal, hvor samme tekst går ud og kommer ind', () => {
  // "Fritaget" og "Syg" er ikke tal. Tre grupper på 2: {a, b} og {c, d} har
  // kun tekst og måles på antal forskellige tekster; {e, f} har et tal.
  const input = smallInput([{ type: 'group_sort', column: 'Karakter' }], { size: { mode: 'count', count: 3 } });
  const grades = ['Fritaget', 'Syg', 'Fritaget', 'Syg', 'Fritaget', '7'];
  input.students.forEach((student, i) => (student.Karakter = grades[i]));
  const attempt = attemptFor(input);
  const { state, task } = attempt;
  const id = (name) => task.indexOf.get(name);
  ['a', 'b'].forEach((name) => state.commitMoves([id(name), 0]));
  ['c', 'd'].forEach((name) => state.commitMoves([id(name), 1]));
  ['e', 'f'].forEach((name) => state.commitMoves([id(name), 2]));
  state.recompute();
  const collect = state.modules.find((m) => m.rule === 0);
  const before = collect.value(0);
  assert.ok(before > 0, 'gruppen uden tal tæller sine to tekster');
  // "Fritaget" (a) ud og "Fritaget" (c) ind: stadig to tekster.
  assert.equal(collect.after(0, id('a'), id('c')), before);
  checkSwap(attempt, id('a'), id('c'), 'Fritaget mod Fritaget');
  // "Syg" (b) ud og "Fritaget" (c) ind: nu kun én tekst i gruppen.
  assert.ok(collect.after(0, id('b'), id('c')) < before);
  checkSwap(attempt, id('b'), id('c'), 'Syg mod Fritaget');
});
