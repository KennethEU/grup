// Tilfældighed med frø: samme frø giver altid de samme tal.
// (Bruges til "hvor skæv er en tilfældig gruppedeling", spec. 7.3, og af
// testgeneratoren.)

// mulberry32: en lille, kendt generator af tilfældige tal mellem 0 og 1.
export function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Et helt tal fra 0 til (max − 1).
export function randomInt(random, max) {
  return Math.floor(random() * max);
}

// Blander en liste (Fisher–Yates) og giver en ny liste tilbage.
export function shuffled(random, list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Vælger ét element.
export function pick(random, list) {
  return list[randomInt(random, list.length)];
}

// Laver et frø ud fra en tekst (fx et filnavn), så hver testklasse får sit eget.
export function seedFromText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
