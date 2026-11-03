// Rangordenen (specifikation afsnit 7) — et lag oven på målingerne.
//
// Rækkefølgen: faste krav → hver Adskil altid (opskriftens rækkefølge) →
// Undgå hinanden → (matrix) "højst én fra hver kilde" → hver Adskil og Klyng
// (opskriftens rækkefølge) → målene (trinvist vægtet) → Saml (trinvist vægtet).
// To gruppedelinger sammenlignes tal for tal fra toppen.

import { makeRandom, shuffled } from './random.mjs';
import { splitEven } from './sizes.mjs';
import { makeContext, measureRule } from './rules.mjs';

export const BASELINE_SAMPLES = 200;
export const BASELINE_SEED = 20261103;

const GOAL_TYPES = new Set(['distribute', 'balance', 'minimizediff']);

// Tilfældige gyldige gruppedelinger i de forventede størrelser (pr. pulje).
export function randomGroupings(task, layout, samples, seed) {
  const random = makeRandom(seed);
  const result = [];
  for (let s = 0; s < samples; s++) {
    const groups = [];
    if (layout.wholeTask) {
      const order = shuffled(random, task.ids);
      let at = 0;
      for (const size of splitEven(order.length, layout.total)) {
        groups.push(order.slice(at, at + size));
        at += size;
      }
    } else {
      for (const pool of layout.pools) {
        const order = shuffled(random, task.pools.get(pool.key).ids);
        let at = 0;
        for (const size of pool.sizes) {
          groups.push(order.slice(at, at + size));
          at += size;
        }
      }
    }
    result.push(groups.filter((g) => g.length));
  }
  return result;
}

// "Hvor skæv er en tilfældig gruppedeling" pr. mål og pr. Saml-del (spec. 7.3).
export function computeBaselines(task, layout, samples = BASELINE_SAMPLES, seed = BASELINE_SEED) {
  const goalRules = task.rules.filter((r) => GOAL_TYPES.has(r.type) || r.type === 'group_sort');
  const sums = new Map(goalRules.map((r) => [r.index, { value: 0, variance: 0, valueCount: 0 }]));
  if (!goalRules.length || layout.total <= 0) return new Map();
  const groupings = randomGroupings(task, layout, samples, seed);
  for (const groups of groupings) {
    const ctx = makeContext(task, groups);
    for (const rule of goalRules) {
      const m = measureRule(ctx, rule);
      const sum = sums.get(rule.index);
      sum.value += m.value;
      if (m.parts) {
        sum.variance += m.parts.variance;
        sum.valueCount += m.parts.valueCount;
      }
    }
  }
  const baselines = new Map();
  for (const [index, sum] of sums) {
    baselines.set(index, {
      value: sum.value / groupings.length,
      variance: sum.variance / groupings.length,
      valueCount: sum.valueCount / groupings.length,
    });
  }
  return baselines;
}

// Et tal delt med det tilfældige; 0, hvis det tilfældige er 0.
function scaled(value, baseline) {
  return baseline > 0 ? value / baseline : 0;
}

// Saml og mål gøres om til samme skala.
export function normalizedGoal(rule, measure, baseline) {
  if (!baseline) return 0;
  if (rule.type === 'group_sort' && measure.parts) {
    return scaled(measure.parts.variance, baseline.variance) + scaled(measure.parts.valueCount, baseline.valueCount);
  }
  return scaled(measure.value, baseline.value);
}

// Bygger rangordens-rækken. results: målingerne pr. regel (samme rækkefølge
// som task.rules), avoid og matrix: målingerne for aftalerne og kilderne.
export function precedence(task, failures, results, avoid, matrixSources, baselines) {
  const steps = [];
  steps.push({ step: 0, label: 'Faste krav (antal fejl)', value: failures.length });
  for (const r of task.rules) {
    if (r.type === 'strict_separate') steps.push({ step: 1, label: `Adskil altid på "${r.column}" (regel ${r.index})`, rule: r.index, value: results[r.index].value });
  }
  steps.push({ step: 2, label: 'Undgå hinanden', value: avoid ? avoid.value : 0 });
  if (task.view === 'matrix' && matrixSources) {
    steps.push({ step: 3, label: 'Højst én fra hver kilde', value: matrixSources.value });
  }
  for (const r of task.rules) {
    if (r.type === 'separate' || r.type === 'cluster') {
      steps.push({ step: 4, label: `${r.name} på "${r.column}" (regel ${r.index})`, rule: r.index, value: results[r.index].value });
    }
  }
  steps.push(weightedStep(5, 'Mål (vægtet)', task.rules.filter((r) => GOAL_TYPES.has(r.type)), results, baselines));
  steps.push(weightedStep(6, 'Saml (vægtet)', task.rules.filter((r) => r.type === 'group_sort'), results, baselines));
  return { steps, vector: steps.map((s) => s.value) };
}

// Trinvis vægt: med n regler vejer den øverste n, den næste n − 1 … den nederste 1.
function weightedStep(step, label, rules, results, baselines) {
  const n = rules.length;
  const parts = rules.map((rule, i) => {
    const weight = n - i;
    const normalized = normalizedGoal(rule, results[rule.index], baselines.get(rule.index));
    return { rule: rule.index, weight, normalized };
  });
  const value = parts.reduce((sum, p) => sum + p.weight * p.normalized, 0);
  return { step, label, value, parts };
}

// Sammenligner to rækker: negativ, hvis a er bedst; positiv, hvis b er bedst.
export function compareVectors(a, b, tolerance = 1e-9) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Math.abs(x - y) > tolerance * Math.max(1, Math.abs(x), Math.abs(y))) return x < y ? -1 : 1;
  }
  return 0;
}
