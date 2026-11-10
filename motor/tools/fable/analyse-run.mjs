#!/usr/bin/env node
// Læser en kørsel fra run-set.mjs (fem frø pr. input) og viser, hvor motoren
// taber kvalitet eller tid:
//
//   node tools/fable/analyse-run.mjs <input-mappe> <svar-mappe> [--json ud.json]
//
// For hvert input måles hvert frøs svar med motorens egen måling (samme tal
// som dommerens, uden Fordels sidste trin). Så tælles:
//   - spredning: er frøene uenige? Så har mindst ét frø tabt kvalitet, for
//     et andet frø fandt noget bedre med samme budget.
//   - afstand til det bedst mulige pr. regel (hvor en grænse kendes).
//   - tid og forsøg, delt efter klassens størrelse.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTask } from '../../engine/task.js';
import { computeLayout } from '../../engine/sizes.js';
import { checkFeasibility } from '../../engine/feasibility.js';
import { computeBaselines, evaluate, compareVectors, levelPlan, atBound } from '../../engine/rules.js';
import { computeBounds } from '../../engine/bounds.js';

const args = process.argv.slice(2);
const [inputDir, runDir] = args;
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

export function sizeClass(n) {
  return n < 20 ? '8-19' : n <= 32 ? '20-32' : n <= 60 ? '33-60' : n <= 100 ? '61-100' : '100+';
}
const CLASSES = ['8-19', '20-32', '33-60', '61-100', '100+'];

const times = new Map();
if (existsSync(join(runDir, '_times.json'))) {
  for (const t of JSON.parse(readFileSync(join(runDir, '_times.json'), 'utf8'))) times.set(`${t.file.replace(/\.json$/, '')}.seed${t.seed}`, t);
}

const rows = [];
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { reasons, blocks } = checkFeasibility(task, layout);
  if (reasons.length || !layout.total) continue;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool);
  const bounds = computeBounds(task, layout);
  const plan = levelPlan(task).filter((l) => l.kind !== 'today');
  const goalsAt = plan.findIndex((l) => l.kind === 'goals');
  const stem = file.replace(/\.json$/, '');
  const seeds = [];
  for (const name of readdirSync(runDir).filter((f) => f.startsWith(`${stem}.seed`) && f.endsWith('.json')).sort()) {
    const answer = JSON.parse(readFileSync(join(runDir, name), 'utf8'));
    if (!answer.groups) continue;
    const groups = answer.groups.map((g) => g.members.map((id) => task.indexOf.get(id)));
    const ev = evaluate(task, groups, groupPool, blocks, baselines, { tieBreak: false });
    const t = times.get(name.replace(/\.json$/, ''));
    seeds.push({
      name,
      vector: ev.vector,
      rules: task.rules.map((r) => ({ type: r.type, value: ev.results[r.index].value, best: bounds.get(r.index)?.value ?? ev.results[r.index].best, misses: ev.results[r.index].misses ?? 0, met: ev.results[r.index].met })),
      avoid: [ev.avoid.value, ev.avoid.best],
      sources: ev.sources ? [ev.sources.value, ev.sources.best] : null,
      seconds: t?.seconds ?? null,
      attempts: t?.attempts ?? null,
      unavoidable: (answer.messages || []).filter((m) => m.code === 'rule-not-met').map((m) => ({ rule: m.rule, unavoidable: m.unavoidable, likelyBest: m.likelyBest })),
    });
  }
  if (!seeds.length) continue;
  // En regel, hvor en tilfældig deling kun giver regnestøj (fx Balancér, når hver
  // pulje kun har én gruppe): tallet på fælles skala er så støj delt med støj.
  const noise = [...baselines.values()].some((b) => b.value > 0 && b.value < 1e-9);
  rows.push({ noise, file: stem, n: task.n, groups: layout.total, view: task.view, types: task.rules.map((r) => r.type), avoidLists: task.avoid.length, blocks: blocks.length, goalsAt, plan: plan.map((l) => l.kind), seeds });
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows));

