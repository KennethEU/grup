#!/usr/bin/env node
// Kører den nye motor på et helt testsæt med flere frø og skriver ét svar pr.
// input og frø: 001-x.seed1.json, 001-x.seed2.json … (så dommerens batch og
// compare kan finde dem).
//
//   node tools/run-set.mjs <input-mappe> <svar-mappe> [--seeds 1,2,3,4,5] [--jobs 8] [--only 001,002] [--max-seconds 10] [--unseeded]
//
// --max-seconds sætter budget.maxSeconds i alle input (fx 10, som den
// nuværende motor fik i sammenligningen).
//
// --unseeded kører som appen: seed er null, så motoren bruger sit budget uden
// frø. For at kunne sammenligne to udgaver af motoren erstattes Math.random
// her (kun i værktøjet) med en fast talrække ud fra frøet, så begge udgaver
// får samme hovedfrø.
//
// Inputtene køres samtidig i flere tråde (én pr. job). Hver tråd kører
// motoren på én kerne, præcis som i Node-testene.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const [inputDir, outDir] = positional;
  if (!outDir) {
    console.log('Brug: node tools/run-set.mjs <input-mappe> <svar-mappe> [--seeds 1,2,3] [--jobs 8] [--only 001,002]');
    process.exit(1);
  }
  const seeds = option('--seeds', '1,2,3,4,5').split(',').map(Number);
  const jobs = Number(option('--jobs', '8'));
  const only = option('--only', null);
  const maxSeconds = option('--max-seconds', null);
  const unseeded = args.includes('--unseeded');
  mkdirSync(outDir, { recursive: true });
  let files = readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  if (only) {
    const prefixes = only.split(',');
    files = files.filter((f) => prefixes.some((p) => f.startsWith(p)));
  }
  // De største klasser først, så de ikke ender sidst alene.
  const tasks = [];
  for (const file of files) {
    const size = JSON.parse(readFileSync(join(inputDir, file), 'utf8')).students.length;
    for (const seed of seeds) tasks.push({ file, seed, size });
  }
  tasks.sort((a, b) => b.size - a.size);
  const started = Date.now();
  let next = 0;
  let done = 0;
  const times = [];
  const runWorker = () =>
    new Promise((resolve) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { inputDir, outDir, maxSeconds, unseeded } });
      const feed = () => {
        if (next >= tasks.length) {
          worker.terminate();
          resolve();
          return;
        }
        worker.postMessage(tasks[next++]);
      };
      worker.on('message', (msg) => {
        done++;
        times.push(msg);
        if (msg.error) console.log(`FEJL ${msg.file} seed ${msg.seed}: ${msg.error}`);
        if (done % 100 === 0) console.log(`${done}/${tasks.length} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
        feed();
      });
      worker.on('error', (e) => {
        console.log('Tråden fejlede:', e);
        resolve();
      });
      feed();
    });
  await Promise.all(Array.from({ length: jobs }, runWorker));
  writeFileSync(join(outDir, '_times.json'), JSON.stringify(times));
  console.log(`Færdig: ${done} svar på ${((Date.now() - started) / 1000).toFixed(0)} s`);
} else {
  const { run } = await import('../engine/engine.js');
  const { makeRandom } = await import('../engine/random.js');
  const { inputDir, outDir, maxSeconds, unseeded } = workerData;
  parentPort.on('message', async ({ file, seed }) => {
    const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
    if (unseeded) {
      input.seed = null;
      Math.random = makeRandom(seed);
    } else input.seed = seed;
    if (maxSeconds !== null) input.budget = { ...input.budget, maxSeconds: Number(maxSeconds) };
    const t0 = performance.now();
    let error = null;
    let answer;
    try {
      answer = await run(input, { onProgress: () => {}, isCancelled: () => false });
    } catch (e) {
      error = String(e && e.stack ? e.stack : e);
      answer = { contractVersion: 3, status: 'error', reason: { code: 'crash', text: 'Motoren fejlede.' } };
    }
    const seconds = (performance.now() - t0) / 1000;
    const stem = file.replace(/\.json$/, '');
    writeFileSync(join(outDir, `${stem}.seed${seed}.json`), JSON.stringify(answer));
    parentPort.postMessage({ file, seed, seconds, students: input.students.length, status: answer.status, attempts: answer.stats?.attempts ?? null, error });
  });
}
