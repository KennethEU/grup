// Selve motoren: byg grådigt, forbedr så (specifikation afsnit 10).
//
// Ét forsøg:
//   1. Byg: eleverne sorteres efter, hvor svære de er at placere, og hver
//      lægges i den gruppe, hvor den lige nu gør mindst skade (10.1).
//   2. Forbedr: byt to elever (eller en blok mod lige så mange elever), og
//      flyt én elev fra en gruppe, der er én større, når det gør delingen
//      bedre efter rangordenen (10.2).
//   3. Ryst: når intet bytte hjælper, laves nogle få tilfældige bytninger, og
//      der forbedres igen. Blev det ikke bedre, går forsøget tilbage til det
//      bedste (spec. 10.2 og 12).
// Bytninger og flytninger bryder aldrig de faste krav: kun inden for samme
// pulje, blokke flyttes hele, og i matrix "Fuld" holdes kilderne jævne.

import { makeRandom, randomInt, shuffleInPlace } from './random.js';
import { State } from './state.js';
import { buildModules } from './modules.js';
import { packBlocks } from './feasibility.js';

export class Attempt {
  constructor(task, layout, blocks, baselines, seed, options = {}) {
    this.task = task;
    this.layout = layout;
    this.random = makeRandom(seed);
    this.model = buildModules(task, layout, baselines);
    this.state = new State(task, layout, this.model);
    this.G = layout.total;
    this.matrixFull = layout.wholeTask;
    this.options = options;
    // Puljen for hver elev og hver gruppe.
    this.studentPool = this.matrixFull ? new Int32Array(task.n) : task.poolOf;
    this.groupPool = this.model.groupPool;
    this.groupsOfPool = layout.pools.map(() => []);
    layout.groups.forEach((g, i) => this.groupsOfPool[g.pool].push(i));
    // Enhederne: blokke og enkelte elever.
    this.blocks = blocks;
    this.blockOf = new Int32Array(task.n).fill(-1);
    blocks.forEach((block, b) => {
      for (const s of block) this.blockOf[s] = b;
    });
    // Matrix "Fuld": antal fra hver kilde pr. gruppe holdes inden for q…q+1.
    if (this.matrixFull) {
      const sources = task.matrix.sources;
      this.sourceOf = task.matrix.sourceOf;
      this.sourceCount = new Int32Array(Math.max(1, sources.length) * this.G);
      this.sourceLow = sources.map((s) => Math.floor(s.members.length / this.G));
    }
    this.log = [];
    this.deal = [];
  }

  // ---------------------------------------------------------------- byg
  build() {
    if (this.matrixFull) this.buildMatrixFull();
    else this.buildGreedy();
    this.state.recompute();
  }

  // Matrix "Fuld": kilde for kilde, gruppe for gruppe rundt (spec. 9.2), i
  // tilfældig rækkefølge. Søgningen bytter bagefter inden for reglerne.
  buildMatrixFull() {
    const { task, random, G } = this;
    const order = shuffleInPlace(random, Array.from({ length: G }, (_, i) => i));
    let at = randomInt(random, G);
    const sources = shuffleInPlace(random, task.matrix.sources.slice());
    for (const source of sources) {
      for (const s of shuffleInPlace(random, source.members.slice())) this.place(s, order[at++ % G]);
    }
    for (const s of shuffleInPlace(random, task.matrix.outside.slice())) this.place(s, order[at++ % G]);
  }

  place(s, g) {
    this.state.commitMoves([s, g]);
    if (this.matrixFull && this.sourceOf[s] >= 0) this.sourceCount[this.sourceOf[s] * this.G + g]++;
    this.deal.push([s, g]);
  }

