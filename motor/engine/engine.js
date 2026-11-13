// Indgangen til den nye gruppemotor (kontrakt afsnit 7).
//
//   run(input, hooks) → Promise med svaret (kontrakt afsnit 3)
//   check(input)      → beskederne alene, før kørslen (spec. 8.1)
//
// Motoren kører uændret i en Web Worker i browseren og i Node. Den rører
// aldrig DOM'en eller nettet.

import { buildTask } from './task.js';
import { computeLayout } from './sizes.js';
import { checkFeasibility } from './feasibility.js';
import { assignTopics } from './topics.js';
import { solve, AGREEING, CONTRACT_VERSION } from './solve.js';
import { stopMessages, preRunMessages, postRunMessages, sortMessages } from './messages.js';
import { buildPlayback } from './playback.js';

export const ENGINE_INFO = { name: 'grup-motor', version: '0.1.0', contractVersion: CONTRACT_VERSION };
const VERSION = CONTRACT_VERSION;

export async function run(input, hooks = {}) {
  const started = Date.now();
  try {
    const task = buildTask(input);
    // En størrelse, der ikke kan bruges (fx −2 pr. gruppe), stoppes, før der
    // regnes på den (spørgsmål 47).
    const problem = sizeProblem(task);
    if (problem) return invalidInput(task, problem);
    const layout = computeLayout(task);
    const feasibility = checkFeasibility(task, layout);
    // Ingen grupper at danne og ingen grund at give læreren (fx ingen elever,
    // eller "full" uden matrix): input, motoren ikke kan bruge. Appen falder
    // så tilbage til den nuværende motor (kontrakt 3.2).
    if (layout.total === 0 && !feasibility.reasons.length) return invalidInput(task);
    if (feasibility.reasons.length) {
      return {
        contractVersion: VERSION,
        status: 'impossible',
        groups: null,
        lockedTopics: {},
        messages: sortMessages([...stopMessages(task, feasibility.reasons), ...preRunMessages(task, layout, [], false)]),
        rules: task.rules.map((rule) => ({ rule: rule.index, met: null })),
        playback: null,
        stats: { attempts: 0, seconds: (Date.now() - started) / 1000 },
      };
    }
    // hooks.cores (valgfri): hvor mange kerner motoren højst må bruge. Appens
    // prøvekørsel beder om 1, så tre korte forsøg ikke starter hjælpetråde.
    // Uden den vælger motoren selv (coreCount i solve.js).
    const result = await solve(task, layout, feasibility.blocks, { budget: input.budget, seed: input.seed, hooks, input, cores: hooks.cores });
    if (!result.best) {
      // Stoppet, før der var en hel deling (kontrakt 5).
      return {
        contractVersion: VERSION,
        status: 'stopped',
        groups: null,
        lockedTopics: {},
        messages: [],
        rules: task.rules.map((rule) => ({ rule: rule.index, met: null })),
        playback: null,
        stats: { attempts: result.attempts, seconds: (Date.now() - started) / 1000 },
      };
    }
    const groups = result.best.groups;
    const evaluation = result.best.evaluation;
    const { groupTopics, lockedTopics } = assignTopics(task, groups.map((g) => g.length));
    // "Sandsynligvis det bedste": mange forsøg endte hver for sig samme sted.
    const results = postRunMessages(task, groups, evaluation, {
      layout,
      blocks: feasibility.blocks,
      separatePairs: feasibility.separatePairs,
      bounds: result.bounds,
      likelyBest: !result.stopped && result.agreeing >= AGREEING,
    });
    const messages = sortMessages([
      // Fordels "kan ikke gå lige op" før kørslen erstattes af resultatet, og
      // en advarsel før kørslen sendes ikke, når samme regel og pulje (for
      // Undgå hinanden: samme aftale) har et resultat (spørgsmål 47).
      ...preRunMessages(task, layout, feasibility.blocks, true, feasibility.separatePairs).filter(
        (m) => m.code !== 'rule-not-met' && !results.some((r) => coversWarning(r, m)),
      ),
      ...results,
    ]);
    return {
      contractVersion: VERSION,
      status: result.stopped ? 'stopped' : 'ok',
      groups: groups.map((members, i) => ({ members: members.map((s) => task.ids[s]), topic: groupTopics[i] })),
      lockedTopics,
      messages,
      rules: task.rules.map((rule) => ruleLine(rule, evaluation.results[rule.index])),
      playback: result.stopped ? null : buildPlayback(task, result.best),
      // winner: det vindende forsøgs nummer (1, 2, 3 …) blandt de færdige
      // forsøg; sameAsWinner: hvor mange ANDRE forsøg der endte lige så godt
      // (spørgsmål 44). null, hvis Stop kom før noget forsøg var færdigt.
      stats: {
        attempts: result.attempts,
        seconds: (Date.now() - started) / 1000,
        cores: result.cores,
        winner: result.winner,
        sameAsWinner: result.winner === null ? null : result.agreeing - 1,
      },
    };
  } catch (error) {
    if (error && error.code === 'together-cannot-pack') return cannotPack(input, started);
    return {
      contractVersion: VERSION,
      status: 'error',
      reason: { code: 'crash', text: 'Der skete en fejl inde i motoren.' },
      detail: String(error && error.stack ? error.stack : error),
    };
  }
}

