// Afspilningen af dannelsen (specifikation afsnit 12, kontrakt 3.6).
//
// Sporet er det vindende forsøgs uddeling (elev → gruppe, i rækkefølge) og de
// trin, der fulgte: bytninger, der gjorde grupperne bedre ("better"), og
// ryst-bytninger ("worse"). Afviste forsøg er ikke med. Uddelingen plus alle
// trin giver præcis svarets grupper. Bliver sporet for langt, lægges de
// sidste trin sammen til ét spring, så det stadig ender i grupperne.

export const MAX_STEPS = 20000;

export function buildPlayback(task, best, maxSteps = MAX_STEPS) {
  const attempt = best.attempt;
  if (!attempt || !attempt.deal) return null;
  const id = (s) => task.ids[s];
  const deal = attempt.deal.map(([s, g]) => [id(s), g]);
  const steps = [];
  for (const entry of attempt.log) {
    for (const step of entryToSteps(entry, id)) steps.push(step);
  }
  let cut = false;
  let moves = steps;
  if (steps.length > maxSteps) {
    cut = true;
    moves = steps.slice(0, maxSteps - 1);
    // Hvor står eleverne efter de beholdte trin?
    const groupOf = new Map(deal.map(([s, g]) => [s, g]));
    for (const step of moves) applyStep(groupOf, step);
    moves.push(...mergedSteps(groupOf, best.groups.map((m) => m.map(id))));
  }
  return {
    best: 0,
    attempts: [{ deal, moves, groups: best.groups.map((m) => m.map(id)), cut }],
  };
}

function entryToSteps(entry, id) {
  const p = entry.prims; // [elev, fra, til, …]
  const base = { rule: entry.rule ?? null, effect: entry.effect };
  if (entry.kind === 'move') return [{ move: id(p[0]), to: p[2], ...base }];
  if (entry.kind === 'swap') return [{ swap: [id(p[0]), id(p[3])], ...base }];
  // En blok: par af elever, der bytter (blok mod blok eller mod enkelte).
  const out = [];
  const from = [];
  const to = [];
  for (let i = 0; i < p.length; i += 3) (i === 0 || p[i + 1] === p[1] ? from : to).push(p[i]);
  if (from.length === to.length) {
    out.push({ swaps: from.map((s, k) => [id(s), id(to[k])]), ...base });
  } else {
    for (let i = 0; i < p.length; i += 3) out.push({ move: id(p[i]), to: p[i + 2], ...base });
  }
  return out;
}

function applyStep(groupOf, step) {
  if (step.move !== undefined) groupOf.set(step.move, step.to);
  else if (step.swap) swap(groupOf, step.swap[0], step.swap[1]);
  else if (step.swaps) for (const [a, b] of step.swaps) swap(groupOf, a, b);
}

function swap(groupOf, a, b) {
  const ga = groupOf.get(a);
  groupOf.set(a, groupOf.get(b));
  groupOf.set(b, ga);
}

// Fra hvor eleverne står nu til de endelige grupper: så mange bytninger som
// muligt i ét trin, og flytninger for resten.
function mergedSteps(groupOf, finalGroups) {
  const target = new Map();
  finalGroups.forEach((members, g) => members.forEach((s) => target.set(s, g)));
  const current = new Map(groupOf);
  const inGroup = finalGroups.map(() => new Set());
  for (const [s, g] of current) inGroup[g].add(s);
  const pairs = [];
  const moves = [];
  for (const [s] of target) {
    while (current.get(s) !== target.get(s)) {
      const want = target.get(s);
      // Nogen i den gruppe, der ikke hører til der?
      let other = null;
      for (const t of inGroup[want]) {
        if (target.get(t) !== want) {
          other = t;
          break;
        }
      }
      const from = current.get(s);
      if (other !== null) {
        pairs.push([s, other]);
        inGroup[want].delete(other);
        inGroup[from].add(other);
        current.set(other, from);
      } else {
        moves.push({ move: s, to: want, rule: null, effect: 'same' });
      }
      inGroup[from].delete(s);
      inGroup[want].add(s);
      current.set(s, want);
    }
  }
  const out = [];
  if (pairs.length) out.push({ swaps: pairs, rule: null, effect: 'same' });
  out.push(...moves);
  return out;
}
