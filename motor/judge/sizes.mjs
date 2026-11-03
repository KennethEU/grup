// Gruppestørrelser (specifikation afsnit 4 og 9.2).
//
// Regnereglen siger, hvor mange grupper hver pulje skal have, og hvor store de
// er. Dommeren bruger den til den faste kontrol af størrelserne og til at lave
// tilfældige gruppedelinger i samme størrelser.

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
export function groupsForTarget(n, target, adjust) {
  if (n <= 0) return 0;
  let g;
  if (adjust === 'minus') {
    g = Math.ceil(n / target);
  } else {
    g = Math.max(1, Math.floor(n / target));
    // Ville en gruppe komme mere end én over målet, lægges en gruppe til.
    while (Math.ceil(n / g) > target + 1) g++;
  }
  return Math.min(g, n);
}

// Fordeler et samlet antal grupper mellem puljerne, så gruppestørrelserne
// bliver så ens som muligt (spec. 4.2). Hver pulje får mindst én.
// Næste gruppe går altid til puljen med de største grupper lige nu. Ved
// lighed vinder den største pulje; er de også lige store, den pulje, hvis
// værdi optræder først blandt eleverne (svar6 37). poolSizes skal stå i den
// rækkefølge.
export function allocateGroups(poolSizes, total) {
  const counts = poolSizes.map((n) => (n > 0 ? 1 : 0));
  let remaining = total - counts.reduce((a, b) => a + b, 0);
  while (remaining > 0) {
    let best = -1;
    for (let i = 0; i < poolSizes.length; i++) {
      if (counts[i] >= poolSizes[i]) continue;
      // Sammenlign n/g uden kommatal: n_i * g_best mod n_best * g_i.
      if (best === -1) {
        best = i;
        continue;
      }
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

// Er en fordeling af grupper på puljer "så ens som muligt"? Den grådige
// fordeling ovenfor er ét svar; ved lighed er der flere lige gode. En fordeling
// er god, når ingen pulje burde have givet en gruppe videre til en anden:
// for alle A og B (B med mindst 2 grupper, A ikke fuld): n_A/g_A ≤ n_B/(g_B − 1).
export function isBalancedAllocation(poolSizes, counts) {
  for (let a = 0; a < poolSizes.length; a++) {
    if (counts[a] < 1 && poolSizes[a] > 0) return false;
    if (counts[a] > poolSizes[a]) return false;
    for (let b = 0; b < poolSizes.length; b++) {
      if (a === b || counts[b] < 2 || counts[a] >= poolSizes[a]) continue;
      if (poolSizes[a] * (counts[b] - 1) > poolSizes[b] * counts[a]) return false;
    }
  }
  return true;
}

// Den forventede opdeling for hele opgaven:
// { pools: [{ key, n, groups, sizes }], total, flexible, notes }.
// flexible = true betyder, at grupperne er fordelt mellem puljerne efter
// "så ens som muligt", så andre lige gode fordelinger også er rigtige.
export function expectedLayout(task) {
  const poolList = [...task.pools.values()];
  const poolSizes = poolList.map((pool) => pool.ids.length);
  const lockedCount = task.locked.length;
  const size = task.size;
  const notes = [];
  let counts;
  let flexible = false;

  if (task.view === 'matrix' && size.mode === 'full') {
    // "Fuld": antal matrixgrupper = antal elever i den mindste kilde (spec. 9.2).
    const sourceSizes = task.matrix ? [...task.matrix.sources.values()].map((s) => s.ids.length) : [];
    const g = sourceSizes.length ? Math.min(...sourceSizes) : 0;
    const n = task.ids.length;
    return {
      pools: [{ key: null, n, groups: g, sizes: splitEven(n, g) }],
      total: g,
      flexible: false,
      wholeTask: true,
      notes: g === 0 ? ['En kilde har ingen elever.'] : [],
    };
  }

  if (size.mode === 'count') {
    let wanted = size.count - lockedCount;
    const totalStudents = poolSizes.reduce((a, b) => a + b, 0);
    if (wanted > totalStudents) {
      wanted = totalStudents;
      notes.push('Flere grupper end elever: antallet er sat ned.');
    }
    if (wanted < poolList.length) notes.push('Færre grupper end puljer: hver pulje får én.');
    counts = allocateGroups(poolSizes, Math.max(wanted, poolList.length));
    flexible = poolList.length > 1;
  } else {
    const target = size.target;
    const adjust = size.adjust === 'minus' ? 'minus' : 'plus';
    counts = poolSizes.map((n) => groupsForTarget(n, target, adjust));
    // Emner kan runde det samlede antal (med de låste) til et multiplum (spec. 4.4).
    const topicCount = task.view === 'home' ? task.topics.length : 0;
    if (topicCount > 1) {
      const total = counts.reduce((a, b) => a + b, 0) + lockedCount;
      const rounded =
        adjust === 'plus'
          ? Math.floor(total / topicCount) * topicCount
          : Math.ceil(total / topicCount) * topicCount;
      const newCount = rounded - lockedCount;
      if (rounded !== total && newCount >= poolList.length && newCount >= 1) {
        const candidate =
          poolList.length > 1 ? allocateGroups(poolSizes, newCount) : [Math.min(newCount, poolSizes[0])];
        // Rundingen sker kun, hvis ALLE puljers grupper bagefter holder
        // lærerens størrelse (svar7 40) ...
        const allSizes = candidate.flatMap((g, i) => splitEven(poolSizes[i], g));
        const holdsSize =
          adjust === 'plus' ? Math.max(...allSizes) <= target + 1 : Math.min(...allSizes) >= target - 1;
        // ... med én undtagelse ved "-1": giver størrelsen færre grupper end
        // emner, får hvert emne alligevel én gruppe (svar7 41).
        const oneGroupPerTopic = adjust === 'minus' && total < topicCount;
        const fits = candidate.reduce((a, b) => a + b, 0) === newCount && (holdsSize || oneGroupPerTopic);
        if (fits) {
          counts = candidate;
          flexible = poolList.length > 1;
          notes.push(
            holdsSize
              ? `Antallet er rundet efter emnerne til ${rounded} i alt.`
              : `Færre grupper end emner: hvert emne får én gruppe (${rounded} i alt), selvom grupperne bliver mindre.`,
          );
        }
      }
    }
  }

  const pools = poolList.map((pool, i) => ({
    key: pool.key,
    n: poolSizes[i],
    groups: counts[i],
    sizes: splitEven(poolSizes[i], counts[i]),
  }));
  return {
    pools,
    total: counts.reduce((a, b) => a + b, 0),
    flexible,
    wholeTask: false,
    notes,
  };
}
