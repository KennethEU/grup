// Regelmodulernes små tællere (spec. 10.2): ændringen ved et bytte regnes ud
// fra tællere pr. gruppe (antal piger, sum af karakterer …), ikke ved at måle
// hele klassen igen.
//
// Hvert modul har:
//   add(s, g) / remove(s, g) – en elev kommer ind i / går ud af gruppe g,
//   value(g)                 – gruppens bidrag til modulets trin lige nu,
//   level, weight            – hvilket trin i rangordenen, og vægten (målene
//                              er allerede delt med det tilfældige, spec. 7.3).
// Summen af value(g) · weight over grupperne er trinnets tal. For de tunge
// regler er det præcis dommerens tal; for målene er det samme tal på nær en
// fast størrelse (som ikke ændrer sig ved bytning). Saml med tal og grupper
// uden tal er den eneste undtagelse: der bruges værditællingen uden den
// faste fradrag, og den præcise måling (rules.js) afgør til sidst.
//
// Fordi modulerne kun ser på én gruppe ad gangen, kan de også bedømme "én
// elev i én bestemt gruppe" uden at måle alt forfra (spec. 13): læg eleven
// ind, læs value(g), tag eleven ud igen.

import { pairs, fairDeviation, poolMeans, poolValueCounts, levelPlan, goalWeights, GOAL_TYPES } from './rules.js';

export function buildModules(task, layout, baselines) {
  const G = layout.total;
  const groupPool = Int32Array.from(layout.groups.map((g) => g.pool));
  const plan = levelPlan(task);
  const levelOfRule = new Map();
  let avoidLevel = -1;
  let sourcesLevel = -1;
  let goalsLevel = -1;
  let collectLevel = -1;
  let todayLevel = -1;
  plan.forEach((level, i) => {
    if (level.kind === 'heavy') levelOfRule.set(level.rule, i);
    else if (level.kind === 'avoid') avoidLevel = i;
    else if (level.kind === 'sources') sourcesLevel = i;
    else if (level.kind === 'goals') goalsLevel = i;
    else if (level.kind === 'today') todayLevel = i;
    else collectLevel = i;
  });
  const weights = goalWeights(task);
  const modules = [];
  const size = new Int32Array(G); // deles med state.js

  for (const rule of task.rules) {
    switch (rule.type) {
      case 'strict_separate':
      case 'separate':
        modules.push(separateModule(rule, G, levelOfRule.get(rule.index)));
        break;
      case 'cluster':
        modules.push(clusterModule(rule, G, levelOfRule.get(rule.index)));
        break;
      case 'distribute': {
        const w = scale(weights.get(rule.index), baselines.get(rule.index)?.value);
        if (w > 0) modules.push(distributeModule(task, rule, G, groupPool, size, goalsLevel, w));
        modules.push(todayModule(task, rule, G, groupPool, size, todayLevel));
        break;
      }
      case 'balance': {
        const w = scale(weights.get(rule.index), baselines.get(rule.index)?.value);
        if (w > 0) modules.push(balanceModule(task, rule, G, groupPool, goalsLevel, w));
        break;
      }
      case 'minimizediff': {
        const w = scale(weights.get(rule.index), baselines.get(rule.index)?.value);
        if (w > 0) modules.push(varianceModule(rule, G, goalsLevel, w));
        break;
      }
      case 'group_sort': {
        const base = baselines.get(rule.index);
        const weight = weights.get(rule.index);
        if (rule.mode === 'text') {
          const w = scale(weight, base?.valueCount);
          if (w > 0) modules.push(collectTextModule(rule, G, collectLevel, w));
        } else {
          const wv = scale(weight, base?.variance);
          const wc = scale(weight, base?.valueCount);
          if (wv > 0 || wc > 0) modules.push(collectNumericModule(rule, G, collectLevel, wv, wc));
        }
        break;
      }
      default:
        break;
    }
  }
  if (task.avoid.length) modules.push(avoidModule(task, G, avoidLevel));
  if (sourcesLevel >= 0) modules.push(sourcesModule(task, G, sourcesLevel));
  return { modules, levels: plan, size, groupPool, G };
}