  buildGreedy() {
    const { task, state, random } = this;
    const capacity = Int32Array.from(this.layout.groups.map((g) => g.size));

    // 1. Skal sammen-blokke, de største først, med en sikker pakning: en blok
    //    lægges kun, hvor resten af blokkene stadig kan pakkes.
    const blockOrder = this.blocks.map((_, b) => b);
    shuffleInPlace(random, blockOrder);
    blockOrder.sort((a, b) => this.blocks[b].length - this.blocks[a].length);
    const placedBlock = new Uint8Array(this.blocks.length);
    for (const b of blockOrder) {
      const block = this.blocks[b];
      const p = task.poolOf[block[0]];
      const groups = this.groupsOfPool[p];
      const rest = blockOrder.filter((x) => x !== b && !placedBlock[x] && task.poolOf[this.blocks[x][0]] === p);
      let bestG = -1;
      let bestDelta = null;
      let ties = 0;
      for (const g of groups) {
        if (capacity[g] < block.length) continue;
        capacity[g] -= block.length;
        const ok = packBlocks(rest.map((x) => this.blocks[x].length), groups.map((h) => capacity[h]), 20000);
        capacity[g] += block.length;
        if (ok === false) continue;
        const moves = [];
        for (const s of block) moves.push(s, g);
        const delta = state.tryMoves(moves);
        const c = bestDelta === null ? -1 : state.compare(delta, bestDelta);
        if (c < 0 || (c === 0 && randomInt(random, ++ties + 1) === 0)) {
          if (c < 0) ties = 0;
          bestG = g;
          bestDelta = Float64Array.from(delta);
        }
      }
      if (bestG < 0) {
        // Pakningen ramte sit loft før kørslen, og blokkene kunne heller ikke
        // lægges nu: så kommer beskeden bagefter (spec. 5.1).
        const error = new Error('Blokkene kunne ikke pakkes.');
        error.code = 'together-cannot-pack';
        throw error;
      }
      for (const s of block) this.place(s, bestG);
      capacity[bestG] -= block.length;
      placedBlock[b] = 1;
    }

    // 2. De enkelte elever i rækkefølge efter, hvor svære de er.
    for (const s of this.studentOrder()) {
      const groups = this.groupsOfPool[task.poolOf[s]];
      let bestG = -1;
      let bestDelta = null;
      let ties = 0;
      for (const g of groups) {
        if (capacity[g] <= 0) continue;
        const delta = state.tryMoves([s, g]);
        const c = bestDelta === null ? -1 : state.compare(delta, bestDelta);
        if (c < 0 || (c === 0 && randomInt(random, ++ties + 1) === 0)) {
          if (c < 0) ties = 0;
          bestG = g;
          bestDelta = Float64Array.from(delta);
        }
      }
      this.place(s, bestG);
      capacity[bestG]--;
    }
  }

  // Rækkefølgen (spec. 10.1): først elever med Adskil altid, så elever med
  // Undgå-aftaler og værdier fra Adskil og Klyng (Klyng to og to), til sidst
  // resten. Lidt tilfældighed inden for hvert lag.
  studentOrder() {
    const { task, random } = this;
    const strict = task.rules.filter((r) => r.type === 'strict_separate');
    const separate = task.rules.filter((r) => r.type === 'separate');
    const cluster = task.rules.filter((r) => r.type === 'cluster');
    const inAvoid = new Uint8Array(task.n);
    for (const list of task.avoid) for (const s of list) inAvoid[s] = 1;
    const tiers = [[], [], []];
    for (let s = 0; s < task.n; s++) {
      if (this.blockOf[s] >= 0) continue;
      if (strict.some((r) => r.marked[s])) tiers[0].push(s);
      else if (inAvoid[s] || separate.some((r) => r.marked[s]) || cluster.some((r) => r.textId[s] >= 0)) tiers[1].push(s);
      else tiers[2].push(s);
    }
    for (const tier of tiers) shuffleInPlace(random, tier);
    // Klyng to og to: efter en Klyng-elev kommer en anden med samme værdi.
    if (cluster.length) {
      const rule = cluster[0];
      const tier = tiers[1];
      const used = new Uint8Array(task.n);
      const ordered = [];
      for (let i = 0; i < tier.length; i++) {
        const s = tier[i];
        if (used[s]) continue;
        used[s] = 1;
        ordered.push(s);
        const v = rule.textId[s];
        if (v < 0) continue;
        for (let j = i + 1; j < tier.length; j++) {
          const t = tier[j];
          if (!used[t] && rule.textId[t] === v && task.poolOf[t] === task.poolOf[s]) {
            used[t] = 1;
            ordered.push(t);
            break;
          }
        }
      }
      tiers[1] = ordered;
    }
    return [...tiers[0], ...tiers[1], ...tiers[2]];
  }

  // ---------------------------------------------------------- forbedr
  // Matrix "Fuld": må s forlade g og komme i h?
  sourceOk(s, from, to) {
    const src = this.sourceOf[s];
    if (src < 0) return true;
    const G = this.G;
    return this.sourceCount[src * G + from] - 1 >= this.sourceLow[src] && this.sourceCount[src * G + to] + 1 <= this.sourceLow[src] + 1;
  }

