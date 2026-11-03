#!/usr/bin/env node
// Fund 2: matrix "Fuld" sammen med en Opdel-regel. Motoren ser bort fra
// puljerne (hele opgaven er én pulje ved "Fuld") og svarer "ok" med grupper,
// der blander puljerne, uden besked. Dommeren melder brud på de faste krav.
//
//   node gennemgang/fund-2.mjs   (bruger gennemgang/fund-2.json)

import { readFileSync } from 'node:fs';
import { run } from '../engine/engine.js';
import { judge } from '../judge/judge.mjs';

const input = JSON.parse(readFileSync(new URL('./fund-2.json', import.meta.url), 'utf8'));
const answer = await run(input, {});
console.log('motor:', answer.status, JSON.stringify(answer.groups), 'rules', JSON.stringify(answer.rules), 'beskeder', JSON.stringify(answer.messages.map((m) => m.code)));
const grade = judge(input, answer);
console.log('dommer:', JSON.stringify(grade.failures.map((f) => f.text)));
