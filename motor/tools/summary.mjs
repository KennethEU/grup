#!/usr/bin/env node
// Et kort overblik over en kørsel af den nye motor mod den nuværende:
//
//   node tools/summary.mjs <svar-mappe> [--known resultater/kendte-forskelle.json] [--set 2]
//
// Bruger dommerens compare (--json) og tæller selv:
//   - tunge regler og mål: bedre / lige / dårligere (dårligste frø mod B's bedste),
//   - fejl i de faste krav,
//   - stop: samme 32, med samme grund (koderne fra dommerens stopReasons),
//   - pr. regeltype: hvor ofte den nye er ved det bedst mulige, i det dårligste frø,
//   - tid pr. klasse (fra _times.json).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { judge } from '../judge/judge.mjs';
import { buildTask as judgeTask } from '../judge/task.mjs';
import { expectedLayout } from '../judge/sizes.mjs';
import { stopReasons } from '../judge/feasibility.mjs';

const args = process.argv.slice(2);
const dir = args[0];
const knownIndex = args.indexOf('--known');
const knownFile = knownIndex >= 0 ? args[knownIndex + 1] : 'resultater/kendte-forskelle.json';
const setIndex = args.indexOf('--set');
const setNumber = setIndex >= 0 ? args[setIndex + 1] : '1';
const SET = `testdata/saet-${setNumber}`;
const OLD = `testdata/saet-${setNumber}-nuvaerende`;

const out = execFileSync('node', ['judge/cli.mjs', 'compare', SET, dir, OLD, '--json', '--known', knownFile], {
  maxBuffer: 1 << 28,
  encoding: 'utf8',
}).trim();
const lines = out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
const tally = { heavy: { better: 0, same: 0, worse: 0 }, goals: { better: 0, same: 0, worse: 0 } };
const worseHeavy = [];
const worseGoals = [];
const knownLines = [];
for (const line of lines) {
  if (line.known) {
    knownLines.push(line);
    continue;
  }
  tally.heavy[line.heavy]++;
  tally.goals[line.goals]++;
  if (line.heavy === 'worse') worseHeavy.push(line);
  if (line.goals === 'worse') worseGoals.push(line);
}

// Faste krav og stop, svar for svar.
const files = readdirSync(SET).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
let answers = 0;
let failures = 0;
const failureList = [];
let stops = 0;
let sameStops = 0;
const stopProblems = [];
const perType = new Map(); // type → { rules, atBest }
for (const file of files) {
  const input = JSON.parse(readFileSync(join(SET, file), 'utf8'));
  const stem = file.replace(/\.json$/, '');
  const mine = readdirSync(dir).filter((f) => f.startsWith(`${stem}.`) && f.endsWith('.json'));
  const jt = judgeTask(input);
  const reasons = stopReasons(jt, expectedLayout(jt)).reasons;
  const expectedCodes = reasons.map((r) => r.code).sort().join(',');
  const worst = new Map(); // regel → største afstand
  for (const f of mine) {
    const answer = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const grade = judge(input, answer, { samples: 1 });
    answers++;
    if (grade.failures.length) {
      failures++;
      failureList.push(`${f}: ${grade.failures.map((x) => x.text).join(' | ')}`);
    }
    if (answer.status === 'impossible') {
      stops++;
      const codes = (answer.messages || []).filter((m) => m.type === 'impossible').map((m) => m.code).sort().join(',');
      if (codes === expectedCodes) sameStops++;
      else stopProblems.push(`${f}: motoren ${codes || '(ingen koder)'} · dommeren ${expectedCodes}`);
    } else if (reasons.length) {
      stopProblems.push(`${f}: stoppede ikke (dommeren: ${expectedCodes})`);
    }
    for (const r of grade.rules) {
      if (r.distance === null || r.distance === undefined) continue;
      worst.set(r.rule, Math.max(worst.get(r.rule) ?? 0, r.distance));
    }
    if (grade.avoid && input.agreements.avoid.length) worst.set('avoid', Math.max(worst.get('avoid') ?? 0, grade.avoid.distance));
  }
  for (const [rule, distance] of worst) {
    const type = rule === 'avoid' ? 'avoid' : input.rules[rule].type;
    if (!perType.has(type)) perType.set(type, { rules: 0, atBest: 0 });
    const t = perType.get(type);
    t.rules++;
    if (distance <= 1e-9) t.atBest++;
  }
}

// Tid.
let times = [];
if (existsSync(join(dir, '_times.json'))) times = JSON.parse(readFileSync(join(dir, '_times.json'), 'utf8'));
const big = times.filter((t) => t.students > 100);
const avg = (list) => (list.length ? list.reduce((s, t) => s + t.seconds, 0) / list.length : 0);
const max = (list) => (list.length ? Math.max(...list.map((t) => t.seconds)) : 0);

console.log(`Svar: ${answers} · fejl i de faste krav: ${failures} · stop: ${stops} (samme grund: ${sameStops})`);
console.log(`Tunge regler (dårligste frø mod den nuværende): bedre ${tally.heavy.better} · lige ${tally.heavy.same} · dårligere ${tally.heavy.worse}`);
console.log(`Mål og Saml:                                    bedre ${tally.goals.better} · lige ${tally.goals.same} · dårligere ${tally.goals.worse}`);
console.log(`Kendte forskelle (kun faste krav): ${knownLines.length}`);
console.log('Ved det bedst mulige i det dårligste frø, pr. regeltype:');
for (const [type, t] of perType) console.log(`  ${type}: ${t.atBest} af ${t.rules}`);
console.log(`Tid pr. svar: snit ${avg(times).toFixed(2)} s, højst ${max(times).toFixed(2)} s; over 100 elever: snit ${avg(big).toFixed(2)} s, højst ${max(big).toFixed(2)} s (${big.length} svar)`);
for (const l of failureList.slice(0, 20)) console.log(`  ✗ ${l}`);
for (const l of stopProblems.slice(0, 20)) console.log(`  stop: ${l}`);
for (const l of worseHeavy) console.log(`  TUNG DÅRLIGERE ${l.input}: ny ${JSON.stringify(l.a.heavy)} · nu ${JSON.stringify(l.b.heavy)}`);
if (args.includes('--goals')) {
  for (const l of worseGoals) console.log(`  mål dårligere ${l.input}: ny ${JSON.stringify(l.a.goals.map((v) => +v.toFixed(3)))} · nu ${JSON.stringify(l.b.goals.map((v) => +v.toFixed(3)))}`);
}
