// Gruppestørrelser (specifikation afsnit 4 og 9.2).
//
// En lille selvstændig regneregel: hvor mange grupper får hver pulje, og hvor
// store er de? Motoren får bagefter kun en liste af pladser pr. pulje.

// n elever delt så jævnt som muligt på g grupper: [5, 5, 4, 4, 4, 4].
export function splitEven(n, g) {
  if (g <= 0) return [];
  const base = Math.floor(n / g);
  const extra = n % g;
  const sizes = [];
  for (let i = 0; i < g; i++) sizes.push(base + (i < extra ? 1 : 0));
  return sizes;
}

// "Elever pr. gruppe" for én pulje (spec. 4.1).
// (engine.js tjekker størrelsen først; et mål under 1 giver alligevel 0
// grupper her, så løkken aldrig kan køre for evigt.)
export function groupsForTarget(n, target, adjust) {
  if (n <= 0 || !(target >= 1)) return 0;
  let g;
  if (adjust === 'minus') {
    g = Math.ceil(n / target);
  } else {
    g = Math.max(1, Math.floor(n / target));
    // Ville en gruppe komme mere end én over målet, lægges en gruppe til.
    while (g < n && Math.ceil(n / g) > target + 1) g++;
  }
  return Math.min(g, n);
}

// Fordeler et samlet antal grupper mellem puljerne (spec. 4.2): hver pulje
// starter med én, og hver af de resterende gives til den pulje, hvis grupper
// ellers ville blive størst. Ved lighed vinder den største pulje; er de også
// lige store, den, der står først (svar6 37). poolSizes står i klassens
// rækkefølge.
export function allocateGroups(poolSizes, total) {
  const counts = poolSizes.map((n) => (n > 0 ? 1 : 0));
  let remaining = total - counts.reduce((a, b) => a + b, 0);
  while (remaining > 0) {
    let best = -1;
    for (let i = 0; i < poolSizes.length; i++) {
      if (counts[i] >= poolSizes[i]) continue;
      if (best === -1) {
        best = i;
        continue;
      }
      // Sammenlign n/g uden kommatal: n_i · g_best mod n_best · g_i.
      const left = poolSizes[i] * counts[best];
      const right = poolSizes[best] * counts[i];
      if (left > right || (left === right && poolSizes[i] > poolSizes[best])) best = i;
    }
    if (best === -1) break;
    counts[best]++;
    remaining--;
  }
  return counts;
}

// Hvor mange NYE grupper får hver pulje? (spec. 4.1, 4.2 og 4.4)
//
// Ren regneregel uden opgaven: kun tal ind. computeLayout bruger den, og appen
// bruger den SAMME funktion til sit skøn i opskriften og til beskeden om
// emnernes afrunding — så appen aldrig kan love et andet antal grupper, end
// motoren danner (to udregninger gjorde netop det, fundet 12/11 2026).
//   poolSizes:   antal elever i hver pulje, i puljernes rækkefølge
//   lockedCount: antal låste grupper (de tæller med i totalen)
//   size:        { mode: 'count', count } eller { mode: 'perGroup', target, adjust }
//   topicCount:  antal emner (0 i matrix)
// Giver { counts: [grupper pr. pulje], notes: [fund til beskeder] }.
export function planGroupCounts(poolSizes, lockedCount, size, topicCount = 0) {
  const n = poolSizes.reduce((a, b) => a + b, 0);
  const notes = [];
  let counts;
  if (size.mode === 'count') {
    let wanted = size.count - lockedCount;
    if (wanted > n) {
      notes.push({ code: 'fewer-groups-than-asked', asked: wanted, got: n });
      wanted = n;
    }
    if (wanted < poolSizes.length) {
      notes.push({ code: 'fewer-groups-than-pools', asked: wanted, got: poolSizes.length });
    }
    counts = allocateGroups(poolSizes, Math.max(wanted, poolSizes.length));
  } else {
    const target = size.target;
    const adjust = size.adjust === 'minus' ? 'minus' : 'plus';
    counts = poolSizes.map((poolSize) => groupsForTarget(poolSize, target, adjust));
    // Emner kan runde det samlede antal (med de låste) til et multiplum (spec. 4.4).
    if (topicCount > 1) {
      const total = counts.reduce((a, b) => a + b, 0) + lockedCount;
      const rounded =
        adjust === 'plus' ? Math.floor(total / topicCount) * topicCount : Math.ceil(total / topicCount) * topicCount;
      const newCount = rounded - lockedCount;
      if (rounded !== total && newCount >= poolSizes.length && newCount >= 1) {
        const candidate =
          poolSizes.length > 1 ? allocateGroups(poolSizes, newCount) : [Math.min(newCount, poolSizes[0])];
        // Rundingen sker kun, hvis ALLE puljers grupper bagefter holder
        // lærerens størrelse (svar7 40) …
        const allSizes = candidate.flatMap((g, i) => splitEven(poolSizes[i], g));
        const holdsSize =
          adjust === 'plus' ? Math.max(...allSizes) <= target + 1 : Math.min(...allSizes) >= target - 1;
        // … med én undtagelse ved "-1": giver størrelsen færre grupper end
        // emner, får hvert emne alligevel én gruppe (svar7 41).
        const oneGroupPerTopic = adjust === 'minus' && total < topicCount;
        const fits = candidate.reduce((a, b) => a + b, 0) === newCount && (holdsSize || oneGroupPerTopic);
        if (fits) {
          notes.push({
            code: 'topic-rounding',
            from: total,
            to: rounded,
            smaller: !holdsSize,
            smallest: Math.min(...allSizes),
            target,
          });
          counts = candidate;
        }
      }
    }
  }
  return { counts, notes };
}

// Hele opdelingen for opgaven:
//   pools:  [{ index, n, groups, sizes }] i puljernes rækkefølge,
//   groups: [{ pool, size }] — alle de nye grupper, pulje for pulje,
//   total, wholeTask (matrix "Fuld": én stor pulje), notes (fund til beskeder).
export function computeLayout(task) {
  const poolSizes = task.pools.map((pool) => pool.members.length);

  if (task.view === 'matrix' && task.size.mode === 'full') {
    // "Fuld": antal matrixgrupper = antal elever i den mindste kilde (spec. 9.2).
    const sourceSizes = task.matrix ? task.matrix.sources.map((s) => s.members.length) : [];
    const g = sourceSizes.length ? Math.min(...sourceSizes) : 0;
    const sizes = splitEven(task.n, g);
    return finish(task, [{ index: 0, n: task.n, groups: g, sizes }], true, []);
  }

  const topicCount = task.view === 'home' ? task.topics.length : 0;
  const { counts, notes } = planGroupCounts(poolSizes, task.locked.length, task.size, topicCount);
  const pools = task.pools.map((pool, i) => ({
    index: i,
    n: poolSizes[i],
    groups: counts[i],
    sizes: splitEven(poolSizes[i], counts[i]),
  }));
  return finish(task, pools, false, notes);
}

function finish(task, pools, wholeTask, notes) {
  const groups = [];
  for (const pool of pools) for (const size of pool.sizes) groups.push({ pool: pool.index, size });
  return { pools, groups, total: groups.length, wholeTask, notes };
}
