// Emnernes fordeling efter dannelsen (specifikation afsnit 14).
//
// Grupperne tages fra den største til den mindste (lige store efter
// nummer), og hver får det emne, der har færrest elever indtil nu (ved lighed
// det første på listen). Låste grupper med et gyldigt emne beholder det og
// tæller med fra starten.

// De numre, de nye grupper får: de ledige 1, 2, 3 … uden om de låstes numre.
export function newGroupNumbers(task, groupCount) {
  const taken = new Set(task.locked.map((g) => g.number).filter((n) => Number.isInteger(n)));
  const numbers = [];
  let next = 1;
  while (numbers.length < groupCount) {
    if (!taken.has(next)) numbers.push(next);
    next++;
  }
  return numbers;
}

// Den forventede fordeling. En låst gruppe beholder kun sit emne, hvis emnet
// står på klassens liste; uden emne eller med et fjernet emne får den et nyt
// som de nye grupper (svar6 36).
export function expectedTopics(task, groups) {
  const groupTopics = groups.map(() => null);
  const lockedTopics = {};
  if (task.view !== 'home' || task.topics.length === 0) return { groupTopics, lockedTopics };

  const counts = new Map(task.topics.map((t) => [t, 0]));
  const items = [];
  const numbers = newGroupNumbers(task, groups.length);
  for (const locked of task.locked) {
    const size = locked.members.length;
    if (locked.topic !== null && counts.has(locked.topic)) {
      counts.set(locked.topic, counts.get(locked.topic) + size);
    } else {
      items.push({ kind: 'locked', id: locked.id, size, number: locked.number ?? Infinity });
    }
  }
  groups.forEach((members, i) => items.push({ kind: 'new', index: i, size: members.length, number: numbers[i] }));
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
