#!/usr/bin/env node
// "Dyb søgning": hvor godt kan et input blive, hvis tiden ikke er en grænse?
// Bruges som målestok for, hvor langt motorens svar med appens budget ligger
// fra det bedste, vi kan finde. Det er ikke et bevis for det bedst mulige,
// men finder den dybe søgning noget bedre end motoren, HAR motoren tabt.
//
//   node tools/fable/deep.mjs <input-mappe> <ud.json> [--attempts 300] [--anneal 6] [--max-n 60] [--jobs 6] [--only 001,002]
//
// To uafhængige metoder, og den bedste af dem gemmes:
//   1. motorens egne forsøg, bare mange flere (--attempts), uden at stoppe før tid,
//   2. simuleret udglødning (--anneal runder): en anden søgemetode, der også
//      tager dårligere bytninger undervejs, efterfulgt af motorens forbedring.
// Resultatet pr. input: den bedste række (med Fordels sidste trin til sidst)
// og hvilken metode der fandt den.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  const [inputDir, outFile] = positional;
  const settings = { attempts: Number(option('--attempts', '300')), anneal: Number(option('--anneal', '6')), inputDir };
  const maxN = Number(option('--max-n', '60'));
  const jobs = Number(option('--jobs', '6'));
  const only = option('--only', null);
  let files = readdirSync(inputDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  if (only) files = files.filter((f) => only.split(',').some((p) => f.startsWith(p)));
  files = files.filter((f) => JSON.parse(readFileSync(join(inputDir, f), 'utf8')).students.length <= maxN);
  const results = {};
  let next = 0;
  let done = 0;
  const runWorker = () =>
    new Promise((resolve) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: settings });
      const feed = () => {
        if (next >= files.length) return worker.terminate().then(resolve);
        worker.postMessage(files[next++]);
      };
      worker.on('message', (msg) => {
        if (msg.result) results[msg.file.replace(/\.json$/, '')] = msg.result;
        if (++done % 50 === 0) console.log(`${done}/${files.length}`);
        feed();
      });
      worker.on('error', (e) => (console.log('Tråden fejlede:', e), resolve()));
      feed();
    });
  await Promise.all(Array.from({ length: jobs }, runWorker));
  writeFileSync(outFile, JSON.stringify(results));
  console.log(`Færdig: ${Object.keys(results).length} input`);
} else {
  const { buildTask } = await import('../../engine/task.js');
  const { computeLayout } = await import('../../engine/sizes.js');
  const { checkFeasibility } = await import('../../engine/feasibility.js');
  const { computeBaselines, evaluate, compareVectors } = await import('../../engine/rules.js');
  const { Attempt } = await import('../../engine/search.js');
  const { attemptSeed, makeRandom, randomInt } = await import('../../engine/random.js');
  const { attemptParams } = await import('../../engine/solve.js');
  const { attempts, anneal, inputDir } = workerData;

  parentPort.on('message', (file) => {
    const input = JSON.parse(readFileSync(join(inputDir, file), 'utf8'));
    const task = buildTask(input);
    const layout = computeLayout(task);
    const { reasons, blocks } = checkFeasibility(task, layout);
    if (reasons.length || !layout.total) return parentPort.postMessage({ file, result: null });
    const groupPool = layout.groups.map((g) => g.pool);
    const baselines = computeBaselines(task, layout, groupPool);
    const measure = (groups) => evaluate(task, groups, groupPool, blocks, baselines).vector;
    let best = null;
    let method = null;
    let foundAt = 0;
    const offer = (groups, how, i) => {
      const v = measure(groups);
      if (!best || compareVectors(v, best, 1e-7) < 0) {
        best = v;
        method = how;
        foundAt = i;
      }
    };
    const params = attemptParams(task, { maxSeconds: 10, maxAttempts: 20 });
    const all = Array.from({ length: task.n }, (_, i) => i);

    // 1. Motorens egne forsøg, mange flere. (Synkront: tick bruges ikke.)
    const runSync = (attempt) => {
      attempt.evaluationLimit = params.evaluationLimit * 4;
      attempt.build();
      attempt.localSearch(all);
      let top = Float64Array.from(attempt.state.totals);
      let topLength = attempt.log.length;
      let since = 0;
      for (let k = 0; k < params.shakes && since < params.stale; k++) {
        if (attempt.budgetSpent()) break;
        const size = 2 + randomInt(attempt.random, Math.min(4, Math.max(1, Math.floor(task.n / 8))));
        attempt.localSearch(attempt.shake(size));
        const c = attempt.state.compare(attempt.state.totals, top);
        if (c <= 0) {
          if (c < 0) since = 0;
          else since++;
          top = Float64Array.from(attempt.state.totals);
          topLength = attempt.log.length;
        } else {
          attempt.revertTo(topLength);
          since++;
        }
      }
      return attempt.state.groupsAsLists();
    };
    for (let i = 0; i < attempts; i++) {
      const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(987654321, i));
      offer(runSync(attempt), 'forsøg', i + 1);
    }

    // 2. Simuleret udglødning med ét tal: de tunge trin ganges med store
    //    tal (det øverste størst), målene 1, Saml og Fordels sidste trin små.
    for (let round = 0; round < anneal; round++) {
      const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(123456789, round));
      attempt.evaluationLimit = Infinity;
      attempt.build();
      const state = attempt.state;
      const levels = attempt.model.levels;
      const w = new Float64Array(levels.length);
      let heavyBelow = levels.filter((l) => l.kind === 'heavy' || l.kind === 'avoid' || l.kind === 'sources').length;
      levels.forEach((l, i) => {
        if (l.kind === 'goals') w[i] = 1;
        else if (l.kind === 'collect') w[i] = 0.05;
        else if (l.kind === 'today') w[i] = 0.002;
        else w[i] = 50 * 4 ** --heavyBelow;
      });
      const random = makeRandom(555 + round);
      const steps = 40000 * Math.max(8, task.n);
      let T = 0.4;
      const cool = Math.pow(0.0005 / T, 1 / steps);
      for (let step = 0; step < steps; step++, T *= cool) {
        const s = randomInt(random, task.n);
        if (attempt.blockOf[s] >= 0) continue;
        const g = state.groupOf[s];
        const groups = attempt.groupsOfPool[attempt.groupPool[g]];
        if (groups.length < 2) continue;
        const h = groups[randomInt(random, groups.length)];
        if (h === g) continue;
        const list = state.members[h];
        const t = list[randomInt(random, list.length)];
        if (attempt.blockOf[t] >= 0 || !attempt.swapOk(s, t, g, h)) continue;
        const moves = [s, h, t, g];
        const delta = state.tryMoves(moves);
        let d = 0;
        for (let l = 0; l < w.length; l++) d += w[l] * delta[l];
        if (d <= 0 || random() < Math.exp(-d / T)) {
          attempt.apply(moves, 'swap', 'worse');
          if (attempt.log.length > 5000) attempt.log.length = 0;
        }
      }
      attempt.log.length = 0;
      state.recompute();
      attempt.localSearch(all);
      offer(state.groupsAsLists(), 'udglødning', round + 1);
    }
    parentPort.postMessage({ file, result: { n: task.n, vector: best, method, foundAt } });
  });
}
