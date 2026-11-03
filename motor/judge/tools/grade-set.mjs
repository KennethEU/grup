#!/usr/bin/env node
// Bedømmer en motors svar på et helt testsæt og gemmer resultatet som JSON
// (en "baseline", som en anden motor senere kan sammenlignes med), og skriver
// et kort overblik.
//
//   node judge/tools/grade-set.mjs <input-mappe> <svar-mappe> <resultat.json> [--known <fil>]
//
// Svarfilerne skal hedde som deres input (fx 001-x.json). Med --known læses en
// liste over kendte forskelle (fx resultater/kendte-forskelle.json): input, hvor
// svaret ikke er en målestok (en fejl i motoren eller en bevidst forbedring).
// De markeres i resultatet med "known".

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { judge } from '../judge.mjs';

const args = process.argv.slice(2);
const knownIndex = args.indexOf('--known');
const known = knownIndex >= 0 ? JSON.parse(readFileSync(args[knownIndex + 1], 'utf8')).inputs : {};
const [inputDir, answerDir, outFile] = args.filter((a, i) => a !== '--known' && !(knownIndex >= 0 && i === knownIndex + 1));
if (!outFile) {
  console.log('Brug: node judge/tools/grade-set.mjs <input-mappe> <svar-mappe> <resultat.json>');
  process.exit(1);
}

const indexFile = join(inputDir, '_index.json');
const kinds = existsSync(indexFile)
  ? new Map(JSON.parse(readFileSync(indexFile, 'utf8')).entries.map((e) => [e.file, e.kind]))
  : new Map();

const results = [];
for (const file of readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const answerPath = join(answerDir, file);
  if (!existsSync(answerPath)) {
    results.push({ file, kind: kinds.get(file) ?? null, missing: true });
    continue;
  }
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  const answer = JSON.parse(readFileSync(answerPath, 'utf8'));
  const grade = judge(input, answer);
  results.push({
    file,
    kind: kinds.get(file) ?? null,
    view: input.view,
    students: input.students.length,
    status: grade.status,
    gradable: grade.gradable,
    failures: grade.failures.map((f) => ({ check: f.check, text: f.text })),
    stop: { shouldStop: grade.stop.shouldStop, justified: grade.stop.justified ?? null, codes: grade.stop.reasons.map((r) => r.code) },
    rules: grade.rules.map((r) => ({
      rule: r.rule,
      type: r.type,
      column: r.column,
      value: r.value,
      best: r.best,
      distance: r.distance,
      met: r.met,
      randomBaseline: r.randomBaseline ?? null,
      ...(r.today ? { today: r.today } : {}),
      ...(r.fair ? { fair: r.fair } : {}),
      ...(r.parts ? { parts: r.parts, mode: r.mode } : {}),
    })),
    avoid: grade.avoid,
    matrixSources: grade.matrixSources,
    precedence: grade.precedence ? grade.precedence.steps.map((s) => ({ step: s.step, label: s.label, value: s.value })) : null,
    tiebreak: grade.tiebreak ?? null,
    answerSeconds: answer.stats?.seconds ?? null,
    ...(known[file] ? { known: known[file] } : {}),
  });
}

const out = {
  inputDir: basename(inputDir),
  answerDir: basename(answerDir),
  judgedAt: new Date().toISOString().slice(0, 10),
  count: results.length,
  results,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(out, null, 1)}\n`);

// Overblik.
const graded = results.filter((r) => r.gradable);
const failed = results.filter((r) => r.failures && r.failures.length);
const statuses = {};
for (const r of results) statuses[r.status ?? 'mangler'] = (statuses[r.status ?? 'mangler'] || 0) + 1;
console.log(`${results.length} svar bedømt → ${outFile}`);
console.log('Status:', statuses);
console.log(`Bedømt: ${graded.length} · bryder faste krav: ${failed.length}`);
for (const r of failed) console.log(`  ✗ ${r.file}: ${r.failures.map((f) => f.check).join(', ')}${r.known ? `  (kendt: ${r.known.kind})` : ''}`);
