# Den nye motor, trin 4: emner og matrix

*3/11 2026.*

## Hvad er bygget

- **Emner** (`engine/topics.js`, spec. 14): efter dannelsen, største gruppe
  først, lige store efter nummer (de nye får de ledige numre uden om de
  låstes), emnet med færrest elever, ved lighed det første på listen. Låste
  grupper uden emne eller med et fjernet emne får et nyt i `lockedTopics`.
- **Matrix "Fuld"** (spec. 9.2): eleverne deles ud kilde for kilde, gruppe for
  gruppe rundt (i tilfældig rækkefølge pr. forsøg). Så har hver matrixgruppe
  mindst én fra hver kilde, de ekstra er spredt jævnt pr. kilde, og grupperne
  er højst én forskellige. Søgningen bytter kun, så det bliver ved med at holde:
  elever fra samme kilde frit, og elever fra to kilder kun, når begge kilder
  stadig er jævne bagefter.
- **Matrix med antal eller pr. gruppe:** "højst én fra hver kilde" er et tungt
  trin efter Undgå hinanden (spec. 7.1, trin 3).

## Målt på sæt 1 (5 frø, dårligste frø)

- 84 input med emner: **0 fejl i emnefordelingen**.
- 25 matrix-input: **0 fejl i de faste krav**. "Højst én fra hver kilde" ved
  det bedst mulige i **21** (den nuværende motor: 19). I de 4 andre er den nye
  og den nuværende lige gode.
- De to kendte matrix-forskelle er rettet: `213` (den nuværende mangler to
  kilder i en gruppe; 34 fejl) og `194` (en kilde fordelt 1, 3, 2) overholder
  nu begge kravene i alle fem frø.
