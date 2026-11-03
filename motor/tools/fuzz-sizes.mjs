#!/usr/bin/env node
// Prøver motoren med mange størrelser, også skæve (spørgsmål 47):
//
//   node tools/fuzz-sizes.mjs [--jobs 4] [--limit 1]
//
// target −5 … 200 ("+1" og "-1") og count −5 … 200, med 1, 5, 30 og 300
// elever og fem slags opsætninger (almindelig klasse, emner, Opdel, matrix,
// låste grupper). check(input) prøves med alle; run(input) med et udvalg og
// et lille budget med frø.
//
// Hvert kald kører i en tråd for sig. Hænger et kald (svarer det ikke inden
// for 10 s), stoppes tråden udefra, så selve værktøjet aldrig hænger. Til sidst
// står de kald, der tog mere end --limit sekunder, der kastede en fejl, eller
// som svarede noget andet end ok / impossible / unsupported.

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const HANG_SECONDS = 10;

function students(n) {
  return Array.from({ length: n }, (_, i) => ({
    _rowId: `r${i}`,
    Navn: `Elev ${i}`,
    Køn: i % 3 === 0 ? 'Dreng' : 'Pige',
    Linje: i % 4 === 0 ? 'Bio' : 'Mat',
    Niveau: ['Lav', 'Middel', 'Høj'][i % 3],
  }));
}

function makeInput(scene, n, size) {
  const input = {
    contractVersion: 3,
    view: 'home',
    students: students(n),
    columnOrders: { Niveau: ['Lav', 'Middel', 'Høj'] },
    rules: [
      { type: 'distribute', column: 'Køn' },
      { type: 'balance', column: 'Niveau' },
    ],
    size,
    topics: [],
    lockedGroups: [],
    agreements: { together: [], avoid: n >= 3 ? [['r0', 'r1', 'r2']] : [] },
    matrix: null,
    seed: 1,
    budget: { maxSeconds: 1, maxAttempts: 1 },
  };
  if (scene === 'emner') input.topics = ['A', 'B', 'C', 'D', 'E'];
  if (scene === 'opdel') input.rules.unshift({ type: 'aggregate', column: 'Linje' });
  if (scene === 'laaste') {
    input.lockedGroups = [
      { id: 'L1', members: ['x1', 'x2'] },
      { id: 'L2', members: ['x3', 'x4'] },
    ];
  }
  if (scene === 'matrix') {
    input.view = 'matrix';
    input.agreements = { together: [], avoid: [] };
    const homeGroups = [0, 1, 2].map((h) => ({
      id: `S${h + 1}`,
      topic: `Emne ${h + 1}`,
      members: input.students.filter((_, i) => i % 3 === h).map((s) => s._rowId),
    }));
    input.matrix = { source: 'topic', homeGroups };
  }
  return input;
}

function* cases() {
  const scenes = ['klasse', 'emner', 'opdel', 'matrix', 'laaste'];
  const range = [];
  for (let x = -5; x <= 200; x++) range.push(x);
  const runSome = new Set([-5, -2, -1, 0, 1, 2, 3, 4, 7, 50, 200]);
  for (const n of [1, 5, 30, 300]) {
    for (const scene of scenes) {
      for (const x of range) {
        for (const adjust of ['plus', 'minus']) {
          const size = { mode: 'perGroup', target: x, adjust };
          yield { scene, n, size, call: 'check' };
          if (runSome.has(x)) yield { scene, n, size, call: 'run' };
        }
        const size = { mode: 'count', count: x };
        yield { scene, n, size, call: 'check' };
        if (runSome.has(x)) yield { scene, n, size, call: 'run' };
      }
      if (scene === 'matrix') {
        yield { scene, n, size: { mode: 'full' }, call: 'check' };
        yield { scene, n, size: { mode: 'full' }, call: 'run' };
      }
    }
  }
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  const jobs = option('--jobs', 4);
  const limit = option('--limit', 1);
  const all = [...cases()];
  let next = 0;
  let done = 0;
  const slow = [];
  const problems = [];
  const statuses = new Map();
  const longest = { check: 0, run: 0 };
  const started = Date.now();
  const describe = (c) => `${c.call} ${c.scene} ${c.n} elever ${JSON.stringify(c.size)}`;

  await new Promise((resolve) => {
    let running = 0;
    const startWorker = () => {
      if (next >= all.length) {
        if (running === 0) resolve();
        return;
      }
      running++;
      const worker = new Worker(fileURLToPath(import.meta.url));
      let current = null;
      let timer = null;
      const give = () => {
        if (next >= all.length) {
          worker.terminate();
          return;
        }
        current = all[next++];
        timer = setTimeout(() => {
          problems.push(`HÆNGER (over ${HANG_SECONDS} s): ${describe(current)}`);
          done++;
          worker.terminate();
        }, HANG_SECONDS * 1000);
        worker.postMessage(current);
      };
      worker.on('message', (result) => {
        clearTimeout(timer);
        done++;
        const key = `${current.call} ${result.status}${result.reason ? ` ${result.reason}` : ''}`;
        statuses.set(key, (statuses.get(key) || 0) + 1);
        longest[current.call] = Math.max(longest[current.call], result.seconds);
        if (result.seconds > limit) slow.push(`${result.seconds.toFixed(2)} s: ${describe(current)} → ${result.status}`);
        if (result.thrown) problems.push(`KASTEDE: ${describe(current)}: ${result.thrown}`);
        else if (!['ok', 'impossible', 'unsupported'].includes(result.status)) {
          problems.push(`${result.status}: ${describe(current)}${result.detail ? `: ${result.detail}` : ''}`);
        }
        give();
      });
      worker.on('exit', () => {
        running--;
        startWorker();
      });
      give();
    };
    for (let j = 0; j < jobs; j++) startWorker();
  });

  console.log(`${done} kald på ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const [key, count] of [...statuses].sort()) console.log(`  ${key}: ${count}`);
  console.log(`Længste check ${longest.check.toFixed(3)} s, længste run ${longest.run.toFixed(3)} s`);
  console.log(`Over ${limit} s: ${slow.length}`);
  for (const line of slow) console.log(`  ${line}`);
  console.log(`Fejl, kast eller hæng: ${problems.length}`);
  for (const line of problems) console.log(`  ${line}`);
} else {
  const { run, check } = await import('../engine/engine.js');
  parentPort.on('message', async (c) => {
    const input = makeInput(c.scene, c.n, c.size);
    const t0 = performance.now();
    let answer;
    let thrown = null;
    try {
      answer = c.call === 'check' ? check(input) : await run(input);
    } catch (error) {
      thrown = String(error);
    }
    const seconds = (performance.now() - t0) / 1000;
    parentPort.postMessage({
      seconds,
      thrown,
      status: answer ? answer.status : null,
      reason: answer && answer.reason ? answer.reason.code : null,
      detail: answer && answer.detail ? answer.detail.split('\n')[0] : null,
    });
  });
}
