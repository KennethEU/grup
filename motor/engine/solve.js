// Mange uafhængige forsøg, og den bedste vinder (specifikation 10.5 og 11).
//
// Hvert forsøg har sit eget frø, lavet ud fra hovedfrøet og forsøgets
// nummer. Den bedste efter rangordenen vinder; ved lighed forsøget med det
// laveste nummer. Med et fast frø styres antallet af forsøg og arbejdet i
// hvert forsøg af tællere, aldrig af uret, så en langsom maskine giver det
// samme svar som en hurtig (kontrakt 2.2).
//
// Uden frø (som appen kører) er maxAttempts kun et mindste antal. Et forsøg
// tager ofte under et tiendedel sekund, så motoren fortsætter, til det
// bedste er holdt op med at blive bedre: de seneste maxAttempts forsøg har
// ikke fundet noget bedre, og mindst AGREEING forsøg er hver for sig endt med
// præcis samme resultat. Eller: intet er blevet bedre i dobbelt så mange
// forsøg, som det tog at finde det bedste (mindst 2 · maxAttempts), selvom
// forsøgene aldrig endte ens. Den stopper også, når alle regler er ved det
// bedst mulige, eller når tiden (maxSeconds) er gået.
//
// Flere kerner (spec. 11.1): i browseren startes én worker pr. kerne fra
// worker.js i samme mappe, og forsøgene deles ud mellem dem. Svaret er det
// samme som på én kerne, fordi vinderen vælges ud fra forsøgenes numre, ikke
// ud fra, hvem der blev færdig først. Virker workers ikke (og altid i Node),
// køres forsøgene efter hinanden.

import { Attempt } from './search.js';
import { attemptSeed } from './random.js';
import { computeBaselines, evaluate, compareVectors, atBestPossible, levelPlan } from './rules.js';
import { computeBounds } from './bounds.js';

// Hvor mange bytninger motoren regner med at kunne prøve pr. sekund. Bruges
// kun til at gøre budgettet til et fast antal (se ovenfor).
export const EVALUATIONS_PER_SECOND = 1000000;

// Hvor ofte motoren kigger op: Stop, fremgang og beskeder (millisekunder).
const LOOK_UP_MS = 150;
const PROGRESS_MS = 900;

// Uden frø: så mange forsøg skal være endt med samme resultat som det
// bedste, før motoren regner det for "fundet". Valgt ud fra sæt 1 og 2
// (resultater/motor-konvergens.md). Bruges også i beskederne.
export const AGREEING = 5;
// To resultater er "det samme", når de er ens på 6 betydende cifre.
export const SAME = 1e-6;
// Uden frø aldrig flere forsøg end dette (tiden stopper normalt før).
const UNSEEDED_LIMIT = 10000;
// Den hurtige første opbygning får sit eget frø, så den aldrig falder
// sammen med et rigtigt forsøg.
const QUICK_SALT = 0x5bd1e995;

