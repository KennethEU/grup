#!/usr/bin/env node
// Kommandoen til dommeren.
//
//   node judge/cli.mjs <input.json> <svar.json> [--json]
//       Bedømmer ét svar. Uden --json: en rapport. Med --json: karakteren som JSON.
//
//   node judge/cli.mjs batch <input-mappe> <svar-mappe> [--json]
//       Bedømmer alle svar. Et svar hører til et input, når filnavnet starter
//       med inputtets navn (fx 001-x.json → 001-x.json eller 001-x.seed3.json).
//       Med --json: én JSON-linje pr. svar.
//
//   node judge/cli.mjs compare <input-mappe> <svar-mappe-A> <svar-mappe-B> [--json] [--known <fil>]
//       Sammenligner to motorer: for hvert input A's dårligste svar mod B's
//       bedste (strengt for A) på de tunge regler og på målene hver for sig.
//       Med --known: input, hvor B's svar ikke er en målestok (fx en bevidst
//       forbedring), tælles for sig.
//
// Afslutter med kode 2, hvis et svar bryder de faste krav (så det ikke overses).

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { judge, compareVectors } from './judge.mjs';
import { formatReport } from './report.mjs';
import { validateInput } from './validate.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const knownIndex = args.indexOf('--known');
const known = knownIndex >= 0 ? JSON.parse(readFileSync(args[knownIndex + 1], 'utf8')).inputs : {};
const positional = args.filter((a, i) => a !== '--json' && a !== '--known' && !(knownIndex >= 0 && i === knownIndex + 1));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function inputFiles(dir) {
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
}

function answersFor(dir, inputFile) {
  const stem = inputFile.replace(/\.json$/, '');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && (f === inputFile || f.startsWith(`${stem}.`)))
    .sort();
}

function summaryLine(grade) {
  return {
    status: grade.status,
    gradable: grade.gradable,
    failures: grade.failures.map((f) => `${f.check}: ${f.text}`),
    vector: grade.precedence ? grade.precedence.vector : null,
    rules: grade.rules.map((r) => ({ rule: r.rule, type: r.type, value: r.value, best: r.best, met: r.met, today: r.today ?? undefined, fair: r.fair ?? undefined })),
    avoid: grade.avoid ? grade.avoid.value : null,
    tiebreakFollowed: grade.tiebreak ? grade.tiebreak.followed : null,
    stopJustified: grade.stop.justified,
  };
}

function single(inputPath, answerPath) {
  const input = readJson(inputPath);
  const problems = validateInput(input);
  const grade = judge(input, readJson(answerPath));
  if (asJson) {
    console.log(JSON.stringify({ inputProblems: problems, ...grade }, null, 2));
  } else {
    if (problems.length) console.log(`Advarsel: inputtet følger ikke kontrakten:\n  ${problems.join('\n  ')}\n`);
    console.log(formatReport(grade, basename(answerPath)));
  }
  return grade.failures.length ? 2 : 0;
}

function batch(inputDir, answerDir) {
  let total = 0;
  let failed = 0;
  let missing = 0;
  for (const file of inputFiles(inputDir)) {
    const input = readJson(join(inputDir, file));
    const answers = answersFor(answerDir, file);
    if (!answers.length) missing++;
    for (const answerFile of answers) {
      const grade = judge(input, readJson(join(answerDir, answerFile)));
      total++;
      if (grade.failures.length) failed++;
      if (asJson) console.log(JSON.stringify({ input: file, answer: answerFile, ...summaryLine(grade) }));
      else if (grade.failures.length) console.log(`✗ ${answerFile}: ${grade.failures.map((f) => f.text).join(' | ')}`);
    }
  }
  if (!asJson) {
    console.log(`\n${total} svar bedømt · ${failed} bryder de faste krav · ${missing} input uden svar`);
    if (failed) console.log('!!! Der er svar, der bryder de faste krav. !!!');
  }
  return failed ? 2 : 0;
}

// Et svar kogt ned til det, sammenligningen bruger (spec. 15.2):
// de tunge trin (1–4) for sig og målene (5–6) for sig.
function summarize(grade) {
  const steps = grade.precedence ? grade.precedence.steps : [];
  return {
    failures: grade.failures,
    // Et "umulig", der var rigtigt, er lige så godt som et andet rigtigt "umulig".
    stoppedRightly: grade.status === 'impossible' && grade.stop.justified !== false,
    heavy: grade.precedence ? steps.filter((s) => s.step >= 1 && s.step <= 4).map((s) => s.value) : null,
    goals: grade.precedence ? steps.filter((s) => s.step >= 5).map((s) => s.value) : null,
  };
}

// Ordner svar: færrest fejl i de faste krav, så de tunge trin, så målene.
// Et svar uden grupper (fx "umulig" uden grund) er værst.
function orderAnswers(x, y) {
  if (x.failures.length !== y.failures.length) return x.failures.length - y.failures.length;
  if (!x.heavy || !y.heavy) return (x.heavy ? 0 : 1) - (y.heavy ? 0 : 1);
  return compareVectors(x.heavy, y.heavy) || compareVectors(x.goals, y.goals);
}