function scale(weight, baseline) {
  return baseline > 0 ? weight / baseline : 0;
}

// Adskil altid / Adskil: antal par af markerede elever i gruppen.
function separateModule(rule, G, level) {
  const count = new Int32Array(G);
  const marked = rule.marked;
  return {
    rule: rule.index,
    level,
    weight: 1,
    marks: marked,
    add(s, g) {
      count[g] += marked[s];
    },
    remove(s, g) {
      count[g] -= marked[s];
    },
    value(g) {
      return pairs(count[g]);
    },
  };
}

// Undgå hinanden: par fra samme aftale i samme gruppe, alle aftaler lagt sammen.
function avoidModule(task, G, level) {
  const listsOf = Array.from({ length: task.n }, () => []);
  task.avoid.forEach((list, L) => {
    for (const s of list) listsOf[s].push(L);
  });
  const count = new Int32Array(task.avoid.length * G);
  const pairSum = new Int32Array(G);
  return {
    rule: null,
    level,
    weight: 1,
    listsOf,
    add(s, g) {
      for (const L of listsOf[s]) {
        pairSum[g] += count[L * G + g];
        count[L * G + g]++;
      }
    },
    remove(s, g) {
      for (const L of listsOf[s]) {
        count[L * G + g]--;
        pairSum[g] -= count[L * G + g];
      }
    },
    value(g) {
      return pairSum[g];
    },
  };
}

// Matrix: par fra samme kilde i samme gruppe.
function sourcesModule(task, G, level) {
  const sourceOf = task.matrix.sourceOf;
  const count = new Int32Array(Math.max(1, task.matrix.sources.length) * G);
  const pairSum = new Int32Array(G);
  return {
    rule: null,
    level,
    weight: 1,
    add(s, g) {
      const src = sourceOf[s];
      if (src < 0) return;
      pairSum[g] += count[src * G + g];
      count[src * G + g]++;
    },
    remove(s, g) {
      const src = sourceOf[s];
      if (src < 0) return;
      count[src * G + g]--;
      pairSum[g] -= count[src * G + g];
    },
    value(g) {
      return pairSum[g];
    },
  };
}

// Klyng: antal elever, der står alene med deres værdi.
function clusterModule(rule, G, level) {
  const V = Math.max(1, rule.valueKeys.length);
  const count = new Int32Array(V * G);
  const alone = new Int32Array(G);
  const textId = rule.textId;
  return {
    rule: rule.index,
    level,
    weight: 1,
    textId,
    count,
    V,
    add(s, g) {
      const v = textId[s];
      if (v < 0) return;
      const c = count[v * G + g];
      if (c === 0) alone[g]++;
      else if (c === 1) alone[g]--;
      count[v * G + g] = c + 1;
    },
    remove(s, g) {
      const v = textId[s];
      if (v < 0) return;
      const c = count[v * G + g];
      if (c === 1) alone[g]--;
      else if (c === 2) alone[g]++;
      count[v * G + g] = c - 1;
    },
    value(g) {
      return alone[g];
    },
  };
}

