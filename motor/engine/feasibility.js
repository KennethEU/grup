// Kan dannelsen overhovedet lade sig gøre? (Specifikation 5.1 og 9.2.)
//
// Hver Skal sammen-blok tjekkes, før motoren går i gang. Kan en blok ikke
// opfyldes, dannes ingen grupper, og læreren får én besked pr. blok (alle på
// én gang, spec. 5.2). Matrix "Fuld" stopper, hvis en kilde er tom.
//
// Adskil (den almindelige) inde i en blok stopper kun, når blokkene beviseligt
// gør Adskil dårligere, end den ellers kunne blive (spørgsmål 51). Ellers er
// parret i blokken bare et af de par, klassen alligevel ikke kan undgå.

export const PACKING_LIMIT = 200000;

// Giver { reasons, blocks, packing }:
//   reasons: fund med kontraktens koder (together-too-big osv.),
//   blocks:  de blokke, motoren skal flytte samlet, som elevnumre,
//   packing: 'ok', 'impossible' eller 'unknown' (loftet blev nået),
//   separatePairs: blokke med flere fra en Adskil-regel, som IKKE stopper
//     dannelsen: [{ rule, pool, students }] (de markerede elever i blokken).
export function checkFeasibility(task, layout) {
  const reasons = [];
  const blocks = [];
  const separatePairs = [];
  // Adskil-blokke afgøres samlet pr. regel og pulje, når alle blokke er set.
  const separateCandidates = new Map(); // "regel|pulje" → [{ free, marked }]

  if (task.view === 'matrix') {
    if (task.size.mode === 'full' && task.matrix) {
      for (const source of task.matrix.sources) {
        if (source.members.length === 0) reasons.push({ code: 'matrix-empty-source', source: source.label, students: [] });
      }
      if (task.matrix.sources.length === 0) reasons.push({ code: 'matrix-empty-source', source: null, students: [] });
    }
    return { reasons, blocks, packing: 'ok', separatePairs };
  }

  const capacityByPool = layout.pools.map((pool) => pool.sizes);
  const blocksByPool = new Map();
  for (const list of mergeLists(task.together)) {
    const free = list.filter((id) => task.indexOf.has(id));
    const locked = list.filter((id) => task.lockedIds.has(id));
    if (locked.length && free.length) {
      reasons.push({ code: 'together-across-lock', students: list });
      continue;
    }
    if (free.length < 2) continue;
    const members = free.map((id) => task.indexOf.get(id));
    const poolSet = new Set(members.map((i) => task.poolOf[i]));
    if (poolSet.size > 1) {
      reasons.push({ code: 'together-across-pool', students: free, pools: [...poolSet] });
      continue;
    }
    for (const avoidList of task.avoidIds) {
      const inside = avoidList.filter((id) => free.includes(id));
      if (inside.length >= 2) {
        reasons.push({ code: 'together-vs-avoid', students: free, conflict: inside });
        break;
      }
    }
    const pool = members.length ? task.poolOf[members[0]] : 0;
    for (const rule of task.rules) {
      if (rule.type !== 'separate' && rule.type !== 'strict_separate') continue;
      const marked = members.filter((i) => rule.marked[i]);
      if (marked.length < 2) continue;
      // Adskil altid i en blok stopper altid.
      if (rule.type === 'strict_separate') {
        reasons.push({ code: 'together-vs-separate', rule: rule.index, students: free });
        continue;
      }
      const key = `${rule.index}|${pool}`;
      if (!separateCandidates.has(key)) separateCandidates.set(key, []);
      separateCandidates.get(key).push({ free, marked });
    }
    const sizes = capacityByPool[pool] || [];
    const biggest = sizes.length ? Math.max(...sizes) : 0;
    if (members.length > biggest) {
      reasons.push({ code: 'together-too-big', students: free, count: members.length, biggest });
      continue;
    }
    blocks.push(members);
    if (!blocksByPool.has(pool)) blocksByPool.set(pool, []);
    blocksByPool.get(pool).push(members);
  }

  // Adskil: stop kun, hvis blokkene beviseligt gør reglen dårligere.
  for (const [key, candidates] of separateCandidates) {
    const [r, p] = key.split('|').map(Number);
    const rule = task.rules[r];
    if (separateBlocksHurt(task, rule, p, layout.pools[p].sizes, candidates.map((c) => c.marked.length))) {
      for (const c of candidates) reasons.push({ code: 'together-vs-separate', rule: r, students: c.free });
    } else {
      for (const c of candidates) separatePairs.push({ rule: r, pool: p, students: c.marked });
    }
  }

  // Kan blokkene pakkes ind i gruppernes pladser? Enkelte elever kan altid
  // fylde ud bagefter. Prøves systematisk med tilbagegang og et loft
  // (spec. 5.1, tjek 2): ved loftet stoppes der ikke.
  let packing = 'ok';
  for (const [pool, poolBlocks] of blocksByPool) {
    const result = canPack(
      poolBlocks.map((b) => b.length),
      capacityByPool[pool] || [],
    );
    if (result === false) {
      reasons.push({
        code: 'together-cannot-pack',
        students: poolBlocks.flat().map((i) => task.ids[i]),
        pool,
      });
      packing = 'impossible';
    } else if (result === null && packing === 'ok') {
      packing = 'unknown';
    }
  }
  return { reasons, blocks, packing, separatePairs };
}

