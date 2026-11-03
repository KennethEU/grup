// Tilfældighed med frø (spec. 10.5): samme frø giver altid de samme tal.

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

// Blander en liste på stedet (Fisher–Yates) og giver den tilbage.
export function shuffleInPlace(random, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
  }
  return list;
}

// Frøet til forsøg nr. i ud fra hovedfrøet, så forsøgene bliver forskellige,
// men altid de samme for samme hovedfrø.
export function attemptSeed(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
