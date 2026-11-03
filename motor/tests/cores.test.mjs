// Trin 6: flere kerner giver samme svar som én kerne (spec. 11.1), og
// afspilningen kan skæres af og ender stadig i grupperne (spec. 12).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { buildTask } from '../engine/task.js';
import { computeLayout } from '../engine/sizes.js';
import { checkFeasibility } from '../engine/feasibility.js';
import { solve } from '../engine/solve.js';
import { buildPlayback } from '../engine/playback.js';

// En lille efterligning af browserens Worker.
class FakeWorker {
  static done = 0;
  constructor(url) {
    this.onmessage = null;
    this.onerror = null;
    this.inner = new NodeWorker(fileURLToPath(new URL('./worker-bootstrap.mjs', import.meta.url)), { workerData: { url: url.href } });
    this.inner.on('message', (data) => {
      if (data && data.type === 'done') FakeWorker.done++;
      if (this.onmessage) this.onmessage({ data });
    });
    this.inner.on('error', (e) => this.onerror && this.onerror(e));
  }
  postMessage(m) {
    this.inner.postMessage(m);
  }
  terminate() {
    this.inner.terminate();
  }
}

const load = (file) => JSON.parse(readFileSync(`testdata/saet-1/${file}`, 'utf8'));

async function solveWith(input, cores) {
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { blocks } = checkFeasibility(task, layout);
  return { task, result: await solve(task, layout, blocks, { budget: input.budget, seed: input.seed, input, cores }) };
}

test('flere kerner: samme grupper som på én kerne', async () => {
  globalThis.Worker = FakeWorker;
  try {
    for (const file of ['010-rigtig-realistisk-seks-regler.json', '108-matrix-4.json', '009-rigtig-realistisk-adskil-altid-spansk.json']) {
      const input = { ...load(file), seed: 3, budget: { maxSeconds: 1, maxAttempts: 6, minAttempts: 1 } };
      const one = await solveWith(input, 1);
      const before = FakeWorker.done;
      const many = await solveWith(input, 3);
      assert.ok(FakeWorker.done > before, `${file}: workerne kørte ikke`);
      assert.deepEqual(many.result.best.groups, one.result.best.groups, file);
      assert.equal(many.result.best.index, one.result.best.index, file);
      // Forsøgets nummer og "andre lige så gode" er de samme på flere kerner.
      assert.equal(many.result.winner, one.result.winner, file);
      assert.equal(many.result.agreeing, one.result.agreeing, file);
      assert.ok(one.result.winner >= 1 && one.result.winner <= one.result.attempts, file);
    }
  } finally {
    delete globalThis.Worker;
  }
});

test('afspilning med loft: de sidste trin lægges sammen og ender i grupperne', async () => {
  const input = { ...load('136-tilfaeldig-32.json'), seed: 1, budget: { maxSeconds: 1, maxAttempts: 1, minAttempts: 1 } };
  const { task, result } = await solveWith(input, 1);
  const pb = buildPlayback(task, result.best, 10).attempts[0];
  assert.equal(pb.cut, true);
  assert.ok(pb.moves.length >= 10);
  const groupOf = new Map(pb.deal.map(([s, g]) => [s, g]));
  for (const step of pb.moves) {
    if (step.move !== undefined) groupOf.set(step.move, step.to);
    for (const [x, y] of step.swap ? [step.swap] : step.swaps || []) {
      const gx = groupOf.get(x);
      groupOf.set(x, groupOf.get(y));
      groupOf.set(y, gx);
    }
  }
  pb.groups.forEach((members, g) => members.forEach((s) => assert.equal(groupOf.get(s), g)));
});