// Siger resultatet efter kørslen det samme som advarslen før kørslen?
const WARNINGS = new Set(['separate-unavoidable', 'cluster-unavoidable', 'avoid-unavoidable', 'together-separate-pair']);

function coversWarning(result, warning) {
  if (!WARNINGS.has(warning.code) || result.rule !== warning.rule || result.pool !== warning.pool) return false;
  if (warning.rule !== null) return true;
  // Undgå hinanden: samme aftale, altså de samme elever.
  return JSON.stringify([...result.students].sort()) === JSON.stringify([...warning.students].sort());
}

function invalidInput(task, text = null) {
  if (!text) text = task.n === 0 ? 'Der er ingen elever at danne grupper af.' : 'Opsætningen giver ingen grupper at danne.';
  return { contractVersion: VERSION, status: 'unsupported', reason: { code: 'invalid-input', text } };
}

// Er størrelsen noget, motoren kan bruge? Kontrakten siger: target og count
// er hele tal fra 1 til 999, og count er større end antallet af låste
// grupper. Alt andet (0, −2, 2,5, "4", en ukendt mode) er ugyldigt input, så
// appen bruger den nuværende motor (spørgsmål 47). Svarer med en tekst, eller
// null, når alt er i orden.
const MAX_SIZE_NUMBER = 999;

export function sizeProblem(task) {
  const size = task.size;
  const whole = (x) => Number.isInteger(x) && x >= 1 && x <= MAX_SIZE_NUMBER;
  if (!size || typeof size !== 'object') return 'Størrelsen mangler.';
  if (size.mode === 'perGroup') {
    return whole(size.target) ? null : `Elever pr. gruppe skal være et helt tal fra 1 til ${MAX_SIZE_NUMBER}.`;
  }
  if (size.mode === 'count') {
    if (!whole(size.count)) return `Antal grupper skal være et helt tal fra 1 til ${MAX_SIZE_NUMBER}.`;
    if (size.count <= task.locked.length) return 'Antal grupper skal være større end antallet af låste grupper.';
    return null;
  }
  if (size.mode === 'full') return null;
  return 'Størrelsen har en ukendt form.';
}

// Skal sammen-blokkene kunne ikke pakkes, selvom tjekket før kørslen ikke
// kunne afgøre det inden for sit loft (spec. 5.1).
function cannotPack(input, started) {
  const task = buildTask(input);
  const layout = computeLayout(task);
  const { blocks } = checkFeasibility(task, layout);
  const reasons = [{ code: 'together-cannot-pack', students: blocks.flat().map((s) => task.ids[s]), pool: null }];
  return {
    contractVersion: VERSION,
    status: 'impossible',
    groups: null,
    lockedTopics: {},
    messages: stopMessages(task, reasons),
    rules: task.rules.map((rule) => ({ rule: rule.index, met: null })),
    playback: null,
    stats: { attempts: 0, seconds: (Date.now() - started) / 1000 },
  };
}

// Beskederne før kørslen, fra de samme regelmoduler som run() (spec. 8.1 og
// koordinatorens note i kontrakten). Svarer uden grupper.
export function check(input) {
  try {
    const task = buildTask(input);
    const problem = sizeProblem(task);
    if (problem) return { ...invalidInput(task, problem), messages: [] };
    const layout = computeLayout(task);
    const feasibility = checkFeasibility(task, layout);
    if (layout.total === 0 && !feasibility.reasons.length) return { ...invalidInput(task), messages: [] };
    const stop = feasibility.reasons.length > 0;
    return {
      contractVersion: VERSION,
      status: stop ? 'impossible' : 'ok',
      messages: sortMessages([
        ...stopMessages(task, feasibility.reasons),
        ...preRunMessages(task, layout, feasibility.blocks, true, feasibility.separatePairs),
      ]),
    };
  } catch (error) {
    return {
      contractVersion: VERSION,
      status: 'error',
      reason: { code: 'crash', text: 'Der skete en fejl inde i motoren.' },
      messages: [],
    };
  }
}

// Én linje i svarets rules (kontrakt 3.5): met, og for Saml og Fordel dagens
// andel ved siden af (share).
function ruleLine(rule, measure) {
  const line = { rule: rule.index, met: measure.met };
  if (measure.today && measure.today.share !== null) line.share = measure.today.share;
  return line;
}