// --- Spredning mellem frø ---------------------------------------------------
const spread = Object.fromEntries(CLASSES.map((c) => [c, { inputs: 0, heavy: 0, goals: 0, collect: 0 }]));
const spreadFiles = { heavy: [], goals: [] };
for (const row of rows) {
  const c = spread[sizeClass(row.n)];
  c.inputs++;
  const vs = row.seeds.map((s) => s.vector);
  const differs = (from, to) => vs.some((v) => compareVectors(v.slice(from, to), vs[0].slice(from, to), 1e-6) !== 0);
  if (differs(0, row.goalsAt)) {
    c.heavy++;
    spreadFiles.heavy.push(row.file);
  } else if (differs(row.goalsAt, row.goalsAt + 1)) {
    c.goals++;
    spreadFiles.goals.push(row.file);
  } else if (differs(row.goalsAt + 1, row.goalsAt + 2)) c.collect++;
}
console.log('Spredning mellem de fem frø (input, hvor frøene ikke endte samme sted):');
console.log('  elever   input  tunge  mål  kun Saml');
for (const k of CLASSES) console.log(`  ${k.padEnd(8)} ${String(spread[k].inputs).padStart(5)} ${String(spread[k].heavy).padStart(6)} ${String(spread[k].goals).padStart(4)} ${String(spread[k].collect).padStart(9)}`);
console.log('  tunge uenige:', spreadFiles.heavy.join(' '));

// --- Afstand til det bedst mulige pr. regel (dårligste frø) -----------------
const perType = {};
for (const row of rows) {
  row.types.forEach((type, i) => {
    if (type === 'aggregate') return;
    const t = (perType[type] ||= { rules: 0, known: 0, atBest: 0, zero: 0 });
    t.rules++;
    const worst = Math.max(...row.seeds.map((s) => s.rules[i].value));
    const best = row.seeds[0].rules[i].best;
    if (worst < 1e-9) t.zero++;
    if (best !== null && best !== undefined) {
      t.known++;
      if (atBound(worst, best)) t.atBest++;
    }
  });
  if (row.avoidLists) {
    const t = (perType.avoid ||= { rules: 0, known: 0, atBest: 0, zero: 0 });
    t.rules++;
    t.known++;
    const worst = Math.max(...row.seeds.map((s) => s.avoid[0]));
    if (worst === 0) t.zero++;
    if (worst <= row.seeds[0].avoid[1]) t.atBest++;
  }
}
console.log('\nRegler ved det bedst mulige i det dårligste frø (grænse kendt / ved grænsen / tal 0):');
for (const [type, t] of Object.entries(perType)) console.log(`  ${type.padEnd(16)} ${String(t.rules).padStart(4)} regler · grænse kendt ${String(t.known).padStart(4)} · ved grænsen ${String(t.atBest).padStart(4)} · 0: ${t.zero}`);

// --- Tid ----------------------------------------------------------------------
const quant = (xs, q) => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
console.log('\nTid pr. svar i sekunder (én kerne i Node):');
console.log('  elever    svar  median    90 %   højst  forsøg (median)');
for (const k of CLASSES) {
  const ts = [];
  const at = [];
  for (const row of rows) if (sizeClass(row.n) === k) for (const s of row.seeds) if (s.seconds !== null) (ts.push(s.seconds), at.push(s.attempts));
  if (!ts.length) continue;
  console.log(`  ${k.padEnd(8)} ${String(ts.length).padStart(5)} ${quant(ts, 0.5).toFixed(2).padStart(7)} ${quant(ts, 0.9).toFixed(2).padStart(7)} ${Math.max(...ts).toFixed(2).padStart(7)}  ${quant(at, 0.5)}`);
}

// --- Beskeder -----------------------------------------------------------------
const msg = { unavoidable: 0, likelyBest: 0, tryAgain: 0 };
for (const row of rows) for (const s of row.seeds) for (const m of s.unavoidable) msg[m.unavoidable ? 'unavoidable' : m.likelyBest ? 'likelyBest' : 'tryAgain']++;
console.log(`\nBeskeder: "kunne ikke undgås" ${msg.unavoidable} · "nok det bedste" ${msg.likelyBest} · "Prøv at danne igen" ${msg.tryAgain}`);
