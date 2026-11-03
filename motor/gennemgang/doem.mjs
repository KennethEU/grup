#!/usr/bin/env node
// Kodegennemgang: dommeren på motorens svar, og siger motorens egne felter
// (rules[].met, beskedernes unavoidable) det samme som dommeren?
//
//   node gennemgang/doem.mjs <input-mappe> <svar-mappe>

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { judge } from '../judge/judge.mjs';

const [inputDir, answerDir] = process.argv.slice(2);
const files = readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
const tally = {
  answers: 0,
  failures: 0,
  impossible: 0,
  metMismatch: 0,
  unavoidableFalse: 0,
  unavoidableFairOnly: 0,
  missingMessage: 0,
  extraMessage: 0,
  tryAgain: 0,
  likelyBest: 0,
  unavoidableTrue: 0,
  notMetRules: 0,
};
const lines = [];
for (const file of files) {
  const stem = file.replace(/\.json$/, '');
  const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
  for (const name of readdirSync(answerDir).filter((f) => f.startsWith(stem + '.') && f.endsWith('.json'))) {
    const answer = JSON.parse(readFileSync(join(answerDir, name), 'utf8'));
    tally.answers++;
    const grade = judge(input, answer);
    if (grade.failures.length) {
      tally.failures++;
      lines.push(`FASTE KRAV ${name}: ${grade.failures.map((f) => f.text).join(' | ')}`);
    }
    if (answer.status === 'impossible') {
      tally.impossible++;
      continue;
    }
    if (!grade.gradable) continue;
    // rules[].met mod dommeren
    for (const r of grade.rules) {
      const mine = answer.rules.find((x) => x.rule === r.rule);
      if (!mine || mine.met !== r.met) {
        tally.metMismatch++;
        lines.push(`MET ${name} regel ${r.rule} (${r.type}): motor ${mine?.met} · dommer ${r.met}`);
      }
      if (r.met === false) tally.notMetRules++;
    }
    // Beskeder efter kørslen: rule-not-met
    const notMet = answer.messages.filter((m) => m.code === 'rule-not-met');
    for (const m of notMet) {
      if (m.unavoidable) tally.unavoidableTrue++;
      else if (m.likelyBest) tally.likelyBest++;
      else tally.tryAgain++;
      if (m.rule === null) {
        // Undgå hinanden eller kilder. Undgå hinanden har én besked pr. aftale
        // og pulje (spørgsmål 47), og dommeren måler kun alle aftaler samlet:
        // er ALLE aftalernes beskeder "uundgåelige", skal det samlede tal
        // være det bedst mulige.
        const isAvoid = m.text.startsWith('Undgå');
        const src = isAvoid ? grade.avoid : grade.matrixSources;
        const all = isAvoid ? notMet.filter((x) => x.rule === null && x.text.startsWith('Undgå')).every((x) => x.unavoidable) : true;
        if (src && m.unavoidable && all && src.value > src.best) {
          tally.unavoidableFalse++;
          lines.push(`UUNDGÅELIGT? ${name}: ${m.text} (dommer: ${src.value} > bedst ${src.best})`);
        }
        continue;
      }
      const r = grade.rules.find((x) => x.rule === m.rule);
      if (!r) continue;
      if (r.met !== false) {
        tally.extraMessage++;
        lines.push(`BESKED UDEN GRUND ${name} regel ${m.rule}: ${m.text}`);
      }
      if (m.unavoidable) {
        if (r.type === 'distribute') {
          if (r.fair && r.fair.met && r.met === false) tally.unavoidableFairOnly++;
        } else if (r.type === 'balance') {
          // Grænsen fra bounds.js kan dommeren ikke efterprøve.
        } else if (
          r.best !== null &&
          r.best !== undefined &&
          r.value > r.best &&
          // Med Opdel er der én besked pr. pulje; dommeren måler kun hele
          // reglen. Er alle puljernes beskeder "uundgåelige", skal hele
          // reglen være ved det bedst mulige.
          (m.pool === null || notMet.filter((x) => x.rule === m.rule).every((x) => x.unavoidable))
        ) {
          tally.unavoidableFalse++;
          lines.push(`UUNDGÅELIGT? ${name} regel ${m.rule} (${r.type}): ${r.value} > bedst ${r.best}`);
        }
      }
    }
    for (const r of grade.rules) {
      if (r.met === false && !notMet.some((m) => m.rule === r.rule)) {
        tally.missingMessage++;
        lines.push(`INGEN BESKED ${name} regel ${r.rule} (${r.type}) er ikke opfyldt`);
      }
    }
    if (grade.avoid && grade.avoid.value > 0 && !notMet.some((m) => m.rule === null && m.text.startsWith('Undgå'))) {
      tally.missingMessage++;
      lines.push(`INGEN BESKED ${name}: Undgå hinanden ${grade.avoid.value}`);
    }
  }
}
for (const l of lines.slice(0, 60)) console.log(l);
console.log(JSON.stringify(tally));