export function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// Lader browseren (eller Node) nå at modtage beskeder, fx Stop.
function pause(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Indstillingerne for ét forsøg. Ens på alle kerner.
export function attemptParams(task, budget) {
  const maxSeconds = budget.maxSeconds ?? 10;
  const maxAttempts = Math.max(1, budget.maxAttempts ?? 20);
  return {
    shakes: 400,
    stale: Math.max(60, Math.min(200, task.n)),
    evaluationLimit: Math.max(20000, Math.round((EVALUATIONS_PER_SECOND * maxSeconds) / maxAttempts)),
  };
}

// Hvor mange kerner må motoren bruge? I Node (ingen Worker) altid én.
function coreCount(options) {
  if (options.cores !== undefined) return options.cores;
  if (typeof Worker === 'undefined' || typeof navigator === 'undefined') return 1;
  const n = Number(navigator.hardwareConcurrency) || 1;
  return Math.max(1, Math.min(8, n - 1));
}

export async function solve(task, layout, blocks, options) {
  const started = now();
  const budget = options.budget || {};
  const maxSeconds = budget.maxSeconds ?? 10;
  const maxAttempts = Math.max(1, budget.maxAttempts ?? 20);
  const minAttempts = Math.max(1, Math.min(maxAttempts, budget.minAttempts ?? 3));
  const seeded = Number.isInteger(options.seed);
  const seed = seeded ? options.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
  // Med frø: højst maxAttempts forsøg. Uden frø: maxAttempts er kun et
  // mindste antal (se mayStartAnother).
  const limit = seeded ? maxAttempts : UNSEEDED_LIMIT;
  const groupPool = layout.groups.map((g) => g.pool);
  const baselines = computeBaselines(task, layout, groupPool);
  const params = attemptParams(task, budget);
  const hooks = options.hooks || {};
  const cancelled = () => (hooks.isCancelled ? Boolean(hooks.isCancelled()) : false);
  const evaluateGroups = (groups) => evaluate(task, groups, groupPool, blocks, baselines);
  // "Bedre" og "ens" til at stoppe og til "nok det bedste" ses på rækken uden
  // Fordels sidste trin (dagens test): det trin vælger kun mellem lige gode
  // delinger og skal ikke kunne gøre en kørsel længere.
  const plan = levelPlan(task);
  const core = plan.length && plan[plan.length - 1].kind === 'today' ? (v) => v.slice(0, -1) : (v) => v;
  let bounds = null; // Balancérs grænser (bounds.js), regnes lige efter første fremgang

  // De færdige forsøg efter nummer: kun rækken og "ved det bedst mulige".
  // Hele delingen gemmes kun for vinderen (top), så tusind forsøg ikke fylder.
  const done = [];
  let top = null; // { index, groups, evaluation, deal, log }
  let agreeing = 0; // hvor mange færdige forsøg, der nåede samme række som vinderen
  let improvedAt = 0; // antal færdige forsøg, da vinderens række sidst blev bedre
  let finished = 0;
  let started_ = 0; // antal forsøg, der er sat i gang
  let snapshot = null; // foreløbig bedste, før noget forsøg er færdigt
  let lastProgress = -Infinity;
  let stopped = false;

  // Er vi færdige? (Alle regler ved det bedst mulige i et forsøg, og alle
  // forsøg med lavere nummer er færdige.)
  const doneAtBest = () => {
    for (let i = 0; i < started_; i++) {
      if (!done[i]) return false;
      if (done[i].atBest) return true;
    }
    return false;
  };
  // Uden frø: er det bedste holdt op med at blive bedre? Det er det, når de
  // seneste maxAttempts forsøg ikke har gjort det bedre, og mindst AGREEING
  // forsøg hver for sig er endt med præcis samme række. Eller når intet er
  // blevet bedre i lang tid (store hold, hvor forsøgene sjældent ender ens).
  const converged = () => {
    const since = finished - improvedAt;
    return (since >= maxAttempts && agreeing >= AGREEING) || since >= Math.max(2 * maxAttempts, improvedAt);
  };
  const mayStartAnother = () => {
    if (started_ >= limit || doneAtBest()) return false;
    if (seeded || started_ < minAttempts) return true;
    if ((now() - started) / 1000 >= maxSeconds) return false;
    return started_ < maxAttempts || !converged();
  };

  const progress = (force) => {
    if (!hooks.onProgress) return;
    const t = now();
    if (!force && t - lastProgress < PROGRESS_MS) return;
    const best = top || snapshot;
    if (!best) return;
    lastProgress = t;
    hooks.onProgress(progressMessage(task, best, finished, seeded ? maxAttempts : null, (t - started) / 1000, bounds));
  };
  const record = (i, groups, deal, log) => {
    const evaluation = evaluateGroups(groups);
    const vector = evaluation.vector;
    done[i] = { vector: core(vector), atBest: atBestPossible(task, evaluation, bounds) };
    finished++;
    // Vinderen: den bedste efter rangordenen, ved lighed det laveste nummer,
    // så svaret er det samme på én og på flere kerner.
    const c = top ? compareVectors(vector, top.evaluation.vector) : -1;
    if (c < 0 || (c === 0 && i < top.index)) {
      if (!top || compareVectors(core(vector), core(top.evaluation.vector), SAME) < 0) improvedAt = finished;
      top = { index: i, groups, evaluation, deal, log };
      agreeing = 0;
      for (const d of done) if (d && compareVectors(d.vector, core(vector), SAME) === 0) agreeing++;
    } else if (compareVectors(core(vector), core(top.evaluation.vector), SAME) === 0) agreeing++;
  };

  // Første fremgang med det samme (kontrakt 4: inden for 1 sekund): en
  // hurtig grådig opbygning, før de rigtige forsøg går i gang. Den er kun til
  // visning og ved Stop; den kan aldrig vinde over et færdigt forsøg.
  {
    const quick = new Attempt(task, layout, blocks, baselines, attemptSeed(seed ^ QUICK_SALT, 0));
    quick.build();
    const groups = quick.state.groupsAsLists();
    snapshot = { groups, evaluation: evaluateGroups(groups) };
    progress(true);
  }
  bounds = computeBounds(task, layout);

  // --- Flere kerner ------------------------------------------------------
  const cores = coreCount(options);
  let pool = cores > 1 ? startPool(cores, options.input) : null;
  let usedCores = 1;
  if (pool) {
    const outcome = await runPool(pool);
    if (outcome === 'failed') pool = null; // fortsæt på én kerne nedenfor
    else usedCores = pool.length;
  }

  // --- Én kerne ----------------------------------------------------------
  if (!pool) {
    let lastLook = now();
    for (let i = 0; i < limit && !stopped; i++) {
      if (done[i]) continue;
      if (!mayStartAnother() && i >= started_) break;
      started_ = Math.max(started_, i + 1);
      const attempt = new Attempt(task, layout, blocks, baselines, attemptSeed(seed, i));
      const tick = async () => {
        const t = now();
        if (t - lastLook < LOOK_UP_MS) return false;
        lastLook = t;
        if (!top && t - lastProgress >= PROGRESS_MS) {
          // Endnu intet færdigt forsøg: vis det, der er nu.
          const groups = attempt.state.groupsAsLists();
          snapshot = { groups, evaluation: evaluateGroups(groups) };
        }
        progress(false);
        await pause();
        return cancelled();
      };
      const result = await attempt.run({
        ...params,
        tick,
        isBest: (a) => atBestPossible(task, evaluateGroups(a.state.groupsAsLists()), bounds),
      });
      record(i, result.groups, attempt.deal, attempt.log);
      if (result.cancelled) stopped = true;
      else if (await tick()) stopped = true;
    }
  }

  // Stoppet, før et forsøg blev færdigt: den foreløbig bedste hele deling.
  const best = top || (stopped && snapshot ? { index: -1, ...snapshot, deal: null, log: null } : null);
  progress(true);
  return {
    best: best ? { index: best.index, groups: best.groups, evaluation: best.evaluation, attempt: { deal: best.deal, log: best.log } } : null,
    attempts: finished,
    // Vinderens nummer blandt de færdige forsøg (1, 2, 3 …). Tæller kun
    // færdige forsøg med lavere nummer, så det aldrig er over attempts, heller
    // ikke på flere kerner, eller når Stop kom midt i.
    winner: top ? 1 + done.slice(0, top.index).filter(Boolean).length : null,
    agreeing: top ? agreeing : 0,
    bounds,
    cores: usedCores,
    stopped,
    seconds: (now() - started) / 1000,
    baselines,
    groupPool,
  };

  // Starter workerne. Giver null, hvis det ikke kan lade sig gøre.
  function startPool(count, input) {
    if (!input) return null;
    const workers = [];
    try {
      for (let k = 0; k < count; k++) {
        const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        worker.postMessage({ type: 'init', input, params, seed });
        workers.push(worker);
      }
    } catch (error) {
      for (const w of workers) w.terminate();
      return null;
    }
    return workers;
  }

  // Deler forsøgene ud, til de er brugt, tiden er gået, eller læreren stopper.
  async function runPool(workers) {
    const busy = new Map(); // worker → forsøgets nummer
    let failed = false;
    let wake = null;
    const signal = () => {
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };
    const give = (worker) => {
      if (!mayStartAnother()) return false;
      const i = started_++;
      busy.set(worker, i);
      worker.postMessage({ type: 'attempt', index: i });
      return true;
    };
    for (const worker of workers) {
      worker.onmessage = (event) => {
        const msg = event.data || {};
        if (msg.type === 'progress') {
          if (!top) snapshot = { groups: msg.groups, evaluation: evaluateGroups(msg.groups) };
        } else if (msg.type === 'done') {
          busy.delete(worker);
          record(msg.index, msg.groups, msg.deal, msg.log);
          give(worker);
        } else if (msg.type === 'error') {
          failed = true;
        }
        signal();
      };
      worker.onerror = () => {
        failed = true;
        signal();
      };
      give(worker);
    }
    while (busy.size && !failed) {
      await Promise.race([new Promise((resolve) => (wake = resolve)), pause(LOOK_UP_MS)]);
      progress(false);
      if (cancelled()) {
        stopped = true;
        break;
      }
    }
    for (const worker of workers) worker.terminate();
    if (failed) {
      // De forsøg, der ikke blev færdige, køres om på én kerne.
      started_ = 0;
      return 'failed';
    }
    return 'ok';
  }
}

// Kontraktens version, i alle svar og al fremgang (engine.js bruger den også).
export const CONTRACT_VERSION = 3;

// maxAttempts er null uden frø (så er der intet "højst").
export function progressMessage(task, best, attempts, maxAttempts, seconds, bounds) {
  const results = best.evaluation.results;
  const notMet = [];
  let met = 0;
  let measured = 0; // regler med met = null ("ikke målt") tæller ikke med
  for (const rule of task.rules) {
    const m = results[rule.index].met;
    if (m === null || m === undefined) continue;
    measured++;
    if (m === false) notMet.push(rule.index);
    else met++;
  }
  let heavy = best.evaluation.avoid.value;
  for (const rule of task.rules) {
    if (rule.type === 'strict_separate' || rule.type === 'separate' || rule.type === 'cluster') heavy += results[rule.index].value;
  }
  return {
    contractVersion: CONTRACT_VERSION,
    progress: {
      seconds: Math.round(seconds * 10) / 10,
      attempt: attempts,
      rulesMet: met,
      rulesTotal: measured,
      rulesNotMet: notMet,
      atBestPossible: atBestPossible(task, best.evaluation, bounds),
      heavyBroken: heavy,
      best: best.groups.map((members) => members.map((s) => task.ids[s])),
      text: !attempts ? 'Første forsøg er i gang' : maxAttempts ? `Forsøg ${attempts} af højst ${maxAttempts}` : `Forsøg ${attempts}`,
    },
  };
}
