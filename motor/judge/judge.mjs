// Dommeren: giver karakter til en færdig gruppedeling (specifikation afsnit 16).
//
// Dommeren læser KUN "hvem er i hvilken gruppe" (svarets status og groups).
// Den stoler aldrig på svarets egne rules, messages eller playback, så den kan
// bedømme den nuværende motors grupper præcis som den nyes.

import { buildTask } from './task.mjs';
import { expectedLayout } from './sizes.mjs';
import { makeContext, measureRule, measureAvoid, measureMatrixSources } from './rules.mjs';
import { fixedChecks } from './checks.mjs';
import { stopReasons } from './feasibility.mjs';
import { computeBaselines, precedence, BASELINE_SAMPLES } from './rank.mjs';

export { compareVectors } from './rank.mjs';

const GRADABLE = new Set(['ok', 'stopped']);

// input: kontraktens input (afsnit 2). answer: kontraktens svar (afsnit 3).
// options.samples: antal tilfældige delinger til skalaen (standard 200).
export function judge(input, answer, options = {}) {
  const task = buildTask(input);
  const layout = expectedLayout(task);
  const feasibility = stopReasons(task, layout);
  const status = answer && typeof answer.status === 'string' ? answer.status : 'invalid';
  const grade = {
    status,
    gradable: false,
    students: task.ids.length,
    layout: { total: layout.total, pools: layout.pools.map((p) => ({ name: task.pools.get(p.key)?.name ?? null, n: p.n, groups: p.groups, sizes: p.sizes })), notes: layout.notes },
    stop: {
      shouldStop: feasibility.reasons.length > 0,
      packing: feasibility.packing,
      reasons: feasibility.reasons.map((r) => ({ code: r.code, text: r.text, students: r.students })),
    },
    failures: [],
    rules: [],
    avoid: null,
    matrixSources: null,
    precedence: null,
  };

  if (status === 'impossible') {
    // Var det rigtigt at stoppe? Ja, hvis der er en grund; ukendt, hvis
    // pakningen ramte loftet; ellers nej.
    grade.stop.justified = feasibility.reasons.length > 0 ? true : feasibility.packing === 'unknown' ? null : false;
    if (grade.stop.justified === false) {
      grade.failures.push({ check: 'stop', name: 'Stop ved umulig Skal sammen', text: 'Svaret siger "umulig", men dommeren finder ingen grund til at stoppe.', students: [] });
    }
    return grade;
  }
  if (!GRADABLE.has(status) || !answer || !Array.isArray(answer.groups)) {
    if (!GRADABLE.has(status) && !['unsupported', 'error'].includes(status)) {
      grade.failures.push({ check: 'membership', name: 'Svarets form', text: `Ukendt status "${status}".`, students: [] });
    }
    return grade;
  }

  const groups = answer.groups.map((g) => (g && Array.isArray(g.members) ? g.members.slice() : []));
  grade.gradable = true;
  grade.failures = fixedChecks(task, groups, answer, layout, feasibility);

  const ctx = makeContext(task, groups);
  const results = task.rules.map((rule) => measureRule(ctx, rule));
  const avoid = measureAvoid(ctx);
  const matrixSources = task.view === 'matrix' && task.matrix ? measureMatrixSources(ctx) : null;
  const baselines = computeBaselines(task, layout, options.samples ?? BASELINE_SAMPLES);

  grade.rules = task.rules.map((rule, i) => {
    const r = results[i];
    const entry = {
      rule: rule.index,
      type: rule.type,
      name: rule.name,
      column: rule.column,
      value: r.value,
      best: r.best,
      distance: r.best === null || r.best === undefined ? null : r.value - r.best,
      met: r.met,
      groupsMet: r.groups.map((g) => g.met),
    };
    if (r.parts) entry.parts = r.parts;
    if (r.today) entry.today = r.today;
    if (r.fair) entry.fair = r.fair;
    if (rule.type === 'group_sort') entry.mode = rule.mode;
    const baseline = baselines.get(rule.index);
    if (baseline) entry.randomBaseline = rule.type === 'group_sort' ? baseline : baseline.value;
    return entry;
  });
  grade.avoid = { value: avoid.value, best: avoid.best, distance: avoid.value - avoid.best, met: task.avoid.length ? avoid.met : null };
  if (matrixSources) {
    grade.matrixSources = { value: matrixSources.value, best: matrixSources.best, distance: matrixSources.value - matrixSources.best, met: matrixSources.met };
  }
  grade.precedence = precedence(task, grade.failures, results, avoid, matrixSources, baselines);
  grade.tiebreak = poolTiebreak(task, groups, layout);
  return grade;
}

// Fulgte svaret den præcise regel for, hvilken pulje der får en gruppe, når
// flere fordelinger er lige gode (svar6 37)? Lige gode fordelinger godtages
// stadig i de faste kontroller; her vises kun, om reglen blev fulgt, så
// resultatet kan genskabes.
function poolTiebreak(task, groups, layout) {
  if (!layout.flexible) return { applies: false, followed: null };
  const actual = layout.pools.map((pool) => groups.filter((m) => m.length && task.poolKeyOf.get(m[0]) === pool.key).length);
  const expected = layout.pools.map((pool) => pool.groups);
  return { applies: true, followed: actual.every((n, i) => n === expected[i]), expected, actual };
}
