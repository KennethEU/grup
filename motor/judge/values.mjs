// Værdier: hvordan en celle læses (specifikation 3.1–3.3).
//
// Alle celler kommer som tekst. Her afgøres, hvornår to tekster er "samme
// værdi", og hvornår en celle er et tal.

// Gør en tekst klar til sammenligning: mellemrum foran og bagved fjernes, og
// store/små bogstaver betyder ikke noget. Tom celle → null ("ikke udfyldt").
export function normalizeText(cell) {
  if (cell === undefined || cell === null) return null;
  const text = String(cell).normalize('NFC').trim().toLowerCase();
  return text === '' ? null : text;
}

// En celle er et tal, hvis den kun består af cifre, evt. fortegn, højst ét
// decimaltegn (komma eller punktum) og evt. mellemrum (spec. 3.2).
// "7,5" og "7.5" → 7,5. "1.000" → 1. "1.000,5" og "7 dage" er ikke tal.
const NUMBER_PATTERN = /^[+-]?\s*(\d+([.,]\d*)?|[.,]\d+)$/;

export function parseNumber(cell) {
  if (cell === undefined || cell === null) return null;
  const text = String(cell).trim();
  if (!NUMBER_PATTERN.test(text)) return null;
  const value = Number(text.replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

// Den hyppigste stavemåde af hver værdi (til beskeder og puljenavne).
// Ved lighed vinder den, der kom først.
export function mostFrequentSpellings(cells) {
  const counts = new Map(); // normaliseret → Map(stavemåde → antal)
  for (const cell of cells) {
    const key = normalizeText(cell);
    if (key === null) continue;
    const spelling = String(cell).normalize('NFC').trim();
    if (!counts.has(key)) counts.set(key, new Map());
    const inner = counts.get(key);
    inner.set(spelling, (inner.get(spelling) || 0) + 1);
  }
  const result = new Map();
  for (const [key, inner] of counts) {
    let best = null;
    let bestCount = -1;
    for (const [spelling, count] of inner) {
      if (count > bestCount) {
        best = spelling;
        bestCount = count;
      }
    }
    result.set(key, best);
  }
  return result;
}