// Gør blokkene Adskil dårligere i puljen? Sammenligner to tal i par:
//   uden blokke: det bedst mulige præcist — de markerede lægges én ad gangen
//     i den gruppe med færrest markerede, der stadig har plads (sizes),
//   med blokke: en nedre grænse — hver blok (op til én pr. gruppe) står i sin
//     egen gruppe, og resten lægges som før, men uden at se på pladsen.
// Er den nedre grænse med blokke større end det bedste uden, er det bevist,
// at blokkene koster et par. Ellers stopper dannelsen ikke.
// Eksempel (Kenneths klasse): 9 ordstyrere i 7 grupper giver mindst 2 par;
// med to af dem i en blok også 2 (blokken er det ene par). 7 i 7 grupper
// giver 0 par; med to i en blok 1, så dér stopper den.
export function separateBlocksHurt(task, rule, p, sizes, blockMarked) {
  let m = 0;
  for (const s of task.pools[p].members) m += rule.marked[s];
  const k = sizes.length;
  if (k === 0) return false;
  // Uden blokke.
  const counts = new Array(k).fill(0);
  for (let i = 0; i < m; i++) {
    let best = -1;
    for (let g = 0; g < k; g++) {
      if (counts[g] >= sizes[g]) continue;
      if (best === -1 || counts[g] < counts[best]) best = g;
    }
    if (best === -1) return false; // (kan ikke ske: puljen har plads til alle)
    counts[best]++;
  }
  const without = counts.reduce((sum, c) => sum + pairsOf(c), 0);
  // Med blokke (de største blokke får hver sin gruppe; resten er løse).
  const heights = blockMarked.slice().sort((a, b) => b - a).slice(0, k);
  const filled = new Array(k).fill(0);
  heights.forEach((h, g) => (filled[g] = h));
  let loose = m - heights.reduce((a, b) => a + b, 0);
  while (loose > 0) {
    let low = 0;
    for (let g = 1; g < k; g++) if (filled[g] < filled[low]) low = g;
    filled[low]++;
    loose--;
  }
  const withBlocks = filled.reduce((sum, c) => sum + pairsOf(c), 0);
  return withBlocks > without;
}

function pairsOf(n) {
  return n > 1 ? (n * (n - 1)) / 2 : 0;
}

// Aftaler, der deler en elev, lægges sammen til én blok (spec. 3.4). Appen
// sender dem allerede samlet; her er det kun en sikkerhed.
function mergeLists(lists) {
  const result = [];
  for (const list of lists) {
    const set = new Set(list);
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].some((id) => set.has(id))) {
        for (const id of result[i]) set.add(id);
        result.splice(i, 1);
      }
    }
    result.push([...set]);
  }
  return result;
}

// Kan blokke af disse størrelser lægges i grupper med disse pladser?
// true / false, eller null hvis loftet blev nået uden svar.
export function canPack(blockSizes, capacities) {
  const result = packBlocks(blockSizes, capacities);
  return result === false || result === null ? result : true;
}

// Som canPack, men giver selve pakningen: for hver blok (i den givne
// rækkefølge) nummeret på gruppen. false = umuligt, null = loftet nået.
export function packBlocks(blockSizes, capacities, limit = PACKING_LIMIT) {
  const order = blockSizes.map((size, i) => i).sort((a, b) => blockSizes[b] - blockSizes[a] || a - b);
  const free = capacities.slice();
  const where = new Array(blockSizes.length).fill(-1);
  let steps = 0;
  function place(k) {
    if (k === order.length) return true;
    if (++steps > limit) return null;
    const size = blockSizes[order[k]];
    const tried = new Set();
    for (let g = 0; g < free.length; g++) {
      if (free[g] < size || tried.has(free[g])) continue;
      tried.add(free[g]); // to grupper med samme plads tilbage er lige gode
      free[g] -= size;
      where[order[k]] = g;
      const result = place(k + 1);
      if (result === true) return true;
      free[g] += size;
      where[order[k]] = -1;
      if (result === null) return null;
    }
    return false;
  }
  const result = place(0);
  if (result === true) return where;
  return result;
}