function verdict(c) {
  return c < 0 ? 'better' : c > 0 ? 'worse' : 'same';
}

function compare(inputDir, dirA, dirB) {
  const tally = { heavy: { better: 0, same: 0, worse: 0 }, goals: { better: 0, same: 0, worse: 0 }, incomparable: 0, moreHeavyBreaks: 0, known: [] };
  const failedA = [];
  const failedB = new Map(); // kontrol → antal svar
  for (const file of inputFiles(inputDir)) {
    const input = readJson(join(inputDir, file));
    const grade = (dir) => answersFor(dir, file).map((f) => ({ file: f, ...summarize(judge(input, readJson(join(dir, f)))) }));
    const a = grade(dirA);
    const b = grade(dirB);
    // Fejl i de faste krav tælles FØR alt andet, så de aldrig forsvinder.
    for (const g of a) if (g.failures.length) failedA.push(`${g.file}: ${g.failures.map((f) => f.text).join(' | ')}`);
    if (known[file]) {
      // B's svar er ikke en målestok her; A skal blot overholde de faste krav.
      tally.known.push(`${file} (${known[file].kind})`);
      if (asJson) console.log(JSON.stringify({ input: file, known: known[file], aFailures: a.map((g) => g.failures.length) }));
      continue;
    }
    for (const g of b) for (const f of g.failures) failedB.set(f.name, (failedB.get(f.name) || 0) + 1);
    if (!a.length || !b.length) {
      tally.incomparable++;
      continue;
    }
    // A's dårligste frø mod B's bedste (strengt for A).
    const worstA = a.slice().sort(orderAnswers).at(-1);
    const bestB = b.slice().sort(orderAnswers)[0];
    let heavy;
    let goals;
    if (worstA.stoppedRightly && bestB.stoppedRightly) {
      heavy = 'same';
      goals = 'same';
    } else if (!worstA.heavy || !bestB.heavy) {
      // Den ene har ingen grupper: et svar uden grupper taber, medmindre det
      // stoppede med rette og det andet brød de faste krav.
      const aOk = worstA.heavy ? !worstA.failures.length : worstA.stoppedRightly;
      const bOk = bestB.heavy ? !bestB.failures.length : bestB.stoppedRightly;
      heavy = aOk === bOk ? 'same' : aOk ? 'better' : 'worse';
      goals = heavy;
    } else {
      heavy = verdict(compareVectors(worstA.heavy, bestB.heavy));
      goals = verdict(compareVectors(worstA.goals, bestB.goals));
      if (worstA.heavy.reduce((s, v) => s + v, 0) > bestB.heavy.reduce((s, v) => s + v, 0)) tally.moreHeavyBreaks++;
    }
    tally.heavy[heavy]++;
    tally.goals[goals]++;
    if (asJson) {
      console.log(JSON.stringify({ input: file, heavy, goals, a: { answer: worstA.file, failures: worstA.failures.length, heavy: worstA.heavy, goals: worstA.goals }, b: { answer: bestB.file, failures: bestB.failures.length, heavy: bestB.heavy, goals: bestB.goals } }));
    } else if (heavy === 'worse') {
      console.log(`A dårligere på de tunge regler: ${file}\n   A ${JSON.stringify(worstA.heavy)}\n   B ${JSON.stringify(bestB.heavy)}`);
    }
  }
  if (!asJson) {
    console.log('\nA (dårligste frø) mod B (bedste frø):');
    console.log(`  Tunge regler (trin 1–4): bedre ${tally.heavy.better} · lige ${tally.heavy.same} · dårligere ${tally.heavy.worse}`);
    console.log(`  Mål og Saml (trin 5–6):  bedre ${tally.goals.better} · lige ${tally.goals.same} · dårligere ${tally.goals.worse}`);
    console.log(`  Flere tunge brud i alt end B: ${tally.moreHeavyBreaks} · kan ikke sammenlignes: ${tally.incomparable}`);
    if (tally.known.length) console.log(`  Kendte forskelle (B er ikke målestok, kun A's faste krav tjekket): ${tally.known.join(', ')}`);
    if (failedA.length) {
      console.log(`\n!!! ${failedA.length} af A's svar bryder de faste krav: !!!`);
      for (const line of failedA) console.log(`  ✗ ${line}`);
    }
    if (failedB.size) {
      console.log('\nB\'s svar bryder de faste krav (undersøg: fejl i B, eller en forskel i fortolkningen?):');
      for (const [name, count] of failedB) console.log(`  ✗ ${name}: ${count} svar`);
    }
  }
  return failedA.length ? 2 : 0;
}

let code;
if (positional[0] === 'batch' && positional.length === 3) code = batch(positional[1], positional[2]);
else if (positional[0] === 'compare' && positional.length === 4) code = compare(positional[1], positional[2], positional[3]);
else if (positional.length === 2) code = single(positional[0], positional[1]);
else {
  console.log('Brug: node judge/cli.mjs <input.json> <svar.json> [--json]');
  console.log('      node judge/cli.mjs batch <input-mappe> <svar-mappe> [--json]');
  console.log('      node judge/cli.mjs compare <input-mappe> <svar-A> <svar-B> [--json]');
  code = 1;
}
process.exitCode = code;