  swapOk(a, b, g, h) {
    if (!this.matrixFull) return true;
    const sa = this.sourceOf[a];
    const sb = this.sourceOf[b];
    if (sa === sb) return true;
    return this.sourceOk(a, g, h) && this.sourceOk(b, h, g);
  }

  apply(moves, kind, effect) {
    const state = this.state;
    const prims = [];
    for (let i = 0; i < moves.length; i += 2) prims.push(moves[i], state.groupOf[moves[i]], moves[i + 1]);
    state.commitMoves(moves);
    if (this.matrixFull) {
      for (let i = 0; i < prims.length; i += 3) {
        const src = this.sourceOf[prims[i]];
        if (src < 0) continue;
        this.sourceCount[src * this.G + prims[i + 1]]--;
        this.sourceCount[src * this.G + prims[i + 2]]++;
      }
    }
    this.log.push({ kind, prims, rule: effect === 'better' ? state.lastRule : null, effect });
  }

  // Går tilbage til et tidligere sted i loggen.
  revertTo(length) {
    while (this.log.length > length) {
      const entry = this.log.pop();
      const moves = [];
      for (let i = entry.prims.length - 3; i >= 0; i -= 3) moves.push(entry.prims[i], entry.prims[i + 1]);
      this.state.commitMoves(moves);
      if (this.matrixFull) {
        for (let i = 0; i < entry.prims.length; i += 3) {
          const src = this.sourceOf[entry.prims[i]];
          if (src < 0) continue;
          this.sourceCount[src * this.G + entry.prims[i + 2]]--;
          this.sourceCount[src * this.G + entry.prims[i + 1]]++;
        }
      }
    }
  }

