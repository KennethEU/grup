# Kenneths fund og kodegennemgangen

*3/11 2026. Tre ønsker fra Kenneths prøve på grup.dk (budget uden frø og
"Prøv at danne igen" står i `motor-konvergens.md`) og fundene fra
`kodegennemgang.md`.*

## 1. "Forsøg 13 af 20 – det bedste"

`stats` i svaret har to nye felter (spørgsmål 44):

- `winner`: det vindende forsøgs nummer blandt de færdige forsøg (1, 2, 3 …),
- `sameAsWinner`: hvor mange **andre** forsøg der endte med præcis samme
  resultat (samme optælling som "nok det bedste" i beskederne).

Med `attempts` kan appen skrive *"Forsøg 13 af 20 – det bedste. 9 andre
forsøg endte lige så godt."* Numrene er de samme på én og flere kerner
(testet), `winner` er aldrig over `attempts` (også ved Stop), og
afspilningen (også med sammenlægning ved loftet) er uændret.

## 2. Matrix med færre kilder end pladser

Kenneths eksempel (matrix, 6 grupper, 28 elever, kilderne Ukraine 12 og
Island 16) gav før to røde beskeder og en "20 par … Det kunne ikke undgås".
Nu kommer der én note, den samme i `check(input)` og efter kørslen:

> Højst én fra hver kilde kan ikke lade sig gøre med 6 matrixgrupper. Hver
> gruppe får 2 fra "Ukraine" og 2–3 fra "Island", så jævnt som det kan blive.

- Ny kode `matrix-sources-spread`, `type: "note"` (ikke rød).
- Efter kørslen kommer der kun en besked mere, hvis kilderne **ikke** er spredt
  så jævnt, som det kan lade sig gøre.
- Nøglen til "samme besked" i check og svar: `code` + `rule` + `pool` +
  `values`. Hvordan farven (`type`) bestemmes, står i spørgsmål 45.

## 3. Kodegennemgangen

| Fund | Rettet sådan |
|---|---|
| 1 (middel): Fordel siger "kunne ikke undgås", selvom en anden deling er opfyldt | Antallet af grupper, der ikke består dagens test, er et ekstra **sidste** trin i rangordenen. "Kunne ikke undgås" kommer kun, når det retfærdige antal er nået, og dagens test beviseligt ikke kan bestås (`bounds.js`). Gennemgangens eksempel: opfyldt i 40 af 40 frø (før 31). |
| 3: "umulig" uden besked ved ugyldigt input | `status: "unsupported"`, `reason.code: "invalid-input"` (også i `check`) |
| 4: `rulesMet` tæller "ikke målt" som opfyldt | `rulesTotal` tæller kun målte regler, `rulesMet` kun `met: true` |
| 5: `tests/bounds.test.mjs` fejlede | Testen bruger nu også den nuværende motors svar (med rigtige størrelser); alle 30 tests er grønne |

Tællerne giver stadig præcis det samme som en måling forfra
(`gennemgang/taellere.mjs`: 520 input, 0 problemer), og
`gennemgang/doem.mjs` finder 0 uenigheder med dommeren og 0 manglende eller
overflødige beskeder i de 3000 nye svar.

**Først prøvet og forkastet:** gennemgangens forslag, et tillæg på 0,001 pr.
gruppe *blandt målene*. Det gav færre grupper uden om dagens test, men byttede
med Balancér og Saml: målene blev dårligere frø for frø i 52 (sæt 1) og 34
(sæt 2) af 1500 svar, og mod den nuværende motor kom 131, 197 og 266 til
som "dårligere". Som sidste trin afgør dagens test kun mellem delinger, der
er lige gode på alt andet.

## Målt på sæt 1 og 2

Fem frø pr. input, 10 s budget. "Mod den nuværende" er den nye motors
dårligste frø mod den nuværende motors svar.

| | Tunge regler | Mål og Saml | Faste krav | Stop |
|---|---|---|---|---|
| Sæt 1, med frø | 8 / 287 / **0** | 74 / 220 / 1 | 0 fejl | 160, samme grund |
| Sæt 1, uden frø | 8 / 287 / **0** | 73 / 221 / 1 | 0 fejl | 160, samme grund |
| Sæt 2, med frø | 12 / 287 / 1 (107) | 84 / 210 / 6 | 0 fejl | 240, samme grund |
| Sæt 2, uden frø | 12 / 287 / 1 (107) | 84 / 210 / 6 | 0 fejl | 240, samme grund |

(bedre / lige / dårligere.) Det er de samme tal som før runden. 107 er den
nuværende motors fejl; de 6 i sæt 2 er forklaret i `saet-2-sammenligning.md`.

Frø for frø mod før runden (motorens egen måling, som dommerens):

| | Tunge regler | Mål og Saml | Grupper uden om Fordels dagens test |
|---|---|---|---|
| Sæt 1, med frø | 0 / 1340 / 0 | 10 / 1314 / 16 | færre i 123, flere i 5 |
| Sæt 2, med frø | 1 / 1259 / 0 | 12 / 1237 / 10 | færre i 109, flere i 4 |
| Sæt 1, uden frø | 1 / 1338 / 1 | 9 / 1314 / 15 | færre i 123, flere i 8 |
| Sæt 2, uden frø | 0 / 1258 / 2 | 15 / 1236 / 7 | færre i 114, flere i 2 |

De små forskelle på målene går begge veje og er af samme størrelse som
forskellen mellem to frø: det nye sidste trin ændrer, hvilke bytninger
søgningen tager. De tunge "dårligere" uden frø er 295 og 172, store eller
tidsbundne hold (172 kørt alene: frø 4 dårligere, frø 5 bedre end før).

**Tid.** Med frø: sæt 1 i snit 0,88 → 1,09 s, sæt 2 1,54 → 1,91 s. To grunde:
en Fordel, der ikke består dagens test, er ikke længere "ved det bedst
mulige", så motoren stopper ikke før tid; og hold med flere Fordel-regler
bruger ca. 20–25 % mere tid pr. forsøg (225: 6,8 → 8,4 s for 20 forsøg, kørt
alene). Uden frø stopper motoren efter tiden som før (sæt 1 i snit 0,90 s,
sæt 2 1,16 s).

**Store hold med appens budget (30 s, over 100 elever)**, talt som i
`motor-konvergens.md` med den endelige motor (op til 60 forsøg pr. hold, i
Node): 21 af 49 stopper i første forsøg (før runden 23, fordi en Fordel uden
bevis ikke længere stopper før tid), 6 bruger hele tiden (før 5), fordi de
bliver ved med at blive lidt bedre, og i snit 19 forsøg (før 17). "Bedre" og
"ens" til at stoppe ses på rangordenen uden Fordels sidste trin, så det trin
aldrig gør en kørsel længere. Tiderne i browseren er stadig ikke målt (det
skjulte panel bremser workerne).

**Beskederne** i de 3000 svar uden frø: "Prøv at danne igen" 162 gange (før
budget-ændringen 1315), "nok det bedste" 1252, "Det kunne ikke undgås" 2350.
Fordel: 1360 "kunne ikke undgås" (alle med bevis; før 1600 uden), 426 "nok
det bedste", 49 "Prøv igen".
