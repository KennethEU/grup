// Emnernes fordeling efter dannelsen (specifikation afsnit 14).
//
// Emner er ikke en del af søgningen. Når grupperne er dannet, tages de fra
// den største til den mindste (lige store efter nummer), og hver får det
// emne, der har færrest elever indtil nu (ved lighed det første på klassens
// liste). Låste grupper med et gyldigt emne beholder det og tæller med fra
// starten; uden emne, eller med et emne, der ikke længere er på listen, får
// de et nyt i lockedTopics (svar6 36).

// De numre, de nye grupper får: de ledige 1, 2, 3 … uden om de låstes numre.
export function newGroupNumbers(locked, groupCount) {
  const taken = new Set(locked.map((g) => g.number).filter((n) => Number.isInteger(n)));
  const numbers = [];
  let next = 1;
  while (numbers.length < groupCount) {
    if (!taken.has(next)) numbers.push(next);
    next++;
  }
  return numbers;
}

// groupSizes: antal elever i hver ny gruppe, i svarets rækkefølge.
// Giver { groupTopics: [emne eller null], lockedTopics: { id: emne } }.
export function assignTopics(task, groupSizes) {
  const groupTopics = groupSizes.map(() => null);
  const lockedTopics = {};
  if (task.view !== 'home' || task.topics.length === 0) return { groupTopics, lockedTopics };

  const counts = new Map(task.topics.map((t) => [t, 0]));
  const items = [];
  const numbers = newGroupNumbers(task.locked, groupSizes.length);
  for (const locked of task.locked) {
    const size = locked.members.length;
    if (locked.topic !== null && counts.has(locked.topic)) {
      counts.set(locked.topic, counts.get(locked.topic) + size);
    } else {
      items.push({ kind: 'locked', id: locked.id, size, number: locked.number ?? Infinity });
    }
  }
  groupSizes.forEach((size, i) => items.push({ kind: 'new', index: i, size, number: numbers[i] }));
  items.sort((a, b) => b.size - a.size || a.number - b.number);

  for (const item of items) {
    let chosen = null;
    for (const topic of task.topics) {
      if (chosen === null || counts.get(topic) < counts.get(chosen)) chosen = topic;
    }
    counts.set(chosen, counts.get(chosen) + item.size);
    if (item.kind === 'new') groupTopics[item.index] = chosen;
    else lockedTopics[item.id] = chosen;
  }
  return { groupTopics, lockedTopics };
}