  // Den bedste forbedring for én enhed (en elev eller en blok), eller null.
  bestMoveFor(s) {
    const { state } = this;
    const g = state.groupOf[s];
    const b = this.blockOf[s];
    const groups = this.groupsOfPool[this.groupPool[g]];
    let best = null;
    let bestDelta = null;
    const consider = (moves) => {
      const delta = state.tryMoves(moves);
      if (state.sign(delta) >= 0) return;
      if (bestDelta === null || state.compare(delta, bestDelta) < 0) {
        best = moves;
        bestDelta = Float64Array.from(delta);
      }
    };
    if (b < 0) {
      for (const h of groups) {
        if (h === g) continue;
        if (state.size[g] === state.size[h] + 1 && (!this.matrixFull || this.sourceOk(s, g, h))) consider([s, h]);
        const list = state.members[h];
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (this.blockOf[t] >= 0) continue;
          if (!this.swapOk(s, t, g, h)) continue;
          consider([s, h, t, g]);
        }
      }
      return best;
    }
    // En blok: mod en lige så stor blok, eller mod lige så mange enkelte
    // elever (de bedste vælges én ad gangen), eller flyttes hel, når
    // gruppen er så meget større.
    const block = this.blocks[b];
    const k = block.length;
    for (const h of groups) {
      if (h === g) continue;
      const toH = [];
      for (const x of block) toH.push(x, h);
      if (state.size[g] - state.size[h] === k) consider(toH.slice());
      const seenBlocks = new Set();
      const singles = [];
      for (const t of state.members[h]) {
        const tb = this.blockOf[t];
        if (tb < 0) singles.push(t);
        else if (tb !== b && !seenBlocks.has(tb) && this.blocks[tb].length === k) {
          seenBlocks.add(tb);
          const moves = toH.slice();
          for (const y of this.blocks[tb]) moves.push(y, g);
          consider(moves);
        }
      }
      if (singles.length >= k) {
        // Vælg de k enkelte, der helst vil til g, én ad gangen.
        const moves = toH.slice();
        const chosen = new Set();
        for (let step = 0; step < k; step++) {
          let pick = -1;
          let pickDelta = null;
          for (const t of singles) {
            if (chosen.has(t)) continue;
            moves.push(t, g);
            const delta = state.tryMoves(moves);
            moves.length -= 2;
            if (pickDelta === null || state.compare(delta, pickDelta) < 0) {
              pick = t;
              pickDelta = Float64Array.from(delta);
            }
          }
          chosen.add(pick);
          moves.push(pick, g);
        }
        consider(moves);
      }
    }
    return best;
  }

  // Forbedr, til intet bytte hjælper. active: elever, der skal kigges på.
  localSearch(active) {
    const { state, random } = this;
    const queue = [];
    const inQueue = new Uint8Array(this.task.n);
    const enqueue = (s) => {
      const b = this.blockOf[s];
      const lead = b >= 0 ? this.blocks[b][0] : s; // en blok kigges på én gang
      if (!inQueue[lead]) {
        inQueue[lead] = 1;
        queue.push(lead);
      }
    };
    for (const s of shuffleInPlace(random, active.slice())) enqueue(s);
    let head = 0;
    while (head < queue.length) {
      if (this.budgetSpent()) break;
      const s = queue[head++];
      inQueue[s] = 0;
      const moves = this.bestMoveFor(s);
      if (!moves) continue;
      const g = state.groupOf[s];
      const touched = new Set([g]);
      for (let i = 1; i < moves.length; i += 2) touched.add(moves[i]);
      this.apply(moves, kindOf(moves, this.blockOf), 'better');
      for (const t of touched) for (const x of state.members[t]) enqueue(x);
      if (head > 4096 && head * 2 > queue.length) {
        queue.splice(0, head);
        head = 0;
      }
    }
  }

  // Ryst: nogle få tilfældige bytninger inden for samme pulje (spec. 10.2).
  shake(count) {
    const { state, random, task } = this;
    const touched = [];
    let tries = 0;
    let done = 0;
    while (done < count && tries < count * 20) {
      tries++;
      const s = randomInt(random, task.n);
      const g = state.groupOf[s];
      const groups = this.groupsOfPool[this.groupPool[g]];
      if (groups.length < 2) continue;
      const h = groups[randomInt(random, groups.length)];
      if (h === g) continue;
      const list = state.members[h];
      const t = list[randomInt(random, list.length)];
      const bs = this.blockOf[s];
      const bt = this.blockOf[t];
      let moves;
      if (bs < 0 && bt < 0) {
        if (!this.swapOk(s, t, g, h)) continue;
        moves = [s, h, t, g];
      } else if (bs >= 0 && bt >= 0 && bs !== bt && this.blocks[bs].length === this.blocks[bt].length) {
        moves = [];
        for (const x of this.blocks[bs]) moves.push(x, h);
        for (const y of this.blocks[bt]) moves.push(y, g);
      } else continue;
      this.apply(moves, kindOf(moves, this.blockOf), 'worse');
      touched.push(g, h);
      done++;
    }
    const active = [];
    for (const g of new Set(touched)) for (const x of state.members[g]) active.push(x);
    return active;
  }

  budgetSpent() {
    return this.state.evaluations >= this.evaluationLimit;
  }

  // Hele forsøget. shakes: højst så mange ryst-runder; evaluationLimit: højst
  // så mange afprøvede bytninger (et loft, der ikke afhænger af tiden).
  // tick() kaldes mellem ryst-runderne (fremgang og Stop) og giver true, når
  // læreren har trykket Stop.
  async run({ shakes, evaluationLimit, stale, isBest, tick }) {
    this.evaluationLimit = evaluationLimit;
    this.build();
    this.localSearch(Array.from({ length: this.task.n }, (_, i) => i));
    let best = Float64Array.from(this.state.totals);
    let bestLength = this.log.length;
    let sinceBetter = 0;
    let cancelled = false;
    let checkBest = true;
    for (let k = 0; k < shakes && sinceBetter < stale; k++) {
      if (this.budgetSpent()) break;
      if (checkBest && isBest && isBest(this)) break;
      checkBest = false;
      if (tick && (await tick())) {
        cancelled = true;
        break;
      }
      const size = 2 + randomInt(this.random, Math.min(4, Math.max(1, Math.floor(this.task.n / 8))));
      const active = this.shake(size);
      this.localSearch(active);
      const c = this.state.compare(this.state.totals, best);
      if (c < 0) {
        best = Float64Array.from(this.state.totals);
        bestLength = this.log.length;
        sinceBetter = 0;
        checkBest = true;
      } else if (c === 0) {
        // Lige så god: bliv her (det hjælper søgningen videre), men husk det.
        bestLength = this.log.length;
        sinceBetter++;
      } else {
        this.revertTo(bestLength);
        sinceBetter++;
      }
    }
    if (this.state.compare(this.state.totals, best) > 0) this.revertTo(bestLength);
    this.state.recompute();
    return { groups: this.state.groupsAsLists(), cancelled };
  }
}

function kindOf(moves, blockOf) {
  if (moves.length === 2) return 'move';
  if (moves.length === 4 && blockOf[moves[0]] < 0 && blockOf[moves[2]] < 0) return 'swap';
  return 'swaps';
}
