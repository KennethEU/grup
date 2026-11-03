// De faste kontroller (specifikation 15.1). De skal ALTID holde.
//
// Hver fejl er { check, text, students? }. En tom liste betyder, at alt er i
// orden. Fejlene står først i rangordenen, så de ikke kan overses.

import { splitEven, isBalancedAllocation } from './sizes.mjs';
import { expectedTopics } from './topics.mjs';

export const CHECK_NAMES = {
  membership: 'Hver elev præcis én gang',
  locked: 'Låste grupper urørte',
  sizes: 'Gruppestørrelser',
  split: 'Opdel (rene grupper)',
  together: 'Skal sammen-blokke hele',
  matrix: 'Matrix "Fuld": én fra hver kilde',
  topics: 'Emnefordeling',
  stop: 'Stop ved umulig Skal sammen',
};

export function fixedChecks(task, groups, answer, layout, feasibility) {
  const failures = [];
  const fail = (check, text, students) => failures.push({ check, name: CHECK_NAMES[check], text, students: students || [] });

  // 1. Hver elev i students præcis én gang; ingen andre; ingen tomme grupper.
  const seen = new Map();
  groups.forEach((members, i) => {
    if (!members.length) fail('membership', `Gruppe ${i + 1} (plads ${i}) er tom.`);
    for (const id of members) seen.set(id, (seen.get(id) || 0) + 1);
  });
  const known = new Set(task.ids);
  const missing = task.ids.filter((id) => !seen.has(id));
  const twice = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  const unknown = [...seen.keys()].filter((id) => !known.has(id) && !task.lockedIds.has(id));
  if (missing.length) fail('membership', `${missing.length} elev(er) mangler i grupperne.`, missing);
  if (twice.length) fail('membership', `${twice.length} elev(er) står i mere end én gruppe.`, twice);
  if (unknown.length) fail('membership', `${unknown.length} ukendt(e) elev(er) i grupperne.`, unknown);

  // 2. Låste grupper: deres elever må ikke stå i de nye grupper, og nye emner
  //    må kun gives til låste grupper.
  const lockedInGroups = [...seen.keys()].filter((id) => task.lockedIds.has(id));
  if (lockedInGroups.length) fail('locked', 'Elever fra låste grupper står i de nye grupper.', lockedInGroups);
  const lockedTopics = (answer && answer.lockedTopics) || {};
  const lockedIdSet = new Set(task.locked.map((g) => g.id));
  for (const id of Object.keys(lockedTopics)) {
    if (!lockedIdSet.has(id)) fail('locked', `lockedTopics nævner "${id}", som ikke er en låst gruppe.`);
  }

  // 3. Størrelser efter regnereglen (spec. afsnit 4).
  checkSizes(task, groups, layout, fail);

  // 4. Opdel: hver gruppe er ren på alle Opdel-kolonner.
  if (task.splitRules.length) {
    groups.forEach((members, i) => {
      const keys = new Set(members.map((id) => task.poolKeyOf.get(id)).filter((k) => k !== undefined));
      if (keys.size > 1) fail('split', `Gruppe på plads ${i} blander ${keys.size} Opdel-puljer.`, members);
    });
  }

  // 5. Skal sammen: blokkens frie elever står i samme gruppe.
  if (task.view === 'home') {
    const groupOf = new Map();
    groups.forEach((members, i) => members.forEach((id) => groupOf.set(id, i)));
    for (const block of task.together) {
      const free = block.filter((id) => known.has(id));
      const where = new Set(free.map((id) => groupOf.get(id)));
      if (free.length >= 2 && where.size > 1) fail('together', 'En Skal sammen-blok er delt.', free);
    }
  }

  // 6. Matrix "Fuld": mindst én fra hver kilde, jævnt pr. kilde, og
  //    størrelserne højst én fra hinanden (svar5 34).
  if (task.view === 'matrix' && task.size.mode === 'full' && task.matrix && groups.length) {
    for (const source of task.matrix.sources.values()) {
      if (!source.ids.length) continue;
      const counts = groups.map((members) => members.filter((id) => task.matrix.sourceOf.get(id) === source.key).length);
      if (Math.min(...counts) < 1) fail('matrix', `En matrixgruppe har ingen fra kilden "${source.label}".`);
      if (Math.max(...counts) - Math.min(...counts) > 1) {
        fail('matrix', `Kilden "${source.label}" er ikke spredt jævnt (${Math.min(...counts)}–${Math.max(...counts)} pr. gruppe).`);
      }
    }
    const sizes = groups.map((m) => m.length);
    if (Math.max(...sizes) - Math.min(...sizes) > 1) fail('matrix', 'Matrixgrupperne er mere end én elev forskellige i størrelse.');
  }

  // 7. Emnerne efter reglen i spec. afsnit 14.
  if (answer) checkTopics(task, groups, answer, fail);

  // 8. Burde dannelsen være stoppet? (spec. 5.1)
  if (feasibility && feasibility.reasons.length) {
    for (const reason of feasibility.reasons) {
      fail('stop', `Dannelsen skulle have stoppet: ${reason.text}`, reason.students);
    }
  }
  return failures;
}

