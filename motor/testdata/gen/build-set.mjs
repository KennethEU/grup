#!/usr/bin/env node
// Bygger de faste testsæt til sammenligningen med den nuværende motor.
//
//   node testdata/gen/build-set.mjs                  → sæt 1 i testdata/saet-1/ og testdata/saet-1-facit/
//   node testdata/gen/build-set.mjs saet-2           → sæt 2 i testdata/saet-2/ og testdata/saet-2-facit/
//   node testdata/gen/build-set.mjs saet-2 <mappe>   → et andet sted (fx til en kontrol)
//
// Sættet laves helt ud fra faste frø, så det kan genskabes præcis. Frøene
// laves af sættets navn, så sæt 2 har helt andre klasser end sæt 1.
// Sæt 1 har også de rigtige klasser og grænsetilfældene; de andre sæt kun
// tilfældige, plantede og matrix-klasser (de rigtige og grænsetilfældene er de
// samme i alle sæt, så de ville ikke være nye).
// I sæt-mappen ligger ét input pr. fil (kontrakt v2, afsnit 2) og _index.json
// med en beskrivelse af hvert. I facit-mappen ligger den plantede deling for
// hver plantet klasse (kontraktens svarformat), som dommeren skal give 0.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRandomInput } from './random-class.mjs';
import { makePlanted } from './planted.mjs';
import { boundaryCases } from './boundary.mjs';
import { realisticCases } from './real.mjs';
import { seedFromText } from '../../judge/random.mjs';

export const SET_SIZE = 300;
export const PLANTED_COUNT = 48;
export const SET_NAME = 'saet-1';

// Alle tilfælde i sættet, i fast rækkefølge: { file, kind, description, input, answer? }.
export function buildSet(setName = SET_NAME) {
  const withFixedCases = setName === SET_NAME;
  const entries = [];
  const push = (kind, name, description, input, answer) => {
    const number = String(entries.length + 1).padStart(3, '0');
    entries.push({ file: `${number}-${kind}${name ? `-${name}` : ''}.json`, kind, description, input, answer });
  };
  if (withFixedCases) {
    for (const c of realisticCases()) push('rigtig', c.name, c.description, c.input);
    for (const c of boundaryCases()) push('graense', c.name, c.description, c.input);
  }
  for (let i = 0; i < PLANTED_COUNT; i++) {
    const { input, answer } = makePlanted(seedFromText(`${setName}:plantet:${i}`));
    push('plantet', String(i + 1), 'Plantet klasse: der findes en deling med 0 på alle regler (se facit).', input, answer);
  }
  let i = 0;
  while (entries.length < SET_SIZE) {
    const input = makeRandomInput(seedFromText(`${setName}:tilfaeldig:${i++}`));
    const kind = input.view === 'matrix' ? 'matrix' : 'tilfaeldig';
    push(kind, String(i), `Tilfældig klasse på ${input.students.length} elever med ${input.rules.length} regler.`, input);
  }
  return entries;
}

function write(setName, dir) {
  const facitDir = `${dir}-facit`;
  rmSync(dir, { recursive: true, force: true });
  rmSync(facitDir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(facitDir, { recursive: true });
  const entries = buildSet(setName);
  const index = [];
  for (const entry of entries) {
    writeFileSync(join(dir, entry.file), `${JSON.stringify(entry.input, null, 1)}\n`);
    if (entry.answer) writeFileSync(join(facitDir, entry.file), `${JSON.stringify(entry.answer, null, 1)}\n`);
    index.push({
      file: entry.file,
      kind: entry.kind,
      description: entry.description,
      view: entry.input.view,
      students: entry.input.students.length,
      rules: entry.input.rules.map((r) => r.type),
      planted: Boolean(entry.answer),
    });
  }
  writeFileSync(join(dir, '_index.json'), `${JSON.stringify({ set: setName, contractVersion: 2, count: entries.length, entries: index }, null, 1)}\n`);
  const kinds = {};
  for (const e of entries) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log(`${entries.length} input skrevet til ${dir}`, kinds);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const setName = process.argv[2] || SET_NAME;
  write(setName, process.argv[3] || join(here, '..', setName));
}
