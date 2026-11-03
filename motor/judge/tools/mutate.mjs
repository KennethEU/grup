#!/usr/bin/env node
// Mutationstest af dommeren.
//
// Idéen: en dommer, der ikke kan fange en fejl, beviser ingenting. Derfor
// ødelægger vi med vilje ÉN ting ad gangen i en KOPI af projektet (aldrig i
// selve projektet) og kører testene. Fejler testene, er mutanten "dræbt"
// (godt). Består de, har testene et hul.
//
//   node judge/tools/mutate.mjs [kopi-mappe] [--md fil]
//
// Uden kopi-mappe bruges systemets midlertidige mappe.

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUTATIONS } from './mutations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const mdIndex = args.indexOf('--md');
const mdFile = mdIndex >= 0 ? args[mdIndex + 1] : null;
const base = args.find((a, i) => !a.startsWith('--') && i !== mdIndex + 1) || tmpdir();

const copy = mkdtempSync(join(base, 'dommer-mutation-'));
for (const part of ['judge', 'testdata']) cpSync(join(ROOT, part), join(copy, part), { recursive: true });

function runTests() {
  const result = spawnSync(process.execPath, ['--test', 'judge/test/*.test.mjs'], { cwd: copy, encoding: 'utf8' });
  return result.status === 0;
}

if (!runTests()) {
  console.error('Testene fejler allerede uden mutationer. Ret dem først.');
  process.exit(1);
}

const results = [];
for (const m of MUTATIONS) {
  const path = join(copy, m.file);
  const original = readFileSync(path, 'utf8');
  const count = original.split(m.from).length - 1;
  if (count !== 1) {
    results.push({ ...m, outcome: `KUNNE IKKE ANVENDES (teksten findes ${count} gange)` });
    continue;
  }
  writeFileSync(path, original.replace(m.from, m.to));
  const passed = runTests();
  writeFileSync(path, original);
  results.push({ ...m, outcome: passed ? 'OVERLEVEDE' : 'dræbt' });
  console.log(`${passed ? '✗ OVERLEVEDE' : '✓ dræbt    '}  ${m.file}: ${m.what}`);
}
rmSync(copy, { recursive: true, force: true });

const killed = results.filter((r) => r.outcome === 'dræbt').length;
console.log(`\n${killed} af ${results.length} mutanter dræbt.`);

if (mdFile) {
  const lines = [
    '| # | Fil | Hvad blev ødelagt | Resultat |',
    '|---|---|---|---|',
    ...results.map((r, i) => `| ${i + 1} | \`${r.file.replace('judge/', '')}\` | ${r.what} | ${r.outcome === 'dræbt' ? 'dræbt ✓' : `**${r.outcome}**`} |`),
    '',
    `**${killed} af ${results.length} mutanter dræbt.**`,
  ];
  writeFileSync(mdFile, `${lines.join('\n')}\n`);
}
process.exitCode = killed === results.length ? 0 : 1;