function checkSizes(task, groups, layout, fail) {
  if (layout.wholeTask) {
    if (groups.length !== layout.total) fail('sizes', `Der er ${groups.length} grupper; reglen giver ${layout.total}.`);
    const sizes = groups.map((m) => m.length);
    if (sizes.length && Math.max(...sizes) - Math.min(...sizes) > 1) fail('sizes', 'Grupperne er mere end én elev forskellige i størrelse.');
    return;
  }
  if (groups.length !== layout.total) {
    fail('sizes', `Der er ${groups.length} nye grupper; reglen giver ${layout.total}.`);
  }
  // Pr. pulje: antal grupper og jævne størrelser.
  const byPool = new Map();
  for (const members of groups) {
    const key = members.length ? task.poolKeyOf.get(members[0]) : undefined;
    if (!byPool.has(key)) byPool.set(key, []);
    byPool.get(key).push(members.length);
  }
  const counts = layout.pools.map((pool) => (byPool.get(pool.key) || []).length);
  layout.pools.forEach((pool, i) => {
    const sizes = (byPool.get(pool.key) || []).slice().sort((a, b) => b - a);
    const label = task.pools.get(pool.key)?.name;
    const where = label ? ` inden for "${label}"` : '';
    if (!layout.flexible && sizes.length !== pool.groups) {
      fail('sizes', `${sizes.length} grupper${where}; reglen giver ${pool.groups}.`);
      return;
    }
    const expected = splitEven(pool.n, sizes.length);
    if (sizes.join(',') !== expected.join(',')) {
      fail('sizes', `Størrelserne${where} er ${sizes.join(', ')}; de skulle være ${expected.join(', ')}.`);
    }
  });
  if (layout.flexible && !isBalancedAllocation(layout.pools.map((p) => p.n), counts)) {
    fail('sizes', `Grupperne er ikke fordelt så ens som muligt mellem puljerne (${counts.join(', ')}).`);
  }
}

function checkTopics(task, groups, answer, fail) {
  const answerGroups = answer.groups || [];
  const actual = answerGroups.map((g) => (g && g.topic !== undefined ? g.topic : null));
  const actualLocked = answer.lockedTopics || {};
  if (task.view !== 'home' || task.topics.length === 0) {
    if (actual.some((t) => t !== null)) fail('topics', 'Grupperne har emner, selvom klassen ingen emner har (eller det er matrix).');
    return;
  }
  const expected = expectedTopics(task, groups);
  const sameGroups = expected.groupTopics.every((t, i) => t === actual[i]);
  const keys = new Set([...Object.keys(expected.lockedTopics), ...Object.keys(actualLocked)]);
  const sameLocked = [...keys].every((k) => expected.lockedTopics[k] === actualLocked[k]);
  if (!(sameGroups && sameLocked)) {
    const wrong = expected.groupTopics.map((t, i) => (t === actual[i] ? null : i)).filter((i) => i !== null);
    fail(
      'topics',
      wrong.length
        ? `Emnerne følger ikke reglen (grupper på plads ${wrong.join(', ')}).`
        : 'Nye emner til låste grupper følger ikke reglen.',
    );
  }
}
