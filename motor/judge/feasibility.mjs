// Kan Skal sammen-blokkene lade sig gøre? (Specifikation 5.1 og 9.2.)
//
// Dommeren bruger det til at afgøre, om et svar med status "impossible" havde
// ret til at stoppe, og om et svar med status "ok" burde have stoppet.

export const PACKING_LIMIT = 200000;

// Giver en liste af grunde til at stoppe: [{ code, students, text }].
// code er kontraktens kode (together-too-big osv.).
export function stopReasons(task, layout) {
  const reasons = [];
  const present = new Set(task.ids);

  if (task.view === 'matrix' && task.size.mode === 'full' && task.matrix) {
    for (const source of task.matrix.sources.values()) {
      if (source.ids.length === 0) {
        reasons.push({ code: 'matrix-empty-source', students: [], text: `Kilden "${source.label}" har ingen elever.` });
      }
    }
    if (task.matrix.sources.size === 0) {
      reasons.push({ code: 'matrix-empty-source', students: [], text: 'Der er ingen kilder.' });
    }
  }

  if (task.view === 'matrix') return { reasons, packing: 'ok' };

  const capacityByPool = new Map();
  for (const pool of layout.pools) capacityByPool.set(pool.key, pool.sizes);

  const blocksByPool = new Map();
  const separateBlocks = new Map();
  for (const block of task.together) {
    const free = block.filter((id) => present.has(id));
    const locked = block.filter((id) => task.lockedIds.has(id));
    if (locked.length && free.length) {
      reasons.push({ code: 'together-across-lock', students: block, text: 'En blok går på tværs af en låst gruppe.' });
      continue;
    }
    if (free.length < 2) continue;
    const poolKeys = new Set(free.map((id) => task.poolKeyOf.get(id)));
    if (poolKeys.size > 1) {
      reasons.push({ code: 'together-across-pool', students: free, text: 'En blok går på tværs af Opdel-puljer.' });
      continue;
    }
    for (const list of task.avoid) {
      const inside = list.filter((id) => free.includes(id));
      if (inside.length >= 2) {
        reasons.push({ code: 'together-vs-avoid', students: free, text: 'Elever i en blok skal også undgå hinanden.' });
        break;
      }
    }
    for (const rule of task.rules) {
      if (rule.type !== 'separate' && rule.type !== 'strict_separate') continue;
      const marked = free.filter((id) => rule.values.has(rule.textOf.get(id)));
      if (marked.length < 2) continue;
      if (rule.type === 'separate') {
        // Almindelig Adskil: afgøres samlet for puljen nedenfor (spørgsmål 51).
        const key = JSON.stringify([rule.index, [...poolKeys][0]]);
        if (!separateBlocks.has(key)) separateBlocks.set(key, { rule, poolKey: [...poolKeys][0], blocks: [] });
        separateBlocks.get(key).blocks.push({ free, marked: marked.length });
        continue;
      }
      reasons.push({
        code: 'together-vs-separate',
        rule: rule.index,
        students: free,
        text: `En ${rule.name}-regel står imod en blok.`,
      });
    }
    const poolKey = [...poolKeys][0];
    const sizes = capacityByPool.get(poolKey) || [];
    const biggest = sizes.length ? Math.max(...sizes) : 0;
    if (free.length > biggest) {
      reasons.push({
        code: 'together-too-big',
        students: free,
        text: `Skal sammen samler ${free.length} elever, men den største gruppe har ${biggest} pladser.`,
      });
      continue;
    }
    if (!blocksByPool.has(poolKey)) blocksByPool.set(poolKey, []);
    blocksByPool.get(poolKey).push(free);
  }

  // Almindelig Adskil i en blok: kun en grund til at stoppe, når blokkene
  // beviseligt giver flere par, end puljen ellers var nødt til.
  for (const { rule, poolKey, blocks } of separateBlocks.values()) {
    const sizes = capacityByPool.get(poolKey) || [];
    const ids = task.pools.get(poolKey)?.ids || [];
    const m = ids.filter((id) => rule.values.has(rule.textOf.get(id))).length;
    if (blocksCostPairs(m, sizes, blocks.map((b) => b.marked))) {
      for (const b of blocks) {
        reasons.push({ code: 'together-vs-separate', rule: rule.index, students: b.free, text: `En ${rule.name}-regel står imod en blok.` });
      }
    }
  }

  // Kan blokkene pakkes ind i gruppernes pladser? (Enkelte elever kan altid
  // fylde ud bagefter.) Prøves systematisk, med et loft.
  let packing = 'ok';
  for (const [poolKey, blocks] of blocksByPool) {
    const result = canPack(
      blocks.map((b) => b.length),
      capacityByPool.get(poolKey) || [],
    );
    if (result === false) {
      reasons.push({ code: 'together-cannot-pack', students: blocks.flat(), text: 'Blokkene kan ikke pakkes ind i grupperne.' });
      packing = 'impossible';
    } else if (result === null && packing === 'ok') {
      packing = 'unknown';
    }
  }
  return { reasons, packing };
}

// Kan blokke af disse størrelser lægges i grupper med disse pladser?
// true / false, eller null hvis loftet blev nået uden svar.
export function canPack(blockSizes, capacities) {
  const blocks = blockSizes.slice().sort((a, b) => b - a);
  const free = capacities.slice();
  let steps = 0;
  function place(i) {
    if (i === blocks.length) return true;
    if (++steps > PACKING_LIMIT) return null;
    const tried = new Set();
    for (let g = 0; g < free.length; g++) {
      if (free[g] < blocks[i] || tried.has(free[g])) continue;
      tried.add(free[g]); // to grupper med samme plads tilbage er lige gode
      free[g] -= blocks[i];
      const result = place(i + 1);
      free[g] += blocks[i];
      if (result !== false) return result;
    }
    return false;
  }
  return place(0);
}

// m markerede elever i grupper med pladserne sizes; blokke med så mange
// markerede hver. Uden blokke regnes det bedste antal par præcist (læg hele
// tiden i den mindst fyldte gruppe med plads). Med blokke regnes en nedre
// grænse (hver blok i sin egen gruppe, resten spredt uden at se på plads).
// true = blokkene koster beviseligt mindst ét par.
export function blocksCostPairs(m, sizes, blockMarked) {
  const k = sizes.length;
  if (!k) return false;
  const pairCount = (c) => (c > 1 ? (c * (c - 1)) / 2 : 0);
  const spread = (start, caps, extra) => {
    const c = start.slice();
    for (let i = 0; i < extra; i++) {
      let at = -1;
      for (let g = 0; g < k; g++) if ((!caps || c[g] < caps[g]) && (at < 0 || c[g] < c[at])) at = g;
      if (at < 0) return null;
      c[at]++;
    }
    return c.reduce((sum, x) => sum + pairCount(x), 0);
  };
  const without = spread(new Array(k).fill(0), sizes, m);
  if (without === null) return false;
  const big = blockMarked.slice().sort((a, b) => b - a).slice(0, k);
  const start = new Array(k).fill(0).map((_, g) => big[g] || 0);
  const used = big.reduce((a, b) => a + b, 0);
  return spread(start, null, m - used) > without;
}
