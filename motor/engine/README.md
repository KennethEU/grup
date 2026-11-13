# grup-motor: den nye gruppemotor

Ren JavaScript (ES-moduler), ingen afhængigheder, intet byggetrin. Kører
uændret i en Web Worker i browseren og i Node 22. Skrevet fra bunden ud fra
`spec/specifikation.md` og `spec/kontrakt.md` (version 2).

## Indgangen (`engine.js`)

```js
import { ENGINE_INFO, run, check } from './engine.js';

const answer = await run(input, {
  onProgress: (p) => { /* { contractVersion, progress } */ },
  isCancelled: () => stopTrykket,
});
const before = check(input); // beskederne før kørslen, uden grupper
```

- `run` svarer som i kontraktens afsnit 3 (`ok`, `impossible`, `stopped`,
  `error`). Den kaster aldrig; en fejl inde i motoren bliver `status: "error"`.
- Med `seed` som heltal giver samme input altid samme svar (også på flere
  kerner), og motoren kører højst `maxAttempts` forsøg.
- Med `seed: null` (som appen) vælger motoren selv, og `maxAttempts` er kun et
  **mindste** antal forsøg. Bagefter fortsætter motoren, til det bedste er
  holdt op med at blive bedre (de seneste `maxAttempts` forsøg fandt intet
  bedre, og mindst 5 forsøg endte hver for sig med samme resultat; eller intet
  blev bedre i dobbelt så mange forsøg, som det tog at finde det), til alle
  regler er ved det bedst mulige, eller til `maxSeconds` er gået. Se
  `resultater/motor-konvergens.md`.
- Beskeden `rule-not-met` har ud over `unavoidable` feltet `likelyBest`:
  `true`, når mange forsøg endte samme sted, så en ny dannelse næppe hjælper.
  Teksten siger så "det er nok det bedste, denne klasse tillader" i stedet for
  "Prøv at danne igen" (spørgsmål 43 i `spec/spoergsmaal.md`).
- `stats` har også `winner` (det vindende forsøgs nummer blandt de færdige)
  og `sameAsWinner` (hvor mange andre forsøg der endte lige så godt), så
  appen kan skrive "Forsøg 13 af 20 – det bedste. 9 andre endte lige så
  godt." (spørgsmål 44).
- Matrix med flere fra en kilde end matrixgrupper giver noten
  `matrix-sources-spread` ("Hver gruppe får 2 fra … og 2–3 fra …"), den samme
  i `check` og efter kørslen (spørgsmål 45).
- Ugyldigt input (ingen elever, 0 grupper, eller en størrelse, der ikke er et
  helt tal fra 1 til 999, fx `target: -2` eller `count: 0`) giver `status:
  "unsupported"` med `reason.code: "invalid-input"` i både `run` og `check`
  (spørgsmål 46 og 47). `check` hænger aldrig: `tools/fuzz-sizes.mjs` prøver
  13 000 størrelser.
- Svar og fremgang har `contractVersion: 3`.
- "Samme besked" i `check` og svaret har nøglen `code` + `rule` + `pool` +
  `values` + `students` (sorteret). Adskil, Adskil altid, Klyng og Fordel
  giver efter kørslen én `rule-not-met` pr. pulje (med Opdel), og Undgå
  hinanden én pr. aftale og pulje med aftalens elever. Har en regel et
  resultat, sendes advarslen fra før kørslen ikke også i svaret (spørgsmål
  47; `tools/check-keys.mjs` tjekker det).
- Skal sammen og almindelig Adskil stopper kun, når blokken beviseligt koster
  et ekstra par (`separateBlocksHurt` i `feasibility.js`). Ellers kommer en
  blå `together-separate-pair` i `check`, og Adskils resultat nævner parret
  (spørgsmål 51).
- Flere kerner: i browseren starter motoren selv workers fra `worker.js` i
  denne mappe (`new Worker(new URL('./worker.js', import.meta.url), { type:
  'module' })`). `worker.js` skal derfor med i Grupper's byg. Kan workers ikke
  startes, kører motoren på én kerne.

## Filerne

| Fil | Hvad den gør |
|---|---|
| `engine.js` | `ENGINE_INFO`, `run`, `check` |
| `values.js` | Tekst gøres ens, tal læses (spec. 3.1–3.2) |
| `task.js` | Klassen bliver til en opgave: numre, regler, puljer, matrix-kilder (spec. 3) |
| `sizes.js` | Antal grupper og størrelser (spec. 4). `planGroupCounts` er ren (kun tal ind) og bruges også af appen til skønnet i opskriften, så app og motor ikke kan sige hvert sit antal |
| `feasibility.js` | Skal sammen-tjekket og tom matrix-kilde (spec. 5.1) |
| `rules.js` | Regelmodulerne: mål, bedst mulige, opfyldt, rangordenen (spec. 6, 7, 16) |
| `bounds.js` | Hvor godt Balancér overhovedet kan blive, og hvor mange grupper der mindst må falde uden om Fordels dagens test |
| `modules.js` | De samme regler som små tællere pr. gruppe (spec. 10.2) |
| `state.js` | Hvem er hvor, og hvad det koster ("prøv" og "gør"). Et bytte af to elever prøves uden at flytte dem (`trySwap`, modulernes `after`) |
| `search.js` | Ét forsøg: byg grådigt, forbedr, ryst (spec. 10) |
| `solve.js` | Mange forsøg, budget, fremgang, Stop, flere kerner (spec. 11) |
| `worker.js` | Én ekstra kerne |
| `topics.js` | Emnerne til grupperne bagefter (spec. 14) |
| `messages.js` | Alle beskeder fra ét sted (spec. 8) |
| `playback.js` | Afspilningen (spec. 12) |
| `placement.js` | "Én elev i én gruppe" til efternølere (spec. 13; ingen indgang endnu) |
| `random.js` | Tilfældighed med frø |

Testene ligger uden for mappen (`tests/`, kør `node --test 'tests/*.test.mjs'`
fra projektets rod), fordi de bruger dommeren.