// Fordel: afvigelsen fra det retfærdige antal. Når gruppens størrelse er den
// samme som sidst, regnes kun de værdier om, der er rørt; ellers hele gruppen.
function distributeModule(task, rule, G, groupPool, size, level, weight) {
  const V = Math.max(1, rule.valueKeys.length);
  const count = new Int32Array(V * G);
  const textId = rule.textId;
  const poolCounts = poolValueCounts(task, rule);
  const poolValues = poolCounts.map((m) => [...m.entries()]);
  const poolTotal = new Int32Array(V * task.pools.length);
  poolCounts.forEach((m, p) => {
    for (const [v, c] of m) poolTotal[v * task.pools.length + p] = c;
  });
  const P = task.pools.length;
  const poolN = task.pools.map((p) => p.members.length);
  const cachedDev = new Float64Array(G);
  const cachedSize = new Int32Array(G).fill(-1);
  const touched = Array.from({ length: G }, () => []);
  const original = new Int32Array(V * G);
  const isTouched = new Uint8Array(V * G);

  function touch(v, g) {
    const k = v * G + g;
    if (!isTouched[k]) {
      isTouched[k] = 1;
      original[k] = count[k];
      touched[g].push(v);
    }
  }
  function full(g) {
    const p = groupPool[g];
    const N = poolN[p];
    const s = size[g];
    let dev = 0;
    for (const [v, c] of poolValues[p]) dev += fairDeviation(count[v * G + g], c, s, N);
    return dev;
  }

  return {
    rule: rule.index,
    level,
    weight,
    add(s, g) {
      const v = textId[s];
      if (v < 0) return;
      touch(v, g);
      count[v * G + g]++;
    },
    remove(s, g) {
      const v = textId[s];
      if (v < 0) return;
      touch(v, g);
      count[v * G + g]--;
    },
    value(g) {
      const s = size[g];
      if (s !== cachedSize[g]) return full(g);
      const p = groupPool[g];
      const N = poolN[p];
      let dev = cachedDev[g];
      for (const v of touched[g]) {
        const c = poolTotal[v * P + p];
        if (c === 0) continue;
        dev += fairDeviation(count[v * G + g], c, s, N) - fairDeviation(original[v * G + g], c, s, N);
      }
      return dev;
    },
    // Efter et forsøg (tællerne er sat tilbage) eller en bytning (nyt bidrag).
    settle(g, committed, v) {
      for (const val of touched[g]) isTouched[val * G + g] = 0;
      touched[g].length = 0;
      if (committed) {
        cachedDev[g] = v;
        cachedSize[g] = size[g];
      }
    },
  };
}

// Fordels dagens test (som i rules.js): 1 for en gruppe, hvor en værdi står
// flere gange end ⌈størrelse / antal værdier⌉, eller hvor ikke alle værdier
// er med (højst så mange som pladser); ellers 0. Står på det sidste trin i
// rangordenen. Holdes ved lige ved hver add/remove: hvor mange værdier
// gruppen har (distinct), og hvor mange der står flere gange end overMax
// (over). overMax tælles kun forfra, når størrelsen har ændret grænsen.
function todayModule(task, rule, G, groupPool, size, level) {
  const V = Math.max(1, rule.valueKeys.length);
  const count = new Int32Array(V * G);
  const textId = rule.textId;
  const poolValues = poolValueCounts(task, rule).map((m) => [...m.keys()]);
  const distinct = new Int32Array(G);
  const over = new Int32Array(G);
  const overMax = new Int32Array(G).fill(-1);
  return {
    rule: rule.index,
    level,
    weight: 1,
    add(s, g) {
      const v = textId[s];
      if (v < 0) return;
      const c = ++count[v * G + g];
      if (c === 1) distinct[g]++;
      if (c === overMax[g] + 1) over[g]++;
    },
    remove(s, g) {
      const v = textId[s];
      if (v < 0) return;
      const c = --count[v * G + g];
      if (c === 0) distinct[g]--;
      if (c === overMax[g]) over[g]--;
    },
    value(g) {
      const values = poolValues[groupPool[g]];
      const n = values.length;
      if (n === 0) return 0;
      const s = size[g];
      const maxEach = Math.ceil(s / n);
      if (maxEach !== overMax[g]) {
        overMax[g] = maxEach;
        let k = 0;
        for (const v of values) if (count[v * G + g] > maxEach) k++;
        over[g] = k;
      }
      return over[g] > 0 || distinct[g] < Math.min(n, s) ? 1 : 0;
    },
  };
}

