// Én ekstra kerne (spec. 11.1). solve.js starter én worker pr. kerne fra
// denne fil og sender den input og indstillinger én gang og derefter
// forsøgenes numre. Workeren kører forsøget præcis som på én kerne og sender
// grupperne og afspilningssporet tilbage.
//
// Beskeder ind:  { type: 'init', input, params, seed }, { type: 'attempt', index }
// Beskeder ud:   { type: 'progress', index, groups }, { type: 'done', index, groups, deal, log },
//                { type: 'error', text }

import { buildTask } from './task.js';
import { computeLayout } from './sizes.js';
import { checkFeasibility } from './feasibility.js';
import { computeBaselines, evaluate, atBestPossible } from './rules.js';
import { computeBounds } from './bounds.js';
import { Attempt } from './search.js';
import { attemptSeed } from './random.js';

let setup = null;
const PROGRESS_MS = 700;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === 'init') {
      const task = buildTask(msg.input);
      const layout = computeLayout(task);
      const { blocks } = checkFeasibility(task, layout);
      const groupPool = layout.groups.map((g) => g.pool);
      const baselines = computeBaselines(task, layout, groupPool);
      const bounds = computeBounds(task, layout);
      setup = { task, layout, blocks, groupPool, baselines, bounds, params: msg.params, seed: msg.seed };
      return;
    }
    if (msg.type === 'attempt') {
      const { task, layout, blocks, groupPool, baselines, bounds, params, seed } = setup;
      const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(seed, msg.index));
      let last = now();
      const result = await attempt.run({
        ...params,
        tick: async () => {
          if (now() - last >= PROGRESS_MS) {
            last = now();
            self.postMessage({ type: 'progress', index: msg.index, groups: attempt.state.groupsAsLists() });
          }
          return false;
        },
        isBest: (a) => atBestPossible(task, evaluate(task, a.state.groupsAsLists(), groupPool, blocks, baselines), bounds),
      });
      self.postMessage({ type: 'done', index: msg.index, groups: result.groups, deal: attempt.deal, log: attempt.log });
    }
  } catch (error) {
    self.postMessage({ type: 'error', text: String(error && error.message ? error.message : error) });
  }
};
