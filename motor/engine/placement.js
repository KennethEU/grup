// "Én elev i én gruppe" (specifikation afsnit 13).
//
// Til efternølere: hvor gør en elev mindst skade i grupper, der allerede er
// dannet, uden at andre flyttes? Selve indgangen kommer i en senere
// kontraktversion; her er kun det, regelmodulerne skal kunne: bedømme én elev
// i én bestemt gruppe ud fra de små tællere, uden at måle alt forfra.

import { buildModules } from './modules.js';
import { State } from './state.js';

// groups: de færdige grupper som lister af elevnumre (i opgavens nummerering).
// Elever, der ikke står i nogen gruppe, er dem, der skal bedømmes.
export function placementJudge(task, layout, baselines, groups) {
  const model = buildModules(task, layout, baselines);
  const state = new State(task, layout, model);
  groups.forEach((members, g) => {
    for (const s of members) state.raw(s, g);
  });
  state.recompute();
  return {
    levels: model.levels,
    // Ændringen pr. trin i rangordenen, hvis elev s kommer i gruppe g.
    levelChange(s, g) {
      return Float64Array.from(state.tryMoves([s, g]));
    },
    // Ændringen pr. regel (regelnummer → ændring i reglens eget tal; Undgå
    // hinanden og matrix-kilder har nøglen 'avoid' og 'sources').
    ruleChange(s, g) {
      const changes = new Map();
      for (const m of model.modules) {
        const before = m.value(g);
        m.add(s, g);
        state.size[g]++;
        const after = m.value(g);
        state.size[g]--;
        m.remove(s, g);
        if (m.settle) m.settle(g, false, 0);
        const key = m.rule ?? model.levels[m.level].kind;
        changes.set(key, (changes.get(key) || 0) + (after - before) * m.weight);
      }
      return changes;
    },
    // Sammenligner to ændringer efter rangordenen: negativ, hvis a er bedst.
    compare(a, b) {
      return state.compare(a, b);
    },
  };
}