// Balancér: |gruppens snit − puljens snit|.
function balanceModule(task, rule, G, groupPool, level, weight) {
  const num = rule.num;
  const cnt = new Int32Array(G);
  const sum = new Float64Array(G);
  const means = poolMeans(task, rule);
  return {
    rule: rule.index,
    level,
    weight,
    add(s, g) {
      const x = num[s];
      if (x !== x) return;
      cnt[g]++;
      sum[g] += x;
    },
    remove(s, g) {
      const x = num[s];
      if (x !== x) return;
      cnt[g]--;
      sum[g] -= x;
      if (cnt[g] === 0) sum[g] = 0;
    },
    value(g) {
      const target = means[groupPool[g]];
      if (cnt[g] === 0 || target === null) return 0;
      return Math.abs(sum[g] / cnt[g] - target);
    },
  };
}

// Ensartede: gruppens varians (delt med antal).
function varianceModule(rule, G, level, weight) {
  const num = rule.num;
  const cnt = new Int32Array(G);
  const sum = new Float64Array(G);
  const sumSq = new Float64Array(G);
  return {
    rule: rule.index,
    level,
    weight,
    add(s, g) {
      const x = num[s];
      if (x !== x) return;
      cnt[g]++;
      sum[g] += x;
      sumSq[g] += x * x;
    },
    remove(s, g) {
      const x = num[s];
      if (x !== x) return;
      cnt[g]--;
      sum[g] -= x;
      sumSq[g] -= x * x;
      if (cnt[g] === 0) sum[g] = sumSq[g] = 0;
    },
    value(g) {
      const c = cnt[g];
      if (c < 2) return 0;
      const m = sum[g] / c;
      const v = sumSq[g] / c - m * m;
      return v > 0 ? v : 0;
    },
  };
}

// Saml på tekst: antal forskellige værdier i gruppen.
function collectTextModule(rule, G, level, weight) {
  const V = Math.max(1, rule.valueKeys.length);
  const count = new Int32Array(V * G);
  const distinct = new Int32Array(G);
  const textId = rule.textId;
  return {
    rule: rule.index,
    level,
    weight,
    add(s, g) {
      const v = textId[s];
      if (v < 0) return;
      if (count[v * G + g]++ === 0) distinct[g]++;
    },
    remove(s, g) {
      const v = textId[s];
      if (v < 0) return;
      if (--count[v * G + g] === 0) distinct[g]--;
    },
    value(g) {
      return distinct[g];
    },
  };
}

// Saml med tal: gruppens varians; en gruppe uden tal tæller sine
// tekstværdier i stedet (de to dele har hver sin skala).
function collectNumericModule(rule, G, level, weightVariance, weightCount) {
  const num = rule.num;
  const textId = rule.textId;
  const V = Math.max(1, rule.valueKeys.length);
  const cnt = new Int32Array(G);
  const sum = new Float64Array(G);
  const sumSq = new Float64Array(G);
  const count = new Int32Array(V * G);
  const distinct = new Int32Array(G);
  return {
    rule: rule.index,
    level,
    weight: 1,
    add(s, g) {
      const x = num[s];
      if (x === x) {
        cnt[g]++;
        sum[g] += x;
        sumSq[g] += x * x;
      } else if (textId[s] >= 0) {
        if (count[textId[s] * G + g]++ === 0) distinct[g]++;
      }
    },
    remove(s, g) {
      const x = num[s];
      if (x === x) {
        cnt[g]--;
        sum[g] -= x;
        sumSq[g] -= x * x;
        if (cnt[g] === 0) sum[g] = sumSq[g] = 0;
      } else if (textId[s] >= 0) {
        if (--count[textId[s] * G + g] === 0) distinct[g]--;
      }
    },
    value(g) {
      const c = cnt[g];
      if (c === 0) return weightCount * distinct[g];
      if (c < 2) return 0;
      const m = sum[g] / c;
      const v = sumSq[g] / c - m * m;
      return weightVariance * (v > 0 ? v : 0);
    },
  };
}

export { GOAL_TYPES };
