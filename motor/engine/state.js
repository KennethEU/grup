// Tilstanden under søgningen: hvem er i hvilken gruppe, og hvad koster det
// på hvert trin i rangordenen.
//
// Alt, der ændrer grupperne, går gennem to funktioner:
//   tryMoves(moves)    – hvad ville det ændre? (gør det, læser, gør det om igen)
//   commitMoves(moves) – gør det.
// moves er en flad liste [elev, tilGruppe, elev, tilGruppe, …]; gruppe −1
// betyder "ud af alle grupper". En bytning er to flytninger.

export class State {
  constructor(task, layout, model) {
    this.task = task;
    this.model = model;
    this.n = task.n;
    this.G = model.G;
    this.modules = model.modules;
    this.levelCount = model.levels.length;
    // De tunge trin er hele tal; målene og Saml er kommatal.
    this.integerLevel = model.levels.map((l) => l.kind !== 'goals' && l.kind !== 'collect');
    this.groupOf = new Int32Array(this.n).fill(-1);
    this.members = Array.from({ length: this.G }, () => []);
    this.pos = new Int32Array(this.n);
    this.size = model.size;
    this.size.fill(0);
    this.contrib = this.modules.map(() => new Float64Array(this.G));
    this.totals = new Float64Array(this.levelCount);
    this.delta = new Float64Array(this.levelCount);
    this.dirty = [];
    this.isDirty = new Uint8Array(this.G);
    this.settlers = this.modules.filter((m) => m.settle);
    this.undo = [];
    this.evaluations = 0; // arbejdstæller (bruges som budget i stedet for tid)
    this.lastRule = null;
  }

  // Flytter én elev uden at regne på det.
  raw(s, to) {
    const from = this.groupOf[s];
    if (from === to) return;
    const mods = this.modules;
    if (from >= 0) {
      for (let i = 0; i < mods.length; i++) mods[i].remove(s, from);
      const list = this.members[from];
      const at = this.pos[s];
      const last = list[list.length - 1];
      list[at] = last;
      this.pos[last] = at;
      list.pop();
      this.size[from]--;
      this.markDirty(from);
    }
    this.groupOf[s] = to;
    if (to >= 0) {
      this.pos[s] = this.members[to].length;
      this.members[to].push(s);
      this.size[to]++;
      for (let i = 0; i < mods.length; i++) mods[i].add(s, to);
      this.markDirty(to);
    }
  }

  markDirty(g) {
    if (!this.isDirty[g]) {
      this.isDirty[g] = 1;
      this.dirty.push(g);
    }
  }

  // Ændringen pr. trin, hvis moves blev gjort. Svaret ligger i this.delta
  // (overskrives ved næste kald).
  tryMoves(moves) {
    this.evaluations++;
    const undo = this.undo;
    undo.length = 0;
    for (let i = 0; i < moves.length; i += 2) {
      undo.push(moves[i], this.groupOf[moves[i]]);
      this.raw(moves[i], moves[i + 1]);
    }
    const delta = this.delta;
    delta.fill(0);
    const mods = this.modules;
    for (const g of this.dirty) {
      for (let m = 0; m < mods.length; m++) {
        const d = mods[m].value(g) - this.contrib[m][g];
        if (d !== 0) delta[mods[m].level] += mods[m].weight * d;
      }
    }
    for (let i = undo.length - 2; i >= 0; i -= 2) this.raw(undo[i], undo[i + 1]);
    for (const g of this.dirty) {
      this.isDirty[g] = 0;
      for (const m of this.settlers) m.settle(g, false, 0);
    }
    this.dirty.length = 0;
    return delta;
  }

  // Gør moves og opdaterer tallene. Giver ændringen pr. trin (en kopi) og
  // sætter lastRule til den regel, der blev mest bedre på det afgørende trin.
  commitMoves(moves) {
    for (let i = 0; i < moves.length; i += 2) this.raw(moves[i], moves[i + 1]);
    const delta = new Float64Array(this.levelCount);
    const mods = this.modules;
    let decisive = -1;
    const perModule = new Float64Array(mods.length);
    for (const g of this.dirty) {
      for (let m = 0; m < mods.length; m++) {
        const v = mods[m].value(g);
        const d = v - this.contrib[m][g];
        if (d !== 0) {
          delta[mods[m].level] += mods[m].weight * d;
          perModule[m] += mods[m].weight * d;
          this.contrib[m][g] = v;
        }
        if (mods[m].settle) mods[m].settle(g, true, v);
      }
      this.isDirty[g] = 0;
    }
    this.dirty.length = 0;
    for (let l = 0; l < this.levelCount; l++) {
      this.totals[l] += delta[l];
      if (decisive === -1 && this.isChange(delta[l])) decisive = l;
    }
    this.lastRule = null;
    if (decisive >= 0) {
      let bestM = -1;
      for (let m = 0; m < mods.length; m++) {
        if (mods[m].level !== decisive) continue;
        if (bestM === -1 || perModule[m] < perModule[bestM]) bestM = m;
      }
      if (bestM >= 0) this.lastRule = mods[bestM].rule;
    }
    return delta;
  }

  isChange(x) {
    return x > 1e-9 || x < -1e-9;
  }

  // Sammenligner en ændring med "ingen ændring": −1 bedre, 0 lige, 1 værre.
  sign(delta) {
    for (let l = 0; l < this.levelCount; l++) {
      const x = delta[l];
      if (this.integerLevel[l]) {
        if (x < -0.5) return -1;
        if (x > 0.5) return 1;
      } else {
        if (x < -1e-9) return -1;
        if (x > 1e-9) return 1;
      }
    }
    return 0;
  }

  // Sammenligner to ændringer: negativ, hvis a er bedst.
  compare(a, b) {
    for (let l = 0; l < this.levelCount; l++) {
      const x = a[l] - b[l];
      if (this.integerLevel[l]) {
        if (x < -0.5) return -1;
        if (x > 0.5) return 1;
      } else {
        if (x < -1e-9) return -1;
        if (x > 1e-9) return 1;
      }
    }
    return 0;
  }

  // Regner alle tal forfra (efter en opbygning eller for at fjerne små
  // regnefejl i kommatallene).
  recompute() {
    this.totals.fill(0);
    const mods = this.modules;
    for (let g = 0; g < this.G; g++) {
      for (let m = 0; m < mods.length; m++) {
        const v = mods[m].value(g);
        this.contrib[m][g] = v;
        this.totals[mods[m].level] += mods[m].weight * v;
        if (mods[m].settle) mods[m].settle(g, true, v);
      }
      this.isDirty[g] = 0;
    }
    this.dirty.length = 0;
  }

  groupsAsLists() {
    return this.members.map((list) => list.slice());
  }
}
